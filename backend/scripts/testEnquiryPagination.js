/**
 * PlotPro — Super Admin enquiry pagination/search regression tests (B5)
 *
 * Runs against a disposable in-memory MongoDB (mongodb-memory-server) and calls
 * the controller directly with mocked req/res — never the application database.
 *
 * Run: node scripts/testEnquiryPagination.js
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

import User from "../models/User.js";
import Branch from "../models/Branch.js";
import Project from "../models/Project.js";
import Enquiry from "../models/Enquiry.js";
import { getAllEnquiriesSuperAdmin } from "../controllers/enquiryController.js";

let passed = 0;
let failed = 0;

const assert = (condition, message) => {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
};

const assertEqual = (actual, expected, message) => {
  assert(
    actual === expected,
    `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`
  );
};

const createMockRes = () => ({
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
});

/** Invoke the controller and return the mock response. */
const callController = async (user, query = {}) => {
  const res = createMockRes();
  let nextError = null;
  await getAllEnquiriesSuperAdmin({ user, query }, res, (err) => {
    nextError = err;
  });
  if (nextError) throw nextError;
  return res;
};

const names = (res) => (res.data?.data || []).map((e) => e.fullName);

async function main() {
  console.log("=== SUPER ADMIN ENQUIRY PAGINATION TESTS (B5) ===");

  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  try {
    // ── Fixtures ────────────────────────────────────────────────────────
    const tenantA = await User.create({
      name: "Tenant A Super Admin",
      email: `tenant-a-${Date.now()}@testplotpro.in`,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });

    const tenantB = await User.create({
      name: "Tenant B Super Admin",
      email: `tenant-b-${Date.now()}@testplotpro.in`,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });

    const adminA = await User.create({
      name: "Branch Admin A",
      email: `admin-a-${Date.now()}@testplotpro.in`,
      role: "ADMIN",
      status: "ACTIVE",
      tenantId: tenantA._id,
    });

    const branchA = await Branch.create({
      name: "Branch A",
      city: "Coimbatore",
      tenantId: tenantA._id,
      branchAdmin: adminA._id,
    });

    const branchB = await Branch.create({
      name: "Branch B",
      city: "Chennai",
      tenantId: tenantB._id,
      branchAdmin: adminA._id,
    });

    const projectA = await Project.create({
      customId: 900001,
      title: "Project A",
      location: "Coimbatore",
      city: "Coimbatore",
      plotPrice: "15 Lakh",
      priceLakhs: 15,
      branchId: branchA._id,
      adminId: adminA._id,
      approvedBy: tenantA._id,
      approvalStatus: "APPROVED",
      status: "Active",
    });

    const seed = async (data, secondsAgo) => {
      const doc = await Enquiry.create(data);
      await Enquiry.updateOne(
        { _id: doc._id },
        { $set: { createdAt: new Date(Date.now() - secondsAgo * 1000) } }
      );
      return doc;
    };

    // 4 enquiries in Branch A (tenant A)
    await seed(
      {
        fullName: "Alice Kumar",
        email: "alice@example.com",
        mobile: "9000000001",
        message: "Interested in plot",
        status: "NEW",
        branchId: branchA._id,
        projectId: projectA._id,
        tenantId: tenantA._id,
      },
      50
    );
    await seed(
      {
        fullName: "Bob Raj",
        email: "bob@example.com",
        mobile: "9000000002",
        message: "Call me back",
        status: "CONTACTED",
        branchId: branchA._id,
        projectId: projectA._id,
        tenantId: tenantA._id,
      },
      40
    );
    await seed(
      {
        fullName: "Alice Sharma",
        email: "alice.sharma@example.com",
        mobile: "9000000003",
        message: "Budget question",
        status: "FOLLOW_UP",
        branchId: branchA._id,
        projectId: projectA._id,
        tenantId: tenantA._id,
      },
      30
    );
    await seed(
      {
        fullName: "Carol Das",
        email: "carol@example.com",
        mobile: "9000000004",
        message: "Site visit",
        status: "CLOSED",
        branchId: branchA._id,
        projectId: projectA._id,
        tenantId: tenantA._id,
      },
      20
    );

    // 2 unassigned enquiries (tenant A, no branch)
    await seed(
      {
        fullName: "Dave Web",
        email: "dave@example.com",
        mobile: "9000000005",
        message: "Website enquiry",
        status: "NEW",
        branchId: null,
        projectId: null,
        tenantId: tenantA._id,
      },
      10
    );
    await seed(
      {
        fullName: "Eve Direct",
        email: "eve@example.com",
        mobile: "9000000006",
        message: "Direct enquiry",
        status: "NEW",
        branchId: null,
        projectId: null,
        tenantId: tenantA._id,
      },
      5
    );

    // 1 enquiry belonging to tenant B (must never leak)
    await seed(
      {
        fullName: "Zed Rival",
        email: "zed@example.com",
        mobile: "9000000007",
        message: "Rival enquiry",
        status: "NEW",
        branchId: branchB._id,
        projectId: null,
        tenantId: tenantB._id,
      },
      1
    );

    // ── 1. Backward compatibility (no limit) ────────────────────────────
    console.log("\n[1] Backward compatibility");
    let res = await callController(tenantA);
    assertEqual(res.statusCode, 200, "no-params request returns 200");
    assertEqual(res.data?.data?.length, 6, "returns all 6 tenant-A enquiries");
    assertEqual(res.data?.pagination, undefined, "omits pagination when limit is absent");
    assertEqual(res.data?.count, 6, "count equals the returned array length");

    // ── 2. Tenant isolation ─────────────────────────────────────────────
    console.log("\n[2] Tenant isolation");
    assertEqual(
      names(res).includes("Zed Rival"),
      false,
      "tenant-B enquiry is never returned to tenant A"
    );

    // ── 3. Page + limit ─────────────────────────────────────────────────
    console.log("\n[3] Page and limit");
    res = await callController(tenantA, { page: "1", limit: "2" });
    assertEqual(res.data?.data?.length, 2, "page 1 returns 2 records");
    assertEqual(res.data?.pagination?.total, 6, "pagination.total is the full count");
    assertEqual(res.data?.pagination?.totalPages, 3, "pagination.totalPages is correct");
    assertEqual(res.data?.pagination?.page, 1, "pagination.page is 1");
    assertEqual(res.data?.pagination?.limit, 2, "pagination.limit is 2");
    assertEqual(res.data?.pagination?.hasNextPage, true, "page 1 has a next page");
    assertEqual(res.data?.pagination?.hasPrevPage, false, "page 1 has no previous page");
    const page1 = names(res);

    res = await callController(tenantA, { page: "2", limit: "2" });
    const page2 = names(res);
    assertEqual(page2.length, 2, "page 2 returns 2 records");
    assertEqual(res.data?.pagination?.hasPrevPage, true, "page 2 has a previous page");
    assertEqual(
      page1.some((n) => page2.includes(n)),
      false,
      "page 1 and page 2 do not overlap"
    );

    res = await callController(tenantA, { page: "3", limit: "2" });
    assertEqual(res.data?.data?.length, 2, "page 3 returns the remaining 2 records");
    assertEqual(res.data?.pagination?.hasNextPage, false, "page 3 is the last page");

    res = await callController(tenantA, { page: "4", limit: "2" });
    assertEqual(res.data?.data?.length, 0, "out-of-range page returns an empty array");
    assertEqual(res.data?.pagination?.total, 6, "out-of-range page still reports the total");

    // ── 4. Search ───────────────────────────────────────────────────────
    console.log("\n[4] Search");
    res = await callController(tenantA, { search: "alice", limit: "10" });
    assertEqual(res.data?.data?.length, 2, "case-insensitive search matches both Alices");
    assertEqual(res.data?.pagination?.total, 2, "search total is accurate");

    res = await callController(tenantA, { search: "9000000004", limit: "10" });
    assertEqual(names(res)[0], "Carol Das", "search matches by mobile number");

    res = await callController(tenantA, { search: "no-such-person", limit: "10" });
    assertEqual(res.data?.data?.length, 0, "empty search result returns []");
    assertEqual(res.data?.pagination?.total, 0, "empty search total is 0");
    assertEqual(res.data?.pagination?.totalPages, 0, "empty search totalPages is 0");

    res = await callController(tenantA, { search: "(", limit: "10" });
    assertEqual(res.statusCode, 200, "regex metacharacters do not throw (no 500)");

    // ── 5. Status filter ────────────────────────────────────────────────
    console.log("\n[5] Status filter");
    res = await callController(tenantA, { status: "NEW", limit: "10" });
    assertEqual(res.data?.data?.length, 3, "status=NEW returns 3 records");
    assert(
      (res.data?.data || []).every((e) => e.status === "NEW"),
      "every returned record has status NEW"
    );

    res = await callController(tenantA, { status: "ALL", limit: "10" });
    assertEqual(res.data?.data?.length, 6, "status=ALL applies no status filter");

    res = await callController(tenantA, { status: "BOGUS", limit: "10" });
    assertEqual(res.statusCode, 400, "invalid status returns 400");

    // ── 6. Branch filter ────────────────────────────────────────────────
    console.log("\n[6] Branch filter");
    res = await callController(tenantA, {
      branchId: String(branchA._id),
      limit: "10",
    });
    assertEqual(res.data?.data?.length, 4, "branchId returns only that branch's records");

    res = await callController(tenantA, { branchId: "unassigned", limit: "10" });
    assertEqual(res.data?.data?.length, 2, "branchId=unassigned returns direct enquiries");

    res = await callController(tenantA, { branchId: "not-an-id", limit: "10" });
    assertEqual(res.statusCode, 400, "invalid branchId returns 400");

    // ── 7. Combined filters ─────────────────────────────────────────────
    console.log("\n[7] Combined filters");
    res = await callController(tenantA, {
      branchId: String(branchA._id),
      status: "NEW",
      search: "alice",
      limit: "10",
    });
    assertEqual(res.data?.data?.length, 1, "branch + status + search combine correctly");
    assertEqual(names(res)[0], "Alice Kumar", "combined filters return the expected record");

    // ── 8. Validation / clamping ────────────────────────────────────────
    console.log("\n[8] Validation and clamping");
    res = await callController(tenantA, { page: "-5", limit: "1000" });
    assertEqual(res.data?.pagination?.page, 1, "negative page falls back to 1");
    assertEqual(res.data?.pagination?.limit, 100, "oversized limit clamps to 100");

    res = await callController(tenantA, { page: "abc", limit: "xyz" });
    assertEqual(res.data?.pagination?.page, 1, "non-numeric page falls back to 1");
    assertEqual(res.data?.pagination?.limit, 20, "non-numeric limit falls back to 20");

    // ── 9. No sensitive fields ──────────────────────────────────────────
    console.log("\n[9] Response hygiene");
    const sample = res.data?.data?.[0];
    assert(sample !== undefined, "response contains enquiry records");
    assert(
      sample && !("passwordHash" in sample),
      "no password hashes leak into the response"
    );

    // ── 10. Legacy invocation without req.query ─────────────────────────
    console.log("\n[10] Legacy controller invocation (no req.query)");
    const legacyRes = createMockRes();
    let legacyError = null;
    await getAllEnquiriesSuperAdmin({ user: tenantA }, legacyRes, (err) => {
      legacyError = err;
    });
    assertEqual(legacyError, null, "no error when req.query is undefined");
    assertEqual(legacyRes.statusCode, 200, "legacy call still returns 200");
    assertEqual(
      legacyRes.data?.data?.length,
      6,
      "legacy call still returns the full list"
    );
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await mongo.stop();
  }

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"}: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
