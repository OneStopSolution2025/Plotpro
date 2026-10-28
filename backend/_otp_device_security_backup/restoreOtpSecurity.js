import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESTORE_MANIFEST = [
  { backup: "./smtpEmailService.js", target: "../utils/smtpEmailService.js" },
  { backup: "./otpSecurity.js", target: "../utils/otpSecurity.js" },
  { backup: "./deviceSecurity.js", target: "../utils/deviceSecurity.js" },
  { backup: "./deviceAuthController.js", target: "../controllers/deviceAuthController.js" },
  { backup: "./testDeviceSecurity.js", target: "../scripts/testDeviceSecurity.js" },
  { backup: "./testSmtpService.js", target: "../scripts/testSmtpService.js" },
  { backup: "./diagnoseSmtpConnection.js", target: "../scripts/diagnoseSmtpConnection.js" },
];

export async function restoreOtpSecurity(options = {}) {
  const isDryRun = options.dryRun || process.argv.includes("--dry-run");
  const skipTests = options.skipTests || process.argv.includes("--skip-tests");

  console.log("=================================================================");
  console.log("          PLOTPRO OTP & DEVICE SECURITY RESTORATION RUNNER       ");
  console.log("=================================================================\n");

  if (isDryRun) {
    console.log("[DRY-RUN MODE] No files will be modified. Simulating restore process...\n");
  }

  // 1. Create Pre-Restore Safety Snapshot Directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotDir = path.resolve(__dirname, `../.restore_safety_snapshots/${timestamp}`);

  if (!isDryRun) {
    fs.mkdirSync(snapshotDir, { recursive: true });
    console.log(`[Step 1] Created pre-restore safety snapshot directory:`);
    console.log(`         ${snapshotDir}`);

    for (const item of RESTORE_MANIFEST) {
      const targetPath = path.resolve(__dirname, item.target);
      if (fs.existsSync(targetPath)) {
        const destSnapshotPath = path.join(snapshotDir, path.basename(item.target));
        fs.copyFileSync(targetPath, destSnapshotPath);
      }
    }
    console.log(`         ✓ Safety snapshot completed for existing files.\n`);
  } else {
    console.log(`[Step 1] (Dry-Run) Pre-restore snapshot would be written to: ${snapshotDir}\n`);
  }

  // 2. Perform File Restoration
  console.log(`[Step 2] Restoring core security files from backup:`);
  for (const item of RESTORE_MANIFEST) {
    const backupPath = path.resolve(__dirname, item.backup);
    const targetPath = path.resolve(__dirname, item.target);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file missing: ${item.backup}`);
    }

    if (!isDryRun) {
      fs.copyFileSync(backupPath, targetPath);
      console.log(`         ✓ Restored: ${item.target}`);
    } else {
      console.log(`         (Dry-Run) Would restore: ${item.backup} -> ${item.target}`);
    }
  }

  if (isDryRun) {
    console.log("\n[Dry-Run Complete] All backup files are valid and ready to restore.\n");
    return true;
  }

  // 3. Post-Restore Verification Test Suite Execution
  if (!skipTests) {
    console.log("\n[Step 3] Running automated post-restore verification test suites...\n");
    try {
      console.log("--- Running testSmtpService.js ---");
      execSync("node backend/scripts/testSmtpService.js", { stdio: "inherit" });

      console.log("\n--- Running testDeviceSecurity.js ---");
      execSync("node backend/scripts/testDeviceSecurity.js", { stdio: "inherit" });

      console.log("\n=================================================================");
      console.log("✅ RESTORATION AND VERIFICATION COMPLETED WITH 100% PASSING TESTS!");
      console.log("=================================================================\n");
      return true;
    } catch (testErr) {
      console.error("\n❌ POST-RESTORE TESTS FAILED:", testErr.message);
      console.error("You can revert immediately using the snapshot at:", snapshotDir);
      throw testErr;
    }
  }

  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  restoreOtpSecurity().catch((err) => {
    console.error("Restoration aborted:", err.message);
    process.exit(1);
  });
}
