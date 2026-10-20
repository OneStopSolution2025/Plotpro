import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

/**
 * Middleware to ensure the tenant's workspace subscription is active.
 * Applied to staff ADMIN write operations (creating/editing/deleting projects & plots).
 */
export const requireActiveSubscription = async (req, res, next) => {
  try {
    // If not admin, skip or let role middleware handle
    if (!req.user || req.user.role !== "ADMIN") {
      return next();
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      // If no tenantId is assigned, allow or proceed safely
      return next();
    }

    const sub = await Subscription.findOne({ subscriberId: tenantId });
    if (!sub) {
      return next();
    }

    const isDateExpired = Boolean(sub.expiryDate && new Date(sub.expiryDate) <= new Date());
    const isExpired = sub.status === "EXPIRED" || isDateExpired;

    if (isExpired) {
      return res.status(403).json({
        success: false,
        isSubscriptionExpired: true,
        message:
          "Your organization's workspace subscription has expired. Creating or modifying projects, plots, and leads is temporarily restricted. Please contact your Super Administrator.",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
