import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Returns the configured base directory for uploaded assets.
 * In development / test, defaults to `backend/uploads`.
 * In production, requires `process.env.UPLOAD_DIR`.
 */
export function getUploadDir() {
  const customDir = process.env.UPLOAD_DIR?.trim();
  if (customDir) {
    return path.resolve(customDir);
  }
  return path.resolve(__dirname, "../uploads");
}

/**
 * Returns the layout images directory inside the upload root.
 */
export function getLayoutsDir() {
  return path.join(getUploadDir(), "layouts");
}

/**
 * Returns the retailer/payment proof images directory inside the upload root.
 */
export function getProofsDir() {
  return path.join(getUploadDir(), "proofs");
}

/**
 * Returns the temp directory inside the upload root.
 */
export function getTempDir() {
  return path.join(getUploadDir(), "temp");
}

/**
 * Resolves a subPath safely within the upload root, strictly preventing path traversal.
 *
 * @param {string} subPath - relative path inside the upload root
 * @returns {string} absolute resolved path
 * @throws {Error} if path escapes the upload root or contains illegal components
 */
export function resolveStoragePath(subPath) {
  if (typeof subPath !== "string" || !subPath.trim()) {
    throw new Error("Invalid subPath provided to resolveStoragePath");
  }

  const base = path.resolve(getUploadDir());
  // Normalize and prevent null bytes or suspicious characters
  const cleanSubPath = subPath.replace(/\0/g, "");
  const resolved = path.resolve(base, cleanSubPath);

  // Strict check: resolved path must start with base + path.sep (or equal base)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Path traversal attempt detected: ${subPath}`);
  }

  return resolved;
}

/**
 * Initializes and verifies persistent storage.
 * 1. Resolves UPLOAD_DIR.
 * 2. Checks production requirement (UPLOAD_DIR must be explicitly defined).
 * 3. Creates upload root, layouts/, proofs/, and temp/ subdirectories.
 * 4. Verifies real write capability using a write-read-delete probe file.
 * 5. Fails closed with an explicit error in production.
 */
export function initStorage() {
  const isProd = process.env.NODE_ENV === "production";
  const customDir = process.env.UPLOAD_DIR?.trim();

  if (isProd && !customDir) {
    const errorMsg =
      "[StorageConfig] Fatal: UPLOAD_DIR environment variable is missing in production! " +
      "Refusing to start with ephemeral storage. Attach a Railway Volume and set UPLOAD_DIR (e.g. /app/uploads).";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const uploadDir = getUploadDir();
  const subDirs = [uploadDir, getLayoutsDir(), getProofsDir(), getTempDir()];

  try {
    for (const dir of subDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // Verify write permissions with an active probe file
    const probeFile = path.join(getTempDir(), `.probe_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.tmp`);
    fs.writeFileSync(probeFile, "probe", "utf8");
    fs.unlinkSync(probeFile);

    const modeLabel = isProd ? "Production Persistent Volume" : "Local Development Storage";
    console.log(`[StorageConfig] Initialized ${modeLabel} at: ${uploadDir}`);
    return {
      success: true,
      uploadDir,
      layoutsDir: getLayoutsDir(),
      proofsDir: getProofsDir(),
      tempDir: getTempDir(),
      isProduction: isProd,
    };
  } catch (err) {
    const fatalMsg = `[StorageConfig] Fatal: Storage directory ${uploadDir} is not writable or cannot be initialized: ${err.message}`;
    console.error(fatalMsg);
    if (isProd) {
      throw new Error(fatalMsg);
    }
    // In development, also rethrow so developer knows permissions are broken
    throw err;
  }
}
