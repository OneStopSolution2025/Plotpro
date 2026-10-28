import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import TrustedDevice from "../models/TrustedDevice.js";
import DeviceApprovalRequest from "../models/DeviceApprovalRequest.js";
import User from "../models/User.js";
import { supportsTransactions } from "../config/db.js";

/**
 * @desc    Get all pending device approval requests
 * @route   GET /api/supreme-admin/devices/pending
 * @access  Private (Supreme Admin)
 */
export const getPendingDeviceRequests = async (req, res, next) => {
  try {
    const requests = await DeviceApprovalRequest.find({
      status: "PENDING_APPROVAL",
      expiresAt: { $gt: new Date() },
    })
      .populate("userId", "name email role businessName")
      .populate("tenantId", "name email businessName")
      .sort({ requestedAt: -1 });

    // Also fetch the current active approved device for each user to display side-by-side
    const enriched = await Promise.all(
      requests.map(async (r) => {
        const currentDevice = await TrustedDevice.findOne({
          userId: r.userId?._id,
          status: "APPROVED",
        }).select("deviceLabel browser os approvedAt lastUsedAt isBackedUp");

        return {
          _id: r._id,
          user: r.userId,
          tenant: r.tenantId,
          role: r.role,
          authMethod: r.authMethod || "WEBAUTHN",
          deviceLabel: r.deviceLabel,
          browser: r.browser,
          os: r.os,
          ipAddress: r.ipAddress,
          requestedAt: r.requestedAt,
          isBackedUp: r.stagingCredential?.isBackedUp,
          deviceType: r.stagingCredential?.deviceType,
          currentApprovedDevice: currentDevice,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all active approved trusted devices across the platform
 * @route   GET /api/supreme-admin/devices/active
 * @access  Private (Supreme Admin)
 */
export const getActiveTrustedDevices = async (req, res, next) => {
  try {
    const devices = await TrustedDevice.find({ status: "APPROVED" })
      .populate("userId", "name email role businessName status")
      .populate("tenantId", "name email businessName")
      .sort({ approvedAt: -1 });

    res.status(200).json({
      success: true,
      count: devices.length,
      data: devices,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve and atomically replace device via MongoDB transaction
 * @route   POST /api/supreme-admin/devices/requests/:requestId/approve
 * @access  Private (Supreme Admin)
 */
export const approveDeviceRequest = async (req, res, next) => {
  let session = null;
  try {
    const { requestId } = req.params;
    const { reviewNotes } = req.body;

    const requestDoc = await DeviceApprovalRequest.findById(requestId);
    if (!requestDoc) {
      return res.status(404).json({ success: false, message: "Device approval request not found." });
    }

    if (requestDoc.status !== "PENDING_APPROVAL") {
      return res.status(400).json({
        success: false,
        message: `This request cannot be approved because its current status is '${requestDoc.status}'.`,
      });
    }

    if (new Date() > new Date(requestDoc.expiresAt)) {
      requestDoc.status = "EXPIRED";
      await requestDoc.save();
      return res.status(400).json({
        success: false,
        message: "This request has expired and cannot be approved.",
      });
    }

    // Begin MongoDB Transaction if supported by topology
    const useTx = supportsTransactions();
    if (useTx) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    // 1. Re-query request inside transaction for concurrency safety
    const query = DeviceApprovalRequest.findById(requestId);
    const txRequest = session ? await query.session(session) : await query;
    if (!txRequest || txRequest.status !== "PENDING_APPROVAL") {
      if (session) await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: "Request status changed concurrently. Please refresh.",
      });
    }

    // Update request status to APPROVED_PENDING_CLAIM
    txRequest.status = "APPROVED_PENDING_CLAIM";
    txRequest.reviewedAt = new Date();
    txRequest.reviewedBy = req.user._id;
    txRequest.reviewNotes = reviewNotes ? reviewNotes.trim() : "Approved by Supreme Administrator";
    if (session) {
      await txRequest.save({ session });
    } else {
      await txRequest.save();
    }

    if (session) {
      await session.commitTransaction();
    }

    res.status(200).json({
      success: true,
      message: "Device transfer approved. Claimant workstation may now establish active session.",
      data: {
        requestId: txRequest._id,
        status: txRequest.status,
      },
    });
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        // ignore
      }
    }
    // Fail closed if transactions unavailable
    if (error.message?.includes("Transaction numbers are only allowed on a replica set member")) {
      return res.status(500).json({
        success: false,
        message:
          "Database transaction failed: MongoDB replica set is required for atomic device approval.",
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
 * @desc    Reject a pending device approval request
 * @route   POST /api/supreme-admin/devices/requests/:requestId/reject
 * @access  Private (Supreme Admin)
 */
export const rejectDeviceRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { reviewNotes } = req.body;

    const requestDoc = await DeviceApprovalRequest.findById(requestId);
    if (!requestDoc) {
      return res.status(404).json({ success: false, message: "Device approval request not found." });
    }

    if (requestDoc.status !== "PENDING_APPROVAL") {
      return res.status(400).json({
        success: false,
        message: `This request cannot be rejected because its current status is '${requestDoc.status}'.`,
      });
    }

    requestDoc.status = "REJECTED";
    requestDoc.reviewedAt = new Date();
    requestDoc.reviewedBy = req.user._id;
    requestDoc.reviewNotes = reviewNotes ? reviewNotes.trim() : "Rejected by Supreme Administrator";
    await requestDoc.save();

    res.status(200).json({
      success: true,
      message: "Device request was rejected.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Revoke an active trusted device
 * @route   POST /api/supreme-admin/devices/:deviceId/revoke
 * @access  Private (Supreme Admin)
 */
export const revokeTrustedDevice = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { reason } = req.body;

    const device = await TrustedDevice.findById(deviceId);
    if (!device) {
      return res.status(404).json({ success: false, message: "Device not found." });
    }

    if (device.status !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: `Device is not active (current status: '${device.status}').`,
      });
    }

    device.status = "REVOKED";
    device.revokedAt = new Date();
    device.revokedBy = req.user._id;
    device.revocationReason = reason ? reason.trim() : "Revoked by Supreme Administrator";
    await device.save();

    res.status(200).json({
      success: true,
      message: "Trusted device has been revoked. All active sessions from this device are terminated.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Emergency Device Reset with Password Reauthentication & Mandatory Justification
 * @route   POST /api/supreme-admin/devices/emergency-reset
 * @access  Private (Supreme Admin)
 */
export const emergencyDeviceReset = async (req, res, next) => {
  try {
    const { targetUserId, adminPassword, justificationReason } = req.body;

    if (!targetUserId || !adminPassword || !justificationReason) {
      return res.status(400).json({
        success: false,
        message:
          "Target user ID, Supreme Admin password confirmation, and justification reason are required.",
      });
    }

    if (justificationReason.trim().length < 15) {
      return res.status(400).json({
        success: false,
        message: "Justification reason must be at least 15 characters describing the emergency cause.",
      });
    }

    // Strong Re-Authentication: Verify Supreme Admin password
    const supremeUser = await User.findById(req.user._id).select("+passwordHash");
    if (!supremeUser) {
      return res.status(401).json({ success: false, message: "Supreme Administrator account not found." });
    }

    const isMatch = await supremeUser.matchPassword(adminPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Authentication failed: Incorrect Supreme Administrator password confirmation.",
      });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "Target user not found." });
    }

    if (targetUser.role !== "SUPER_ADMIN" && targetUser.role !== "ADMIN") {
      return res.status(400).json({
        success: false,
        message: "Emergency reset is only applicable for Super Admin and Branch Admin accounts.",
      });
    }

    // Revoke all existing approved devices for target user
    await TrustedDevice.updateMany(
      { userId: targetUser._id, status: "APPROVED" },
      {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedBy: req.user._id,
        revocationReason: `Emergency Reset: ${justificationReason.trim()}`,
      }
    );

    // Cancel all pending approval requests
    await DeviceApprovalRequest.updateMany(
      { userId: targetUser._id, status: "PENDING_APPROVAL" },
      { status: "CANCELLED" }
    );

    // Record immutable audit entry

    res.status(200).json({
      success: true,
      message: `Emergency reset completed for ${targetUser.name}. All existing devices have been revoked and the user can now register a fresh device.`,
    });
  } catch (error) {
    next(error);
  }
};
