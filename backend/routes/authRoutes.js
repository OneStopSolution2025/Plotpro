import express from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  googleAuth,
  getMe,
  forgotPassword,
  verifyOtp,
  resetPassword,
} from "../controllers/authController.js";
import {
  verifyDeviceOtpAndProceed,
  enrollFirstDevice,
  resendEnrollmentOtp,
  getRequestStatus,
  claimApprovedSession,
} from "../controllers/deviceAuthController.js";
import {
  getPublicActivePlans,
  submitRetailerRequest,
} from "../controllers/retailerRequestController.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  forgotPasswordLimiter,
  verifyOtpLimiter,
  resetPasswordLimiter,
  loginLimiter,
  googleAuthLimiter,
  registerLimiter,
  deviceResendLimiter,
  deviceVerifyLimiter,
  deviceSessionLimiter,
  retailerRequestLimiter,
} from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

router.post("/register", registerLimiter, registerUser);
router.post("/login", loginLimiter, loginUser);
router.post("/logout", protect, logoutUser);
router.post("/google", googleAuthLimiter, googleAuth);
router.get("/me", protect, getMe);

// ─── Single Active Device Authentication Endpoints ────────────────────────────
// (DB-backed per-user 60s cooldown + 5-attempt challenge cap live in the
// controllers; these IP limiters are the outer defense-in-depth layer.)
router.post("/device/verify-otp", deviceVerifyLimiter, verifyDeviceOtpAndProceed);
router.post("/device/enroll-first-device", deviceVerifyLimiter, enrollFirstDevice);
router.post("/device/resend-enrollment-otp", deviceResendLimiter, resendEnrollmentOtp);
router.get("/device/request-status", deviceSessionLimiter, getRequestStatus);
router.post("/device/claim-approved-session", deviceSessionLimiter, claimApprovedSession);

// Password reset flow (IP rate-limited; DB-backed attempt cap + cooldown inside controllers)
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/verify-otp", verifyOtpLimiter, verifyOtp);
router.post("/reset-password", resetPasswordLimiter, resetPassword);

// Super Admin (retailer) signup request flow — public
router.get("/retailer/plans", getPublicActivePlans);
router.post("/retailer/request", retailerRequestLimiter, submitRetailerRequest);

export default router;
