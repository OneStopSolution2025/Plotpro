/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PLOTPRO UPLOAD-RETIREMENT SECURITY TEST SUITE
 * ─────────────────────────────────────────────────────────────────────────────
 *  Run via:  node scripts/runIsolatedSecurityTests.js   (recommended — spins up
 *            an isolated disposable MongoDB automatically), or directly:
 *            node scripts/testUploadRetirement.js
 *
 *  What it verifies (retailer-signup upload retirement):
 *    Part A — submitRetailerRequest accepts the number-only verification form:
 *             sole proprietor (no docs), company/LLP with CIN but NO
 *             certificate upload, authorized representative with NO letter.
 *    Part B — direct-API payloads carrying paymentProofData / registrationDocData
 *             / authLetterDocData / panDocData / gstDocData are IGNORED: no files
 *             are ever written to uploads/proofs or uploads/business_docs and no
 *             proof/doc keys are persisted.
 *    Part C — PAN / GSTIN / CIN text validation is still enforced (400s).
 *    Part D — legacy payment proofs remain viewable ONLY through the
 *             SUPREME_ADMIN-gated document endpoint (docType "paymentProof");
 *             getProofPath rejects traversal/foreign identifiers.
 *    Part E — server.js source-level guard: /uploads/proofs is NOT publicly
 *             served anymore, /uploads/layouts still is (public imagery).
 *    Part F — endpoint-level auth: the REAL supreme-admin router (protect +
 *             authorize("SUPREME_ADMIN")) rejects unauthenticated callers and
 *             non-SUPREME_ADMIN roles; SUPREME_ADMIN can retrieve a legacy proof.
 *    Part G — live-server regression: the actual server.js boots with the
 *             retirement config; /uploads/proofs/* and /uploads/business_docs/*
 *             return 404 while /uploads/layouts/* still serves project imagery.
 *    Part H — approval-flow regression: number-only requests still provision
 *             a SUPER_ADMIN + ACTIVE subscription end-to-end; the payment-
 *             verification gate is still enforced for declared payments.
 *
 *  Database isolation rules (same as the other suites):
 *  - If TEST_MONGODB_URI is set, it is used ONLY after strict safety guards.
 *  - Otherwise an ephemeral in-memory MongoDB is used (disposable, isolated).
 *  - No real emails are sent: the retailer-request email dispatcher seam is
 *    mocked (rejected unless NODE_ENV=test).
 * ─────────────────────────────────────────────────────────────────────────────
 */

process.env.NODE_ENV = "test";

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import { spawn } from "child_process";
import { Writable } from "stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import Plan from "../models/Plan.js";
import User from "../models/User.js";
import TrustedDevice from "../models/TrustedDevice.js";
import Subscription from "../models/Subscription.js";
import SuperAdminRequest from "../models/SuperAdminRequest.js";
import {
  submitRetailerRequest,
  approveRetailerRequest,
  setPaymentVerification,
  downloadBusinessDoc,
  setRetailerRequestEmailDispatcherForTest,
} from "../controllers/retailerRequestController.js";
import { storageService } from "../services/storageService.js";
import { getProofsDir, getBusinessDocsDir } from "../config/storageConfig.js";
import { getJwtSecret } from "../config/jwtConfig.js";
import supremeAdminRoutes from "../routes/supremeAdminRoutes.js";

// ─── Email Dispatcher Mock (test-only seam; NODE_ENV=test enforced above) ─────
setRetailerRequestEmailDispatcherForTest(async () => ({ success: true, messageId: "mock" }));

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
      throw new Error("[ABORT] TEST_MONGODB_URI must not be the same database as MONGODB_URI (app database).");
    }
    if (/prod/i.test(explicitUri)) {
      throw new Error("[ABORT] TEST_MONGODB_URI appears to target production (contains 'prod').");
    }
    const dbName = extractDbName(explicitUri);
    if (!dbName) {
      throw new Error("[ABORT] TEST_MONGODB_URI must include an explicit database name.");
    }
    if (!/test/i.test(dbName)) {
      throw new Error("[ABORT] TEST_MONGODB_URI database name must contain the word 'test' (disposable DBs only).");
    }
    return { uri: explicitUri, memory: false };
  }

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  memoryServer = await MongoMemoryServer.create();
  return { uri: memoryServer.getUri(), memory: true };
}

// ─── Controller-level invoke helpers (mock req/res) ───────────────────────────
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

/** Writable mock response for streaming endpoints (downloadBusinessDoc). */
const makeStreamRes = () => {
  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk);
      cb();
    },
  });
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  res.getBuffer = () => Buffer.concat(chunks);
  // NOTE: 'finish' only fires when bytes are streamed. 404/JSON responses never
  // write, so race with a timeout to avoid hanging the suite.
  res.finished = Promise.race([
    new Promise((resolve) => res.once("finish", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  return res;
};

const failNext = (err) => {
  throw err instanceof Error ? err : new Error(String(err));
};

async function invoke(handler, body, overrides) {
  const res = makeRes();
  await handler(makeReq(body, overrides), res, failNext);
  return res;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const FIXTURE_PREFIX = "uploadretire-test-";
const fixtureEmail = () =>
  `${FIXTURE_PREFIX}${Date.now()}_${crypto.randomBytes(4).toString("hex")}@test.example`;

let planFixture = null;

const createPlanFixture = async () => {
  const stamp = `${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  return Plan.create({
    name: `Upload Retirement Test Plan ${stamp}`,
    slug: `upload-retire-test-${stamp}`,
    price: 999,
    currency: "INR",
    billingInterval: "MONTHLY",
    durationDays: 30,
    maxAdminSeats: 5,
    isActive: true,
  });
};

const basePayload = (overrides = {}) => ({
  name: "Upload Test Owner",
  email: fixtureEmail(),
  password: "StrongPass123",
  phone: "+919876543210",
  businessName: "Upload Test Business",
  planId: planFixture._id.toString(),
  billingCycle: "MONTHLY",
  businessType: "SOLE_PROPRIETOR",
  applicantRole: "OWNER_PROPRIETOR",
  applicantLegalName: "Upload Test Owner",
  panNumber: "ABCDE1234F",
  hasGst: false,
  gstin: "",
  registrationNumber: "",
  ...overrides,
});

const countFiles = (dir) => {
  try {
    return fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile()).length;
  } catch {
    return 0;
  }
};

const assert = (cond, message) => {
  if (!cond) throw new Error(message || "Assertion failed");
};

// ─── Test Harness ─────────────────────────────────────────────────────────────
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

let passed = 0;
let failed = 0;
const failures = [];

// Uri of the resolved isolated test database (also handed to the live-server child in Part G)
let gTestDbUri = null;

async function runTests() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (err) {
      failed++;
      failures.push({ name, error: err?.message || String(err) });
      console.log(`  ❌ ${name}`);
    }
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// Part A — number-only verification form accepted
test("A1: sole-proprietor signup without any document fields → 201, no doc keys persisted", async () => {
  const res = await invoke(submitRetailerRequest, basePayload());
  assert(res.statusCode === 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  const req = await SuperAdminRequest.findOne({ email: res.body?.data?.email });
  assert(req, "request not persisted");
  const bv = req.businessVerification || {};
  assert(!bv.registrationDocKey && !bv.authLetterDocKey && !bv.panDocKey && !bv.gstDocKey, "doc keys should be empty for new requests");
  assert(!req.payment?.proofUrl && !req.payment?.proofPublicId, "no proof artifacts should be persisted");
  assert(bv.panNumber === "ABCDE1234F", "PAN should be persisted");
});

test("A2: company/LLP signup with CIN but NO certificate upload → 201 (previously 400)", async () => {
  const res = await invoke(
    submitRetailerRequest,
    basePayload({ businessType: "PVT_LTD", registrationNumber: "U72200MH2020PTC123456" })
  );
  assert(res.statusCode === 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  const req = await SuperAdminRequest.findOne({ email: res.body?.data?.email });
  assert(req.businessVerification?.registrationNumber === "U72200MH2020PTC123456", "CIN should be persisted");
  assert(!req.businessVerification?.registrationDocKey, "no registration doc key expected");
});

test("A3: authorized representative without authorization letter upload → 201 (previously 400)", async () => {
  const res = await invoke(
    submitRetailerRequest,
    basePayload({ applicantRole: "AUTHORIZED_REPRESENTATIVE" })
  );
  assert(res.statusCode === 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  const req = await SuperAdminRequest.findOne({ email: res.body?.data?.email });
  assert(!req.businessVerification?.authLetterDocKey, "no auth letter key expected");
});

// Part B — upload payload fields ignored
test("B1: direct-API payload with paymentProof/doc upload fields → 201 and NO files written", async () => {
  const proofsDir = getProofsDir();
  const bdocsDir = getBusinessDocsDir();
  const proofsBefore = countFiles(proofsDir);
  const bdocsBefore = countFiles(bdocsDir);

  const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const res = await invoke(
    submitRetailerRequest,
    basePayload({
      paymentMethod: "UPI",
      transactionId: "TXN123456",
      paymentNotes: "paid via upi",
      paymentProofData: tinyPng,
      paymentProofMime: "image/png",
      businessType: "PVT_LTD",
      registrationNumber: "U72200MH2020PTC123457",
      registrationDocData: tinyPng,
      registrationDocMime: "image/png",
      registrationDocName: "fake_cert.png",
      panDocData: tinyPng,
      panDocMime: "image/png",
      authLetterDocData: tinyPng,
      authLetterDocMime: "image/png",
      authLetterDocName: "fake_letter.png",
    })
  );
  assert(res.statusCode === 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);

  const req = await SuperAdminRequest.findOne({ email: res.body?.data?.email });
  assert(req, "request not persisted");
  assert(!req.payment?.proofUrl && !req.payment?.proofPublicId, "proof fields must not be persisted");
  const bv = req.businessVerification || {};
  assert(!bv.registrationDocKey && !bv.authLetterDocKey && !bv.panDocKey && !bv.gstDocKey, "doc keys must not be persisted");
  assert(countFiles(proofsDir) === proofsBefore, "no new files may appear in uploads/proofs");
  assert(countFiles(bdocsDir) === bdocsBefore, "no new files may appear in uploads/business_docs");
});

// Part C — text validation preserved
test("C1: invalid PAN still rejected → 400", async () => {
  const res = await invoke(submitRetailerRequest, basePayload({ panNumber: "INVALID" }));
  assert(res.statusCode === 400, `expected 400 for invalid PAN, got ${res.statusCode}`);
});

test("C2: invalid GSTIN (when hasGst) still rejected → 400", async () => {
  const res = await invoke(submitRetailerRequest, basePayload({ hasGst: true, gstin: "BADGST" }));
  assert(res.statusCode === 400, `expected 400 for invalid GSTIN, got ${res.statusCode}`);
});

test("C3: missing CIN/LLPIN for company type still rejected → 400", async () => {
  const res = await invoke(
    submitRetailerRequest,
    basePayload({ businessType: "PVT_LTD", registrationNumber: "" })
  );
  assert(res.statusCode === 400, `expected 400 for missing CIN, got ${res.statusCode}`);
});

// Part D — legacy proof secure access
test("D1: getProofPath rejects traversal and foreign identifiers", async () => {
  let threw = 0;
  for (const bad of ["../evil.png", "bdoc_cin_pending_x.pdf", "proofs/../../etc/passwd", "", null]) {
    try {
      storageService.getProofPath(bad);
    } catch {
      threw++;
    }
  }
  assert(threw === 5, `getProofPath should reject all 5 malicious identifiers, rejected ${threw}`);
});

test("D2: legacy payment proof downloadable via gated paymentProof docType", async () => {
  const fakeBytes = Buffer.from("%PNG-fake-legacy-proof-bytes", "utf8");
  const proofsDir = getProofsDir();
  fs.mkdirSync(proofsDir, { recursive: true });
  const proofName = `proof_legacytest_${Date.now()}.png`;
  fs.writeFileSync(path.join(proofsDir, proofName), fakeBytes);

  try {
    const legacy = await SuperAdminRequest.create({
      name: "Legacy Proof Owner",
      email: fixtureEmail(),
      passwordHash: "$2a$10$legacyhashplaceholderlegacyhashpl",
      businessName: "Legacy Proof Business",
      requestedPlanId: planFixture._id,
      payment: {
        method: "UPI",
        transactionId: "LEGACY-TXN-1",
        verified: false,
        proofUrl: `/uploads/proofs/${proofName}`,
        proofPublicId: proofName,
      },
      businessVerification: {
        businessType: "SOLE_PROPRIETOR",
        applicantRole: "OWNER_PROPRIETOR",
        applicantLegalName: "Legacy Proof Owner",
        panNumber: "ABCDE1234F",
      },
      status: "PENDING_REVIEW",
    });

    const res = makeStreamRes();
    await downloadBusinessDoc(makeReq({}, { params: { id: String(legacy._id), docType: "paymentProof" } }), res, failNext);
    await res.finished;
    assert(res.statusCode === 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert(String(res.headers["Content-Type"]).includes("image/png"), "content type should be image/png");
    assert(res.getBuffer().equals(fakeBytes), "served bytes should match the legacy proof file");
  } finally {
    try {
      fs.unlinkSync(path.join(proofsDir, proofName));
    } catch {
      /* cleanup best-effort */
    }
  }
});

test("D3: paymentProof docType returns 404 when no proof was stored", async () => {
  const res = await invoke(
    submitRetailerRequest,
    basePayload({ email: fixtureEmail() })
  );
  const id = res.body?.data?.id;
  const streamRes = makeStreamRes();
  await downloadBusinessDoc(makeReq({}, { params: { id, docType: "paymentProof" } }), streamRes, failNext);
  await streamRes.finished.catch(() => {});
  assert(streamRes.statusCode === 404, `expected 404 for missing proof, got ${streamRes.statusCode}`);
});

test("D4: unknown docType returns 404", async () => {
  const res = await invoke(submitRetailerRequest, basePayload());
  const id = res.body?.data?.id;
  const streamRes = makeStreamRes();
  await downloadBusinessDoc(makeReq({}, { params: { id, docType: "nonexistent" } }), streamRes, failNext);
  await streamRes.finished.catch(() => {});
  assert(streamRes.statusCode === 404, `expected 404 for unknown docType, got ${streamRes.statusCode}`);
});

// Part E — server.js source-level static-serving guard
test("E1: /uploads/proofs is not publicly served; /uploads/layouts still is", async () => {
  const serverJs = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert(!/express\.static\(getProofsDir\(/.test(serverJs), "/uploads/proofs must not be publicly served");
  assert(/uploads\/layouts", express\.static\(getLayoutsDir\(/.test(serverJs), "/uploads/layouts must remain public");
});

// ─── Part F helpers: REAL supreme-admin router over real HTTP ─────────────────
function startAuthApp() {
  const app = express();
  app.use("/api/supreme-admin", supremeAdminRoutes);
  // Fallthrough error handler (protect/authorize normally respond directly)
  app.use((err, _req, res, _next) => {
    res.status(500).json({ success: false, message: err?.message || "error" });
  });
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

const signToken = (user, deviceId) => {
  const payload = { userId: String(user._id), role: user.role };
  if (deviceId) payload.deviceId = deviceId;
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "10m" });
};

const createAuthFixtureUser = async (role, { withDevice = false } = {}) => {
  const bcrypt = (await import("bcryptjs")).default;
  const user = await User.create({
    name: `Auth Fixture ${role}`,
    email: fixtureEmail(),
    passwordHash: await bcrypt.hash("StrongPass123", 10),
    role,
    status: "ACTIVE",
    authProvider: "local",
    authProviders: ["local"],
  });
  let deviceId = null;
  if (withDevice) {
    const device = await TrustedDevice.create({
      userId: user._id,
      role,
      deviceTokenHash: crypto.randomBytes(32).toString("hex"),
      deviceId: crypto.randomBytes(16).toString("hex"),
      status: "APPROVED",
      isCurrentSession: true,
    });
    deviceId = String(device._id);
  }
  return { user, deviceId };
};

async function authedGet(base, urlPath, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${base}${urlPath}`, { headers });
  return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? await res.json().catch(() => null) : null };
}

// Part F — endpoint-level auth on the documents route (real middleware stack)
let authApp = null;

test("F1: unauthenticated request to documents route → 401", async () => {
  authApp = await startAuthApp();
  const victim = await SuperAdminRequest.findOne({ status: { $in: ["PENDING_REVIEW", "PENDING"] } }).sort({ createdAt: -1 });
  assert(victim, "need at least one request fixture for the auth test");
  const { status } = await authedGet(authApp.base, `/api/supreme-admin/retailer-requests/${victim._id}/documents/paymentProof`, null);
  assert(status === 401, `expected 401 without token, got ${status}`);
});

test("F2: garbage token → 401", async () => {
  const victim = await SuperAdminRequest.findOne({ status: { $in: ["PENDING_REVIEW", "PENDING"] } }).sort({ createdAt: -1 });
  const { status } = await authedGet(authApp.base, `/api/supreme-admin/retailer-requests/${victim._id}/documents/paymentProof`, "not-a-real-jwt");
  assert(status === 401, `expected 401 for garbage token, got ${status}`);
});

test("F3: USER role token → 403 (authorize deny)", async () => {
  const { user, deviceId } = await createAuthFixtureUser("USER");
  try {
    const victim = await SuperAdminRequest.findOne({ status: { $in: ["PENDING_REVIEW", "PENDING"] } }).sort({ createdAt: -1 });
    const { status, body } = await authedGet(
      authApp.base,
      `/api/supreme-admin/retailer-requests/${victim._id}/documents/paymentProof`,
      signToken(user, deviceId)
    );
    assert(status === 403, `expected 403 for USER role, got ${status}: ${JSON.stringify(body)}`);
  } finally {
    await User.deleteOne({ _id: user._id });
  }
});

test("F4: ADMIN role token (approved trusted device) → 403 (authorize deny)", async () => {
  const { user, deviceId } = await createAuthFixtureUser("ADMIN", { withDevice: true });
  try {
    const victim = await SuperAdminRequest.findOne({ status: { $in: ["PENDING_REVIEW", "PENDING"] } }).sort({ createdAt: -1 });
    const { status, body } = await authedGet(
      authApp.base,
      `/api/supreme-admin/retailer-requests/${victim._id}/documents/paymentProof`,
      signToken(user, deviceId)
    );
    assert(status === 403, `expected 403 for ADMIN role, got ${status}: ${JSON.stringify(body)}`);
  } finally {
    await TrustedDevice.deleteOne({ userId: user._id });
    await User.deleteOne({ _id: user._id });
  }
});

test("F5: SUPREME_ADMIN token → 200 and legacy proof bytes served through real router", async () => {
  const { user } = await createAuthFixtureUser("SUPREME_ADMIN");
  try {
    const fakeBytes = Buffer.from("%PNG-legacy-router-proof", "utf8");
    const proofsDir = getProofsDir();
    fs.mkdirSync(proofsDir, { recursive: true });
    const proofName = `proof_routertest_${Date.now()}.png`;
    fs.writeFileSync(path.join(proofsDir, proofName), fakeBytes);
    let legacy = null;
    try {
      legacy = await SuperAdminRequest.create({
        name: "Router Proof Owner",
        email: fixtureEmail(),
        passwordHash: "$2a$10$routerproofplaceholder.routerproofpl",
        businessName: "Router Proof Business",
        requestedPlanId: planFixture._id,
        payment: {
          method: "UPI",
          transactionId: "ROUTER-TXN-1",
          verified: false,
          proofUrl: `/uploads/proofs/${proofName}`,
          proofPublicId: proofName,
        },
        businessVerification: {
          businessType: "SOLE_PROPRIETOR",
          applicantRole: "OWNER_PROPRIETOR",
          applicantLegalName: "Router Proof Owner",
          panNumber: "ABCDE1234F",
        },
        status: "PENDING_REVIEW",
      });

      const res = await fetch(`${authApp.base}/api/supreme-admin/retailer-requests/${legacy._id}/documents/paymentProof`, {
        headers: { Authorization: `Bearer ${signToken(user)}` },
      });
      assert(res.status === 200, `expected 200 for SUPREME_ADMIN, got ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      assert(buf.equals(fakeBytes), "served bytes should match the legacy proof file");
    } finally {
      if (legacy) await SuperAdminRequest.deleteOne({ _id: legacy._id });
      try {
        fs.unlinkSync(path.join(proofsDir, proofName));
      } catch {
        /* cleanup best-effort */
      }
    }
  } finally {
    await User.deleteOne({ _id: user._id });
  }
});

// ─── Part G helpers: boot the REAL server.js and probe static upload routes ───
async function waitForHealth(base, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not ready yet */
    }
  }
  return false;
}

test("G1: live server: /uploads/proofs 404, /uploads/layouts 200, /uploads/business_docs 404", async () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plotpro-upload-retire-"));
  const layoutBytes = Buffer.from("%PNG-fake-layout-image", "utf8");
  const proofBytes = Buffer.from("%PNG-fake-legacy-proof", "utf8");
  const bdocBytes = Buffer.from("%PDF-fake-bdoc", "utf8");
  fs.mkdirSync(path.join(uploadRoot, "layouts"), { recursive: true });
  fs.mkdirSync(path.join(uploadRoot, "proofs"), { recursive: true });
  fs.mkdirSync(path.join(uploadRoot, "business_docs"), { recursive: true });
  fs.writeFileSync(path.join(uploadRoot, "layouts", "layout_probe.png"), layoutBytes);
  fs.writeFileSync(path.join(uploadRoot, "proofs", "proof_probe.png"), proofBytes);
  fs.writeFileSync(path.join(uploadRoot, "business_docs", "bdoc_probe.png"), bdocBytes);

  const port = 31000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(__dirname, "../server.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      MONGODB_URI: gTestDbUri,
      NODE_ENV: "test",
      UPLOAD_DIR: uploadRoot,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderrTail = "";
  child.stderr.on("data", (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-2000);
  });

  try {
    const ready = await waitForHealth(base);
    assert(ready, `server did not become healthy. stderr tail: ${stderrTail}`);

    // /uploads/proofs must NOT be publicly served anymore
    const proofRes = await fetch(`${base}/uploads/proofs/proof_probe.png`);
    assert(proofRes.status === 404, `expected 404 for /uploads/proofs, got ${proofRes.status}`);

    // /uploads/layouts must still serve project/plot imagery
    const layoutRes = await fetch(`${base}/uploads/layouts/layout_probe.png`);
    assert(layoutRes.status === 200, `expected 200 for /uploads/layouts, got ${layoutRes.status}`);
    assert(Buffer.from(await layoutRes.arrayBuffer()).equals(layoutBytes), "layout bytes should match");

    // /uploads/business_docs must remain private (404)
    const bdocRes = await fetch(`${base}/uploads/business_docs/bdoc_probe.png`);
    assert(bdocRes.status === 404, `expected 404 for /uploads/business_docs, got ${bdocRes.status}`);
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 500));
    try {
      fs.rmSync(uploadRoot, { recursive: true, force: true });
    } catch {
      /* cleanup best-effort */
    }
  }
});

// ─── Part H — approval-flow regression (unchanged behavior, number-only form) ─

test("H1: number-only request (PVT_LTD, CIN, no docs) approves end-to-end → SUPER_ADMIN + ACTIVE subscription", async () => {
  const submitted = await invoke(
    submitRetailerRequest,
    basePayload({ businessType: "PVT_LTD", registrationNumber: "U72200MH2020PTC123458" })
  );
  assert(submitted.statusCode === 201, `submit expected 201, got ${submitted.statusCode}`);

  const supreme = await createAuthFixtureUser("SUPREME_ADMIN");
  try {
    const res = await invoke(
      approveRetailerRequest,
      {},
      { params: { id: submitted.body.data.id }, user: supreme.user }
    );
    assert(res.statusCode === 200, `approve expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);

    const provisionedUser = await User.findOne({ email: submitted.body.data.email, role: "SUPER_ADMIN" });
    assert(provisionedUser, "SUPER_ADMIN user not provisioned");
    assert(provisionedUser.status === "ACTIVE", "provisioned user should be ACTIVE");

    const sub = await Subscription.findOne({ subscriberId: provisionedUser._id });
    assert(sub, "subscription not provisioned");
    assert(sub.status === "ACTIVE", "subscription should be ACTIVE");
    assert(sub.assignedSeats === planFixture.maxAdminSeats, "seat entitlement should mirror the plan");

    const finalized = await SuperAdminRequest.findById(submitted.body.data.id);
    assert(finalized.status === "APPROVED", "request should be APPROVED");
    assert(String(finalized.reviewedBy) === String(supreme.user._id), "reviewedBy attribution missing");

    // Idempotent re-approval must not duplicate anything
    const again = await invoke(
      approveRetailerRequest,
      {},
      { params: { id: submitted.body.data.id }, user: supreme.user }
    );
    assert(again.statusCode === 200 && again.body.alreadyApproved === true, "re-approval should be idempotent");
  } finally {
    await User.deleteOne({ _id: supreme.user._id });
  }
});

test("H2: declared payment still requires manual verification before approval (evidence-only semantics)", async () => {
  const submitted = await invoke(
    submitRetailerRequest,
    basePayload({ paymentMethod: "UPI", transactionId: "TXN-H2-1" })
  );
  assert(submitted.statusCode === 201, `submit expected 201, got ${submitted.statusCode}`);
  const id = submitted.body.data.id;

  const supreme = await createAuthFixtureUser("SUPREME_ADMIN");
  try {
    const blocked = await invoke(approveRetailerRequest, {}, { params: { id }, user: supreme.user });
    assert(
      blocked.statusCode === 403 && blocked.body.paymentNotVerified === true,
      `expected 403 paymentNotVerified, got ${blocked.statusCode}: ${JSON.stringify(blocked.body)}`
    );

    const marked = await invoke(
      setPaymentVerification,
      { verified: true, note: "test verified" },
      { params: { id }, user: supreme.user }
    );
    assert(marked.statusCode === 200, `setPaymentVerification expected 200, got ${marked.statusCode}`);

    const nowApproved = await invoke(approveRetailerRequest, {}, { params: { id }, user: supreme.user });
    assert(nowApproved.statusCode === 200, `approve after verification expected 200, got ${nowApproved.statusCode}`);
  } finally {
    await User.deleteOne({ _id: supreme.user._id });
  }
});

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=================================================================");
  console.log("   PLOTPRO UPLOAD-RETIREMENT SECURITY TEST SUITE");
  console.log("=================================================================\n");

  const { uri, memory } = await resolveTestDatabaseUri();
  console.log(
    ` Test database: ${memory ? "ephemeral in-memory MongoDB (disposable, isolated)" : "explicit TEST_MONGODB_URI (guards passed)"}`
  );

  await mongoose.connect(uri);
  console.log(` MongoDB connected (${mongoose.connection.name}). Running tests...\n`);

  gTestDbUri = uri;
  planFixture = await createPlanFixture();

  await runTests();

  // Cleanup: remove only our fixtures
  const provUsers = await User.find({ email: { $regex: `^${FIXTURE_PREFIX}` } }).select("_id");
  const subs = await Subscription.deleteMany({ subscriberId: { $in: provUsers.map((u) => u._id) } });
  const requests = await SuperAdminRequest.deleteMany({ email: { $regex: `^${FIXTURE_PREFIX}` } });
  const users = await User.deleteMany({ email: { $regex: `^${FIXTURE_PREFIX}` } });
  const plans = await Plan.deleteMany({ slug: { $regex: `^upload-retire-test-` } });
  console.log(
    `\n Cleanup: removed ${requests.deletedCount} request fixture(s), ${users.deletedCount} user fixture(s), ${subs.deletedCount} subscription fixture(s), ${plans.deletedCount} plan fixture(s).`
  );

  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();

  console.log("\n=================================================================");
  console.log(`   RESULT: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log("=================================================================\n");

  if (failed > 0) {
    for (const f of failures) {
      console.error(`  ✗ ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("\n[FATAL] Test run aborted:", err?.message || err);
  process.exit(1);
});
