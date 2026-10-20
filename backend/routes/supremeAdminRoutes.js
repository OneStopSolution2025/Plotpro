import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
  getPlatformOverview,
  getSubscribers,
  getSubscriberById,
  createSubscriber,
  toggleSubscriberStatus,
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
  getPlatformSettings,
  updatePlatformSettings,
} from "../controllers/supremeAdminController.js";

const router = express.Router();

// Strict Authentication and Authorization: SUPREME_ADMIN only
router.use(protect);
router.use(authorize("SUPREME_ADMIN"));

// Overview
router.get("/overview", getPlatformOverview);

// Subscriber / Business Management
router.get("/subscribers", getSubscribers);
router.post("/subscribers", createSubscriber);
router.get("/subscribers/:id", getSubscriberById);
router.patch("/subscribers/:id/status", toggleSubscriberStatus);
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

// Platform Settings
router.get("/settings", getPlatformSettings);
router.put("/settings", updatePlatformSettings);

export default router;
