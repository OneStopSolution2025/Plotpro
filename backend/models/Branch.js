import mongoose from "mongoose";

/**
 * Branch — a regional office under a Super Admin (retailer) tenant.
 *
 * Tenant isolation:
 *   `tenantId` always stores the owning SUPER_ADMIN's `_id`. It is NEVER
 *   accepted from the client — controllers derive it from the authenticated
 *   Super Admin (`req.user._id`).
 *
 * Branch Admin:
 *   `branchAdmin` references the tenant staff account (role: "ADMIN") that
 *   manages this branch. Legacy ADMIN accounts (branchId: null) are
 *   unaffected and keep their existing ownership-based access rules.
 */
const branchSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Tenant (Super Admin) ID is required"],
      index: true,
    },
    branchAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Branch Admin reference is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Branch name is required"],
      trim: true,
      maxLength: [100, "Branch name cannot exceed 100 characters"],
    },
    city: {
      type: String,
      required: [true, "Branch city is required"],
      trim: true,
      maxLength: [100, "Branch city cannot exceed 100 characters"],
    },
    region: {
      type: String,
      default: "",
      trim: true,
      maxLength: [100, "Region cannot exceed 100 characters"],
    },
    address: {
      type: String,
      default: "",
      trim: true,
      maxLength: [300, "Address cannot exceed 300 characters"],
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxLength: [500, "Notes cannot exceed 500 characters"],
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * A branch name must be unique within its tenant. Uniqueness across tenants
 * is intentionally allowed (two retailers can both have "Anna Nagar Branch").
 */
branchSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const Branch =
  mongoose.models.Branch || mongoose.model("Branch", branchSchema);
export default Branch;
