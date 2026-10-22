import mongoose from "mongoose";
import dotenv from "dotenv";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import User from "../models/User.js";
import { sanitizeSvg } from "../utils/sanitizeSvg.js";
import { storageService } from "../services/storageService.js";
import {
  saveProjectLayoutSuperAdmin,
  uploadLayoutImageSuperAdmin,
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
  console.log("=== STARTING INTERACTIVE PROJECT LAYOUT & SECURITY TESTS ===");

  // 1. Test SVG Sanitization Unit Tests
  console.log("\n[Test Suite 1] Strict SVG Sanitization");
  const maliciousSvg = `<svg viewBox="0 0 100 100" onload="alert('XSS')">
    <script>alert('pwned')</script>
    <a href="javascript:alert(1)"><rect x="10" y="10" width="30" height="30"/></a>
    <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
    <foreignObject><iframe src="malicious.html"></iframe></foreignObject>
  </svg>`;

  const sanitized = sanitizeSvg(maliciousSvg);
  assert(!sanitized.includes("<script"), "Stripped <script> tag");
  assert(!sanitized.includes("onload="), "Stripped inline onload event handler");
  assert(!sanitized.includes("javascript:"), "Stripped javascript: protocol");
  assert(!sanitized.includes("<!DOCTYPE"), "Stripped DOCTYPE / XXE definitions");
  assert(!sanitized.includes("<iframe"), "Stripped unsafe <iframe> tag");
  assert(sanitized.includes("<svg") && sanitized.includes("</svg>"), "Preserves valid SVG root structure");

  // 2. Test Storage Service Unconfigured Error (No Ephemeral Fallback)
  console.log("\n[Test Suite 2] Cloudinary Unconfigured Guard");
  const originalUrl = process.env.CLOUDINARY_URL;
  const originalCloud = process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_URL;
  delete process.env.CLOUDINARY_CLOUD_NAME;

  try {
    await storageService.uploadLayoutImage({
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      mimeType: "image/png",
      projectId: "test_project",
    });
    assert(false, "Should throw error when Cloudinary credentials are absent");
  } catch (err) {
    assert(
      err.statusCode === 503 && err.message.includes("Cloudinary"),
      "Explicitly returns HTTP 503 error without falling back to local filesystem disk"
    );
  } finally {
    if (originalUrl) process.env.CLOUDINARY_URL = originalUrl;
    if (originalCloud) process.env.CLOUDINARY_CLOUD_NAME = originalCloud;
  }

  // Connect to DB for controller tests
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI not found in backend/.env. Skipping DB integration tests.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("\nConnected to MongoDB for Model & Controller validation.");

  const testSuperAdminId = new mongoose.Types.ObjectId();
  const alienSuperAdminId = new mongoose.Types.ObjectId();

  // Create Super Admin user
  await User.create({
    _id: testSuperAdminId,
    name: "Layout Super Admin",
    email: `layout_sa_${Date.now()}@test.com`,
    passwordHash: "hash123",
    role: "SUPER_ADMIN",
  });

  // Create Test Project with 5 Plots
  const testProjectCustomId = Math.floor(Math.random() * 80000) + 10000;
  const testProject = await Project.create({
    customId: testProjectCustomId,
    title: `Layout Security Project ${Date.now()}`,
    location: "Kovaipudur",
    city: "Coimbatore",
    plotPrice: "₹18 Lakh",
    priceLakhs: 18,
    approvalStatus: "APPROVED",
    approvedBy: testSuperAdminId,
    status: "Active",
  });

  const plotsToCreate = [
    { plotNumber: "1", status: "Available", size: "1200 sq.ft", facing: "North", price: "₹18 Lakh" },
    { plotNumber: "2", status: "Available", size: "1200 sq.ft", facing: "North", price: "₹18 Lakh" },
    { plotNumber: "3", status: "Reserved", size: "1500 sq.ft", facing: "East", price: "₹22 Lakh" },
    { plotNumber: "4", status: "Sold", size: "1800 sq.ft", facing: "West", price: "₹26 Lakh" },
    { plotNumber: "5", status: "Available", size: "2400 sq.ft", facing: "South", price: "₹35 Lakh" },
  ];

  const createdPlots = [];
  for (const p of plotsToCreate) {
    const pl = await Plot.create({
      customId: `${testProject._id}-${p.plotNumber}`,
      projectId: testProject._id,
      plotNumber: p.plotNumber,
      size: p.size,
      facing: p.facing,
      price: p.price,
      status: p.status,
    });
    createdPlots.push(pl);
  }
  assert(createdPlots.length === 5, "Sample test project created with 5 real plot records");

  // Create an Alien Project with its own plot to test cross-tenant / cross-project isolation
  const alienProject = await Project.create({
    customId: testProjectCustomId + 1,
    title: `Alien Project ${Date.now()}`,
    location: "Pollachi",
    city: "Pollachi",
    plotPrice: "₹10 Lakh",
    priceLakhs: 10,
    approvalStatus: "APPROVED",
    approvedBy: alienSuperAdminId,
  });
  const alienPlot = await Plot.create({
    customId: `${alienProject._id}-1`,
    projectId: alienProject._id,
    plotNumber: "Alien-1",
    size: "1000 sq.ft",
    facing: "North",
    price: "₹10 Lakh",
    status: "Available",
  });

  console.log("\n[Test Suite 3] Boundary Validation & Tenant Isolation");

  // Helper response mock
  const createMockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.body = data;
      return res;
    };
    return res;
  };

  // Test 3A: Out-of-bounds coordinates rejection
  {
    const req = {
      user: { _id: testSuperAdminId, role: "SUPER_ADMIN" },
      params: { id: String(testProject._id) },
      body: {
        layout: {
          imageUrl: "https://example.com/layout.png",
          regions: [
            {
              plotId: String(createdPlots[0]._id),
              plotNumber: "1",
              points: [
                { x: 10, y: 10 },
                { x: 150, y: 20 }, // INVALID: > 100%
                { x: 20, y: 30 },
              ],
            },
          ],
        },
      },
    };
    const res = createMockRes();
    await saveProjectLayoutSuperAdmin(req, res, (err) => { res.statusCode = 500; res.body = { message: err?.message }; });
    assert(res.statusCode === 400, "Rejects out-of-bounds polygon coordinates (> 100%)");
  }

  // Test 3B: Cross-project / cross-tenant plot ID rejection
  {
    const req = {
      user: { _id: testSuperAdminId, role: "SUPER_ADMIN" },
      params: { id: String(testProject._id) },
      body: {
        layout: {
          imageUrl: "https://example.com/layout.png",
          regions: [
            {
              plotId: String(alienPlot._id), // Foreign plot from another project/tenant!
              plotNumber: "Alien-1",
              points: [
                { x: 10, y: 10 },
                { x: 20, y: 10 },
                { x: 20, y: 20 },
              ],
            },
          ],
        },
      },
    };
    const res = createMockRes();
    await saveProjectLayoutSuperAdmin(req, res, (err) => { res.statusCode = 500; res.body = { message: err?.message }; });
    assert(res.statusCode === 400 && res.body?.message?.includes("invalid Plot ID"), "Strictly rejects alien plot ID belonging to another project or tenant");
  }

  // Test 3C: Duplicate plot mapping prevention
  {
    const req = {
      user: { _id: testSuperAdminId, role: "SUPER_ADMIN" },
      params: { id: String(testProject._id) },
      body: {
        layout: {
          imageUrl: "https://example.com/layout.png",
          regions: [
            {
              plotId: String(createdPlots[0]._id),
              plotNumber: "1",
              points: [
                { x: 10, y: 10 },
                { x: 20, y: 10 },
                { x: 20, y: 20 },
              ],
            },
            {
              plotId: String(createdPlots[0]._id), // DUPLICATE!
              plotNumber: "1",
              points: [
                { x: 30, y: 30 },
                { x: 40, y: 30 },
                { x: 40, y: 40 },
              ],
            },
          ],
        },
      },
    };
    const res = createMockRes();
    await saveProjectLayoutSuperAdmin(req, res, (err) => { res.statusCode = 500; res.body = { message: err?.message }; });
    assert(res.statusCode === 400 && res.body?.message?.includes("Duplicate plot mapping"), "Rejects duplicate plot mappings across multiple regions");
  }

  // Test 3D: Successful save and reload of valid layout configuration
  {
    const validRegions = createdPlots.map((p, idx) => ({
      plotId: String(p._id),
      plotNumber: p.plotNumber,
      block: idx < 3 ? "Block A" : "Block B",
      points: [
        { x: 10 * (idx + 1), y: 10 },
        { x: 10 * (idx + 1) + 8, y: 10 },
        { x: 10 * (idx + 1) + 8, y: 20 },
        { x: 10 * (idx + 1), y: 20 },
      ],
    }));

    const req = {
      user: { _id: testSuperAdminId, role: "SUPER_ADMIN" },
      params: { id: String(testProject._id) },
      body: {
        layout: {
          referenceImageUrl: "https://res.cloudinary.com/demo/image/upload/sample_layout.png",
          imageUrl: "https://res.cloudinary.com/demo/image/upload/sample_layout.png",
          provider: "cloudinary",
          publicId: `sample_layout_${testProject._id}`,
          width: 1920,
          height: 1080,
          compassOrientation: 45,
          blocks: [
            { id: "Block A", name: "Block A", color: "#3b82f6" },
            { id: "Block B", name: "Block B", color: "#10b981" },
          ],
          roads: [
            {
              name: "Main Boulevard",
              widthFt: "40 Ft",
              points: [
                { x: 0, y: 50 },
                { x: 100, y: 50 },
                { x: 100, y: 60 },
                { x: 0, y: 60 },
              ],
            },
          ],
          commonAreas: [
            {
              name: "Botanical Park",
              type: "park",
              points: [
                { x: 70, y: 70 },
                { x: 90, y: 70 },
                { x: 90, y: 90 },
                { x: 70, y: 90 },
              ],
            },
          ],
          regions: validRegions,
        },
      },
    };
    const res = createMockRes();
    await saveProjectLayoutSuperAdmin(req, res, (err) => { res.statusCode = 500; res.body = { message: err?.message }; });
    assert(res.statusCode === 200 && res.body?.success === true, "Saves valid layout with 5 plot regions successfully");

    // Verify persisted in DB
    const updated = await Project.findById(testProject._id);
    assert(updated.layout.regions.length === 5, "Database persisted 5 layout regions");
    assert(updated.layout.version === 1, "Layout version incremented to 1");
    assert(updated.layout.blocks.length === 2, "Blocks persisted accurately");
    assert(updated.layout.roads.length === 1 && updated.layout.roads[0].name === "Main Boulevard", "Native roads persisted accurately");
    assert(updated.layout.commonAreas.length === 1 && updated.layout.commonAreas[0].name === "Botanical Park", "Native parks/common areas persisted accurately");
    assert(updated.layout.compassOrientation === 45, "Compass orientation persisted accurately");
  }

  // Cleanup test documents
  await Plot.deleteMany({ projectId: { $in: [testProject._id, alienProject._id] } });
  await Project.deleteMany({ _id: { $in: [testProject._id, alienProject._id] } });
  await User.deleteMany({ _id: testSuperAdminId });
  await mongoose.disconnect();

  console.log("\n=======================================================");
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=======================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
