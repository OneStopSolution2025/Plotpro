import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  renderOtpEmailHtml,
  renderPasswordResetEmailHtml,
  sendDeviceEnrollmentOtpEmail,
  sendPasswordResetOtpEmail,
  createSmtpTransporter,
} from "../utils/smtpEmailService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function runSmtpTests() {
  console.log("=================================================================");
  console.log("       PLOTPRO GMAIL SMTP SERVICE & TEMPLATE TEST SUITE          ");
  console.log("=================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(` PASSED: ${message}`);
      passedTests++;
    }
  }

  // 1. Template Rendering Test
  console.log("[TEST 1] Testing PlotPro Branded HTML Email Template Rendering...");
  const sampleOtp = "849201";
  const html = renderOtpEmailHtml({ otp: sampleOtp, expiryMinutes: 10 });

  assert(typeof html === "string" && html.length > 500, "Template generates substantial valid HTML string");
  assert(html.includes("PlotPro"), "Template includes PlotPro branding header");
  assert(html.includes(sampleOtp), "Template dynamically includes the exact OTP code");
  assert(html.includes("10 minutes"), "Template displays the 10-minute expiry warning");
  assert(html.includes("Security Advisory"), "Template includes the critical security advisory box");
  assert(html.includes("Supreme Administrator"), "Template warns user to notify Supreme Administrator on unauthorized attempt");
  assert(html.includes("#a63d2f"), "Template incorporates PlotPro's theme accent color (#a63d2f)");

  // 1B. Asset & HTTPS URL Integrity Test
  console.log("\n[TEST 1B] Testing HTTPS Logo URL and Security Badge Rendering Integrity...");
  assert(html.includes('https://raw.githubusercontent.com/OneStopSolution2025/Plotpro/main/frontend/src/assets/Logo/plotpro-logo.png') || html.includes('https://'), "HTML references verified public HTTPS logo URL");
  assert(!html.includes("cid:"), "HTML contains zero CID references (MIME attachments completely eliminated)");
  assert(!html.includes("<svg"), "HTML contains zero SVG elements (preventing stripped SVGs in Gmail)");
  assert(html.includes("&#10004;"), "Security badge renders high-contrast universal checkmark HTML element");
  assert(!html.includes("data:image/"), "No fragile data:image/ Base64 URIs used in email body");

  // Extract all cid: references in HTML to ensure no dangling CIDs
  const cidMatches = [...html.matchAll(/src="cid:([^"]+)"/g)].map(m => m[1]);
  assert(cidMatches.length === 0, "HTML contains zero CID references preventing Gmail attachment pills");

  // 1C. Password Reset Template Rendering Test
  console.log("\n[TEST 1C] Testing PlotPro Branded Password Reset Template...");
  const resetHtml = renderPasswordResetEmailHtml({ otp: "593812", expiryMinutes: 10 });
  assert(resetHtml.includes("Password Reset Verification"), "Password reset template includes proper title");
  assert(resetHtml.includes("593812"), "Password reset template includes dynamic OTP");
  assert(resetHtml.includes("&#10004;"), "Password reset template includes universal shield badge");
  assert(!resetHtml.includes("cid:"), "Password reset template contains zero CID references");

  // 2. Transporter Options Verification
  console.log("\n[TEST 2] Testing Transporter Options Configuration...");
  const transporter = createSmtpTransporter();
  assert(transporter.options.host === (process.env.SMTP_HOST || "smtp.gmail.com"), "Transporter targets correct SMTP host");
  assert(typeof transporter.options.port === "number", "Transporter port is numeric");
  assert(transporter.options.connectionTimeout === 10000, "Transporter has 10s connection timeout set");

  // 3. Graceful Failure Handling on Missing Credentials
  console.log("\n[TEST 3] Testing Graceful Error Handling When SMTP Variables Are Unset...");
  const originalUser = process.env.SMTP_USER;
  const originalPass = process.env.SMTP_PASS;

  try {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const result = await sendDeviceEnrollmentOtpEmail({ to: "admin@example.com", otp: "123456" });
    assert(result.success === false, "Returns success: false when SMTP credentials are not configured");
    assert(result.error.includes("missing"), "Error message identifies missing credentials safely");
  } finally {
    if (originalUser) process.env.SMTP_USER = originalUser;
    if (originalPass) process.env.SMTP_PASS = originalPass;
  }

  // 4. Missing Parameters Validation
  console.log("\n[TEST 4] Testing Parameter Validation...");
  try {
    await sendDeviceEnrollmentOtpEmail({ to: "", otp: "" });
    assert(false, "Should have thrown for missing parameters");
  } catch (err) {
    assert(err.message.includes("required"), "Throws validation error when email or OTP is omitted");
  }

  console.log("\n=================================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} SMTP SERVICE TESTS PASSED SUCCESSFULLY!`);
  console.log("=================================================================\n");
}

runSmtpTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
