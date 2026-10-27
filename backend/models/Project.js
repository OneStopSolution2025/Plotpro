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
    // Branch scope — set when the project is created by (or assigned to) a
    // tenant Branch Admin / branch. null = unbranched (legacy / super admin).
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
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

    // Interactive Layout Map Configuration (Native Vector Site-Plan & Tracing Reference)
    layout: {
      referenceImageUrl: { type: String, default: "" },
      imageUrl: { type: String, default: "" }, // Kept for reference compatibility
      provider: { type: String, enum: ["cloudinary", "url", "volume", "local"], default: "volume" },
      publicId: { type: String, default: "" },
      version: { type: Number, default: 0 },
      width: { type: Number, default: 1200 },
      height: { type: Number, default: 800 },
      compassOrientation: { type: Number, default: 0 }, // Degrees (0 = North up)
      blocks: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          color: { type: String, default: "#3b82f6" },
          description: { type: String, default: "" },
        },
      ],
      roads: [
        {
          id: { type: String, required: true },
          name: { type: String, default: "Main Road" },
          widthFt: { type: String, default: "30 Ft" },
          points: [
            {
              x: { type: Number, required: true, min: 0, max: 100 },
              y: { type: Number, required: true, min: 0, max: 100 },
            },
          ],
        },
      ],
      commonAreas: [
        {
          id: { type: String, required: true },
          name: { type: String, default: "Park" },
          type: { type: String, default: "park" },
          points: [
            {
              x: { type: Number, required: true, min: 0, max: 100 },
              y: { type: Number, required: true, min: 0, max: 100 },
            },
          ],
        },
      ],
      regions: [
        {
          id: { type: String, required: true },
          plotId: { type: mongoose.Schema.Types.ObjectId, ref: "Plot", required: true },
          plotNumber: { type: String, required: true },
          blockId: { type: String, default: "" },
          block: { type: String, default: "" },
          shapeType: { type: String, enum: ["polygon", "rect"], default: "polygon" },
          points: [
            {
              x: { type: Number, required: true, min: 0, max: 100 },
              y: { type: Number, required: true, min: 0, max: 100 },
            },
          ],
          labelPosition: {
            x: { type: Number, min: 0, max: 100 },
            y: { type: Number, min: 0, max: 100 },
          },
        },
      ],
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
