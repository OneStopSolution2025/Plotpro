import { v2 as cloudinary } from "cloudinary";
import { sanitizeSvg } from "../utils/sanitizeSvg.js";

/**
 * Cloudinary Storage Provider implementation.
 * Encapsulated behind StorageService interface.
 */
class StorageService {
  constructor() {
    this.provider = "cloudinary";
    this._initialized = false;
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
   * Initializes Cloudinary configuration from environment variables.
   */
  init() {
    if (!this.isConfigured()) {
      return false;
    }

    if (!this._initialized) {
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
      this._initialized = true;
    }
    return true;
  }

  /**
   * Upload layout image to Cloudinary.
   * Accepts base64 data URI, raw buffer, or binary string.
   *
   * @param {Object} options
   * @param {string} options.fileData - Base64 Data URI (e.g. data:image/png;base64,...) or raw string
   * @param {string} options.mimeType - MIME type (e.g. image/png, image/jpeg, image/webp, image/svg+xml)
   * @param {string} options.projectId - Target Project ID for scoping folder
   * @param {string} options.tenantId - Tenant ID for isolation
   */
  async uploadLayoutImage({ fileData, mimeType, projectId, tenantId }) {
    if (!this.isConfigured()) {
      const err = new Error(
        "Persistent storage provider (Cloudinary) is not configured. Please define CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in backend environment variables."
      );
      err.statusCode = 503;
      err.code = "STORAGE_NOT_CONFIGURED";
      throw err;
    }

    this.init();

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

    // Handle SVG sanitization
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

    // Prepare Cloudinary folder and public_id scoped to project and tenant
    const cleanProjectId = String(projectId).replace(/[^a-zA-Z0-9_-]/g, "");
    const cleanTenantId = tenantId ? String(tenantId).replace(/[^a-zA-Z0-9_-]/g, "") : "common";
    const timestamp = Date.now();
    const folder = `plotpro/${cleanTenantId}/projects/${cleanProjectId}`;
    const publicId = `layout_${cleanProjectId}_${timestamp}`;

    try {
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
      console.error("[StorageService Cloudinary Upload Error]:", uploadError);
      const err = new Error(
        `Failed to upload layout image to Cloudinary: ${uploadError.message || "Upload failed"}`
      );
      err.statusCode = 502;
      throw err;
    }
  }

  /**
   * Delete an asset from Cloudinary when an update has been finalized or project is purged.
   *
   * @param {string} publicId - Cloudinary asset public ID
   * @param {string} expectedProjectId - Safety check to prevent unauthorized deletion
   */
  async deleteLayoutImage(publicId, expectedProjectId) {
    if (!publicId || !this.isConfigured()) return false;

    // Safety check: ensure publicId belongs to the expected project
    if (expectedProjectId) {
      const cleanProjId = String(expectedProjectId).replace(/[^a-zA-Z0-9_-]/g, "");
      if (!publicId.includes(cleanProjId)) {
        console.warn(`[StorageService] Asset deletion skipped: publicId ${publicId} does not match project ${expectedProjectId}`);
        return false;
      }
    }

    this.init();

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result?.result === "ok";
    } catch (err) {
      console.warn(`[StorageService] Could not destroy Cloudinary asset ${publicId}:`, err.message);
      return false;
    }
  }
}

export const storageService = new StorageService();
export default storageService;
