import mongoose from "mongoose";

const BASE_URL = "http://localhost:5000/api";

const runTest = async () => {
  console.log("==================================================================");
  console.log("  TEST: NORMAL ADMIN PROJECT CREATION & DATABASE PERSISTENCE");
  console.log("==================================================================");

  // 1. Login as Normal Admin (Arun Kumar)
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "arun@dreamcity.in", password: "Admin@123" }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log(`✓ Authenticated as ${loginData.user.name} (${loginData.user.email})`);

  // 2. Count existing projects before creation
  const initialProjectsRes = await fetch(`${BASE_URL}/admin/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const initialProjectsData = await initialProjectsRes.json();
  const countBefore = initialProjectsData.count;
  console.log(`• Initial projects count in DB for Arun: ${countBefore}`);

  // 3. Create a new project via POST /api/admin/projects
  const projectTitle = `Test Persistent Project ${Date.now()}`;
  const newProjectPayload = {
    title: projectTitle,
    location: "Coimbatore, Tamil Nadu",
    city: "Coimbatore",
    category: "Residential",
    budget: "10to20",
    status: "Active",
    image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200",
    plotType: "Residential",
    plotPrice: "15 Lakh",
    priceLakhs: 15,
    plotSizes: "1200 Sq.ft",
    projectSize: "5 Acres",
    totalPlots: 10,
    availablePlots: 6,
    reservedPlots: 2,
    soldPlots: 2,
    launchDate: "01 Nov 2026",
    details: "Automated test project verifying database persistence.",
    images: ["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200"],
  };

  const createRes = await fetch(`${BASE_URL}/admin/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(newProjectPayload),
  });
  const createData = await createRes.json();
  console.log(`✓ Create Project HTTP Status: ${createRes.status}`);
  if (!createData.success) {
    throw new Error(`Project creation failed: ${createData.message}`);
  }
  const createdProject = createData.data;
  console.log(`✓ Created Project customId: ${createdProject.customId} (MongoDB _id: ${createdProject._id})`);
  console.log(`  Approval Status: ${createdProject.approvalStatus}`);

  // 4. Simulate browser refresh: fetch GET /api/admin/projects
  console.log("\n• Simulating browser page reload / re-fetching from DB...");
  const afterReloadRes = await fetch(`${BASE_URL}/admin/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const afterReloadData = await afterReloadRes.json();
  const countAfter = afterReloadData.count;
  console.log(`• Projects count after reload: ${countAfter} (Expected: ${countBefore + 1})`);

  const foundInReload = afterReloadData.data.find(
    (p) => String(p.customId) === String(createdProject.customId) || String(p._id) === String(createdProject._id)
  );

  if (!foundInReload) {
    throw new Error("FAILED: Project is missing after refresh!");
  }
  console.log(`✓ Verified project "${foundInReload.title}" persisted in database!`);
  console.log(`  Plots count check: totalPlots=${foundInReload.totalPlots}, availablePlots=${foundInReload.availablePlots}`);

  // 5. Verify direct MongoDB query for plots
  await mongoose.connect("mongodb://127.0.0.1:27017/dreamcity");
  const plotsInDB = await mongoose.connection.collection("plots").countDocuments({ projectId: new mongoose.Types.ObjectId(createdProject._id) });
  console.log(`✓ Verified plots in MongoDB Plot collection: ${plotsInDB} plots found`);
  await mongoose.disconnect();

  if (plotsInDB !== 10) {
    throw new Error(`Expected 10 plots in DB, found ${plotsInDB}`);
  }

  // 6. Cleanup test project
  await fetch(`${BASE_URL}/admin/projects/${createdProject.customId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`✓ Cleaned up test project.`);

  console.log("\n==================================================================");
  console.log("  ALL TESTS PASSED: PROJECT FULLY PERSISTS ON REFRESH (100%)");
  console.log("==================================================================");
};

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
