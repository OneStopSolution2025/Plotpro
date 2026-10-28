import crypto from "crypto";
import { validateOtpSecretConfig } from "./otpSecurity.js";

/**
 * Generate a 256-bit cryptographically secure device secret string.
 */
export const generateDeviceSecret = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Compute an HMAC-SHA256 hash of the raw device secret using the dedicated DEVICE_OTP_SECRET.
 * The raw secret is never persisted to the database.
 */
export const hashDeviceSecret = (rawSecret) => {
  if (!rawSecret || typeof rawSecret !== "string") {
    throw new Error("Invalid raw device secret provided for hashing.");
  }
  const secret = validateOtpSecretConfig();
  return crypto.createHmac("sha256", secret).update(rawSecret.trim()).digest("hex");
};

/**
 * Timing-safe comparison to verify an incoming raw device secret against a stored HMAC hash.
 */
export const verifyDeviceSecret = (rawSecret, storedHash) => {
  if (!rawSecret || !storedHash || typeof rawSecret !== "string" || typeof storedHash !== "string") {
    return false;
  }
  try {
    const computedHash = hashDeviceSecret(rawSecret);
    const computedBuf = Buffer.from(computedHash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");

    if (computedBuf.length !== storedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  } catch {
    return false;
  }
};

/**
 * Get environment-tailored cookie configuration.
 * In production: SameSite=None, Secure=true (supports cross-subdomain / cross-origin HTTPS deployments like Railway).
 * In development: SameSite=Lax, Secure=false (permits localhost cookie persistence between frontend:5173 and backend:5000).
 */
export const getDeviceCookieOptions = () => {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    path: "/api",
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
  };
};

/**
 * Set the HttpOnly device credential cookie on the response.
 */
export const setDeviceCookie = (res, rawSecret) => {
  res.cookie("plotpro_device_cred", rawSecret, getDeviceCookieOptions());
};

/**
 * Clear the HttpOnly device credential cookie from the response.
 */
export const clearDeviceCookie = (res) => {
  const opts = getDeviceCookieOptions();
  delete opts.maxAge;
  res.clearCookie("plotpro_device_cred", opts);
};
