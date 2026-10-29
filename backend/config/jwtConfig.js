import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ─── Central JWT Configuration (Fix 3 — fail closed) ─────────────────────────
 *
 * Single source of truth for the JWT secret and expiry. EVERY signing and
 * verification site in the codebase obtains its secret via getJwtSecret().
 *
 * PATH SAFETY: dotenv is loaded here with an ABSOLUTE path derived from this
 * file's location — backend/.env — regardless of the process working
 * directory (this is NOT the cwd-relative default `dotenv.config()`).
 * The file itself is verified to exist and parse; if it does not provide a
 * valid JWT_SECRET, validation below fails closed. dotenv NEVER overrides
 * variables that are already set in the environment (platform-provided
 * values such as Railway's take precedence), and repeated calls are
 * idempotent.
 *
 * Validation happens at SIGN/VERIFY TIME (call-time), never at module-load
 * time — this avoids the ESM import-order trap where static imports are
 * evaluated before server.js's own dotenv.config() runs.
 */

const ENV_PATH = path.join(__dirname, "../.env");
dotenv.config({ path: ENV_PATH });

/** Minimum accepted secret length (characters). */
const MIN_SECRET_LENGTH = 32;

/**
 * Explicitly blacklisted secrets. These strings were committed to source
 * control at some point (repo history / backup snapshots) and are therefore
 * PUBLIC — a deployment using any of them is fully forgeable. Comparison is
 * case-insensitive. The values themselves are never logged or echoed.
 */
const KNOWN_INSECURE_SECRETS = new Set([
  "dreamcity_super_secret_jwt_key_2026_dev",
  "fallback_secret_key",
  "secret",
  "changeme",
  "change_me",
  "password",
  "jwt_secret",
  "your_jwt_secret_here",
]);

/**
 * Validate and return the configured JWT secret.
 * Throws (fails closed) — NEVER falls back to a default — when the secret is:
 *   - missing or empty (including whitespace-only)
 *   - shorter than MIN_SECRET_LENGTH characters
 *   - equal (case-insensitive) to a known-insecure committed value
 * Error messages contain NO secret material, only metadata.
 */
export const validateJwtSecret = () => {
  const raw = process.env.JWT_SECRET;

  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(
      "[FATAL SECURITY ERROR] JWT_SECRET is missing or empty. Refusing to operate. " +
        `Set a strong, random secret (>= ${MIN_SECRET_LENGTH} characters) in ` +
        "the environment (Railway) or backend/.env."
    );
  }

  const secret = raw.trim();

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[FATAL SECURITY ERROR] JWT_SECRET is too weak (length ${secret.length}, ` +
        `minimum ${MIN_SECRET_LENGTH}). Refusing to operate. ` +
        "Generate a fresh random secret (e.g. openssl rand -hex 32)."
    );
  }

  if (KNOWN_INSECURE_SECRETS.has(secret.toLowerCase())) {
    throw new Error(
      "[FATAL SECURITY ERROR] JWT_SECRET matches a known-insecure default that was " +
        "committed to source control (therefore public). Refusing to operate. " +
        "Generate a fresh, random secret and store it only in the environment."
    );
  }

  return secret;
};

/** Call-time validated secret accessor — use this at every sign/verify site. */
export const getJwtSecret = validateJwtSecret;

/**
 * Token expiry. Preserves existing behavior: JWT_EXPIRES_IN when set,
 * otherwise the historical default "7d".
 */
export const getJwtExpiresIn = () => {
  const value = process.env.JWT_EXPIRES_IN?.trim();
  return value || "7d";
};

/**
 * Startup assertion: call once from server.js so a bad configuration stops
 * the process at boot instead of at the first login attempt.
 * Logs ONLY non-sensitive metadata — never the secret itself.
 */
export const assertJwtConfigAtStartup = () => {
  const secret = validateJwtSecret();
  const expiresIn = getJwtExpiresIn();
  console.log(
    `[JWT CONFIG] JWT_SECRET validated OK (length: ${secret.length}). JWT_EXPIRES_IN: ${expiresIn}`
  );
  return { secretLength: secret.length, expiresIn };
};
