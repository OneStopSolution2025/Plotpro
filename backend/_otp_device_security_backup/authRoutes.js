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

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", protect, logoutUser);
router.post("/google", googleAuth);
router.get("/me", protect, getMe);

// ─── Single Active Device Authentication Endpoints ────────────────────────────
router.post("/device/verify-otp", verifyDeviceOtpAndProceed);
router.post("/device/enroll-first-device", enrollFirstDevice);
router.post("/device/resend-enrollment-otp", resendEnrollmentOtp);
router.get("/device/request-status", getRequestStatus);
router.post("/device/claim-approved-session", claimApprovedSession);

// Password reset flow
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

// Super Admin (retailer) signup request flow — public
router.get("/retailer/plans", getPublicActivePlans);
router.post("/retailer/request", submitRetailerRequest);

export default router;
