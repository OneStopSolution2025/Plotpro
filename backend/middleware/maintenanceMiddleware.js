import PlatformSettings from "../models/PlatformSettings.js";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * Middleware to enforce platform maintenance mode and registration restrictions.
 * If maintenance mode is ON:
 * - Public routes are blocked with HTTP 503 Service Unavailable.
 * - Platform Owner (SUPREME_ADMIN) and Admins can still access the platform.
 */
export const checkMaintenanceMode = async (req, res, next) => {
  try {
    const settings = await PlatformSettings.findOne({});
    if (!settings || !settings.maintenanceMode) {
      return next();
    }

    // Check if user has an active SUPREME_ADMIN or SUPER_ADMIN/ADMIN token to bypass maintenance
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
      try {
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "dreamcity_super_secret_jwt_key_2026_dev"
        );
        const user = await User.findById(decoded.userId).select("role status");
        if (user && ["SUPREME_ADMIN", "SUPER_ADMIN", "ADMIN"].includes(user.role)) {
          // Staff and owners can bypass maintenance mode to work on the platform
          return next();
        }
      } catch (e) {
        // Token invalid, treat as public user
      }
    }

    return res.status(503).json({
      success: false,
      maintenance: true,
      message: `${settings.platformName || "PlotPro"} is currently undergoing scheduled maintenance. Public access is temporarily restricted.`,
    });
  } catch (error) {
    next(error);
  }
};
