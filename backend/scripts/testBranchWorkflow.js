/**
 * Integration tests — Branch Admin role & branch-based project workflow.
 *
 * Follows scripts/testVerification.js conventions (real MongoDB integration
 * script, cleanup in `finally`).
 *
 * IMPORTANT: connects to the dedicated `plotpro_branch_test` database on the
 * configured cluster so production/user data is never touched or notified.
 *
 * Run:  node scripts/testBranchWorkflow.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const TEST_DB_NAME = "plotpro_branch_test";

/**
 * Build an isolated test URI from MONGODB_URI.
 *
 * Always connects to the dedicated `plotpro_branch_test` database (dropping any
 * pre-existing db name in the path) while preserving credentials, hosts and
 * query params untouched. When the original URI carries no explicit
 * `authSource`, the driver would have defaulted authentication to the `admin`
 * database (that is how the app itself connects, since its URI has no db
 * name) — so set `authSource=admin` explicitly to keep auth working once a
 * database name occupies the path.
 */
const buildTestUri = () => {
  const base = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
  try {
    const qIdx = base.indexOf("?");
    const head = qIdx === -1 ? base : base.slice(0, qIdx);
    const query = qIdx === -1 ? "" : base.slice(qIdx + 1);

    const schemeEnd = head.indexOf("://") + 3;
    const lastSlash = head.lastIndexOf("/");
    const hostPart = lastSlash > schemeEnd ? head.slice(0, lastSlash) : head;

    let out = `${hostPart}/${TEST_DB_NAME}`;

    const hasAuthSource = /[?&]authSource=/i.test(base);
    if (!hasAuthSource) {
      out += query ? `?${query}&authSource=admin` : "?authSource=admin";
    } else {
      out += `?${query}`;
    }
    return out;
  } catch {
    return base;
  }
};
const testUri = buildTestUri();

import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Subscription from "../models/Subscription.js";
import Branch from "../models/Branch.js";
import Notification from "../models/Notification.js";

import {
  verifyProjectOwnership,
  verifyPlotOwnership,
  resolveAdminProjectScope,
} from "../middleware/ownershipMiddleware.js";
import {
  createBranch,
  toggleBranchStatus,
  getBranches,
} from "../controllers/branchController.js";
import {
  createProjectSuperAdmin,
  assignProjectAdmin,
  approveProject,
  deleteAdminAccount,
} from "../controllers/superAdminController.js";
import {
  createAdminProject,
  getAdminProjects,
} from "../controllers/projectController.js";

let passed = 0;
const test = async (label, fn) => {
  passed++;
  console.log(`\n[Test ${passed}] ${label}`);
  await fn();
};

// Cleanup registries (shared between runTests and the final cleanup block)
const tempUserIds = [];
const tempPlanIds = [];
const tempSubIds = [];
const tempBranchIds = [];
const tempProjectIds = [];
const tempPlotIds = [];

// ─── Mock req/res helpers (route middleware bypassed; controllers real) ──────
const makeRes = () => {
  const res = { statusCode: 0, body: null, nextCalled: false };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

const runController = async (controller, req) => {
  const res = makeRes();
  const next = (err) => {
    if (err) throw err;
    res.nextCalled = true;
  };
  await controller(req, res, next);
  return { res };
};

const runMiddleware = async (middleware, req) => {
  const res = makeRes();
  await middleware(req, res, () => {
    res.nextCalled = true;
  });
  return res;
};

async function runTests() {
  console.log("=== INTEGRATION TESTS FOR BRANCH ADMIN & BRANCH WORKFLOW ===");
  console.log(
    "Database:",
    mongoose.connection.name,
    "(isolated test database — production data untouched)"
  );

  let superAdmin; // tenant owner (Super Admin)
  let legacyAdmin; // branchId: null — pre-existing style staff account
  let branchA; // Branch under superAdmin
  let branchAdminA; // role ADMIN w/ branchId -> branchA
  let branchB; // second branch (other city)
  let branchAdminB;
  let otherSuper; // another tenant's Super Admin
  let otherAdmin; // branch admin of otherSuper's tenant
  let otherBranch;

  // Main runner: any thrown error fails the suite
  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg || "Assertion failed");
    console.log(`  ✓ ${msg}: PASSED`);
  };

  const countActiveTenantAdmins = (tenantId) =>
    User.countDocuments({ role: "ADMIN", tenantId, status: "ACTIVE" });

  // ─── Setup fixtures ────────────────────────────────────────────────────────
  await test("Setup: tenant owner, legacy admin, 3-seat subscription", async () => {
    superAdmin = await User.create({
      name: "Super Admin Owner",
      email: `sa_owner_${Date.now()}@branchtest.local`,
      passwordHash: "x",
      role: "SUPER_ADMIN",
      businessName: "Branch Test Tenant",
    });
    tempUserIds.push(superAdmin._id);

    // 3-seat plan: legacy (1) + branch A (2) + branch B (3) all coexist
    const plan = await Plan.create({
      name: `Three Seat Plan ${Date.now()}`,
      slug: `three-seat-${Date.now()}`,
      price: 1999,
      billingInterval: "MONTHLY",
      durationDays: 30,
      maxAdminSeats: 3,
    });
    tempPlanIds.push(plan._id);

    const sub = await Subscription.create({
      subscriberId: superAdmin._id,
      planId: plan._id,
      status: "ACTIVE",
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      assignedSeats: 3,
      usedSeats: 0,
    });
    tempSubIds.push(sub._id);

    // Legacy admin: pre-existing style staff account WITHOUT branch
    legacyAdmin = await User.create({
      name: "Legacy Staff Admin",
      email: `legacy_staff_${Date.now()}@branchtest.local`,
      passwordHash: "x",
      role: "ADMIN",
      tenantId: superAdmin._id,
      status: "ACTIVE",
    });
    tempUserIds.push(legacyAdmin._id);

    // usedSeats ground truth: 1 active tenant admin
    await Subscription.updateOne(
      { subscriberId: superAdmin._id },
      { $set: { usedSeats: 1 } }
    );

    assert(
      legacyAdmin.branchId === null || legacyAdmin.branchId === undefined,
      "legacy admin created without branch assignment"
    );
  });

  // ─── 1. Legacy backward compatibility ────────────────────────────────────
  await test("Legacy ADMIN scope unchanged: ownership-based, no branch", async () => {
    const scope = await resolveAdminProjectScope(legacyAdmin);
    assert(scope.type === "LEGACY_ADMIN", "legacy admin resolves to LEGACY_ADMIN scope");
    assert(
      scope.filter && String(scope.filter.adminId) === String(legacyAdmin._id),
      "legacy scope filters strictly by adminId ownership"
    );
  });

  // ─── 2. Branch creation + provisioning ───────────────────────────────────
  await test("Branch creation provisions Branch Admin (seat consumed, account linked)", async () => {
    const { res } = await runController(createBranch, {
      user: superAdmin,
      body: {
        name: "Anna Nagar",
        city: "Chennai",
        region: "North Chennai",
        address: "12 Main Rd",
        adminName: "Priya (Anna Nagar)",
        adminEmail: `branchA_${Date.now()}@branchtest.local`,
        adminMobile: "9876500001",
      },
    });

    assert(res.statusCode === 201, "branch creation returns 201");
    assert(res.body.success === true, "branch creation succeeds");

    tempBranchIds.push(res.body.data._id);
    branchA = await Branch.findById(res.body.data._id);
    branchAdminA = await User.findById(branchA.branchAdmin);
    tempUserIds.push(branchAdminA._id);

    assert(String(branchAdminA.tenantId) === String(superAdmin._id), "branch admin bound to correct tenant");
    assert(String(branchAdminA.branchId) === String(branchA._id), "branch admin linked to branch");
    assert(branchAdminA.role === "ADMIN", "branch admin keeps stored role ADMIN");
    assert(branchAdminA.status === "ACTIVE", "branch admin active");

    const sub = await Subscription.findOne({ subscriberId: superAdmin._id });
    assert(sub.usedSeats === 2, `seat consumed atomically and synced (usedSeats=${sub.usedSeats}/3)`);
  });

  // ─── 3. Branch creation + seat exhaustion ────────────────────────────────
  await test("Second branch created; THIRD fails at seat limit — no orphans, no seat leak", async () => {
    const { res: resB } = await runController(createBranch, {
      user: superAdmin,
      body: {
        name: "Velachery",
        city: "Chennai",
        adminName: "Karun (Velachery)",
        adminEmail: `branchB_${Date.now()}@branchtest.local`,
      },
    });
    assert(resB.statusCode === 201, "branch B created (seat 3/3)");
    tempBranchIds.push(resB.body.data._id);

    branchB = await Branch.findById(resB.body.data._id);
    branchAdminB = await User.findById(branchB.branchAdmin);
    tempUserIds.push(branchAdminB._id);
    assert(String(branchAdminB.branchId) === String(branchB._id), "branch B admin linked");
    assert(String(branchAdminB.tenantId) === String(superAdmin._id), "branch B admin bound to tenant");

    const before = {
      branches: await Branch.countDocuments({ tenantId: superAdmin._id }),
      admins: await countActiveTenantAdmins(superAdmin._id),
    };

    // Quota full → 4th attempt must fail BEFORE creating anything
    const { res: resC } = await runController(createBranch, {
      user: superAdmin,
      body: {
        name: "Adyar",
        city: "Chennai",
        adminName: "Overseer",
        adminEmail: `branchC_${Date.now()}@branchtest.local`,
      },
    });

    assert(resC.statusCode === 400, "over-quota branch creation rejected (400)");
    assert(/seat limit reached/i.test(resC.body.message || ""), "clear seat-limit error message");

    const afterBranches = await Branch.countDocuments({ tenantId: superAdmin._id });
    const afterAdmins = await countActiveTenantAdmins(superAdmin._id);
    const sub = await Subscription.findOne({ subscriberId: superAdmin._id });

    assert(afterBranches === before.branches, "no orphaned branch left behind");
    assert(afterAdmins === before.admins, "no orphaned admin user left behind");
    assert(sub.usedSeats === afterAdmins, `usedSeats synced to ground truth (no seat leak)`);

    const orphanUser = await User.countDocuments({ email: /branchC_/i });
    assert(orphanUser === 0, "no orphaned user account for the rejected branch");
  });

  // ─── 4. Duplicate protection ─────────────────────────────────────────────
  await test("Duplicate branch name rejected without side effects", async () => {
    const { res } = await runController(createBranch, {
      user: superAdmin,
      body: {
        name: "anna nagar", // case-insensitive duplicate
        city: "Chennai",
        adminName: "Dup Tester",
        adminEmail: `dup_${Date.now()}@branchtest.local`,
      },
    });
    assert(res.statusCode === 400, "duplicate branch name rejected");
    assert(/already exists/i.test(res.body.message || ""), "clear duplicate message");

    const orphan = await User.countDocuments({ email: /^dup_/i });
    assert(orphan === 0, "no orphaned user account created for rejected branch");
  });

  await test("Duplicate Branch Admin email rejected; deactivation/reactivation cycle keeps seats exact", async () => {
    // Free one seat first so the duplicate-email path is reachable
    const { res: d } = await runController(toggleBranchStatus, {
      user: superAdmin,
      params: { id: String(branchB._id) },
      body: { status: "INACTIVE" },
    });
    assert(d.statusCode === 200, "branch B deactivated to free a seat");

    const adminBAfterDeactivate = await User.findById(branchAdminB._id);
    assert(adminBAfterDeactivate.status === "INACTIVE", "branch B admin paused on deactivation");

    const { res } = await runController(createBranch, {
      user: superAdmin,
      body: {
        name: "Adyar",
        city: "Chennai",
        adminName: "Dup Email Tester",
        adminEmail: branchAdminA.email, // duplicate admin email
      },
    });
    assert(res.statusCode === 400, "duplicate admin email rejected");
    assert(
      /already belongs to a Branch|staff Admin account/i.test(res.body.message || ""),
      "clear duplicate-account message"
    );

    const subMid = await Subscription.findOne({ subscriberId: superAdmin._id });
    const activeMid = await countActiveTenantAdmins(superAdmin._id);
    assert(subMid.usedSeats === activeMid, "usedSeats consistent after duplicate rejection (no leak)");

    // Reactivate B → seat re-reserved atomically
    const { res: r } = await runController(toggleBranchStatus, {
      user: superAdmin,
      params: { id: String(branchB._id) },
      body: { status: "ACTIVE" },
    });
    assert(r.statusCode === 200, "branch B reactivated");

    const adminBAfterReactivate = await User.findById(branchAdminB._id);
    assert(adminBAfterReactivate.status === "ACTIVE", "branch B admin re-activated with branch");

    const subAfter = await Subscription.findOne({ subscriberId: superAdmin._id });
    const activeAfter = await countActiveTenantAdmins(superAdmin._id);
    assert(subAfter.usedSeats === activeAfter, `seat ledger exact after cycle (${activeAfter})`);
  });

  // ─── 5. Project fixtures for authorization tests ─────────────────────────
  let legacyProject;
  let branchAProject;
  let rosterProject;
  let otherBranchProject;
  let nextCustomId;

  await test("Project fixtures: legacy-owned, branch-owned (A), and branch roster (A, unowned)", async () => {
    const maxProject = await Project.findOne().sort({ customId: -1 });
    nextCustomId = maxProject && maxProject.customId ? maxProject.customId + 1 : 1;

    legacyProject = await Project.create({
      customId: nextCustomId++, // eslint-disable-line no-plusplus
      title: `Legacy Project ${Date.now()}`,
      location: "Legacy City",
      city: "Legacy City",
      plotPrice: "₹10 Lakh",
      priceLakhs: 10,
      adminId: legacyAdmin._id,
      branchId: null,
      approvalStatus: "APPROVED",
    });
    tempProjectIds.push(legacyProject._id);

    branchAProject = await Project.create({
      customId: nextCustomId++, // eslint-disable-line no-plusplus
      title: `Branch A Project ${Date.now()}`,
      location: "Chennai",
      city: "Chennai",
      plotPrice: "₹12 Lakh",
      priceLakhs: 12,
      adminId: branchAdminA._id,
      branchId: branchA._id,
      approvalStatus: "PENDING",
    });
    tempProjectIds.push(branchAProject._id);

    rosterProject = await Project.create({
      customId: nextCustomId++, // eslint-disable-line no-plusplus
      title: `Roster Project ${Date.now()}`,
      location: "Chennai",
      city: "Chennai",
      plotPrice: "₹12 Lakh",
      priceLakhs: 12,
      adminId: null,
      branchId: branchA._id,
      approvalStatus: "PENDING",
    });
    tempProjectIds.push(rosterProject._id);

    assert(String(branchAProject.branchId) === String(branchA._id), "branch project fixture ready");
    assert(rosterProject.adminId === null, "roster project fixture ready");
  });

  // ─── 6. Branch-scoped authorization (middleware level) ───────────────────
  await test("Branch Admin CAN access own-branch project AND branch roster project", async () => {
    const admin = await User.findById(branchAdminA._id);

    const own = await runMiddleware(verifyProjectOwnership, {
      user: admin,
      params: { id: String(branchAProject._id) },
    });
    assert(own.nextCalled === true, "verifyProjectOwnership grants own-branch project");
    assert(own.statusCode === 0, "no error response written");

    const roster = await runMiddleware(verifyProjectOwnership, {
      user: admin,
      params: { id: String(rosterProject._id) },
    });
    assert(roster.nextCalled === true, "branch admin can access unowned branch roster project (branchId match)");
  });

  await test("Legacy project is INVISIBLE to Branch Admin (no adminId OR-branch bypass)", async () => {
    const admin = await User.findById(branchAdminA._id);
    const res = await runMiddleware(verifyProjectOwnership, {
      user: admin,
      params: { id: String(legacyProject._id) },
    });
    assert(res.statusCode === 403, "branch admin denied legacy admin's project (403)");
    assert(res.nextCalled === false, "request did not proceed");
  });

  await test("Cross-branch access rejected: Branch Admin B vs Branch A project", async () => {
    const res = await runMiddleware(verifyProjectOwnership, {
      user: branchAdminB,
      params: { id: String(branchAProject._id) },
    });
    assert(res.statusCode === 403, "cross-branch project access rejected (403)");
    assert(res.nextCalled === false, "no continuation after cross-branch denial");
  });

  await test("Cross-tenant access rejected: foreign Branch Admin and foreign legacy admin", async () => {
    otherSuper = await User.create({
      name: "Other Tenant Owner",
      email: `other_sa_${Date.now()}@branchtest.local`,
      passwordHash: "x",
      role: "SUPER_ADMIN",
      businessName: "Other Tenant",
    });
    tempUserIds.push(otherSuper._id);

    const plan = await Plan.create({
      name: `Other Plan ${Date.now()}`,
      slug: `other-plan-${Date.now()}`,
      price: 999,
      billingInterval: "MONTHLY",
      durationDays: 30,
      maxAdminSeats: 5,
    });
    tempPlanIds.push(plan._id);

    const sub = await Subscription.create({
      subscriberId: otherSuper._id,
      planId: plan._id,
      status: "ACTIVE",
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      assignedSeats: 5,
      usedSeats: 0,
    });
    tempSubIds.push(sub._id);

    const { res } = await runController(createBranch, {
      user: otherSuper,
      body: {
        name: "Kochi Branch",
        city: "Kochi",
        adminName: "Other Branch Admin",
        adminEmail: `other_branch_${Date.now()}@branchtest.local`,
      },
    });
    assert(res.statusCode === 201, "other tenant branch created");
    tempBranchIds.push(res.body.data._id);

    otherBranch = await Branch.findById(res.body.data._id);
    otherAdmin = await User.findById(otherBranch.branchAdmin);
    tempUserIds.push(otherAdmin._id);

    // Fixture project in the other tenant's branch
    otherBranchProject = await Project.create({
      customId: nextCustomId++, // eslint-disable-line no-plusplus
      title: `Other Tenant Project ${Date.now()}`,
      location: "Kochi",
      city: "Kochi",
      plotPrice: "₹15 Lakh",
      priceLakhs: 15,
      adminId: otherAdmin._id,
      branchId: otherBranch._id,
      approvalStatus: "PENDING",
    });
    tempProjectIds.push(otherBranchProject._id);

    // Other tenant's branch admin tries tenant A's branch project → 403
    const resX = await runMiddleware(verifyProjectOwnership, {
      user: otherAdmin,
      params: { id: String(branchAProject._id) },
    });
    assert(resX.statusCode === 403, "cross-tenant branch admin denied (403)");
    assert(resX.nextCalled === false, "no continuation after cross-tenant denial");

    // Legacy admin (tenant A) accessing OTHER tenant's project → still 403 (ownership rule)
    const resY = await runMiddleware(verifyProjectOwnership, {
      user: legacyAdmin,
      params: { id: String(otherBranchProject._id) },
    });
    assert(resY.statusCode === 403, "legacy admin denied foreign project (ownership rule preserved)");
  });

  await test("Plot ownership: Branch Admin A allowed within own branch; B denied cross-branch", async () => {
    const plot = await Plot.create({
      customId: `${branchAProject._id}-992`,
      projectId: branchAProject._id,
      projectCustomId: branchAProject.customId,
      plotNumber: "992",
      size: "600 sq.ft",
      facing: "East",
      price: "₹12 Lakh",
      status: "Available",
    });
    tempPlotIds.push(plot._id);

    const adminA = await User.findById(branchAdminA._id);
    const ok = await runMiddleware(verifyPlotOwnership, {
      user: adminA,
      params: { id: String(plot._id) },
    });
    assert(ok.nextCalled === true, "branch admin can manage own-branch plot");

    const denied = await runMiddleware(verifyPlotOwnership, {
      user: branchAdminB,
      params: { id: String(plot._id) },
    });
    assert(denied.statusCode === 403, "cross-branch plot modification rejected (403)");
    assert(denied.nextCalled === false, "no continuation after plot denial");
  });

  // ─── 7. Branch-scoped listing & creation (controller level) ─────────────
  await test("getAdminProjects: strict branch list for Branch Admin; ownership list for legacy", async () => {
    const admin = await User.findById(branchAdminA._id);
    const { res } = await runController(getAdminProjects, { user: admin });
    assert(res.statusCode === 200, "branch admin project list OK");

    const branchIds = res.body.data.map((p) => String(p.branchId));
    const branchAId = String(branchA._id);
    assert(
      branchIds.every((id) => id === branchAId),
      "every listed project belongs ONLY to branch A"
    );

    const expectedA = await Project.countDocuments({ branchId: branchA._id });
    assert(res.body.data.length === expectedA, `list count matches branch scope (${expectedA})`);

    const legacyOwnerIdsProjected = res.body.data
      .filter((p) => p.adminId && String(p.adminId) === String(legacyAdmin._id));
    assert(legacyOwnerIdsProjected.length === 0, "legacy-owned project excluded from branch list");

    // Legacy admin list: strictly own projects
    const { res: resLegacy } = await runController(getAdminProjects, { user: legacyAdmin });
    assert(resLegacy.statusCode === 200, "legacy admin project list OK");
    const legacyOwned = await Project.countDocuments({ adminId: legacyAdmin._id });
    assert(
      resLegacy.body.data.length === legacyOwned,
      "legacy admin sees ONLY own projects (branch projects excluded)"
    );
  });

  await test("createAdminProject (Branch Admin): branchId stamped server-side + PENDING; blocked when branch inactive", async () => {
    const admin = await User.findById(branchAdminA._id);
    const { res } = await runController(createAdminProject, {
      user: admin,
      body: {
        title: `Branch Created Project ${Date.now()}`,
        location: "Chennai",
        city: "Chennai",
        plotPrice: "₹12 Lakh",
      },
    });
    assert(res.statusCode === 201, "branch admin project created while branch active");

    const created = res.body.data;
    tempProjectIds.push(created._id);

    assert(String(created.branchId) === String(branchA._id), "new project auto-stamped with branchId");
    assert(created.approvalStatus === "PENDING", "project enters PENDING approval workflow");
    assert(String(created.adminId) === String(branchAdminA._id), "adminId owner set");

    // Deactivate branch → creation must block
    const { res: d } = await runController(toggleBranchStatus, {
      user: superAdmin,
      params: { id: String(branchA._id) },
      body: { status: "INACTIVE" },
    });
    assert(d.statusCode === 200, "branch A deactivated for block test");

    const inactiveAdmin = await User.findById(branchAdminA._id);
    const { res: resInactive } = await runController(createAdminProject, {
      user: inactiveAdmin,
      body: {
        title: "Should Not Create",
        location: "Chennai",
        plotPrice: "₹12 Lakh",
      },
    });
    assert(resInactive.statusCode === 403, "deactivated branch blocks project creation");

    // Listing while inactive must also block
    const { res: resList } = await runController(getAdminProjects, { user: inactiveAdmin });
    assert(resList.statusCode === 403, "deactivated branch blocks project listing");

    // Reactivate for later tests
    const { res: r } = await runController(toggleBranchStatus, {
      user: superAdmin,
      params: { id: String(branchA._id) },
      body: { status: "ACTIVE" },
    });
    assert(r.statusCode === 200, "branch A reactivated");

    const sub = await Subscription.findOne({ subscriberId: superAdmin._id });
    const activeCount = await countActiveTenantAdmins(superAdmin._id);
    assert(sub.usedSeats === activeCount, `seat ledger stable through deactivate/reactivate (${activeCount})`);
  });

  // ─── 8. Approval workflow preservation ───────────────────────────────────
  await test("approveProject on branch project: APPROVED by super admin; workflow unchanged", async () => {
    const pending = await Project.findOne({
      adminId: branchAdminA._id,
      approvalStatus: "PENDING",
    });
    assert(Boolean(pending), "a PENDING branch project exists");

    const { res } = await runController(approveProject, {
      user: superAdmin,
      params: { id: String(pending._id) },
    });

    assert(res.statusCode === 200 && res.body.success, "approve succeeded for branch project");
    const fresh = await Project.findById(pending._id);
    assert(fresh.approvalStatus === "APPROVED", "approvalStatus APPROVED (public visibility rule unchanged)");
    assert(String(fresh.approvedBy) === String(superAdmin._id), "approvedBy set to tenant Super Admin");
    assert(String(fresh.branchId) === String(branchA._id), "branch assignment untouched by approval");
  });

  // ─── 9. Super Admin project creation with branch validation ──────────────
  await test("createProjectSuperAdmin: valid branch accepted; fabricated/cross-tenant branch rejected", async () => {
    // Valid branch assignment
    const { res } = await runController(createProjectSuperAdmin, {
      user: superAdmin,
      body: {
        title: `SA Branch Project ${Date.now()}`,
        location: "Chennai",
        plotPrice: "₹12 Lakh",
        branchId: String(branchA._id),
      },
    });
    assert(res.statusCode === 201, "super admin project created for valid tenant branch");
    tempProjectIds.push(res.body.data._id);
    assert(String(res.body.data.branchId) === String(branchA._id), "branchId attached server-side");
    assert(res.body.data.approvalStatus === "APPROVED", "super admin project stays APPROVED (existing behavior)");

    // Fabricated branch ID (other tenant) must be rejected
    const { res: resBad } = await runController(createProjectSuperAdmin, {
      user: superAdmin,
      body: {
        title: `SA Bad Branch ${Date.now()}`,
        location: "Chennai",
        plotPrice: "₹12 Lakh",
        branchId: String(otherBranch._id),
      },
    });
    assert(resBad.statusCode === 400, "fabricated/cross-tenant branch rejected");
    assert(
      /does not belong to your organization/i.test(resBad.body.message || ""),
      "clear validation message"
    );
  });

  await test("assignProjectAdmin: branch consistency enforced", async () => {
    // Legacy-owned project CANNOT be branch-scoped without reassigning ownership
    const { res: resBranchOnly } = await runController(assignProjectAdmin, {
      user: superAdmin,
      params: { id: String(legacyProject._id) },
      body: { branchId: String(branchA._id) },
    });
    assert(resBranchOnly.statusCode === 400, "branch-only association on legacy-owned project rejected");
    const unchanged = await Project.findById(legacyProject._id);
    assert(
      unchanged.branchId === null || unchanged.branchId === undefined,
      "legacy project branch scope NOT changed by rejected attempt"
    );

    // Assigning the project to branch admin A stamps the branch atomically
    const { res: resAssign } = await runController(assignProjectAdmin, {
      user: superAdmin,
      params: { id: String(legacyProject._id) },
      body: { adminId: String(branchAdminA._id) },
    });
    assert(resAssign.statusCode === 200, "project assigned to branch admin");
    const fresh = await Project.findById(legacyProject._id);
    assert(String(fresh.adminId) === String(branchAdminA._id), "ownership transferred to branch admin");
    assert(String(fresh.branchId) === String(branchA._id), "branchId stamped with admin's branch");
  });

  // ─── 10. Deactivation safety + retry idempotency ──────────────────────────
  await test("Branch deactivation: admin paused, seat released exactly once, projects untouched", async () => {
    const branchAdmin = await User.findById(branchAdminA._id);
    assert(branchAdmin.status === "ACTIVE", "precondition: branch admin active");

    const projectBefore = await Project.findOne({ adminId: branchAdmin._id });
    assert(Boolean(projectBefore), "precondition: branch project exists");
    const ownerBefore = String(projectBefore.adminId);
    const branchIdBefore = String(projectBefore.branchId);

    const { res } = await runController(toggleBranchStatus, {
      user: superAdmin,
      params: { id: String(branchA._id) },
      body: { status: "INACTIVE" },
    });
    assert(res.statusCode === 200, "deactivation succeeds");

    const branchFresh = await Branch.findById(branchA._id);
    const adminFresh = await User.findById(branchAdmin._id);
    assert(branchFresh.status === "INACTIVE", "branch marked inactive");
    assert(adminFresh.status === "INACTIVE", "branch admin account deactivated (login blocked by existing rules)");

    const projectAfter = await Project.findById(projectBefore._id);
    assert(String(projectAfter.adminId) === ownerBefore, "projects NOT silently reassigned on deactivation");
    assert(String(projectAfter.branchId) === branchIdBefore, "branch assignment preserved on projects");

    const sub = await Subscription.findOne({ subscriberId: superAdmin._id });
    const activeCount = await countActiveTenantAdmins(superAdmin._id);
    assert(sub.usedSeats === activeCount, `seat ledger exact after release (${sub.usedSeats})`);

    // Retry deactivation → 400, no double seat release
    const { res: retry } = await runController(toggleBranchStatus, {
      user: superAdmin,
      params: { id: String(branchA._id) },
      body: { status: "INACTIVE" },
    });
    assert(retry.statusCode === 400, "repeated deactivation is safely rejected");
    const subRetry = await Subscription.findOne({ subscriberId: superAdmin._id });
    assert(subRetry.usedSeats === sub.usedSeats, "seat NOT released twice on retry");

    // Reactivate → seat re-reserved
    const { res: re } = await runController(toggleBranchStatus, {
      user: superAdmin,
      params: { id: String(branchA._id) },
      body: { status: "ACTIVE" },
    });
    assert(re.statusCode === 200, "branch reactivated");
    const adminActive = await User.findById(branchAdmin._id);
    assert(adminActive.status === "ACTIVE", "branch admin re-activated with branch");

    // Retry reactivation → 400, no double seat reservation
    const { res: reRetry } = await runController(toggleBranchStatus, {
      user: superAdmin,
      params: { id: String(branchA._id) },
      body: { status: "ACTIVE" },
    });
    assert(reRetry.statusCode === 400, "repeated reactivation is safely rejected");
    const subReRetry = await Subscription.findOne({ subscriberId: superAdmin._id });
    const activePost = await countActiveTenantAdmins(superAdmin._id);
    assert(subReRetry.usedSeats === activePost, "seat NOT reserved twice on reactivation retry");
  });

  // ─── 11. Legacy deleteAdminAccount account-compatibility ──────────────────
  await test("deleteAdminAccount rejects foreign-tenant admins (isolation verified)", async () => {
    const { res } = await runController(deleteAdminAccount, {
      user: superAdmin,
      params: { id: String(otherAdmin._id) },
    });
    assert(res.statusCode === 403, "foreign tenant admin deletion blocked (403)");
    const stillThere = await User.findById(otherAdmin._id);
    assert(Boolean(stillThere), "foreign admin NOT deleted");
  });

  // ─── 12. Tenant visibility (Super Admin dashboard) ────────────────────────
  await test("getBranches returns ONLY own tenant branches", async () => {
    const { res } = await runController(getBranches, { user: superAdmin });
    assert(res.statusCode === 200, "branches list OK");
    const totalOwn = await Branch.countDocuments({ tenantId: superAdmin._id });
    assert(res.body.count === totalOwn, `exactly ${totalOwn} own-tenant branches returned`);
    assert(
      res.body.data.every((b) => String(b.tenantId) === String(superAdmin._id)),
      "no cross-tenant branch leakage"
    );
    assert(
      res.body.data.every((b) => typeof b.projectCount === "number"),
      "branch payload includes project counts"
    );

    const { res: resOther } = await runController(getBranches, { user: otherSuper });
    assert(resOther.statusCode === 200, "other tenant branches list OK");
    assert(resOther.body.count === 1, "other tenant sees only its own single branch");
  });
}

// ─── Boot ────────────────────────────────────────────────────────────────────
async function main() {
  let ok = false;
  await mongoose.connect(testUri);
  console.log("Connected to MongoDB:", mongoose.connection.name);

  try {
    await runTests();
    console.log("\n=== ALL BRANCH WORKFLOW TESTS PASSED ===");
    console.log(`Total test groups executed: ${passed}`);
    ok = true;
  } catch (err) {
    console.error("\nTest execution failed:", err);
  } finally {
    console.log("\nCleaning up test artifacts…");
    try {
      if (tempPlotIds.length) await Plot.deleteMany({ _id: { $in: tempPlotIds } });
      if (tempProjectIds.length) await Project.deleteMany({ _id: { $in: tempProjectIds } });
      if (tempBranchIds.length) await Branch.deleteMany({ _id: { $in: tempBranchIds } });
      if (tempUserIds.length) {
        // Remove notifications emitted to test recipients, then the users
        await Notification.deleteMany({ recipient: { $in: tempUserIds } });
        await User.deleteMany({ _id: { $in: tempUserIds } });
      }
      if (tempSubIds.length) await Subscription.deleteMany({ _id: { $in: tempSubIds } });
      if (tempPlanIds.length) await Plan.deleteMany({ _id: { $in: tempPlanIds } });
      console.log("Test artifacts cleaned up safely.");
    } catch (cleanupErr) {
      console.error("Cleanup failed:", cleanupErr.message);
    }
    await mongoose.disconnect();
    process.exit(ok ? 0 : 1);
  }
}

main().catch((err) => {
  console.error("Fatal boot error:", err);
  process.exit(1);
});
