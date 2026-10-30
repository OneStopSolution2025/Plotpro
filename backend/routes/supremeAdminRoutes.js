import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
  getPlatformOverview,
  getSubscribers,
  getSubscriberById,
  createSubscriber,
  toggleSubscriberStatus,
  deleteSubscriber,
  assignSubscriberSubscription,
  toggleAdminStatusBySupreme,
  deleteAdminAccountBySupreme,
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  togglePlanStatus,
  getSubscriptions,
  updateSubscriptionStatus,
  getSeatUsage,
} from "../controllers/supremeAdminController.js";
import {
  getPublishedProjectsSummary,
  getSuperAdminPublishedCounts,
  getSuperAdminPublishedAdmins,
  getSuperAdminPublishedProjectsAdminWise,
} from "../controllers/supremeAdminPublishedProjectsController.js";
import {
  getRetailerRequests,
  getRetailerRequestById,
  approveRetailerRequest,
  rejectRetailerRequest,
  deleteRetailerRequest,
  setPaymentVerification,
  requestAdditionalInfo,
  downloadBusinessDoc,
} from "../controllers/retailerRequestController.js";
import {
  getPendingDeviceRequests,
  getActiveTrustedDevices,
  approveDeviceRequest,
  rejectDeviceRequest,
  revokeTrustedDevice,
  emergencyDeviceReset,
} from "../controllers/supremeDeviceController.js";

const router = express.Router();

// Strict Authentication and Authorization: SUPREME_ADMIN only
router.use(protect);
router.use(authorize("SUPREME_ADMIN"));

// Overview
router.get("/overview", getPlatformOverview);

// Retailer (Super Admin) account creation requests — review & approval
router.get("/retailer-requests", getRetailerRequests);
router.get("/retailer-requests/:id", getRetailerRequestById);
router.patch("/retailer-requests/:id/payment-verification", setPaymentVerification);
router.patch("/retailer-requests/:id/approve", approveRetailerRequest);
router.patch("/retailer-requests/:id/reject", rejectRetailerRequest);
router.delete("/retailer-requests/:id", deleteRetailerRequest);
router.patch("/retailer-requests/:id/request-info", requestAdditionalInfo);
router.get("/retailer-requests/:id/documents/:docType", downloadBusinessDoc);

// Subscriber / Business Management
router.get("/subscribers", getSubscribers);
router.post("/subscribers", createSubscriber);
router.get("/subscribers/:id", getSubscriberById);
router.patch("/subscribers/:id/status", toggleSubscriberStatus);
router.delete("/subscribers/:id", deleteSubscriber);
router.post("/subscribers/:id/subscription", assignSubscriberSubscription);
router.patch("/subscribers/:subscriberId/admins/:adminId/status", toggleAdminStatusBySupreme);
router.delete("/subscribers/:subscriberId/admins/:adminId", deleteAdminAccountBySupreme);

// Subscription Plan Management
router.get("/plans", getPlans);
router.post("/plans", createPlan);
router.put("/plans/:id", updatePlan);
router.delete("/plans/:id", deletePlan);
router.patch("/plans/:id/status", togglePlanStatus);

// Subscriptions
router.get("/subscriptions", getSubscriptions);
router.patch("/subscriptions/:id/status", updateSubscriptionStatus);

// Admin Seat Usage
router.get("/seat-usage", getSeatUsage);

// ─── Published Projects Overview (platform-wide, READ-ONLY) ─────────────────
// Strictly read-only: no create/update/delete/publish/unpublish operations.
router.get("/published-projects/summary", getPublishedProjectsSummary);
router.get("/published-projects/super-admins", getSuperAdminPublishedCounts);
router.get(
  "/published-projects/super-admins/:subscriberId",
  getSuperAdminPublishedAdmins
);
router.get(
  "/published-projects/super-admins/:subscriberId/admins/:adminId/projects",
  getSuperAdminPublishedProjectsAdminWise
);

// ─── Trusted Device Oversight & Management ────────────────────────────────────
router.get("/devices/pending", getPendingDeviceRequests);
router.get("/devices/active", getActiveTrustedDevices);
router.post("/devices/requests/:requestId/approve", approveDeviceRequest);
router.post("/devices/requests/:requestId/reject", rejectDeviceRequest);
router.post("/devices/:deviceId/revoke", revokeTrustedDevice);
router.post("/devices/emergency-reset", emergencyDeviceReset);

export default router;
