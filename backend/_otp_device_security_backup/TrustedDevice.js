import mongoose from "mongoose";

const trustedDeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "ADMIN"],
      required: true,
    },
    // Server-Keyed HMAC-SHA256 hash of the device secret. Raw secret is never persisted.
    deviceTokenHash: {
      type: String,
      required: true,
      index: true,
    },
    // Device Identifier (UUID / Random string)
    deviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Session state: tracks whether the device is currently in an authenticated session
    isCurrentSession: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Descriptive telemetry (diagnostic only; never used for authorization)
    deviceLabel: {
      type: String,
      trim: true,
      default: "Administrative Workstation",
    },
    browser: {
      name: { type: String, default: "Unknown Browser" },
      version: { type: String, default: "" },
    },
    os: {
      name: { type: String, default: "Unknown OS" },
      version: { type: String, default: "" },
    },
    ipAddress: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },

    // Device Lifecycle State
    status: {
      type: String,
      enum: ["APPROVED", "REVOKED", "REPLACED"],
      default: "APPROVED",
      index: true,
    },
    approvalType: {
      type: String,
      enum: ["BOOTSTRAP_FIRST_DEVICE", "SUPREME_ADMIN_APPROVAL"],
      default: "BOOTSTRAP_FIRST_DEVICE",
    },
    approvedAt: {
      type: Date,
      default: Date.now,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    revocationReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// CRITICAL GUARANTEE: Invariant enforcing at most ONE approved device per user
trustedDeviceSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "APPROVED" },
  }
);

export default mongoose.model("TrustedDevice", trustedDeviceSchema);
