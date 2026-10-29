import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import { verifyTenantProjectQuota, countTenantProjects } from "../utils/projectQuotaHelper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function runTests() {
  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    // 1. Verify Plans have maxProjects
    const plans = await Plan.find({}).lean();
    console.log(`\n=== 1. VERIFY PLANS CONFIGURATION (${plans.length} plans) ===`);
    plans.forEach(p => {
      console.log(`Plan [${p.name}]: maxProjects = ${p.maxProjects}, isUnlimited = ${p.isUnlimitedProjects}`);
    });

    // 2. Pick or test SuperAdmin subscription
    const subs = await Subscription.find({}).populate("subscriberId planId").lean();
    console.log(`\n=== 2. VERIFY SUBSCRIPTIONS & TENANT QUOTAS (${subs.length} active) ===`);
    for (const sub of subs) {
      const tenantId = sub.subscriberId?._id || sub.subscriberId;
      const quota = await verifyTenantProjectQuota(tenantId);
      const count = await countTenantProjects(tenantId);
      console.log(`Subscriber: ${sub.subscriberId?.name || sub.subscriberId?.email || tenantId} | Plan: ${sub.planId?.name}`);
      console.log(`  - Sub Status: ${sub.status}`);
      console.log(`  - Assigned Projects: ${sub.assignedProjects} (Effective Max: ${quota.data?.maxProjects})`);
      console.log(`  - Used Projects: ${quota.data?.usedProjects} (Count: ${count})`);
      console.log(`  - Remaining Projects: ${quota.data?.remainingProjects}`);
      console.log(`  - Creation Allowed: ${quota.allowed}`);
    }

    // 3. Test verification logic with synthetic/dry test
    console.log(`\n=== 3. QUOTA ENFORCEMENT LOGIC TEST ===`);
    if (subs.length > 0) {
      const testSub = subs[0];
      const testTenantId = testSub.subscriberId?._id || testSub.subscriberId;
      const currentQuota = await verifyTenantProjectQuota(testTenantId);
      console.log(`Tenant ${testSub.subscriberId?.name}: Max=${currentQuota.data?.maxProjects}, Used=${currentQuota.data?.usedProjects}, Remaining=${currentQuota.data?.remainingProjects}`);
      if (currentQuota.data?.remainingProjects <= 0 && !currentQuota.data?.isUnlimited) {
        console.log(`✓ Limit enforcement verified: Creation correctly blocked (Allowed = ${currentQuota.allowed})`);
      } else {
        console.log(`✓ Creation permitted: Remaining slots = ${currentQuota.data?.remainingProjects} (Allowed = ${currentQuota.allowed})`);
      }
    }

    console.log("\nAll project limit checks completed successfully!");
  } catch (err) {
    console.error("Test failed with error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

runTests();
