import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import TrustedDevice from "../models/TrustedDevice.js";
import PlatformSettings from "../models/PlatformSettings.js";
import SuperAdminRequest from "../models/SuperAdminRequest.js";
import DeviceApprovalRequest from "../models/DeviceApprovalRequest.js";
import { generateToken } from "../utils/generateToken.js";
import {
  sendDeviceEnrollmentOtpEmail,
  sendPasswordResetOtpEmail,
} from "../utils/smtpEmailService.js";
import { generateSecureOtp, hashOtp, validateOtpSecretConfig } from "../utils/otpSecurity.js";
import {
  generateDeviceSecret,
  hashDeviceSecret,
  verifyDeviceSecret,
  setDeviceCookie,
  clearDeviceCookie,
} from "../utils/deviceSecurity.js";

const JWT_SECRET = process.env.JWT_SECRET || "dreamcity_super_secret_jwt_key_2026_dev";

const googleClient = new OAuth2Client();


/**
 * @desc    Register a new customer account
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res, next) => {
  try {
    const settings = await PlatformSettings.findOne({});
    if (settings && settings.allowSelfRegistration === false) {
      return res.status(403).json({
        success: false,
        message: "Public self-registration is currently disabled by platform administration.",
      });
    }

    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    const emailNormalized = email.trim().toLowerCase();
    const userExists = await User.findOne({ email: emailNormalized });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // Reserve customer emails against pending retailer account requests,
    // so Supreme Admin approval never collides with a fresh customer signup.
    const pendingRetailerRequest = await SuperAdminRequest.findOne({
      email: emailNormalized,
      status: "PENDING",
    });
    if (pendingRetailerRequest) {
      return res.status(409).json({
        success: false,
        message:
          "This email is reserved for a retailer account request that is awaiting Supreme Admin approval.",
      });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: name.trim(),
      email: emailNormalized,
      passwordHash,
      phone: phone ? phone.trim() : "",
      role: "USER",
      status: "ACTIVE",
    });

    const token = generateToken(user._id, user.role);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        phone: user.phone,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Shared trusted-device enforcement handler for administrative logins (Password & Google OAuth).
 * Strictly enforces:
 * 1. Zero historical devices -> First-Device Bootstrap OTP
 * 2. Historical devices exist, none approved (revoked/replaced) -> Supreme Admin Recovery Request Required
 * 3. Approved device exists & presentation of matching HttpOnly cookie -> Same-Device Login (Active Session + Production JWT)
 * 4. Approved device exists & cookie missing/mismatched -> Stage Transfer Request (PENDING_APPROVAL, Candidate Cookie & Polling Token)
 */
export const handleAdministrativeDeviceLogin = async (req, res, user) => {
  const approvedDevice = await TrustedDevice.findOne({
    userId: user._id,
    status: "APPROVED",
  });

  const historicalCount = await TrustedDevice.countDocuments({
    userId: user._id,
  });

  // ─── CHECK 1: Existing APPROVED_PENDING_CLAIM request matching this browser ───
  // If Supreme Admin already clicked 'Approve' and this browser presents the matching candidate cookie,
  // immediately complete the cutover right now upon login after thoroughly checking expiry, status, and candidate cookie!
  const incomingDeviceCred = req.cookies?.plotpro_device_cred;

  if (incomingDeviceCred) {
    const approvedPendingClaim = await DeviceApprovalRequest.findOne({
      userId: user._id,
      status: "APPROVED_PENDING_CLAIM",
      expiresAt: { $gt: new Date() },
    });

    if (
      approvedPendingClaim &&
      verifyDeviceSecret(incomingDeviceCred, approvedPendingClaim.candidateTokenHash)
    ) {
      let session = null;
      const useTx = supportsTransactions();
      if (useTx) {
        session = await mongoose.startSession();
        session.startTransaction();
      }

      try {
        // Atomic status transition from APPROVED_PENDING_CLAIM to CLAIMED
        const query = DeviceApprovalRequest.findOneAndUpdate(
          {
            _id: approvedPendingClaim._id,
            status: "APPROVED_PENDING_CLAIM",
            expiresAt: { $gt: new Date() },
          },
          {
            $set: {
              status: "CLAIMED",
              claimedAt: new Date(),
            },
          },
          { new: true, session: session || undefined }
        );
        const claimedDoc = await query;

        if (!claimedDoc) {
          if (session) await session.abortTransaction();
          return res.status(409).json({
            success: false,
            message: "Transfer claim was already consumed or expired. Please restart login.",
          });
        }

        // Revoke the existing approved device if one exists
        if (approvedDevice) {
          approvedDevice.status = "REPLACED";
          approvedDevice.isCurrentSession = false;
          approvedDevice.revokedAt = new Date();
          approvedDevice.revocationReason = `Replaced by workstation '${claimedDoc.deviceLabel}' via approved transfer cutover.`;
          await approvedDevice.save(session ? { session } : undefined);
        }

        // Create the newly approved device
        const newDevice = new TrustedDevice({
          userId: claimedDoc.userId,
          tenantId: claimedDoc.tenantId,
          role: claimedDoc.role,
          deviceId: crypto.randomUUID(),
          deviceTokenHash: claimedDoc.candidateTokenHash,
          isCurrentSession: true,
          deviceLabel: claimedDoc.deviceLabel,
          browser: claimedDoc.browser,
          os: claimedDoc.os,
          ipAddress: claimedDoc.ipAddress,
          userAgent: claimedDoc.userAgent,
          status: "APPROVED",
          approvalType: "SUPREME_ADMIN_APPROVAL",
          approvedAt: new Date(),
          lastUsedAt: new Date(),
        });
        await newDevice.save(session ? { session } : undefined);

        if (session) {
          await session.commitTransaction();
        }

        const token = generateToken(user._id, user.role, newDevice._id);
        return res.status(200).json({
          success: true,
          message: "Workstation transfer approved and activated. Session established.",
          token,
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            phone: user.phone,
            avatar: user.avatar,
          },
          device: {
            _id: newDevice._id,
            deviceLabel: newDevice.deviceLabel,
          },
        });
      } catch (claimErr) {
        if (session) {
          try {
            await session.abortTransaction();
          } catch {
            // ignore
          }
        }
        throw claimErr;
      } finally {
        if (session) {
          session.endSession();
        }
      }
    }

    // ─── CHECK 2: Existing PENDING_APPROVAL request matching this browser ───
    // If this browser already has a candidate cookie matching an active pending request,
    // do NOT regenerate the secret or cancel the request. Return the existing request!
    const existingPending = await DeviceApprovalRequest.findOne({
      userId: user._id,
      status: "PENDING_APPROVAL",
      expiresAt: { $gt: new Date() },
    });

    if (
      existingPending &&
      verifyDeviceSecret(incomingDeviceCred, existingPending.candidateTokenHash)
    ) {
      const statusPollingToken = jwt.sign(
        {
          requestId: String(existingPending._id),
          userId: String(user._id),
          purpose: "DEVICE_TRANSFER_POLL",
        },
        JWT_SECRET,
        { expiresIn: "30m" }
      );

      return res.status(200).json({
        success: true,
        requiresTransferApproval: true,
        statusPollingToken,
        requestId: existingPending._id,
        deviceLabel: existingPending.deviceLabel,
        currentDeviceLabel: approvedDevice?.deviceLabel || "Previous Workstation",
        message:
          "This workstation transfer request is awaiting Supreme Admin approval.",
      });
    }
  }

  // Approved Device Exists: Check possession of HttpOnly device credential cookie
  const isRecognizedDevice =
    approvedDevice &&
    incomingDeviceCred &&
    verifyDeviceSecret(incomingDeviceCred, approvedDevice.deviceTokenHash);

  if (isRecognizedDevice) {
    // SAME-DEVICE RE-LOGIN: Valid credential matches approved workstation
    approvedDevice.isCurrentSession = true;
    approvedDevice.lastUsedAt = new Date();
    await approvedDevice.save();

    const token = generateToken(user._id, user.role, approvedDevice._id);
    return res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        phone: user.phone,
        avatar: user.avatar,
      },
      device: {
        _id: approvedDevice._id,
        deviceLabel: approvedDevice.deviceLabel,
      },
    });
  }

  // ─── UNRECOGNIZED / NEW DEVICE (Both First Device & Device Transfer) ───
  // A new/unrecognized device must ALWAYS complete Email OTP verification before:
  // - Enrolling as first device (if historicalCount === 0), OR
  // - Staging a PENDING_APPROVAL transfer request for Supreme Admin (if historicalCount > 0)
  const freshUser = await User.findById(user._id).select(
    "+deviceEnrollmentCooldownUntil"
  );
  if (
    freshUser?.deviceEnrollmentCooldownUntil &&
    new Date() < new Date(freshUser.deviceEnrollmentCooldownUntil)
  ) {
    const waitSeconds = Math.ceil(
      (new Date(freshUser.deviceEnrollmentCooldownUntil) - new Date()) / 1000
    );
    return res.status(429).json({
      success: false,
      message: `Please wait ${waitSeconds}s before requesting another verification code.`,
    });
  }

  const challengeId = crypto.randomUUID();
  const otp = generateSecureOtp();
  const otpHash = hashOtp(otp, challengeId);

  await User.findByIdAndUpdate(user._id, {
    $set: {
      deviceEnrollmentChallengeId: challengeId,
      deviceEnrollmentOtpHash: otpHash,
      deviceEnrollmentOtpExpiry: new Date(Date.now() + 10 * 60 * 1000),
      deviceEnrollmentAttempts: 0,
      deviceEnrollmentCooldownUntil: new Date(Date.now() + 60 * 1000),
    },
  });

  const emailResult = await sendDeviceEnrollmentOtpEmail({
    to: user.email,
    otp,
    expiryMinutes: 10,
  });
  if (!emailResult.success) {
    console.error("[Login] Enrollment email dispatch failed:", emailResult.error);
    // Roll back cooldown so user is not penalized with 429 when server email delivery fails
    await User.findByIdAndUpdate(user._id, {
      $set: { deviceEnrollmentCooldownUntil: null },
    });
    return res.status(502).json({
      success: false,
      message:
        "Unable to dispatch workstation verification email. Please check server email configuration or try again.",
    });
  }

  const [userPart, domainPart] = user.email.split("@");
  const maskedEmail = `${userPart.substring(0, 3)}***@${domainPart}`;

  return res.status(200).json({
    success: true,
    requiresDeviceOtp: true,
    requiresFirstDeviceEnrollmentOtp: historicalCount === 0,
    isTransfer: historicalCount > 0,
    email: user.email,
    maskedEmail,
    challengeId,
    message: historicalCount === 0
      ? "First-time workstation enrollment required. A security verification code has been dispatched to your email address."
      : "Unrecognized workstation detected. A security verification code has been dispatched to your email address to initiate device transfer.",
  });
};

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide both email and password.",
      });
    }

    const emailNormalized = email.trim().toLowerCase();

    // Find user and explicitly select passwordHash
    const user = await User.findOne({ email: emailNormalized }).select("+passwordHash");

    if (!user) {
      // Friendly feedback for pending / rejected retailer signup requests
      const retailerRequest = await SuperAdminRequest.findOne({ email: emailNormalized })
        .select("status reviewNote")
        .sort({ createdAt: -1 });

      if (retailerRequest) {
        if (retailerRequest.status === "PENDING") {
          return res.status(403).json({
            success: false,
            pendingApproval: true,
            message:
              "Your Super Admin (Retailer) account request is pending approval by the Supreme Administrator. You will be able to log in once it is approved.",
          });
        }
        if (retailerRequest.status === "REJECTED") {
          return res.status(403).json({
            success: false,
            requestRejected: true,
            message: `Your retailer account request was rejected.${
              retailerRequest.reviewNote ? ` Reason: ${retailerRequest.reviewNote}` : ""
            }`,
          });
        }
      }

      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (user.status === "INACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact Super Administrator.",
      });
    }

    // ─── Trusted Device Enforcement for Administrative Roles ───────────────────
    // Applies strictly to SUPER_ADMIN and ADMIN. USER and SUPREME_ADMIN proceed directly.
    if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
      return await handleAdministrativeDeviceLogin(req, res, user);
    }

    // Standard public USER and SUPREME_ADMIN issue production tokens directly
    const token = generateToken(user._id, user.role);

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        phone: user.phone,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current logged in user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
};

/**
 * @desc    Logout user and invalidate active device session
 * @route   POST /api/auth/logout
 * @access  Private (protect middleware)
 */
export const logoutUser = async (req, res, next) => {
  try {
    if (req.trustedDevice) {
      req.trustedDevice.isCurrentSession = false;
      req.trustedDevice.lastUsedAt = new Date();
      await req.trustedDevice.save();
    }

    res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Request OTP for password reset (step 1)
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+resetOtp +resetOtpExpiry");
    if (!user) {
      // Don't reveal whether email exists — return generic success
      return res.status(200).json({
        success: true,
        message: "If this email is registered, you will receive a reset code shortly.",
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.resetOtp = otp;
    user.resetOtpExpiry = expiry;
    await user.save();

    // Send password reset email via PlotPro Gmail SMTP service
    const emailResult = await sendPasswordResetOtpEmail({
      to: user.email,
      otp,
      expiryMinutes: 10,
    });

    if (!emailResult.success) {
      console.error("[SMTP] Failed to send password reset email:", emailResult.error);
      return res.status(500).json({ success: false, message: "Failed to send reset code. Please try again." });
    }

    res.status(200).json({
      success: true,
      message: "Password reset OTP sent to your email address.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify OTP (step 2)
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required." });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+resetOtp +resetOtpExpiry");
    if (!user || !user.resetOtp) {
      return res.status(400).json({ success: false, message: "OTP expired or not requested. Please try again." });
    }

    if (new Date() > user.resetOtpExpiry) {
      user.resetOtp = null;
      user.resetOtpExpiry = null;
      await user.save();
      return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }

    if (user.resetOtp !== otp.trim()) {
      return res.status(400).json({ success: false, message: "Incorrect OTP. Please check and try again." });
    }

    // OTP valid — issue a short-lived reset token (reuse resetOtp field as verification flag)
    // We mark the OTP as "verified" by prepending "VERIFIED:" so reset-password endpoint can trust it
    user.resetOtp = `VERIFIED:${otp}`;
    user.resetOtpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min to complete reset
    await user.save();

    res.status(200).json({
      success: true,
      message: "OTP verified successfully. You may now set a new password.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password after OTP verified (step 3)
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, OTP, and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+resetOtp +resetOtpExpiry +passwordHash");
    if (!user || !user.resetOtp) {
      return res.status(400).json({ success: false, message: "Session expired. Please start the reset process again." });
    }

    if (new Date() > user.resetOtpExpiry) {
      user.resetOtp = null;
      user.resetOtpExpiry = null;
      await user.save();
      return res.status(400).json({ success: false, message: "Session expired. Please start the reset process again." });
    }

    // Must have been verified
    if (!user.resetOtp.startsWith("VERIFIED:")) {
      return res.status(400).json({ success: false, message: "OTP not verified. Please verify your OTP first." });
    }

    const storedOtp = user.resetOtp.replace("VERIFIED:", "");
    if (storedOtp !== otp.trim()) {
      return res.status(400).json({ success: false, message: "Invalid session. Please restart the process." });
    }

    // Hash and save new password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successful. You can now log in with your new password.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate or register user via Google OAuth (ID token)
 * @route   POST /api/auth/google
 * @access  Public
 */
export const googleAuth = async (req, res, next) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Google ID credential is required.",
      });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error("[GoogleAuth] GOOGLE_CLIENT_ID is not configured in backend environment.");
      return res.status(500).json({
        success: false,
        message: "Google authentication is not properly configured on the server.",
      });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired Google authentication credential.",
      });
    }

    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({
        success: false,
        message: "Google token payload is missing required identity claims.",
      });
    }

    // Verify token issuer
    const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
    if (!validIssuers.includes(payload.iss)) {
      return res.status(401).json({
        success: false,
        message: "Google token issuer is invalid.",
      });
    }

    // Ensure email is verified by Google
    if (!payload.email_verified) {
      return res.status(401).json({
        success: false,
        message: "Google email is not verified.",
      });
    }

    const googleId = String(payload.sub);
    const emailNormalized = String(payload.email).trim().toLowerCase();
    const name = (payload.name && payload.name.trim()) || emailNormalized.split("@")[0];
    const avatar = payload.picture || "";

    // 1. Check if user already exists with this googleId
    let user = await User.findOne({ googleId });

    if (user) {
      // Existing Google-linked user
      if (user.status === "INACTIVE") {
        return res.status(403).json({
          success: false,
          message: "Your account has been deactivated. Please contact platform administration.",
        });
      }

      // Synchronize avatar if Google provides a valid picture and it differs
      let updated = false;
      if (avatar && user.avatar !== avatar) {
        user.avatar = avatar;
        updated = true;
      }
      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
        updated = true;
      }
      if (updated) {
        await user.save();
      }

      if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
        return await handleAdministrativeDeviceLogin(req, res, user);
      }

      const token = generateToken(user._id, user.role);
      return res.status(200).json({
        success: true,
        message: "Login successful with Google",
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          phone: user.phone,
          avatar: user.avatar,
        },
      });
    }

    // 2. Not found by googleId: Check if an account already exists with the same email
    const existingEmailUser = await User.findOne({ email: emailNormalized });

    if (existingEmailUser) {
      if (existingEmailUser.status === "INACTIVE") {
        return res.status(403).json({
          success: false,
          message: "Your account has been deactivated. Please contact platform administration.",
        });
      }

      // Link the verified Google account safely without altering passwordHash or role
      existingEmailUser.googleId = googleId;
      existingEmailUser.isEmailVerified = true;
      if (avatar && existingEmailUser.avatar !== avatar) {
        existingEmailUser.avatar = avatar;
      }
      await existingEmailUser.save();

      // Administrative roles must complete trusted-device verification!
      if (existingEmailUser.role === "SUPER_ADMIN" || existingEmailUser.role === "ADMIN") {
        return await handleAdministrativeDeviceLogin(req, res, existingEmailUser);
      }

      // For standard public USER role, link the verified Google account safely without altering passwordHash or role
      existingEmailUser.googleId = googleId;
      existingEmailUser.isEmailVerified = true;
      if (avatar && existingEmailUser.avatar !== avatar) {
        existingEmailUser.avatar = avatar;
      }
      await existingEmailUser.save();

      const token = generateToken(existingEmailUser._id, existingEmailUser.role);
      return res.status(200).json({
        success: true,
        message: "Google account successfully linked",
        token,
        user: {
          _id: existingEmailUser._id,
          name: existingEmailUser.name,
          email: existingEmailUser.email,
          role: existingEmailUser.role,
          status: existingEmailUser.status,
          phone: existingEmailUser.phone,
          avatar: existingEmailUser.avatar,
        },
      });
    }

    // 3. New User Registration via Google OAuth
    const settings = await PlatformSettings.findOne({});
    if (settings && settings.allowSelfRegistration === false) {
      return res.status(403).json({
        success: false,
        message: "Public self-registration is currently disabled by platform administration.",
      });
    }

    // Create new customer account: strictly USER role, no tenant escalation
    try {
      user = await User.create({
        name,
        email: emailNormalized,
        googleId,
        authProvider: "google",
        isEmailVerified: true,
        role: "USER",
        status: "ACTIVE",
        avatar,
      });
    } catch (createErr) {
      // Handle potential race condition / duplicate key gracefully
      if (createErr.code === 11000) {
        user = await User.findOne({ $or: [{ googleId }, { email: emailNormalized }] });
        if (!user) {
          throw createErr;
        }
      } else {
        throw createErr;
      }
    }

    const token = generateToken(user._id, user.role);
    return res.status(201).json({
      success: true,
      message: "Registration successful with Google",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        phone: user.phone,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    next(error);
  }
};
