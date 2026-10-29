/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PLOTPRO RATE-LIMIT + LOGIN-LOCKOUT SECURITY TEST SUITE (Fix 2)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Run via:  node scripts/runIsolatedSecurityTests.js   (recommended — spins up
 *            an isolated disposable MongoDB automatically), or directly:
 *            node scripts/testRateLimitSecurity.js
 *
 *  What it verifies:
 *    Part A — every IP limiter (real exported middleware instances, tested over
 *             real HTTP on ephemeral ports): requests below threshold pass, the
 *             threshold-crossing request returns 429 with the generic body.
 *             Fix 1 password-reset limiters are re-tested (regression).
 *    Part B — login account lockout (controller level, atomic DB updates):
 *             concurrent-failure counting, no stale-read bypass, identical
 *             generic 401 (no enumeration), expiry reset, success reset.
 *    Part C — functional regression: registration and public enquiry flows
 *             still work normally.
 *
 *  Database isolation rules (same as the Fix 1 suite):
 *  - If TEST_MONGODB_URI is set, it is used ONLY after strict safety guards.
 *  - Otherwise an ephemeral in-memory MongoDB is used (disposable, isolated).
 *  - No real emails are sent: the email dispatcher seam is mocked
 *    (rejected unless NODE_ENV=test). No production credentials used.
 * ─────────────────────────────────────────────────────────────────────────────
 */

process.env.NODE_ENV = "test";

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import http from "http";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import User from "../models/User.js";
import Enquiry from "../models/Enquiry.js";
import {
  loginUser,
  registerUser,
  setResetEmailDispatcherForTest,
} from "../controllers/authController.js";
import { submitPublicEnquiry } from "../controllers/enquiryController.js";
import {
  forgotPasswordLimiter,
  verifyOtpLimiter,
  resetPasswordLimiter,
  loginLimiter,
  googleAuthLimiter,
  registerLimiter,
  deviceResendLimiter,
  deviceVerifyLimiter,
  deviceSessionLimiter,
  enquiryLimiter,
  siteVisitLimiter,
  retailerRequestLimiter,
} from "../middleware/rateLimitMiddleware.js";

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
    // ── Safety guards: refuse anything that looks like production/app DB ──
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

  // ── Default: ephemeral in-memory MongoDB (disposable, fully isolated) ──
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  memoryServer = await MongoMemoryServer.create();
  return { uri: memoryServer.getUri(), memory: true };
}

// ─── Email Dispatcher Mock (test-only seam; NODE_ENV=test enforced above) ─────
setResetEmailDispatcherForTest(async () => ({ success: true, messageId: "mock" }));

// ─── Part A helpers: real HTTP tests against the real limiter instances ───────
const GENERIC_429 = {
  success: false,
  message: "Too many requests. Please try again later.",
};

function startLimiterApp(limiter, handler) {
  return new Promise((resolve, reject) => {
    const app = express();
    // NOTE: no `trust proxy` here — requests originate from 127.0.0.1 directly,
    // so each mini app has exactly one bucket per run (deterministic tests).
    app.post("/test", limiter, handler || ((req, res) => res.status(200).json({ success: true })));
    const server = http.createServer(app);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/test`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

async function postJson(url, body = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

// Every limiter and its expected threshold (per middleware/rateLimitMiddleware.js)
const LIMITER_CASES = [
  { name: "forgotPasswordLimiter (Fix 1 preserved)", limiter: forgotPasswordLimiter, limit: 5 },
  { name: "verifyOtpLimiter (Fix 1 preserved)", limiter: verifyOtpLimiter, limit: 10 },
  { name: "resetPasswordLimiter (Fix 1 preserved)", limiter: resetPasswordLimiter, limit: 10 },
  { name: "googleAuthLimiter", limiter: googleAuthLimiter, limit: 10 },
  { name: "registerLimiter", limiter: registerLimiter, limit: 3 },
  { name: "deviceResendLimiter", limiter: deviceResendLimiter, limit: 3 },
  { name: "deviceVerifyLimiter", limiter: deviceVerifyLimiter, limit: 5 },
  { name: "deviceSessionLimiter", limiter: deviceSessionLimiter, limit: 5 },
  { name: "enquiryLimiter", limiter: enquiryLimiter, limit: 3 },
  { name: "siteVisitLimiter", limiter: siteVisitLimiter, limit: 3 },
  { name: "retailerRequestLimiter", limiter: retailerRequestLimiter, limit: 3 },
];

// ─── Part B helpers: controller-level lockout tests (mock req/res) ────────────
const GENERIC_401 = { success: false, message: "Invalid email or password." };

const makeReq = (body, overrides = {}) => ({
  body,
  headers: {},
  ip: "127.0.0.1",
  get: () => "test-agent",
  ...overrides,
});

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

const failNext = (err) => {
  throw err instanceof Error ? err : new Error(String(err));
};

async function invoke(handler, body) {
  const res = makeRes();
  await handler(makeReq(body), res, failNext);
  return res;
}

const FIXTURE_PREFIX = "ratelimit-test-";
const fixtureEmail = () =>
  `${FIXTURE_PREFIX}${Date.now()}_${crypto.randomBytes(4).toString("hex")}@test.example`;

const createFixtureUser = async (password = "CorrectPassword123") => {
  const bcrypt = (await import("bcryptjs")).default;
  const email = fixtureEmail();
  const user = await User.create({
    name: "Rate Limit Test User",
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: "USER",
    status: "ACTIVE",
    authProvider: "local",
    authProviders: ["local"],
  });
  return { user, password };
};

const getLockState = (email) =>
  User.findOne({ email }).select("+loginFailedAttempts +loginLockedUntil");

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

// ─── Part A: IP limiter threshold tests (real HTTP, real middleware) ──────────

for (const { name, limiter, limit } of LIMITER_CASES) {
  test(`A/${name}: ${limit} requests pass, request ${limit + 1} → 429 generic body`, async () => {
    const app = await startLimiterApp(limiter);
    try {
      // Requests BELOW (and at) the threshold → all pass
      for (let i = 1; i <= limit; i++) {
        const res = await postJson(app.url);
        if (res.status !== 200) {
          throw new Error(`Request ${i}/${limit} was blocked early: ${res.status} ${JSON.stringify(res.body)}`);
        }
        if (i === 1) {
          const rl = res.headers.get("ratelimit-limit");
          if (!rl) throw new Error("RateLimit-* standard headers missing on a passing response");
          if (!rl.includes(String(limit))) {
            throw new Error(`RateLimit-Limit header '${rl}' does not reflect configured limit ${limit}`);
          }
        }
      }
      // Threshold-crossing request → 429 with the exact generic body
      const blocked = await postJson(app.url);
      if (blocked.status !== 429) {
        throw new Error(`Request ${limit + 1}: expected 429, got ${blocked.status}`);
      }
      if (JSON.stringify(blocked.body) !== JSON.stringify(GENERIC_429)) {
        throw new Error(`429 body is not the generic body: ${JSON.stringify(blocked.body)}`);
      }
      // Still blocked (window active)
      const again = await postJson(app.url);
      if (again.status !== 429) throw new Error(`Request ${limit + 2}: expected sustained 429, got ${again.status}`);
    } finally {
      await app.close();
    }
  });
}

test("A/loginLimiter: successful logins do NOT count (skipSuccessfulRequests)", async () => {
  // NOTE: runs BEFORE the failed-logins test below — the exported loginLimiter
  // is a singleton with one shared in-memory store, so tests must not fill the
  // failure bucket first.
  const successHandler = (req, res) => res.status(200).json({ success: true, token: "t" });
  const app = await startLimiterApp(loginLimiter, successHandler);
  try {
    // Well beyond the 5-request cap — successes never fill the bucket
    for (let i = 1; i <= 10; i++) {
      const res = await postJson(app.url, { email: "x@test.example", password: "right" });
      if (res.status !== 200) throw new Error(`Success ${i} was rate-limited (${res.status}) — skipSuccessfulRequests broken!`);
    }
  } finally {
    await app.close();
  }
});

test("A/loginLimiter: 5 FAILED logins pass, the 6th failure → 429 (failure counting)", async () => {
  const failingHandler = (req, res) =>
    res.status(401).json({ success: false, message: "Invalid email or password." });
  const app = await startLimiterApp(loginLimiter, failingHandler);
  try {
    for (let i = 1; i <= 5; i++) {
      const res = await postJson(app.url, { email: "x@test.example", password: "wrong" });
      if (res.status !== 401) throw new Error(`Failure ${i}: expected 401, got ${res.status}`);
    }
    const sixth = await postJson(app.url, { email: "x@test.example", password: "wrong" });
    if (sixth.status !== 429) throw new Error(`6th failure: expected 429, got ${sixth.status}`);
    if (JSON.stringify(sixth.body) !== JSON.stringify(GENERIC_429)) {
      throw new Error(`429 body is not the generic body: ${JSON.stringify(sixth.body)}`);
    }
  } finally {
    await app.close();
  }
});

// ─── Part B: login account lockout (controller level, atomic DB updates) ──────

test("B/TC-LC1: 8 concurrent failed logins → counter exactly 5, lock engaged, all identical 401s", async () => {
  const { user } = await createFixtureUser();

  const results = await Promise.all(
    Array.from({ length: 8 }, () => invoke(loginUser, { email: user.email, password: "WrongPassword999" }))
  );

  // Every failure response is the byte-identical generic 401 (no enumeration)
  for (const [i, res] of results.entries()) {
    if (res.statusCode !== 401) throw new Error(`Request ${i + 1}: expected 401, got ${res.statusCode}`);
    if (JSON.stringify(res.body) !== JSON.stringify(GENERIC_401)) {
      throw new Error(`Request ${i + 1} body differs: ${JSON.stringify(res.body)}`);
    }
  }

  // Atomic counting: no lost updates, and the lock engaged at the threshold
  const state = await getLockState(user.email);
  if (state.loginFailedAttempts !== 5) {
    throw new Error(`Expected loginFailedAttempts === 5 (atomic), got ${state.loginFailedAttempts}`);
  }
  if (!state.loginLockedUntil || new Date(state.loginLockedUntil) <= new Date()) {
    throw new Error("Lock was not engaged the instant the threshold was crossed");
  }
});

test("B/TC-LC2: CORRECT password while locked → identical generic 401, lock NOT bypassed", async () => {
  const { user } = await createFixtureUser();

  // Engage the lock
  for (let i = 0; i < 5; i++) {
    await invoke(loginUser, { email: user.email, password: "WrongPassword999" });
  }
  const locked = await getLockState(user.email);
  if (!locked.loginLockedUntil) throw new Error("Setup failed: lock not engaged");

  // The real password while locked must NOT succeed and must NOT reveal lock state
  const res = await invoke(loginUser, { email: user.email, password: "CorrectPassword123" });
  if (res.statusCode !== 401) throw new Error(`Locked correct-password login: expected 401, got ${res.statusCode}`);
  if (JSON.stringify(res.body) !== JSON.stringify(GENERIC_401)) {
    throw new Error(`Locked login body differs from wrong-password body: ${JSON.stringify(res.body)}`);
  }

  // Lock state untouched (no bypass, no early reset)
  const after = await getLockState(user.email);
  if (new Date(after.loginLockedUntil).getTime() !== new Date(locked.loginLockedUntil).getTime()) {
    throw new Error("Lock timestamp changed by a locked attempt");
  }
  if (after.loginFailedAttempts !== 5) throw new Error("Locked attempt mutated the failure counter");
});

test("B/TC-LC3: expired lock → correct password succeeds AND counter reset atomically", async () => {
  const { user } = await createFixtureUser();

  // Engage the lock, then simulate expiry
  for (let i = 0; i < 5; i++) {
    await invoke(loginUser, { email: user.email, password: "WrongPassword999" });
  }
  await User.updateOne(
    { email: user.email },
    { $set: { loginLockedUntil: new Date(Date.now() - 1000) } }
  );

  const res = await invoke(loginUser, { email: user.email, password: "CorrectPassword123" });
  if (res.statusCode !== 200) throw new Error(`Post-expiry correct login: expected 200, got ${res.statusCode} ${JSON.stringify(res.body)}`);
  if (!res.body?.token) throw new Error("Success response missing token");

  const state = await getLockState(user.email);
  if (state.loginFailedAttempts !== 0) throw new Error(`Counter not reset after expiry, got ${state.loginFailedAttempts}`);
  if (state.loginLockedUntil != null) throw new Error("Expired lock not cleared");
});

test("B/TC-LC4: no lock before threshold (4 failures), success resets counter", async () => {
  const { user } = await createFixtureUser();

  for (let i = 0; i < 4; i++) {
    const res = await invoke(loginUser, { email: user.email, password: "WrongPassword999" });
    if (res.statusCode !== 401) throw new Error(`Failure ${i + 1}: expected 401, got ${res.statusCode}`);
  }

  const mid = await getLockState(user.email);
  if (mid.loginFailedAttempts !== 4) throw new Error(`Counter after 4 failures: expected 4, got ${mid.loginFailedAttempts}`);
  if (mid.loginLockedUntil != null) throw new Error("Lock engaged BEFORE the 5-failure threshold!");

  const ok = await invoke(loginUser, { email: user.email, password: "CorrectPassword123" });
  if (ok.statusCode !== 200) throw new Error(`Successful login after 4 failures: expected 200, got ${ok.statusCode}`);

  const state = await getLockState(user.email);
  if (state.loginFailedAttempts !== 0) throw new Error(`Success did not reset counter, got ${state.loginFailedAttempts}`);
  if (state.loginLockedUntil != null) throw new Error("Success left a lock behind");
});

test("B/TC-LC5: 8 logins for a NONEXISTENT email → identical 401s, no lock records written", async () => {
  // Snapshot users that already have dirty counters from earlier lockout tests
  const dirtyBefore = (
    await User.find({ loginFailedAttempts: { $gt: 0 } }).select("email")
  ).map((u) => u.email);

  const ghostEmail = `ghost_${fixtureEmail()}`;

  for (let i = 0; i < 8; i++) {
    const res = await invoke(loginUser, { email: ghostEmail, password: "Whatever123" });
    if (res.statusCode !== 401) throw new Error(`Ghost login ${i + 1}: expected 401, got ${res.statusCode}`);
    if (JSON.stringify(res.body) !== JSON.stringify(GENERIC_401)) {
      throw new Error(`Ghost login ${i + 1} body differs: ${JSON.stringify(res.body)}`);
    }
  }

  // Nothing was ever created for the ghost email (no enumeration / no writes)
  const ghost = await User.findOne({ email: ghostEmail });
  if (ghost) throw new Error("A user document exists for the nonexistent email!");

  // No NEW user gained lockout state from the ghost attempts
  const dirtyAfter = (
    await User.find({ loginFailedAttempts: { $gt: 0 } }).select("email")
  ).map((u) => u.email);
  const newlyDirty = dirtyAfter.filter((e) => !dirtyBefore.includes(e));
  if (newlyDirty.length > 0) {
    throw new Error(`Unexpected lockout state written for: ${newlyDirty.join(", ")}`);
  }
});

// ─── Part C: functional regression (normal flows unaffected) ──────────────────

test("C/TC-FR1: registration works normally (201) and duplicate email is rejected (400)", async () => {
  const email = fixtureEmail();
  const ok = await invoke(registerUser, {
    name: "Register Test",
    email,
    password: "Password123",
    phone: "9999999999",
  });
  if (ok.statusCode !== 201) throw new Error(`Registration failed: ${ok.statusCode} ${JSON.stringify(ok.body)}`);
  if (!ok.body?.token) throw new Error("Registration response missing token");

  const dup = await invoke(registerUser, { name: "Dup", email, password: "Password123" });
  if (dup.statusCode !== 400) throw new Error(`Duplicate registration: expected 400, got ${dup.statusCode}`);
});

test("C/TC-FR2: public enquiry submission works without a projectId", async () => {
  const email = fixtureEmail();
  const res = await invoke(submitPublicEnquiry, {
    fullName: "Enquiry Test",
    email,
    mobile: "9876543210",
    contactMethod: "email",
    message: "Interested in plots",
  });
  if (res.statusCode !== 201) throw new Error(`Enquiry failed: ${res.statusCode} ${JSON.stringify(res.body)}`);

  const stored = await Enquiry.findOne({ email });
  if (!stored) throw new Error("Enquiry not persisted");
});

test("C/TC-FR3: normal correct-password login works (200) and resets any counter", async () => {
  const { user } = await createFixtureUser();

  // One failure to dirty the counter, then a successful login
  await invoke(loginUser, { email: user.email, password: "WrongPassword999" });
  const res = await invoke(loginUser, { email: user.email, password: "CorrectPassword123" });
  if (res.statusCode !== 200) throw new Error(`Normal login failed: ${res.statusCode} ${JSON.stringify(res.body)}`);
  if (!res.body?.token) throw new Error("Login response missing token");

  const state = await getLockState(user.email);
  if (state.loginFailedAttempts !== 0 || state.loginLockedUntil != null) {
    throw new Error("Successful login did not leave clean lockout state");
  }
});

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=================================================================");
  console.log("   PLOTPRO RATE-LIMIT + LOGIN-LOCKOUT SECURITY TEST SUITE (Fix 2)");
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
  console.log(`\n Cleanup: removed ${users.deletedCount} fixture user(s), ${enquiries.deletedCount} enquiry fixture(s).`);

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
