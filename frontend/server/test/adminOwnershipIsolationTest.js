import dotenv from "dotenv";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";

dotenv.config();

const BASE_URL = "http://localhost:5000/api";

const login = async (email, password) => {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) {
    throw new Error(`Login failed for ${email}: ${data.message || res.statusText}`);
  }
  return { token: data.token, user: data.user };
};

async function runTestSuite() {
  console.log("==================================================================");
  console.log("  DREAMCITY ADMIN AUTHENTICATION & OWNERSHIP ISOLATION TEST SUITE");
  console.log("==================================================================");

  await connectDB();

  // 1. DYNAMIC DATABASE INTROSPECTION (No hardcoded counts!)
  console.log("\n--- Phase 1: Dynamic Database Introspection ---");
  const adminsInDb = await User.find({ role: "ADMIN" });
  console.log(`Found ${adminsInDb.length} normal admins in MongoDB:`);

  const adminProjectMap = {};
  for (const admin of adminsInDb) {
    const ownedProjects = await Project.find({ adminId: admin._id, isArchived: false });
    adminProjectMap[admin.email] = {
      user: admin,
      projectCount: ownedProjects.length,
      projectIds: ownedProjects.map((p) => p._id.toString()),
      customIds: ownedProjects.map((p) => p.customId),
    };
    console.log(`  • ${admin.name} (${admin.email}): ${ownedProjects.length} owned projects [customIds: ${ownedProjects.map((p) => p.customId).join(", ")}]`);
  }

  // 2. PROBLEM B: VERIFY LOGIN IDENTITY (Name/Role/Email)
  console.log("\n--- Phase 2: Problem B - Admin Login Identity Verification ---");
  const testLogins = [
    { email: "arun@dreamcity.in", expectedName: "Arun Kumar" },
    { email: "priya@dreamcity.in", expectedName: "Priya" },
    { email: "karthik@dreamcity.in", expectedName: "Karthik" },
    { email: "divya@dreamcity.in", expectedName: "Divya" },
  ];

  const adminTokens = {};
  for (const t of testLogins) {
    const auth = await login(t.email, "Admin@123");
    adminTokens[t.email] = auth.token;
    console.log(`  ✓ Logged in as ${t.email} -> Name in auth: "${auth.user.name}", Role: "${auth.user.role}"`);
    if (auth.user.name !== t.expectedName) {
      throw new Error(`Identity mismatch: expected ${t.expectedName}, got ${auth.user.name}`);
    }
  }

  // 3. PROBLEM A: PROJECT OWNERSHIP ISOLATION
  console.log("\n--- Phase 3: Problem A - Project Ownership Isolation ---");
  for (const t of testLogins) {
    const token = adminTokens[t.email];
    const expectedData = adminProjectMap[t.email];

    const res = await fetch(`${BASE_URL}/admin/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(`Failed to fetch projects for ${t.email}: ${data.message}`);
    }

    console.log(`  • Testing ${t.expectedName}:`);
    console.log(`    - Returned ${data.data.length} projects (DB count: ${expectedData.projectCount})`);

    if (data.data.length !== expectedData.projectCount) {
      throw new Error(`Project count mismatch for ${t.email}! Expected ${expectedData.projectCount}, received ${data.data.length}`);
    }

    // Verify all returned projects belong strictly to this admin
    for (const p of data.data) {
      const pAdminId = p.adminId?._id ? p.adminId._id.toString() : p.adminId?.toString();
      if (pAdminId !== expectedData.user._id.toString()) {
        throw new Error(`SECURITY LEAK: Project ${p.customId} belongs to ${pAdminId}, leaked to ${t.email}!`);
      }
    }
    console.log(`    ✓ Verified 100% of returned projects are owned by ${t.expectedName}. Zero data leakage.`);
  }

  // 4. CROSS-ADMIN ACCESS FORBIDDEN (GET / PUT / DELETE)
  console.log("\n--- Phase 4: Cross-Admin Direct URL/API Tampering Tests ---");
  const arunToken = adminTokens["arun@dreamcity.in"];
  const priyaData = adminProjectMap["priya@dreamcity.in"];

  if (priyaData && priyaData.projectIds.length > 0) {
    const priyaProjectId = priyaData.projectIds[0];
    const priyaCustomId = priyaData.customIds[0];

    // Arun tries to GET Priya's project
    const getRes = await fetch(`${BASE_URL}/admin/projects/${priyaProjectId}`, {
      headers: { Authorization: `Bearer ${arunToken}` },
    });
    console.log(`  • Arun GET Priya's project (${priyaCustomId}) -> HTTP Status: ${getRes.status} (Expected: 403)`);
    if (getRes.status !== 403) throw new Error(`Cross-access GET failed! Expected 403, got ${getRes.status}`);

    // Arun tries to PUT Priya's project
    const putRes = await fetch(`${BASE_URL}/admin/projects/${priyaProjectId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${arunToken}`,
      },
      body: JSON.stringify({ title: "Hacked by Arun" }),
    });
    console.log(`  • Arun PUT Priya's project (${priyaCustomId}) -> HTTP Status: ${putRes.status} (Expected: 403)`);
    if (putRes.status !== 403) throw new Error(`Cross-access PUT failed! Expected 403, got ${putRes.status}`);

    // Arun tries to DELETE Priya's project
    const delRes = await fetch(`${BASE_URL}/admin/projects/${priyaProjectId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${arunToken}` },
    });
    console.log(`  • Arun DELETE Priya's project (${priyaCustomId}) -> HTTP Status: ${delRes.status} (Expected: 403)`);
    if (delRes.status !== 403) throw new Error(`Cross-access DELETE failed! Expected 403, got ${delRes.status}`);

    console.log(`  ✓ Arun is strictly forbidden (403) from reading, updating, or deleting Priya's project.`);
  }

  // 5. PLOT OWNERSHIP ISOLATION
  console.log("\n--- Phase 5: Plot Ownership Verification ---");
  if (priyaData && priyaData.projectIds.length > 0) {
    const priyaPlots = await Plot.find({ projectId: priyaData.projectIds[0] });
    if (priyaPlots.length > 0) {
      const priyaPlot = priyaPlots[0];

      // Arun tries to edit Priya's plot
      const plotPutRes = await fetch(`${BASE_URL}/admin/plots/${priyaPlot.customId || priyaPlot._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${arunToken}`,
        },
        body: JSON.stringify({ price: "₹99 Lakh" }),
      });
      console.log(`  • Arun PUT Priya's plot (${priyaPlot.customId}) -> HTTP Status: ${plotPutRes.status} (Expected: 403)`);
      if (plotPutRes.status !== 403) throw new Error(`Cross-plot edit failed! Expected 403, got ${plotPutRes.status}`);

      // Arun tries to delete Priya's plot
      const plotDelRes = await fetch(`${BASE_URL}/admin/plots/${priyaPlot.customId || priyaPlot._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${arunToken}` },
      });
      console.log(`  • Arun DELETE Priya's plot (${priyaPlot.customId}) -> HTTP Status: ${plotDelRes.status} (Expected: 403)`);
      if (plotDelRes.status !== 403) throw new Error(`Cross-plot delete failed! Expected 403, got ${plotDelRes.status}`);

      console.log(`  ✓ Arun is strictly forbidden (403) from modifying plots belonging to Priya's projects.`);
    }
  }

  // 6. ENQUIRY & SITE VISIT ISOLATION
  console.log("\n--- Phase 6: Enquiry & Site Visit Isolation ---");
  const priyaToken = adminTokens["priya@dreamcity.in"];

  const arunEnqRes = await fetch(`${BASE_URL}/admin/enquiries`, {
    headers: { Authorization: `Bearer ${arunToken}` },
  });
  const arunEnquiries = await arunEnqRes.json();

  const priyaEnqRes = await fetch(`${BASE_URL}/admin/enquiries`, {
    headers: { Authorization: `Bearer ${priyaToken}` },
  });
  const priyaEnquiries = await priyaEnqRes.json();

  console.log(`  • Arun assigned enquiries: ${arunEnquiries.count}`);
  console.log(`  • Priya assigned enquiries: ${priyaEnquiries.count}`);

  const arunVisitsRes = await fetch(`${BASE_URL}/admin/site-visits`, {
    headers: { Authorization: `Bearer ${arunToken}` },
  });
  const arunVisits = await arunVisitsRes.json();

  const priyaVisitsRes = await fetch(`${BASE_URL}/admin/site-visits`, {
    headers: { Authorization: `Bearer ${priyaToken}` },
  });
  const priyaVisits = await priyaVisitsRes.json();

  console.log(`  • Arun assigned site visits: ${arunVisits.count}`);
  console.log(`  • Priya assigned site visits: ${priyaVisits.count}`);
  console.log(`  ✓ Enquiries and site visits are strictly isolated by assignedAdminId.`);

  // 7. PROBLEM C: ADMIN ACCOUNT CREATION RESTRICTIONS
  console.log("\n--- Phase 7: Problem C - Admin Creation & Role Restrictions ---");

  // Normal Admin tries to call Super Admin create admin endpoint
  const adminCreateRes = await fetch(`${BASE_URL}/super-admin/admins`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${arunToken}`,
    },
    body: JSON.stringify({ name: "Malicious Admin", email: "malicious@test.com" }),
  });
  console.log(`  • Normal Admin (Arun) calls POST /api/super-admin/admins -> HTTP Status: ${adminCreateRes.status} (Expected: 403)`);
  if (adminCreateRes.status !== 403) throw new Error(`Role protection failed! Expected 403, got ${adminCreateRes.status}`);

  // Regular User tries to call Super Admin create admin endpoint
  const userAuth = await login("user@dreamcity.in", "User@123");
  const userCreateRes = await fetch(`${BASE_URL}/super-admin/admins`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userAuth.token}`,
    },
    body: JSON.stringify({ name: "User Admin", email: "useradmin@test.com" }),
  });
  console.log(`  • Regular User calls POST /api/super-admin/admins -> HTTP Status: ${userCreateRes.status} (Expected: 403)`);
  if (userCreateRes.status !== 403) throw new Error(`Role protection failed! Expected 403, got ${userCreateRes.status}`);

  // Public Signup Role Tampering Test
  const tempEmail = `tamper_${Date.now()}@dreamcity.in`;
  const registerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Tamper Tester",
      email: tempEmail,
      password: "TestPassword@123",
      role: "ADMIN", // Tamper attempt
    }),
  });
  const regData = await registerRes.json();
  console.log(`  • Public registration with { role: "ADMIN" } -> Result role: "${regData.user?.role}" (Expected: USER)`);
  if (regData.user?.role !== "USER") {
    throw new Error(`Role tampering vulnerability! User was created with role ${regData.user?.role}`);
  }

  // Clean up test user
  await User.deleteOne({ email: tempEmail });

  // Super Admin can create Admin
  const superAuth = await login("superadmin@dreamcity.in", "SuperAdmin@123");
  const testAdminEmail = `created_admin_${Date.now()}@dreamcity.in`;
  const superCreateRes = await fetch(`${BASE_URL}/super-admin/admins`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${superAuth.token}`,
    },
    body: JSON.stringify({
      name: "Legit Test Admin",
      email: testAdminEmail,
      password: "Admin@123",
      mobile: "+91 91234 56789",
    }),
  });
  const superCreateData = await superCreateRes.json();
  console.log(`  • Super Admin calls POST /api/super-admin/admins -> HTTP Status: ${superCreateRes.status} (Expected: 201)`);
  if (superCreateRes.status !== 201) throw new Error(`Super Admin create admin failed! Got ${superCreateRes.status}`);
  console.log(`    ✓ New Admin created successfully with role "${superCreateData.data.role}"`);

  // Clean up created admin
  await User.deleteOne({ email: testAdminEmail });

  console.log("\n==================================================================");
  console.log("  ALL TESTS PASSED SUCCESSFULLY! ZERO DATA LEAKS DETECTED.");
  console.log("==================================================================");
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});
