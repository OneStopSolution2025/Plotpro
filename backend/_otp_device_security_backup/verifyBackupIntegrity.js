import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_MANIFEST = [
  { source: "../utils/smtpEmailService.js", backup: "./smtpEmailService.js" },
  { source: "../utils/otpSecurity.js", backup: "./otpSecurity.js" },
  { source: "../utils/deviceSecurity.js", backup: "./deviceSecurity.js" },
  { source: "../controllers/deviceAuthController.js", backup: "./deviceAuthController.js" },
  { source: "../scripts/testDeviceSecurity.js", backup: "./testDeviceSecurity.js" },
  { source: "../scripts/testSmtpService.js", backup: "./testSmtpService.js" },
  { source: "../scripts/diagnoseSmtpConnection.js", backup: "./diagnoseSmtpConnection.js" },
];

function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

export function verifyBackupIntegrity() {
  console.log("=== Verifying OTP Backup Integrity (SHA-256 Checksums) ===");
  let allMatched = true;

  for (const item of BACKUP_MANIFEST) {
    const srcPath = path.resolve(__dirname, item.source);
    const bkpPath = path.resolve(__dirname, item.backup);

    if (!fs.existsSync(srcPath)) {
      console.error(`✗ Source file missing: ${item.source}`);
      allMatched = false;
      continue;
    }

    if (!fs.existsSync(bkpPath)) {
      console.error(`✗ Backup file missing: ${item.backup}`);
      allMatched = false;
      continue;
    }

    const srcHash = computeSha256(srcPath);
    const bkpHash = computeSha256(bkpPath);

    if (srcHash === bkpHash) {
      console.log(`✓ [MATCH] ${path.basename(item.backup)} (${srcHash.substring(0, 12)}...)`);
    } else {
      console.error(`✗ [MISMATCH] ${path.basename(item.backup)}!`);
      console.error(`    Source: ${srcHash}`);
      console.error(`    Backup: ${bkpHash}`);
      allMatched = false;
    }
  }

  if (allMatched) {
    console.log("\nALL BACKUP FILES VERIFIED WITH 100% CRYPTOGRAPHIC INTEGRITY! ✓\n");
    return true;
  } else {
    console.error("\nBACKUP VERIFICATION FAILED! ✗\n");
    return false;
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = verifyBackupIntegrity();
  process.exit(ok ? 0 : 1);
}
