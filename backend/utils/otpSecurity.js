import crypto from "crypto";

/**
 * Validates that the dedicated DEVICE_OTP_SECRET is defined and strong.
 * Fails closed without falling back to JWT_SECRET.
 */
export const validateOtpSecretConfig = () => {
  const secret = process.env.DEVICE_OTP_SECRET;
  if (!secret || typeof secret !== "string" || secret.trim().length < 32) {
    const errorMsg =
      "[FATAL SECURITY ERROR] DEVICE_OTP_SECRET is missing or insufficiently configured. Refusing to operate.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  return secret.trim();
};

/**
 * Generates a uniform cryptographically random 6-digit OTP string.
 * Uses Node.js crypto.randomInt(100000, 1000000) with the correct exclusive upper bound.
 */
export const generateSecureOtp = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

/**
 * Computes HMAC-SHA256 hash using the dedicated DEVICE_OTP_SECRET.
 * Binds optionally with a challengeId to prevent cross-challenge or superseded code reuse.
 */
export const hashOtp = (otp, challengeId = "") => {
  const secret = validateOtpSecretConfig();
  const payload = `${String(otp).trim()}:${challengeId}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
};

/**
 * Verifies OTP against stored hash using constant-time comparison to prevent timing attacks.
 */
export const verifyOtpHash = (providedOtp, storedHash, challengeId = "") => {
  if (!providedOtp || !storedHash) return false;
  try {
    const computed = hashOtp(providedOtp, challengeId);
    const computedBuf = Buffer.from(computed, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    if (computedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  } catch {
    return false;
  }
};
