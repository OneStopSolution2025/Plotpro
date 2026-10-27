import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    passwordHash: {
      type: String,
      required: false, // Optional for OAuth accounts (e.g., Google)
      select: false, // Never return password hash in queries unless explicitly selected
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["USER", "ADMIN", "SUPER_ADMIN", "SUPREME_ADMIN"],
      default: "USER",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    deactivatedBySupreme: {
      type: Boolean,
      default: false,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Branch assignment for staff admins ("Branch Admin" accounts).
    // null = legacy Admin account (unassigned) — keeps existing ownership rules.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    businessName: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    savedProjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project",
      },
    ],
    savedPlots: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Plot",
      },
    ],

    // Password Reset OTP
    resetOtp: {
      type: String,
      default: null,
      select: false,
    },
    resetOtpExpiry: {
      type: Date,
      default: null,
      select: false,
    },

    // First-Device Bootstrap OTP (HMAC-SHA256 with DEVICE_OTP_SECRET)
    deviceEnrollmentChallengeId: {
      type: String,
      default: null,
      select: false,
    },
    deviceEnrollmentOtpHash: {
      type: String,
      default: null,
      select: false,
    },
    deviceEnrollmentOtpExpiry: {
      type: Date,
      default: null,
      select: false,
    },
    deviceEnrollmentAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    deviceEnrollmentCooldownUntil: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Compare plain-text password with stored bcrypt hash.
 * Safely returns false if the user account has no passwordHash (e.g. Google OAuth only).
 */
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.passwordHash) return false;
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

export default mongoose.model("User", userSchema);
