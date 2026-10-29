/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PLOTPRO ISOLATED SECURITY TEST RUNNER
 * ─────────────────────────────────────────────────────────────────────────────
 *  Starts a disposable ephemeral MongoDB (mongodb-memory-server) and runs the
 *  security test suites against it — NEVER against the application database.
 *
 *  Usage:
 *      node scripts/runIsolatedSecurityTests.js
 *
 *  Suites executed:
 *      1. scripts/testPasswordResetSecurity.js   (Fix 1 — password reset OTP)
 *      2. scripts/testRateLimitSecurity.js       (Fix 2 — IP limits + login lock)
 *      3. scripts/testJwtSecurity.js             (Fix 3 — JWT config + attribution)
 *      4. scripts/testDeviceSecurity.js          (regression — device flow)
 *      5. scripts/testUploadRetirement.js        (upload retirement — signup doc/proof removal)
 *
 *  The application database (MONGODB_URI from backend/.env) is never touched:
 *  each child process receives MONGODB_URI pointed at the ephemeral instance,
 *  and dotenv does not override variables that are already set.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUITES = [
  "testPasswordResetSecurity.js",
  "testRateLimitSecurity.js",
  "testJwtSecurity.js",
  "testDeviceSecurity.js",
  "testUploadRetirement.js",
];

async function runSuite(scriptName, mongoUri) {
  return new Promise((resolve) => {
    console.log(`\n─────────────────────────────────────────────────────────────`);
    console.log(`▶ Running suite: ${scriptName}`);
    console.log(`─────────────────────────────────────────────────────────────\n`);

    const child = spawn(process.execPath, [path.join(__dirname, scriptName)], {
      env: {
        ...process.env,
        MONGODB_URI: mongoUri,       // overrides backend/.env for the child only
        NODE_ENV: "test",            // enables the test-only email dispatcher seam
      },
      stdio: "inherit",
    });

    child.on("close", (code) => resolve({ scriptName, code: code ?? 1 }));
    child.on("error", (err) => {
      console.error(`[RUNNER] Failed to spawn ${scriptName}: ${err.message}`);
      resolve({ scriptName, code: 1 });
    });
  });
}

async function main() {
  console.log("=================================================================");
  console.log("   PLOTPRO ISOLATED SECURITY TEST RUNNER (disposable DB only)");
  console.log("=================================================================");

  if (process.env.TEST_MONGODB_URI) {
    console.log(
      "\n[NOTE] TEST_MONGODB_URI is set — the suites will apply their own safety guards and use it directly."
    );
  }

  let memoryServer = null;
  let mongoUri;

  if (process.env.TEST_MONGODB_URI?.trim()) {
    mongoUri = process.env.TEST_MONGODB_URI.trim();
  } else {
    console.log("\n Starting ephemeral in-memory MongoDB...");
    memoryServer = await MongoMemoryServer.create();
    mongoUri = memoryServer.getUri();
    console.log(` Ephemeral MongoDB ready: ${mongoUri.replace(/\/\/.*@/, "//***@")}`);
  }

  const results = [];
  for (const suite of SUITES) {
    results.push(await runSuite(suite, mongoUri));
  }

  if (memoryServer) {
    await memoryServer.stop();
    console.log("\n Ephemeral MongoDB stopped (all test data discarded).");
  }

  console.log("\n=================================================================");
  console.log("   ISOLATED SECURITY TEST RUNNER — SUMMARY");
  console.log("=================================================================");
  let overall = 0;
  for (const r of results) {
    const status = r.code === 0 ? "✅ PASS" : "❌ FAIL";
    console.log(`   ${status}  ${r.scriptName}`);
    if (r.code !== 0) overall = 1;
  }
  console.log("=================================================================\n");

  process.exit(overall);
}

main().catch((err) => {
  console.error("\n[FATAL] Runner aborted:", err?.message || err);
  process.exit(1);
});
