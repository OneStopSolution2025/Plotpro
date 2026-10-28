import mongoose from "mongoose";

const deviceApprovalRequestSchema = new mongoose.Schema(
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
    // The candidate device token hash held in quarantine
    candidateTokenHash: {
      type: String,
      required: true,
    },
    // Reference to the active device that will be replaced upon approved claim
    currentApprovedDevice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrustedDevice",
      default: null,
    },
    deviceLabel: {
      type: String,
      default: "New Device Request",
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
    status: {
      type: String,
      enum: [
        "PENDING_APPROVAL",
        "APPROVED_PENDING_CLAIM",
        "CLAIMED",
        "REJECTED",
        "EXPIRED",
        "CANCELLED",
      ],
      default: "PENDING_APPROVAL",
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewNotes: {
      type: String,
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
deviceApprovalRequestSchema.index({ userId: 1, status: 1 });

export default mongoose.model("DeviceApprovalRequest", deviceApprovalRequestSchema);
