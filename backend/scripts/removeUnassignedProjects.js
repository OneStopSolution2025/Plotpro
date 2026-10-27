/**
 * Remove Unassigned Projects Script
 *
 * Deletes all projects that have NO branch admin assigned (adminId === null).
 * These are the "orphaned" projects that were unassigned when branchless admins
 * were deleted in the previous cleanup.
 *
 * Also cleans up their associated Plot documents.
 *
 * Usage:
 *   node scripts/removeUnassignedProjects.js          (dry-run — audit only)
 *   node scripts/removeUnassignedProjects.js --apply  (actually delete)
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const isApply = process.argv.includes("--apply");

async function cleanup() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[Cleanup] MONGODB_URI not found");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log(`[Cleanup] Connected to ${mongoose.connection.name}`);
    console.log(`[Cleanup] Mode: ${isApply ? "APPLY (delete projects + plots)" : "DRY-RUN (audit only)"}\n`);

    // ── 1. Find unassigned projects (adminId === null) ────────────────────────
    const unassignedProjects = await Project.find({ adminId: null })
      .select("customId title city status approvalStatus branchId isArchived createdAt")
      .sort({ createdAt: -1 });

    if (unassignedProjects.length === 0) {
      console.log("No unassigned projects found. Nothing to do.");
      await mongoose.disconnect();
      return process.exit(0);
    }

    console.log(`Found ${unassignedProjects.length} unassigned project(s) (adminId === null):\n`);

    let totalPlots = 0;
    for (const project of unassignedProjects) {
      const plotCount = await Plot.countDocuments({ projectId: project._id });
      totalPlots += plotCount;
      
      console.log(`  • ${project.customId || project._id} | ${project.title}`);
      console.log(`      city: ${project.city} | status: ${project.status} | approval: ${project.approvalStatus}`);
      console.log(`      branchId: ${project.branchId || "(none)"} | archived: ${project.isArchived}`);
      console.log(`      plots: ${plotCount}`);
      console.log(`      created: ${project.createdAt?.toISOString?.() || project.createdAt}`);
      console.log("");
    }

    console.log(`Total associated plots to be deleted: ${totalPlots}\n`);

    if (!isApply) {
      console.log("--- DRY-RUN ONLY — nothing was modified. ---");
      console.log("To perform the deletion, run: node scripts/removeUnassignedProjects.js --apply\n");
      await mongoose.disconnect();
      return process.exit(0);
    }

    // ── 2. APPLY — delete plots first, then projects ─────────────────────────
    console.log("--- APPLY ---\n");

    const projectIds = unassignedProjects.map((p) => p._id);

    // Delete associated plots
    const plotResult = await Plot.deleteMany({ projectId: { $in: projectIds } });
    console.log(`[PLOTS DELETED] ${plotResult.deletedCount} plot document(s) removed`);

    // Delete the projects
    const projectResult = await Project.deleteMany({ _id: { $in: projectIds } });
    console.log(`[PROJECTS DELETED] ${projectResult.deletedCount} project document(s) removed`);

    console.log(`\n--- Summary ---`);
    console.log(`Projects deleted: ${projectResult.deletedCount}`);
    console.log(`Plots deleted: ${plotResult.deletedCount}`);

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