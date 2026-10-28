import mongoose from "mongoose";

/**
 * Super Admin (Retailer) signup request.
 *
 * A separate collection from `User` on purpose:
 * - Pending applicants are NOT users, therefore they cannot log in,
 *   cannot receive tokens and cannot touch tenant/admin APIs.
 * - Only upon explicit Supreme Admin approval is a real User
 *   (SUPER_ADMIN role) provisioned together with its Subscription
 *   (plan entitlements / admin-seat limits) live.
 *
 * Package data is denormalized here purely as an audit snapshot.
 * The authoritative pricing/seats always come from the `Plan` document
 * at approval time — client-supplied prices are never trusted.
 */
const retailerRequestSchema = new mongoose.Schema(
  {
    // ── Applicant identity ──────────────────────────────────────────
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
      index: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    businessName: {
      type: String,
      required: [true, "Business name is required"],
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false,
    },

    // ── Chosen package (audit snapshot; authority = Plan document) ──
    requestedPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: [true, "Selected package (plan) is required"],
    },
    planSnapshot: {
      name: { type: String, default: "" },
      price: { type: Number, default: 0 },
      currency: { type: String, default: "INR" },
      billingInterval: { type: String, default: "MONTHLY" },
      durationDays: { type: Number, default: 30 },
      maxAdminSeats: { type: Number, default: 3 },
      isUnlimitedSeats: { type: Boolean, default: false },
      features: [{ type: String }],
    },

    // ── Payment details (declared by applicant; NOT auto-verified) ──
    payment: {
      method: {
        type: String,
        enum: ["UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"],
      },
      transactionId: {
        type: String,
        trim: true,
        default: "",
      },
      amount: {
        type: Number,
        default: 0,
        min: [0, "Declared amount cannot be negative"],
      },
      currency: {
        type: String,
        default: "INR",
        uppercase: true,
        trim: true,
      },
      paidOn: {
        type: Date,
        default: null,
      },
      // Cloudinary proof screenshot (URL is evidence only — never proof of payment)
      proofUrl: { type: String, default: "" },
      proofPublicId: { type: String, default: "" },
      notes: { type: String, trim: true, default: "" },
      // Explicit Supreme-Admin verification flag. Starts false.
      // Uploading a proof image does NOT flip this.
      verified: { type: Boolean, default: false },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      verifiedAt: { type: Date, default: null },
      verificationNote: { type: String, trim: true, default: "" },
    },

    // ── Business Verification Details (Replaces generic KYC) ───────
    businessVerification: {
      businessType: {
        type: String,
        enum: [
          "SOLE_PROPRIETOR",
          "PARTNERSHIP",
          "LLP",
          "PVT_LTD",
          "PUBLIC_LTD",
          "OTHER",
        ],
        required: [true, "Business type is required"],
      },
      applicantRole: {
        type: String,
        enum: ["OWNER_PROPRIETOR", "PARTNER", "DIRECTOR", "AUTHORIZED_REPRESENTATIVE"],
        required: [true, "Applicant role is required"],
      },
      applicantLegalName: {
        type: String,
        required: [true, "Applicant full legal name is required"],
        trim: true,
      },
      // PAN details (mandatory for all legal entities)
      panNumber: {
        type: String,
        required: [true, "PAN number is required"],
        trim: true,
        uppercase: true,
      },
      panDocKey: {
        type: String,
        default: "",
      },
      panDocName: {
        type: String,
        default: "",
      },

      // GST details (optional / conditional if registered)
      hasGst: {
        type: Boolean,
        default: false,
      },
      gstin: {
        type: String,
        trim: true,
        uppercase: true,
        default: "",
      },
      gstDocKey: {
        type: String,
        default: "",
      },
      gstDocName: {
        type: String,
        default: "",
      },

      // Company / LLP details (mandatory for LLP, PVT_LTD, PUBLIC_LTD)
      registrationNumber: {
        type: String, // CIN or LLPIN
        trim: true,
        uppercase: true,
        default: "",
      },
      registrationDocKey: {
        type: String, // Certificate of Incorporation
        default: "",
      },
      registrationDocName: {
        type: String,
        default: "",
      },

      // Authorization letter (required when applicant is an AUTHORIZED_REPRESENTATIVE)
      authLetterDocKey: {
        type: String,
        default: "",
      },
      authLetterDocName: {
        type: String,
        default: "",
      },
    },

    // ── Legacy identity details (maintained for backwards compatibility with existing documents) ──
    identity: {
      idType: {
        type: String,
        default: null,
      },
      idNumber: {
        type: String,
        trim: true,
        default: null,
      },
    },

    // ── Review workflow ─────────────────────────────────────────────
    status: {
      type: String,
      enum: ["PENDING_REVIEW", "PENDING", "APPROVED", "REJECTED", "INFO_REQUESTED"],
      default: "PENDING_REVIEW",
      index: true,
    },
    reviewNote: { type: String, trim: true, default: "" },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },

    // Audit History tracking all reviewer actions and applicant responses
    auditHistory: [
      {
        action: {
          type: String,
          enum: [
            "SUBMITTED",
            "INFO_REQUESTED",
            "INFO_SUBMITTED",
            "APPROVED",
            "REJECTED",
            "PAYMENT_VERIFIED",
          ],
          required: true,
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
        reason: {
          type: String,
          trim: true,
          default: "",
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Idempotency / provisioning audit
    provisionedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    provisionedSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },

    // Trapping transient provisioning errors so retries can be diagnosed
    provisioningError: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

retailerRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("SuperAdminRequest", retailerRequestSchema);
