/**
 * Comprehensive End-to-End Test Suite for DreamCity MERN Backend
 * Tests all 30 scenarios from the approved MERN migration plan.
 */

import http from "http";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import app from "../server.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";

const PORT = 5555;
let server;
let baseUrl;

const makeRequest = async (path, options = {}) => {
  const url = `${baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const config = {
    method: options.method || "GET",
    headers,
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, config);
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return {
    status: res.status,
    ok: res.ok,
    data,
  };
};

// Test Runner
const results = [];
let currentTest = "";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

async function test(name, fn) {
  currentTest = name;
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
    console.error(`  ✗ ${name}:`, error.message);
  }
}

async function runTestSuite() {
  console.log("\n=======================================================");
  console.log("   DREAMCITY MERN BACKEND — 30-POINT VERIFICATION SUITE");
  console.log("=======================================================\n");

  server = app.listen(PORT);
  baseUrl = `http://localhost:${PORT}/api`;

  // Tokens for testing
  let superAdminToken = "";
  let adminArunToken = "";
  let adminPriyaToken = "";
  let customerToken = "";
  let testPendingProjectId = "";
  let testApprovedProjectId = "";
  let testApprovedProjectCustomId = "";
  let testEnquiryId = "";

  try {
    // ---------------- AUTHENTICATION & TOKENS ----------------
    await test("Setup: Login as Super Admin", async () => {
      const res = await makeRequest("/auth/login", {
        method: "POST",
        body: { email: "superadmin@dreamcity.in", password: "SuperAdmin@123" },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.data?.token, "Token missing");
      assert(res.data?.user?.role === "SUPER_ADMIN", "Expected role SUPER_ADMIN");
      superAdminToken = res.data.token;
    });

    await test("Setup: Login as Admin (Arun)", async () => {
      const res = await makeRequest("/auth/login", {
        method: "POST",
        body: { email: "arun@dreamcity.in", password: "Admin@123" },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.data?.token, "Token missing");
      assert(res.data?.user?.role === "ADMIN", "Expected role ADMIN");
      adminArunToken = res.data.token;
    });

    await test("Setup: Login as Admin (Priya)", async () => {
      const res = await makeRequest("/auth/login", {
        method: "POST",
        body: { email: "priya@dreamcity.in", password: "Admin@123" },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      adminPriyaToken = res.data.token;
    });

    await test("Setup: Login as Customer", async () => {
      const res = await makeRequest("/auth/login", {
        method: "POST",
        body: { email: "user@dreamcity.in", password: "User@123" },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      customerToken = res.data.token;
    });

    // ---------------- 1 to 7: PUBLIC EXPLORATION ----------------
    await test("1. Public project list only returns APPROVED and non-archived projects", async () => {
      const res = await makeRequest("/public/projects");
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.data.data), "Projects array missing");
      assert(res.data.data.length >= 18, `Expected at least 18 approved projects, got ${res.data.data.length}`);
      res.data.data.forEach((p) => {
        assert(p.approvalStatus === "APPROVED", `Unapproved project leaked: ${p.title}`);
        assert(!p.isArchived, `Archived project leaked: ${p.title}`);
      });
      testApprovedProjectId = res.data.data[0]._id;
      testApprovedProjectCustomId = res.data.data[0].customId;
    });

    await test("2. Public project details resolves numeric customId (/projects/1)", async () => {
      const res = await makeRequest("/public/projects/1");
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(String(res.data.data.customId) === "1", "Expected customId 1");
    });

    await test("3. Public project details resolves 24-hex ObjectId", async () => {
      const res = await makeRequest(`/public/projects/${testApprovedProjectId}`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.data.data._id === testApprovedProjectId, "Expected matching ObjectId");
    });

    await test("4. Public project plots resolves numeric customId (/projects/1/plots)", async () => {
      const res = await makeRequest("/public/projects/1/plots");
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.data.data), "Plots array missing");
      assert(res.data.data.length > 0, "No plots returned for project 1");
    });

    await test("5. Public plot details resolves customId (/plots/1-1)", async () => {
      const res = await makeRequest("/public/plots/1-1");
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.data.data.customId === "1-1", "Expected customId 1-1");
    });

    await test("6. Unapproved (PENDING) project returns 404 on public route", async () => {
      const res = await makeRequest("/public/projects/19");
      assert(res.status === 404, `Expected 404, got ${res.status}`);
    });

    await test("7. Unapproved project plots return 404 on public route", async () => {
      const res = await makeRequest("/public/projects/19/plots");
      assert(res.status === 404, `Expected 404, got ${res.status}`);
    });

    // ---------------- 8 to 15: AUTH & AUTHORIZATION ----------------
    await test("8. Registration with valid details returns token and user object", async () => {
      const testEmail = `newcustomer_${Date.now()}@dreamcity.in`;
      const res = await makeRequest("/auth/register", {
        method: "POST",
        body: { name: "Test Customer", email: testEmail, password: "Customer@123", phone: "9876543210" },
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(res.data.token, "Token missing in registration");
      assert(res.data.user.role === "USER", "Default role should be USER");
    });

    await test("9. Registration with duplicate email returns 400", async () => {
      const res = await makeRequest("/auth/register", {
        method: "POST",
        body: { name: "Duplicate", email: "user@dreamcity.in", password: "Password@123" },
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test("10. Login with valid credentials returns token and user object", async () => {
      const res = await makeRequest("/auth/login", {
        method: "POST",
        body: { email: "user@dreamcity.in", password: "User@123" },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.data.token, "Token missing");
    });

    await test("11. Login with invalid password returns 401", async () => {
      const res = await makeRequest("/auth/login", {
        method: "POST",
        body: { email: "user@dreamcity.in", password: "WrongPassword@123" },
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test("12. Login with inactive account returns 403", async () => {
      // Create temporary inactive user
      const inactiveEmail = `inactive_${Date.now()}@dreamcity.in`;
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash("Inactive@123", salt);
      await User.create({
        name: "Inactive User",
        email: inactiveEmail,
        passwordHash,
        role: "USER",
        status: "INACTIVE",
      });

      const res = await makeRequest("/auth/login", {
        method: "POST",
        body: { email: inactiveEmail, password: "Inactive@123" },
      });
      assert(res.status === 403, `Expected 403, got ${res.status}`);
    });

    await test("13. Access protected route without token returns 401", async () => {
      const res = await makeRequest("/admin/projects");
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test("14. Access admin route with USER role returns 403", async () => {
      const res = await makeRequest("/admin/projects", {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert(res.status === 403, `Expected 403, got ${res.status}`);
    });

    await test("15. Access super-admin route with ADMIN role returns 403", async () => {
      const res = await makeRequest("/super-admin/admins", {
        headers: { Authorization: `Bearer ${adminArunToken}` },
      });
      assert(res.status === 403, `Expected 403, got ${res.status}`);
    });

    // ---------------- 16 to 21: ADMIN DATA ISOLATION & APPROVAL WORKFLOW ----------------
    let arunProjectId = "";
    let priyaProjectId = "";

    await test("16. Admin can view only their assigned projects", async () => {
      const res = await makeRequest("/admin/projects", {
        headers: { Authorization: `Bearer ${adminArunToken}` },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.data.data), "Projects array missing");
      assert(res.data.data.length > 0, "Arun has no assigned projects");
      arunProjectId = res.data.data[0]._id;

      const priyaRes = await makeRequest("/admin/projects", {
        headers: { Authorization: `Bearer ${adminPriyaToken}` },
      });
      assert(priyaRes.status === 200, "Priya projects failed");
      priyaProjectId = priyaRes.data.data[0]._id;
      assert(arunProjectId !== priyaProjectId, "Projects must be distinct between admins");
    });

    await test("17. Admin cannot view or edit another admin's project (returns 403)", async () => {
      // Arun attempts to view Priya's project
      const getRes = await makeRequest(`/admin/projects/${priyaProjectId}`, {
        headers: { Authorization: `Bearer ${adminArunToken}` },
      });
      assert(getRes.status === 403, `Expected 403 on GET, got ${getRes.status}`);

      // Arun attempts to update Priya's project
      const putRes = await makeRequest(`/admin/projects/${priyaProjectId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminArunToken}` },
        body: { title: "Hijacked Title" },
      });
      assert(putRes.status === 403, `Expected 403 on PUT, got ${putRes.status}`);
    });

    await test("18. Admin creating project sets approvalStatus: PENDING, not exposed publicly", async () => {
      const res = await makeRequest("/admin/projects", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminArunToken}` },
        body: {
          title: "Arun New Proposal",
          location: "Trichy Highway",
          plotPrice: "₹15 Lakh",
          plotType: "Residential",
          totalPlots: 50,
          availablePlots: 50,
          reservedPlots: 0,
          soldPlots: 0,
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(res.data.data.approvalStatus === "PENDING", `Expected PENDING, got ${res.data.data.approvalStatus}`);
      testPendingProjectId = res.data.data._id;

      // Check public route does not return it
      const publicRes = await makeRequest(`/public/projects/${testPendingProjectId}`);
      assert(publicRes.status === 404, "Pending project must not be public!");
    });

    await test("19. Admin editing approved project stages changes into pendingUpdates (zero-downtime)", async () => {
      const original = await Project.findById(arunProjectId);
      const originalTitle = original.title;

      const res = await makeRequest(`/admin/projects/${arunProjectId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminArunToken}` },
        body: { title: "Renamed Live Project" },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.data.pendingApproval === true, "Expected pendingApproval: true");

      // Verify database state: live document title UNCHANGED, pendingUpdates populated
      const dbDoc = await Project.findById(arunProjectId);
      assert(dbDoc.title === originalTitle, `Live title changed prematurely! Was: ${dbDoc.title}`);
      assert(dbDoc.hasPendingUpdates === true, "hasPendingUpdates should be true");
      assert(dbDoc.pendingUpdates.title === "Renamed Live Project", "pendingUpdates.title missing");

      // Verify public API still serves original title
      const publicRes = await makeRequest(`/public/projects/${arunProjectId}`);
      assert(publicRes.status === 200, "Public route failed");
      assert(publicRes.data.data.title === originalTitle, "Public site saw unapproved edit!");
    });

    await test("20. Admin cannot directly update approvalStatus to APPROVED in request body", async () => {
      const res = await makeRequest(`/admin/projects/${testPendingProjectId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminArunToken}` },
        body: { approvalStatus: "APPROVED" },
      });
      assert(res.status === 200, "PUT failed");

      // Verify database: approvalStatus still PENDING
      const dbDoc = await Project.findById(testPendingProjectId);
      assert(dbDoc.approvalStatus === "PENDING", `Bypass succeeded! Status: ${dbDoc.approvalStatus}`);
    });

    await test("21. Admin cannot delete an APPROVED project (returns 403)", async () => {
      const res = await makeRequest(`/admin/projects/${arunProjectId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminArunToken}` },
      });
      assert(res.status === 403, `Expected 403, got ${res.status}`);
    });

    // ---------------- 22 to 27: SUPER ADMIN POWERS ----------------
    await test("22. Super Admin can view all projects including pending", async () => {
      const res = await makeRequest("/super-admin/projects", {
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.data.data.length >= 20, `Expected all 20+ projects, got ${res.data.data.length}`);

      const pendingRes = await makeRequest("/super-admin/projects/pending", {
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert(pendingRes.status === 200, "Pending projects request failed");
      assert(pendingRes.data.data.length > 0, "Expected pending projects");
    });

    await test("23. Super Admin can approve pending new project -> becomes APPROVED and live", async () => {
      const res = await makeRequest(`/super-admin/projects/${testPendingProjectId}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.data.data.approvalStatus === "APPROVED", "Status not updated to APPROVED");

      // Verify public API now exposes it!
      const publicRes = await makeRequest(`/public/projects/${testPendingProjectId}`);
      assert(publicRes.status === 200, "Approved project should now be public!");
    });

    await test("24. Super Admin can approve pending updates -> merges into live document", async () => {
      const res = await makeRequest(`/super-admin/projects/${arunProjectId}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);

      // Verify dbDoc now has live title "Renamed Live Project" and pendingUpdates is cleared
      const dbDoc = await Project.findById(arunProjectId);
      assert(dbDoc.title === "Renamed Live Project", `Expected merged title, got ${dbDoc.title}`);
      assert(dbDoc.hasPendingUpdates === false, "hasPendingUpdates should be false");
      assert(dbDoc.pendingUpdates === null, "pendingUpdates should be null");
    });

    await test("25. Super Admin can reject pending project with reason", async () => {
      const res = await makeRequest(`/super-admin/projects/${testPendingProjectId}/reject`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${superAdminToken}` },
        body: { reason: "Incomplete documentation" },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.data.data.approvalStatus === "REJECTED", "Expected REJECTED");
      assert(res.data.data.rejectionReason === "Incomplete documentation", "Rejection reason missing");
    });

    await test("26. Super Admin can assign/reassign project to another admin", async () => {
      const priyaUser = await User.findOne({ email: "priya@dreamcity.in" });
      const res = await makeRequest(`/super-admin/projects/${arunProjectId}/assign`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${superAdminToken}` },
        body: { adminId: priyaUser._id },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(String(res.data.data.adminId) === String(priyaUser._id), "Reassignment failed");
    });

    await test("27. Super Admin can soft-archive an approved project -> removed from public", async () => {
      const res = await makeRequest(`/super-admin/projects/${arunProjectId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);

      const publicRes = await makeRequest(`/public/projects/${arunProjectId}`);
      assert(publicRes.status === 404, "Archived project must not be public!");
    });

    // ---------------- 28 to 30: LEADS & ANALYTICS ----------------
    await test("28. Public enquiry submission assigns adminId from project", async () => {
      // Find an active approved project with an adminId
      const activeProj = await Project.findOne({ approvalStatus: "APPROVED", isArchived: false, adminId: { $ne: null } });
      assert(activeProj, "No active approved project with admin found");

      const res = await makeRequest("/public/enquiries", {
        method: "POST",
        body: {
          fullName: "Lead Customer",
          email: "lead@test.com",
          mobile: "9876599999",
          contactMethod: "whatsapp",
          message: "Interested in plot 5",
          projectId: activeProj._id,
          plot: "5",
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(String(res.data.data.assignedAdminId) === String(activeProj.adminId), "Assigned admin mismatch");
      testEnquiryId = res.data.data._id;
    });

    await test("29. Admin can update status of own assigned enquiry, but not another admin's", async () => {
      const enquiry = await Enquiry.findById(testEnquiryId);
      const assignedAdmin = await User.findById(enquiry.assignedAdminId);

      // Login as the assigned admin
      const loginRes = await makeRequest("/auth/login", {
        method: "POST",
        body: { email: assignedAdmin.email, password: "Admin@123" },
      });
      const assignedToken = loginRes.data.token;

      // Update status as assigned admin
      const updateRes = await makeRequest(`/admin/enquiries/${testEnquiryId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${assignedToken}` },
        body: { status: "CONTACTED" },
      });
      assert(updateRes.status === 200, `Expected 200, got ${updateRes.status}`);

      // Attempt update as unassigned admin (Arun if Priya, Priya if Arun)
      const otherToken = assignedAdmin.email === "arun@dreamcity.in" ? adminPriyaToken : adminArunToken;
      const forbiddenRes = await makeRequest(`/admin/enquiries/${testEnquiryId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${otherToken}` },
        body: { status: "CLOSED" },
      });
      assert(forbiddenRes.status === 403, `Expected 403 for other admin, got ${forbiddenRes.status}`);
    });

    await test("30. Super Admin analytics endpoint returns comprehensive system statistics", async () => {
      const res = await makeRequest("/super-admin/analytics", {
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const d = res.data.data;
      assert(d.projects && typeof d.projects.total === "number", "projects.total missing");
      assert(d.admins && typeof d.admins.total === "number", "admins.total missing");
      assert(d.plots && typeof d.plots.total === "number", "plots.total missing");
      assert(d.enquiries && typeof d.enquiries.total === "number", "enquiries.total missing");
      assert(d.siteVisits && typeof d.siteVisits.total === "number", "siteVisits.total missing");
      assert(Array.isArray(d.adminPerformance), "adminPerformance array missing");
    });

  } finally {
    server.close();
    await mongoose.connection.close();
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n-------------------------------------------------------");
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("-------------------------------------------------------\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("Test suite fatal error:", err);
  if (server) server.close();
  process.exit(1);
});
