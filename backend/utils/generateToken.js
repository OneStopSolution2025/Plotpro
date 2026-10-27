import jwt from "jsonwebtoken";

/**
 * Generate a signed JWT token containing userId, role, and optional approved deviceId.
 * Sensitive data such as password hashes are NEVER put into the token.
 */
export const generateToken = (userId, role, deviceId = null) => {
  const payload = {
    userId: String(userId),
    role,
  };

  if (deviceId) {
    payload.deviceId = String(deviceId);
  }

  return jwt.sign(
    payload,
    process.env.JWT_SECRET || "dreamcity_super_secret_jwt_key_2026_dev",
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
};
