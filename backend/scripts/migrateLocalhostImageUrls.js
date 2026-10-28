import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getUploadDir } from "../config/storageConfig.js";

// Load environment variables
dotenv.config({ path: "backend/.env" });

const args = process.argv.slice(2);
const isLive = args.includes("--live");
const isBackup = args.includes("--backup") || isLive;
const isDryRun = !isLive;

console.log("==========================================================");
console.log("  PlotPro Image URL Normalization Migration Script");
console.log(`  Mode: ${isDryRun ? "DRY-RUN (Safe: NO writes)" : "LIVE EXECUTION (WILL MODIFY DATABASE)"}`);
console.log(`  Backup: ${isBackup ? "ENABLED" : "DISABLED"}`);
console.log("==========================================================\n");

function normalizeUploadUrl(val) {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  // Strip http://localhost:<port>/uploads/ or https://localhost:<port>/uploads/
  const m = trimmed.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/uploads\/.+)$/i);
  if (m && m[3]) {
    return m[3];
  }
  return val;
}

function isLocalhostUploadUrl(val) {
  if (typeof val !== "string") return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/uploads\//i.test(val.trim());
}

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("FATAL: MONGODB_URI is not set in environment.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const uploadRoot = getUploadDir();

  console.log(`Connected to MongoDB. Target collections: 'projects', 'plots'`);
  console.log(`Persistent storage root: ${uploadRoot}\n`);

  const report = {
    projectsScanned: 0,
    projectsToUpdate: 0,
    plotsScanned: 0,
    plotsToUpdate: 0,
    filesFoundOnDisk: 0,
    filesMissingOnDisk: 0,
    missingFilesList: [],
    plannedProjectUpdates: [],
    plannedPlotUpdates: [],
  };

  // 1. SCAN PROJECTS
  const projects = await db.collection("projects").find({}).toArray();
  report.projectsScanned = projects.length;

  for (const p of projects) {
    const fieldsToUpdate = {};
    const checkFile = (rawVal, fieldName) => {
      if (isLocalhostUploadUrl(rawVal)) {
        const normalized = normalizeUploadUrl(rawVal);
        fieldsToUpdate[fieldName] = normalized;

        const relPath = normalized.replace(/^\/uploads\//, "");
        const diskPath = path.join(uploadRoot, relPath);
        if (fs.existsSync(diskPath)) {
          report.filesFoundOnDisk++;
        } else {
          report.filesMissingOnDisk++;
          report.missingFilesList.push({ coll: "projects", id: p._id, field: fieldName, path: diskPath });
        }
      }
    };

    if (p.image) checkFile(p.image, "image");
    if (p.layout?.imageUrl) checkFile(p.layout.imageUrl, "layout.imageUrl");
    if (p.layout?.referenceImageUrl) checkFile(p.layout.referenceImageUrl, "layout.referenceImageUrl");

    if (Array.isArray(p.images)) {
      let arrayChanged = false;
      const updatedArray = p.images.map((img, idx) => {
        if (isLocalhostUploadUrl(img)) {
          arrayChanged = true;
          const normalized = normalizeUploadUrl(img);
          const relPath = normalized.replace(/^\/uploads\//, "");
          const diskPath = path.join(uploadRoot, relPath);
          if (fs.existsSync(diskPath)) report.filesFoundOnDisk++;
          else {
            report.filesMissingOnDisk++;
            report.missingFilesList.push({ coll: "projects", id: p._id, field: `images[${idx}]`, path: diskPath });
          }
          return normalized;
        }
        return img;
      });
      if (arrayChanged) {
        fieldsToUpdate.images = updatedArray;
      }
    }

    if (Object.keys(fieldsToUpdate).length > 0) {
      report.projectsToUpdate++;
      report.plannedProjectUpdates.push({
        _id: p._id,
        customId: p.customId,
        title: p.title,
        fieldsToUpdate,
      });
    }
  }

  // 2. SCAN PLOTS
  const plots = await db.collection("plots").find({}).toArray();
  report.plotsScanned = plots.length;

  for (const pl of plots) {
    const fieldsToUpdate = {};
    const checkFile = (rawVal, fieldName) => {
      if (isLocalhostUploadUrl(rawVal)) {
        const normalized = normalizeUploadUrl(rawVal);
        fieldsToUpdate[fieldName] = normalized;

        const relPath = normalized.replace(/^\/uploads\//, "");
        const diskPath = path.join(uploadRoot, relPath);
        if (fs.existsSync(diskPath)) {
          report.filesFoundOnDisk++;
        } else {
          report.filesMissingOnDisk++;
          report.missingFilesList.push({ coll: "plots", id: pl._id, field: fieldName, path: diskPath });
        }
      }
    };

    if (pl.image) checkFile(pl.image, "image");

    if (Array.isArray(pl.images)) {
      let arrayChanged = false;
      const updatedArray = pl.images.map((img, idx) => {
        if (isLocalhostUploadUrl(img)) {
          arrayChanged = true;
          const normalized = normalizeUploadUrl(img);
          const relPath = normalized.replace(/^\/uploads\//, "");
          const diskPath = path.join(uploadRoot, relPath);
          if (fs.existsSync(diskPath)) report.filesFoundOnDisk++;
          else {
            report.filesMissingOnDisk++;
            report.missingFilesList.push({ coll: "plots", id: pl._id, field: `images[${idx}]`, path: diskPath });
          }
          return normalized;
        }
        return img;
      });
      if (arrayChanged) {
        fieldsToUpdate.images = updatedArray;
      }
    }

    if (Object.keys(fieldsToUpdate).length > 0) {
      report.plotsToUpdate++;
      report.plannedPlotUpdates.push({
        _id: pl._id,
        customId: pl.customId,
        fieldsToUpdate,
      });
    }
  }

  // PRINT SUMMARY
  console.log("------------------ SCAN REPORT ------------------");
  console.log(`Projects scanned:  ${report.projectsScanned} (To update: ${report.projectsToUpdate})`);
  console.log(`Plots scanned:     ${report.plotsScanned} (To update: ${report.plotsToUpdate})`);
  console.log(`Files on disk:     ${report.filesFoundOnDisk} verified`);
  console.log(`Files missing:     ${report.filesMissingOnDisk}`);
  if (report.missingFilesList.length > 0) {
    console.warn("WARNING: The following referenced files were not found on disk:");
    report.missingFilesList.forEach((m) => console.warn(`   - [${m.coll}] ID ${m.id} ${m.field}: ${m.path}`));
  }
  console.log("-------------------------------------------------\n");

  if (report.projectsToUpdate === 0 && report.plotsToUpdate === 0) {
    console.log("SUCCESS: No localhost image URLs found in MongoDB! Database is already clean.");
    await mongoose.disconnect();
    return;
  }

  // BACKUP STEP
  if (isBackup) {
    const backupDir = path.resolve("backend/scripts/_backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `backup_image_urls_${Date.now()}.json`);
    const backupData = {
      timestamp: new Date().toISOString(),
      projects: projects.filter((p) => report.plannedProjectUpdates.some((u) => u._id.equals(p._id))),
      plots: plots.filter((pl) => report.plannedPlotUpdates.some((u) => u._id.equals(pl._id))),
    };
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), "utf8");
    console.log(`Created pre-migration backup at: ${backupFile}`);
  }

  // EXECUTE LIVE OR DRY-RUN
  if (isDryRun) {
    console.log("\n[DRY RUN COMPLETE] To execute these changes on the database, rerun with --live:");
    console.log("  node --env-file=backend/.env backend/scripts/migrateLocalhostImageUrls.js --live\n");
    await mongoose.disconnect();
    return;
  }

  console.log("\n[LIVE MODE] Applying database updates...");

  // Write Project Updates
  for (const update of report.plannedProjectUpdates) {
    const setQuery = {};
    for (const [k, v] of Object.entries(update.fieldsToUpdate)) {
      setQuery[k] = v;
    }
    await db.collection("projects").updateOne({ _id: update._id }, { $set: setQuery });
    console.log(`   Updated project: ${update._id} (${update.title || update.customId})`);
  }

  // Write Plot Updates
  for (const update of report.plannedPlotUpdates) {
    const setQuery = {};
    for (const [k, v] of Object.entries(update.fieldsToUpdate)) {
      setQuery[k] = v;
    }
    await db.collection("plots").updateOne({ _id: update._id }, { $set: setQuery });
    console.log(`   Updated plot: ${update._id} (${update.customId})`);
  }

  console.log("\n[LIVE MIGRATION COMPLETE] Re-verifying database clean status...");

  const remainingProjects = await db.collection("projects").countDocuments({
    $or: [
      { image: { $regex: "localhost" } },
      { images: { $elemMatch: { $regex: "localhost" } } },
      { "layout.imageUrl": { $regex: "localhost" } },
      { "layout.referenceImageUrl": { $regex: "localhost" } },
    ],
  });

  const remainingPlots = await db.collection("plots").countDocuments({
    $or: [
      { image: { $regex: "localhost" } },
      { images: { $elemMatch: { $regex: "localhost" } } },
    ],
  });

  console.log(`Verification: Remaining localhost URLs in projects: ${remainingProjects}`);
  console.log(`Verification: Remaining localhost URLs in plots: ${remainingPlots}`);

  if (remainingProjects === 0 && remainingPlots === 0) {
    console.log("\n🎉 ALL TARGETED LOCALHOST URLS HAVE BEEN SAFELY NORMALIZED!");
  } else {
    console.warn("\n⚠️ Some localhost URLs could not be converted automatically. Please inspect manually.");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration fatal error:", err);
  process.exit(1);
});
