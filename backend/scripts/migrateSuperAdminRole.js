/**
 * Optional, non-destructive migration script for Super Admin display name alignment.
 * 
 * SAFEGUARDS:
 * - Defaults to DRY-RUN mode. Will NOT modify any data unless explicitly run with --apply.
 * - Uses existing backend environment configuration (process.env.MONGODB_URI).
 * - Only targets the verified subscriber account (email: superadmin@dreamcity.in).
 * - Never modifies passwords, password hashes, statuses, roles, or any unrelated user.
 * - Never runs automatically during application startup or seeding.
 * 
 * Usage:
 *   node scripts/migrateSuperAdminRole.js          (dry-run report only)
 *   node scripts/migrateSuperAdminRole.js --apply  (applies change to verified account)
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend .env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const isApply = process.argv.includes("--apply");

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[Migration] Error: MONGODB_URI is not defined in backend .env");
    process.exit(1);
  }

  console.log(`[Migration] Mode: ${isApply ? "APPLY (writes enabled)" : "DRY-RUN (read-only preview)"}`);
  console.log(`[Migration] Connecting to database configured in .env...`);

  try {
    const conn = await mongoose.connect(uri);
    console.log(`[Migration] Connected to database: ${conn.connection.name}`);

    const usersCol = conn.connection.collection("users");

    // 1. Check all user roles across database
    const distinctRoles = await usersCol.distinct("role");
    console.log(`[Migration] Distinct roles present in database:`, distinctRoles);

    // 2. Identify candidate user for display name alignment
    const targetUser = await usersCol.findOne({
      email: "superadmin@dreamcity.in",
      role: "SUPER_ADMIN",
    });

    if (!targetUser) {
      console.log(`[Migration] Account superadmin@dreamcity.in was not found. Nothing to update.`);
    } else {
      console.log(`[Migration] Verified target account:`, {
        _id: targetUser._id,
        email: targetUser.email,
        currentName: targetUser.name,
        role: targetUser.role,
        status: targetUser.status,
      });

      if (targetUser.name === "Supreme Admin") {
        if (!isApply) {
          console.log(`[Migration] [DRY-RUN] Would update 'name' from "Supreme Admin" -> "Super Admin" for account ${targetUser.email}.`);
          console.log(`[Migration] [DRY-RUN] No changes were written. To apply this change, run: node scripts/migrateSuperAdminRole.js --apply`);
        } else {
          const res = await usersCol.updateOne(
            { _id: targetUser._id },
            { $set: { name: "Super Admin" } }
          );
          console.log(`[Migration] [APPLIED] Updated display name for ${targetUser.email}. Matched: ${res.matchedCount}, Modified: ${res.modifiedCount}`);
        }
      } else {
        console.log(`[Migration] Account name is already '${targetUser.name}'. No update required.`);
      }
    }

    await mongoose.disconnect();
    console.log(`[Migration] Disconnected cleanly.`);
    process.exit(0);
  } catch (err) {
    console.error(`[Migration] Error during migration:`, err.message);
    process.exit(1);
  }
}

run();
