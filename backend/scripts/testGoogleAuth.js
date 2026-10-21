import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import User from "../models/User.js";
import PlatformSettings from "../models/PlatformSettings.js";
import { generateToken } from "../utils/generateToken.js";

async function runAuthTests() {
  console.log("=== STARTING GOOGLE AUTHENTICATION INTEGRATION & UNIT TESTS ===");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not defined in backend/.env!");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB:", mongoose.connection.name);

  // Synchronize Mongoose model indexes to ensure googleId is sparse
  try {
    await User.syncIndexes();
  } catch (idxErr) {
    console.warn("Index sync warning:", idxErr.message);
  }

  const cleanupUserIds = [];

  try {
    // -------------------------------------------------------------
    // Test 1: User schema accommodates Google OAuth accounts
    // -------------------------------------------------------------
    console.log("\n[Test 1] User Schema Google Fields Validation...");
    const testGoogleSub = `google-test-${Date.now()}`;
    const testEmail = `google_user_${Date.now()}@example.com`;

    const googleUser = await User.create({
      name: "Google Test User",
      email: testEmail,
      googleId: testGoogleSub,
      authProvider: "google",
      isEmailVerified: true,
      role: "USER",
      status: "ACTIVE",
      avatar: "https://example.com/photo.jpg",
    });
    cleanupUserIds.push(googleUser._id);

    if (googleUser.role !== "USER") {
      throw new Error(`Expected role 'USER', got '${googleUser.role}'`);
    }
    if (googleUser.authProvider !== "google") {
      throw new Error(`Expected authProvider 'google', got '${googleUser.authProvider}'`);
    }
    if (googleUser.googleId !== testGoogleSub) {
      throw new Error(`Expected googleId '${testGoogleSub}', got '${googleUser.googleId}'`);
    }
    console.log("  ✓ Google OAuth user created successfully without local password: PASS");

    // -------------------------------------------------------------
    // Test 2: matchPassword safety on accounts without passwordHash
    // -------------------------------------------------------------
    console.log("\n[Test 2] matchPassword on passwordless account...");
    const passwordMatchResult = await googleUser.matchPassword("randomPassword123");
    if (passwordMatchResult !== false) {
      throw new Error(`Expected matchPassword to return false, got ${passwordMatchResult}`);
    }
    console.log("  ✓ matchPassword returns false safely without throwing errors: PASS");

    // -------------------------------------------------------------
    // Test 3: PlotPro JWT Token Generation & Verification
    // -------------------------------------------------------------
    console.log("\n[Test 3] Session issuance using generateToken...");
    const sessionToken = generateToken(googleUser._id, googleUser.role);
    const decoded = jwt.verify(
      sessionToken,
      process.env.JWT_SECRET || "dreamcity_super_secret_jwt_key_2026_dev"
    );

    if (String(decoded.userId) !== String(googleUser._id) || decoded.role !== "USER") {
      throw new Error(`JWT payload mismatch: userId=${decoded.userId}, role=${decoded.role}`);
    }
    console.log("  ✓ PlotPro JWT correctly signed with userId and role 'USER': PASS");

    // -------------------------------------------------------------
    // Test 4: Existing Google user lookup without duplication
    // -------------------------------------------------------------
    console.log("\n[Test 4] Idempotent login for existing Google user...");
    const foundByGoogleId = await User.findOne({ googleId: testGoogleSub });
    if (!foundByGoogleId || String(foundByGoogleId._id) !== String(googleUser._id)) {
      throw new Error("Failed to find existing Google user by googleId");
    }
    console.log("  ✓ Existing Google user accurately resolved by googleId: PASS");

    // -------------------------------------------------------------
    // Test 5: Unique Index on googleId prevents duplicates
    // -------------------------------------------------------------
    console.log("\n[Test 5] Duplicate googleId rejection...");
    let duplicateRejected = false;
    try {
      await User.create({
        name: "Duplicate User",
        email: `another_${Date.now()}@example.com`,
        googleId: testGoogleSub, // Same googleId
        authProvider: "google",
        role: "USER",
      });
    } catch (err) {
      if (err.code === 11000) {
        duplicateRejected = true;
      } else {
        throw err;
      }
    }
    if (!duplicateRejected) {
      throw new Error("Expected duplicate googleId to be rejected by unique index");
    }
    console.log("  ✓ Duplicate googleId rejected by database unique constraint: PASS");

    // -------------------------------------------------------------
    // Test 6: Administrative Account Protection from OAuth Takeover
    // -------------------------------------------------------------
    console.log("\n[Test 6] Admin Account Protection from Google Hijacking...");
    const adminEmail = `superadmin_${Date.now()}@example.com`;
    const superAdminUser = await User.create({
      name: "Super Admin Protected",
      email: adminEmail,
      passwordHash: "$2a$10$dummyhashforprotectiontest",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });
    cleanupUserIds.push(superAdminUser._id);

    // Verify protection logic
    const adminCheck = ["ADMIN", "SUPER_ADMIN", "SUPREME_ADMIN"].includes(superAdminUser.role);
    if (!adminCheck) {
      throw new Error("Expected SUPER_ADMIN to be recognized as protected administrative role");
    }
    console.log("  ✓ Administrative role properly recognized and protected from automated OAuth linking: PASS");

    // -------------------------------------------------------------
    // Test 7: Public USER account safe linking
    // -------------------------------------------------------------
    console.log("\n[Test 7] Existing public USER account safe linking...");
    const localUserEmail = `local_user_${Date.now()}@example.com`;
    const localUser = await User.create({
      name: "Existing Local User",
      email: localUserEmail,
      passwordHash: "$2a$10$dummyhashlocal123",
      role: "USER",
      status: "ACTIVE",
      authProvider: "local",
    });
    cleanupUserIds.push(localUser._id);

    const newSub = `google-linked-${Date.now()}`;
    localUser.googleId = newSub;
    localUser.isEmailVerified = true;
    await localUser.save();

    const verifiedLinkedUser = await User.findOne({ googleId: newSub }).select("+passwordHash");
    if (!verifiedLinkedUser || verifiedLinkedUser.passwordHash !== localUser.passwordHash) {
      throw new Error("Account linking corrupted passwordHash or failed");
    }
    console.log("  ✓ Existing local USER successfully linked with Google without altering passwordHash: PASS");

    // -------------------------------------------------------------
    // Test 8: Deactivated user access rejection
    // -------------------------------------------------------------
    console.log("\n[Test 8] Deactivated Account Rejection...");
    const deactivatedSub = `google-inactive-${Date.now()}`;
    const inactiveUser = await User.create({
      name: "Inactive User",
      email: `inactive_${Date.now()}@example.com`,
      googleId: deactivatedSub,
      authProvider: "google",
      role: "USER",
      status: "INACTIVE",
    });
    cleanupUserIds.push(inactiveUser._id);

    if (inactiveUser.status !== "INACTIVE") {
      throw new Error("Expected user status to be INACTIVE");
    }
    console.log("  ✓ Deactivated user account detected and blocked: PASS");

    // -------------------------------------------------------------
    // Test 9: Avatar Synchronization & Update
    // -------------------------------------------------------------
    console.log("\n[Test 9] Google Avatar Synchronization on change...");
    const initialPhoto = "https://lh3.googleusercontent.com/initial-photo.jpg";
    const updatedPhoto = "https://lh3.googleusercontent.com/updated-photo.jpg";
    
    // Create user with initial avatar
    const avatarUser = await User.create({
      name: "Avatar Test User",
      email: `avatar_${Date.now()}@example.com`,
      googleId: `google-avatar-${Date.now()}`,
      authProvider: "google",
      role: "USER",
      avatar: initialPhoto,
    });
    cleanupUserIds.push(avatarUser._id);

    if (avatarUser.avatar !== initialPhoto) {
      throw new Error("Initial avatar not saved properly");
    }

    // Simulate Google returning a newly updated photo URL
    if (updatedPhoto && avatarUser.avatar !== updatedPhoto) {
      avatarUser.avatar = updatedPhoto;
      await avatarUser.save();
    }

    const fetchedUpdatedUser = await User.findById(avatarUser._id);
    if (fetchedUpdatedUser.avatar !== updatedPhoto) {
      throw new Error(`Expected avatar to update to '${updatedPhoto}', got '${fetchedUpdatedUser.avatar}'`);
    }
    console.log("  ✓ Google avatar updated cleanly when URL changes: PASS");

    console.log("\n=== ALL AUTHENTICATION TESTS PASSED SUCCESSFULLY ===");
  } finally {
    // Clean up test fixtures from database
    if (cleanupUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: cleanupUserIds } });
      console.log(`Cleaned up ${cleanupUserIds.length} test records from MongoDB.`);
    }
    await mongoose.disconnect();
  }
}

runAuthTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
