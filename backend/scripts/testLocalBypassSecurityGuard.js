import { spawnSync } from "child_process";
import assert from "assert";
import path from "path";
import { fileURLToPath } from "url";
import { isPermittedLocalDeviceOtpBypass } from "../controllers/authController.js";
import { verifyBackupIntegrity } from "../_otp_device_security_backup/verifyBackupIntegrity.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, "../server.js");

function runTestProcess(envOverrides) {
  const env = {
    ...process.env,
    PORT: "5999", // isolated test port
    ...envOverrides,
  };

  return spawnSync(process.execPath, [serverPath], {
    env,
    encoding: "utf8",
    timeout: 10000,
  });
}

function runTests() {
  console.log("=================================================================");
  console.log("   STRICT LOCAL-ONLY OTP BYPASS & SECURITY GUARD TEST SUITE      ");
  console.log("=================================================================\n");

  let passed = 0;
  let total = 0;

  function testAssert(condition, name) {
    total++;
    if (condition) {
      console.log(`  ✓ PASSED: ${name}`);
      passed++;
    } else {
      console.error(`  ✗ FAILED: ${name}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // --- TEST 1: Backup SHA-256 Checksum Integrity ---
  console.log("[TEST 1] Cryptographic Backup Integrity Check:");
  const backupOk = verifyBackupIntegrity();
  testAssert(backupOk === true, "All 7 backup files match source files bit-for-bit");

  // --- TEST 2: Helper Unit Tests for isPermittedLocalDeviceOtpBypass ---
  console.log("\n[TEST 2] Evaluating isPermittedLocalDeviceOtpBypass Guard Invariants:");
  const origEnv = { ...process.env };

  try {
    // 2A. Default: missing env var -> false
    delete process.env.DEV_LOCAL_BYPASS_DEVICE_OTP;
    process.env.NODE_ENV = "development";
    testAssert(isPermittedLocalDeviceOtpBypass() === false, "Missing DEV_LOCAL_BYPASS_DEVICE_OTP strictly returns false");

    // 2B. Production with flag -> false
    process.env.DEV_LOCAL_BYPASS_DEVICE_OTP = "true";
    process.env.NODE_ENV = "production";
    testAssert(isPermittedLocalDeviceOtpBypass() === false, "NODE_ENV=production strictly returns false");

    // 2C. Staging with flag -> false
    process.env.NODE_ENV = "staging";
    testAssert(isPermittedLocalDeviceOtpBypass() === false, "NODE_ENV=staging strictly returns false");

    // 2D. Cloud deployment flags present -> false
    process.env.NODE_ENV = "development";
    process.env.RAILWAY_PUBLIC_DOMAIN = "plotpro.up.railway.app";
    testAssert(isPermittedLocalDeviceOtpBypass() === false, "RAILWAY_PUBLIC_DOMAIN present strictly returns false");

    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    process.env.RAILWAY_PROJECT_ID = "prj_123";
    testAssert(isPermittedLocalDeviceOtpBypass() === false, "RAILWAY_PROJECT_ID present strictly returns false");

    delete process.env.RAILWAY_PROJECT_ID;
    process.env.RENDER_SERVICE_ID = "srv_123";
    testAssert(isPermittedLocalDeviceOtpBypass() === false, "RENDER_SERVICE_ID present strictly returns false");

    delete process.env.RENDER_SERVICE_ID;
    process.env.VERCEL = "1";
    testAssert(isPermittedLocalDeviceOtpBypass() === false, "VERCEL present strictly returns false");

    // 2E. Verified strictly local development -> true
    delete process.env.VERCEL;
    process.env.NODE_ENV = "development";
    process.env.DEV_LOCAL_BYPASS_DEVICE_OTP = "true";
    testAssert(isPermittedLocalDeviceOtpBypass() === true, "Explicit DEV_LOCAL_BYPASS_DEVICE_OTP=true in pure development returns true");
  } finally {
    process.env = origEnv;
  }

  // --- TEST 3: Real OS Child Process Exit Code 1 Testing ---
  console.log("\n[TEST 3] Real Child Process Exit Code 1 Testing on Startup Guard:");

  // 3A. Production with bypass flag -> Must crash with exit code 1
  console.log("  Spawning child process with NODE_ENV=production and DEV_LOCAL_BYPASS_DEVICE_OTP=true...");
  const prodProc = runTestProcess({
    NODE_ENV: "production",
    DEV_LOCAL_BYPASS_DEVICE_OTP: "true",
  });
  testAssert(prodProc.status === 1, "Child process exited with status code 1 on production bypass attempt");
  testAssert(prodProc.stderr.includes("[SECURITY FATAL]"), "Stderr contains [SECURITY FATAL] alert");
  console.log("    -> Stderr preview:", prodProc.stderr.trim().split("\n")[0]);

  // 3B. Railway environment with bypass flag -> Must crash with exit code 1
  console.log("  Spawning child process with RAILWAY_PUBLIC_DOMAIN and DEV_LOCAL_BYPASS_DEVICE_OTP=true...");
  const railwayProc = runTestProcess({
    NODE_ENV: "development",
    RAILWAY_PUBLIC_DOMAIN: "plotpro.up.railway.app",
    DEV_LOCAL_BYPASS_DEVICE_OTP: "true",
  });
  testAssert(railwayProc.status === 1, "Child process exited with status code 1 on Railway cloud bypass attempt");
  testAssert(railwayProc.stderr.includes("[SECURITY FATAL]"), "Stderr contains [SECURITY FATAL] alert");

  // 3C. Render environment with bypass flag -> Must crash with exit code 1
  console.log("  Spawning child process with RENDER_SERVICE_ID and DEV_LOCAL_BYPASS_DEVICE_OTP=true...");
  const renderProc = runTestProcess({
    NODE_ENV: "development",
    RENDER_SERVICE_ID: "srv_test",
    DEV_LOCAL_BYPASS_DEVICE_OTP: "true",
  });
  testAssert(renderProc.status === 1, "Child process exited with status code 1 on Render cloud bypass attempt");

  console.log("\n=================================================================");
  console.log(`🎉 ALL ${passed}/${total} SECURITY & GUARD TESTS PASSED SUCCESSFULLY!`);
  console.log("=================================================================\n");
}

runTests();
