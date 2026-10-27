/**
 * Branchless Admin Cleanup Script
 *
 * Removes legacy ADMIN accounts that have no branchId (accounts created before
 * branch-based management).Managed projects are unassigned first, so they drop
 * into the "Unassigned Projects" list. Afterwards every Subscription's
 * usedSeats is re-synced against the real ACTIVE admin count (same counting
 * rule as scripts/reconcileSeats.js), which instantly reflects in the
 * Super Admin dashboard seat usage.
 *
 * SUPER_ADMIN / SUPREME_ADMIN accounts are NEVER touched.
 *
 * Usage:
 *   node scripts/removeBranchlessAdmins.js           (dry-run — audit only)
 *   node scripts/removeBranchlessAdmins.js --apply   (delete + unassign + resync)
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Project from "../models/Project.js";
import "../models/Plan.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const isApply = process.argv.includes("--apply");

/** Same counting rule as reconcileSeats.js — single source of truth for seats. */
const countActiveAdmins = async (subscriberId) =>
  User.countDocuments({
    role: "ADMIN",
    status: "ACTIVE",
    $or: [{ tenantId: subscriberId }, { tenantId: null }],
  });

async function cleanup() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[Cleanup] MONGODB_URI not found");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log(`[Cleanup] Connected to ${mongoose.connection.name}`);
    console.log(
      `[Cleanup] Mode: ${isApply ? "APPLY (delete + unassign + resync)" : "DRY-RUN (audit only)"}\n`
    );

    // ── 1. Find the branchless admins ─────────────────────────────────────────
    const admins = await User.find({ role: "ADMIN", branchId: null })
      .select("name email status tenantId createdAt")
      .sort({ createdAt: 1 });

    if (admins.length === 0) {
      console.log("No branchless (legacy) admin accounts found. Nothing to do.");
      await mongoose.disconnect();
      return process.exit(0);
    }

    console.log(`Found ${admins.length} branchless admin account(s):\n`);

    let totalProjectsToUnassign = 0;
    for (const admin of admins) {
      const projects = await Project.find({ adminId: admin._id })
        .select("customId title city")
        .sort({ createdAt: -1 });
      totalProjectsToUnassign += projects.length;

      console.log(`  • ${admin.name} <${admin.email}>`);
      console.log(`      status: ${admin.status} | created: ${admin.createdAt?.toISOString?.() || admin.createdAt}`);
      console.log(`      tenantId: ${admin.tenantId || "(none — global legacy admin)"}`);
      if (projects.length === 0) {
        console.log(`      manages 0 projects — safe delete, no unassignment needed.`);
      } else {
        console.log(`      manages ${projects.length} project(s) → will be UNASSIGNED:`);
        for (const p of projects) {
          console.log(`        - ${p.customId || p._id} | ${p.title} (${p.city || "no city"})`);
        }
      }
      console.log("");
    }

    // ── 2. Seat math — before vs after, per subscription ──────────────────────
    const subscriptions = await Subscription.find({}).populate("subscriberId planId");
    console.log(`Seat impact across ${subscriptions.length} subscription(s):\n`);

    for (const sub of subscriptions) {
      const before = (await countActiveAdmins(sub.subscriberId?._id)) ?? 0;
      // Projection: remove the branchless admins being deleted from the count
      const branchlessAdminIds = new Set(admins.map((a) => a._id.toString()));
      const afterAdmins = await User.countDocuments({
        role: "ADMIN",
        status: "ACTIVE",
        $or: [{ tenantId: sub.subscriberId?._id }, { tenantId: null }],
        _id: { $nin: [...branchlessAdminIds] },
      });
      const recorded = sub.usedSeats || 0;
      console.log(
        `  ${sub.subscriberId?.email || sub._id}: recorded usedSeats=${recorded} | counted now=${before} | after cleanup≈${afterAdmins}`
      );
    }
    console.log("");

    if (!isApply) {
      console.log("--- DRY-RUN ONLY — nothing was modified. ---");
      console.log("To perform the cleanup, run: node scripts/removeBranchlessAdmins.js --apply\n");
      await mongoose.disconnect();
      return process.exit(0);
    }

    // ── 3. APPLY — unassign managed projects, then delete the admins ─────────
    console.log("--- APPLY ---\n");
    let deletedCount = 0;
    for (const admin of admins) {
      const res = await Project.updateMany(
        { adminId: admin._id },
        { $set: { adminId: null } }
      );
      if (res.modifiedCount > 0) {
        console.log(
          `  [UNASSIGNED] ${res.modifiedCount} project(s) previously managed by ${admin.email}`
        );
      }
      await User.deleteOne({ _id: admin._id });
      deletedCount++;
      console.log(`  [DELETED] ${admin.name} <${admin.email}>`);
    }

    // ── 4. Resync usedSeats for every subscription (same rule as reconcile) ───
    console.log("\n--- Resyncing subscription seat counts ---\n");
    for (const sub of subscriptions) {
      const actual = await countActiveAdmins(sub.subscriberId?._id);
      if ((sub.usedSeats || 0) !== actual) {
        await Subscription.updateOne(
          { _id: sub._id },
          { $set: { usedSeats: actual } }
        );
        console.log(
          `  [SYNCED] ${sub.subscriberId?.email || sub._id}: usedSeats ${(sub.usedSeats || 0)} → ${actual}`
        );
      } else {
        console.log(`  [OK] ${sub.subscriberId?.email || sub._id}: usedSeats already ${actual}`);
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Branchless admins deleted: ${deletedCount}`);
    console.log(`Projects moved to unassigned: ${totalProjectsToUnassign}`);

    await mongoose.disconnect();
    console.log("[Cleanup] Done.");
    process.exit(0);
  } catch (err) {
    console.error("[Cleanup] Error:", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

cleanup();
