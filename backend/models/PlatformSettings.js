import mongoose from "mongoose";

const platformSettingsSchema = new mongoose.Schema(
  {
    platformName: {
      type: String,
      default: "PlotPro",
      trim: true,
    },
    supportEmail: {
      type: String,
      default: "support@plotpro.in",
      trim: true,
    },
    supportPhone: {
      type: String,
      default: "+91 99999 00000",
      trim: true,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    allowSelfRegistration: {
      type: Boolean,
      default: true,
    },
    defaultTrialDays: {
      type: Number,
      default: 14,
    },
  },
  {
    timestamps: true,
  }
);

const PlatformSettings =
  mongoose.models.PlatformSettings || mongoose.model("PlatformSettings", platformSettingsSchema);
export default PlatformSettings;
