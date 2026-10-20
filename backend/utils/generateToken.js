import jwt from "jsonwebtoken";

/**
 * Generate a signed JWT token containing userId and role.
 * Sensitive data such as password hashes are NEVER put into the token.
 */
export const generateToken = (userId, role) => {
  return jwt.sign(
    { userId: String(userId), role },
    process.env.JWT_SECRET || "dreamcity_super_secret_jwt_key_2026_dev",
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
};
