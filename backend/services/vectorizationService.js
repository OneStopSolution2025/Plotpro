import os from "os";
import crypto from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { geminiVisionService } from "./geminiVisionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const unlinkAsync = promisify(fs.unlink);

/**
 * Service to execute Python OpenCV & RapidOCR worker in a secure, bounded child process.
 * Enforces:
 * - Anti-SSRF: Trusted Cloudinary hostnames only, HTTPS only, no private IPs.
 * - Resource bounding: Mutex (concurrency = 1), 35s hard timeout, 15MB download limit.
 * - Temporary file cleanup with cryptographic names.
 * - Degraded mode if Python or uv dependencies are missing.
 */
class VectorizationService {
  constructor() {
    this._isBusy = false;
    this.maxExecutionTimeMs = 35000; // 35 seconds
    this.maxDownloadBytes = 15 * 1024 * 1024; // 15 MB
    this.scriptPath = path.resolve(__dirname, "../scripts/vectorize_layout.py");
    this.refineScriptPath = path.resolve(__dirname, "../scripts/refine_geometry.py");
  }

  /**
   * Validate that URL is a safe, authorized Cloudinary resource.
   */
  validateSourceUrl(urlStr) {
    if (!urlStr || typeof urlStr !== "string") {
      throw new Error("Invalid or missing image URL.");
    }

    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new Error("Malformed image URL.");
    }

    // Must be HTTPS
    if (parsed.protocol !== "https:") {
      throw new Error("Insecure image protocol. HTTPS is strictly required.");
    }

    // Whitelist trusted Cloudinary domains
    const hostname = parsed.hostname.toLowerCase();
    const isCloudinary =
      hostname === "res.cloudinary.com" ||
      hostname.endsWith(".cloudinary.com");

    if (!isCloudinary) {
      throw new Error(
        `Untrusted image host "${hostname}". Only verified Cloudinary assets are permitted.`
      );
    }

    return parsed;
  }

  /**
   * Download image to secure temporary file with size and timeout guards.
   */
  async downloadSecureImage(urlStr) {
    this.validateSourceUrl(urlStr);

    const tmpFilename = `plotpro_vec_${crypto.randomUUID()}.tmp`;
    const tmpFilePath = path.join(os.tmpdir(), tmpFilename);
    const fileStream = fs.createWriteStream(tmpFilePath);

    return new Promise((resolve, reject) => {
      let downloadedBytes = 0;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        req.destroy();
        fileStream.close();
        fs.unlink(tmpFilePath, () => {});
        const err = new Error("Image download timed out (exceeded 10s).");
        err.statusCode = 504;
        reject(err);
      }, 10000);

      const req = https.get(urlStr, (response) => {
        if (response.statusCode !== 200) {
          clearTimeout(timer);
          fileStream.close();
          fs.unlink(tmpFilePath, () => {});
          const err = new Error(
            `Failed to download reference image: HTTP ${response.statusCode}`
          );
          err.statusCode = 502;
          return reject(err);
        }

        const contentType = (response.headers["content-type"] || "").toLowerCase();
        const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
        if (contentType && !validTypes.some((t) => contentType.includes(t))) {
          clearTimeout(timer);
          fileStream.close();
          fs.unlink(tmpFilePath, () => {});
          const err = new Error(
            `Invalid content type "${contentType}". Only PNG, JPEG, and WebP are supported.`
          );
          err.statusCode = 400;
          return reject(err);
        }

        response.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > this.maxDownloadBytes) {
            clearTimeout(timer);
            req.destroy();
            fileStream.close();
            fs.unlink(tmpFilePath, () => {});
            const err = new Error(
              `Image file size exceeds maximum limit of 15 MB.`
            );
            err.statusCode = 413;
            return reject(err);
          }
        });

        response.pipe(fileStream);

        fileStream.on("finish", () => {
          clearTimeout(timer);
          fileStream.close();
          resolve({ filePath: tmpFilePath, mimeType: contentType || "image/png" });
        });
      });

      req.on("error", (err) => {
        clearTimeout(timer);
        fileStream.close();
        fs.unlink(tmpFilePath, () => {});
        reject(err);
      });
    });
  }

  /**
   * Run vectorization child process on local image path.
   */
  async runWorker(imagePath, customConfig = {}) {
    if (this._isBusy) {
      const err = new Error("Vectorization engine is currently busy. Please retry in a few seconds.");
      err.statusCode = 429;
      throw err;
    }

    this._isBusy = true;
    try {
      const configJson = JSON.stringify(customConfig);
      const args = [
        "run",
        "--with",
        "opencv-python",
        "--with",
        "numpy",
        "--with",
        "pillow",
        "--with",
        "rapidocr-onnxruntime",
        "python",
        this.scriptPath,
        imagePath,
        "--config",
        configJson,
      ];

      return await new Promise((resolve, reject) => {
        const child = execFile(
          "uv",
          args,
          {
            timeout: this.maxExecutionTimeMs,
            maxBuffer: 2 * 1024 * 1024, // 2 MB buffer limit
            windowsHide: true,
          },
          (error, stdout, stderr) => {
            if (error) {
              if (error.killed) {
                const timeoutErr = new Error("Vectorization process exceeded execution timeout of 35 seconds.");
                timeoutErr.statusCode = 504;
                return reject(timeoutErr);
              }
              // If uv is not available or Python fails
              console.warn("[VectorizationWorker Warning]:", stderr || error.message);
              return resolve({
                success: false,
                degraded: true,
                error: "ENGINE_UNAVAILABLE",
                message: "Automatic detection engine is currently unavailable in this environment. Manual tracing remains fully operational.",
                candidates: [],
              });
            }

            try {
              const parsed = JSON.parse(stdout);
              resolve(parsed);
            } catch (parseErr) {
              console.error("[VectorizationWorker Parse Error]:", stdout);
              resolve({
                success: false,
                degraded: true,
                error: "OUTPUT_PARSE_ERROR",
                message: "Unable to parse detection output. Manual tracing remains fully operational.",
                candidates: [],
              });
            }
          }
        );
      });
    } finally {
      this._isBusy = false;
    }
  }

  /**
   * Run contour refinement worker on candidate polygons using local OpenCV edge/corner analysis.
   */
  async refineCandidates(imagePath, candidates, customConfig = {}) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return candidates;
    }

    const tmpJsonFilename = `plotpro_refine_${crypto.randomUUID()}.json`;
    const tmpJsonPath = path.join(os.tmpdir(), tmpJsonFilename);

    try {
      await fs.promises.writeFile(tmpJsonPath, JSON.stringify(candidates), "utf-8");

      const configJson = JSON.stringify(customConfig);
      const args = [
        "run",
        "--with",
        "opencv-python",
        "--with",
        "numpy",
        "--with",
        "pillow",
        "--with",
        "rapidocr-onnxruntime",
        "python",
        this.refineScriptPath,
        imagePath,
        tmpJsonPath,
        "--config",
        configJson,
      ];

      return await new Promise((resolve) => {
        execFile(
          "uv",
          args,
          {
            timeout: 20000,
            maxBuffer: 4 * 1024 * 1024,
            windowsHide: true,
          },
          (error, stdout, stderr) => {
            if (error) {
              console.warn("[RefineGeometry Warning]:", stderr || error.message);
              // Graceful fallback to unrefined candidates
              return resolve(candidates);
            }
            try {
              const parsed = JSON.parse(stdout);
              if (parsed && parsed.success && Array.isArray(parsed.candidates)) {
                return resolve(parsed.candidates);
              }
            } catch (pErr) {
              console.warn("[RefineGeometry Parse Warning]:", pErr.message);
            }
            resolve(candidates);
          }
        );
      });
    } catch (err) {
      console.warn("[RefineGeometry Error]:", err.message);
      return candidates;
    } finally {
      if (fs.existsSync(tmpJsonPath)) {
        try {
          await unlinkAsync(tmpJsonPath);
        } catch {}
      }
    }
  }

  /**
   * Main entry point: validates image, dispatches to requested provider, guarantees temporary file cleanup.
   *
   * @param {string} imageUrl - Trusted Cloudinary image URL
   * @param {Object} customConfig - User-provided heuristics config
   * @param {string} provider - 'opencv' | 'gemini'
   */
  async detectCandidates(imageUrl, customConfig = {}, provider = "opencv") {
    let tmpData = null;
    try {
      tmpData = await this.downloadSecureImage(imageUrl);
      const filePath = typeof tmpData === "string" ? tmpData : tmpData.filePath;
      const mimeType = typeof tmpData === "object" ? tmpData.mimeType : "image/png";

      if (provider === "gemini") {
        const geminiResult = await geminiVisionService.analyzeSitePlan(filePath, mimeType, customConfig);
        if (geminiResult && Array.isArray(geminiResult.candidates) && geminiResult.candidates.length > 0) {
          // Refine Gemini candidate geometries with OpenCV edge/corner snapping and RapidOCR crosscheck
          const refined = await this.refineCandidates(filePath, geminiResult.candidates, customConfig);
          geminiResult.candidates = refined;
        }
        return geminiResult;
      }

      // Default: OpenCV + RapidOCR local pipeline
      const result = await this.runWorker(filePath, customConfig);
      if (result && Array.isArray(result.candidates)) {
        result.candidates.forEach((c) => {
          c.sourceProvider = "opencv";
        });
        // Run edge/corner refinement pass to snap vertices and detect overlaps
        if (result.candidates.length > 0) {
          result.candidates = await this.refineCandidates(filePath, result.candidates, customConfig);
        }
      }
      return result;
    } finally {
      const cleanPath = typeof tmpData === "string" ? tmpData : tmpData?.filePath;
      if (cleanPath && fs.existsSync(cleanPath)) {
        try {
          await unlinkAsync(cleanPath);
        } catch {}
      }
    }
  }
}

export const vectorizationService = new VectorizationService();
export default vectorizationService;
