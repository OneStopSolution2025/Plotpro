import fs from "fs";
import path from "path";
import assert from "assert";
import {
  initStorage,
  getUploadDir,
  getLayoutsDir,
  getProofsDir,
  resolveStoragePath,
} from "../config/storageConfig.js";
import { storageService } from "../services/storageService.js";

async function runTests() {
  console.log("=== Running Persistent Storage Regression Tests ===");
  const originalEnv = { ...process.env };

  const testTempRoot = path.resolve("./backend/__test_storage_tmp__");

  try {
    // Clean up any previous test artifact
    if (fs.existsSync(testTempRoot)) {
      fs.rmSync(testTempRoot, { recursive: true, force: true });
    }

    // --- TEST 1: Directory initialization and probe verification in development ---
    console.log("Test 1: Development directory initialization & write probe");
    delete process.env.NODE_ENV;
    process.env.UPLOAD_DIR = testTempRoot;

    const initResult = initStorage();
    assert.strictEqual(initResult.success, true);
    assert.strictEqual(fs.existsSync(testTempRoot), true);
    assert.strictEqual(fs.existsSync(getLayoutsDir()), true);
    assert.strictEqual(fs.existsSync(getProofsDir()), true);
    assert.strictEqual(fs.existsSync(path.join(testTempRoot, "temp")), true);
    console.log("  ✓ Storage directories initialized successfully");

    // --- TEST 2: Safe path resolution & path traversal rejection ---
    console.log("Test 2: Path traversal rejection in resolveStoragePath");
    const validPath = resolveStoragePath("layouts/test.png");
    assert.strictEqual(validPath, path.join(testTempRoot, "layouts", "test.png"));

    let threwTraversal = false;
    try {
      resolveStoragePath("../../etc/passwd");
    } catch (e) {
      threwTraversal = true;
      assert.match(e.message, /Path traversal attempt/);
    }
    assert.strictEqual(threwTraversal, true, "Should reject ../../ traversal");
    console.log("  ✓ Path traversal rejected");

    // --- TEST 3: Saving a layout image with valid base64 ---
    console.log("Test 3: Saving layout image to persistent volume");
    const samplePngBase64 =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const layoutResult = await storageService.uploadLayoutImage({
      fileData: samplePngBase64,
      mimeType: "image/png",
      projectId: "proj123",
      tenantId: "tenant456",
    });

    assert.strictEqual(layoutResult.success, true);
    assert.strictEqual(layoutResult.provider, "volume");
    assert.strictEqual(layoutResult.format, "png");
    assert.strictEqual(layoutResult.imageUrl.includes("/uploads/layouts/layout_proj123_"), true);

    const savedLayoutPath = path.join(getLayoutsDir(), layoutResult.publicId);
    assert.strictEqual(fs.existsSync(savedLayoutPath), true, "Saved file must exist on disk");
    console.log("  ✓ Layout image saved and verified at:", layoutResult.imageUrl);

    // --- TEST 4: Saving a retailer payment proof image ---
    console.log("Test 4: Saving payment proof image");
    const proofResult = await storageService.uploadRequestProof({
      fileData: samplePngBase64,
      mimeType: "image/png",
      requestId: "req789",
    });

    assert.strictEqual(proofResult.success, true);
    assert.strictEqual(proofResult.provider, "volume");
    assert.strictEqual(proofResult.format, "png");
    assert.strictEqual(proofResult.imageUrl.includes("/uploads/proofs/proof_req789_"), true);

    const savedProofPath = path.join(getProofsDir(), proofResult.publicId);
    assert.strictEqual(fs.existsSync(savedProofPath), true, "Saved proof must exist on disk");
    console.log("  ✓ Payment proof saved and verified at:", proofResult.imageUrl);

    // --- TEST 5: Deleting an asset securely with validation ---
    console.log("Test 5: Asset deletion with safety boundary check");
    const deletedLayout = await storageService.deleteLayoutImage(layoutResult.publicId, "proj123");
    assert.strictEqual(deletedLayout, true, "Layout image should be deleted successfully");
    assert.strictEqual(fs.existsSync(savedLayoutPath), false, "File must be removed after deletion");

    // Attempt deleting with mismatched expected project
    const deletedProofMismatched = await storageService.deleteLayoutImage(proofResult.publicId, "other_req");
    assert.strictEqual(deletedProofMismatched, false, "Should refuse deleting when expected ID does not match");
    assert.strictEqual(fs.existsSync(savedProofPath), true, "File must not be deleted on mismatch");

    // Clean up proof with correct match
    const deletedProof = await storageService.deleteLayoutImage(proofResult.publicId, "req789");
    assert.strictEqual(deletedProof, true);
    assert.strictEqual(fs.existsSync(savedProofPath), false);
    console.log("  ✓ Asset deletion and safety checks passed");

    // --- TEST 6: Reject invalid file format or malformed base64 ---
    console.log("Test 6: Reject malformed base64 and unsupported MIME types");
    let rejectedMime = false;
    try {
      await storageService.uploadLayoutImage({
        fileData: samplePngBase64,
        mimeType: "application/pdf",
        projectId: "proj123",
      });
    } catch (e) {
      rejectedMime = true;
      assert.strictEqual(e.statusCode, 400);
    }
    assert.strictEqual(rejectedMime, true, "Should reject PDF mime for layout");

    let rejectedBase64 = false;
    try {
      await storageService.uploadLayoutImage({
        fileData: "not-a-valid-base64-string!!@@##",
        mimeType: "image/png",
        projectId: "proj123",
      });
    } catch (e) {
      rejectedBase64 = true;
      assert.strictEqual(e.statusCode, 400);
    }
    assert.strictEqual(rejectedBase64, true, "Should reject malformed base64");
    console.log("  ✓ Validation guards working as expected");

    // --- TEST 7: Production Fail-Closed Startup when UPLOAD_DIR is missing ---
    console.log("Test 7: Production startup fails closed when UPLOAD_DIR is missing");
    process.env.NODE_ENV = "production";
    delete process.env.UPLOAD_DIR;

    let prodMissingThrew = false;
    try {
      initStorage();
    } catch (e) {
      prodMissingThrew = true;
      assert.match(e.message, /UPLOAD_DIR environment variable is missing in production/);
    }
    assert.strictEqual(prodMissingThrew, true, "Must fail closed if UPLOAD_DIR is missing in production");
    console.log("  ✓ Production missing UPLOAD_DIR fail-closed verified");

    // --- TEST 8: Development mode fallback to backend/uploads ---
    console.log("Test 8: Development mode fallback to default uploads directory");
    process.env.NODE_ENV = "development";
    delete process.env.UPLOAD_DIR;
    const devUploadDir = getUploadDir();
    assert.strictEqual(devUploadDir.endsWith(path.join("backend", "uploads")), true);
    console.log("  ✓ Development default directory verified:", devUploadDir);

    console.log("\nALL 8 PERSISTENT STORAGE TESTS PASSED! ✓\n");
  } finally {
    // Restore environment
    process.env = originalEnv;

    // Clean up temporary test files
    if (fs.existsSync(testTempRoot)) {
      try {
        fs.rmSync(testTempRoot, { recursive: true, force: true });
      } catch (err) {
        // ignore Windows file lock release delay
      }
    }
  }
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
