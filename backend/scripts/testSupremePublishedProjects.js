/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PLOTPRO — Supreme Admin "Published Projects Overview" test suite
 * ─────────────────────────────────────────────────────────────────────────────
 *  Follows scripts/testBranchWorkflow.js conventions (real integration script,
 *  dedicated isolated test database, controllers invoked directly with mocked
 *  req/res, cleanup in `finally`).
 *
 *  Verifies:
 *   1–4. Role access matrix (SUPREME OK; SUPER_ADMIN/ADMIN/USER denied)
 *   5.   Published counts accurate (PENDING/REJECTED/archived excluded)
 *   6.   Tenant-wise counts accurate (Super Admin-wise totals)
 *   7.   Branch Admin attribution accurate
 *   8.   Cross-tenant isolation (Tenant B admin never under Tenant A)
 *   9.   Zero-published Branch Admins still listed
 *   10.  Unknown / Legacy handling (no fabricated attribution)
 *   11.  Date range filters
 *   12.  Project name search
 *   13.  Pagination + validation clamping
 *   14.  No sensitive User fields leak into responses
 *
 *  Run:       node scripts/testSupremePublishedProjects.js
 *  Revoked by: scripts/runIsolatedSecurityTests.js (ephemeral MongoDB)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const TEST_DB_NAME = "plotpro_published_test";

/**
 * Build an isolated test URI from MONGODB_URI (dedicated test database only).
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
import Project from "../models/Project.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
  getPublishedProjectsSummary,
  getSuperAdminPublishedCounts,
  getSuperAdminPublishedAdmins,
  getSuperAdminPublishedProjectsAdminWise,
} from "../controllers/supremeAdminPublishedProjectsController.js";

let passed = 0;
const test = async (label, fn) => {
  passed++;
  console.log(`\n[Test ${passed}] ${label}`);
  await fn();
};

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
  return { res };
};

// ─── Fixtures registry ───────────────────────────────────────────────────────
const DOM = "@pubtest.local";
const TITLE_PREFIX = "PUBTEST";

const fixtureEmails = [];
const tempUserIds = [];
const tempProjectIds = [];
const fixtureEmailFilter = () => ({ email: { $regex: `${DOM}$` } });
const fixtureTitleFilter = () => ({ title: { $regex: `^${TITLE_PREFIX}` } });

async function runTests() {
  console.log("=== SUPREME ADMIN PUBLISHED PROJECTS OVERVIEW TESTS ===");
  console.log(
    "Database:",
    mongoose.connection.name,
    "(isolated test database — production data untouched)"
  );

  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg || "Assertion failed");
    console.log(`  ✓ ${msg}: PASSED`);
  };

  // ─── Setup fixtures ────────────────────────────────────────────────────────
  let supreme;
  let superAdminA;
  let superAdminB;
  let adminA1;
  let adminA2;
  let adminAZero;
  let adminB1;
  let regularUser;
  let projects = {};
  const FUTURE = new Date("2026-01-05T10:00:00Z");
  const PAST = new Date("2025-06-10T10:00:00Z");
  const MID = new Date("2025-09-15T10:00:00Z");
  const RECENT = new Date("2026-03-01T10:00:00Z");

  let nextCustomId = 900000; // unique `customId` (unique index) for fixtures
  const mkProject = async (fields) => {
    const doc = await Project.create({
      title: `${TITLE_PREFIX} Project ${nextCustomId}`,
      customId: nextCustomId,
      location: `${TITLE_PREFIX} City, Test Region`,
      city: "Test City",
      plotPrice: "₹12 Lakh",
      priceLakhs: 12,
      approvalStatus: "APPROVED",
      isArchived: false,
      ...fields,
    });
    tempProjectIds.push(doc._id);
    nextCustomId += 1;
    return doc;
  };

  const createUsers = async () => {
    const mk = async (name, role, extra = {}) => {
      const email = `${name.toLowerCase().replace(/\W+/g, "_")}_${Date.now()}${DOM}`;
      fixtureEmails.push(email);
      const user = await User.create({ name, email, passwordHash: "x", role, ...extra });
      tempUserIds.push(user._id);
      return user;
    };
    supreme = await mk("Supreme Owner", "SUPREME_ADMIN");
    superAdminA = await mk("Tenant A Owner", "SUPER_ADMIN", { businessName: "PUBTEST Tenant A" });
    superAdminB = await mk("Tenant B Owner", "SUPER_ADMIN", { businessName: "PUBTEST Tenant B" });
    adminA1 = await mk("Branch Admin A1", "ADMIN", { tenantId: superAdminA._id });
    adminA2 = await mk("Branch Admin A2", "ADMIN", { tenantId: superAdminA._id });
    adminAZero = await mk("Branch Admin Azero", "ADMIN", { tenantId: superAdminA._id });
    adminB1 = await mk("Branch Admin B1", "ADMIN", { tenantId: superAdminB._id });
    regularUser = await mk("Regular Customer", "USER");
  };

  const createProjects = async () => {
    // Tenant A — adminA1 owns 2 published
    projects.a1Past = await mkProject({
      title: `${TITLE_PREFIX} Edgeview Estate`,
      adminId: adminA1._id,
      approvedBy: superAdminA._id,
      approvedAt: PAST,
    });
    projects.a1Future = await mkProject({
      title: `${TITLE_PREFIX} Riverside Greens`,
      adminId: adminA1._id,
      approvedBy: superAdminA._id,
      approvedAt: FUTURE,
    });
    // Tenant A — adminA2 owns 1 published
    projects.a2Mid = await mkProject({
      title: `${TITLE_PREFIX} Summit Park`,
      adminId: adminA2._id,
      approvedBy: superAdminA._id,
      approvedAt: MID,
    });
    // Tenant A — pending (excluded)
    projects.a1Pending = await mkProject({
      title: `${TITLE_PREFIX} Draft Lagoon`,
      adminId: adminA1._id,
      approvalStatus: "PENDING",
      createdAt: PAST,
    });
    // Tenant A — archived published (excluded)
    projects.a2Archived = await mkProject({
      title: `${TITLE_PREFIX} Archived Bay`,
      adminId: adminA2._id,
      isArchived: true,
    });
    // Tenant A — rejected (excluded)
    projects.a1Rejected = await mkProject({
      title: `${TITLE_PREFIX} Rejected Ridge`,
      adminId: adminA1._id,
      approvalStatus: "REJECTED",
    });
    // Tenant A — legacy: no creator, approvedBy reliably attributes tenant
    projects.aLegacy = await mkProject({
      title: `${TITLE_PREFIX} Legacy Meadow`,
      adminId: null,
      approvedBy: superAdminA._id,
      approvedAt: MID,
    });
    // Fully unattributable legacy project (excluded from every tenant total)
    projects.unattributed = await mkProject({
      title: `${TITLE_PREFIX} Unattributed Flat`,
      adminId: null,
      approvedBy: null,
      approvedAt: RECENT,
    });
    // Tenant B — adminB1 owns 1 published
    projects.b1 = await mkProject({
      title: `${TITLE_PREFIX} B1 Heights`,
      adminId: adminB1._id,
      approvedBy: superAdminB._id,
      approvedAt: FUTURE,
    });
  };

  await test("Setup: users for two tenants + supreme + regular user", createUsers);
  await test("Setup: published / pending / rejected / archived / legacy projects", createProjects);

  // ─── 1–4. Role access matrix (middleware + controller usage) ───────────────
  await test("SUPREME_ADMIN passes authorize middleware", async () => {
    const { res } = await runMiddleware(authorize("SUPREME_ADMIN"), { user: supreme });
    assert(res.nextCalled && res.statusCode === 0, "supreme admin allowed");
  });

  await test("SUPER_ADMIN denied platform-wide access", async () => {
    const { res } = await runMiddleware(authorize("SUPREME_ADMIN"), { user: superAdminA });
    assert(res.statusCode === 403, "status 403 for SUPER_ADMIN");
  });

  await test("ADMIN denied platform-wide access", async () => {
    const { res } = await runMiddleware(authorize("SUPREME_ADMIN"), { user: adminA1 });
    assert(res.statusCode === 403, "status 403 for ADMIN");
  });

  await test("USER denied platform-wide access", async () => {
    const { res } = await runMiddleware(authorize("SUPREME_ADMIN"), { user: regularUser });
    assert(res.statusCode === 403, "status 403 for USER");
  });

  const supremeReq = () => ({ user: supreme });

  await test("Summary endpoint works for SUPREME_ADMIN", async () => {
    const { res } = await runController(getPublishedProjectsSummary, supremeReq());
    assert(res.statusCode === 200 && res.body.success, "summary fetched");
    assert(res.body.data.totalSuperAdmins >= 2, "super admin count from DB records");
    assert(res.body.data.totalBranchAdmins >= 4, "branch admin count from DB records");
    assert(res.body.data.totalPublishedProjects >= 6, "published count from DB records");
  });

  // ─── 5–6. Count accuracy and exclusion rules (Super Admin-wise) ────────────
  let superRows;
  await test("Super Admin-wise counts exclude PENDING/REJECTED/archived/unattributable", async () => {
    const { res } = await runController(getSuperAdminPublishedCounts, supremeReq());
    assert(res.statusCode === 200, "counts endpoint OK");
    superRows = res.body.data.superAdmins;
    const rowA = superRows.find((r) => r.subscriberId === String(superAdminA._id));
    const rowB = superRows.find((r) => r.subscriberId === String(superAdminB._id));
    assert(!!rowA && !!rowB, "both tenants listed");
    assert(rowA.publishedCount === 4, `tenant A total = 4 (2 A1 + 1 A2 + 1 legacy), got ${rowA.publishedCount}`);
    assert(rowB.publishedCount === 1, `tenant B total = 1, got ${rowB.publishedCount}`);
    assert(
      rowA.publishedCount >= rowB.publishedCount &&
        (superRows[0].publishedCount >= superRows[superRows.length - 1].publishedCount),
      "sorted by published count descending"
    );
  });

  await test("Duplicate counting impossible (adminId + approvedBy same tenant)", async () => {
    // p1 (adminA1, approvedBy superAdminA) matches both paths — tenant A stays 4, not repeated.
    const rowA = superRows.find((r) => r.subscriberId === String(superAdminA._id));
    assert(rowA.publishedCount === 4, "no double count for projects matching both fields");
  });

  await test("Super Admin search by name/email works", async () => {
    const { res } = await runController(getSuperAdminPublishedCounts, {
      ...supremeReq(),
      query: { search: "PUBTEST Tenant B" },
    });
    assert(res.statusCode === 200, "search request OK");
    assert(
      res.body.data.superAdmins.length === 1 &&
        res.body.data.superAdmins[0].subscriberId === String(superAdminB._id),
      "search narrows to tenant B only"
    );
    const { res: resEmail } = await runController(getSuperAdminPublishedCounts, {
      ...supremeReq(),
      query: { search: superAdminA.email },
    });
    assert(
      resEmail.body.data.superAdmins.every(
        (r) => r.subscriberId === String(superAdminA._id)
      ),
      "email search narrows correctly"
    );
  });

  // ─── 7–9. Tenant drill-down ────────────────────────────────────────────────
  let adminsA;
  await test("Branch Admin-wise drill-down for tenant A (attribution + isolation)", async () => {
    const { res } = await runController(getSuperAdminPublishedAdmins, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminA._id) },
    });
    assert(res.statusCode === 200, "tenant drill-down OK");
    adminsA = res.body.data.admins;
    const emails = adminsA.map((a) => a.email);
    assert(
      !emails.includes(adminB1.email),
      "Branch Admin from tenant B does NOT appear under tenant A"
    );
    const a1 = adminsA.find((a) => a.name === "Branch Admin A1");
    const a2 = adminsA.find((a) => a.name === "Branch Admin A2");
    assert(a1 && a1.publishedCount === 2, `A1 published = 2 (pending/rejected excluded), got ${a1?.publishedCount}`);
    assert(a2 && a2.publishedCount === 1, `A2 published = 1 (archived excluded), got ${a2?.publishedCount}`);
    assert(res.body.data.tenantPublishedTotal === 4, "tenant total = 4");
  });

  await test("Zero-published Branch Admin still listed", async () => {
    const aZero = adminsA.find((a) => a.name === "Branch Admin Azero");
    assert(!!aZero, "zero-count admin present");
    assert(aZero.publishedCount === 0, "zero-count admin count = 0");
  });

  await test("Unknown / Legacy row appears only when legacy projects exist", async () => {
    const legacyRow = adminsA.find((a) => a.isLegacy);
    assert(!!legacyRow, "legacy row present for tenant A");
    assert(legacyRow.publishedCount === 1, "legacy row count = 1 (approvedBy-attributed)");
    assert(legacyRow.name === "Unknown / Legacy", 'legacy row labelled "Unknown / Legacy"');

    const { res } = await runController(getSuperAdminPublishedAdmins, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminB._id) },
    });
    const adminsB = res.body.data.admins;
    assert(
      !adminsB.some((a) => a.isLegacy),
      "No legacy row in tenant B (fully unattributable project never arrives anywhere)"
    );
    const b1 = adminsB.find((a) => a.name === "Branch Admin B1");
    assert(b1 && b1.publishedCount === 1, "tenant B admin attribution = 1");
  });

  await test("Invalid/foreign subscriber id is rejected (never trusted from client)", async () => {
    const { res } = await runController(getSuperAdminPublishedAdmins, {
      ...supremeReq(),
      params: { subscriberId: "not-an-objectid" },
    });
    assert(res.statusCode === 400, "malformed id → 400");

    // A regular ADMIN id is not a Super Admin and resolves to 404, not data.
    const { res: resAdmin } = await runController(getSuperAdminPublishedAdmins, {
      ...supremeReq(),
      params: { subscriberId: String(adminA1._id) },
    });
    assert(resAdmin.statusCode === 404, "admin id posing as subscriber → 404");

    // Non-existent but well-formed ObjectId → 404
    const { res: resMissing } = await runController(getSuperAdminPublishedAdmins, {
      ...supremeReq(),
      params: { subscriberId: "5f8d0d55b54764421c3d1234" },
    });
    assert(resMissing.statusCode === 404, "unknown subscriber → 404");
  });

  // ─── 10. Project list – per Branch Admin ───────────────────────────────────
  let listA1;
  await test("Per-admin published list for A1 (attribution, sanitized)", async () => {
    const { res } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminA._id), adminId: String(adminA1._id) },
      query: {},
    });
    assert(res.statusCode === 200, "project list OK");
    listA1 = res.body.data;
    assert(listA1.pagination.total === 2, "A1 list total = 2 (only published)");
    assert(listA1.items.every((p) => p.title.startsWith(TITLE_PREFIX)), "items belong to fixtures");
    assert(listA1.creator.name === "Branch Admin A1", "creator name resolved from DB");
    const raw = JSON.stringify(res.body);
    assert(!raw.includes("passwordHash"), "no passwordHash in response");
    assert(!raw.includes("resetOtp"), "no OTP fields in response");
    assert(
      listA1.items.every((p) => p.approvedAt), "published date present on items"
    );
  });

  await test("Branch Admin from tenant B rejected under tenant A route", async () => {
    const { res } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminA._id), adminId: String(adminB1._id) },
      query: {},
    });
    assert(res.statusCode === 404, "cross-tenant admin id → 404");
  });

  await test("Legacy route lists only tenant-attributed legacy projects", async () => {
    const { res } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminA._id), adminId: "legacy" },
      query: {},
    });
    assert(res.statusCode === 200, "legacy list OK");
    assert(res.body.data.pagination.total === 1, "legacy total = 1");
    assert(res.body.data.creator.isLegacy, "creator flagged legacy");
    assert(
      res.body.data.items[0].title === `${TITLE_PREFIX} Legacy Meadow`,
      "only approvedBy-attributed legacy project returned"
    );

    const { res: resB } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminB._id), adminId: "legacy" },
      query: {},
    });
    assert(
      resB.body.data.pagination.total === 0,
      "tenant B legacy route empty"
    );
  });

  // ─── 11. Date filters ──────────────────────────────────────────────────────
  await test("Published date range filters (approvedAt)", async () => {
    const { res } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminA._id), adminId: "legacy" },
      query: { from: "2025-01-01", to: "2025-12-31" },
    });
    assert(res.body.data.pagination.total === 1, "`to` year filter returns only 2025 project");

    const { res: resRange } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminA._id), adminId: String(adminA2._id) },
      query: { from: "2025-09-01", to: "2025-10-01" },
    });
    assert(resRange.body.data.pagination.total === 1, "mid-range filter isolates MID project");

    const { res: resBad } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminA._id), adminId: String(adminA2._id) },
      query: { from: "invalid-date" },
    });
    assert(resBad.statusCode === 400, "invalid date → 400");

    const { res: resReversed } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminA._id), adminId: String(adminA2._id) },
      query: { from: "2026-01-01", to: "2025-01-01" },
    });
    assert(resReversed.statusCode === 400, "reversed range → 400");
  });

  // ─── 12. Project name search ───────────────────────────────────────────────
  await test("Project name search returns matching published project only", async () => {
    const { res } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminA._id), adminId: String(adminA1._id) },
      query: { search: "Edgeview" },
    });
    assert(res.body.data.pagination.total === 1, "search total = 1");
    assert(
      res.body.data.items[0].title === `${TITLE_PREFIX} Edgeview Estate`,
      "search matches the right project"
    );

    const { res: resNone } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminA._id), adminId: String(adminA1._id) },
      query: { search: "nmfeiowhru" },
    });
    assert(resNone.body.data.pagination.total === 0, "search with no match returns 0");
  });

  // ─── 13. Pagination ────────────────────────────────────────────────────────
  await test("Pagination works and oversized limit is clamped", async () => {
    // Build 6 published projects for adminB1 (1 existing + 5 more, staggered dates)
    const base = new Date("2026-02-01T10:00:00Z");
    for (let i = 0; i < 5; i++) {
      await mkProject({
        title: `${TITLE_PREFIX} B1 Paginated ${i}`,
        adminId: adminB1._id,
        approvedBy: superAdminB._id,
        approvedAt: new Date(base.getTime() + i * 60_000),
      });
    }

    const { res } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminB._id), adminId: String(adminB1._id) },
      query: { page: "1", limit: "2" },
    });
    assert(res.body.data.pagination.total === 6, "tenant B admin total = 6 after seeds");
    assert(res.body.data.items.length === 2, "page 1 returns 2 items");
    assert(res.body.data.pagination.totalPages === 3, "totalPages = 3");

    const { res: resP3 } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminB._id), adminId: String(adminB1._id) },
      query: { page: "3", limit: "2" },
    });
    assert(resP3.body.data.items.length === 2, "page 3 returns final 2 items");

    const { res: resP4 } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminB._id), adminId: String(adminB1._id) },
      query: { page: "4", limit: "2" },
    });
    assert(resP4.body.data.items.length === 0, "page beyond range returns 0 items");

    const { res: resClamp } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminB._id), adminId: String(adminB1._id) },
      query: { limit: "9999" },
    });
    assert(resClamp.body.data.pagination.limit === 50, "limit clamped to 50");

    const { res: resInvalidPage } = await runController(getSuperAdminPublishedProjectsAdminWise, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminB._id), adminId: String(adminB1._id) },
      query: { page: "-3" },
    });
    assert(resInvalidPage.body.data.pagination.page === 1, "invalid page falls back to 1");
  });

  // ─── 14. Sensitive field leak check on every endpoint ──────────────────────
  await test("No sensitive User fields in any response", async () => {
    const { res } = await runController(getSuperAdminPublishedAdmins, {
      ...supremeReq(),
      params: { subscriberId: String(superAdminA._id) },
    });
    const raw = JSON.stringify(res.body);
    for (const secret of ["passwordHash", "resetOtp", "deviceEnrollment", "loginLockedUntil"]) {
      assert(!raw.includes(secret), `no ${secret} leaked`);
    }
  });
}

// ─── Boot ────────────────────────────────────────────────────────────────────
async function main() {
  let ok = false;
  await mongoose.connect(testUri);
  console.log("Connected to MongoDB:", mongoose.connection.name);

  // Safety: sweep any artifacts from an earlier interrupted run of THIS suite
  try {
    await User.deleteMany(fixtureEmailFilter());
    await Project.deleteMany(fixtureTitleFilter());
  } catch (sweepErr) {
    console.warn("Pre-run sweep skipped:", sweepErr.message);
  }

  try {
    await runTests();
    console.log("\n=== ALL PUBLISHED PROJECTS OVERVIEW TESTS PASSED ===");
    console.log(`Total test groups executed: ${passed}`);
    ok = true;
  } catch (err) {
    console.error("\nTest execution failed:", err);
  } finally {
    console.log("\nCleaning up test artifacts…");
    try {
      await Project.deleteMany({ _id: { $in: tempProjectIds } });
      await User.deleteMany({ _id: { $in: tempUserIds } });
      // belt & braces: remove fixture leftovers by marker fields
      await User.deleteMany(fixtureEmailFilter());
      await Project.deleteMany(fixtureTitleFilter());
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
