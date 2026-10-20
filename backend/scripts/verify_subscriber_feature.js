import mongoose from "mongoose";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
dotenv.config({ path: "./backend/.env" });

import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";
import { getTenantContext } from "../controllers/superAdminController.js";

const BASE_URL = "http://localhost:5000/api";

const runTests = async () => {
  console.log("=== STARTING PLOTPRO SUBSCRIBER & TENANT ISOLATION INTEGRATION TEST ===");

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  // Check existing legacy DreamCity data before test
  const legacySuperAdmin = await User.findOne({ email: "superadmin@dreamcity.in" });
  if (!legacySuperAdmin) {
    throw new Error("Legacy Super Admin (superadmin@dreamcity.in) not found!");
  }
  const preLegacyAdmins = await User.countDocuments({ role: "ADMIN", tenantId: legacySuperAdmin._id });
  const preLegacyProjects = await Project.countDocuments({ isArchived: false, approvedBy: legacySuperAdmin._id });
  console.log(`[Baseline Check] Legacy DreamCity: ${preLegacyAdmins} admins, ${preLegacyProjects} projects.`);

  // Authenticate as Supreme Admin
  const supremeAdmin = await User.findOne({ role: "SUPREME_ADMIN" });
  if (!supremeAdmin) throw new Error("Supreme Admin not found!");
  const supremeToken = jwt.sign(
    { userId: supremeAdmin._id, role: supremeAdmin.role },
    process.env.JWT_SECRET || "dreamcity_super_secret_jwt_key_2026_dev",
    { expiresIn: "1h" }
  );

  // Active Plan to use
  const activePlan = await Plan.findOne({ isActive: true });
  if (!activePlan) throw new Error("No active plan found!");
  console.log(`Using Plan: ${activePlan.name} (Max seats: ${activePlan.maxAdminSeats}, Duration: ${activePlan.durationDays}d)`);

  const timestamp = Date.now();
  const testBusinessName = `Horizon Realty ${timestamp}`;
  const testEmail = `horizon.test.${timestamp}@plotpro.test`;
  const testPassword = "HorizonPass@123";

  let createdSubscriberId = null;

  try {
    // -------------------------------------------------------------
    // TEST 1: Validation - Invalid / Missing fields
    // -------------------------------------------------------------
    console.log("\n[TEST 1] Validation: Missing required fields");
    const resInvalid = await fetch(`${BASE_URL}/supreme-admin/subscribers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supremeToken}`,
      },
      body: JSON.stringify({
        businessName: "",
        name: "Test",
        email: "bad",
        password: "123",
      }),
    });
    const dataInvalid = await resInvalid.json();
    if (resInvalid.status === 400 && dataInvalid.success === false) {
      console.log("✓ PASS: Correctly rejected invalid input with 400.");
    } else {
      throw new Error(`TEST 1 Failed: Expected 400, got ${resInvalid.status}: ${JSON.stringify(dataInvalid)}`);
    }

    // -------------------------------------------------------------
    // TEST 2: Successful Subscriber Creation
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Successful Subscriber Creation via Supreme Admin API");
    const resCreate = await fetch(`${BASE_URL}/supreme-admin/subscribers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supremeToken}`,
      },
      body: JSON.stringify({
        businessName: testBusinessName,
        name: "Vikram Test Owner",
        email: testEmail,
        phone: "9876543210",
        password: testPassword,
        planId: activePlan._id,
        durationDays: 45,
        assignedSeats: activePlan.maxAdminSeats,
        status: "ACTIVE",
        notes: "Automated test tenant",
      }),
    });
    const dataCreate = await resCreate.json();
    if (resCreate.status !== 201 || !dataCreate.success) {
      throw new Error(`TEST 2 Failed: ${JSON.stringify(dataCreate)}`);
    }
    createdSubscriberId = dataCreate.data.subscriber._id;
    console.log(`✓ PASS: Created Subscriber ID ${createdSubscriberId} with Super Admin email ${testEmail}`);
    console.log(`  Entitlement: ${dataCreate.data.subscription.assignedSeats} assigned seats, 0 used seats.`);

    // -------------------------------------------------------------
    // TEST 3: Duplicate Email Rejection
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Duplicate Email Rejection");
    const resDup = await fetch(`${BASE_URL}/supreme-admin/subscribers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supremeToken}`,
      },
      body: JSON.stringify({
        businessName: "Duplicate Co",
        name: "Duplicate User",
        email: testEmail,
        password: testPassword,
        planId: activePlan._id,
      }),
    });
    const dataDup = await resDup.json();
    if (resDup.status === 400 && dataDup.success === false) {
      console.log("✓ PASS: Correctly rejected duplicate email with 400:", dataDup.message);
    } else {
      throw new Error(`TEST 3 Failed: Expected 400 duplicate rejection, got ${resDup.status}`);
    }

    // -------------------------------------------------------------
    // TEST 4: Supreme Admin Subscribers List Check
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Supreme Admin Directory Check");
    const resList = await fetch(`${BASE_URL}/supreme-admin/subscribers?search=${testEmail}`, {
      headers: { Authorization: `Bearer ${supremeToken}` },
    });
    const dataList = await resList.json();
    const foundSub = dataList.data?.find((s) => s.email === testEmail);
    if (!foundSub) throw new Error("TEST 4 Failed: Newly created subscriber not found in list!");
    if (foundSub.activeAdminCount !== 0 || foundSub.projectCount !== 0) {
      throw new Error(`TEST 4 Failed: Expected 0 admins and 0 projects, got ${foundSub.activeAdminCount} and ${foundSub.projectCount}`);
    }
    console.log("✓ PASS: Newly created subscriber found in directory with 0 staff admins and 0 projects.");

    // -------------------------------------------------------------
    // TEST 5: Super Admin Login & Authentication
    // -------------------------------------------------------------
    console.log("\n[TEST 5] Super Admin Login Authentication");
    const resLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });
    const dataLogin = await resLogin.json();
    if (resLogin.status !== 200 || !dataLogin.token) {
      throw new Error(`TEST 5 Failed: Login failed: ${JSON.stringify(dataLogin)}`);
    }
    const newSuperAdminToken = dataLogin.token;
    console.log("✓ PASS: Super Admin authenticated successfully. Role:", dataLogin.user.role);

    // -------------------------------------------------------------
    // TEST 6: Strict Clean Zero-State Across All Super Admin Endpoints
    // -------------------------------------------------------------
    console.log("\n[TEST 6] Verifying Clean Zero-State for new Super Admin");
    const saHeaders = { Authorization: `Bearer ${newSuperAdminToken}` };

    // Projects
    const resProjects = await fetch(`${BASE_URL}/super-admin/projects`, { headers: saHeaders });
    const dataProjects = await resProjects.json();
    if (dataProjects.count !== 0 || dataProjects.data.length !== 0) {
      throw new Error(`TEST 6 Failed: Projects count is ${dataProjects.count}, expected 0!`);
    }

    // Plots
    const resPlots = await fetch(`${BASE_URL}/super-admin/plots`, { headers: saHeaders });
    const dataPlots = await resPlots.json();
    if (dataPlots.count !== 0 || dataPlots.data.length !== 0) {
      throw new Error(`TEST 6 Failed: Plots count is ${dataPlots.count}, expected 0!`);
    }

    // Admins
    const resAdmins = await fetch(`${BASE_URL}/super-admin/admins`, { headers: saHeaders });
    const dataAdmins = await resAdmins.json();
    if (dataAdmins.count !== 0 || dataAdmins.data.length !== 0) {
      throw new Error(`TEST 6 Failed: Admins count is ${dataAdmins.count}, expected 0!`);
    }

    // Enquiries
    const resEnquiries = await fetch(`${BASE_URL}/super-admin/enquiries`, { headers: saHeaders });
    const dataEnquiries = await resEnquiries.json();
    if (dataEnquiries.count !== 0 || dataEnquiries.data.length !== 0) {
      throw new Error(`TEST 6 Failed: Enquiries count is ${dataEnquiries.count}, expected 0!`);
    }

    // Site Visits
    const resVisits = await fetch(`${BASE_URL}/super-admin/site-visits`, { headers: saHeaders });
    const dataVisits = await resVisits.json();
    if (dataVisits.count !== 0 || dataVisits.data.length !== 0) {
      throw new Error(`TEST 6 Failed: Site visits count is ${dataVisits.count}, expected 0!`);
    }

    // Analytics
    const resAnalytics = await fetch(`${BASE_URL}/super-admin/analytics`, { headers: saHeaders });
    const dataAnalytics = await resAnalytics.json();
    if (
      dataAnalytics.data.projects.total !== 0 ||
      dataAnalytics.data.admins.total !== 0 ||
      dataAnalytics.data.plots.total !== 0 ||
      dataAnalytics.data.enquiries.total !== 0
    ) {
      throw new Error(`TEST 6 Failed: Analytics report non-zero: ${JSON.stringify(dataAnalytics.data)}`);
    }

    // Subscription Info
    const resSubInfo = await fetch(`${BASE_URL}/super-admin/subscription-info`, { headers: saHeaders });
    const dataSubInfo = await resSubInfo.json();
    if (dataSubInfo.data.usedSeats !== 0 || dataSubInfo.data.remainingSeats !== activePlan.maxAdminSeats) {
      throw new Error(`TEST 6 Failed: Subscription seats mismatch. Used: ${dataSubInfo.data.usedSeats}, Remaining: ${dataSubInfo.data.remainingSeats}`);
    }

    console.log("✓ PASS: All Super Admin endpoints returned clean 0 records for the new tenant!");

    // -------------------------------------------------------------
    // TEST 7: Tenant Workflow - Create 1st Project & 1st Staff Admin
    // -------------------------------------------------------------
    console.log("\n[TEST 7] Creating First Project and First Staff Admin");
    const resCreateProj = await fetch(`${BASE_URL}/super-admin/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...saHeaders,
      },
      body: JSON.stringify({
        title: "Horizon Emerald Palms",
        location: "Kakkanad, Kochi",
        city: "Kochi",
        plotPrice: "₹25 Lakh",
        priceLakhs: 25,
        availablePlots: 2,
        reservedPlots: 1,
        soldPlots: 0,
      }),
    });
    const dataCreateProj = await resCreateProj.json();
    if (resCreateProj.status !== 201 || !dataCreateProj.success) {
      throw new Error(`TEST 7 Project Creation Failed: ${JSON.stringify(dataCreateProj)}`);
    }
    const createdProjectId = dataCreateProj.data._id || dataCreateProj.data.id;
    console.log("✓ PASS: Created 1st Project:", dataCreateProj.data.title);

    // Create 1st Staff Admin
    const testAdminEmail = `staff.${timestamp}@horizon.test`;
    const resCreateAdmin = await fetch(`${BASE_URL}/super-admin/admins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...saHeaders,
      },
      body: JSON.stringify({
        name: "Staff Agent 1",
        email: testAdminEmail,
        password: "StaffPass@123",
      }),
    });
    const dataCreateAdmin = await resCreateAdmin.json();
    if (resCreateAdmin.status !== 201 || !dataCreateAdmin.success) {
      throw new Error(`TEST 7 Admin Creation Failed: ${JSON.stringify(dataCreateAdmin)}`);
    }
    console.log("✓ PASS: Created 1st Staff Admin:", testAdminEmail);

    // Verify Seat Usage incremented to 1
    const resSubInfoAfter = await fetch(`${BASE_URL}/super-admin/subscription-info`, { headers: saHeaders });
    const dataSubInfoAfter = await resSubInfoAfter.json();
    if (dataSubInfoAfter.data.usedSeats !== 1) {
      throw new Error(`TEST 7 Failed: Expected 1 used seat, got ${dataSubInfoAfter.data.usedSeats}`);
    }
    console.log("✓ PASS: Seat count correctly updated to usedSeats = 1, remainingSeats =", dataSubInfoAfter.data.remainingSeats);

    // -------------------------------------------------------------
    // TEST 8: Cross-Tenant Isolation (No Data Leakage between tenants)
    // -------------------------------------------------------------
    console.log("\n[TEST 8] Cross-Tenant Isolation Verification");
    // Log in as legacy Super Admin
    const legacyToken = jwt.sign(
      { userId: legacySuperAdmin._id, role: legacySuperAdmin.role },
      process.env.JWT_SECRET || "dreamcity_super_secret_jwt_key_2026_dev",
      { expiresIn: "1h" }
    );
    const legacyHeaders = { Authorization: `Bearer ${legacyToken}` };

    // Legacy Super Admin checking projects
    const resLegacyProjects = await fetch(`${BASE_URL}/super-admin/projects`, { headers: legacyHeaders });
    const dataLegacyProjects = await resLegacyProjects.json();
    const hasHorizonInLegacy = dataLegacyProjects.data.some((p) => p.title === "Horizon Emerald Palms");
    if (hasHorizonInLegacy) {
      throw new Error("TEST 8 Failed: Data leak! Legacy Super Admin can see Horizon Emerald Palms!");
    }
    console.log("✓ PASS: Legacy Super Admin does NOT see Horizon project.");

    // Legacy DreamCity Project Count check
    if (dataLegacyProjects.count !== preLegacyProjects) {
      throw new Error(`TEST 8 Failed: Legacy projects changed from ${preLegacyProjects} to ${dataLegacyProjects.count}`);
    }
    console.log(`✓ PASS: Legacy DreamCity has all ${preLegacyProjects} projects intact.`);

    // New Super Admin attempting to view or modify Legacy DreamCity project
    const legacyFirstProject = dataLegacyProjects.data[0];
    const resUnauthorizedAccess = await fetch(`${BASE_URL}/super-admin/projects/${legacyFirstProject.customId}/plots`, {
      headers: saHeaders,
    });
    if (resUnauthorizedAccess.status !== 403) {
      throw new Error(`TEST 8 Failed: New Super Admin was not blocked with 403 when accessing legacy project! Got: ${resUnauthorizedAccess.status}`);
    }
    console.log("✓ PASS: New Super Admin was blocked with 403 Forbidden when accessing legacy project plots.");

    console.log("\n=== ALL TESTS COMPLETED SUCCESSFULLY ===");
  } finally {
    // -------------------------------------------------------------
    // TEST 9: Safe Clean Up of Test Tenant ONLY
    // -------------------------------------------------------------
    if (createdSubscriberId) {
      console.log("\n[CLEANUP] Cleaning up test tenant records...");
      // Find test tenant admins
      const testAdmins = await User.find({ tenantId: createdSubscriberId }).select("_id");
      const testAdminIds = testAdmins.map((a) => a._id);

      // Find test tenant projects
      const testProjs = await Project.find({
        $or: [{ approvedBy: createdSubscriberId }, { adminId: { $in: testAdminIds } }],
      }).select("_id");
      const testProjIds = testProjs.map((p) => p._id);

      // Delete test plots
      await Plot.deleteMany({ projectId: { $in: testProjIds } });
      // Delete test projects
      await Project.deleteMany({ _id: { $in: testProjIds } });
      // Delete test admins
      await User.deleteMany({ _id: { $in: testAdminIds } });
      // Delete test subscription
      await Subscription.deleteMany({ subscriberId: createdSubscriberId });
      // Delete test subscriber
      await User.findByIdAndDelete(createdSubscriberId);

      console.log("✓ Test tenant cleanly purged without affecting legacy data.");
    }
    await mongoose.disconnect();
  }
};

runTests().catch((err) => {
  console.error("\n❌ TEST ERROR:", err.message);
  process.exit(1);
});
