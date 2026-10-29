import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    subscriberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Subscriber ID is required"],
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: [true, "Plan ID is required"],
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "SUSPENDED", "TRIAL"],
      default: "ACTIVE",
      index: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      required: [true, "Expiry date is required"],
      index: true,
    },
    autoRenew: {
      type: Boolean,
      default: false,
    },
    // Effective seat limit for this subscriber (snapshot from plan or customized by Supreme Admin)
    assignedSeats: {
      type: Number,
      required: [true, "Assigned seats count is required"],
      min: [0, "Assigned seats cannot be negative"],
      default: 0,
    },
    // Effective project limit for this subscriber (snapshot from plan or customized by Supreme Admin)
    assignedProjects: {
      type: Number,
      min: [0, "Assigned projects cannot be negative"],
      default: 0,
    },
    // Atomic counter for active admin accounts belonging to this subscriber
    usedSeats: {
      type: Number,
      default: 0,
      min: [0, "Used seats cannot be negative"],
    },
    // High-water mark / lifetime assigned seats under this subscription period.
    // Once limit is reached, deleting an admin does not allow creating replacement admins to bypass the seat limit.
    lifetimeAssignedSeats: {
      type: Number,
      default: 0,
      min: [0, "Lifetime assigned seats cannot be negative"],
    },
    // Flag indicating if assignedSeats is a custom override granted by Supreme Admin
    isCustomOverride: {
      type: Boolean,
      default: false,
      index: true,
    },
    customOverrideReason: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helper method to compute authoritative effective seat limit
subscriptionSchema.methods.getEffectiveSeats = function () {
  if (this.isCustomOverride && typeof this.assignedSeats === "number") {
    return this.assignedSeats;
  }
  if (this.planId && typeof this.planId.maxAdminSeats === "number") {
    return this.planId.maxAdminSeats;
  }
  return typeof this.assignedSeats === "number" ? this.assignedSeats : 0;
};

// Helper method to compute authoritative effective project limit
subscriptionSchema.methods.getEffectiveProjects = function () {
  if (this.isCustomOverride && typeof this.assignedProjects === "number" && this.assignedProjects > 0) {
    return this.assignedProjects;
  }
  if (this.planId && typeof this.planId.maxProjects === "number") {
    return this.planId.maxProjects;
  }
  return typeof this.assignedProjects === "number" && this.assignedProjects > 0
    ? this.assignedProjects
    : 3;
};

// Virtual to check if subscription is dynamically active and not expired
subscriptionSchema.virtual("isCurrentlyValid").get(function () {
  return this.status === "ACTIVE" && new Date(this.expiryDate) > new Date();
});

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
export default Subscription;
