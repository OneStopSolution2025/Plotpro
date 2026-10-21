import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import PlatformSettings from "../models/PlatformSettings.js";
import { generateToken } from "../utils/generateToken.js";

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

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailError } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "DreamCity <Dreamcityadmin.in>",
      to: user.email,
      subject: "Your DreamCity Password Reset OTP",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f3f5f8;border-radius:12px;">
          <div style="background:#ffffff;border-radius:10px;padding:32px;box-shadow:0 4px 16px rgba(20,40,70,0.08);">
            <h2 style="margin:0 0 6px;color:#121d31;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
              DreamCity
            </h2>
            <p style="margin:0 0 24px;color:#718096;font-size:13px;">Real Estate Platform</p>

            <h3 style="margin:0 0 8px;color:#121d31;font-size:18px;font-weight:600;">Password Reset OTP</h3>
            <p style="margin:0 0 24px;color:#4a5568;font-size:14px;line-height:1.6;">
              You requested a password reset for your DreamCity account.
              Use the OTP below to continue. This code expires in <strong>10 minutes</strong>.
            </p>

            <div style="background:#f0f5ff;border:2px solid #1268d8;border-radius:10px;padding:20px;text-align:center;margin:0 0 24px;">
              <p style="margin:0 0 4px;color:#718096;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Your OTP Code</p>
              <p style="margin:0;color:#1268d8;font-size:36px;font-weight:800;letter-spacing:10px;">${otp}</p>
            </div>

            <div style="background:#fff8f0;border-left:4px solid #d97706;border-radius:4px;padding:12px 16px;margin:0 0 24px;">
              <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5;">
                🔒 <strong>Never share this OTP</strong> with anyone.
                DreamCity staff will never ask for your OTP.
                If you did not request a password reset, please ignore this email.
              </p>
            </div>

            <p style="margin:0;color:#a0aec0;font-size:12px;text-align:center;">
              © ${new Date().getFullYear()} DreamCity Real Estate. All rights reserved.
            </p>
          </div>
        </div>
      `,
    });

    if (emailError) {
      console.error("[RESEND] Failed to send OTP email:", emailError);
      return res.status(500).json({ success: false, message: "Failed to send OTP email. Please try again." });
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
      // Never allow administrative accounts to be commandeered or linked automatically via public Google OAuth
      if (["ADMIN", "SUPER_ADMIN", "SUPREME_ADMIN"].includes(existingEmailUser.role)) {
        return res.status(403).json({
          success: false,
          message: "Administrative accounts cannot be accessed via Google sign-in. Please use your administrator password.",
        });
      }

      if (existingEmailUser.status === "INACTIVE") {
        return res.status(403).json({
          success: false,
          message: "Your account has been deactivated. Please contact platform administration.",
        });
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
