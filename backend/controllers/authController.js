import mongoose from "mongoose";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import TrustedDevice from "../models/TrustedDevice.js";
import SuperAdminRequest from "../models/SuperAdminRequest.js";
import DeviceApprovalRequest from "../models/DeviceApprovalRequest.js";
import { supportsTransactions } from "../config/db.js";
import { generateToken } from "../utils/generateToken.js";
import {
  sendDeviceEnrollmentOtpEmail,
  sendPasswordResetOtpEmail,
} from "../utils/smtpEmailService.js";
import { generateSecureOtp, hashOtp, verifyOtpHash, validateOtpSecretConfig } from "../utils/otpSecurity.js";
import {
  generateDeviceSecret,
  hashDeviceSecret,
  verifyDeviceSecret,
  setDeviceCookie,
  clearDeviceCookie,
} from "../utils/deviceSecurity.js";
import { claimGuestDataForUser } from "../utils/guestDataService.js";
import { getJwtSecret } from "../config/jwtConfig.js";

// ─── Password Reset Challenge Constants ──────────────────────────────────────
const RESET_OTP_TTL_MS = 10 * 60 * 1000;       // OTP valid for 10 minutes
const RESET_VERIFIED_WINDOW_MS = 15 * 60 * 1000; // 15 min to complete reset after verification
const RESET_COOLDOWN_MS = 60 * 1000;           // 60s cooldown between reset-code requests
const RESET_MAX_ATTEMPTS = 5;                  // Max failed verifications per challenge

// ─── Password-Reset Email Dispatcher (Production Default + Test-Only Seam) ───
// Defaults to the real SMTP/Resend dispatcher. The override below is rejected
// unless NODE_ENV is exactly "test", so it can never become a production bypass.
let resetEmailDispatcher = sendPasswordResetOtpEmail;

/**
 * TEST-ONLY: override the password-reset email dispatcher (e.g. with a mock).
 * Hard-fails outside a "test" NODE_ENV so production code paths can never be
 * redirected to a fake dispatcher at runtime.
 */
export const setResetEmailDispatcherForTest = (dispatcher) => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "[SECURITY] Reset email dispatcher override is only permitted when NODE_ENV=test."
    );
  }
  if (typeof dispatcher !== "function") {
    throw new Error("Reset email dispatcher must be a function.");
  }
  resetEmailDispatcher = dispatcher;
};

const googleClient = new OAuth2Client();

/**
 * Checks whether the local development bypass for device OTP is strictly permitted.
 * Safe default: strictly returns false unless explicitly opted in within a verified local development environment.
 */
export const isPermittedLocalDeviceOtpBypass = () => {
  // 1. Explicit opt-in required
  if (process.env.DEV_LOCAL_BYPASS_DEVICE_OTP !== "true") return false;

  // 2. Strict refusal on production / staging
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging") return false;

  // 3. Strict refusal on any cloud deployment platforms
  const isCloudDeployment = Boolean(
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RENDER_SERVICE_ID ||
    process.env.VERCEL ||
    process.env.HEROKU_APP_ID
  );
  if (isCloudDeployment) return false;

  // 4. Must be explicitly development
  return process.env.NODE_ENV === "development";
};

/**
 * Centralized, consistent authorization response builder across password and Google OAuth logins.
 */
export const issueProductionAuthResponse = (res, user, message = "Login successful") => {
  const token = generateToken(user._id, user.role);
  return res.status(200).json({
    success: true,
    message,
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
};


/**
 * @desc    Register a new customer account
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res, next) => {
  try {
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
      status: { $in: ["PENDING", "PENDING_REVIEW", "INFO_REQUESTED"] },
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
      authProvider: "local",
      authProviders: ["local"],
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
        getJwtSecret(),
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

// ─── Login Account Lockout (Fix 2) ───────────────────────────────────────────
// MAX consecutive failed password attempts before a temporary lock engages.
// There are NO permanent lockouts — every lock auto-expires.
const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

// Byte-identical generic failure body for EVERY login failure path (unknown
// email, wrong password, locked account) — prevents account enumeration via
// induced lockouts.
const GENERIC_LOGIN_401 = {
  success: false,
  message: "Invalid email or password.",
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

    // Find user and explicitly select passwordHash + lockout fields
    const user = await User.findOne({ email: emailNormalized }).select(
      "+passwordHash +loginFailedAttempts +loginLockedUntil"
    );

    if (!user) {
      // Friendly feedback for pending / rejected retailer signup requests
      const retailerRequest = await SuperAdminRequest.findOne({ email: emailNormalized })
        .select("status reviewNote")
        .sort({ createdAt: -1 });

      if (retailerRequest) {
        if (retailerRequest.status === "PENDING" || retailerRequest.status === "PENDING_REVIEW") {
          return res.status(403).json({
            success: false,
            pendingApproval: true,
            message:
              "Your Super Admin (Retailer) account request is pending approval by the Supreme Administrator. You will be able to log in once it is approved.",
          });
        }
        if (retailerRequest.status === "INFO_REQUESTED") {
          return res.status(403).json({
            success: false,
            infoRequested: true,
            message: `Additional information is required for your retailer account request.${
              retailerRequest.reviewNote ? ` Note: ${retailerRequest.reviewNote}` : ""
            }. Please check your email or contact support.`,
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

      return res.status(401).json(GENERIC_LOGIN_401);
    }

    // ─── Account Lockout (Fix 2) — all state transitions are atomic DB updates ─
    const now = new Date();

    // (a) Hard lock active → skip bcrypt entirely. The response body is
    // byte-identical to a wrong-password failure, so an attacker cannot use
    // induced lockouts to enumerate registered emails.
    if (user.loginLockedUntil && new Date(user.loginLockedUntil) > now) {
      return res.status(401).json(GENERIC_LOGIN_401);
    }

    // (b) Expired lock → atomically clear it. Conditional on the exact expired
    // timestamp so a concurrent reset cannot be double-applied.
    if (user.loginLockedUntil) {
      await User.updateOne(
        { _id: user._id, loginLockedUntil: user.loginLockedUntil },
        { $set: { loginFailedAttempts: 0, loginLockedUntil: null } }
      );
      user.loginFailedAttempts = 0;
      user.loginLockedUntil = null;
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      // (c) Failure: ONE atomic update both increments the attempt counter and
      // engages the lock the instant the threshold is crossed. The filter
      // refuses the update if another request has already locked the account,
      // so a stale read can never bypass the lock. Pipeline stages run
      // sequentially — stage 2 sees the counter value set by stage 1.
      const lockUntil = new Date(now.getTime() + LOGIN_LOCK_MS);

      await User.findOneAndUpdate(
        {
          _id: user._id,
          $or: [{ loginLockedUntil: null }, { loginLockedUntil: { $lte: now } }],
        },
        [
          {
            $set: {
              // An expired prior lock starts a fresh failure window.
              loginFailedAttempts: {
                $cond: [
                  { $gt: [{ $ifNull: ["$loginLockedUntil", null] }, null] },
                  1,
                  { $add: [{ $ifNull: ["$loginFailedAttempts", 0] }, 1] },
                ],
              },
            },
          },
          {
            $set: {
              loginLockedUntil: {
                $cond: [
                  { $gte: ["$loginFailedAttempts", MAX_FAILED_LOGINS] },
                  lockUntil,
                  null,
                ],
              },
            },
          },
        ],
        { updatePipeline: true }
      );

      // Whether the update matched (we counted the failure) or not (the account
      // was locked concurrently), the client gets the identical generic 401.
      return res.status(401).json(GENERIC_LOGIN_401);
    }

    // (d) Successful password match → atomically reset the failure counter
    // (unconditional so counter state is always clean after a real login).
    await User.updateOne(
      { _id: user._id },
      { $set: { loginFailedAttempts: 0, loginLockedUntil: null } }
    );

    if (user.status === "INACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact Super Administrator.",
      });
    }

    // ─── Trusted Device Enforcement for Administrative Roles ───────────────────
    // Applies strictly to SUPER_ADMIN and ADMIN. USER and SUPREME_ADMIN proceed directly.
    if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
      if (!isPermittedLocalDeviceOtpBypass()) {
        return await handleAdministrativeDeviceLogin(req, res, user);
      }
      console.warn(
        `[SECURITY AUDIT] Local development bypass invoked for ${user.role} (${user.email}). Direct authentication permitted on local environment.`
      );
    }

    // Claim any pending guest submissions if the user's email is verified
    await claimGuestDataForUser(user);

    // Standard public USER, SUPREME_ADMIN, or permitted local development bypass
    return issueProductionAuthResponse(res, user, "Login successful");
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
 *
 * Security properties:
 * - OTP generated with crypto-secure randomInt (never Math.random)
 * - Persisted only as HMAC-SHA256 hash bound to a unique challenge ID
 * - 60s DB-backed cooldown suppresses repeat/email-bombing requests silently
 * - Identical generic response for known and unknown emails (no enumeration)
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    // Single generic response — identical shape/message for every outcome so
    // the endpoint never reveals whether an address is registered.
    const GENERIC_SUCCESS = {
      success: true,
      message: "If this email is registered, you will receive a reset code shortly.",
    };

    const emailNormalized = email.trim().toLowerCase();
    const user = await User.findOne({ email: emailNormalized }).select(
      "+resetOtpCooldownUntil"
    );

    if (!user) {
      return res.status(200).json(GENERIC_SUCCESS);
    }

    // Cooldown active → silently swallow the request (no email, no 429 that
    // would reveal account existence). Same generic response.
    if (user.resetOtpCooldownUntil && new Date() < new Date(user.resetOtpCooldownUntil)) {
      return res.status(200).json(GENERIC_SUCCESS);
    }

    const challengeId = crypto.randomUUID();
    const otp = generateSecureOtp();
    const otpHash = hashOtp(otp, challengeId);

    await User.findByIdAndUpdate(user._id, {
      $set: {
        resetOtpHash: otpHash,
        resetOtpChallengeId: challengeId,
        resetOtpVerified: false,
        resetOtpAttempts: 0,
        resetOtpExpiry: new Date(Date.now() + RESET_OTP_TTL_MS),
        resetOtpCooldownUntil: new Date(Date.now() + RESET_COOLDOWN_MS),
      },
    });

    // Send password reset email via the active dispatcher (SMTP/Resend in production)
    const emailResult = await resetEmailDispatcher({
      to: user.email,
      otp,
      expiryMinutes: 10,
    });

    if (!emailResult.success) {
      console.error("[SMTP] Failed to send password reset email:", emailResult.error);
      // Roll back cooldown so a failed dispatch doesn't lock the user out
      await User.findByIdAndUpdate(user._id, {
        $set: { resetOtpCooldownUntil: null },
      });
      return res.status(500).json({ success: false, message: "Failed to send reset code. Please try again." });
    }

    return res.status(200).json(GENERIC_SUCCESS);
  } catch (error) {
    next(error);
  }
};

/**
 * Clears the active password-reset challenge (invalidates the OTP completely).
 */
const clearResetChallenge = (userId) =>
  User.findByIdAndUpdate(userId, {
    $set: {
      resetOtpHash: null,
      resetOtpChallengeId: null,
      resetOtpVerified: false,
      resetOtpAttempts: 0,
      resetOtpExpiry: null,
    },
  });

/**
 * @desc    Verify OTP (step 2)
 * @route   POST /api/auth/verify-otp
 * @access  Public
 *
 * Security properties:
 * - Atomic attempt guard (max 5 failed verifications, then challenge invalidated)
 * - Constant-time HMAC verification bound to the challenge ID
 * - Single-use consume via compare-and-swap: concurrent verifications cannot
 *   both succeed; the OTP cannot be verified twice
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp || typeof email !== "string" || typeof otp !== "string") {
      return res.status(400).json({ success: false, message: "Email and OTP are required." });
    }

    const emailNormalized = email.trim().toLowerCase();
    const now = new Date();

    // ─── Atomic attempt guard ───
    // Only increments while the challenge is live, unverified, and under the cap.
    // Two concurrent requests can never push attempts beyond RESET_MAX_ATTEMPTS.
    const claimed = await User.findOneAndUpdate(
      {
        email: emailNormalized,
        resetOtpChallengeId: { $exists: true, $ne: null },
        resetOtpHash: { $exists: true, $ne: null },
        resetOtpVerified: { $ne: true },
        resetOtpExpiry: { $gt: now },
        resetOtpAttempts: { $lt: RESET_MAX_ATTEMPTS },
      },
      { $inc: { resetOtpAttempts: 1 } },
      { new: true }
    ).select("+resetOtpHash +resetOtpChallengeId +resetOtpAttempts +resetOtpVerified +resetOtpExpiry");

    if (!claimed) {
      // Distinguish "attempts exhausted" from "no/expired challenge" for accurate UX
      const stale = await User.findOne({ email: emailNormalized }).select(
        "+resetOtpAttempts +resetOtpChallengeId +resetOtpVerified"
      );
      if (
        stale &&
        stale.resetOtpChallengeId &&
        !stale.resetOtpVerified &&
        (stale.resetOtpAttempts || 0) >= RESET_MAX_ATTEMPTS
      ) {
        // Invalidate the challenge entirely — restart of the flow is required
        await clearResetChallenge(stale._id);
        return res.status(429).json({
          success: false,
          message: "Maximum verification attempts exceeded. Please request a new reset code.",
        });
      }
      return res.status(400).json({
        success: false,
        message: "OTP expired or not requested. Please try again.",
      });
    }

    // ─── Constant-time verification against the HMAC (bound to challengeId) ───
    if (!verifyOtpHash(otp.trim(), claimed.resetOtpHash, claimed.resetOtpChallengeId)) {
      if ((claimed.resetOtpAttempts || 0) >= RESET_MAX_ATTEMPTS) {
        await clearResetChallenge(claimed._id);
        return res.status(429).json({
          success: false,
          message: "Maximum verification attempts exceeded. Please request a new reset code.",
        });
      }
      const remaining = RESET_MAX_ATTEMPTS - (claimed.resetOtpAttempts || 0);
      return res.status(400).json({
        success: false,
        message: `Incorrect OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      });
    }

    // ─── CAS consume: only the FIRST concurrent success flips the verified flag ───
    const verified = await User.findOneAndUpdate(
      {
        _id: claimed._id,
        resetOtpChallengeId: claimed.resetOtpChallengeId,
        resetOtpHash: claimed.resetOtpHash,
        resetOtpVerified: { $ne: true },
        resetOtpExpiry: claimed.resetOtpExpiry,
      },
      {
        $set: {
          resetOtpVerified: true,
          resetOtpExpiry: new Date(Date.now() + RESET_VERIFIED_WINDOW_MS),
        },
      },
      { new: true }
    );

    if (!verified) {
      // Another concurrent request consumed this exact challenge first
      return res.status(409).json({
        success: false,
        message: "This code was just used in another request. Please restart the reset process.",
      });
    }

    return res.status(200).json({
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
 *
 * Security properties:
 * - Requires a verified, unexpired, live challenge (server-side state)
 * - Re-verifies the OTP against the stored HMAC before consumption
 * - Single-use consumption via compare-and-swap: the password hash and the
 *   entire challenge are cleared atomically, so the same verified session can
 *   never reset the password twice — even under concurrent requests
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (
      !email || !otp || !newPassword ||
      typeof email !== "string" || typeof otp !== "string" || typeof newPassword !== "string"
    ) {
      return res.status(400).json({ success: false, message: "Email, OTP, and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const emailNormalized = email.trim().toLowerCase();
    const now = new Date();

    const candidate = await User.findOne({ email: emailNormalized }).select(
      "+resetOtpHash +resetOtpChallengeId +resetOtpVerified +resetOtpExpiry +passwordHash"
    );

    if (
      !candidate ||
      !candidate.resetOtpHash ||
      !candidate.resetOtpChallengeId ||
      !candidate.resetOtpVerified
    ) {
      return res.status(400).json({ success: false, message: "Session expired. Please start the reset process again." });
    }

    if (new Date(candidate.resetOtpExpiry) <= now) {
      await clearResetChallenge(candidate._id);
      return res.status(400).json({ success: false, message: "Session expired. Please start the reset process again." });
    }

    // Re-verify possession of the OTP against the stored HMAC
    if (!verifyOtpHash(otp.trim(), candidate.resetOtpHash, candidate.resetOtpChallengeId)) {
      return res.status(400).json({ success: false, message: "Invalid session. Please restart the process." });
    }

    // Hash the new password BEFORE the atomic consumption
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // ─── CAS single-use consume: password + challenge cleared together ───
    // If another concurrent request already consumed this session, the update
    // matches nothing and we reject the duplicate.
    const consumed = await User.findOneAndUpdate(
      {
        _id: candidate._id,
        resetOtpChallengeId: candidate.resetOtpChallengeId,
        resetOtpHash: candidate.resetOtpHash,
        resetOtpVerified: true,
        resetOtpExpiry: candidate.resetOtpExpiry,
      },
      {
        $set: {
          passwordHash,
          resetOtpHash: null,
          resetOtpChallengeId: null,
          resetOtpVerified: false,
          resetOtpAttempts: 0,
          resetOtpExpiry: null,
        },
      },
      { new: true }
    );

    if (!consumed) {
      return res.status(409).json({
        success: false,
        message: "This reset session was already used or expired. Please start the reset process again.",
      });
    }

    return res.status(200).json({
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
      // SECURITY GUARD: If the authenticated Google email does NOT match the account's email,
      // do not blindly authenticate into a different user account!
      if (user.email.toLowerCase() !== emailNormalized) {
        console.warn(
          `[GoogleAuth] Mismatch detected: Google token email (${emailNormalized}) does not match linked account email (${user.email}). Unlinking stale googleId.`
        );
        user.googleId = null;
        await user.save();
        user = null; // Fall through to search by emailNormalized
      }
    }

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
        if (!isPermittedLocalDeviceOtpBypass()) {
          return await handleAdministrativeDeviceLogin(req, res, user);
        }
        console.warn(
          `[SECURITY AUDIT] Local development bypass invoked for ${user.role} (${user.email}) via Google OAuth.`
        );
      }

      // Claim guest submissions for verified Google OAuth user
      await claimGuestDataForUser(user);

      return issueProductionAuthResponse(res, user, "Login successful with Google");
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

      // Administrative roles must complete trusted-device verification!
      if (existingEmailUser.role === "SUPER_ADMIN" || existingEmailUser.role === "ADMIN") {
        if (!isPermittedLocalDeviceOtpBypass()) {
          return await handleAdministrativeDeviceLogin(req, res, existingEmailUser);
        }
        console.warn(
          `[SECURITY AUDIT] Local development bypass invoked for ${existingEmailUser.role} (${existingEmailUser.email}) via Google OAuth link.`
        );
      }

      // Link the verified Google account safely without altering passwordHash or role
      existingEmailUser.googleId = googleId;
      existingEmailUser.isEmailVerified = true;

      // Update authProviders array & authProvider indicator
      if (!Array.isArray(existingEmailUser.authProviders)) {
        existingEmailUser.authProviders = [existingEmailUser.authProvider || "local"];
      }
      if (!existingEmailUser.authProviders.includes("google")) {
        existingEmailUser.authProviders.push("google");
      }
      // If user had local and now adds google, mark as combined or keep list
      existingEmailUser.authProvider = existingEmailUser.authProviders.join(",");

      if (avatar && existingEmailUser.avatar !== avatar) {
        existingEmailUser.avatar = avatar;
      }
      await existingEmailUser.save();

      // Claim guest submissions for verified Google OAuth linked user
      await claimGuestDataForUser(existingEmailUser);

      return issueProductionAuthResponse(res, existingEmailUser, "Google account successfully linked");
    }

    // 3. New User Registration via Google OAuth
    // Create new customer account: strictly USER role, no tenant escalation
    try {
      user = await User.create({
        name,
        email: emailNormalized,
        googleId,
        authProvider: "google",
        authProviders: ["google"],
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

    // Claim guest submissions for newly registered verified Google OAuth user
    await claimGuestDataForUser(user);

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
