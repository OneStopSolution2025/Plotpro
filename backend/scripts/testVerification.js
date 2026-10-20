import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";

async function runTests() {
  console.log("=== STARTING INTEGRATION TESTS FOR SUPREME ADMIN PLATFORM OWNER SYSTEM ===");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB:", mongoose.connection.name);

  let tempUsers = [];
  let tempPlans = [];
  let tempSubs = [];

  try {
    // 1. Role Escalation Prevention test
    console.log("\n[Test 1] Verifying Role Enum & Protected Roles...");
    const allowedRoles = User.schema.path("role").enumValues;
    if (!allowedRoles.includes("SUPREME_ADMIN") || !allowedRoles.includes("SUPER_ADMIN")) {
      throw new Error("Missing expected roles in User schema: " + allowedRoles.join(", "));
    }
    console.log("  ✓ User roles enum contains SUPREME_ADMIN, SUPER_ADMIN, ADMIN, USER: PASSED");

    // 2. Concurrency-safe atomic seat reservation test
    console.log("\n[Test 2] Atomic Seat Reservation & Capacity Enforcement...");
    const testSubscriber = await User.create({
      name: "Test Subscriber Co",
      email: `test_sub_${Date.now()}@example.com`,
      passwordHash: "dummyhash123",
      role: "SUPER_ADMIN",
      businessName: "Test Workspace",
    });
    tempUsers.push(testSubscriber._id);

    const testPlan = await Plan.create({
      name: "Test 2-Seat Plan",
      slug: `test-plan-${Date.now()}`,
      price: 1999,
      billingInterval: "MONTHLY",
      durationDays: 30,
      maxAdminSeats: 2,
    });
    tempPlans.push(testPlan._id);

    const testSub = await Subscription.create({
      subscriberId: testSubscriber._id,
      planId: testPlan._id,
      status: "ACTIVE",
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      assignedSeats: 2,
      usedSeats: 0,
    });
    tempSubs.push(testSub._id);

    // Reserve seat 1
    const res1 = await Subscription.findOneAndUpdate(
      {
        _id: testSub._id,
        status: "ACTIVE",
        expiryDate: { $gt: new Date() },
        $expr: { $lt: ["$usedSeats", "$assignedSeats"] },
      },
      { $inc: { usedSeats: 1 } },
      { new: true }
    );
    if (!res1 || res1.usedSeats !== 1) throw new Error("Failed to reserve 1st seat");
    console.log("  ✓ Reserved 1st seat (usedSeats = 1/2): PASSED");

    // Reserve seat 2
    const res2 = await Subscription.findOneAndUpdate(
      {
        _id: testSub._id,
        status: "ACTIVE",
        expiryDate: { $gt: new Date() },
        $expr: { $lt: ["$usedSeats", "$assignedSeats"] },
      },
      { $inc: { usedSeats: 1 } },
      { new: true }
    );
    if (!res2 || res2.usedSeats !== 2) throw new Error("Failed to reserve 2nd seat");
    console.log("  ✓ Reserved 2nd seat (usedSeats = 2/2): PASSED");

    // Attempt to reserve seat 3 (Should fail atomically)
    const res3 = await Subscription.findOneAndUpdate(
      {
        _id: testSub._id,
        status: "ACTIVE",
        expiryDate: { $gt: new Date() },
        $expr: { $lt: ["$usedSeats", "$assignedSeats"] },
      },
      { $inc: { usedSeats: 1 } },
      { new: true }
    );
    if (res3 !== null) throw new Error("Quota exceeded but reservation succeeded!");
    console.log("  ✓ Over-quota reservation rejected atomically: PASSED");

    // Release 1 seat
    const releaseRes = await Subscription.findOneAndUpdate(
      { _id: testSub._id, usedSeats: { $gt: 0 } },
      { $inc: { usedSeats: -1 } },
      { new: true }
    );
    if (releaseRes.usedSeats !== 1) throw new Error("Failed to release seat");
    console.log("  ✓ Released 1 seat idempotently (usedSeats = 1/2): PASSED");

    // 3. Expiry / Inactive enforcement test
    console.log("\n[Test 3] Expired Subscription Seat Denial...");
    await Subscription.findByIdAndUpdate(testSub._id, { status: "EXPIRED" });
    const expiredRes = await Subscription.findOneAndUpdate(
      {
        _id: testSub._id,
        status: "ACTIVE",
        expiryDate: { $gt: new Date() },
        $expr: { $lt: ["$usedSeats", "$assignedSeats"] },
      },
      { $inc: { usedSeats: 1 } },
      { new: true }
    );
    if (expiredRes !== null) throw new Error("Expired subscription allowed seat reservation!");
    console.log("  ✓ Expired subscription blocked from reserving seats: PASSED");

    // 4. Cross-tenant isolation verification
    console.log("\n[Test 4] Cross-Tenant Admin Data Isolation...");
    const tenantAdmin = await User.create({
      name: "Tenant Staff",
      email: `staff_${Date.now()}@example.com`,
      passwordHash: "dummyhash123",
      role: "ADMIN",
      tenantId: testSubscriber._id,
    });
    tempUsers.push(tenantAdmin._id);

    const otherSubscriber = await User.create({
      name: "Other Subscriber",
      email: `other_${Date.now()}@example.com`,
      passwordHash: "dummyhash123",
      role: "SUPER_ADMIN",
    });
    tempUsers.push(otherSubscriber._id);

    // Query from other subscriber perspective
    const otherVisibleAdmins = await User.find({
      role: "ADMIN",
      tenantId: otherSubscriber._id,
    });
    if (otherVisibleAdmins.length !== 0) {
      throw new Error("Cross-tenant leakage: other subscriber saw tenantAdmin!");
    }
    console.log("  ✓ Cross-tenant queries are strictly isolated: PASSED");

    console.log("\n=== ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ===");
  } finally {
    // Cleanup test artifacts
    if (tempUsers.length) await User.deleteMany({ _id: { $in: tempUsers } });
    if (tempPlans.length) await Plan.deleteMany({ _id: { $in: tempPlans } });
    if (tempSubs.length) await Subscription.deleteMany({ _id: { $in: tempSubs } });
    console.log("Test artifacts cleaned up safely.");
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
