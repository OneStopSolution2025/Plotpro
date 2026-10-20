import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    customId: {
      type: Number,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Project title is required"],
      trim: true,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
    },
    category: {
      type: String,
      default: "Residential",
    },
    plotType: {
      type: String,
      default: "Residential",
    },
    budget: {
      type: String,
      default: "below10",
    },
    plotPrice: {
      type: String,
      required: [true, "Plot price string is required"],
    },
    priceLakhs: {
      type: Number,
      required: true,
      index: true,
    },
    plotSizes: {
      type: String,
      default: "600 – 2400 Sq.ft",
    },
    distance: {
      type: String,
      default: "",
    },
    projectSize: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Active", "Completed", "Upcoming"],
      default: "Active",
    },
    launchDate: {
      type: String,
      default: "Not announced",
    },
    details: {
      type: String,
      default: "",
    },
    image: {
      type: String,
      default: "",
    },
    defaultPlotImage: {
      type: String,
      default: "",
    },
    images: [{ type: String }],
    about: {
      description: { type: String, default: "" },
      additionalDescription: { type: String, default: "" },
    },
    benefits: [
      {
        title: { type: String },
        description: { type: String },
      },
    ],
    highlights: [{ type: String }],
    amenities: [{ type: String }],
    locationConnectivity: [
      {
        name: { type: String },
        distance: { type: String },
      },
    ],

    // Ownership & Approval Workflow
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Zero-Downtime Re-Approval Staging
    pendingUpdates: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    hasPendingUpdates: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Soft deletion (Prevents live project destruction by normal admin)
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Deletion approval workflow by Normal Admin -> Super Admin
    pendingDeletion: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletionReason: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual relationship to plots
projectSchema.virtual("plots", {
  ref: "Plot",
  localField: "_id",
  foreignField: "projectId",
});

export default mongoose.model("Project", projectSchema);
