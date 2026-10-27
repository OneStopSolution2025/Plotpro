import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    senderRole: {
      type: String,
      enum: ["SUPREME_ADMIN", "SUPER_ADMIN", "ADMIN", "SYSTEM"],
      default: "SYSTEM",
    },
    senderName: {
      type: String,
      default: "System",
    },
    type: {
      type: String,
      enum: [
        "PROJECT_CREATED",
        "PROJECT_APPROVED",
        "PROJECT_REJECTED",
        "PROJECT_DELETE_REQUESTED",
        "PROJECT_DELETED",
        "PROJECT_ASSIGNED",
        "PLOT_SOLD",
        "ADMIN_STATUS_CHANGED",
        "ADMIN_DELETED",
        "ADMIN_UPDATED",
        "ADMIN_WELCOME",
        "RETAILER_SIGNUP_REQUEST",
        "RETAILER_REQUEST_APPROVED",
        "RETAILER_REQUEST_REJECTED",
        "SUBSCRIPTION_UPDATED",
        "SEAT_REQUEST_SUBMITTED",
        "GENERAL",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    metadata: {
      projectId: { type: String, default: null },
      projectTitle: { type: String, default: null },
      plotNumber: { type: String, default: null },
      adminId: { type: String, default: null },
      adminName: { type: String, default: null },
      requestId: { type: String, default: null },
      applicantEmail: { type: String, default: null },
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Notification", notificationSchema);
