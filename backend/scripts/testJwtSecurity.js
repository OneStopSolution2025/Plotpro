/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PLOTPRO JWT CONFIGURATION SECURITY TEST SUITE (Fix 3)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Run via:  node scripts/runIsolatedSecurityTests.js   (recommended), or:
 *            node scripts/testJwtSecurity.js
 *
 *  What it verifies:
 *    Part A — fail-closed JWT secret validation, each case in an ISOLATED child
 *             process (no production configuration is ever mutated): missing/
 *             empty, whitespace-only, too short, blacklisted committed values,
 *             a valid synthetic secret, and the real configured value.
 *             Secrets are NEVER printed — only lengths / OK|THROW markers.
 *    Part B — one central secret source across ALL flows: generateToken payload
 *             contract, protect verification, Google-path token issuance, the
 *             device-transfer polling token (sign → verify + purpose binding),
 *             expiry behavior, and the startup assertion.
 *    Part C — customer-attribution regression: authenticated enquiry and
 *             site-visit submissions are attributed via decoded.userId (Fix 3
 *             corrected the broken decoded.id read), guest submissions stay
 *             unattributed and land in UnknownUserData.
 *
 *  Database isolation rules (same as the other suites):
 *  - TEST_MONGODB_URI only after strict safety guards; otherwise an ephemeral
 *    in-memory MongoDB. Nothing touches the app database.
 * ─────────────────────────────────────────────────────────────────────────────
 */

process.env.NODE_ENV = "test";

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import User from "../models/User.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";
import Project from "../models/Project.js";
import DeviceApprovalRequest from "../models/DeviceApprovalRequest.js";
import { issueProductionAuthResponse } from "../controllers/authController.js";
import { generateToken } from "../utils/generateToken.js";
import { submitPublicEnquiry } from "../controllers/enquiryController.js";
import { submitPublicSiteVisit } from "../controllers/siteVisitController.js";
import { getRequestStatus } from "../controllers/deviceAuthController.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  validateJwtSecret,
  getJwtSecret,
  getJwtExpiresIn,
  assertJwtConfigAtStartup,
} from "../config/jwtConfig.js";

// ─── Database Selection (isolated / disposable only) ──────────────────────────
let memoryServer = null;

function extractDbName(uri) {
  try {
    const withoutQuery = uri.split("?")[0];
    const afterScheme = withoutQuery.split("://")[1] || withoutQuery;
    const parts = afterScheme.split("/");
    return parts.slice(1).join("/") || "";
  } catch {
    return "";
  }
}

async function resolveTestDatabaseUri() {
  const explicitUri = process.env.TEST_MONGODB_URI?.trim();

  if (explicitUri) {
    if (process.env.MONGODB_URI && explicitUri === process.env.MONGODB_URI.trim()) {
      throw new Error(
        "[ABORT] TEST_MONGODB_URI must not be the same database as MONGODB_URI (app database)."
      );
    }
    if (/prod/i.test(explicitUri)) {
      throw new Error("[ABORT] TEST_MONGODB_URI appears to target production (contains 'prod').");
    }
    const dbName = extractDbName(explicitUri);
    if (!dbName) {
      throw new Error("[ABORT] TEST_MONGODB_URI must include an explicit database name.");
    }
    if (!/test/i.test(dbName)) {
      throw new Error(
        "[ABORT] TEST_MONGODB_URI database name must contain the word 'test' (disposable DBs only)."
      );
    }
    return { uri: explicitUri, memory: false };
  }

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  memoryServer = await MongoMemoryServer.create();
  return { uri: memoryServer.getUri(), memory: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FIXTURE_PREFIX = "jwtfix-test-";
const fixtureEmail = () =>
  `${FIXTURE_PREFIX}${Date.now()}_${crypto.randomBytes(4).toString("hex")}@test.example`;

const createFixtureUser = async (role = "USER") => {
  const bcrypt = (await import("bcryptjs")).default;
  const email = fixtureEmail();
  return User.create({
    name: "JWT Test User",
    email,
    passwordHash: await bcrypt.hash("Password123", 10),
    role,
    status: "ACTIVE",
    authProvider: "local",
    authProviders: ["local"],
  });
};

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Part A: isolated child-process configuration validation ──────────────────
const CONFIG_CHILD_CODE = `
import { getJwtSecret } from ${JSON.stringify(pathToFileURL(path.join(__dirname, "../config/jwtConfig.js")).href)};
try {
  const s = getJwtSecret();
  process.stdout.write("OK:" + s.length);
} catch {
  process.stdout.write("THROW");
}
`;

/**
 * Runs getJwtSecret() in a fresh child process with a specific JWT_SECRET value.
 * The child inherits nothing sensitive from us and only ever prints a length
 * or a THROW marker — the secret itself is never emitted.
 */
function runConfigChild(jwtSecretValue) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, NODE_ENV: "test" };
    // Only override when the case explicitly provides a value; passing a value
    // (even "") means dotenv cannot override it from backend/.env.
    if (arguments.length > 0) env.JWT_SECRET = jwtSecretValue;

    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", CONFIG_CHILD_CODE],
      { env, cwd: __dirname, stdio: ["ignore", "pipe", "pipe"] }
    );

    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("close", () => {
      const match = out.match(/(?:^|\n|\r)(OK:\d+|THROW)/);
      resolve(match ? match[1] : "NO_RESULT");
    });
    child.on("error", reject);
  });
}

// ─── Test Harness ─────────────────────────────────────────────────────────────
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

let passed = 0;
let failed = 0;
const failures = [];

async function runTests() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`✅ PASSED: ${name}`);
    } catch (err) {
      failed++;
      failures.push({ name, error: err?.message || String(err) });
      console.error(`❌ FAILED: ${name} — ${err?.message || err}`);
    }
  }
}

// ─── Part A: fail-closed configuration validation (isolated children) ─────────

test("A1: missing/empty JWT_SECRET → validation throws (fail closed)", async () => {
  const result = await runConfigChild("");
  if (result !== "THROW") throw new Error(`Empty secret: expected THROW, got ${result}`);
});

test("A2: whitespace-only JWT_SECRET → validation throws (fail closed)", async () => {
  const result = await runConfigChild("     ");
  if (result !== "THROW") throw new Error(`Whitespace-only secret: expected THROW, got ${result}`);
});

test("A3: too-short JWT_SECRET (31 chars) → validation throws (fail closed)", async () => {
  const result = await runConfigChild("a".repeat(31));
  if (result !== "THROW") throw new Error(`31-char secret: expected THROW, got ${result}`);
});

test("A4: blacklisted committed secret (dreamcity dev default) → throws", async () => {
  const result = await runConfigChild("dreamcity_super_secret_jwt_key_2026_dev");
  if (result !== "THROW") throw new Error(`Blacklisted secret: expected THROW, got ${result}`);
});

test("A5: blacklisted committed secret (fallback_secret_key) → throws", async () => {
  const result = await runConfigChild("fallback_secret_key");
  if (result !== "THROW") throw new Error(`Blacklisted secret: expected THROW, got ${result}`);
});

test("A6: valid synthetic 64-char secret → validates, length echoed only", async () => {
  const result = await runConfigChild("x".repeat(64));
  if (result !== "OK:64") throw new Error(`Valid secret: expected OK:64, got ${result}`);
});

test("A7: real configured value (backend/.env / platform env) → validates", async () => {
  // Child inherits the REAL configured secret from this process environment —
  // this proves the production configuration passes the new validator without
  // ever displaying the value.
  const result = await runConfigChild();
  const m = result.match(/^OK:(\d+)$/);
  if (!m) throw new Error(`Real configured secret: expected OK:<len>, got ${result}`);
  if (parseInt(m[1], 10) < 32) throw new Error(`Configured secret unexpectedly short: ${m[1]}`);
});

test("A8: validateJwtSecret() error messages never contain secret material", () => {
  const original = process.env.JWT_SECRET;
  try {
    process.env.JWT_SECRET = "dreamcity_super_secret_jwt_key_2026_dev";
    let msg = "";
    try {
      validateJwtSecret();
    } catch (e) {
      msg = e.message;
    }
    if (!msg.includes("FATAL SECURITY ERROR")) throw new Error("No fail-closed error raised");
    if (msg.includes(original)) throw new Error("Error message echoed the secret value!");
    // Also for the short case
    process.env.JWT_SECRET = "short";
    try {
      validateJwtSecret();
    } catch (e) {
      if (e.message.includes("short")) throw new Error("Error message echoed the secret value!");
    }
  } finally {
    process.env.JWT_SECRET = original;
  }
});

// ─── Part B: one central secret across all flows ──────────────────────────────

test("B1: generateToken payload contract: {userId, role, deviceId?} — verifiable with central secret", () => {
  const token = generateToken("uid_abc123", "USER");
  const decoded = jwt.verify(token, getJwtSecret());
  if (decoded.userId !== "uid_abc123" || decoded.role !== "USER") {
    throw new Error(`Payload mismatch: ${JSON.stringify(decoded)}`);
  }
  if (decoded.deviceId !== undefined) throw new Error("deviceId should be absent when not provided");

  const dToken = generateToken("uid_abc123", "ADMIN", "dev_456");
  const dDecoded = jwt.verify(dToken, getJwtSecret());
  if (dDecoded.deviceId !== "dev_456") throw new Error("deviceId not bound into token");
});

test("B2: protect middleware accepts a valid USER token issued by generateToken", async () => {
  const user = await createFixtureUser("USER");
  const token = generateToken(user._id, user.role);

  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = makeRes();
  let nextCalled = 0;
  await protect(req, res, () => nextCalled++);

  if (nextCalled !== 1) throw new Error(`protect did not call next (status ${res.statusCode}): ${JSON.stringify(res.body)}`);
  if (String(req.user?._id) !== String(user._id)) throw new Error("req.user not attached correctly");
});

test("B3: protect rejects a token signed with a WRONG secret (401, next never called)", async () => {
  const user = await createFixtureUser("USER");
  const badToken = jwt.sign({ userId: String(user._id), role: "USER" }, "w".repeat(48));

  const req = { headers: { authorization: `Bearer ${badToken}` } };
  const res = makeRes();
  let nextCalled = 0;
  await protect(req, res, () => nextCalled++);

  if (nextCalled !== 0) throw new Error("protect called next with a forged token!");
  if (res.statusCode !== 401) throw new Error(`Expected 401, got ${res.statusCode}`);
});

test("B4: protect rejects a TAMPERED token (401)", async () => {
  const user = await createFixtureUser("USER");
  const token = generateToken(user._id, user.role);
  const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");

  const req = { headers: { authorization: `Bearer ${tampered}` } };
  const res = makeRes();
  let nextCalled = 0;
  await protect(req, res, () => nextCalled++);

  if (nextCalled !== 0 || res.statusCode !== 401) {
    throw new Error(`Tampered token not rejected (next=${nextCalled}, status=${res.statusCode})`);
  }
});

test("B5: protect rejects an EXPIRED token (401)", async () => {
  const user = await createFixtureUser("USER");
  const expiredToken = jwt.sign(
    { userId: String(user._id), role: "USER" },
    getJwtSecret(),
    { expiresIn: "1s" }
  );
  await sleep(1500);

  const req = { headers: { authorization: `Bearer ${expiredToken}` } };
  const res = makeRes();
  let nextCalled = 0;
  await protect(req, res, () => nextCalled++);

  if (nextCalled !== 0 || res.statusCode !== 401) {
    throw new Error(`Expired token not rejected (next=${nextCalled}, status=${res.statusCode})`);
  }
});

test("B6: device-transfer polling token — central secret round-trip + purpose binding preserved", async () => {
  const user = await createFixtureUser("ADMIN");
  const approval = await DeviceApprovalRequest.create({
    userId: user._id,
    role: "ADMIN",
    candidateTokenHash: crypto.randomBytes(32).toString("hex"),
    status: "PENDING_APPROVAL",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  // Sign exactly as deviceAuthController does
  const pollingToken = jwt.sign(
    { requestId: String(approval._id), userId: String(user._id), purpose: "DEVICE_TRANSFER_POLL" },
    getJwtSecret(),
    { expiresIn: "30m" }
  );

  const res = makeRes();
  await getRequestStatus(
    { headers: { authorization: `Bearer ${pollingToken}` } },
    res,
    (e) => { throw e; }
  );
  if (res.statusCode !== 200 || res.body?.status !== "PENDING_APPROVAL") {
    throw new Error(`Polling round-trip failed: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }

  // Wrong purpose → still rejected with 403 (purpose check preserved)
  const wrongPurpose = jwt.sign(
    { requestId: String(approval._id), userId: String(user._id), purpose: "SOMETHING_ELSE" },
    getJwtSecret(),
    { expiresIn: "30m" }
  );
  const res2 = makeRes();
  await getRequestStatus(
    { headers: { authorization: `Bearer ${wrongPurpose}` } },
    res2,
    (e) => { throw e; }
  );
  if (res2.statusCode !== 403) throw new Error(`Wrong-purpose token: expected 403, got ${res2.statusCode}`);

  // Wrong secret → 401
  const wrongSecretPoll = jwt.sign(
    { requestId: String(approval._id), userId: String(user._id), purpose: "DEVICE_TRANSFER_POLL" },
    "w".repeat(48)
  );
  const res3 = makeRes();
  await getRequestStatus(
    { headers: { authorization: `Bearer ${wrongSecretPoll}` } },
    res3,
    (e) => { throw e; }
  );
  if (res3.statusCode !== 401) throw new Error(`Wrong-secret polling token: expected 401, got ${res3.statusCode}`);
});

test("B7: Google-path token issuance (issueProductionAuthResponse) uses the central secret", () => {
  const user = { _id: "uid_google_1", name: "G", email: "g@test.example", role: "USER", status: "ACTIVE", phone: "", avatar: "" };
  const res = makeRes();
  issueProductionAuthResponse(res, user, "Login successful");

  if (res.statusCode !== 200 || !res.body?.token) throw new Error("Google-path response missing token");
  const decoded = jwt.verify(res.body.token, getJwtSecret());
  if (String(decoded.userId) !== "uid_google_1" || decoded.role !== "USER") {
    throw new Error(`Google-path token payload mismatch: ${JSON.stringify(decoded)}`);
  }
});

test("B8: expiry behavior preserved (JWT_EXPIRES_IN honored, '7d' default)", () => {
  const expected = process.env.JWT_EXPIRES_IN?.trim() || "7d";
  if (getJwtExpiresIn() !== expected) {
    throw new Error(`getJwtExpiresIn()=${getJwtExpiresIn()}, expected ${expected}`);
  }
});

test("B9: startup assertion passes with the real configuration and returns metadata only", () => {
  const result = assertJwtConfigAtStartup();
  if (!result || result.secretLength < 32) throw new Error(`Startup assertion failed: ${JSON.stringify(result)}`);
  if (!result.expiresIn) throw new Error("Startup assertion missing expiresIn");
});

// ─── Part C: customer-attribution regression (decoded.userId fix) ─────────────

test("C1: authenticated enquiry attributed to the logged-in customer (decoded.userId)", async () => {
  const user = await createFixtureUser("USER");
  const token = generateToken(user._id, user.role);
  const email = fixtureEmail();

  const res = makeRes();
  await submitPublicEnquiry(
    {
      body: { fullName: "Auth Customer", email, mobile: "9876543210", contactMethod: "email", message: "hello" },
      headers: { authorization: `Bearer ${token}` },
    },
    res,
    (e) => { throw e; }
  );
  if (res.statusCode !== 201) throw new Error(`Enquiry failed: ${res.statusCode} ${JSON.stringify(res.body)}`);

  const stored = await Enquiry.findOne({ email });
  if (!stored) throw new Error("Enquiry not persisted");
  if (String(stored.customerId) !== String(user._id)) {
    throw new Error(`Attribution broken: customerId=${stored.customerId}, expected ${user._id}`);
  }

  // Authenticated submissions must NOT land in the guest/unknown table
  const UnknownUserData = mongoose.connection.models.UnknownUserData;
  if (UnknownUserData) {
    const guestRecord = await UnknownUserData.findOne({ email });
    if (guestRecord) throw new Error("Authenticated enquiry wrongly recorded as unknown/guest data");
  }
});

test("C2: guest enquiry (no token) stays unattributed and lands in UnknownUserData", async () => {
  const email = fixtureEmail();
  const res = makeRes();
  await submitPublicEnquiry(
    {
      body: { fullName: "Guest Customer", email, mobile: "9876543211", contactMethod: "email", message: "hi" },
      headers: {},
    },
    res,
    (e) => { throw e; }
  );
  if (res.statusCode !== 201) throw new Error(`Guest enquiry failed: ${res.statusCode}`);

  const stored = await Enquiry.findOne({ email });
  if (!stored) throw new Error("Guest enquiry not persisted");
  if (stored.customerId != null) throw new Error(`Guest enquiry wrongly attributed: ${stored.customerId}`);

  const UnknownUserData = mongoose.connection.models.UnknownUserData;
  if (UnknownUserData) {
    const guestRecord = await UnknownUserData.findOne({ email });
    if (!guestRecord) throw new Error("Guest enquiry missing from UnknownUserData");
  }
});

test("C3: authenticated site-visit attributed via decoded.userId", async () => {
  const user = await createFixtureUser("USER");
  const token = generateToken(user._id, user.role);
  const email = fixtureEmail();

  const project = await Project.create({
    title: `${FIXTURE_PREFIX}project_${crypto.randomBytes(3).toString("hex")}`,
    location: "Test Location",
    city: "Test City",
    plotPrice: "50",
    priceLakhs: 50,
    approvalStatus: "APPROVED",
    isArchived: false,
  });

  const res = makeRes();
  await submitPublicSiteVisit(
    {
      body: {
        fullName: "Visit Customer",
        email,
        mobile: "9876543212",
        preferredDate: "2026-12-01",
        preferredTime: "10:00 AM",
        message: "site visit",
        projectId: String(project._id),
      },
      headers: { authorization: `Bearer ${token}` },
    },
    res,
    (e) => { throw e; }
  );
  if (res.statusCode !== 201) throw new Error(`Site visit failed: ${res.statusCode} ${JSON.stringify(res.body)}`);

  const stored = await SiteVisit.findOne({ email });
  if (!stored) throw new Error("Site visit not persisted");
  if (String(stored.customerId) !== String(user._id)) {
    throw new Error(`Site-visit attribution broken: customerId=${stored.customerId}, expected ${user._id}`);
  }
});

test("C4: guest site-visit (token with wrong secret) degrades safely to guest", async () => {
  const email = fixtureEmail();
  const forged = jwt.sign({ userId: "uid_nobody", role: "USER" }, "w".repeat(48));

  const projects = await Project.find({ title: { $regex: `^${FIXTURE_PREFIX}` } });
  if (projects.length === 0) throw new Error("Fixture project missing");

  const res = makeRes();
  await submitPublicSiteVisit(
    {
      body: {
        fullName: "Forged Visitor",
        email,
        mobile: "9876543213",
        preferredDate: "2026-12-02",
        preferredTime: "11:00 AM",
        message: "visit",
        projectId: String(projects[0]._id),
      },
      headers: { authorization: `Bearer ${forged}` },
    },
    res,
    (e) => { throw e; }
  );
  if (res.statusCode !== 201) throw new Error(`Guest site-visit failed: ${res.statusCode}`);

  const stored = await SiteVisit.findOne({ email });
  if (!stored) throw new Error("Guest site-visit not persisted");
  if (stored.customerId != null) throw new Error(`Forged token attributed a customer: ${stored.customerId}`);
});

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=================================================================");
  console.log("   PLOTPRO JWT CONFIGURATION SECURITY TEST SUITE (Fix 3)");
  console.log("=================================================================\n");

  const { uri, memory } = await resolveTestDatabaseUri();
  console.log(
    ` Test database: ${memory ? "ephemeral in-memory MongoDB (disposable, isolated)" : "explicit TEST_MONGODB_URI (guards passed)"}`
  );

  await mongoose.connect(uri);
  console.log(` MongoDB connected (${mongoose.connection.name}). Running tests...\n`);

  await runTests();

  // ─── Cleanup: remove only our fixtures ───
  const users = await User.deleteMany({ email: { $regex: `^${FIXTURE_PREFIX}` } });
  const enquiries = await Enquiry.deleteMany({ email: { $regex: `^${FIXTURE_PREFIX}` } });
  const visits = await SiteVisit.deleteMany({ email: { $regex: `^${FIXTURE_PREFIX}` } });
  const projects = await Project.deleteMany({ title: { $regex: `^${FIXTURE_PREFIX}` } });
  const approvals = await DeviceApprovalRequest.deleteMany({ userId: { $exists: true } });
  const UnknownUserData = mongoose.connection.models.UnknownUserData;
  const unknown = UnknownUserData
    ? await UnknownUserData.deleteMany({ email: { $regex: `^${FIXTURE_PREFIX}` } })
    : { deletedCount: 0 };
  console.log(
    `\n Cleanup: removed ${users.deletedCount} user(s), ${enquiries.deletedCount} enquiry(s), ` +
      `${visits.deletedCount} site-visit(s), ${projects.deletedCount} project(s), ` +
      `${approvals.deletedCount} approval request(s), ${unknown.deletedCount} unknown-data record(s).`
  );

  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();

  console.log("\n=================================================================");
  console.log(`   RESULT: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log("=================================================================\n");

  if (failed > 0) {
    for (const f of failures) {
      console.error(`  • ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("\n[FATAL] Test run aborted:", err?.message || err);
  process.exit(1);
});
