/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PLOTPRO PASSWORD-RESET OTP SECURITY TEST SUITE
 * ─────────────────────────────────────────────────────────────────────────────
 *  Run via:  node scripts/runIsolatedSecurityTests.js   (recommended — spins up
 *            an isolated disposable MongoDB automatically), or directly:
 *            node scripts/testPasswordResetSecurity.js
 *
 *  Database isolation rules:
 *  - If TEST_MONGODB_URI is set, it is used ONLY after strict safety guards
 *    (must contain a database name with "test", must not equal MONGODB_URI,
 *    must not reference production).
 *  - Otherwise an ephemeral in-memory MongoDB (mongodb-memory-server) is used,
 *    which is disposable and isolated by design. Nothing touches the app DB.
 *
 *  No real emails are sent: the email dispatcher is replaced with a mock via
 *  the test-only seam in authController.js (rejected unless NODE_ENV=test).
 *  No real production credentials are used anywhere in this file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

process.env.NODE_ENV = "test";

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import User from "../models/User.js";
import {
  forgotPassword,
  verifyOtp,
  resetPassword,
  setResetEmailDispatcherForTest,
} from "../controllers/authController.js";
import {
  generateSecureOtp,
  hashOtp,
  verifyOtpHash,
} from "../utils/otpSecurity.js";

// ─── Database Selection (isolated / disposable only) ──────────────────────────
let memoryServer = null;
let usedMemoryServer = false;

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
  usedMemoryServer = true;
  return { uri: memoryServer.getUri(), memory: true };
}

// ─── Email Dispatcher Mock (test-only seam; NODE_ENV=test is enforced above) ──
const sentEmails = [];

const successDispatcher = async ({ to, otp, expiryMinutes }) => {
  sentEmails.push({ to, otp, expiryMinutes });
  return { success: true, messageId: "mock-dispatch" };
};

const failingDispatcher = async () => ({
  success: false,
  error: "MOCK_DISPATCH_FAILURE",
});

// ─── HTTP handler mock helpers ────────────────────────────────────────────────
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

const getUserWithResetState = (email) =>
  User.findOne({ email }).select(
    "+resetOtpHash +resetOtpChallengeId +resetOtpAttempts +resetOtpVerified +resetOtpExpiry +resetOtpCooldownUntil"
  );

const FIXTURE_PREFIX = "pwreset-test-";
const fixtureEmail = () => `${FIXTURE_PREFIX}${Date.now()}_${crypto.randomBytes(4).toString("hex")}@test.example`;

const createFixtureUser = async () => {
  const email = fixtureEmail();
  const user = await User.create({
    name: "Password Reset Test User",
    email,
    passwordHash: await (async () => {
      const bcrypt = (await import("bcryptjs")).default;
      return bcrypt.hash("OriginalPassword123", 10);
    })(),
    role: "USER",
    status: "ACTIVE",
    authProvider: "local",
    authProviders: ["local"],
  });
  return user;
};

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

// ─── Tests ────────────────────────────────────────────────────────────────────

test("T1: generateSecureOtp produces a crypto-secure 6-digit code", () => {
  const otp = generateSecureOtp();
  if (!/^\d{6}$/.test(otp)) throw new Error(`Bad format: ${otp}`);
  const n = parseInt(otp, 10);
  if (n < 100000 || n > 999999) throw new Error("Out of range");
});

test("T2: hashOtp/verifyOtpHash — correct passes, wrong fails, cross-challenge fails, no plaintext", () => {
  const otp = generateSecureOtp();
  const challenge = crypto.randomUUID();
  const hash = hashOtp(otp, challenge);
  if (hash === otp) throw new Error("Hash equals plaintext!");
  if (!verifyOtpHash(otp, hash, challenge)) throw new Error("Correct OTP rejected");
  if (verifyOtpHash("000000", hash, challenge)) throw new Error("Wrong OTP accepted");
  if (verifyOtpHash(otp, hash, crypto.randomUUID())) throw new Error("Cross-challenge reuse accepted");
});

test("T3: forgot → correct OTP verifies before expiry; hash stored (never plaintext); expiry extended", async () => {
  const user = await createFixtureUser();
  await invoke(forgotPassword, { email: user.email });
  const sent = sentEmails.find((e) => e.to === user.email);
  if (!sent) throw new Error("No email dispatched by mock");

  const before = await getUserWithResetState(user.email);
  if (!before.resetOtpHash || before.resetOtpHash === sent.otp) throw new Error("OTP stored in plaintext!");
  if (before.resetOtpVerified) throw new Error("Marked verified before OTP entry");

  const res = await invoke(verifyOtp, { email: user.email, otp: sent.otp });
  if (res.statusCode !== 200) throw new Error(`Verify failed: ${res.statusCode} ${res.body?.message}`);

  const after = await getUserWithResetState(user.email);
  if (!after.resetOtpVerified) throw new Error("Verified flag not set");
  const windowMs = new Date(after.resetOtpExpiry) - new Date();
  if (windowMs < 14 * 60 * 1000) throw new Error("15-minute reset window not applied");
});

test("T4: five failed attempts invalidate the challenge", async () => {
  const user = await createFixtureUser();
  await invoke(forgotPassword, { email: user.email });
  const sent = sentEmails.filter((e) => e.to === user.email).pop();

  for (let i = 0; i < 4; i++) {
    const res = await invoke(verifyOtp, { email: user.email, otp: "000000" });
    if (res.statusCode !== 400) throw new Error(`Attempt ${i + 1}: expected 400, got ${res.statusCode}`);
  }
  const fifth = await invoke(verifyOtp, { email: user.email, otp: "000000" });
  if (fifth.statusCode !== 429) throw new Error(`5th wrong attempt: expected 429, got ${fifth.statusCode}`);

  const after = await getUserWithResetState(user.email);
  if (after.resetOtpHash || after.resetOtpChallengeId) throw new Error("Challenge not invalidated after 5 failures");

  const sixth = await invoke(verifyOtp, { email: user.email, otp: sent.otp });
  if (sixth.statusCode !== 400) throw new Error("Correct OTP accepted after challenge invalidation!");
});

test("T5: expired OTP is rejected", async () => {
  const user = await createFixtureUser();
  await invoke(forgotPassword, { email: user.email });
  const sent = sentEmails.filter((e) => e.to === user.email).pop();

  await User.findByIdAndUpdate(user._id, {
    $set: { resetOtpExpiry: new Date(Date.now() - 1000) },
  });

  const res = await invoke(verifyOtp, { email: user.email, otp: sent.otp });
  if (res.statusCode !== 400) throw new Error(`Expired OTP accepted: ${res.statusCode}`);

  const resetRes = await invoke(resetPassword, { email: user.email, otp: sent.otp, newPassword: "NewPassword123" });
  if (resetRes.statusCode !== 400) throw new Error("Reset succeeded with expired challenge!");
});

test("T6: a successful OTP cannot be verified again (single use)", async () => {
  const user = await createFixtureUser();
  await invoke(forgotPassword, { email: user.email });
  const sent = sentEmails.filter((e) => e.to === user.email).pop();

  const first = await invoke(verifyOtp, { email: user.email, otp: sent.otp });
  if (first.statusCode !== 200) throw new Error("First verification failed");

  const second = await invoke(verifyOtp, { email: user.email, otp: sent.otp });
  if (second.statusCode === 200) throw new Error("OTP was verified twice!");
});

test("T7: concurrent verification cannot consume the same OTP twice", async () => {
  const user = await createFixtureUser();
  await invoke(forgotPassword, { email: user.email });
  const sent = sentEmails.filter((e) => e.to === user.email).pop();

  const results = await Promise.all([
    invoke(verifyOtp, { email: user.email, otp: sent.otp }),
    invoke(verifyOtp, { email: user.email, otp: sent.otp }),
  ]);

  const successes = results.filter((r) => r.statusCode === 200);
  if (successes.length !== 1) {
    throw new Error(`Expected exactly 1 concurrent success, got ${successes.length} (${results.map((r) => r.statusCode).join(",")})`);
  }
  const final = await getUserWithResetState(user.email);
  if (!final.resetOtpVerified) throw new Error("Verified flag missing after concurrent verify");
});

test("T8: reset-password works once, then the session cannot be reused", async () => {
  const user = await createFixtureUser();
  await invoke(forgotPassword, { email: user.email });
  const sent = sentEmails.filter((e) => e.to === user.email).pop();
  await invoke(verifyOtp, { email: user.email, otp: sent.otp });

  const ok = await invoke(resetPassword, { email: user.email, otp: sent.otp, newPassword: "NewPassword123" });
  if (ok.statusCode !== 200) throw new Error(`Reset failed: ${ok.statusCode} ${ok.body?.message}`);

  const fresh = await User.findById(user._id).select("+passwordHash");
  if (!(await fresh.matchPassword("NewPassword123"))) throw new Error("New password does not match");
  if (await fresh.matchPassword("OriginalPassword123")) throw new Error("Old password still valid!");

  const replay = await invoke(resetPassword, { email: user.email, otp: sent.otp, newPassword: "HackedPassword1" });
  if (replay.statusCode === 200) throw new Error("Reset session reused!");
  const recheck = await User.findById(user._id).select("+passwordHash");
  if (await recheck.matchPassword("HackedPassword1")) throw new Error("Password overwritten via replay!");
});

test("T9: concurrent reset-password cannot consume the same session twice", async () => {
  const user = await createFixtureUser();
  await invoke(forgotPassword, { email: user.email });
  const sent = sentEmails.filter((e) => e.to === user.email).pop();
  await invoke(verifyOtp, { email: user.email, otp: sent.otp });

  const results = await Promise.all([
    invoke(resetPassword, { email: user.email, otp: sent.otp, newPassword: "WinnerPassword1" }),
    invoke(resetPassword, { email: user.email, otp: sent.otp, newPassword: "LoserPassword2" }),
  ]);

  const successes = results.filter((r) => r.statusCode === 200);
  if (successes.length !== 1) {
    throw new Error(`Expected exactly 1 concurrent reset success, got ${successes.length} (${results.map((r) => r.statusCode).join(",")})`);
  }

  const final = await User.findById(user._id).select("+passwordHash");
  const winnerPw = results[0].statusCode === 200 ? "WinnerPassword1" : "LoserPassword2";
  const loserPw = results[0].statusCode === 200 ? "LoserPassword2" : "WinnerPassword1";
  if (!(await final.matchPassword(winnerPw))) throw new Error("Winner password not applied");
  if (await final.matchPassword(loserPw)) throw new Error("Loser password applied!");
});

test("T10: resend cooldown suppresses repeat requests; new code after cooldown expires", async () => {
  const user = await createFixtureUser();
  const beforeCount = sentEmails.length;
  await invoke(forgotPassword, { email: user.email });
  const firstState = await getUserWithResetState(user.email);
  const countAfterFirst = sentEmails.length;
  if (countAfterFirst !== beforeCount + 1) throw new Error("First dispatch missing");

  // Immediate re-request inside the 60s cooldown → generic 200, NO new email/hash
  const second = await invoke(forgotPassword, { email: user.email });
  if (second.statusCode !== 200) throw new Error("Cooldown request not generic 200");
  const afterSecond = await getUserWithResetState(user.email);
  if (afterSecond.resetOtpChallengeId !== firstState.resetOtpChallengeId) throw new Error("Challenge changed during cooldown");
  if (sentEmails.length !== countAfterFirst) throw new Error("Email sent during cooldown (email bombing possible!)");

  // Cooldown expires → new challenge + new email
  await User.findByIdAndUpdate(user._id, {
    $set: { resetOtpCooldownUntil: new Date(Date.now() - 1000) },
  });
  await invoke(forgotPassword, { email: user.email });
  const afterThird = await getUserWithResetState(user.email);
  if (afterThird.resetOtpChallengeId === firstState.resetOtpChallengeId) throw new Error("Challenge not refreshed after cooldown");
  if (sentEmails.length !== countAfterFirst + 1) throw new Error("No dispatch after cooldown expiry");
});

test("T11: unknown and known emails receive identical generic responses (no enumeration)", async () => {
  const user = await createFixtureUser();
  const unknown = await invoke(forgotPassword, { email: `ghost_${fixtureEmail()}` });
  const known = await invoke(forgotPassword, { email: user.email });

  if (unknown.statusCode !== 200 || known.statusCode !== 200) {
    throw new Error(`Status mismatch: unknown=${unknown.statusCode} known=${known.statusCode}`);
  }
  if (JSON.stringify(unknown.body) !== JSON.stringify(known.body)) {
    throw new Error("Responses differ — enumeration signal: " + JSON.stringify({ unknown: unknown.body, known: known.body }));
  }
  if (!/registered/i.test(unknown.body?.message || "")) {
    throw new Error("Response is not the generic message");
  }
});

test("T12: email dispatch failure returns 500 and rolls back the cooldown", async () => {
  setResetEmailDispatcherForTest(failingDispatcher);
  try {
    const user = await createFixtureUser();
    const res = await invoke(forgotPassword, { email: user.email });
    if (res.statusCode !== 500) throw new Error(`Expected 500 on dispatch failure, got ${res.statusCode}`);

    const state = await getUserWithResetState(user.email);
    if (state.resetOtpCooldownUntil) throw new Error("Cooldown not rolled back after dispatch failure");
  } finally {
    setResetEmailDispatcherForTest(successDispatcher);
  }
});

test("T13: full happy path — forgot → verify → reset → login with new password", async () => {
  const user = await createFixtureUser();
  await invoke(forgotPassword, { email: user.email });
  const sent = sentEmails.filter((e) => e.to === user.email).pop();
  await invoke(verifyOtp, { email: user.email, otp: sent.otp });
  const res = await invoke(resetPassword, { email: user.email, otp: sent.otp, newPassword: "FinalPassword9" });
  if (res.statusCode !== 200) throw new Error(`Reset failed: ${res.body?.message}`);

  const fresh = await User.findById(user._id).select("+passwordHash");
  if (!(await fresh.matchPassword("FinalPassword9"))) throw new Error("Login with new password would fail");
});

test("T14: device-enrollment flow untouched by password-reset changes", async () => {
  const user = await createFixtureUser();
  await invoke(forgotPassword, { email: user.email });
  const sent = sentEmails.filter((e) => e.to === user.email).pop();
  await invoke(verifyOtp, { email: user.email, otp: sent.otp });

  const state = await getUserWithResetState(user.email);
  if (state.deviceEnrollmentChallengeId != null) throw new Error("Device enrollment challengeId polluted");
  if (state.deviceEnrollmentOtpHash != null) throw new Error("Device enrollment OTP hash polluted");

  // Shared OTP utility still binds correctly for a device-style challenge
  const deviceOtp = generateSecureOtp();
  const deviceChallenge = crypto.randomUUID();
  const deviceHash = hashOtp(deviceOtp, deviceChallenge);
  if (!verifyOtpHash(deviceOtp, deviceHash, deviceChallenge)) {
    throw new Error("Device-style hashing broken (correct OTP rejected)");
  }
  if (verifyOtpHash(deviceOtp, deviceHash, crypto.randomUUID())) {
    throw new Error("Device-style challenge binding broken");
  }
});

test("T15: email dispatcher seam is rejected outside NODE_ENV=test (no production bypass)", () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    let threw = false;
    try {
      setResetEmailDispatcherForTest(async () => ({ success: true }));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Seam allowed override in production NODE_ENV!");
  } finally {
    process.env.NODE_ENV = original;
  }
});

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=================================================================");
  console.log("   PLOTPRO PASSWORD-RESET OTP SECURITY TEST SUITE");
  console.log("=================================================================\n");

  const { uri, memory } = await resolveTestDatabaseUri();
  console.log(
    ` Test database: ${memory ? "ephemeral in-memory MongoDB (disposable, isolated)" : "explicit TEST_MONGODB_URI (guards passed)"}`
  );
  console.log(` Connected to: ${mongoose.connection.name || "(connecting)"}\n`);

  await mongoose.connect(uri);
  console.log(" MongoDB connected. Running tests...\n");

  setResetEmailDispatcherForTest(successDispatcher);

  await runTests();

  // ─── Cleanup: remove only our fixtures ───
  const cleanup = await User.deleteMany({ email: { $regex: `^${FIXTURE_PREFIX}` } });
  console.log(`\n Cleanup: removed ${cleanup.deletedCount} fixture user(s).`);

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
