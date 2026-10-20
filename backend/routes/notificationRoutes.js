import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearMyNotifications,
} from "../controllers/notificationController.js";

const router = express.Router();

router.use(protect);

router.get("/", getMyNotifications);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);
router.delete("/", clearMyNotifications);

export default router;
