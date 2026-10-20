import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getUserProfile,
  updateUserProfile,
  changeUserPassword,
  getUserWishlist,
  toggleSaveProject,
  toggleSavePlot,
} from "../controllers/userController.js";

const router = express.Router();

// All user routes require authentication
router.use(protect);

router.route("/profile").get(getUserProfile).put(updateUserProfile);
router.route("/password").put(changeUserPassword);
router.route("/wishlist").get(getUserWishlist);
router.route("/wishlist/projects/:id").post(toggleSaveProject);
router.route("/wishlist/plots/:id").post(toggleSavePlot);

export default router;
