import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import User from "../models/User.js";
import Branch from "../models/Branch.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Enquiry from "../models/Enquiry.js";
import {
  submitPublicEnquiry,
  getAdminEnquiries,
  updateEnquiryStatusAdmin,
  logEnquiryActivityAdmin,
  getAllEnquiriesSuperAdmin,
  updateEnquiryStatusSuperAdmin,
} from "../controllers/enquiryController.js";

// Mock Express req, res, next helpers
const createMockRes = () => {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return res;
};

async function runEnquiryTests() {
  console.log("=== STARTING ENQUIRY & BRANCH MONITORING WORKFLOW TESTS ===");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not defined in backend/.env!");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB:", mongoose.connection.name);

  const cleanupIds = {
    users: [],
    branches: [],
    projects: [],
    plots: [],
    enquiries: [],
  };

  try {
    // ── Setup Test Fixtures ──────────────────────────────────────────
    console.log("\n[Setup] Provisioning test Super Admin, Branch, Branch Admin, Project, Plot...");

    // 1. Super Admin 1
    const superAdmin1 = await User.create({
      name: "Super Admin One",
      email: `sa1_${Date.now()}@testplotpro.in`,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });
    cleanupIds.users.push(superAdmin1._id);

    // 2. Super Admin 2 (Tenant 2 for isolation testing)
    const superAdmin2 = await User.create({
      name: "Super Admin Two",
      email: `sa2_${Date.now()}@testplotpro.in`,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });
    cleanupIds.users.push(superAdmin2._id);

    // 3. Branch 1 under Super Admin 1
    const branch1 = await Branch.create({
      name: "Coimbatore Branch",
      city: "Coimbatore",
      region: "West Zone",
      status: "ACTIVE",
      tenantId: superAdmin1._id,
    });
    cleanupIds.branches.push(branch1._id);

    // 4. Branch Admin 1
    const branchAdmin1 = await User.create({
      name: "Karthik Branch Admin",
      email: `admin1_${Date.now()}@testplotpro.in`,
      role: "ADMIN",
      status: "ACTIVE",
      tenantId: superAdmin1._id,
      branchId: branch1._id,
    });
    cleanupIds.users.push(branchAdmin1._id);
    branch1.branchAdmin = branchAdmin1._id;
    await branch1.save();

    // 5. Branch Admin 2 (Other branch / tenant)
    const branchAdmin2 = await User.create({
      name: "Rival Admin",
      email: `rival_${Date.now()}@testplotpro.in`,
      role: "ADMIN",
      status: "ACTIVE",
      tenantId: superAdmin2._id,
    });
    cleanupIds.users.push(branchAdmin2._id);

    // 6. Project 1 under Branch 1
    const project1 = await Project.create({
      customId: Math.floor(100000 + Math.random() * 900000),
      title: "Green Meadows Plots",
      location: "Coimbatore, West Zone",
      city: "Coimbatore",
      plotPrice: "15 Lakh",
      priceLakhs: 15,
      branchId: branch1._id,
      adminId: branchAdmin1._id,
      approvedBy: superAdmin1._id,
      approvalStatus: "APPROVED",
      status: "Active",
    });
    cleanupIds.projects.push(project1._id);

    // 7. Plot 1 in Project 1
    const plot1 = await Plot.create({
      customId: `plot_${Date.now()}`,
      projectId: project1._id,
      plotNumber: "14",
      size: "1200 Sq.ft",
      facing: "East",
      price: "₹15 Lakh",
      status: "Available",
    });
    cleanupIds.plots.push(plot1._id);

    console.log("  ✓ Test fixtures successfully created.");

    // ── Test 1: Submit Customer Enquiry ─────────────────────────────
    console.log("\n[Test 1] Customer submits enquiry for Project 1...");
    const submitReq = {
      body: {
        fullName: "Senthil Nathan",
        mobile: "9876543210",
        email: "senthil@example.com",
        contactMethod: "whatsapp",
        message: "Looking for an east-facing residential plot in Coimbatore.",
        projectId: String(project1._id),
        plot: "14",
      },
    };
    const submitRes = createMockRes();
    await submitPublicEnquiry(submitReq, submitRes, (err) => {
      if (err) throw err;
    });

    if (submitRes.statusCode !== 201 || !submitRes.data?.success) {
      throw new Error(`Failed to create enquiry: status ${submitRes.statusCode}`);
    }
    const createdEnquiry = submitRes.data.data;
    cleanupIds.enquiries.push(createdEnquiry._id);

    if (String(createdEnquiry.tenantId) !== String(superAdmin1._id)) {
      throw new Error(`Expected tenantId ${superAdmin1._id}, got ${createdEnquiry.tenantId}`);
    }
    if (String(createdEnquiry.branchId) !== String(branch1._id)) {
      throw new Error(`Expected branchId ${branch1._id}, got ${createdEnquiry.branchId}`);
    }
    if (String(createdEnquiry.assignedAdminId) !== String(branchAdmin1._id)) {
      throw new Error(`Expected assignedAdminId ${branchAdmin1._id}, got ${createdEnquiry.assignedAdminId}`);
    }
    if (createdEnquiry.status !== "NEW") {
      throw new Error(`Expected initial status NEW, got ${createdEnquiry.status}`);
    }
    if (!createdEnquiry.activityLog || createdEnquiry.activityLog.length === 0) {
      throw new Error("Expected initial activityLog entry on enquiry creation.");
    }
    console.log("  ✓ Customer enquiry created with correct tenant, branch, and admin attribution: PASS");

    // ── Test 2: Branch Admin views authorized enquiries ─────────────
    console.log("\n[Test 2] Branch Admin fetches authorized enquiries...");
    const adminReq = { user: branchAdmin1 };
    const adminRes = createMockRes();
    await getAdminEnquiries(adminReq, adminRes, (err) => {
      if (err) throw err;
    });

    if (adminRes.statusCode !== 200 || !Array.isArray(adminRes.data?.data)) {
      throw new Error(`Failed to get admin enquiries: status ${adminRes.statusCode}`);
    }
    const foundAdminEnquiry = adminRes.data.data.find(
      (e) => String(e._id) === String(createdEnquiry._id)
    );
    if (!foundAdminEnquiry) {
      throw new Error("Created enquiry was not found in Branch Admin's authorized list!");
    }
    if (foundAdminEnquiry.plotDetails?.status !== "Available") {
      throw new Error(`Expected plot inventory status 'Available', got ${foundAdminEnquiry.plotDetails?.status}`);
    }
    console.log("  ✓ Branch Admin sees enquiry with populated branch & plot details: PASS");

    // ── Test 3: Super Admin views the exact same enquiry ────────────
    console.log("\n[Test 3] Super Admin monitors the enquiry across branches...");
    const saReq = { user: superAdmin1 };
    const saRes = createMockRes();
    await getAllEnquiriesSuperAdmin(saReq, saRes, (err) => {
      if (err) throw err;
    });

    if (saRes.statusCode !== 200 || !Array.isArray(saRes.data?.data)) {
      throw new Error(`Failed to get super admin enquiries: status ${saRes.statusCode}`);
    }
    const foundSaEnquiry = saRes.data.data.find(
      (e) => String(e._id) === String(createdEnquiry._id)
    );
    if (!foundSaEnquiry) {
      throw new Error("Enquiry not found in Super Admin's general enquiries oversight!");
    }
    if (foundSaEnquiry.branchId?.name !== "Coimbatore Branch") {
      throw new Error(`Expected branch name 'Coimbatore Branch', got ${foundSaEnquiry.branchId?.name}`);
    }
    if (foundSaEnquiry.assignedAdminId?.name !== "Karthik Branch Admin") {
      throw new Error(`Expected admin name 'Karthik Branch Admin', got ${foundSaEnquiry.assignedAdminId?.name}`);
    }
    console.log("  ✓ Super Admin monitors identical enquiry with full branch & staff attribution: PASS");

    // ── Test 4: Branch Admin updates status to FOLLOW_UP with note ──
    console.log("\n[Test 4] Branch Admin updates status to FOLLOW_UP with follow-up note...");
    const updateReq = {
      params: { id: String(createdEnquiry._id) },
      body: { status: "FOLLOW_UP", notes: "Spoke on phone, scheduled site visit for Saturday." },
      user: branchAdmin1,
    };
    const updateRes = createMockRes();
    await updateEnquiryStatusAdmin(updateReq, updateRes, (err) => {
      if (err) throw err;
    });

    if (updateRes.statusCode !== 200 || updateRes.data?.data?.status !== "FOLLOW_UP") {
      throw new Error(`Failed to update status to FOLLOW_UP: status ${updateRes.statusCode}`);
    }
    const updatedLog = updateRes.data.data.activityLog;
    const followUpEntry = updatedLog.find((a) => a.newStatus === "FOLLOW_UP");
    if (!followUpEntry || !followUpEntry.notes.includes("Saturday")) {
      throw new Error("Follow-up activity was not properly recorded in activityLog!");
    }
    console.log("  ✓ Branch Admin successfully updated status to FOLLOW_UP with audit history: PASS");

    // ── Test 5: Super Admin verifies updated status & activity history
    console.log("\n[Test 5] Super Admin verifies updated status & activity timeline...");
    const saVerifyRes = createMockRes();
    await getAllEnquiriesSuperAdmin(saReq, saVerifyRes, (err) => {
      if (err) throw err;
    });
    const verifiedSaEnquiry = saVerifyRes.data.data.find(
      (e) => String(e._id) === String(createdEnquiry._id)
    );
    if (verifiedSaEnquiry.status !== "FOLLOW_UP") {
      throw new Error(`Expected Super Admin to see status FOLLOW_UP, got ${verifiedSaEnquiry.status}`);
    }
    if (!verifiedSaEnquiry.activityLog.some((a) => a.newStatus === "FOLLOW_UP")) {
      throw new Error("Super Admin could not see the FOLLOW_UP audit entry in activityLog!");
    }
    console.log("  ✓ Super Admin observed live FOLLOW_UP status and staff notes without duplication: PASS");

    // ── Test 6: Branch Admin logs quick touchpoint (e.g. Call) ───────
    console.log("\n[Test 6] Branch Admin logs customer touchpoint activity...");
    const touchpointReq = {
      params: { id: String(createdEnquiry._id) },
      body: { action: "CONTACTED_CALL", notes: "Called customer to confirm visit timings." },
      user: branchAdmin1,
    };
    const touchpointRes = createMockRes();
    await logEnquiryActivityAdmin(touchpointReq, touchpointRes, (err) => {
      if (err) throw err;
    });
    if (touchpointRes.statusCode !== 200) {
      throw new Error(`Failed to log activity: ${touchpointRes.statusCode}`);
    }
    console.log("  ✓ Customer call logged in enquiry audit timeline: PASS");

    // ── Test 7: Super Admin tenant isolation guard ───────────────────
    console.log("\n[Test 7] Verifying Super Admin tenant isolation...");
    const sa2Req = { user: superAdmin2 };
    const sa2Res = createMockRes();
    await getAllEnquiriesSuperAdmin(sa2Req, sa2Res, (err) => {
      if (err) throw err;
    });
    const leakCheck = sa2Res.data.data.find(
      (e) => String(e._id) === String(createdEnquiry._id)
    );
    if (leakCheck) {
      throw new Error("SECURITY FAILURE: Super Admin 2 accessed enquiries from Super Admin 1 tenant!");
    }
    console.log("  ✓ Tenant isolation verified: Another Super Admin cannot see foreign enquiries: PASS");

    // ── Test 8: Branch Admin cross-branch isolation guard ─────────────
    console.log("\n[Test 8] Verifying Branch Admin cross-branch modification rejection...");
    const unauthorizedReq = {
      params: { id: String(createdEnquiry._id) },
      body: { status: "CLOSED", notes: "Illegitimate close" },
      user: branchAdmin2,
    };
    const unauthorizedRes = createMockRes();
    await updateEnquiryStatusAdmin(unauthorizedReq, unauthorizedRes, (err) => {
      if (err) throw err;
    });
    if (unauthorizedRes.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for unauthorized admin, got ${unauthorizedRes.statusCode}`);
    }
    console.log("  ✓ Cross-branch security verified: Unauthorized admin correctly rejected with 403: PASS");

    // ── Test 9: Plot inventory remains untouched ─────────────────────
    console.log("\n[Test 9] Verifying Plot inventory is unaffected by enquiry workflow...");
    const currentPlot = await Plot.findById(plot1._id);
    if (currentPlot.status !== "Available") {
      throw new Error(`SECURITY/LOGIC FAILURE: Plot status was modified to ${currentPlot.status}! Must remain Available.`);
    }
    console.log("  ✓ Plot inventory status is strictly decoupled and remains Available: PASS");

    // ── Test 10: Legacy Enquiry without branchId compatibility ──────
    console.log("\n[Test 10] Verifying Legacy enquiry backwards compatibility...");
    const legacyEnquiry = await Enquiry.create({
      fullName: "Legacy User",
      mobile: "9000000000",
      email: "legacy@test.com",
      status: "NEW",
      projectId: project1._id,
      branchId: null,
      tenantId: null,
    });
    cleanupIds.enquiries.push(legacyEnquiry._id);

    const legacySaRes = createMockRes();
    await getAllEnquiriesSuperAdmin(saReq, legacySaRes, (err) => {
      if (err) throw err;
    });
    const foundLegacy = legacySaRes.data.data.find((e) => String(e._id) === String(legacyEnquiry._id));
    if (!foundLegacy) {
      throw new Error("Legacy enquiry without branchId could not be retrieved by owning Super Admin!");
    }
    console.log("  ✓ Legacy enquiry without branchId resolved safely without throwing errors: PASS");

    console.log("\n=== ALL 10 ENQUIRY INTEGRATION TESTS PASSED SUCCESSFULLY ===");
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────
    console.log("\n[Teardown] Cleaning up test records from database...");
    await Enquiry.deleteMany({ _id: { $in: cleanupIds.enquiries } });
    await Plot.deleteMany({ _id: { $in: cleanupIds.plots } });
    await Project.deleteMany({ _id: { $in: cleanupIds.projects } });
    await Branch.deleteMany({ _id: { $in: cleanupIds.branches } });
    await User.deleteMany({ _id: { $in: cleanupIds.users } });
    console.log("Test records cleaned up cleanly.");
    await mongoose.disconnect();
  }
}

runEnquiryTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
