/**
 * E2E verification of the retailer approval workflow using the REAL
 * controller functions (production code path) via synthetic req/res.
 * Behavior adapts automatically:
 *  - request WITH declared payment  -> unverified approval is blocked,
 *    verify-payment endpoint must be used first
 *  - request WITHOUT payment (gateway pending) -> approve proceeds directly
 * Run from backend/:  node scripts/verifyRetailerApproval.mjs <requestId>
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import SuperAdminRequest from "../models/SuperAdminRequest.js";
import Notification from "../models/Notification.js";
import {
  approveRetailerRequest,
  rejectRetailerRequest,
  setPaymentVerification,
} from "../controllers/retailerRequestController.js";

const EMAIL = "e2e-retailer-test@dreamcity.in";
const RID = process.argv[2]; // request id from HTTP submission
const hasPaymentEvidence = (p) => Boolean(p?.method || p?.transactionId || p?.proofUrl);

/** Synthetic express req/res pair that records status + json body */
const makeCtx = (body = {}) => {
  const req = { body, params: { id: RID }, user: null };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return obj;
    },
  };
  const next = (err) => {
    res.statusCode = err?.statusCode || 500;
    res.body = { success: false, message: err?.message || String(err) };
  };
  return { req, res, next, call: async (fn) => { await fn(req, res, next); return res; } };
};

let PASS = 0;
let FAIL = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    PASS++;
    console.log(`  [PASS] ${name}${extra ? " -- " + extra : ""}`);
  } else {
    FAIL++;
    console.log(`  [FAIL] ${name}${extra ? " -- " + extra : ""}`);
  }
};

const cleanup = async () => {
  const user = await User.findOne({ email: EMAIL, role: "SUPER_ADMIN" });
  if (user) {
    await Subscription.deleteMany({ subscriberId: user._id });
    await User.deleteOne({ _id: user._id });
    console.log(`  [clean] removed temp provisioned user + subscription (${user._id})`);
  }
  await SuperAdminRequest.findByIdAndDelete(RID);
  await Notification.deleteMany({ "metadata.requestId": RID });
  console.log("[clean] removed temp request + notifications");
};

const main = async () => {
  await connectDB();
  console.log("[1] DB connected");

  // Resolve a real SUPREME_ADMIN account as reviewer
  let supreme = await User.findOne({ role: "SUPREME_ADMIN" });
  let createdTempSupreme = false;
  if (!supreme) {
    supreme = await User.create({
      name: "E2E Temp Supreme",
      email: "e2e-temp-supreme@dreamcity.in",
      passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz012345678901234567890123456",
      role: "SUPREME_ADMIN",
      status: "ACTIVE",
    });
    createdTempSupreme = true;
  }
  console.log(`[Supreme reviewer] ${supreme.email}`);

  const request = await SuperAdminRequest.findById(RID);
  if (!request) {
    console.log("[!] request not found -- cannot continue");
    process.exit(1);
  }

  const plan = request.planSnapshot;
  console.log(`[Request] ${request.businessName} / ${request.email} / plan snapshot: ${plan.name} (${plan.price}), seats=${plan.maxAdminSeats}`);

  // ---- Payment-gated branches only when payment was declared ----
  if (hasPaymentEvidence(request.payment)) {
    console.log("[2] Declared payment unverified -> approve blocked");
    let r1 = await makeCtx({}).call(approveRetailerRequest);
    check("blocked with 403", r1.statusCode === 403, `http=${r1.statusCode}`);
    check("paymentNotVerified flag", r1.body?.paymentNotVerified === true);
    check("no user was provisioned", !(await User.findOne({ email: EMAIL })));

    console.log("[3] Mark payment verified");
    let r2 = await makeCtx({ verified: true, note: "E2E verify" }).call(setPaymentVerification);
    check("verified set true", r2.body?.data?.payment?.verified === true);
  } else {
    console.log("[2] No payment declared -> verification gate skipped (gateway pending)");
    check("payment has no evidence", !hasPaymentEvidence(request.payment));
  }

  // ---- Approve ----
  console.log("[4] Approve");
  const approveCtx = await (async () => {
    const req = { body: {}, params: { id: RID }, user: supreme };
    const res = {
      statusCode: null,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(o) { this.body = o; return o; },
    };
    const next = (err) => {
      res.statusCode = err?.statusCode || 500;
      res.body = { success: false, message: err?.message || String(err) };
    };
    await approveRetailerRequest(req, res, next);
    return res;
  })();
  check("http 200", approveCtx.statusCode === 200, `http=${approveCtx.statusCode} msg=${approveCtx.body?.message || approveCtx.body?.message || ""}`);
  check("success true", approveCtx.body?.success === true);

  const provisionedUser = await User.findOne({ email: EMAIL, role: "SUPER_ADMIN" });
  check("user created with role SUPER_ADMIN", Boolean(provisionedUser), provisionedUser ? "role=" + provisionedUser.role : "");
  check("user status ACTIVE", provisionedUser?.status === "ACTIVE");
  check("tenantId null (tenant owner)", String(provisionedUser?.tenantId || "null") === "null");

  const sub = await Subscription.findOne({ subscriberId: provisionedUser?._id }).populate("planId");
  check("subscription created", Boolean(sub));
  check(
    "subscription seat limits come from the plan (not client)",
    sub && Number(sub.assignedSeats) === Number(plan.maxAdminSeats) && Boolean(sub.planId?._id),
    `seats=${sub?.assignedSeats} expected=${plan.maxAdminSeats}`
  );
  check("subscription ACTIVE", sub?.status === "ACTIVE");
  check("usedSeats starts at 0", sub?.usedSeats === 0, `usedSeats=${sub?.usedSeats}`);
  const days = Math.round((new Date(sub.expiryDate) - new Date(sub.startDate)) / 86400000);
  check(`expiry = plan duration (${plan.durationDays}d)`, days === plan.durationDays, `days=${days}`);
  check("request finalized APPROVED", (await SuperAdminRequest.findById(RID)).status === "APPROVED");

  // ---- Idempotent re-approval ----
  console.log("[5] Idempotent re-approval");
  let r5 = await makeCtx({}).call(approveRetailerRequest);
  check("returns 200 + alreadyApproved", r5.statusCode === 200 && r5.body?.alreadyApproved === true);
  check("no duplicate users", (await User.countDocuments({ email: EMAIL })) === 1);
  check(
    "no duplicate subscriptions",
    (await Subscription.countDocuments({ subscriberId: provisionedUser._id })) === 1
  );

  // ---- already-approved cannot be rejected ----
  console.log("[6] Reject after approve is refused");
  let r6 = await makeCtx({ rejectionReason: "test" }).call(rejectRetailerRequest);
  check("400 with clear message", r6.statusCode === 400, r6.body?.message || "");

  // ---- approved account still a valid tenant ----
  check(
    "approved account still SUPER_ADMIN + ACTIVE",
    provisionedUser.role === "SUPER_ADMIN" && provisionedUser.status === "ACTIVE"
  );

  if (createdTempSupreme) {
    await User.deleteOne({ _id: supreme._id });
    console.log("  [clean] removed temp supreme reviewer account");
  }

  console.log(`RESULTS: ${PASS} passed, ${FAIL} failed`);
  await cleanup();
  console.log("cleanup done");
  await mongoose.disconnect();
  process.exit(FAIL === 0 ? 0 : 1);
};

main().catch(async (err) => {
  console.error("VERIFY ERROR:", err);
  try {
    await cleanup();
  } catch {}
  await mongoose.disconnect();
  process.exit(1);
});
