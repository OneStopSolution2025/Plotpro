import mongoose from "mongoose";

const unknownUserDataSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      index: true,
    },
    fullName: {
      type: String,
      default: "",
      trim: true,
    },
    mobile: {
      type: String,
      default: "",
      trim: true,
    },
    formType: {
      type: String,
      enum: ["ENQUIRY", "SITE_VISIT"],
      required: true,
      index: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    plot: {
      type: String,
      default: "",
    },
    formData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("UnknownUserData", unknownUserDataSchema);
