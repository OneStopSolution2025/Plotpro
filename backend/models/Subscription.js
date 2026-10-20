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
      min: [1, "Assigned seats must be at least 1"],
      default: 3,
    },
    // Atomic counter for active admin accounts belonging to this subscriber
    usedSeats: {
      type: Number,
      default: 0,
      min: [0, "Used seats cannot be negative"],
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
  if (this.isCustomOverride) {
    return this.assignedSeats;
  }
  if (this.planId && this.planId.maxAdminSeats) {
    return this.planId.maxAdminSeats;
  }
  return this.assignedSeats;
};

// Virtual to check if subscription is dynamically active and not expired
subscriptionSchema.virtual("isCurrentlyValid").get(function () {
  return this.status === "ACTIVE" && new Date(this.expiryDate) > new Date();
});

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
export default Subscription;
