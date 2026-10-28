import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import TrustedDevice from "../models/TrustedDevice.js";
import DeviceApprovalRequest from "../models/DeviceApprovalRequest.js";
import { generateToken } from "../utils/generateToken.js";
import { sendDeviceEnrollmentOtpEmail } from "../utils/smtpEmailService.js";
import {
  generateSecureOtp,
  hashOtp,
  verifyOtpHash,
  validateOtpSecretConfig,
} from "../utils/otpSecurity.js";
import {
  generateDeviceSecret,
  hashDeviceSecret,
  verifyDeviceSecret,
  setDeviceCookie,
} from "../utils/deviceSecurity.js";
import { supportsTransactions } from "../config/db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dreamcity_super_secret_jwt_key_2026_dev";

/**
 * Extract descriptive browser and OS info from User-Agent.
 */
function extractTelemetry(req) {
  const rawUA = req.get("user-agent") || "";
  let browserName = "Browser";
  if (rawUA.includes("Edg/")) browserName = "Edge";
  else if (rawUA.includes("Chrome/")) browserName = "Chrome";
  else if (rawUA.includes("Firefox/")) browserName = "Firefox";
  else if (rawUA.includes("Safari/")) browserName = "Safari";

  let osName = "Workstation";
  if (rawUA.includes("Windows")) osName = "Windows";
  else if (rawUA.includes("Mac OS")) osName = "macOS";
  else if (rawUA.includes("Linux")) osName = "Linux";
  else if (rawUA.includes("Android")) osName = "Android";
  else if (rawUA.includes("iPhone") || rawUA.includes("iPad")) osName = "iOS";

  return {
    browser: { name: browserName, version: "" },
    os: { name: osName, version: "" },
    ipAddress: req.ip || "127.0.0.1",
    userAgent: rawUA,
  };
}

/**
 * @desc    Verify Device Enrollment / Transfer OTP and Proceed (Unified Handler)
 * @route   POST /api/auth/device/verify-otp
 * @access  Public (Bounded by active challenge)
 */
export const verifyDeviceOtpAndProceed = async (req, res, next) => {
  let session = null;
  try {
    const { email, challengeId, otp, deviceLabel } = req.body;
    if (!email || !challengeId || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email, challengeId, and 6-digit verification code are required.",
      });
    }

    const emailNormalized = email.trim().toLowerCase();
    const user = await User.findOne({ email: emailNormalized }).select(
      "+deviceEnrollmentChallengeId +deviceEnrollmentOtpHash +deviceEnrollmentOtpExpiry +deviceEnrollmentAttempts"
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Role check
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Device verification not applicable." });
    }

    // Challenge validation
    if (
      !user.deviceEnrollmentChallengeId ||
      user.deviceEnrollmentChallengeId !== challengeId
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification challenge. Please request a new code.",
      });
    }

    if (new Date() > new Date(user.deviceEnrollmentOtpExpiry)) {
      return res.status(400).json({
        success: false,
        message: "Verification code has expired. Please request a new code.",
      });
    }

    if ((user.deviceEnrollmentAttempts || 0) >= 5) {
      return res.status(429).json({
        success: false,
        message: "Maximum verification attempts exceeded. Please restart login.",
      });
    }

    const isValidOtp = verifyOtpHash(otp, user.deviceEnrollmentOtpHash, challengeId);
    if (!isValidOtp) {
      await User.findByIdAndUpdate(user._id, {
        $inc: { deviceEnrollmentAttempts: 1 },
      });
      const remaining = 4 - (user.deviceEnrollmentAttempts || 0);
      return res.status(400).json({
        success: false,
        message: `Incorrect verification code. ${Math.max(0, remaining)} attempts remaining.`,
      });
    }

    const telemetry = extractTelemetry(req);
    const useTx = supportsTransactions();
    if (useTx) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    // ─── ATOMIC CHALLENGE CONSUMPTION ───
    // If two requests try to verify the exact same challenge concurrently,
    // only ONE findOneAndUpdate will match and return a document.
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        deviceEnrollmentChallengeId: challengeId,
      },
      {
        $set: {
          deviceEnrollmentChallengeId: null,
          deviceEnrollmentOtpHash: null,
          deviceEnrollmentOtpExpiry: null,
          deviceEnrollmentAttempts: 0,
        },
      },
      { new: true, session: session || undefined }
    );

    if (!updatedUser) {
      if (session) await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: "Verification challenge consumed concurrently or already used. Please restart login.",
      });
    }

    // Determine whether this is First-Device Bootstrap OR Device Transfer
    const historicalCount = await TrustedDevice.countDocuments({ userId: user._id });
    const approvedDevice = await TrustedDevice.findOne({ userId: user._id, status: "APPROVED" });

    if (historicalCount === 0) {
      // ─── CASE A: FIRST DEVICE BOOTSTRAP ───
      const rawDeviceSecret = generateDeviceSecret();
      const deviceTokenHash = hashDeviceSecret(rawDeviceSecret);
      const deviceId = crypto.randomUUID();

      const newDevice = new TrustedDevice({
        userId: user._id,
        tenantId: user.tenantId || null,
        role: user.role,
        deviceId,
        deviceTokenHash,
        isCurrentSession: true,
        deviceLabel: deviceLabel?.trim() || `${telemetry.os.name} (${telemetry.browser.name})`,
        browser: telemetry.browser,
        os: telemetry.os,
        ipAddress: telemetry.ipAddress,
        userAgent: telemetry.userAgent,
        status: "APPROVED",
        approvalType: "BOOTSTRAP_FIRST_DEVICE",
        approvedAt: new Date(),
        lastUsedAt: new Date(),
      });

      if (session) {
        await newDevice.save({ session });
      } else {
        await newDevice.save();
      }

      if (session) {
        await session.commitTransaction();
      }

      // Set HttpOnly device cookie on response
      setDeviceCookie(res, rawDeviceSecret);

      const token = generateToken(user._id, user.role, newDevice._id);
      return res.status(201).json({
        success: true,
        isTransfer: false,
        message: "Workstation successfully enrolled and approved.",
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
    } else {
      // ─── CASE C: DEVICE TRANSFER (Historical Devices Exist) ───
      // OTP has been verified atomically. Now stage the transfer request with PENDING_APPROVAL.
      const candidateSecret = generateDeviceSecret();
      const candidateTokenHash = hashDeviceSecret(candidateSecret);

      // Invalidate any previously pending requests for this user
      await DeviceApprovalRequest.updateMany(
        { userId: user._id, status: "PENDING_APPROVAL" },
        { $set: { status: "CANCELLED" } },
        session ? { session } : undefined
      );

      const customLabel = deviceLabel?.trim() || `${telemetry.os.name} (${telemetry.browser.name})`;
      const transferRequest = new DeviceApprovalRequest({
        userId: user._id,
        tenantId: user.tenantId || null,
        role: user.role,
        candidateTokenHash,
        currentApprovedDevice: approvedDevice?._id || null,
        deviceLabel: customLabel,
        browser: telemetry.browser,
        os: telemetry.os,
        ipAddress: telemetry.ipAddress,
        userAgent: telemetry.userAgent,
        status: "PENDING_APPROVAL",
        requestedAt: new Date(),
      });

      if (session) {
        await transferRequest.save({ session });
      } else {
        await transferRequest.save();
      }

      if (session) {
        await session.commitTransaction();
      }

      // Set candidate secret cookie on requesting browser
      setDeviceCookie(res, candidateSecret);

      // Issue short-lived, purpose-bound polling token
      const statusPollingToken = jwt.sign(
        {
          requestId: String(transferRequest._id),
          userId: String(user._id),
          purpose: "DEVICE_TRANSFER_POLL",
        },
        JWT_SECRET,
        { expiresIn: "30m" }
      );

      return res.status(200).json({
        success: true,
        isTransfer: true,
        requiresTransferApproval: true,
        statusPollingToken,
        requestId: transferRequest._id,
        deviceLabel: transferRequest.deviceLabel,
        currentDeviceLabel: approvedDevice?.deviceLabel || "Previous Workstation",
        message:
          "OTP verified. Workstation transfer request has been submitted for Supreme Admin approval.",
      });
    }
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    // Handle unique partial index duplicate key collision gracefully
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An approved workstation already exists for this account.",
      });
    }
    next(error);
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

/**
 * Backward-compatible alias for enrollFirstDevice
 */
export const enrollFirstDevice = verifyDeviceOtpAndProceed;

/**
 * @desc    Resend Enrollment OTP with rate-limiting cooldown
 * @route   POST /api/auth/device/resend-enrollment-otp
 * @access  Public
 */
export const resendEnrollmentOtp = async (req, res, next) => {
  try {
    const { email, challengeId } = req.body;
    if (!email || !challengeId) {
      return res.status(400).json({
        success: false,
        message: "Email and challengeId are required.",
      });
    }

    const emailNormalized = email.trim().toLowerCase();
    const user = await User.findOne({ email: emailNormalized }).select(
      "+deviceEnrollmentChallengeId +deviceEnrollmentCooldownUntil"
    );

    if (!user || user.deviceEnrollmentChallengeId !== challengeId) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment session. Please restart login.",
      });
    }

    if (
      user.deviceEnrollmentCooldownUntil &&
      new Date() < new Date(user.deviceEnrollmentCooldownUntil)
    ) {
      const waitSeconds = Math.ceil(
        (new Date(user.deviceEnrollmentCooldownUntil) - new Date()) / 1000
      );
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSeconds}s before requesting another verification code.`,
      });
    }

    const newChallengeId = crypto.randomUUID();
    const otp = generateSecureOtp();
    const otpHash = hashOtp(otp, newChallengeId);

    await User.findByIdAndUpdate(user._id, {
      $set: {
        deviceEnrollmentChallengeId: newChallengeId,
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
      return res.status(502).json({
        success: false,
        message: "Unable to dispatch verification code via SMTP. Please try again shortly.",
      });
    }

    return res.status(200).json({
      success: true,
      challengeId: newChallengeId,
      message: "A fresh verification code has been dispatched to your email address.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Protected Status Polling Endpoint
 * @route   GET /api/auth/device/request-status
 * @access  Restricted by statusPollingToken
 */
export const getRequestStatus = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Missing polling authorization." });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: "Polling token expired." });
    }

    if (decoded.purpose !== "DEVICE_TRANSFER_POLL") {
      return res.status(403).json({ success: false, message: "Invalid token scope." });
    }

    const requestDoc = await DeviceApprovalRequest.findOne({
      _id: decoded.requestId,
      userId: decoded.userId,
    }).select("status expiresAt deviceLabel");

    if (!requestDoc) {
      return res.status(404).json({ success: false, message: "Request not found." });
    }

    let status = requestDoc.status;
    if (status === "PENDING_APPROVAL" && new Date() > new Date(requestDoc.expiresAt)) {
      status = "EXPIRED";
      requestDoc.status = "EXPIRED";
      await requestDoc.save();
    }

    res.status(200).json({
      success: true,
      status,
      deviceLabel: requestDoc.deviceLabel,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Claim Approved Session via Proof of Possession of Candidate Secret
 * @route   POST /api/auth/device/claim-approved-session
 * @access  Restricted by statusPollingToken + proof of possession of candidate cookie
 */
export const claimApprovedSession = async (req, res, next) => {
  let session = null;
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Missing polling token." });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: "Polling token has expired." });
    }

    if (decoded.purpose !== "DEVICE_TRANSFER_POLL") {
      return res.status(403).json({ success: false, message: "Invalid token purpose." });
    }

    // Verify candidate secret cookie presented by browser
    const candidateSecret = req.cookies?.plotpro_device_cred;
    if (!candidateSecret) {
      return res.status(400).json({
        success: false,
        message: "Missing workstation candidate credential cookie. Please restart login.",
      });
    }

    const useTx = supportsTransactions();
    if (useTx) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    // 1. Fetch request inside transaction
    const reqQuery = DeviceApprovalRequest.findOne({
      _id: decoded.requestId,
      userId: decoded.userId,
    });
    const requestDoc = session ? await reqQuery.session(session) : await reqQuery;

    if (!requestDoc) {
      if (session) await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Transfer request not found." });
    }

    if (requestDoc.status !== "APPROVED_PENDING_CLAIM") {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Cannot claim session: current status is '${requestDoc.status}'.`,
      });
    }

    if (new Date() > new Date(requestDoc.expiresAt)) {
      requestDoc.status = "EXPIRED";
      await requestDoc.save(session ? { session } : undefined);
      if (session) await session.commitTransaction();
      return res.status(400).json({ success: false, message: "Transfer request has expired." });
    }

    // 2. Timing-safe proof of possession check against stored candidateTokenHash
    const isOwner = verifyDeviceSecret(candidateSecret, requestDoc.candidateTokenHash);
    if (!isOwner) {
      if (session) await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "Cryptographic proof of workstation possession failed.",
      });
    }

    // 3. Revoke existing APPROVED device for this user
    const existingApprovedQuery = TrustedDevice.findOne({
      userId: requestDoc.userId,
      status: "APPROVED",
    });
    const existingApproved = session
      ? await existingApprovedQuery.session(session)
      : await existingApprovedQuery;

    let replacedDeviceId = null;
    if (existingApproved) {
      existingApproved.status = "REPLACED";
      existingApproved.isCurrentSession = false;
      existingApproved.revokedAt = new Date();
      existingApproved.revocationReason = `Replaced by workstation '${requestDoc.deviceLabel}' via approved transfer.`;
      await existingApproved.save(session ? { session } : undefined);
      replacedDeviceId = existingApproved._id;
    }

    // 4. Create new TrustedDevice with APPROVED status and isCurrentSession: true
    const newDevice = new TrustedDevice({
      userId: requestDoc.userId,
      tenantId: requestDoc.tenantId,
      role: requestDoc.role,
      deviceId: crypto.randomUUID(),
      deviceTokenHash: requestDoc.candidateTokenHash,
      isCurrentSession: true,
      deviceLabel: requestDoc.deviceLabel,
      browser: requestDoc.browser,
      os: requestDoc.os,
      ipAddress: requestDoc.ipAddress,
      userAgent: requestDoc.userAgent,
      status: "APPROVED",
      approvalType: "SUPREME_ADMIN_APPROVAL",
      approvedAt: new Date(),
      lastUsedAt: new Date(),
    });

    await newDevice.save(session ? { session } : undefined);

    // 5. Mark request as CLAIMED (anti-replay)
    requestDoc.status = "CLAIMED";
    requestDoc.claimedAt = new Date();
    await requestDoc.save(session ? { session } : undefined);

    // 6. Record Audit Log
    

    if (session) {
      await session.commitTransaction();
    }

    const user = await User.findById(requestDoc.userId);
    const productionToken = generateToken(user._id, user.role, newDevice._id);

    return res.status(200).json({
      success: true,
      message: "Workstation session successfully established and activated.",
      token: productionToken,
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
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    next(error);
  } finally {
    if (session) {
      session.endSession();
    }
  }
};
