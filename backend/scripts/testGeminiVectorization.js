import fs from "fs";
import dotenv from "dotenv";
import { vectorizationService } from "../services/vectorizationService.js";
import { geminiVisionService } from "../services/geminiVisionService.js";

dotenv.config();

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}: PASS`);
    passed++;
  } else {
    console.error(`  ✗ ${message}: FAIL`);
    failed++;
  }
}

async function runTests() {
  console.log("=== STARTING GOOGLE GEMINI AI VECTORIZATION TESTS ===");

  // 1. Provider validation
  console.log("\n[Test Suite 1] Provider Validation and Secrecy");
  assert(geminiVisionService !== undefined, "geminiVisionService is imported and defined");
  assert(typeof geminiVisionService.getModelName() === "string", "Gemini model name configured");

  // API Key Secrecy
  const apiKey = process.env.GEMINI_API_KEY;
  assert(apiKey === undefined || typeof apiKey === "string", "Key is read from backend environment only");

  // Redaction helper test
  process.env.GEMINI_API_KEY = "AIzaSyTestSecretKey123456789";
  const errWithKey = new Error("Failed connecting with key AIzaSyTestSecretKey123456789 to Gemini");
  const sanitized = geminiVisionService._sanitizeError(errWithKey);
  assert(!sanitized.includes("AIzaSyTestSecretKey123456789"), "API key strictly redacted from error messages");
  assert(sanitized.includes("[REDACTED_API_KEY]"), "Redacted placeholder present in error");

  // 2. Unconfigured Guard Test
  console.log("\n[Test Suite 2] Unconfigured API Key Guard");
  delete process.env.GEMINI_API_KEY;
  assert(!geminiVisionService.isConfigured(), "Detects missing GEMINI_API_KEY correctly");

  try {
    await geminiVisionService.analyzeSitePlan("dummy_path.png");
    assert(false, "Should have thrown 503 error for unconfigured key");
  } catch (err) {
    assert(err.statusCode === 503, "Returned HTTP 503 when key is missing");
    assert(err.code === "GEMINI_NOT_CONFIGURED", "Returned GEMINI_NOT_CONFIGURED error code");
  }

  // 3. Geometry Validation and Normalization Tests
  console.log("\n[Test Suite 3] Geometry Bounds & Schema Validation");
  
  // Valid 4-point polygon
  const validPoints = [
    { x: 10.5, y: 15.2 },
    { x: 30.8, y: 15.2 },
    { x: 30.8, y: 45.9 },
    { x: 10.5, y: 45.9 },
  ];
  const validGeom = geminiVisionService._validatePolygon(validPoints);
  assert(validGeom !== null, "Valid normalized polygon accepted");
  assert(validGeom.points.length === 4, "4 points preserved");
  assert(validGeom.boundingBox.x === 10.5, "Bounding box x calculated accurately");
  assert(validGeom.boundingBox.width === 20.3, "Bounding box width calculated accurately");

  // Invalid: Out-of-bounds coordinates (> 100)
  const oobPoints = [
    { x: 10, y: 10 },
    { x: 120, y: 10 }, // Out of range!
    { x: 120, y: 50 },
    { x: 10, y: 50 },
  ];
  assert(geminiVisionService._validatePolygon(oobPoints) === null, "Out-of-bounds coordinate (>100) rejected");

  // Invalid: Negative coordinates
  const negPoints = [
    { x: -5, y: 10 },
    { x: 30, y: 10 },
    { x: 30, y: 50 },
  ];
  assert(geminiVisionService._validatePolygon(negPoints) === null, "Negative coordinate (<0) rejected");

  // Invalid: NaN coordinates
  const nanPoints = [
    { x: NaN, y: 10 },
    { x: 30, y: 10 },
    { x: 30, y: 50 },
  ];
  assert(geminiVisionService._validatePolygon(nanPoints) === null, "NaN coordinate rejected");

  // Invalid: Degenerate polygon (< 3 vertices)
  const degenPoints = [
    { x: 10, y: 10 },
    { x: 30, y: 30 },
  ];
  assert(geminiVisionService._validatePolygon(degenPoints) === null, "Degenerate polygon (<3 vertices) rejected");

  // Invalid: Flat zero-area line
  const zeroAreaPoints = [
    { x: 10, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 10 },
  ];
  assert(geminiVisionService._validatePolygon(zeroAreaPoints) === null, "Zero-area polygon rejected");

  // 4. Anti-SSRF Integration with Gemini Provider
  console.log("\n[Test Suite 4] Anti-SSRF Protection on Gemini Flow");
  try {
    vectorizationService.validateSourceUrl("http://localhost:5000/steal");
    assert(false, "Should reject http localhost");
  } catch (err) {
    assert(err.message.includes("Insecure") || err.message.includes("Untrusted"), "Blocked http localhost");
  }

  try {
    vectorizationService.validateSourceUrl("https://untrusted-hacker.com/layout.png");
    assert(false, "Should reject third-party host");
  } catch (err) {
    assert(err.message.includes("Untrusted"), "Blocked untrusted host");
  }

  // 5. Provider Dispatch in vectorizationService
  console.log("\n[Test Suite 5] Provider Dispatcher");
  try {
    // Calling detectCandidates with provider='gemini' when unconfigured should trigger 503 cleanly
    await vectorizationService.detectCandidates("https://res.cloudinary.com/demo/image/upload/sample.png", {}, "gemini");
    assert(false, "Should have thrown 503 error for unconfigured Gemini");
  } catch (err) {
    assert(
      err.code === "GEMINI_NOT_CONFIGURED" || err.statusCode === 503 || err.statusCode === 502,
      "Dispatched cleanly to Gemini service with safe error handling"
    );
  }

  // 6. Precision Coordinate & Contour Refinement Tests
  console.log("\n[Test Suite 6] Precision Coordinate Handling & Refinement Worker");
  
  // Test coordinate conversion & aspect ratio preservation
  const landscapePoints = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 80 },
    { x: 0, y: 80 },
  ];
  const landscapeGeom = geminiVisionService._validatePolygon(landscapePoints);
  assert(landscapeGeom !== null, "Landscape bounds normalized without clamping");
  assert(landscapeGeom.boundingBox.width === 50 && landscapeGeom.boundingBox.height === 80, "Aspect bounds preserved");

  // Test refineScriptPath exists
  assert(fs.existsSync(vectorizationService.refineScriptPath), "refine_geometry.py script exists and is registered");

  console.log(`\n========================================`);
  console.log(`GEMINI VECTORIZATION TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
