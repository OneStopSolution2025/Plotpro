import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import TrustedDevice from "../models/TrustedDevice.js";

/**
 * Authentication Middleware.
 * Validates Bearer JWT from Authorization header and verifies user status.
 */
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      // Verify token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "dreamcity_super_secret_jwt_key_2026_dev"
      );

      // Fetch user without password
      const user = await User.findById(decoded.userId).select("-passwordHash");

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found or token invalid.",
        });
      }

      // Check if account has been deactivated
      if (user.status === "INACTIVE") {
        const msg =
          user.role === "SUPER_ADMIN"
            ? "Your business subscriber account has been suspended. Please contact platform administration."
            : "Your account has been deactivated. Please contact your administrator.";
        return res.status(403).json({
          success: false,
          message: msg,
        });
      }

      // If user is SUPER_ADMIN, check subscription status for suspension
      if (user.role === "SUPER_ADMIN") {
        const sub = await Subscription.findOne({ subscriberId: user._id });
        if (sub && sub.status === "SUSPENDED") {
          return res.status(403).json({
            success: false,
            message: "Your subscription has been suspended by the platform administrator. Access blocked.",
          });
        }
      }

      // If user is a staff ADMIN, also check parent subscriber and subscription
      if (user.role === "ADMIN" && user.tenantId) {
        const parentSubscriber = await User.findById(user.tenantId).select("status");
        if (parentSubscriber && parentSubscriber.status === "INACTIVE") {
          return res.status(403).json({
            success: false,
            message: "Your organization account has been suspended. Access temporarily paused.",
          });
        }

        const parentSub = await Subscription.findOne({ subscriberId: user.tenantId });
        if (parentSub && parentSub.status === "SUSPENDED") {
          return res.status(403).json({
            success: false,
            message: "Your organization's subscription has been suspended. Access temporarily paused.",
          });
        }
      }

      // ─── Trusted Device Verification for Administrative Roles ────────────────
      // Applies strictly to SUPER_ADMIN and ADMIN. USER and SUPREME_ADMIN are exempt.
      if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
        const deviceId = decoded.deviceId;
        if (!deviceId) {
          return res.status(401).json({
            success: false,
            deviceRevoked: true,
            message: "Access blocked: This administrative session is not bound to a trusted device.",
          });
        }

        const approvedDevice = await TrustedDevice.findOne({
          _id: deviceId,
          userId: user._id,
          status: "APPROVED",
        });

        if (!approvedDevice) {
          return res.status(401).json({
            success: false,
            deviceRevoked: true,
            message:
              "Access blocked: This device's authorization has been revoked or replaced by another approved device.",
          });
        }

        if (!approvedDevice.isCurrentSession) {
          return res.status(401).json({
            success: false,
            deviceRevoked: true,
            message:
              "Session expired or logged out. Please log in again to activate this workstation session.",
          });
        }

        req.trustedDevice = approvedDevice;
      }

      req.user = user;
      return next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. Token failed or expired.",
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. No authentication token provided.",
    });
  }
};
