import mongoose from "mongoose";

const enquirySchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      default: "",
    },
    mobile: {
      type: String,
      required: [true, "Mobile number is required"],
      trim: true,
    },
    contactMethod: {
      type: String,
      enum: ["phone", "whatsapp", "email", ""],
      default: "phone",
    },
    message: {
      type: String,
      default: "",
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    plot: {
      type: String,
      default: "",
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    assignedAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["NEW", "CONTACTED", "FOLLOW_UP", "CLOSED"],
      default: "NEW",
      index: true,
    },
    activityLog: [
      {
        action: {
          type: String,
          required: true,
        },
        previousStatus: {
          type: String,
          default: null,
        },
        newStatus: {
          type: String,
          default: null,
        },
        notes: {
          type: String,
          default: "",
          trim: true,
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        performedByName: {
          type: String,
          default: "",
        },
        performedByRole: {
          type: String,
          default: "",
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    lastActivity: {
      action: {
        type: String,
        default: "ENQUIRY_CREATED",
      },
      performedByName: {
        type: String,
        default: "Customer",
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
      newStatus: {
        type: String,
        default: "NEW",
      },
      notes: {
        type: String,
        default: "",
      },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Enquiry", enquirySchema);
