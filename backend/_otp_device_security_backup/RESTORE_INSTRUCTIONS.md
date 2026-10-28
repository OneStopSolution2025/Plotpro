# PlotPro OTP & Device Security Restoration Guide

This document explains how to safely re-enable the complete device enrollment and OTP security flow once your custom domain and paid hosting or email plan are ready.

---

## What is in this Backup?

All core security and email verification files are preserved with cryptographic SHA-256 integrity:

1. `smtpEmailService.js`: Nodemailer Gmail SMTP, responsive branded HTML templates, verified hosted logo, and email-safe checkmark badge.
2. `otpSecurity.js`: HMAC-SHA256 6-digit OTP generation, challenge IDs, and timing-safe verification.
3. `deviceSecurity.js`: High-entropy device secret generation, hashing, verification, and HttpOnly cookie management.
4. `deviceAuthController.js`: Workstation enrollment, approval requests, and status polling endpoints.
5. `testDeviceSecurity.js`: The full 43-test single-device security suite.
6. `testSmtpService.js`: The 29-test email template and provider suite.
7. `diagnoseSmtpConnection.js`: Raw TCP socket and DNS diagnostic probe.

---

## How to Restore

### Option 1: Automated Safe Restoration (Recommended)

Run the automated restoration runner:
```bash
node backend/_otp_device_security_backup/restoreOtpSecurity.js
```

**Safety Guarantees of the Script:**
1. **Pre-Restore Snapshot**: Automatically takes a snapshot of your current files into `backend/.restore_safety_snapshots/<timestamp>/` before writing anything.
2. **Atomic Copy**: Restores all 7 files from the backup.
3. **Automated Post-Restore Tests**: Automatically executes `testSmtpService.js` and `testDeviceSecurity.js` to ensure zero regressions before finishing.

*(You can test the runner anytime without modifying any files using `--dry-run`)*:
```bash
node backend/_otp_device_security_backup/restoreOtpSecurity.js --dry-run
```

---

### Option 2: Re-Enabling in Development

In `backend/.env`, set:
```env
DEV_LOCAL_BYPASS_DEVICE_OTP=false
```
When this variable is `false` (or deleted), the backend strictly enforces the full device enrollment OTP flow, requiring every administrative device to verify via email OTP.

---

## Verification after Restore

Run the two test suites:
```bash
node backend/scripts/testSmtpService.js
node backend/scripts/testDeviceSecurity.js
```
Expected result:
- SMTP Service: `29/29 PASSED`
- Single Active Device Security: `43/43 PASSED`
