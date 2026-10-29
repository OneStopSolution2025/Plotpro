import jwt from "jsonwebtoken";
import { getJwtSecret, getJwtExpiresIn } from "../config/jwtConfig.js";

/**
 * Generate a signed JWT token containing userId, role, and optional approved deviceId.
 * Sensitive data such as password hashes are NEVER put into the token.
 * Secret comes from the central fail-closed configuration (Fix 3) — no fallback.
 */
export const generateToken = (userId, role, deviceId = null) => {
  const payload = {
    userId: String(userId),
    role,
  };

  if (deviceId) {
    payload.deviceId = String(deviceId);
  }

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getJwtExpiresIn(),
  });
};
