import mongoose from "mongoose";
import dotenv from "dotenv";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import User from "../models/User.js";
import { vectorizationService } from "../services/vectorizationService.js";
import {
  saveProjectLayoutSuperAdmin,
  detectLayoutCandidatesSuperAdmin,
} from "../controllers/superAdminController.js";

dotenv.config();

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}: PASS`);
    passed++;
  } else {
    console.error(`  ✗ ${message}: FAIL`);
    failed++;
  }
}

async function runTests() {
  console.log("=== STARTING COMPREHENSIVE BLOCK VECTORIZATION & CONCURRENCY TESTS ===");

  // 1. Anti-SSRF URL Validation Unit Tests
  console.log("\n[Test Suite 1] Anti-SSRF and Cloudinary Asset Verification");
  try {
    vectorizationService.validateSourceUrl("http://localhost:5000/malicious.png");
    assert(false, "Should reject http protocol and localhost");
  } catch (err) {
    assert(err.message.includes("Insecure") || err.message.includes("Untrusted"), "Blocked localhost and non-https protocol");
  }

  try {
    vectorizationService.validateSourceUrl("https://169.254.169.254/latest/meta-data");
    assert(false, "Should reject cloud metadata IP addresses");
  } catch (err) {
    assert(err.message.includes("Untrusted"), "Blocked metadata IP address");
  }

  try {
    vectorizationService.validateSourceUrl("https://evil-attacker.com/exploit.png");
    assert(false, "Should reject arbitrary third-party hostname");
  } catch (err) {
    assert(err.message.includes("Untrusted"), "Blocked untrusted external domain");
  }

  const validUrl = vectorizationService.validateSourceUrl("https://res.cloudinary.com/test-cloud/image/upload/v1234/layout.png");
  assert(validUrl.hostname === "res.cloudinary.com", "Accepted verified Cloudinary hostname");

  // 2. Database Integration & Concurrency Tests
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI not found in environment. Skipping database tests.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("\nConnected to MongoDB for Block Vectorization tests.");

  const superAdminId = new mongoose.Types.ObjectId();
  const alienTenantId = new mongoose.Types.ObjectId();

  await User.create({
    _id: superAdminId,
    name: "Block Test Super Admin",
    email: `block_sa_${Date.now()}@test.com`,
    passwordHash: "hash123",
    role: "SUPER_ADMIN",
  });

  const testProject = await Project.create({
    customId: Math.floor(100000 + Math.random() * 900000),
    title: "Green Valley Test Project",
    slug: `green-valley-${Date.now()}`,
    location: "Kovaipudur",
    city: "Coimbatore",
    plotPrice: "₹45 Lakhs onwards",
    priceLakhs: 45,
    adminId: superAdminId,
    approvedBy: superAdminId,
    approvalStatus: "APPROVED",
    layout: {
      version: 2,
      referenceImageUrl: "https://res.cloudinary.com/test-cloud/image/upload/v1234/test.png",
      blocks: [
        { id: "blk_a", name: "Block A", color: "#2563eb", description: "North" },
        { id: "blk_b", name: "Block B", color: "#7c3aed", description: "South" },
      ],
      regions: [],
    },
  });

  const plotA1 = await Plot.create({
    customId: `plt_a1_${Date.now()}`,
    projectId: testProject._id,
    plotNumber: "A1",
    size: "1200 Sq Ft",
    facing: "North",
    price: "45 Lakhs",
    status: "Available",
  });

  const plotB1 = await Plot.create({
    customId: `plt_b1_${Date.now()}`,
    projectId: testProject._id,
    plotNumber: "B1",
    size: "1500 Sq Ft",
    facing: "East",
    price: "55 Lakhs",
    status: "Reserved",
  });

  console.log("\n[Test Suite 2] Optimistic Concurrency Protection");
  // Test stale expectedVersion
  const staleReq = {
    params: { id: String(testProject._id) },
    user: { _id: superAdminId },
    body: {
      layout: {
        expectedVersion: 1, // Stale version (server is at 2)
        regions: [
          {
            plotId: String(plotA1._id),
            plotNumber: "A1",
            blockId: "blk_a",
            points: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }],
          },
        ],
      },
    },
  };

  let conflictStatus = null;
  const staleRes = {
    status: (s) => {
      conflictStatus = s;
      return { json: (d) => d };
    },
  };

  await saveProjectLayoutSuperAdmin(staleReq, staleRes, (e) => { throw e; });
  assert(conflictStatus === 409, "Rejected stale layout revision with HTTP 409 Conflict");

  console.log("\n[Test Suite 3] Valid Block & Region Persistence with Correct Revision");
  const validReq = {
    params: { id: String(testProject._id) },
    user: { _id: superAdminId },
    body: {
      layout: {
        expectedVersion: 2, // Matches server version
        blocks: [
          { id: "blk_a", name: "Block A (Updated)", color: "#2563eb" },
          { id: "blk_b", name: "Block B", color: "#7c3aed" },
        ],
        regions: [
          {
            id: "reg_a1",
            plotId: String(plotA1._id),
            plotNumber: "A1",
            blockId: "blk_a",
            points: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }],
          },
          {
            id: "reg_b1",
            plotId: String(plotB1._id),
            plotNumber: "B1",
            blockId: "blk_b",
            points: [{ x: 30, y: 30 }, { x: 40, y: 30 }, { x: 40, y: 40 }, { x: 30, y: 40 }],
          },
        ],
      },
    },
  };

  let successData = null;
  const validRes = {
    status: () => ({
      json: (d) => {
        successData = d;
      },
    }),
  };

  await saveProjectLayoutSuperAdmin(validReq, validRes, (e) => { throw e; });
  assert(successData?.success === true, "Saved valid layout with blocks and regions successfully");

  const updatedProj = await Project.findById(testProject._id);
  assert(updatedProj.layout.version === 3, "Incremented layout revision to 3");
  assert(updatedProj.layout.regions.length === 2, "Persisted 2 layout regions");
  assert(updatedProj.layout.regions[0].blockId === "blk_a", "Preserved stable blockId relationship");
  assert(updatedProj.layout.blocks[0].name === "Block A (Updated)", "Updated block name without breaking blockId reference");

  console.log("\n[Test Suite 4] Pending Approval Staging Governance");
  // Change project to PENDING
  updatedProj.approvalStatus = "PENDING";
  await updatedProj.save();

  const stagedReq = {
    params: { id: String(testProject._id) },
    user: { _id: superAdminId },
    body: {
      layout: {
        expectedVersion: 3,
        regions: [
          {
            plotId: String(plotA1._id),
            plotNumber: "A1",
            blockId: "blk_a",
            points: [{ x: 15, y: 15 }, { x: 25, y: 15 }, { x: 25, y: 25 }, { x: 15, y: 25 }],
          },
        ],
      },
    },
  };

  let stagedResult = null;
  const stagedRes = {
    status: () => ({
      json: (d) => {
        stagedResult = d;
      },
    }),
  };

  await saveProjectLayoutSuperAdmin(stagedReq, stagedRes, (e) => { throw e; });
  assert(stagedResult?.staged === true, "Routed unapproved layout changes to pendingUpdates queue");

  const checkPendingProj = await Project.findById(testProject._id);
  assert(checkPendingProj.hasPendingUpdates === true, "Project flagged hasPendingUpdates = true");
  assert(checkPendingProj.pendingUpdates?.layout?.regions.length === 1, "Staged layout in pendingUpdates.layout");
  assert(checkPendingProj.layout.regions.length === 2, "Published layout untouched on public site plan");

  // Clean up
  await Plot.deleteMany({ projectId: testProject._id });
  await Project.findByIdAndDelete(testProject._id);
  await User.findByIdAndDelete(superAdminId);
  await mongoose.disconnect();

  console.log("\n=======================================================");
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=======================================================\n");

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
