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
      default: "local",
    },
    authProviders: {
      type: [String],
      enum: ["local", "google"],
      default: ["local"],
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
      // Only applicable to staff admin roles (ADMIN, SUPER_ADMIN)
      required: false,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    // Branch assignment for staff admins ("Branch Admin" accounts).
    // null = legacy Admin account (unassigned) — keeps existing ownership rules.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: false,
      index: true,
    },
    businessName: {
      type: String,
      trim: true,
      required: false,
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

    // Password Reset OTP (populated only on an active password reset request)
    // Stored as HMAC-SHA256 hash — the plaintext OTP is NEVER persisted.
    resetOtpHash: {
      type: String,
      required: false,
      select: false,
    },
    // Random challenge ID binding the OTP to this specific reset request
    // (prevents cross-user / cross-challenge / cross-flow OTP reuse)
    resetOtpChallengeId: {
      type: String,
      required: false,
      select: false,
    },
    // Failed verification attempts for the active challenge (max 5, then invalidated)
    resetOtpAttempts: {
      type: Number,
      required: false,
      select: false,
    },
    // True after successful OTP verification; consumed atomically by reset-password
    resetOtpVerified: {
      type: Boolean,
      required: false,
      select: false,
    },
    // Cooldown timestamp preventing email bombing via repeated reset requests
    resetOtpCooldownUntil: {
      type: Date,
      required: false,
      select: false,
    },
    resetOtpExpiry: {
      type: Date,
      required: false,
      select: false,
    },

    // First-Device Bootstrap OTP (populated only for administrative roles during enrollment)
    deviceEnrollmentChallengeId: {
      type: String,
      required: false,
      select: false,
    },
    deviceEnrollmentOtpHash: {
      type: String,
      required: false,
      select: false,
    },
    deviceEnrollmentOtpExpiry: {
      type: Date,
      required: false,
      select: false,
    },
    deviceEnrollmentAttempts: {
      type: Number,
      required: false,
      select: false,
    },
    deviceEnrollmentCooldownUntil: {
      type: Date,
      required: false,
      select: false,
    },

    // Login lockout (Fix 2): consecutive failed password attempt counter +
    // temporary lock timestamp. Mutated ONLY via atomic updates in
    // authController.loginUser (no stale-read bypass possible).
    loginFailedAttempts: {
      type: Number,
      required: false,
      select: false,
    },
    loginLockedUntil: {
      type: Date,
      required: false,
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
