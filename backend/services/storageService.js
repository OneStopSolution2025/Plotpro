import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import { sanitizeSvg } from "../utils/sanitizeSvg.js";
import {
  getUploadDir,
  getLayoutsDir,
  getProofsDir,
  resolveStoragePath,
} from "../config/storageConfig.js";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB limit aligned with express body limit

/**
 * Validates base64 data and extracts pure base64 payload.
 */
function parseAndValidateBase64(fileData, maxBytes = MAX_FILE_SIZE_BYTES) {
  if (typeof fileData !== "string" || !fileData.trim()) {
    const err = new Error("File data is required and must be a valid string.");
    err.statusCode = 400;
    throw err;
  }

  // Check data URI header or raw base64
  const matches = fileData.match(/^data:([^;]+);base64,(.+)$/);
  const base64Str = matches ? matches[2] : fileData.replace(/^data:[^;]+;base64,/, "");

  // Basic base64 character validation
  if (!/^[A-Za-z0-9+/=]+$/.test(base64Str.replace(/\s+/g, ""))) {
    const err = new Error("Invalid base64 encoding provided.");
    err.statusCode = 400;
    throw err;
  }

  const buffer = Buffer.from(base64Str, "base64");
  if (buffer.length === 0) {
    const err = new Error("Uploaded file is empty.");
    err.statusCode = 400;
    throw err;
  }

  if (buffer.length > maxBytes) {
    const err = new Error(
      `File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit (${(
        maxBytes /
        (1024 * 1024)
      ).toFixed(0)} MB).`
    );
    err.statusCode = 413;
    throw err;
  }

  return { buffer, detectedMime: matches ? matches[1].toLowerCase() : null };
}

/**
 * Determines safe file extension from mime type.
 */
function getExtensionForMime(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("svg")) return "svg";
  return "bin";
}

/**
 * Storage Service supporting both Cloudinary and Persistent Volume / Local Disk storage.
 */
class StorageService {
  constructor() {
    this.provider = "volume";
    this._cloudinaryInitialized = false;
  }

  /**
   * Check if Cloudinary credentials are fully configured in process.env.
   */
  isConfigured() {
    const hasUrl = Boolean(process.env.CLOUDINARY_URL);
    const hasParts = Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );
    return hasUrl || hasParts;
  }

  /**
   * Initializes Cloudinary configuration from environment variables if present.
   */
  initCloudinary() {
    if (!this.isConfigured()) {
      return false;
    }

    if (!this._cloudinaryInitialized) {
      if (process.env.CLOUDINARY_URL) {
        cloudinary.config({
          cloudinary_url: process.env.CLOUDINARY_URL,
        });
      } else {
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
          secure: true,
        });
      }
      this._cloudinaryInitialized = true;
    }
    return true;
  }

  /**
   * Returns current active storage provider name ("volume" in prod/custom UPLOAD_DIR, "local" in dev).
   */
  getActiveProvider() {
    return process.env.NODE_ENV === "production" || process.env.UPLOAD_DIR ? "volume" : "local";
  }

  /**
   * Saves a layout image to Persistent Volume storage (or local disk in dev).
   *
   * @param {Object} options
   * @param {string} options.fileData - Base64 Data URI or raw base64 string
   * @param {string} options.mimeType - MIME type
   * @param {string} options.projectId - Project ID
   */
  async saveLocally({ fileData, mimeType, projectId }) {
    const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    const normalizedMime = String(mimeType || "").toLowerCase();

    if (!allowedMimes.includes(normalizedMime)) {
      const err = new Error(
        `Invalid file format: ${mimeType}. Allowed formats are PNG, JPEG, WebP, and SVG.`
      );
      err.statusCode = 400;
      throw err;
    }

    let { buffer } = parseAndValidateBase64(fileData);

    // Sanitize SVG if applicable
    if (normalizedMime === "image/svg+xml") {
      let rawSvg = fileData;
      if (fileData.startsWith("data:image/svg+xml;base64,")) {
        const base64Content = fileData.replace(/^data:image\/svg\+xml;base64,/, "");
        rawSvg = Buffer.from(base64Content, "base64").toString("utf-8");
      } else if (fileData.startsWith("data:image/svg+xml;utf8,")) {
        rawSvg = decodeURIComponent(fileData.replace(/^data:image\/svg\+xml;utf8,/, ""));
      } else {
        rawSvg = buffer.toString("utf-8");
      }

      const sanitizedSvg = sanitizeSvg(rawSvg);
      buffer = Buffer.from(sanitizedSvg, "utf-8");
    }

    const cleanProjectId = String(projectId || "project").replace(/[^a-zA-Z0-9_-]/g, "") || "project";
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const ext = getExtensionForMime(normalizedMime);
    const filename = `layout_${cleanProjectId}_${timestamp}_${randomSuffix}.${ext}`;

    const layoutsDir = getLayoutsDir();
    if (!fs.existsSync(layoutsDir)) {
      fs.mkdirSync(layoutsDir, { recursive: true });
    }

    const targetPath = resolveStoragePath(path.join("layouts", filename));
    fs.writeFileSync(targetPath, buffer);

    const serverUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const imageUrl = `${serverUrl}/uploads/layouts/${filename}`;
    const provider = this.getActiveProvider();

    return {
      success: true,
      provider,
      imageUrl,
      publicId: filename,
      format: ext,
      width: 1200,
      height: 800,
      bytes: buffer.length,
    };
  }

  /**
   * Upload layout image. Prioritizes persistent volume / local storage, or Cloudinary if configured.
   */
  async uploadLayoutImage({ fileData, mimeType, projectId, tenantId }) {
    // If Cloudinary is configured and explicitly preferred, we can use it.
    // However, if Cloudinary returns 403 or is not configured, or persistent volume is preferred,
    // write safely to the persistent volume.
    if (this.isConfigured() && process.env.PREFER_CLOUDINARY === "true") {
      try {
        this.initCloudinary();
        const allowedMimes = [
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/webp",
          "image/svg+xml",
        ];

        if (!mimeType || !allowedMimes.includes(mimeType.toLowerCase())) {
          const err = new Error(
            `Invalid file format: ${mimeType}. Allowed formats are PNG, JPEG, WebP, and SVG.`
          );
          err.statusCode = 400;
          throw err;
        }

        let uploadPayload = fileData;
        if (mimeType.toLowerCase() === "image/svg+xml") {
          let rawSvg = fileData;
          if (fileData.startsWith("data:image/svg+xml;base64,")) {
            const base64Content = fileData.replace(/^data:image\/svg\+xml;base64,/, "");
            rawSvg = Buffer.from(base64Content, "base64").toString("utf-8");
          } else if (fileData.startsWith("data:image/svg+xml;utf8,")) {
            rawSvg = decodeURIComponent(fileData.replace(/^data:image\/svg\+xml;utf8,/, ""));
          }
          const sanitizedSvg = sanitizeSvg(rawSvg);
          const safeBase64 = Buffer.from(sanitizedSvg, "utf-8").toString("base64");
          uploadPayload = `data:image/svg+xml;base64,${safeBase64}`;
        }

        const cleanProjectId = String(projectId).replace(/[^a-zA-Z0-9_-]/g, "");
        const cleanTenantId = tenantId ? String(tenantId).replace(/[^a-zA-Z0-9_-]/g, "") : "common";
        const timestamp = Date.now();
        const folder = `plotpro/${cleanTenantId}/projects/${cleanProjectId}`;
        const publicId = `layout_${cleanProjectId}_${timestamp}`;

        const result = await cloudinary.uploader.upload(uploadPayload, {
          folder,
          public_id: publicId,
          resource_type: mimeType.toLowerCase() === "image/svg+xml" ? "raw" : "image",
          overwrite: true,
          tags: ["plotpro", "project_layout", `project_${cleanProjectId}`],
        });

        return {
          success: true,
          provider: "cloudinary",
          imageUrl: result.secure_url || result.url,
          publicId: result.public_id,
          format: result.format || "svg",
          width: result.width || 0,
          height: result.height || 0,
          bytes: result.bytes || 0,
        };
      } catch (uploadError) {
        console.warn("[StorageService] Cloudinary error, saving to persistent volume:", uploadError.message);
        return await this.saveLocally({ fileData, mimeType, projectId });
      }
    }

    // Default primary storage: Persistent Volume / Local Disk
    return await this.saveLocally({ fileData, mimeType, projectId });
  }

  /**
   * Upload retailer signup payment-proof screenshot to persistent storage.
   */
  async uploadRequestProof({ fileData, mimeType, requestId }) {
    const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    const normalizedMime = String(mimeType || "").toLowerCase();

    if (!allowedMimes.includes(normalizedMime)) {
      const err = new Error(
        `Invalid file format: ${mimeType}. Allowed formats are PNG, JPEG, and WebP.`
      );
      err.statusCode = 400;
      throw err;
    }

    const { buffer } = parseAndValidateBase64(fileData);

    const cleanRequestId = String(requestId || "pending").replace(/[^a-zA-Z0-9_-]/g, "") || "pending";
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const ext = getExtensionForMime(normalizedMime);
    const filename = `proof_${cleanRequestId}_${timestamp}_${randomSuffix}.${ext}`;

    const proofsDir = getProofsDir();
    if (!fs.existsSync(proofsDir)) {
      fs.mkdirSync(proofsDir, { recursive: true });
    }

    const targetPath = resolveStoragePath(path.join("proofs", filename));
    fs.writeFileSync(targetPath, buffer);

    const serverUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const imageUrl = `${serverUrl}/uploads/proofs/${filename}`;
    const provider = this.getActiveProvider();

    return {
      success: true,
      provider,
      imageUrl,
      publicId: filename,
      format: ext,
      bytes: buffer.length,
    };
  }

  /**
   * Delete an asset from Persistent Volume or Cloudinary.
   * Strictly validates that the file resides inside upload root to prevent path traversal.
   *
   * @param {string} publicId - filename or Cloudinary asset ID
   * @param {string} [expectedProjectId] - safety check
   */
  async deleteLayoutImage(publicId, expectedProjectId) {
    if (!publicId) return false;

    // 1. If publicId is a persistent volume / local filename in layouts/ or proofs/
    const isLocalFilename =
      typeof publicId === "string" &&
      !publicId.includes("/") &&
      (publicId.startsWith("layout_") || publicId.startsWith("proof_"));

    if (isLocalFilename) {
      // Safety check: if expectedProjectId given, verify matching identifier
      if (expectedProjectId) {
        const cleanProjId = String(expectedProjectId).replace(/[^a-zA-Z0-9_-]/g, "");
        if (cleanProjId && !publicId.includes(cleanProjId)) {
          console.warn(`[StorageService] Asset deletion skipped: ${publicId} does not match expected ID ${expectedProjectId}`);
          return false;
        }
      }

      const subFolder = publicId.startsWith("proof_") ? "proofs" : "layouts";
      try {
        const filePath = resolveStoragePath(path.join(subFolder, publicId));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          return true;
        }
        return false;
      } catch (err) {
        console.warn(`[StorageService] Could not delete local file ${publicId}:`, err.message);
        return false;
      }
    }

    // 2. Cloudinary asset deletion
    if (this.isConfigured()) {
      if (expectedProjectId) {
        const cleanProjId = String(expectedProjectId).replace(/[^a-zA-Z0-9_-]/g, "");
        if (!publicId.includes(cleanProjId)) {
          console.warn(`[StorageService] Asset deletion skipped: publicId ${publicId} does not match project ${expectedProjectId}`);
          return false;
        }
      }

      this.initCloudinary();
      try {
        const result = await cloudinary.uploader.destroy(publicId);
        return result?.result === "ok";
      } catch (err) {
        console.warn(`[StorageService] Could not destroy Cloudinary asset ${publicId}:`, err.message);
        return false;
      }
    }

    return false;
  }
}

export const storageService = new StorageService();
export default storageService;
