import rateLimit from "express-rate-limit";

/**
 * ─── Server-Side IP Rate Limiting (Defense in Depth) ─────────────────────────
 *
 * DEPLOYMENT CONSTRAINT (IMPORTANT — READ BEFORE SCALING):
 * express-rate-limit uses an in-memory store by default, which is PER-INSTANCE.
 * PlotPro must therefore run as a SINGLE Railway instance for these limits to
 * be globally accurate. If horizontal scaling is ever introduced, configure a
 * shared store — e.g. `rate-limit-redis` with `RedisStore` (Redis / Upstash) —
 * otherwise each replica gets its own independent bucket and the effective
 * limit multiplies by the replica count.
 *
 * Regardless of instance count, the following DATABASE-BACKED defenses remain
 * the authoritative per-account protections (they are instance-independent):
 *   - Device OTP: 60s per-user resend cooldown + 5-attempt challenge cap
 *     (User.deviceEnrollment* fields, atomic consumption in deviceAuthController)
 *   - Password reset: 60s resend cooldown + 5-attempt challenge cap
 *     (User.resetOtp* fields, CAS consumption in authController)
 *   - Login: 5 consecutive failures → 15-minute account lock
 *     (User.loginFailedAttempts / loginLockedUntil, atomic pipeline update —
 *     no stale-read bypass possible)
 *
 * CLIENT-IP SAFETY (Railway):
 * server.js sets `app.set("trust proxy", 1)` — exactly ONE trusted reverse-
 * proxy hop (Railway's TLS terminator). Client IPs are derived from the
 * X-Forwarded-For chain ONLY up to that hop; spoofed forwarded headers from
 * clients beyond it are ignored. Do NOT change this to `true` (any chain
 * becomes spoofable) — see express-rate-limit docs on proxy trust.
 */

const baseOptions = {
  standardHeaders: true,   // Return RateLimit-* headers
  legacyHeaders: false,    // Disable X-RateLimit-* headers
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
};

// ─── Fix 1: Password-Reset Flow (preserved — do not duplicate elsewhere) ─────

// POST /api/auth/forgot-password — prevents email bombing / OTP request spam
export const forgotPasswordLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 5,
});

// POST /api/auth/verify-otp — caps OTP guessing from any single IP
export const verifyOtpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

// POST /api/auth/reset-password — caps reset attempts from any single IP
export const resetPasswordLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

// ─── Fix 2: Authentication Endpoints ──────────────────────────────────────────

// POST /api/auth/login — brute-force cap.
// Only FAILED login attempts count toward the limit (skipSuccessfulRequests),
// so a shared office IP is never locked out by legitimate successful logins,
// while password-guessing is still cut off at 5 failures / 15 min / IP.
// NOTE: /auth/google deliberately does NOT share this bucket — Google login has
// no password-guess vector; it gets its own lighter limiter below.
export const loginLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
});

// POST /api/auth/google — alternate login vector. No password guessing, but an
// unrecognized-workstation ADMIN login here dispatches a device-enrollment OTP
// email, so this endpoint gets its own (lighter-touch) bucket to cap possible
// email-dispatch abuse without disturbing normal Google sign-in flows.
export const googleAuthLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

// POST /api/auth/register — public account creation (spam/abuse cap)
export const registerLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 3,
});

// ─── Fix 2: Device Authentication Endpoints ───────────────────────────────────

// POST /api/auth/device/resend-enrollment-otp — caps OTP re-dispatch per IP.
// (Per-USER 60s cooldown + 5-attempt challenge cap remain DB-backed upstream.)
export const deviceResendLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 3,
});

// POST /api/auth/device/verify-otp (+ /device/enroll-first-device alias) —
// caps code guessing per IP on top of the DB-backed 5-attempt challenge cap.
export const deviceVerifyLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 5,
});

// GET /api/auth/device/request-status + POST /api/auth/device/claim-approved-
// session — session-establishment endpoints, capped per IP.
export const deviceSessionLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 5,
});

// ─── Fix 2: Public Lead Forms (SEPARATE buckets per form) ─────────────────────

// POST /api/public/enquiries — public enquiry/contact submissions
export const enquiryLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 3,
});

// POST /api/public/site-visits — public site-visit bookings
export const siteVisitLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 3,
});

// ─── Fix 2: Retailer (Super Admin) Signup Requests ────────────────────────────

// POST /api/auth/retailer/request — public business-signup request submissions
export const retailerRequestLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 3,
});
