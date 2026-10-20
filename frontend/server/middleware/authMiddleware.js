import jwt from "jsonwebtoken";
import User from "../models/User.js";

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
        return res.status(403).json({
          success: false,
          message: "Your account has been deactivated. Please contact Supreme Administrator.",
        });
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
