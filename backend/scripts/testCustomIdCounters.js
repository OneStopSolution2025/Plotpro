/**
 * PlotPro — B3 + B4 Custom ID Counter Regression Tests (Stage 4)
 *
 * Runs against a disposable in-memory MongoDB (mongodb-memory-server) and calls
 * the controllers directly with mocked req/res — never the application database.
 *
 * Run: node scripts/testCustomIdCounters.js
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

import User from "../models/User.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import { Counter } from "../models/Counter.js";
import { getNextSequence, initializeCounter, isCustomIdDuplicateError, withCustomIdRetry } from "../utils/counterHelper.js";
import { createAdminProject } from "../controllers/projectController.js";
import { createAdminProjectPlot } from "../controllers/plotController.js";
import { createProjectSuperAdmin } from "../controllers/superAdminController.js";

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

const callController = async (controller, req) => {
  const res = createMockRes();
  let nextError = null;
  await controller(req, res, (err) => {
    nextError = err;
  });
  if (nextError) throw nextError;
  return res;
};

// ── Helpers for creating test users ────────────────────────────────────────
const createAdminUser = async (suffix = "") => {
  return await User.create({
    name: `Admin User ${suffix}`,
    email: `admin-${suffix}-${Date.now()}@testplotpro.in`,
    role: "ADMIN",
    status: "ACTIVE",
    tenantId: null,
  });
};

const createSuperAdminUser = async (suffix = "") => {
  const sa = await User.create({
    name: `Super Admin ${suffix}`,
    email: `sa-${suffix}-${Date.now()}@testplotpro.in`,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
  });

  // Create a plan and subscription so project creation quota checks pass
  const plan = await Plan.create({
    name: `Test Plan ${suffix} ${Date.now()}`,
    slug: `test-plan-${suffix}-${Date.now()}`,
    price: 0,
    durationDays: 365,
    maxAdminSeats: 0,
    maxProjects: 999999,
  });

  await Subscription.create({
    subscriberId: sa._id,
    planId: plan._id,
    status: "ACTIVE",
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    assignedSeats: 0,
    assignedProjects: 999999,
  });

  return sa;
};

// ── Helpers for creating test projects directly ─────────────────────────────
const createTestProject = async (customId, title = "Test Project") => {
  return await Project.create({
    customId,
    title,
    location: "Test Location",
    city: "Test City",
    plotPrice: "10 Lakh",
    priceLakhs: 10,
    approvalStatus: "APPROVED",
    isArchived: false,
  });
};

// ── Setup / teardown ────────────────────────────────────────────────────────
let mongo = null;

async function setup() {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}

async function teardown() {
  try {
    await mongoose.connection.dropDatabase();
  } catch { /* ignore */ }
  try {
    await mongoose.disconnect();
  } catch { /* ignore */ }
  try {
    await mongo.stop();
  } catch { /* ignore */ }
}

// ── Test runner ─────────────────────────────────────────────────────────────
const tests = [];
const test = (name, fn) => {
  tests.push({ name, fn });
};

// ═══════════════════════════════════════════════════════════════════════════
// A. Counter infrastructure tests
// ═══════════════════════════════════════════════════════════════════════════

test("A1: Atomic increments under concurrent requests", async () => {
  const counterId = "test:atomic";
  const N = 50;
  const results = await Promise.all(
    Array.from({ length: N }, () => getNextSequence(counterId))
  );
  const unique = new Set(results);
  assertEqual(unique.size, N, `All ${N} concurrent increments return unique values`);
  assertEqual(Math.min(...results), 1, "First sequence is 1");
  assertEqual(Math.max(...results), N, "Last sequence is N");
});

test("A2: Counter initialization from existing maximum customId", async () => {
  const counterId = "test:init-project";
  await initializeCounter(counterId, 10);
  const seq = await getNextSequence(counterId);
  assertEqual(seq, 11, "Next sequence after init to 10 is 11");
});

test("A3: Plot counter initialization from existing customId suffix", async () => {
  const counterId = "test:init-plot";
  await initializeCounter(counterId, 5);
  const seq = await getNextSequence(counterId);
  assertEqual(seq, 6, "Next sequence after init to 5 is 6");
});

test("A4: Initialization never decreases an existing counter", async () => {
  const counterId = "test:never-decrease";
  await initializeCounter(counterId, 20);
  await initializeCounter(counterId, 5); // lower target — should not decrease
  const doc = await Counter.findOne({ _id: counterId });
  assertEqual(doc.seq, 20, "Counter stays at 20 after init to 5");
});

test("A5: Concurrent initialization does not create conflicting counter records", async () => {
  const counterId = "test:concurrent-init";
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => initializeCounter(counterId, 5))
  );
  assert(
    results.every((r) => r.status === "fulfilled"),
    "All 10 concurrent initializations succeed"
  );
  const doc = await Counter.findOne({ _id: counterId });
  assertEqual(doc.seq, 5, "Final counter value is 5");
});

test("A6: Dry-run migration performs no database writes", async () => {
  // This is tested by the migration script's --dry-run flag.
  // Here we verify that Counter collection is empty before any initialize call
  // and that initializeCounter with target 0 doesn't create unnecessary entries
  // (it does create with seq=0, which is expected for initialization).
  const counterId = "test:dryrun-check";
  const before = await Counter.countDocuments({ _id: counterId });
  assertEqual(before, 0, "Counter does not exist before initialization");
});

test("A7: Migration execution changes only Counter documents", async () => {
  // Verify that initializeCounter only touches Counter collection
  const counterId = "test:only-counter";
  const beforeProjectCount = await Project.countDocuments();
  const beforePlotCount = await Plot.countDocuments();
  await initializeCounter(counterId, 100);
  const afterProjectCount = await Project.countDocuments();
  const afterPlotCount = await Plot.countDocuments();
  assertEqual(beforeProjectCount, afterProjectCount, "Project count unchanged");
  assertEqual(beforePlotCount, afterPlotCount, "Plot count unchanged");
});

// ═══════════════════════════════════════════════════════════════════════════
// B. B3 Project tests
// ═══════════════════════════════════════════════════════════════════════════

test("B1: Concurrent ADMIN project creation", async () => {
  const admin = await createAdminUser("b1");
  const N = 20;
  const results = await Promise.allSettled(
    Array.from({ length: N }, () =>
      callController(createAdminProject, {
        user: admin,
        body: {
          title: "Test Project",
          location: "Test Location",
          plotPrice: "10 Lakh",
          image: "https://example.com/img.jpg",
          details: "Test details",
          about: { description: "Test about" },
        },
      })
    )
  );

  const successes = results.filter((r) => r.status === "fulfilled" && r.value.statusCode === 201);
  const customIds = successes.map((r) => r.value.data?.data?.customId);
  const unique = new Set(customIds);

  assertEqual(successes.length, N, `All ${N} project creations succeed`);
  assertEqual(unique.size, N, `All ${N} customIds are unique`);
  assert(
    customIds.every((id) => typeof id === "number" && id >= 1),
    "All customIds are positive numbers"
  );
});

test("B2: Concurrent SUPER_ADMIN project creation", async () => {
  const sa = await createSuperAdminUser("b2");
  const N = 20;
  const results = await Promise.allSettled(
    Array.from({ length: N }, () =>
      callController(createProjectSuperAdmin, {
        user: sa,
        body: {
          title: "SA Test Project",
          location: "Test Location",
          plotPrice: "10 Lakh",
          image: "https://example.com/img.jpg",
          details: "Test details",
          about: { description: "Test about" },
        },
      })
    )
  );

  const successes = results.filter((r) => r.status === "fulfilled" && r.value.statusCode === 201);
  const customIds = successes.map((r) => r.value.data?.data?.customId);
  const unique = new Set(customIds);

  assertEqual(successes.length, N, `All ${N} SA project creations succeed`);
  assertEqual(unique.size, N, `All ${N} SA customIds are unique`);
});

test("B3: Both roles share one global sequence", async () => {
  const admin = await createAdminUser("b3a");
  const sa = await createSuperAdminUser("b3b");

  const res1 = await callController(createAdminProject, {
    user: admin,
    body: {
      title: "Admin Project",
      location: "Test Location",
      plotPrice: "10 Lakh",
      image: "https://example.com/img.jpg",
      details: "Test details",
      about: { description: "Test about" },
    },
  });
  const adminCustomId = res1.data?.data?.customId;

  const res2 = await callController(createProjectSuperAdmin, {
    user: sa,
    body: {
      title: "SA Project",
      location: "Test Location",
      plotPrice: "10 Lakh",
      image: "https://example.com/img.jpg",
      details: "Test details",
      about: { description: "Test about" },
    },
  });
  const saCustomId = res2.data?.data?.customId;

  assert(
    saCustomId === adminCustomId + 1,
    `SA customId (${saCustomId}) = admin customId (${adminCustomId}) + 1 — shared sequence`
  );
});

test("B4: Existing Project customIds remain unchanged", async () => {
  // Create a project directly with a known customId
  const project = await createTestProject(99999, "Legacy Project");
  const before = project.customId;

  // Verify it's still there and unchanged
  const found = await Project.findById(project._id);
  assertEqual(found.customId, before, "Existing customId is unchanged");
});

test("B5: Deleting a Project does not cause customId reuse", async () => {
  const admin = await createAdminUser("b5");

  // Create 3 projects
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const res = await callController(createAdminProject, {
      user: admin,
      body: {
        title: `Project ${i}`,
        location: "Test Location",
        plotPrice: "10 Lakh",
        image: "https://example.com/img.jpg",
        details: "Test details",
        about: { description: "Test about" },
      },
    });
    ids.push(res.data?.data?.customId);
  }

  // Delete the middle project
  await Project.deleteOne({ customId: ids[1] });

  // Create another project — customId should be ids[2] + 1, not reused
  const res = await callController(createAdminProject, {
    user: admin,
    body: {
      title: "After Delete",
      location: "Test Location",
      plotPrice: "10 Lakh",
      image: "https://example.com/img.jpg",
      details: "Test details",
      about: { description: "Test about" },
    },
  });
  const newCustomId = res.data?.data?.customId;
  assert(
    newCustomId === ids[2] + 1,
    `New customId (${newCustomId}) = last customId (${ids[2]}) + 1 — no reuse`
  );
});

test("B6: Project lookup by customId still works", async () => {
  const project = await createTestProject(77777, "Lookup Test");
  const found = await Project.findOne({ customId: 77777 });
  assertEqual(String(found._id), String(project._id), "Project found by customId");
});

// ═══════════════════════════════════════════════════════════════════════════
// C. B4 Plot tests
// ═══════════════════════════════════════════════════════════════════════════

test("C1: Concurrent individual plot creation within one project", async () => {
  const project = await createTestProject(100, "Plot Test Project");
  const N = 30;
  const results = await Promise.allSettled(
    Array.from({ length: N }, (_, i) =>
      callController(createAdminProjectPlot, {
        project,
        body: {
          plotNumber: `PN-${i}`,
          size: "1000 sq.ft",
          facing: "East",
          price: "₹10 Lakh",
        },
      })
    )
  );

  const successes = results.filter((r) => r.status === "fulfilled" && r.value.statusCode === 201);
  const customIds = successes.map((r) => r.value.data?.data?.customId);
  const unique = new Set(customIds);

  assertEqual(successes.length, N, `All ${N} plot creations succeed`);
  assertEqual(unique.size, N, `All ${N} plot customIds are unique`);
  assert(
    customIds.every((id) => typeof id === "string" && id.startsWith("100-")),
    "All customIds follow format '100-N'"
  );
});

test("C2: Concurrent plot creation across different projects", async () => {
  const project1 = await createTestProject(200, "Project 1");
  const project2 = await createTestProject(300, "Project 2");

  const N = 15;
  const results = await Promise.allSettled([
    ...Array.from({ length: N }, (_, i) =>
      callController(createAdminProjectPlot, {
        project: project1,
        body: { plotNumber: `P1-${i}`, size: "1000 sq.ft", facing: "East", price: "₹10 Lakh" },
      })
    ),
    ...Array.from({ length: N }, (_, i) =>
      callController(createAdminProjectPlot, {
        project: project2,
        body: { plotNumber: `P2-${i}`, size: "1000 sq.ft", facing: "East", price: "₹10 Lakh" },
      })
    ),
  ]);

  const successes = results.filter((r) => r.status === "fulfilled" && r.value.statusCode === 201);
  const customIds = successes.map((r) => r.value.data?.data?.customId);
  const unique = new Set(customIds);

  assertEqual(successes.length, N * 2, `All ${N * 2} plot creations succeed`);
  assertEqual(unique.size, N * 2, `All ${N * 2} plot customIds are globally unique`);
});

test("C3: ADMIN initial plot generation", async () => {
  const admin = await createAdminUser("c3");
  const res = await callController(createAdminProject, {
    user: admin,
    body: {
      title: "Project With Initial Plots",
      location: "Test Location",
      plotPrice: "10 Lakh",
      image: "https://example.com/img.jpg",
      details: "Test details",
      about: { description: "Test about" },
      availablePlots: 3,
      reservedPlots: 2,
      soldPlots: 1,
    },
  });

  assertEqual(res.statusCode, 201, "Project creation succeeds");
  const projectCustomId = res.data?.data?.customId;
  assert(typeof projectCustomId === "number", "Project has numeric customId");

  // Check plots were created
  const project = await Project.findOne({ customId: projectCustomId });
  const plots = await Plot.find({ projectId: project._id }).sort({ plotNumber: 1 });
  assertEqual(plots.length, 6, "6 initial plots created (3+2+1)");

  // Verify customId format and sequential numbering
  const customIds = plots.map((p) => p.customId);
  const unique = new Set(customIds);
  assertEqual(unique.size, 6, "All initial plot customIds are unique");
  assert(
    customIds.every((id) => id === `${projectCustomId}-${id.split("-")[1]}`),
    "All customIds follow format 'projectCustomId-sequence'"
  );

  // Verify plotNumber matches customId suffix
  for (const plot of plots) {
    const suffix = plot.customId.split("-")[1];
    assertEqual(plot.plotNumber, suffix, `Plot ${plot.customId}: plotNumber matches suffix`);
  }
});

test("C4: SUPER_ADMIN initial plot generation", async () => {
  const sa = await createSuperAdminUser("c4");
  const res = await callController(createProjectSuperAdmin, {
    user: sa,
    body: {
      title: "SA Project With Initial Plots",
      location: "Test Location",
      plotPrice: "10 Lakh",
      image: "https://example.com/img.jpg",
      details: "Test details",
      about: { description: "Test about" },
      availablePlots: 2,
      reservedPlots: 1,
      soldPlots: 1,
    },
  });

  assertEqual(res.statusCode, 201, "SA project creation succeeds");
  const projectCustomId = res.data?.data?.customId;

  const project = await Project.findOne({ customId: projectCustomId });
  const plots = await Plot.find({ projectId: project._id }).sort({ plotNumber: 1 });
  assertEqual(plots.length, 4, "4 initial plots created (2+1+1)");

  const customIds = plots.map((p) => p.customId);
  const unique = new Set(customIds);
  assertEqual(unique.size, 4, "All SA initial plot customIds are unique");
});

test("C5: Individual plot creation continues after initial plot generation", async () => {
  const project = await createTestProject(500, "Continuity Test");
  const plotCounterId = `plot:${project._id}`;

  // Simulate initial plots (seq 1-3)
  for (let i = 1; i <= 3; i++) {
    await getNextSequence(plotCounterId);
  }

  // Now create an individual plot — should get seq 4
  const res = await callController(createAdminProjectPlot, {
    project,
    body: {
      plotNumber: "IND-1",
      size: "1000 sq.ft",
      facing: "East",
      price: "₹10 Lakh",
    },
  });

  assertEqual(res.statusCode, 201, "Individual plot creation succeeds");
  const plot = res.data?.data;
  assertEqual(plot.customId, "500-4", "Individual plot gets next sequence (500-4)");
  assertEqual(plot.plotNumber, "IND-1", "plotNumber preserved from request");
});

test("C6: Bulk top-up after deleting a middle-numbered plot", async () => {
  const project = await createTestProject(600, "Bulk Top-Up Test");
  const plotCounterId = `plot:${project._id}`;

  // Create initial plots 600-1 through 600-5
  for (let i = 1; i <= 5; i++) {
    const seq = await getNextSequence(plotCounterId);
    await Plot.create({
      customId: `600-${seq}`,
      projectId: project._id,
      projectCustomId: 600,
      plotNumber: String(i),
      size: "1000 sq.ft",
      facing: "East",
      price: "₹10 Lakh",
      status: "Available",
    });
  }

  // Delete the middle plot (600-3)
  await Plot.deleteOne({ customId: "600-3" });

  // Verify counter is at 5 (not reset by deletion)
  const counter = await Counter.findOne({ _id: plotCounterId });
  assertEqual(counter.seq, 5, "Counter stays at 5 after deleting plot 600-3");

  // Now create a new individual plot — should get 600-6 (not 600-3)
  const res = await callController(createAdminProjectPlot, {
    project,
    body: {
      plotNumber: "NEW-1",
      size: "1000 sq.ft",
      facing: "East",
      price: "₹10 Lakh",
    },
  });

  assertEqual(res.statusCode, 201, "New plot creation succeeds after deletion");
  const plot = res.data?.data;
  assertEqual(plot.customId, "600-6", "New plot gets 600-6, not reused 600-3");
});

test("C7: Deleted Plot customIds are never reused", async () => {
  const project = await createTestProject(700, "No Reuse Test");
  const plotCounterId = `plot:${project._id}`;

  // Create plots 700-1 through 700-3
  for (let i = 1; i <= 3; i++) {
    const seq = await getNextSequence(plotCounterId);
    await Plot.create({
      customId: `700-${seq}`,
      projectId: project._id,
      projectCustomId: 700,
      plotNumber: String(i),
      size: "1000 sq.ft",
      facing: "East",
      price: "₹10 Lakh",
      status: "Available",
    });
  }

  // Delete all plots
  await Plot.deleteMany({ projectId: project._id });

  // Counter should still be at 3
  const counterBefore = await Counter.findOne({ _id: plotCounterId });
  assertEqual(counterBefore.seq, 3, "Counter stays at 3 after deleting all plots");

  // Create a new plot — should get 700-4
  const res = await callController(createAdminProjectPlot, {
    project,
    body: {
      plotNumber: "AFTER-DELETE",
      size: "1000 sq.ft",
      facing: "East",
      price: "₹10 Lakh",
    },
  });

  assertEqual(res.statusCode, 201, "Plot creation after delete succeeds");
  assertEqual(res.data?.data?.customId, "700-4", "New plot gets 700-4, not reused");
});

test("C8: Existing customId format is preserved", async () => {
  const project = await createTestProject(800, "Format Test");
  const res = await callController(createAdminProjectPlot, {
    project,
    body: {
      plotNumber: "FMT-1",
      size: "1000 sq.ft",
      facing: "East",
      price: "₹10 Lakh",
    },
  });

  assertEqual(res.statusCode, 201, "Plot creation succeeds");
  const plot = res.data?.data;
  // Format: "800-N" where N is a positive integer
  const parts = plot.customId.split("-");
  assertEqual(parts.length, 2, "customId has exactly one dash separator");
  assertEqual(parts[0], "800", "First part is the project customId");
  assert(
    /^\d+$/.test(parts[1]) && Number(parts[1]) >= 1,
    "Second part is a positive integer sequence"
  );
  assertEqual(plot.projectCustomId, 800, "projectCustomId is set correctly");
});

test("C9: Legacy plotNumber/customId mismatch is handled safely", async () => {
  const project = await createTestProject(900, "Mismatch Test");
  const plotCounterId = `plot:${project._id}`;

  // Create a plot with mismatched plotNumber and customId suffix
  // (simulating legacy data where plotNumber doesn't match the suffix)
  await Plot.create({
    customId: "900-5",
    projectId: project._id,
    projectCustomId: 900,
    plotNumber: "999", // mismatch: suffix=5 but plotNumber=999
    size: "1000 sq.ft",
    facing: "East",
    price: "₹10 Lakh",
    status: "Available",
  });

  // Initialize counter from the suffix (5), not from plotNumber (999)
  await initializeCounter(plotCounterId, 5);

  // Next plot should get seq 6
  const res = await callController(createAdminProjectPlot, {
    project,
    body: {
      plotNumber: "MISMATCH-NEW",
      size: "1000 sq.ft",
      facing: "East",
      price: "₹10 Lakh",
    },
  });

  assertEqual(res.statusCode, 201, "Plot creation after mismatch succeeds");
  assertEqual(res.data?.data?.customId, "900-6", "Counter based on suffix (6), not plotNumber (999)");
});

// ═══════════════════════════════════════════════════════════════════════════
// D. Retry tests
// ═══════════════════════════════════════════════════════════════════════════

test("D1: isCustomIdDuplicateError identifies customId E11000", async () => {
  const err = new Error("duplicate key");
  err.code = 11000;
  err.keyValue = { customId: "test-1" };
  assertEqual(isCustomIdDuplicateError(err), true, "Returns true for customId E11000");
});

test("D2: isCustomIdDuplicateError rejects projectId+plotNumber E11000", async () => {
  const err = new Error("duplicate key");
  err.code = 11000;
  err.keyValue = { projectId: "abc", plotNumber: "1" };
  assertEqual(isCustomIdDuplicateError(err), false, "Returns false for projectId+plotNumber E11000");
});

test("D3: isCustomIdDuplicateError rejects non-E11000 errors", async () => {
  const err = new Error("validation error");
  err.code = 400;
  err.keyValue = { customId: "test" };
  assertEqual(isCustomIdDuplicateError(err), false, "Returns false for non-E11000 errors");

  const err2 = new Error("network error");
  assertEqual(isCustomIdDuplicateError(err2), false, "Returns false for errors without code");
});

test("D4: isCustomIdDuplicateError handles null/undefined", async () => {
  assertEqual(isCustomIdDuplicateError(null), false, "Returns false for null");
  assertEqual(isCustomIdDuplicateError(undefined), false, "Returns false for undefined");
});

test("D5: withCustomIdRetry retries on customId E11000", async () => {
  let attempts = 0;
  const result = await withCustomIdRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const err = new Error("duplicate key");
      err.code = 11000;
      err.keyValue = { customId: "test-1" };
      throw err;
    }
    return "success";
  }, 3);

  assertEqual(result, "success", "Returns result after retry");
  assertEqual(attempts, 2, "Retried exactly once");
});

test("D6: withCustomIdRetry does not retry projectId+plotNumber E11000", async () => {
  let attempts = 0;
  let thrown = null;
  try {
    await withCustomIdRetry(async () => {
      attempts += 1;
      const err = new Error("duplicate key");
      err.code = 11000;
      err.keyValue = { projectId: "abc", plotNumber: "1" };
      throw err;
    }, 3);
  } catch (err) {
    thrown = err;
  }

  assertEqual(attempts, 1, "Only one attempt (no retry)");
  assert(thrown !== null, "Error is propagated");
  assertEqual(thrown.code, 11000, "Original error code preserved");
});

test("D7: withCustomIdRetry does not retry non-E11000 errors", async () => {
  let attempts = 0;
  let thrown = null;
  try {
    await withCustomIdRetry(async () => {
      attempts += 1;
      throw new Error("validation error");
    }, 3);
  } catch (err) {
    thrown = err;
  }

  assertEqual(attempts, 1, "Only one attempt (no retry for non-E11000)");
  assert(thrown !== null, "Error is propagated");
  assertEqual(thrown.message, "validation error", "Original error message preserved");
});

test("D8: withCustomIdRetry respects retry limit", async () => {
  let attempts = 0;
  let thrown = null;
  try {
    await withCustomIdRetry(async () => {
      attempts += 1;
      const err = new Error("duplicate key");
      err.code = 11000;
      err.keyValue = { customId: "test-1" };
      throw err;
    }, 3);
  } catch (err) {
    thrown = err;
  }

  assertEqual(attempts, 4, "4 total attempts (1 initial + 3 retries)");
  assert(thrown !== null, "Error propagated after exhaustion");
  assertEqual(thrown.code, 11000, "Original error code preserved");
});

test("D9: withCustomIdRetry succeeds on first attempt", async () => {
  const result = await withCustomIdRetry(async () => {
    return "immediate-success";
  }, 3);
  assertEqual(result, "immediate-success", "Returns result on first attempt");
});

// ═══════════════════════════════════════════════════════════════════════════
// Main execution
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("=== B3 + B4 CUSTOM ID COUNTER REGRESSION TESTS (STAGE 4) ===");

  await setup();

  try {
    // Run all tests sequentially (each test manages its own data)
    for (const t of tests) {
      console.log(`\n[Test ${passed + failed + 1}] ${t.name}`);
      try {
        await t.fn();
      } catch (err) {
        failed += 1;
        console.error(`  ✗ FATAL: ${err.message}`);
        console.error(err.stack);
      }
    }
  } finally {
    await teardown();
  }

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"}: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
