import mongoose from "mongoose";

const BASE_URL = "http://localhost:5000/api";

const runTest = async () => {
  console.log("==================================================================");
  console.log("  TEST: DIRECT EDITS WITHOUT SUPER ADMIN APPROVAL WAIT");
  console.log("==================================================================");

  // 1. Login as Normal Admin
  const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "arun@dreamcity.in", password: "Admin@123" }),
  });
  const adminData = await adminLoginRes.json();
  const adminToken = adminData.token;
  console.log(`✓ Admin logged in: ${adminData.user.name}`);

  // 2. Login as Super Admin
  const saLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "superadmin@dreamcity.in", password: "SuperAdmin@123" }),
  });
  const saData = await saLoginRes.json();
  const saToken = saData.token;
  console.log(`✓ Super Admin logged in: ${saData.user.name}`);

  // 3. Normal Admin creates NEW project -> Must be PENDING (Requires Super Admin approval)
  const newProjTitle = `Direct Edit Test ${Date.now()}`;
  const createRes = await fetch(`${BASE_URL}/admin/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      title: newProjTitle,
      location: "Madurai, Tamil Nadu",
      city: "Madurai",
      plotPrice: "10 Lakh",
      priceLakhs: 10,
      totalPlots: 4,
      availablePlots: 4,
    }),
  });
  const createData = await createRes.json();
  const createdProject = createData.data;
  console.log(`\n• Step 1: New Project Created:`);
  console.log(`  - customId: ${createdProject.customId}`);
  console.log(`  - initial approvalStatus: ${createdProject.approvalStatus} (Expected: PENDING)`);
  if (createdProject.approvalStatus !== "PENDING") {
    throw new Error(`Expected new project to be PENDING, got ${createdProject.approvalStatus}`);
  }

  // 4. Super Admin approves initial project creation
  const approveRes = await fetch(`${BASE_URL}/super-admin/projects/${createdProject.customId}/approve`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${saToken}` },
  });
  const approveData = await approveRes.json();
  console.log(`\n• Step 2: Super Admin Approves Initial Project:`);
  console.log(`  - approvalStatus: ${approveData.data.approvalStatus} (Expected: APPROVED)`);

  // 5. Normal Admin now makes an edit (change title, price, and image)
  // MUST NOT wait for Super Admin approval, MUST NOT set hasPendingUpdates: true!
  const updatedTitle = `${newProjTitle} - Updated By Admin Directly`;
  const updatedPrice = "14.5 Lakh";
  const updatedImage = "https://images.unsplash.com/photo-direct-update-999.jpg";

  console.log(`\n• Step 3: Normal Admin edits approved project directly...`);
  const updateRes = await fetch(`${BASE_URL}/admin/projects/${createdProject.customId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      title: updatedTitle,
      plotPrice: updatedPrice,
      image: updatedImage,
      distance: "1 km to Metro",
    }),
  });
  const updateData = await updateRes.json();
  console.log(`  - Update HTTP status: ${updateRes.status}`);
  console.log(`  - pendingApproval flag: ${updateData.pendingApproval} (Expected: false)`);
  console.log(`  - Response message: "${updateData.message}"`);
  console.log(`  - Live project title: "${updateData.data.title}"`);
  console.log(`  - Live project plotPrice: "${updateData.data.plotPrice}"`);
  console.log(`  - Live project image: "${updateData.data.image}"`);
  console.log(`  - hasPendingUpdates: ${updateData.data.hasPendingUpdates} (Expected: false)`);

  if (updateData.pendingApproval !== false) {
    throw new Error(`Expected pendingApproval to be false, got ${updateData.pendingApproval}`);
  }
  if (updateData.data.hasPendingUpdates === true) {
    throw new Error(`Expected hasPendingUpdates to be false, got ${updateData.data.hasPendingUpdates}`);
  }
  if (updateData.data.title !== updatedTitle) {
    throw new Error(`Project title was not directly updated in live document!`);
  }

  // 6. Verify public visibility of updated project (Zero wait, immediately live!)
  const publicRes = await fetch(`${BASE_URL}/public/projects/${createdProject.customId}`);
  const publicData = await publicRes.json();
  console.log(`\n• Step 4: Public website check:`);
  console.log(`  - Public title: "${publicData.data.title}"`);
  console.log(`  - Public price: "${publicData.data.plotPrice}"`);
  if (publicData.data.title !== updatedTitle) {
    throw new Error("Public website did not immediately reflect the direct update!");
  }
  console.log(`✓ Verified changes are live instantly without waiting for Super Admin approval!`);

  // 7. Cleanup
  await fetch(`${BASE_URL}/super-admin/projects/${createdProject.customId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${saToken}` },
  });
  console.log(`\n✓ Cleaned up test project.`);

  console.log("\n==================================================================");
  console.log("  ALL TESTS PASSED: DIRECT EDITS REQUIRE NO APPROVAL WAIT (100%)");
  console.log("==================================================================");
};

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
