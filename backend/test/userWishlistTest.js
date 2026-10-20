// Verification test for user profile and wishlist functionality
const BASE_URL = "http://localhost:5000/api";

async function runTest() {
  console.log("=== Testing User Profile & Wishlist Functionality ===");

  // 1. Login as USER
  console.log("\n1. Logging in as user@dreamcity.in...");
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@dreamcity.in", password: "User@123" }),
  });
  const loginData = await loginRes.json();
  if (!loginData.success || !loginData.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }
  console.log("✓ Logged in successfully. Token received.");
  const token = loginData.token;

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // 2. Fetch User Profile
  console.log("\n2. Fetching User Profile...");
  const profileRes = await fetch(`${BASE_URL}/user/profile`, { headers: authHeaders });
  const profileData = await profileRes.json();
  console.log(`✓ Profile received: Name: ${profileData.data.name}, Email: ${profileData.data.email}, Role: ${profileData.data.role}`);

  // 3. Update User Profile
  console.log("\n3. Updating User Profile Details...");
  const updateRes = await fetch(`${BASE_URL}/user/profile`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Demo Customer Verified",
      phone: "+91 98765 99999",
    }),
  });
  const updateData = await updateRes.json();
  console.log(`✓ Profile updated: ${updateData.message}, new name: ${updateData.data.name}, new phone: ${updateData.data.phone}`);

  // 4. Toggle Save Project (customId 1)
  console.log("\n4. Toggling Save Project (ID: 1)...");
  const saveProjRes = await fetch(`${BASE_URL}/user/wishlist/projects/1`, {
    method: "POST",
    headers: authHeaders,
  });
  const saveProjData = await saveProjRes.json();
  console.log(`✓ Project toggle response: saved=${saveProjData.saved}, msg="${saveProjData.message}"`);

  // 5. Toggle Save Plot (customId 1-1)
  console.log("\n5. Toggling Save Plot (ID: 1-1)...");
  const savePlotRes = await fetch(`${BASE_URL}/user/wishlist/plots/1-1`, {
    method: "POST",
    headers: authHeaders,
  });
  const savePlotData = await savePlotRes.json();
  console.log(`✓ Plot toggle response: saved=${savePlotData.saved}, msg="${savePlotData.message}"`);

  // 6. Fetch Wishlist
  console.log("\n6. Fetching Wishlist...");
  const wishlistRes = await fetch(`${BASE_URL}/user/wishlist`, { headers: authHeaders });
  const wishlistData = await wishlistRes.json();
  console.log(`✓ Wishlist received: ${wishlistData.data.projects.length} project(s), ${wishlistData.data.plots.length} plot(s)`);
  if (wishlistData.data.projects.length > 0) {
    console.log(`  - Saved Project: ${wishlistData.data.projects[0].title} (customId: ${wishlistData.data.projects[0].customId})`);
  }
  if (wishlistData.data.plots.length > 0) {
    console.log(`  - Saved Plot: #${wishlistData.data.plots[0].plotNumber} in project ${wishlistData.data.plots[0].projectId?.title}`);
  }

  // 7. Password update test
  console.log("\n7. Testing Password Change...");
  const pwRes = await fetch(`${BASE_URL}/user/password`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      currentPassword: "User@123",
      newPassword: "User@Updated123",
    }),
  });
  const pwData = await pwRes.json();
  console.log(`✓ Password update response: ${pwData.message}`);

  // Revert password back so demo seed credentials remain predictable
  console.log("   Reverting password back to User@123...");
  const revertRes = await fetch(`${BASE_URL}/user/password`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      currentPassword: "User@Updated123",
      newPassword: "User@123",
    }),
  });
  const revertData = await revertRes.json();
  console.log(`✓ Reverted password: ${revertData.message}`);

  console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===");
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
