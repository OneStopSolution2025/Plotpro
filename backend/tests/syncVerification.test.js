import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import { getSubscriptionInfo, createAdminAccount, toggleAdminStatus, getSuperAdminAnalytics } from "../controllers/superAdminController.js";
import { getSubscribers, getSubscriberById, getSeatUsage } from "../controllers/supremeAdminController.js";
import { protect } from "../middleware/authMiddleware.js";

const JWT_SECRET = process.env.JWT_SECRET || "dreamcity_super_secret_jwt_key_2026_dev";

async function runTests() {
  console.log("==================================================================");
  console.log("  RUNNING PLOTPRO COMPREHENSIVE CROSS-DASHBOARD TEST SUITE");
  console.log("==================================================================");

  await mongoose.connect("mongodb://127.0.0.1:27017/dreamcity");

  const supremeUser = await User.findOne({ email: "supreme@plotpro.in" });
  const superAdminUser = await User.findOne({ email: "superadmin@dreamcity.in" });
  const adminUser = await User.findOne({ email: "arun@dreamcity.in" });

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      testsPassed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      testsFailed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Authoritative Effective Seat Limit across Dashboards
    // -------------------------------------------------------------
    console.log("\n1. Testing Authoritative Effective Seat Entitlement (3 Seats on Starter)");
    const mockReqSuper = { user: superAdminUser };
    let superSubData = null;
    await getSubscriptionInfo(mockReqSuper, {
      status: (code) => ({
        json: (data) => {
          assert(code === 200, `getSubscriptionInfo returned HTTP ${code}`);
          superSubData = data.data;
        }
      })
    }, () => {});

    assert(superSubData && superSubData.assignedSeats === 3, `Super Admin assignedSeats is 3 (Actual: ${superSubData?.assignedSeats})`);
    assert(superSubData && superSubData.usedSeats === 3, `Super Admin usedSeats is 3 (Actual: ${superSubData?.usedSeats})`);
    assert(superSubData && superSubData.remainingSeats === 0, `Super Admin remainingSeats is 0 (Actual: ${superSubData?.remainingSeats})`);

    // Verify on Supreme Admin endpoints
    const mockReqSupreme = { user: supremeUser, query: {} };
    let supremeSubscribersData = null;
    await getSubscribers(mockReqSupreme, {
      status: (code) => ({
        json: (data) => {
          assert(code === 200, `getSubscribers returned HTTP ${code}`);
          supremeSubscribersData = data.data;
        }
      })
    }, () => {});

    const targetSub = supremeSubscribersData.find(s => s.email === "superadmin@dreamcity.in");
    assert(targetSub && targetSub.subscription.assignedSeats === 3, `Supreme Admin sees assignedSeats: 3 (Actual: ${targetSub?.subscription?.assignedSeats})`);
    assert(targetSub && targetSub.subscription.usedSeats === 3, `Supreme Admin sees usedSeats: 3 (Actual: ${targetSub?.subscription?.usedSeats})`);
    assert(targetSub && targetSub.activeAdminCount === 3, `Supreme Admin sees activeAdminCount: 3 (Actual: ${targetSub?.activeAdminCount})`);

    // -------------------------------------------------------------
    // Test 2: Reject Admin Creation When At Seat Limit
    // -------------------------------------------------------------
    console.log("\n2. Testing Admin Creation Rejection at Seat Limit (3 / 3)");
    const mockCreateReq = {
      user: superAdminUser,
      body: {
        name: "Surplus Agent",
        email: "surplus@dreamcity.in",
        mobile: "9999999999",
        password: "Password@123"
      }
    };

    let createStatus = null;
    let createErrorMsg = "";
    await createAdminAccount(mockCreateReq, {
      status: (code) => {
        createStatus = code;
        return {
          json: (data) => { createErrorMsg = data.message; }
        };
      }
    }, () => {});

    assert(createStatus === 400, `Surplus admin creation was rejected with HTTP 400 (Actual: ${createStatus})`);
    assert(createErrorMsg.includes("limit reached"), `Error message correctly reports limit reached: "${createErrorMsg}"`);

    // Verify no surplus user was created
    const surplusUser = await User.findOne({ email: "surplus@dreamcity.in" });
    assert(!surplusUser, "Surplus user was not created in database");

    // -------------------------------------------------------------
    // Test 3: Concurrency-Safe Seat Reservation under Race Condition
    // -------------------------------------------------------------
    console.log("\n3. Testing Concurrent Admin Creation Seat Guard");
    // Run 5 simultaneous creation promises against the 3/3 capacity
    const concurrentRequests = Array.from({ length: 5 }, (_, i) => {
      const req = {
        user: superAdminUser,
        body: {
          name: `Concurrent Agent ${i}`,
          email: `concurrent_${i}@dreamcity.in`,
          mobile: `999999990${i}`,
          password: "Password@123"
        }
      };
      return new Promise((resolve) => {
        createAdminAccount(req, {
          status: (code) => ({
            json: (data) => resolve({ code, data })
          })
        }, (err) => resolve({ code: 500, error: err }));
      });
    });

    const concurrentResults = await Promise.all(concurrentRequests);
    const successfulCreations = concurrentResults.filter(r => r.code === 201 || r.code === 200);
    assert(successfulCreations.length === 0, `All concurrent requests rejected when at capacity (Successful: ${successfulCreations.length})`);

    // -------------------------------------------------------------
    // Test 4: Admin Deactivation Releases Seat & Reactivation Reserves Seat
    // -------------------------------------------------------------
    console.log("\n4. Testing Admin Deactivation and Reactivation Seat Cycle");
    // Toggle arun@dreamcity.in to INACTIVE
    let toggleStatus1 = null;
    await toggleAdminStatus({ user: superAdminUser, params: { id: String(adminUser._id) } }, {
      status: (code) => {
        toggleStatus1 = code;
        return { json: () => {} };
      }
    }, () => {});

    assert(toggleStatus1 === 200, "Toggling admin to INACTIVE returned HTTP 200");
    const subAfterDeact = await Subscription.findOne({ subscriberId: superAdminUser._id });
    assert(subAfterDeact.usedSeats === 2, `Subscription usedSeats decremented to 2 (Actual: ${subAfterDeact.usedSeats})`);

    // Toggle arun@dreamcity.in back to ACTIVE
    let toggleStatus2 = null;
    await toggleAdminStatus({ user: superAdminUser, params: { id: String(adminUser._id) } }, {
      status: (code) => {
        toggleStatus2 = code;
        return { json: () => {} };
      }
    }, () => {});

    assert(toggleStatus2 === 200, "Toggling admin back to ACTIVE returned HTTP 200");
    const subAfterReact = await Subscription.findOne({ subscriberId: superAdminUser._id });
    assert(subAfterReact.usedSeats === 3, `Subscription usedSeats re-incremented to 3 (Actual: ${subAfterReact.usedSeats})`);

    // -------------------------------------------------------------
    // Test 5: Tenant Isolation in Analytics
    // -------------------------------------------------------------
    console.log("\n5. Testing Strict Tenant Scoping in Super Admin Analytics");
    let analyticsData = null;
    await getSuperAdminAnalytics(mockReqSuper, {
      status: (code) => ({
        json: (data) => {
          assert(code === 200, `getSuperAdminAnalytics returned HTTP ${code}`);
          analyticsData = data.data;
        }
      })
    }, () => {});

    assert(analyticsData && analyticsData.admins.total === 3, `Analytics reports 3 tenant admins (Actual: ${analyticsData?.admins?.total})`);
    assert(analyticsData && analyticsData.admins.active === 3, `Analytics reports 3 active tenant admins (Actual: ${analyticsData?.admins?.active})`);
    assert(analyticsData && analyticsData.projects.total === 27, `Analytics reports 27 tenant projects (Actual: ${analyticsData?.projects?.total})`);
    assert(analyticsData && analyticsData.enquiries.total === 7, `Analytics reports 7 project-linked enquiries (excluded 3 global enquiries with null projectId)`);

    // -------------------------------------------------------------
    // Test 6: Suspension Enforcement on Protected Backend APIs with Existing JWT
    // -------------------------------------------------------------
    console.log("\n6. Testing Account Suspension with Existing JWT Tokens");
    const superAdminToken = jwt.sign({ userId: superAdminUser._id, role: superAdminUser.role }, JWT_SECRET, { expiresIn: "1h" });
    const adminToken = jwt.sign({ userId: adminUser._id, role: adminUser.role }, JWT_SECRET, { expiresIn: "1h" });

    // Temporarily suspend Super Admin
    await User.updateOne({ _id: superAdminUser._id }, { $set: { status: "INACTIVE" } });

    // Test Super Admin request with valid JWT
    const mockSuperReqWithToken = {
      headers: { authorization: `Bearer ${superAdminToken}` }
    };
    let superBlockedCode = null;
    await protect(mockSuperReqWithToken, {
      status: (code) => {
        superBlockedCode = code;
        return { json: () => {} };
      }
    }, () => {});
    assert(superBlockedCode === 403, `Suspended Super Admin request blocked with HTTP 403 (Actual: ${superBlockedCode})`);

    // Test tenant Admin request with valid JWT while parent is suspended
    const mockAdminReqWithToken = {
      headers: { authorization: `Bearer ${adminToken}` }
    };
    let adminBlockedCode = null;
    await protect(mockAdminReqWithToken, {
      status: (code) => {
        adminBlockedCode = code;
        return { json: () => {} };
      }
    }, () => {});
    assert(adminBlockedCode === 403, `Admin request blocked when parent subscriber is suspended (Actual: ${adminBlockedCode})`);

    // Restore Super Admin to ACTIVE
    await User.updateOne({ _id: superAdminUser._id }, { $set: { status: "ACTIVE" } });

    let superRestoredNext = false;
    await protect(mockSuperReqWithToken, {
      status: () => ({ json: () => {} })
    }, () => { superRestoredNext = true; });
    assert(superRestoredNext === true, "Reactivated Super Admin access immediately restored via existing JWT");

    // -------------------------------------------------------------
    // Test 7: Zero GET Mutation Verification
    // -------------------------------------------------------------
    console.log("\n7. Testing Zero GET Mutation in getSubscriptionInfo");
    const subBeforeGet = await Subscription.findOne({ subscriberId: superAdminUser._id }).lean();
    await getSubscriptionInfo(mockReqSuper, {
      status: () => ({ json: () => {} })
    }, () => {});
    const subAfterGet = await Subscription.findOne({ subscriberId: superAdminUser._id }).lean();

    assert(
      subBeforeGet.updatedAt.getTime() === subAfterGet.updatedAt.getTime(),
      `Subscription updatedAt timestamp unchanged by GET request (${subBeforeGet.updatedAt.toISOString()})`
    );

  } catch (err) {
    console.error("Test execution encountered an error:", err);
  } finally {
    console.log("\n==================================================================");
    console.log(`  TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log("==================================================================");
    await mongoose.disconnect();
    process.exit(testsFailed === 0 ? 0 : 1);
  }
}

runTests();
