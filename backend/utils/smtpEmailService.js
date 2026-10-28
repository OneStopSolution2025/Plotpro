import nodemailer from "nodemailer";
import { Resend } from "resend";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PUBLIC_LOGO_URL =
  "https://raw.githubusercontent.com/OneStopSolution2025/Plotpro/main/frontend/src/assets/Logo/plotpro-logo.png";

/**
 * Classifies email dispatch and SMTP connection errors into structured categories.
 */
export const classifyEmailError = (error) => {
  if (!error) return { category: "UNKNOWN", message: "Unknown error" };

  const message = String(error.message || error);
  const code = String(error.code || "");

  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || message.includes("getaddrinfo")) {
    return { category: "DNS_FAILURE", message: "DNS resolution failed for mail server host." };
  }

  if (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "ECONNRESET" ||
    message.includes("Connection timeout") ||
    message.includes("Greeting never received") ||
    message.includes("timed out")
  ) {
    return {
      category: "NETWORK_FIREWALL_TIMEOUT",
      message: "Connection timed out. Outbound TCP port likely blocked or dropped by cloud hosting firewall.",
    };
  }

  if (
    code.startsWith("CERT_") ||
    code.startsWith("UNABLE_TO_") ||
    code.startsWith("DEPTH_ZERO_") ||
    message.includes("handshake") ||
    message.includes("SSL") ||
    message.includes("TLS")
  ) {
    return { category: "TLS_NEGOTIATION_FAILURE", message: "TLS handshake failed or certificate rejected." };
  }

  if (code === "EAUTH" || message.includes("535") || message.includes("Username and Password not accepted")) {
    return { category: "AUTH_FAILURE", message: "Authentication failed. Check SMTP username and app password." };
  }

  if (message.includes("421") || message.includes("550") || message.includes("rate limit") || message.includes("blocked")) {
    return { category: "PROVIDER_REJECTION", message: "Mail provider rejected the connection or rate-limited requests." };
  }

  return { category: "GENERAL_ERROR", message: message.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]") };
};

/**
 * Creates and returns a configured Nodemailer transporter using Gmail SMTP.
 */
export const createSmtpTransporter = () => {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for port 465, false for 587
    auth: {
      user,
      pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
};

/**
 * Verifies SMTP connection health with structured error reporting.
 */
export const verifySmtpConnection = async () => {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return {
      ok: false,
      category: "MISSING_CONFIG",
      message: "SMTP_USER or SMTP_PASS environment variable is not set.",
    };
  }

  try {
    const transporter = createSmtpTransporter();
    await transporter.verify();
    return { ok: true, message: "SMTP connection and credentials verified successfully." };
  } catch (err) {
    const classified = classifyEmailError(err);
    return {
      ok: false,
      category: classified.category,
      message: classified.message,
    };
  }
};

/**
 * Sends an email via Resend HTTPS REST API.
 */
async function sendViaResend({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is missing.");
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM || process.env.RESEND_FROM || "PlotPro Security <onboarding@resend.dev>";

  const payload = {
    from,
    to: [to],
    subject,
    html,
    text,
  };

  const { data, error } = await resend.emails.send(payload);

  if (error) {
    const errMsg = error.message || "Failed to dispatch email via Resend API.";
    throw new Error(`Resend API Error: ${errMsg}`);
  }

  return { success: true, messageId: data?.id || "resend-dispatched" };
}

/**
 * Generates responsive, PlotPro-branded HTML email template for device enrollment OTP.
 */
export const renderOtpEmailHtml = ({ otp, expiryMinutes = 10 }) => {
  const logoUrl = process.env.PLOTPRO_PUBLIC_LOGO_URL || DEFAULT_PUBLIC_LOGO_URL;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="EN">
<head>
  <title>PlotPro Workstation Enrollment Verification</title>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css?family=Instrument+Sans:300,400,600,700,800" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css?family=Rethink+Sans:300,400,600,700,800" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css?family=Inter:300,400,600,700,800" rel="stylesheet">
  <style type="text/css">
   html, body { Margin: 0 auto !important; padding: 0 !important; width: 100% !important; height: 100% !important; }
   * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; text-rendering: optimizeLegibility; }
   table { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
   td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f0f0f0; font-family:'Rethink Sans', Helvetica, Arial, sans-serif;">
  <table class="em_full_wrap" style="background-color:#f0f0f0;" width="100%" border="0" cellspacing="0" cellpadding="0" align="center">
   <tr>
    <td align="center" valign="top">
     <table align="center" class="em_main_table" width="600" border="0" cellspacing="0" cellpadding="0" style="table-layout:fixed; background-color: #ffffff; border-radius: 8px; overflow: hidden; margin-top: 30px; margin-bottom: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
      <tr>
       <td>
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
         <tr>
          <td bgcolor="#121d31" style="border-bottom: 3px solid #a63d2f; padding-top: 22px; padding-bottom: 22px;">
           <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
             <td align="center">
               <img src="${logoUrl}" alt="PlotPro" width="130" style="display: block; width: 130px; max-width: 130px; height: auto; border: 0; outline: none; margin: 0 auto;" />
             </td>
            </tr>
           </table>
          </td>
         </tr>
         <tr>
          <td style="padding: 30px 40px;">
           <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
             <td align="center">
               <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                 <tr>
                   <td align="center" valign="middle" style="width: 76px; height: 76px; background-color: #fbf2f0; border: 2px solid #f3d4ce; border-radius: 50%; text-align: center;">
                     <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                       <tr>
                         <td align="center" valign="middle" style="width: 42px; height: 46px; background-color: #a63d2f; border-radius: 4px 4px 21px 21px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
                           <span style="font-family: Arial, Helvetica, sans-serif; font-size: 24px; color: #ffffff; font-weight: bold; line-height: 46px; display: block; margin: 0 auto;">&#10004;</span>
                         </td>
                       </tr>
                     </table>
                   </td>
                 </tr>
               </table>
             </td>
            </tr>
            <tr><td height="20" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr>
             <td style="font-family:'Rethink Sans', Arial, sans-serif; font-size:24px; text-align:center; color:#000000; font-weight:700; line-height:36px;">
               Workstation Enrollment Verification
             </td>
            </tr>
            <tr><td height="12" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr>
             <td style="font-family:'Rethink Sans', Arial, sans-serif; font-size:14px; text-align:center; color:#4a5568; font-weight:400; line-height: 24px;">
               An unrecognized browser or workstation has initiated authentication for your PlotPro administrative account. To verify and enroll this device, enter the single-use authorization code below:
             </td>
            </tr>
            <tr><td height="28" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr>
             <td bgcolor="#EFF2F1" style="font-family:'Instrument Sans', Arial, sans-serif; font-size:36px; text-align:center; color:#0f172a; font-weight:800; line-height: 44px; padding-top: 24px; padding-bottom: 24px; letter-spacing: 12px; border-radius: 8px; border: 1px solid #dcdfdc;">
               ${otp}
             </td>
            </tr>
            <tr><td height="28" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr>
             <td style="font-family:'Inter', Arial, sans-serif; font-size:13.5px; text-align:center; color:#70818D; font-weight:400; line-height: 22px;">
               <strong>Security Notice:</strong> This code is valid for <strong>${expiryMinutes} minutes</strong> and can only be used once. If you did not initiate this login request, please contact Supreme Administration immediately.
             </td>
            </tr>
            <tr><td height="24" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr><td height="1" bgcolor="#E2E8F0" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr><td height="20" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr>
             <td style="font-family:'Inter', Arial, sans-serif; font-size:11.5px; text-align:center; color:#94A3B8; font-weight:400; line-height: 20px;">
               &copy; ${new Date().getFullYear()} PlotPro Real Estate Platform. All rights reserved.
             </td>
            </tr>
           </table>
          </td>
         </tr>
        </table>
       </td>
      </tr>
     </table>
    </td>
   </tr>
  </table>
</body>
</html>`;
};

/**
 * Generates responsive, PlotPro-branded HTML email template for password reset OTP.
 */
export const renderPasswordResetEmailHtml = ({ otp, expiryMinutes = 10 }) => {
  const logoUrl = process.env.PLOTPRO_PUBLIC_LOGO_URL || DEFAULT_PUBLIC_LOGO_URL;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="EN">
<head>
  <title>PlotPro Password Reset Code</title>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css?family=Instrument+Sans:300,400,600,700,800" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css?family=Rethink+Sans:300,400,600,700,800" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css?family=Inter:300,400,600,700,800" rel="stylesheet">
</head>
<body style="margin:0; padding:0; background-color:#f0f0f0; font-family:'Rethink Sans', Helvetica, Arial, sans-serif;">
  <table class="em_full_wrap" style="background-color:#f0f0f0;" width="100%" border="0" cellspacing="0" cellpadding="0" align="center">
   <tr>
    <td align="center" valign="top">
     <table align="center" class="em_main_table" width="600" border="0" cellspacing="0" cellpadding="0" style="table-layout:fixed; background-color: #ffffff; border-radius: 8px; overflow: hidden; margin-top: 30px; margin-bottom: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
      <tr>
       <td>
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
         <tr>
          <td bgcolor="#121d31" style="border-bottom: 3px solid #a63d2f; padding-top: 22px; padding-bottom: 22px;">
           <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
             <td align="center">
               <img src="${logoUrl}" alt="PlotPro" width="130" style="display: block; width: 130px; max-width: 130px; height: auto; border: 0; outline: none; margin: 0 auto;" />
             </td>
            </tr>
           </table>
          </td>
         </tr>
         <tr>
          <td style="padding: 30px 40px;">
           <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
             <td align="center">
               <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                 <tr>
                   <td align="center" valign="middle" style="width: 76px; height: 76px; background-color: #fbf2f0; border: 2px solid #f3d4ce; border-radius: 50%; text-align: center;">
                     <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                       <tr>
                         <td align="center" valign="middle" style="width: 42px; height: 46px; background-color: #a63d2f; border-radius: 4px 4px 21px 21px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
                           <span style="font-family: Arial, Helvetica, sans-serif; font-size: 24px; color: #ffffff; font-weight: bold; line-height: 46px; display: block; margin: 0 auto;">&#10004;</span>
                         </td>
                       </tr>
                     </table>
                   </td>
                 </tr>
               </table>
             </td>
            </tr>
            <tr><td height="20" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr>
             <td style="font-family:'Rethink Sans', Arial, sans-serif; font-size:24px; text-align:center; color:#000000; font-weight:700; line-height:36px;">
               Password Reset Verification
             </td>
            </tr>
            <tr><td height="12" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr>
             <td style="font-family:'Rethink Sans', Arial, sans-serif; font-size:14px; text-align:center; color:#4a5568; font-weight:400; line-height: 24px;">
               You recently requested a password reset for your PlotPro account. Enter the 6-digit verification code below to set a new password.
             </td>
            </tr>
            <tr><td height="28" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr>
             <td bgcolor="#EFF2F1" style="font-family:'Instrument Sans', Arial, sans-serif; font-size:36px; text-align:center; color:#0f172a; font-weight:800; line-height: 44px; padding-top: 24px; padding-bottom: 24px; letter-spacing: 12px; border-radius: 8px; border: 1px solid #dcdfdc;">
               ${otp}
             </td>
            </tr>
            <tr><td height="28" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr>
             <td style="font-family:'Inter', Arial, sans-serif; font-size:13.5px; text-align:center; color:#70818D; font-weight:400; line-height: 22px;">
               <strong>Security Advisory:</strong> This code will expire in <strong>${expiryMinutes} minutes</strong>. Never share this code with anyone. PlotPro staff will never ask for your verification code. If you did not make this request, please disregard this email.
             </td>
            </tr>
            <tr><td height="24" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr><td height="1" bgcolor="#E2E8F0" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr><td height="20" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
            <tr>
             <td style="font-family:'Inter', Arial, sans-serif; font-size:11.5px; text-align:center; color:#94A3B8; font-weight:400; line-height: 20px;">
               &copy; ${new Date().getFullYear()} PlotPro Real Estate Platform. All rights reserved.
             </td>
            </tr>
           </table>
          </td>
         </tr>
        </table>
       </td>
      </tr>
     </table>
    </td>
   </tr>
  </table>
</body>
</html>`;
};

/**
 * Internal dispatcher managing provider selection and transparent HTTPS fallback.
 */
async function dispatchEmail({ to, subject, html, text }) {
  const provider = (process.env.EMAIL_PROVIDER || "smtp").toLowerCase().trim();
  const hasResend = Boolean(process.env.RESEND_API_KEY);

  // 1. If explicit Resend mode is selected, dispatch directly over HTTPS port 443
  if (provider === "resend") {
    if (!hasResend) {
      const err = "EMAIL_PROVIDER is set to 'resend' but RESEND_API_KEY is not defined.";
      console.error(`[EmailService] ${err}`);
      return { success: false, error: err };
    }
    try {
      const resendRes = await sendViaResend({ to, subject, html, text });
      console.log(`[EmailService] Successfully sent email to ${to} via Resend HTTPS (ID: ${resendRes.messageId})`);
      return resendRes;
    } catch (resendErr) {
      console.error(`[EmailService] Resend dispatch failed for ${to}:`, resendErr.message);
      return { success: false, error: resendErr.message };
    }
  }

  // 2. Default SMTP mode
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    // If SMTP credentials missing but Resend is available, fall back gracefully
    if (hasResend) {
      console.warn(`[EmailService] SMTP credentials missing, using configured RESEND_API_KEY fallback.`);
      try {
        const resendRes = await sendViaResend({ to, subject, html, text });
        console.log(`[EmailService] Dispatched email to ${to} via Resend fallback (ID: ${resendRes.messageId})`);
        return resendRes;
      } catch (resendErr) {
        return { success: false, error: resendErr.message };
      }
    }

    const missingVarMsg = "SMTP_USER or SMTP_PASS environment variable is missing.";
    console.error(`[SMTP] Delivery aborted: ${missingVarMsg}`);
    return { success: false, error: missingVarMsg };
  }

  const from = process.env.SMTP_FROM || `PlotPro Security <${user}>`;
  const transporter = createSmtpTransporter();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    console.log(`[SMTP] Successfully dispatched email to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (smtpError) {
    const classified = classifyEmailError(smtpError);
    console.error(`[SMTP] Failed to send email to ${to} [${classified.category}]:`, classified.message);

    // If SMTP failed due to a network firewall timeout or connection reset, and Resend is available,
    // seamlessly fall back to Resend HTTPS API (port 443)
    if (classified.category === "NETWORK_FIREWALL_TIMEOUT" && hasResend) {
      console.warn(`[EmailService] Outbound SMTP timed out. Engaging automatic Resend HTTPS fallback for ${to}...`);
      try {
        const fallbackRes = await sendViaResend({ to, subject, html, text });
        console.log(`[EmailService] Email to ${to} successfully delivered via Resend fallback (ID: ${fallbackRes.messageId})`);
        return fallbackRes;
      } catch (fallbackErr) {
        console.error(`[EmailService] Resend fallback also failed for ${to}:`, fallbackErr.message);
        return { success: false, error: `SMTP timed out and Resend fallback failed: ${fallbackErr.message}` };
      }
    }

    return { success: false, error: classified.message };
  }
}

/**
 * Sends a device enrollment OTP email.
 */
export const sendDeviceEnrollmentOtpEmail = async ({ to, otp, expiryMinutes = 10 }) => {
  if (!to || !otp) {
    throw new Error("Recipient email and OTP are required for dispatch.");
  }

  return await dispatchEmail({
    to,
    subject: "Your PlotPro Workstation Enrollment Code",
    text: `Your PlotPro device enrollment code is: ${otp}. It expires in ${expiryMinutes} minutes. If you did not initiate this request, contact Supreme Administration immediately.`,
    html: renderOtpEmailHtml({ otp, expiryMinutes }),
  });
};

/**
 * Sends a password reset OTP email.
 */
export const sendPasswordResetOtpEmail = async ({ to, otp, expiryMinutes = 10 }) => {
  if (!to || !otp) {
    throw new Error("Recipient email and OTP are required for dispatch.");
  }

  return await dispatchEmail({
    to,
    subject: "Your PlotPro Password Reset Code",
    text: `Your PlotPro password reset code is: ${otp}. It expires in ${expiryMinutes} minutes. If you did not request a password reset, you can safely ignore this email.`,
    html: renderPasswordResetEmailHtml({ otp, expiryMinutes }),
  });
};

/**
 * Sends a generic or notification email via active SMTP configuration.
 */
export const sendCustomEmail = async ({ to, subject, html, text }) => {
  if (!to || !subject || !html) {
    throw new Error("Recipient email, subject, and html body are required for dispatch.");
  }

  return await dispatchEmail({ to, subject, html, text });
};
