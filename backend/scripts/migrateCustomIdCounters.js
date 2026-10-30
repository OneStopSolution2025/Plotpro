/**
 * PlotPro — Custom ID counter migration script.
 *
 * Seeds the Counter collection with sequence values derived from existing
 * Project and Plot records, so that Stage 2 runtime code can use atomic
 * $inc-based counter generation without ever generating duplicate or reused
 * customIds.
 *
 * Safety guarantees:
 *   - Never modifies existing Project or Plot records.
 *   - Only raises counter values (never decreases).
 *   - Idempotent: safe to re-run.
 *   - Defaults to dry-run mode; changes only with --execute.
 *   - Never runs automatically during server startup.
 *
 * Usage:
 *   node scripts/migrateCustomIdCounters.js          # dry-run (default)
 *   node scripts/migrateCustomIdCounters.js --execute # apply counter seeds
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import { Counter } from "../models/Counter.js";
import { initializeCounter } from "../utils/counterHelper.js";
import { connectDB } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const pass = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => console.error(`  ✗ ${msg}`);
const info = (msg) => console.log(`  • ${msg}`);

const isDryRun =
  process.argv.includes("--dry-run") ||
  process.argv.includes("-n") ||
  !process.argv.includes("--execute");

const report = {
  mode: isDryRun ? "DRY-RUN" : "EXECUTE",
  projectCounter: { existingMax: null, targetSeq: null, initialized: false },
  plotCounters: [],
  mismatches: [],
  errors: [],
};

async function main() {
  try {
    await connectDB();

    // ── 1. Project counter: seed above highest existing numeric Project customId ──
    log("Scanning Project.customId values...");
    const maxProject = await Project.findOne({
      customId: { $exists: true, $type: "number" },
    })
      .sort({ customId: -1 })
      .select("customId")
      .lean();

    const existingProjectMax = maxProject ? maxProject.customId : 0;
    report.projectCounter.existingMax = existingProjectMax;
    report.projectCounter.targetSeq = existingProjectMax;

    log(`Highest existing Project customId: ${existingProjectMax || "none (starting at 0)"}`);

    if (isDryRun) {
      info(`[DRY-RUN] Would initialize project counter "project:customId" to seq >= ${existingProjectMax}`);
    } else {
      await initializeCounter("project:customId", existingProjectMax);
      report.projectCounter.initialized = true;
      pass(`Project counter "project:customId" initialized to seq >= ${existingProjectMax}`);
    }

    // ── 2. Load all projects for labeling ──
    const allProjects = await Project.find({}).select("_id customId title").lean();
    const projectsMap = new Map();
    for (const p of allProjects) {
      projectsMap.set(String(p._id), p);
    }

    // ── 3. Plot counters: per-project, seed above highest numeric customId suffix ──
    log("Scanning Plot.customId values per project...");
    const plots = await Plot.find({
      customId: { $exists: true, $type: "string" },
    })
      .select("customId projectId plotNumber _id")
      .lean();

    const byProject = new Map();
    for (const plot of plots) {
      const projectIdStr = String(plot.projectId);
      if (!byProject.has(projectIdStr)) {
        byProject.set(projectIdStr, []);
      }
      byProject.get(projectIdStr).push(plot);
    }

    log(`Found plots across ${byProject.size} projects`);

    const projectsWithPlots = new Set(byProject.keys());

    for (const [projectIdStr, projectPlots] of byProject) {
      const projectDoc = projectsMap.get(projectIdStr);
      const projectLabel = projectDoc
        ? `${projectDoc.title} (customId: ${projectDoc.customId})`
        : projectIdStr;

      let maxSuffix = 0;
      let hasMismatch = false;

      for (const plot of projectPlots) {
        const customIdStr = String(plot.customId);
        // Extract numeric suffix after the last "-"
        const lastDash = customIdStr.lastIndexOf("-");
        const suffixStr = lastDash === -1 ? customIdStr : customIdStr.slice(lastDash + 1);
        const suffixNum = Number.isFinite(Number(suffixStr)) && suffixStr !== "" ? Number(suffixStr) : null;

        const plotNumberNum = Number.isFinite(Number(plot.plotNumber)) ? Number(plot.plotNumber) : null;

        if (suffixNum !== null && suffixNum > maxSuffix) {
          maxSuffix = suffixNum;
        }

        // Compare customId suffix with plotNumber; report but do not auto-correct
        if (suffixNum !== null && plotNumberNum !== null && suffixNum !== plotNumberNum) {
          hasMismatch = true;
          report.mismatches.push({
            plotId: String(plot._id),
            projectId: projectIdStr,
            customId: customIdStr,
            suffix: suffixNum,
            plotNumber: plotNumberNum,
          });
        }
      }

      const targetSeq = maxSuffix;
      report.plotCounters.push({
        projectId: projectIdStr,
        projectLabel,
        existingMaxSuffix: maxSuffix,
        targetSeq,
        hasMismatch,
      });

      if (isDryRun) {
        info(`[DRY-RUN] Would initialize plot counter "plot:${projectIdStr}" to seq >= ${maxSuffix} — ${projectLabel}`);
        if (hasMismatch) {
          fail(`  Mismatches between customId suffix and plotNumber detected for project ${projectIdStr}`);
        }
      } else {
        await initializeCounter(`plot:${projectIdStr}`, maxSuffix);
        pass(`Plot counter "plot:${projectIdStr}" initialized to seq >= ${maxSuffix} — ${projectLabel}`);
        if (hasMismatch) {
          fail(`  Mismatches between customId suffix and plotNumber detected for project ${projectIdStr} (reported above, not auto-corrected)`);
        }
      }
    }

    // ── 4. Projects with no plots: initialize counter to 0 ──
    for (const p of allProjects) {
      if (!projectsWithPlots.has(String(p._id))) {
        report.plotCounters.push({
          projectId: String(p._id),
          projectLabel: `${p.title} (customId: ${p.customId}) — no existing plots`,
          existingMaxSuffix: 0,
          targetSeq: 0,
          hasMismatch: false,
        });

        if (isDryRun) {
          info(`[DRY-RUN] Would initialize plot counter for project ${String(p._id)} to seq 0 — no existing plots`);
        } else {
          await initializeCounter(`plot:${String(p._id)}`, 0);
          pass(`Plot counter initialized to seq 0 — ${p.title} (no existing plots)`);
        }
      }
    }

    // ── Summary ──
    log("\n=== MIGRATION REPORT ===");
    log(`Mode: ${report.mode}`);
    log(`Project counter target seq: ${report.projectCounter.targetSeq}`);
    log(`Plot counters to initialize: ${report.plotCounters.length}`);
    log(`Mismatches reported: ${report.mismatches.length}`);

    if (report.mismatches.length > 0) {
      fail("customId suffix / plotNumber mismatches detected — review before Stage 2 runtime changes:");
      for (const m of report.mismatches) {
        log(`  Plot ${m.plotId}: customId="${m.customId}" suffix=${m.suffix} plotNumber=${m.plotNumber} (project: ${m.projectId})`);
      }
    }

    if (isDryRun) {
      info("Dry-run complete. No records were modified.");
      info("Re-run with --execute to apply counter seeds to the Counter collection.");
    } else {
      pass("Migration executed. Counters seeded. No Project or Plot records were modified.");
    }
  } catch (err) {
    report.errors.push(err.message);
    fail(`Fatal error: ${err.message}`);
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

main();
