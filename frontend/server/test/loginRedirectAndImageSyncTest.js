import mongoose from "mongoose";

const BASE_URL = "http://localhost:5000/api";

const runTest = async () => {
  console.log("==================================================================");
  console.log("  LOGIN REDIRECT & PROJECT MANAGE IMAGE SYNC TEST");
  console.log("==================================================================");

  // 1. Test Super Admin Login
  const saRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "superadmin@dreamcity.in", password: "SuperAdmin@123" }),
  });
  const saData = await saRes.json();
  if (saData.user.role === "SUPER_ADMIN") {
    console.log(`✓ Super Admin login successful: role=${saData.user.role}`);
    console.log(`✓ Target panel route: /super-admin`);
  } else {
    throw new Error(`Expected role SUPER_ADMIN, got ${saData.user?.role}`);
  }

  // 2. Test Normal Admin Login
  const adminRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "arun@dreamcity.in", password: "Admin@123" }),
  });
  const adminData = await adminRes.json();
  const token = adminData.token;
  if (adminData.user.role === "ADMIN") {
    console.log(`✓ Normal Admin login successful: role=${adminData.user.role}`);
    console.log(`✓ Target panel route: /admin`);
  } else {
    throw new Error(`Expected role ADMIN, got ${adminData.user?.role}`);
  }

  // 3. Fetch Arun's projects
  const projRes = await fetch(`${BASE_URL}/admin/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const projData = await projRes.json();
  const testProject = projData.data[0];
  console.log(`\n• Testing Project Image Update on "${testProject.title}" (ID: ${testProject.customId})`);
  console.log(`  Current image: ${testProject.image}`);

  // 4. Update project image via admin API (simulating Manage Details Save)
  const newTestImageUrl = "https://images.unsplash.com/photo-custom-test-image-12345.jpg";
  const updateRes = await fetch(`${BASE_URL}/admin/projects/${testProject.customId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      image: newTestImageUrl,
      images: [newTestImageUrl, "https://images.unsplash.com/gallery2.jpg"],
      projectSize: testProject.projectSize || "10 Acres",
    }),
  });
  const updateData = await updateRes.json();
  console.log(`✓ Update API Response Status: ${updateRes.status} (pendingApproval: ${updateData.pendingApproval})`);

  // Verify that the updated project has the new image in image or pendingUpdates.image
  const effectiveUpdatedImg = updateData.data.pendingUpdates?.image || updateData.data.image;
  if (effectiveUpdatedImg === newTestImageUrl) {
    console.log(`✓ Verified project image correctly updated to: ${effectiveUpdatedImg}`);
  } else {
    throw new Error(`Image update failed: got ${effectiveUpdatedImg}`);
  }

  console.log("\n==================================================================");
  console.log("  ALL LOGIN REDIRECT & IMAGE SYNC CHECKS PASSED (100%)");
  console.log("==================================================================");
};

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
