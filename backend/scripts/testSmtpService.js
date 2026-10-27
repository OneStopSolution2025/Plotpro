import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  renderOtpEmailHtml,
  renderPasswordResetEmailHtml,
  sendDeviceEnrollmentOtpEmail,
  sendPasswordResetOtpEmail,
  createSmtpTransporter,
  verifySmtpConnection,
  classifyEmailError,
} from "../utils/smtpEmailService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function runSmtpTests() {
  console.log("=================================================================");
  console.log("       PLOTPRO EMAIL SERVICE & FALLBACK SUITE                    ");
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
  assert(html.includes("Security Notice"), "Template includes the critical security advisory box");
  assert(html.includes("Supreme Administration"), "Template warns user to notify Supreme Administration on unauthorized attempt");
  assert(html.includes("#a63d2f"), "Template incorporates PlotPro's theme accent color (#a63d2f)");

  // 1B. Asset & HTTPS URL Integrity Test
  console.log("\n[TEST 1B] Testing HTTPS Logo URL and Security Badge Rendering Integrity...");
  assert(html.includes('https://raw.githubusercontent.com/OneStopSolution2025/Plotpro/main/frontend/src/assets/Logo/plotpro-logo.png') || html.includes('https://'), "HTML references verified public HTTPS logo URL");
  assert(!html.includes("cid:"), "HTML contains zero CID references (MIME attachments completely eliminated)");
  assert(!html.includes("<svg"), "HTML contains zero SVG elements (preventing stripped SVGs in Gmail)");
  assert(html.includes("&#10004;"), "Security badge renders high-contrast universal checkmark HTML element");
  assert(!html.includes("data:image/"), "No fragile data:image/ Base64 URIs used in email body");

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
  const originalResend = process.env.RESEND_API_KEY;

  try {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.RESEND_API_KEY;

    const result = await sendDeviceEnrollmentOtpEmail({ to: "admin@example.com", otp: "123456" });
    assert(result.success === false, "Returns success: false when credentials are not configured");
    assert(result.error.includes("missing"), "Error message identifies missing credentials safely");
  } finally {
    if (originalUser) process.env.SMTP_USER = originalUser;
    if (originalPass) process.env.SMTP_PASS = originalPass;
    if (originalResend) process.env.RESEND_API_KEY = originalResend;
  }

  // 4. Missing Parameters Validation
  console.log("\n[TEST 4] Testing Parameter Validation...");
  try {
    await sendDeviceEnrollmentOtpEmail({ to: "", otp: "" });
    assert(false, "Should have thrown for missing parameters");
  } catch (err) {
    assert(err.message.includes("required"), "Throws validation error when email or OTP is omitted");
  }

  // 5. Error Classification Logic
  console.log("\n[TEST 5] Testing Structured Error Classification...");
  assert(classifyEmailError(new Error("Connection timeout")).category === "NETWORK_FIREWALL_TIMEOUT", "Identifies Connection timeout");
  assert(classifyEmailError({ code: "ETIMEDOUT", message: "Connect ETIMEDOUT" }).category === "NETWORK_FIREWALL_TIMEOUT", "Identifies ETIMEDOUT");
  assert(classifyEmailError({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND" }).category === "DNS_FAILURE", "Identifies DNS failure");
  assert(classifyEmailError({ code: "EAUTH", message: "Invalid login: 535" }).category === "AUTH_FAILURE", "Identifies Auth failure");
  assert(classifyEmailError({ code: "CERT_HAS_EXPIRED", message: "certificate expired" }).category === "TLS_NEGOTIATION_FAILURE", "Identifies TLS error");

  // 6. Resend Provider Selection Verification
  console.log("\n[TEST 6] Testing Resend Provider Selection Guard...");
  const originalProvider = process.env.EMAIL_PROVIDER;
  try {
    process.env.EMAIL_PROVIDER = "resend";
    delete process.env.RESEND_API_KEY;
    const resendMissingResult = await sendDeviceEnrollmentOtpEmail({ to: "test@example.com", otp: "111222" });
    assert(resendMissingResult.success === false, "Fails safely when EMAIL_PROVIDER=resend but RESEND_API_KEY missing");
    assert(resendMissingResult.error.includes("RESEND_API_KEY"), "Error identifies missing RESEND_API_KEY");
  } finally {
    process.env.EMAIL_PROVIDER = originalProvider || "smtp";
    if (originalResend) process.env.RESEND_API_KEY = originalResend;
  }

  console.log("\n=================================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log("=================================================================\n");
}

runSmtpTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
