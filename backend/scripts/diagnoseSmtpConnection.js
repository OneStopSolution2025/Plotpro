import dns from "dns";
import net from "net";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { verifySmtpConnection } from "../utils/smtpEmailService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORTS_TO_PROBE = [465, 587, 2525];
const TIMEOUT_MS = 5000;

/**
 * Resolve DNS for the SMTP host.
 */
function checkDns(host) {
  return new Promise((resolve) => {
    dns.lookup(host, { all: true }, (err, addresses) => {
      if (err) {
        resolve({ success: false, error: err.message, code: err.code });
      } else {
        resolve({ success: true, addresses: addresses.map((a) => a.address) });
      }
    });
  });
}

/**
 * Probe TCP reachability for a host and port.
 */
function probeTcp(host, port, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ port, success: true, message: "Connected successfully (SYN-ACK received)" });
      }
    });

    socket.on("timeout", () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ port, success: false, message: `Connection timed out after ${timeoutMs}ms (SYN packet dropped/blocked)` });
      }
    });

    socket.on("error", (err) => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ port, success: false, message: `Error: ${err.message} (${err.code})` });
      }
    });

    socket.connect(port, host);
  });
}

async function runDiagnostics() {
  console.log("=================================================================");
  console.log("       PLOTPRO OUTBOUND SMTP NETWORK & SERVICE DIAGNOSTIC        ");
  console.log("=================================================================\n");

  console.log(`[1] Environment Inspection:`);
  console.log(`  NODE_ENV:       ${process.env.NODE_ENV || "development"}`);
  console.log(`  SMTP_HOST:      ${SMTP_HOST}`);
  console.log(`  SMTP_PORT:      ${process.env.SMTP_PORT || "465"}`);
  console.log(`  SMTP_USER:      ${process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 3)}***` : "(NOT SET)"}`);
  console.log(`  SMTP_PASS:      ${process.env.SMTP_PASS ? "********" : "(NOT SET)"}`);
  console.log(`  EMAIL_PROVIDER: ${process.env.EMAIL_PROVIDER || "smtp (default)"}`);
  console.log(`  RESEND_API_KEY: ${process.env.RESEND_API_KEY ? "re_********" : "(NOT SET)"}`);

  console.log(`\n[2] DNS Resolution Probe:`);
  const dnsResult = await checkDns(SMTP_HOST);
  if (dnsResult.success) {
    console.log(`  ✓ DNS resolved ${SMTP_HOST} to IP(s): ${dnsResult.addresses.join(", ")}`);
  } else {
    console.error(`  ✗ DNS lookup failed: ${dnsResult.error} (${dnsResult.code})`);
  }

  console.log(`\n[3] Outbound TCP Socket Probes to ${SMTP_HOST} (Timeout: ${TIMEOUT_MS}ms):`);
  for (const port of PORTS_TO_PROBE) {
    const probe = await probeTcp(SMTP_HOST, port);
    if (probe.success) {
      console.log(`  ✓ Port ${port.toString().padEnd(4)}: ${probe.message}`);
    } else {
      console.log(`  ✗ Port ${port.toString().padEnd(4)}: ${probe.message}`);
    }
  }

  console.log(`\n[4] Nodemailer Transporter Verification:`);
  const verifyResult = await verifySmtpConnection();
  if (verifyResult.ok) {
    console.log(`  ✓ SMTP connection & authentication verified successfully.`);
  } else {
    console.log(`  ✗ Verification Failed: [${verifyResult.category}] ${verifyResult.message}`);
    if (verifyResult.category === "NETWORK_FIREWALL_TIMEOUT") {
      console.log(`    -> DIAGNOSIS: Outbound traffic on SMTP ports is blocked by the network/cloud hosting firewall.`);
      console.log(`    -> ACTION: Configure RESEND_API_KEY and set EMAIL_PROVIDER=resend to use port 443 (HTTPS).`);
    }
  }

  console.log("\n=================================================================");
  console.log("                     DIAGNOSTIC COMPLETE                         ");
  console.log("=================================================================\n");
}

runDiagnostics().catch((err) => {
  console.error("Diagnostic error:", err);
  process.exit(1);
});
