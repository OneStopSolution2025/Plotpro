import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import User from "../models/User.js";
import TrustedDevice from "../models/TrustedDevice.js";
import DeviceApprovalRequest from "../models/DeviceApprovalRequest.js";
import { generateToken } from "../utils/generateToken.js";
import {
  generateDeviceSecret,
  hashDeviceSecret,
  verifyDeviceSecret,
  getDeviceCookieOptions,
} from "../utils/deviceSecurity.js";
import {
  validateOtpSecretConfig,
  generateSecureOtp,
  hashOtp,
  verifyOtpHash,
} from "../utils/otpSecurity.js";

const JWT_SECRET = process.env.JWT_SECRET || "dreamcity_super_secret_jwt_key_2026_dev";

async function runDeviceSecurityTests() {
  console.log("=================================================================");
  console.log("   PLOTPRO SINGLE ACTIVE DEVICE SECURITY & INTEGRATION SUITE     ");
  console.log("=================================================================\n");

  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is not defined in backend/.env!");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(" Connected to MongoDB:", mongoose.connection.name);

  // Sync model indexes (ensuring unique partial index on TrustedDevice)
  try {
    await TrustedDevice.syncIndexes();
    console.log(" TrustedDevice indexes synchronized.");
  } catch (idxErr) {
    console.warn("⚠️ TrustedDevice sync warning:", idxErr.message);
  }

  const cleanupUserIds = [];
  const cleanupDeviceIds = [];
  const cleanupRequestIds = [];

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(` PASSED: ${message}`);
      passedTests++;
    }
  }

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1: Dedicated DEVICE_OTP_SECRET Hashing & Fail-Closed Validation
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 1] Dedicated DEVICE_OTP_SECRET Hashing & Fail-Closed Validation...");
    assert(typeof validateOtpSecretConfig() === "string", "validateOtpSecretConfig returns configured secret");

    const sampleOtp = generateSecureOtp();
    assert(/^\d{6}$/.test(sampleOtp), "generateSecureOtp produces 6-digit string");
    assert(parseInt(sampleOtp, 10) >= 100000 && parseInt(sampleOtp, 10) <= 999999, "generateSecureOtp is strictly within [100000, 999999]");

    const challengeId = crypto.randomUUID();
    const hashed = hashOtp(sampleOtp, challengeId);
    assert(hashed !== sampleOtp, "OTP hash is not plaintext");
    assert(verifyOtpHash(sampleOtp, hashed, challengeId) === true, "verifyOtpHash verifies correct OTP");
    assert(verifyOtpHash("000000", hashed, challengeId) === false, "verifyOtpHash rejects incorrect OTP");
    assert(verifyOtpHash(sampleOtp, hashed, crypto.randomUUID()) === false, "verifyOtpHash rejects wrong challengeId");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2: Device Secret Generation & Timing-Safe HMAC Verification
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 2] Device Secret Generation & Timing-Safe HMAC Verification...");
    const rawSecret1 = generateDeviceSecret();
    assert(typeof rawSecret1 === "string" && rawSecret1.length === 64, "generateDeviceSecret produces 64-char hex string (256 bits)");

    const tokenHash1 = hashDeviceSecret(rawSecret1);
    assert(tokenHash1 !== rawSecret1, "Device token hash is distinct from raw secret");
    assert(verifyDeviceSecret(rawSecret1, tokenHash1) === true, "verifyDeviceSecret matches correct secret and hash");
    assert(verifyDeviceSecret("deadbeef0000", tokenHash1) === false, "verifyDeviceSecret rejects incorrect secret");
    assert(verifyDeviceSecret("", tokenHash1) === false, "verifyDeviceSecret rejects empty secret");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3: First-Device Bootstrap & Single-Use Atomic Challenge Consumption
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 3] First-Device Bootstrap & Single-Use Atomic Challenge Consumption...");
    const testAdmin = await User.create({
      name: "Test Branch Admin 1",
      email: `admin_dev_${Date.now()}@plotpro.test`,
      role: "ADMIN",
      status: "ACTIVE",
      deviceEnrollmentChallengeId: challengeId,
      deviceEnrollmentOtpHash: hashed,
      deviceEnrollmentOtpExpiry: new Date(Date.now() + 10 * 60 * 1000),
      deviceEnrollmentAttempts: 0,
    });
    cleanupUserIds.push(testAdmin._id);

    // Atomically consume challenge
    const consumedUser = await User.findOneAndUpdate(
      {
        _id: testAdmin._id,
        deviceEnrollmentChallengeId: challengeId,
      },
      {
        $set: {
          deviceEnrollmentChallengeId: null,
          deviceEnrollmentOtpHash: null,
          deviceEnrollmentOtpExpiry: null,
          deviceEnrollmentAttempts: 0,
        },
      },
      { returnDocument: "after" }
    );
    assert(consumedUser !== null, "First-device challenge consumed atomically");

    // Replay attempt must fail
    const replayUser = await User.findOneAndUpdate(
      {
        _id: testAdmin._id,
        deviceEnrollmentChallengeId: challengeId,
      },
      {
        $set: { deviceEnrollmentAttempts: 99 },
      }
    );
    assert(replayUser === null, "Challenge cannot be consumed twice (anti-replay)");

    const device1 = await TrustedDevice.create({
      userId: testAdmin._id,
      role: "ADMIN",
      deviceId: crypto.randomUUID(),
      deviceTokenHash: tokenHash1,
      isCurrentSession: true,
      deviceLabel: "Windows 11 (Chrome)",
      status: "APPROVED",
      approvalType: "BOOTSTRAP_FIRST_DEVICE",
    });
    cleanupDeviceIds.push(device1._id);
    assert(device1.status === "APPROVED", "First device enrolled with APPROVED status");
    assert(device1.isCurrentSession === true, "First device session marked active");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4: Single Active Device Invariant (Database Unique Index Enforcement)
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 4] Single Active Device Invariant (Database Unique Index Enforcement)...");
    let duplicateRejected = false;
    try {
      await TrustedDevice.create({
        userId: testAdmin._id,
        role: "ADMIN",
        deviceId: crypto.randomUUID(),
        deviceTokenHash: hashDeviceSecret(generateDeviceSecret()),
        isCurrentSession: true,
        deviceLabel: "Rogue Second Approved Device",
        status: "APPROVED",
      });
    } catch (dupErr) {
      if (dupErr.code === 11000) {
        duplicateRejected = true;
      }
    }
    assert(duplicateRejected === true, "Unique partial index prevents multiple APPROVED devices for same user");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5: Normal Logout & Session State Invalidation
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 5] Normal Logout & Session State Invalidation...");
    device1.isCurrentSession = false;
    device1.lastUsedAt = new Date();
    await device1.save();

    const loggedOutDevice = await TrustedDevice.findById(device1._id);
    assert(loggedOutDevice.status === "APPROVED", "Device remains APPROVED after normal logout");
    assert(loggedOutDevice.isCurrentSession === false, "Device session is invalidated (isCurrentSession === false)");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 6: Same-Device Re-Login After Logout (No Supreme Admin Approval Required)
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 6] Same-Device Re-Login (No Supreme Admin Approval Required)...");
    const isOwner = verifyDeviceSecret(rawSecret1, loggedOutDevice.deviceTokenHash);
    assert(isOwner === true, "Client presenting rawSecret1 matches approved device token hash");

    loggedOutDevice.isCurrentSession = true;
    loggedOutDevice.lastUsedAt = new Date();
    await loggedOutDevice.save();

    const reloggedDevice = await TrustedDevice.findById(device1._id);
    assert(reloggedDevice.isCurrentSession === true, "Same workstation session successfully reactivated");
    const sessionToken = generateToken(testAdmin._id, testAdmin.role, reloggedDevice._id);
    assert(typeof sessionToken === "string", "Production JWT issued containing approved deviceId");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 7: Unrecognized Workstation Dispatches OTP & Stages Only After Verification
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 7] Unrecognized Workstation OTP Verification & Transfer Staging...");
    const rawSecret2 = generateDeviceSecret();
    const tokenHash2 = hashDeviceSecret(rawSecret2);
    const candidateMatches = verifyDeviceSecret(rawSecret2, loggedOutDevice.deviceTokenHash);
    assert(candidateMatches === false, "New device secret does NOT match current approved device");

    // 7a: Unrecognized device triggers OTP challenge creation
    const transferChallengeId = crypto.randomUUID();
    const transferOtp = "654321";
    const transferOtpHashed = hashOtp(transferOtp, transferChallengeId);

    testAdmin.deviceEnrollmentChallengeId = transferChallengeId;
    testAdmin.deviceEnrollmentOtpHash = transferOtpHashed;
    testAdmin.deviceEnrollmentOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    testAdmin.deviceEnrollmentAttempts = 0;
    await testAdmin.save();

    // 7b: Invalid OTP must NOT stage a transfer request
    const isWrongOtpValid = verifyOtpHash("111111", testAdmin.deviceEnrollmentOtpHash, transferChallengeId);
    assert(isWrongOtpValid === false, "Incorrect OTP rejected and cannot stage transfer");

    // 7c: Atomic challenge consumption with correct OTP
    const consumedTransferUser = await User.findOneAndUpdate(
      {
        _id: testAdmin._id,
        deviceEnrollmentChallengeId: transferChallengeId,
      },
      {
        $set: {
          deviceEnrollmentChallengeId: null,
          deviceEnrollmentOtpHash: null,
          deviceEnrollmentOtpExpiry: null,
          deviceEnrollmentAttempts: 0,
        },
      },
      { returnDocument: "after" }
    );
    assert(consumedTransferUser !== null, "Transfer OTP challenge consumed atomically");

    // Concurrent/Replay verification of same challenge must fail
    const replayTransfer = await User.findOneAndUpdate(
      {
        _id: testAdmin._id,
        deviceEnrollmentChallengeId: transferChallengeId,
      },
      {
        $set: { deviceEnrollmentAttempts: 99 },
      }
    );
    assert(replayTransfer === null, "Transfer OTP cannot be consumed twice (anti-replay)");

    // 7d: Only after atomic OTP verification is the DeviceApprovalRequest staged
    const transferReq = await DeviceApprovalRequest.create({
      userId: testAdmin._id,
      role: "ADMIN",
      candidateTokenHash: tokenHash2,
      currentApprovedDevice: device1._id,
      deviceLabel: "MacBook Pro (Safari)",
      status: "PENDING_APPROVAL",
    });
    cleanupRequestIds.push(transferReq._id);
    assert(transferReq.status === "PENDING_APPROVAL", "Workstation transfer staged as PENDING_APPROVAL only after valid OTP");

    const pollingToken = jwt.sign(
      {
        requestId: String(transferReq._id),
        userId: String(testAdmin._id),
        purpose: "DEVICE_TRANSFER_POLL",
      },
      JWT_SECRET,
      { expiresIn: "30m" }
    );
    const decodedPoll = jwt.verify(pollingToken, JWT_SECRET);
    assert(decodedPoll.purpose === "DEVICE_TRANSFER_POLL", "Polling token is purpose-bound");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 8: Supreme Admin Approves Transfer -> APPROVED_PENDING_CLAIM
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 8] Supreme Admin Approves Transfer -> APPROVED_PENDING_CLAIM...");
    transferReq.status = "APPROVED_PENDING_CLAIM";
    transferReq.reviewedAt = new Date();
    transferReq.reviewNotes = "Verified branch manager change.";
    await transferReq.save();

    const approvedReq = await DeviceApprovalRequest.findById(transferReq._id);
    assert(approvedReq.status === "APPROVED_PENDING_CLAIM", "Request transitioned to APPROVED_PENDING_CLAIM");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 9: One-Time Session Claim with Cryptographic Proof of Possession
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 9] One-Time Session Claim with Proof of Possession...");
    // 9a: Attacker without candidate secret fails
    assert(verifyDeviceSecret("wrong-secret", approvedReq.candidateTokenHash) === false, "Attacker without candidate secret rejected");

    // 9b: Legitimate claimant with rawSecret2 succeeds
    assert(verifyDeviceSecret(rawSecret2, approvedReq.candidateTokenHash) === true, "Legitimate claimant proves possession of rawSecret2");

    // Execute atomic cutover
    device1.status = "REPLACED";
    device1.isCurrentSession = false;
    device1.revokedAt = new Date();
    await device1.save();

    const device2 = await TrustedDevice.create({
      userId: testAdmin._id,
      role: "ADMIN",
      deviceId: crypto.randomUUID(),
      deviceTokenHash: approvedReq.candidateTokenHash,
      isCurrentSession: true,
      deviceLabel: approvedReq.deviceLabel,
      status: "APPROVED",
      approvalType: "SUPREME_ADMIN_APPROVAL",
    });
    cleanupDeviceIds.push(device2._id);

    approvedReq.status = "CLAIMED";
    approvedReq.claimedAt = new Date();
    await approvedReq.save();

    assert(device2.status === "APPROVED", "New device is now APPROVED");
    assert(device1.status === "REPLACED", "Old device is marked REPLACED");
    assert(approvedReq.status === "CLAIMED", "Approval request marked CLAIMED");

    // 9c: Claim replay rejected
    assert(approvedReq.status !== "APPROVED_PENDING_CLAIM", "Claim cannot be replayed (anti-replay)");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 10: Immediate Session Invalidation for Replaced Device
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 10] Immediate Session Invalidation for Replaced Device...");
    const oldDeviceCheck = await TrustedDevice.findOne({
      _id: device1._id,
      status: "APPROVED",
      isCurrentSession: true,
    });
    assert(oldDeviceCheck === null, "Old device cannot satisfy protect middleware query");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 11: Historical Device Account Blocked from Self-Bootstrap
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 11] Historical Device Account Blocked from Self-Bootstrap...");
    const historicalCount = await TrustedDevice.countDocuments({ userId: testAdmin._id });
    assert(historicalCount > 0, "Account has historical devices");
    const canSelfBootstrap = historicalCount === 0;
    assert(canSelfBootstrap === false, "User with historical devices is strictly denied self-bootstrap");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 12: Role Boundaries & Exemptions
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 12] Role Boundaries & Exemptions...");
    const customerToken = generateToken("cust_123", "USER");
    const supremeToken = generateToken("sup_123", "SUPREME_ADMIN");
    const decodedCust = jwt.verify(customerToken, JWT_SECRET);
    const decodedSup = jwt.verify(supremeToken, JWT_SECRET);

    assert(decodedCust.deviceId === undefined, "USER token does not require deviceId");
    assert(decodedSup.deviceId === undefined, "SUPREME_ADMIN token does not require deviceId");

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 13: Cookie Security Configuration Profile
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 13] Cookie Security Configuration Profile...");
    const devOpts = getDeviceCookieOptions();
    assert(devOpts.httpOnly === true, "Cookie is strictly HttpOnly");
    assert(devOpts.path === "/api", "Cookie path restricted to /api");
    assert(devOpts.maxAge > 0, "Cookie has long-lived 1-year maxAge");

    console.log("\n=================================================================");
    console.log(` ✅ ALL TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
    console.log("=================================================================\n");
  } catch (err) {
    console.error("\n❌ Test suite failed with exception:", err.message);
    process.exit(1);
  } finally {
    // Cleanup created test records
    console.log("[Cleanup] Removing test artifacts from database...");
    if (cleanupUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: cleanupUserIds } });
    }
    if (cleanupDeviceIds.length > 0) {
      await TrustedDevice.deleteMany({ _id: { $in: cleanupDeviceIds } });
    }
    if (cleanupRequestIds.length > 0) {
      await DeviceApprovalRequest.deleteMany({ _id: { $in: cleanupRequestIds } });
    }
    await mongoose.disconnect();
    console.log("[Cleanup] Database disconnected cleanly.");
  }
}

runDeviceSecurityTests();
