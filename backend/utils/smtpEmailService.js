import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PUBLIC_LOGO_URL =
  "https://raw.githubusercontent.com/OneStopSolution2025/Plotpro/main/frontend/src/assets/Logo/plotpro-logo.png";

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
 * Generates responsive, PlotPro-branded HTML email template for device enrollment OTP.
 */
export const renderOtpEmailHtml = ({ otp, expiryMinutes = 10 }) => {
  const logoUrl = process.env.PLOTPRO_PUBLIC_LOGO_URL || DEFAULT_PUBLIC_LOGO_URL;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="EN">
<head>
  <!--[if gte mso 15]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <style type="text/css"> body,table tr,table td,a, span,table.MsoNormalTable { font-family:'Rethink Sans', Helvetica, Arial, sans-serif !important; }</style>
  <![endif]-->
  <title>PlotPro Workstation Enrollment Verification</title>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css?family=Instrument+Sans:300,400,600,700,800" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css?family=Rethink+Sans:300,400,600,700,800" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css?family=Inter:300,400,600,700,800" rel="stylesheet">
  <!--<![endif]-->
  <meta name="format-detection" content="telephone=no">
  <style type="text/css">
   html,
   body {
    Margin: 0 auto !important;
    padding: 0 !important;
    width: 100% !important;
    height: 100% !important;
   }

   * {
    -ms-text-size-adjust: 100%;
    -webkit-text-size-adjust: 100%;
    text-rendering: optimizeLegibility;
   }

   .ExternalClass {
    width: 100%;
   }

   .ExternalClass,
   .ExternalClass p,
   .ExternalClass span,
   .ExternalClass font,
   .ExternalClass td,
   .ExternalClass div {
    line-height: 100%;
   }

   table {
    mso-table-lspace: 0pt;
    mso-table-rspace: 0pt;
   }

   th,
   td {
    mso-table-lspace: 0pt;
    mso-table-rspace: 0pt;
   }

   table,
   tr,
   td {
    border-collapse: collapse;
   }

   p,
   a,
   li,
   blockquote {
    mso-line-height-rule: exactly;
   }

   .ReadMsgBody {
    width: 100%;
    background-color: #ffffff;
   }

   .ExternalClass {
    width: 100%;
    background-color: #ffffff;
   }

   span.MsoHyperlink {
    mso-style-priority: 99;
    color: inherit;
   }

   span.MsoHyperlinkFollowed {
    mso-style-priority: 99;
    color: inherit;
   }

   @media only screen and (max-width:639px) {
    body,
    html {
      width: 100% !important;
      min-width: 100% !important;
    }

    .em_full_wrap {
      width: 100% !important;
      max-width: 100% !important;
    }

    .em_main_table {
      width: 100% !important;
      border-radius: 0 !important;
    }

    .em_side_space {
      padding-left: 20px !important;
      padding-right: 20px !important;
    }

    .em_hide {
      display: none !important;
    }
   }
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

         <!-- HEADER SECTION -->
         <tr>
          <td bgcolor="#121d31" style="border-bottom: 3px solid #a63d2f;">
           <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
             <td width="50" class="em_hide">&nbsp;</td>
             <td valign="top" class="em_side_space" style="padding-top: 22px; padding-bottom: 22px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
               <tr>
                <td align="center">
                  <img src="${logoUrl}" alt="PlotPro" width="130" style="display: block; width: 130px; max-width: 130px; height: auto; border: 0; outline: none; margin: 0 auto;" />
                </td>
               </tr>
              </table>
             </td>
             <td width="50" class="em_hide">&nbsp;</td>
            </tr>
           </table>
          </td>
         </tr>               

         <!-- MAIN CONTENT BODY -->
         <tr>
          <td>
           <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
             <td width="50" class="em_hide">&nbsp;</td>
             <td valign="top" class="em_side_space">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
               <tr>
                <td height="36" class="em_hide" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr> 
               <tr>
                <td height="30" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr>
            
               <!-- PROPERLY CENTERED SECURITY SHIELD BADGE (EMAIL-SAFE HTML/CSS) -->
               <tr>
                <td align="center">
                  <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                    <tr>
                      <td align="center" valign="middle" style="width: 76px; height: 76px; background-color: #fbf2f0; border: 2px solid #f3d4ce; border-radius: 50%; text-align: center;">
                        <!-- Styled high-contrast shield badge with checkmark inside -->
                        <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                          <tr>
                            <td align="center" valign="middle" style="width: 42px; height: 46px; background-color: #a63d2f; border-radius: 4px 4px 21px 21px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
                              <span style="font-family: Arial, Helvetica, sans-serif; font-size: 24px; color: #ffffff; font-weight: bold; line-height: 46px; display: block; margin: 0 auto;">
                                &#10004;
                              </span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
               </tr>
               <tr>
                <td height="24" class="em_hide" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr> 
               <tr>
                <td height="20" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr>
                  
               <tr>
                <td style="font-family:'Rethink Sans', Arial, sans-serif; font-size:24px; text-align:center; color:#000000; font-weight:700; line-height:36px;">
                  Your One-Time Passcode
                </td>
               </tr>
               <tr>
                <td height="12" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr>    
               <tr>
                <td class="nopad" style="font-family:'Rethink Sans', Arial, sans-serif; font-size:14px; text-align:center; color:#4a5568; font-weight:400; line-height: 24px; padding-left: 40px; padding-right: 40px;">
                  You are receiving this security email because an administrative workstation is requesting trusted device binding to your PlotPro account.
                </td>
               </tr>
               <tr>
                <td height="28" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr>  

               <!-- HIGHLIGHTED OTP BOX -->
               <tr>
                <td bgcolor="#EFF2F1" style="font-family:'Instrument Sans', Arial, sans-serif; font-size:36px; text-align:center; color:#0f172a; font-weight:800; line-height: 44px; padding-top: 24px; padding-bottom: 24px; letter-spacing: 12px; border-radius: 8px; border: 1px solid #dcdfdc;">
                  ${otp}
                </td>
               </tr> 
               <tr>
                <td height="28" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr>

               <tr>
                <td style="font-family:'Inter', Arial, sans-serif; font-size:13.5px; text-align:center; color:#70818D; font-weight:400; line-height: 22px; padding: 0 20px;">
                  <strong>Security Advisory:</strong> This verification code will remain active for <strong>${expiryMinutes} minutes</strong>. If you did not initiate this login attempt, please alert the <strong>Supreme Administrator</strong> immediately.
                </td>
               </tr>            
               <tr>
                <td height="26" class="em_hide" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr> 
               <tr>
                <td height="24" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr>
               
               <!-- DIVIDER -->
               <tr>
                <td>
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#E2E8F0">
                    <tr>
                      <td height="1" style="line-height:1px;font-size:1px;">&nbsp;</td>
                    </tr>
                  </table>
                </td>
               </tr>
               <tr>
                <td height="20" class="em_hide" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr> 
               <tr>
                <td height="20" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr>
             
              </table>
             </td>
             <td width="50" class="em_hide">&nbsp;</td>
            </tr>
           </table>
          </td>
         </tr>

         <!-- FOOTER SECTION -->
         <tr>
          <td>
           <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
             <td width="50" class="em_hide">&nbsp;</td>
             <td valign="top" class="em_side_space" style="padding-bottom: 36px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
               <tr>
                <td style="font-family:'Inter', Arial, sans-serif; font-size:12.5px; text-align:center; color:#70818D; font-weight:400; line-height: 22px;">
                  If you have any questions or suspect unauthorized access, contact PlotPro Security Administration.
                </td>
               </tr>      
               <tr>
                <td height="6" style="line-height:1px;font-size:1px;">&nbsp;</td>
               </tr>
               <tr>
                <td style="font-family:'Inter', Arial, sans-serif; font-size:11.5px; text-align:center; color:#94A3B8; font-weight:400; line-height: 20px;">
                  &copy; ${new Date().getFullYear()} PlotPro Real Estate Platform. All rights reserved.
                </td>
               </tr>           
              </table>
             </td>
             <td width="50" class="em_hide">&nbsp;</td>
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
  <div style="display:none; white-space:nowrap; font:20px courier; color:#dbdbdb; background-color:#dbdbdb;">- - - - - - - - - - - - - - - - - - - - - - -</div>
</body>
</html>`;
};

/**
 * Sends a device enrollment OTP email using Nodemailer and Gmail SMTP.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.otp - 6-digit plain OTP code
 * @param {number} [options.expiryMinutes=10] - OTP expiry duration in minutes
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export const sendDeviceEnrollmentOtpEmail = async ({ to, otp, expiryMinutes = 10 }) => {
  if (!to || !otp) {
    throw new Error("Recipient email and OTP are required for dispatch.");
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    const missingVarMsg = "SMTP_USER or SMTP_PASS environment variable is missing.";
    console.error(`[SMTP] Delivery aborted: ${missingVarMsg}`);
    return { success: false, error: missingVarMsg };
  }

  const from = process.env.SMTP_FROM || `PlotPro Security <${user}>`;
  const transporter = createSmtpTransporter();

  try {
    const mailOptions = {
      from,
      to,
      subject: "Your PlotPro Workstation Enrollment Code",
      text: `Your PlotPro device enrollment code is: ${otp}. It expires in ${expiryMinutes} minutes. If you did not initiate this request, contact Supreme Administration immediately.`,
      html: renderOtpEmailHtml({ otp, expiryMinutes }),
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`[SMTP] Successfully dispatched device enrollment email to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    // Log sanitized error message without exposing credentials or OTP
    console.error(`[SMTP] Failed to send enrollment email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
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

         <!-- HEADER SECTION -->
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

         <!-- MAIN CONTENT BODY -->
         <tr>
          <td style="padding: 30px 40px;">
           <table width="100%" border="0" cellspacing="0" cellpadding="0">
            
            <!-- SECURITY BADGE (EMAIL-SAFE HTML/CSS) -->
            <tr>
             <td align="center">
               <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                 <tr>
                   <td align="center" valign="middle" style="width: 76px; height: 76px; background-color: #fbf2f0; border: 2px solid #f3d4ce; border-radius: 50%; text-align: center;">
                     <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                       <tr>
                         <td align="center" valign="middle" style="width: 42px; height: 46px; background-color: #a63d2f; border-radius: 4px 4px 21px 21px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
                           <span style="font-family: Arial, Helvetica, sans-serif; font-size: 24px; color: #ffffff; font-weight: bold; line-height: 46px; display: block; margin: 0 auto;">
                             &#10004;
                           </span>
                         </td>
                       </tr>
                     </table>
                   </td>
                 </tr>
               </table>
             </td>
            </tr>

            <tr>
             <td height="20" style="line-height:1px;font-size:1px;">&nbsp;</td>
            </tr>
               
            <tr>
             <td style="font-family:'Rethink Sans', Arial, sans-serif; font-size:24px; text-align:center; color:#000000; font-weight:700; line-height:36px;">
               Password Reset Verification
             </td>
            </tr>
            <tr>
             <td height="12" style="line-height:1px;font-size:1px;">&nbsp;</td>
            </tr>    
            <tr>
             <td style="font-family:'Rethink Sans', Arial, sans-serif; font-size:14px; text-align:center; color:#4a5568; font-weight:400; line-height: 24px;">
               You recently requested a password reset for your PlotPro account. Enter the 6-digit verification code below to set a new password.
             </td>
            </tr>
            <tr>
             <td height="28" style="line-height:1px;font-size:1px;">&nbsp;</td>
            </tr>  

            <!-- HIGHLIGHTED OTP BOX -->
            <tr>
             <td bgcolor="#EFF2F1" style="font-family:'Instrument Sans', Arial, sans-serif; font-size:36px; text-align:center; color:#0f172a; font-weight:800; line-height: 44px; padding-top: 24px; padding-bottom: 24px; letter-spacing: 12px; border-radius: 8px; border: 1px solid #dcdfdc;">
               ${otp}
             </td>
            </tr> 
            <tr>
             <td height="28" style="line-height:1px;font-size:1px;">&nbsp;</td>
            </tr>

            <tr>
             <td style="font-family:'Inter', Arial, sans-serif; font-size:13.5px; text-align:center; color:#70818D; font-weight:400; line-height: 22px;">
               <strong>Security Advisory:</strong> This code will expire in <strong>${expiryMinutes} minutes</strong>. Never share this code with anyone. PlotPro staff will never ask for your verification code. If you did not make this request, please disregard this email.
             </td>
            </tr>            
            <tr>
             <td height="24" style="line-height:1px;font-size:1px;">&nbsp;</td>
            </tr>
            
            <!-- DIVIDER -->
            <tr>
             <td height="1" bgcolor="#E2E8F0" style="line-height:1px;font-size:1px;">&nbsp;</td>
            </tr>
            <tr>
             <td height="20" style="line-height:1px;font-size:1px;">&nbsp;</td>
            </tr>

            <!-- FOOTER -->
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
 * Sends a password reset OTP email using Nodemailer and Gmail SMTP.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.otp - 6-digit plain OTP code
 * @param {number} [options.expiryMinutes=10] - OTP expiry duration in minutes
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export const sendPasswordResetOtpEmail = async ({ to, otp, expiryMinutes = 10 }) => {
  if (!to || !otp) {
    throw new Error("Recipient email and OTP are required for dispatch.");
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    const missingVarMsg = "SMTP_USER or SMTP_PASS environment variable is missing.";
    console.error(`[SMTP] Delivery aborted: ${missingVarMsg}`);
    return { success: false, error: missingVarMsg };
  }

  const from = process.env.SMTP_FROM || `PlotPro Security <${user}>`;
  const transporter = createSmtpTransporter();

  try {
    const mailOptions = {
      from,
      to,
      subject: "Your PlotPro Password Reset Code",
      text: `Your PlotPro password reset code is: ${otp}. It expires in ${expiryMinutes} minutes. If you did not request a password reset, you can safely ignore this email.`,
      html: renderPasswordResetEmailHtml({ otp, expiryMinutes }),
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`[SMTP] Successfully dispatched password reset email to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[SMTP] Failed to send password reset email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};
