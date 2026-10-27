import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import Plan from "../models/Plan.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Branch from "../models/Branch.js";
import { ensureStandardPackages } from "./ensureStandardPackages.js";
import { createBranch, deleteBranch } from "../controllers/branchController.js";
import { createAdminAccount } from "../controllers/superAdminController.js";
import {
  assignSubscriberSubscription,
} from "../controllers/supremeAdminController.js";

// Mock Express req/res
function createMockReqRes(body = {}, user = {}, params = {}, query = {}) {
  const req = { body, user, params, query };
  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  const next = (err) => {
    statusCode = 500;
    responseData = { success: false, message: err?.message || String(err) };
  };

  return { req, res, getStatus: () => statusCode, getData: () => responseData, next };
}

async function runTests() {
  console.log("==================================================================");
  console.log("   PlotPro: Seat Limits & Admin Provisioning Test Suite");
  console.log("==================================================================\n");

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not defined.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("[Setup] Connected to database.\n");

  const createdUserIds = [];
  const createdBranchIds = [];
  const createdSubIds = [];
  const createdSeatRequestIds = [];

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // ---------------------------------------------------------------
    // Test 1: Standard Packages Verification
    // ---------------------------------------------------------------
    console.log("Test 1: Standard Packages Verification");
    await ensureStandardPackages();

    const basicPlan = await Plan.findOne({ slug: "basic" });
    const growthPlan = await Plan.findOne({ slug: "growth" });
    const elitePlan = await Plan.findOne({ slug: "elite" });

    assert(basicPlan && basicPlan.maxAdminSeats === 0, "Basic package exists with 0 default seats");
    assert(growthPlan && growthPlan.maxAdminSeats === 2, "Growth package exists with 2 default seats");
    assert(elitePlan && elitePlan.maxAdminSeats === 3, "Elite package exists with 3 default seats");

    // ---------------------------------------------------------------
    // Test 2: Basic Package (0 Seats) Strict Blocking
    // ---------------------------------------------------------------
    console.log("\nTest 2: Basic Package (0 Seats) Strict Blocking");
    const testBasicSubscriber = await User.create({
      name: "Basic Subscriber",
      email: `basic-sub-${Date.now()}@example.com`,
      passwordHash: await bcrypt.hash("Password123", 10),
      role: "SUPER_ADMIN",
      businessName: "Basic Realty",
      status: "ACTIVE",
    });
    createdUserIds.push(testBasicSubscriber._id);

    const basicSubDoc = await Subscription.create({
      subscriberId: testBasicSubscriber._id,
      planId: basicPlan._id,
      assignedSeats: 0,
      usedSeats: 0,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
    });
    createdSubIds.push(basicSubDoc._id);

    // Attempt to create Branch under Basic plan
    const { req: bReq, res: bRes, getStatus: bStatus, getData: bData, next: bNext } = createMockReqRes(
      {
        name: "Basic Branch",
        city: "Chennai",
        adminName: "Basic Admin",
        adminEmail: `basic-admin-${Date.now()}@example.com`,
        adminPassword: "Password123",
      },
      testBasicSubscriber
    );

    await createBranch(bReq, bRes, bNext);
    assert(
      bStatus() === 400 && bData()?.message?.includes("seat limit reached"),
      `Basic subscriber with 0 seats was blocked with 400: "${bData()?.message}"`
    );

    // ---------------------------------------------------------------
    // Test 3: Growth Package (2 Seats) Provisioning & Cap Enforcement
    // ---------------------------------------------------------------
    console.log("\nTest 3: Growth Package (2 Seats) Provisioning & Cap Enforcement");
    const testGrowthSubscriber = await User.create({
      name: "Growth Subscriber",
      email: `growth-sub-${Date.now()}@example.com`,
      passwordHash: await bcrypt.hash("Password123", 10),
      role: "SUPER_ADMIN",
      businessName: "Growth Realty",
      status: "ACTIVE",
    });
    createdUserIds.push(testGrowthSubscriber._id);

    const growthSubDoc = await Subscription.create({
      subscriberId: testGrowthSubscriber._id,
      planId: growthPlan._id,
      assignedSeats: 2,
      usedSeats: 0,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
    });
    createdSubIds.push(growthSubDoc._id);

    // Branch 1
    const { req: gReq1, res: gRes1, getStatus: gStatus1, getData: gData1, next: gNext1 } = createMockReqRes(
      {
        name: "Growth Branch 1",
        city: "Madurai",
        adminName: "Growth Admin 1",
        adminEmail: `growth-admin1-${Date.now()}@example.com`,
        adminPassword: "Password123",
      },
      testGrowthSubscriber
    );
    await createBranch(gReq1, gRes1, gNext1);
    assert(gStatus1() === 201 && gData1()?.success, "Branch 1 (1/2 seats) created successfully");
    if (gData1()?.data?.id) createdBranchIds.push(gData1().data.id);

    // Branch 2
    const { req: gReq2, res: gRes2, getStatus: gStatus2, getData: gData2, next: gNext2 } = createMockReqRes(
      {
        name: "Growth Branch 2",
        city: "Coimbatore",
        adminName: "Growth Admin 2",
        adminEmail: `growth-admin2-${Date.now()}@example.com`,
        adminPassword: "Password123",
      },
      testGrowthSubscriber
    );
    await createBranch(gReq2, gRes2, gNext2);
    assert(gStatus2() === 201 && gData2()?.success, "Branch 2 (2/2 seats) created successfully");
    if (gData2()?.data?.id) createdBranchIds.push(gData2().data.id);

    // Branch 3 (Should fail: 2 seats max)
    const { req: gReq3, res: gRes3, getStatus: gStatus3, getData: gData3, next: gNext3 } = createMockReqRes(
      {
        name: "Growth Branch 3",
        city: "Salem",
        adminName: "Growth Admin 3",
        adminEmail: `growth-admin3-${Date.now()}@example.com`,
        adminPassword: "Password123",
      },
      testGrowthSubscriber
    );
    await createBranch(gReq3, gRes3, gNext3);
    assert(
      gStatus3() === 400 && gData3()?.message?.includes("seat limit reached"),
      `Branch 3 blocked with 400 when capacity reached: "${gData3()?.message}"`
    );

    // ---------------------------------------------------------------
    // Test 4: Supreme Admin Seat Reduction Protection
    // ---------------------------------------------------------------
    console.log("\nTest 4: Supreme Admin Seat Reduction Protection");
    const supremeAdminUser = await User.findOne({ role: "SUPREME_ADMIN" }) || {
      _id: new mongoose.Types.ObjectId(),
      role: "SUPREME_ADMIN",
      name: "Supreme Test Admin",
    };

    // Attempt to reduce Growth subscriber's limit from 2 to 1 (while 2 are active)
    const { req: redReq, res: redRes, getStatus: redStatus, getData: redData, next: redNext } = createMockReqRes(
      {
        planId: growthPlan._id,
        assignedSeats: 1,
        isCustomOverride: true,
        customOverrideReason: "Attempted reduction",
      },
      supremeAdminUser,
      { id: testGrowthSubscriber._id }
    );

    await assignSubscriberSubscription(redReq, redRes, redNext);
    assert(
      redStatus() === 400 && redData()?.message?.includes("Cannot reduce seat limit"),
      `Supreme Admin seat reduction below active count blocked with 400: "${redData()?.message}"`
    );

    // ---------------------------------------------------------------
    // Test 5: Anti-Bypass Deletion Policy
    // ---------------------------------------------------------------
    console.log("\nTest 5: Anti-Bypass Deletion Policy");
    // Delete Branch 2
    const branch2Id = gData2()?.data?.id;
    const { req: delReq, res: delRes, getStatus: delStatus, getData: delData, next: delNext } = createMockReqRes(
      {},
      testGrowthSubscriber,
      { id: branch2Id }
    );

    await deleteBranch(delReq, delRes, delNext);
    assert(delStatus() === 200, "Branch 2 deleted successfully");

    const reloadedSub = await Subscription.findById(growthSubDoc._id);
    assert(
      reloadedSub.usedSeats === 1 && reloadedSub.assignedSeats === 2,
      `usedSeats decremented to 1, assignedSeats remained strictly 2 (no extra seats gained)`
    );

    // Re-fill the released seat (Branch 2 replacement)
    const { req: fillReq, res: fillRes, getStatus: fillStatus, getData: fillData, next: fillNext } = createMockReqRes(
      {
        name: "Growth Branch 2 Replacement",
        city: "Tiruppur",
        adminName: "Growth Admin Replacement",
        adminEmail: `growth-repl-${Date.now()}@example.com`,
        adminPassword: "Password123",
      },
      testGrowthSubscriber
    );
    await createBranch(fillReq, fillRes, fillNext);
    assert(fillStatus() === 201, "Filling released seat succeeded (now 2/2)");
    if (fillData()?.data?.id) createdBranchIds.push(fillData().data.id);

    // Attempting another branch still rejected
    const { req: fillReq2, res: fillRes2, getStatus: fillStatus2, getData: fillData2, next: fillNext2 } = createMockReqRes(
      {
        name: "Growth Branch Extra",
        city: "Erode",
        adminName: "Growth Admin Extra",
        adminEmail: `growth-extra-${Date.now()}@example.com`,
        adminPassword: "Password123",
      },
      testGrowthSubscriber
    );
    await createBranch(fillReq2, fillRes2, fillNext2);
    assert(fillStatus2() === 400, "Extra branch creation strictly blocked at 2/2 seats");

    } catch (err) {
    console.error("Test Suite Execution Error:", err);
    failed++;
  } finally {
    // Teardown temporary test documents
    console.log("\n[Teardown] Cleaning up test data...");
    if (createdBranchIds.length) {
      await Branch.deleteMany({ _id: { $in: createdBranchIds } });
    }
    if (createdSubIds.length) {
      await Subscription.deleteMany({ _id: { $in: createdSubIds } });
    }
    if (createdUserIds.length) {
      // Find all admins created for these test subscribers
      await User.deleteMany({ tenantId: { $in: createdUserIds } });
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }

    await mongoose.disconnect();
    console.log("[Teardown] Completed.\n");

    console.log("==================================================================");
    console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
    console.log("==================================================================");

    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
