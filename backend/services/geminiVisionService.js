import fs from "fs";
import { GoogleGenAI } from "@google/genai";

/**
 * Service to execute Google Gemini AI Multimodal Vision Analysis on Site Plan Reference Images.
 * Enforces:
 * - Confidentiality: Reads process.env.GEMINI_API_KEY exclusively on backend; redacts secrets from errors.
 * - Model Flexibility: Configurable via process.env.GEMINI_MODEL (defaults to 'gemini-2.5-flash').
 * - Schema-constrained JSON generation: Guarantees standardized candidate format.
 * - Rigorous Geometry Validation: Validates point counts, rejects NaN/infinite/out-of-range coordinates.
 * - Normalized coordinate convention: Output scaled to 0-100% canvas bounds.
 * - Non-mutating: Returns unconfirmed proposals only.
 */
class GeminiVisionService {
  constructor() {
    this.defaultModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }

  /**
   * Check if Gemini API credentials are configured.
   */
  isConfigured() {
    const key = process.env.GEMINI_API_KEY;
    return Boolean(key && String(key).trim() && !String(key).includes("your_"));
  }

  /**
   * Get configured model name.
   */
  getModelName() {
    return process.env.GEMINI_MODEL || this.defaultModel;
  }

  /**
   * Sanitize error messages to ensure zero API key leakage.
   */
  _sanitizeError(err) {
    let msg = err?.message || String(err);
    const key = process.env.GEMINI_API_KEY;
    if (key && key.length > 5) {
      msg = msg.replaceAll(key, "[REDACTED_API_KEY]");
    }
    return msg;
  }

  /**
   * Validate and normalize a candidate polygon from Gemini.
   * Rejects malformed geometry, non-finite values, and coordinates outside 0-100%.
   */
  _validatePolygon(points) {
    if (!Array.isArray(points) || points.length < 3 || points.length > 30) {
      return null;
    }

    const cleanPoints = [];
    let minX = 100, maxX = 0, minY = 100, maxY = 0;

    for (const pt of points) {
      if (typeof pt !== "object" || pt === null) return null;
      const x = Number(pt.x);
      const y = Number(pt.y);

      // Reject NaN, Infinity, or out of range [0, 100]
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      if (x < 0 || x > 100 || y < 0 || y > 100) return null;

      const normX = Number(x.toFixed(3));
      const normY = Number(y.toFixed(3));

      if (normX < minX) minX = normX;
      if (normX > maxX) maxX = normX;
      if (normY < minY) minY = normY;
      if (normY > maxY) maxY = normY;

      cleanPoints.push({ x: normX, y: normY });
    }

    const width = Number((maxX - minX).toFixed(3));
    const height = Number((maxY - minY).toFixed(3));

    // Must have positive bounding dimension
    if (width <= 0.05 || height <= 0.05) {
      return null;
    }

    return {
      points: cleanPoints,
      boundingBox: {
        x: minX,
        y: minY,
        width,
        height,
      },
      center: {
        x: Number((minX + width / 2).toFixed(3)),
        y: Number((minY + height / 2).toFixed(3)),
      },
    };
  }

  /**
   * Execute Gemini Multimodal Vision analysis on local image file buffer.
   *
   * @param {string} localFilePath - Local path of downloaded Cloudinary image
   * @param {string} mimeType - Image MIME type (e.g. 'image/png')
   * @param {Object} options - Custom configuration options
   * @returns {Promise<Object>} Detection result object conforming to PlotPro candidates schema
   */
  async analyzeSitePlan(localFilePath, mimeType = "image/png", options = {}) {
    if (!this.isConfigured()) {
      const err = new Error("Google Gemini AI is not configured. Please set GEMINI_API_KEY in the backend environment.");
      err.statusCode = 503;
      err.code = "GEMINI_NOT_CONFIGURED";
      throw err;
    }

    if (!fs.existsSync(localFilePath)) {
      const err = new Error("Site plan reference image file not found for processing.");
      err.statusCode = 404;
      throw err;
    }

    const modelName = options.model || this.getModelName();
    let imageBuffer;
    try {
      imageBuffer = await fs.promises.readFile(localFilePath);
    } catch (readErr) {
      const err = new Error(`Failed to read reference image: ${readErr.message}`);
      err.statusCode = 500;
      throw err;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `You are an expert civil engineering and real-estate GIS assistant analyzing a real-estate site plan / layout map.
Analyze the provided site plan image.
Preserve the exact aspect ratio of the plan without distortion.

Analyze the entire layout comprehensively and detect:
1. ALL individual residential and commercial plot boundaries (polygons). Be EXHAUSTIVE: detect every single plot across all rows, sectors, and blocks without omitting edge, corner, narrow, or irregular plots.
2. Plot numbers or printed labels inside each plot. Even if faint, deduce or record the visible number.
3. Block designations (e.g. "Block A", "Block B", "D-Block").
4. Roads / streets (names and centerpaths).
5. Parks / open green areas / playgrounds.
6. North compass orientation (0 to 360 degrees, where 0 is north up).

IMPORTANT COORDINATE & PRECISION RULES:
- All x and y coordinates MUST be normalized percentages from 0.0 to 100.0 (where x=0 is left, x=100 is right, y=0 is top, y=100 is bottom).
- Vertices must tightly hug the physical line boundary separating adjacent plots, streets, and borders.
- Each plot polygon MUST have 4 to 12 vertices outlining the boundary of that plot.
- Neighboring plots share common border edges without penetrating into each other.
- Do NOT skip any plot parcel shown on the map.
- Provide a confidence score between 0.0 and 1.0.
- If a plot number is blurred or uncertain, note it in warnings.
Return strictly valid JSON adhering to the specified response schema.`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        compassOrientation: {
          type: "NUMBER",
          description: "Compass North orientation in degrees from 0 to 360. 0 means North is straight up.",
        },
        detectedBlocks: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "List of block or sector names identified in the layout (e.g. 'Block A', 'Block B').",
        },
        plots: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              plotNumber: { type: "STRING", description: "Plot number or label (e.g. '1', '14B', '102')." },
              block: { type: "STRING", description: "Block or sector this plot belongs to." },
              confidence: { type: "NUMBER", description: "Confidence score between 0.0 and 1.0." },
              warnings: {
                type: "ARRAY",
                items: { type: "STRING" },
                description: "Warnings like 'BLURRY_NUMBER', 'PARTIAL_BOUNDARY', 'HIGH_ASPECT_RATIO'.",
              },
              points: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    x: { type: "NUMBER", description: "Normalized X coordinate (0.0 to 100.0)" },
                    y: { type: "NUMBER", description: "Normalized Y coordinate (0.0 to 100.0)" },
                  },
                  required: ["x", "y"],
                },
                description: "Array of polygon vertices in clockwise or counter-clockwise order.",
              },
            },
            required: ["plotNumber", "points"],
          },
        },
        roads: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING", description: "Name or width of the road (e.g. '30 Feet Road')." },
              widthFt: { type: "STRING", description: "Road width in feet if labeled." },
            },
            required: ["name"],
          },
        },
        parks: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING", description: "Name of the park or common facility." },
            },
            required: ["name"],
          },
        },
      },
      required: ["plots"],
    };

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              mimeType: mimeType || "image/png",
              data: imageBuffer.toString("base64"),
            },
          },
          prompt,
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.1, // Low temperature for high precision coordinate extraction
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Gemini returned an empty response.");
      }

      let parsedData;
      try {
        parsedData = JSON.parse(responseText);
      } catch (jsonErr) {
        throw new Error(`Failed to parse Gemini structured response: ${jsonErr.message}`);
      }

      // Convert and validate Gemini output into PlotPro standard candidates
      const rawPlots = Array.isArray(parsedData.plots) ? parsedData.plots : [];
      const validCandidates = [];

      for (let i = 0; i < rawPlots.length; i++) {
        const p = rawPlots[i];
        const geom = this._validatePolygon(p.points);
        if (!geom) {
          // Reject malformed, out-of-range, or non-finite geometry
          continue;
        }

        const candidateWarnings = Array.isArray(p.warnings) ? [...p.warnings] : [];
        const confidenceVal = typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0.85;

        validCandidates.push({
          candidateId: `cand_gemini_${Date.now()}_${i}`,
          shapeType: "polygon",
          points: geom.points,
          boundingBox: geom.boundingBox,
          center: geom.center,
          suggestedPlotNumber: String(p.plotNumber || "").trim(),
          suggestedBlock: p.block ? String(p.block).trim() : "",
          ocrConfidence: Number(confidenceVal.toFixed(3)),
          confidenceEstimate: Number(confidenceVal.toFixed(3)),
          warnings: candidateWarnings,
          sourceProvider: "gemini",
        });
      }

      return {
        success: true,
        sourceProvider: "gemini",
        model: modelName,
        candidateCount: validCandidates.length,
        candidates: validCandidates,
        compassOrientation: typeof parsedData.compassOrientation === "number" ? parsedData.compassOrientation : undefined,
        detectedBlocks: Array.isArray(parsedData.detectedBlocks) ? parsedData.detectedBlocks : [],
        roads: Array.isArray(parsedData.roads) ? parsedData.roads : [],
        parks: Array.isArray(parsedData.parks) ? parsedData.parks : [],
      };
    } catch (apiErr) {
      const sanitized = this._sanitizeError(apiErr);
      const isQuota = sanitized.toLowerCase().includes("quota") || sanitized.includes("429");
      const isKey = sanitized.toLowerCase().includes("api key") || sanitized.toLowerCase().includes("unauthenticated");

      const err = new Error(
        isQuota
          ? "Gemini API quota exceeded or rate limit reached. Please retry in a few moments or use OpenCV."
          : isKey
          ? "Invalid Gemini API key or authentication error. Please verify backend credentials."
          : `Gemini AI analysis failed: ${sanitized}`
      );
      err.statusCode = isQuota ? 429 : isKey ? 401 : 502;
      err.code = isQuota ? "GEMINI_QUOTA_EXCEEDED" : isKey ? "GEMINI_AUTH_FAILED" : "GEMINI_API_ERROR";
      throw err;
    }
  }
}

export const geminiVisionService = new GeminiVisionService();
export default geminiVisionService;
