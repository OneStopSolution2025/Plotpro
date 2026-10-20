/**
 * Role-Based Authorization Middleware.
 * Usage: authorize("ADMIN"), authorize("SUPER_ADMIN"), authorize("ADMIN", "SUPER_ADMIN")
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to [${roles.join(", ")}]. Current role: ${req.user.role}`,
      });
    }

    next();
  };
};
