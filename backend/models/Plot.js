import mongoose from "mongoose";

const plotSchema = new mongoose.Schema(
  {
    customId: {
      type: String,
      unique: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Parent project reference is required"],
      index: true,
    },
    projectCustomId: {
      type: Number,
      index: true,
    },
    plotNumber: {
      type: String,
      required: [true, "Plot number is required"],
    },
    size: {
      type: String,
      required: [true, "Plot size is required"],
    },
    facing: {
      type: String,
      required: [true, "Plot facing is required"],
    },
    price: {
      type: String,
      required: [true, "Plot price is required"],
    },
    status: {
      type: String,
      enum: ["Available", "Reserved", "Sold"],
      default: "Available",
      index: true,
    },
    image: {
      type: String,
      default: "",
    },
    images: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

// Guarantee unique plot numbers per project
plotSchema.index({ projectId: 1, plotNumber: 1 }, { unique: true });

export default mongoose.model("Plot", plotSchema);
