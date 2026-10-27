import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
  verifyProjectOwnership,
  verifyPlotOwnership,
} from "../middleware/ownershipMiddleware.js";
import { requireActiveSubscription } from "../middleware/checkTenantSubscription.js";
import {
  getAdminProjects,
  getAdminProjectById,
  createAdminProject,
  updateAdminProject,
  deleteAdminProject,
  uploadProjectImageAdmin,
  getProjectLayoutAdmin,
  saveProjectLayoutAdmin,
} from "../controllers/projectController.js";
import {
  getAdminProjectPlots,
  createAdminProjectPlot,
  updateAdminPlot,
  deleteAdminPlot,
  updateProjectPlotsDefaultImage,
} from "../controllers/plotController.js";
import {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
} from "../controllers/adminProfileController.js";
import {
  getAdminEnquiries,
  updateEnquiryStatusAdmin,
  logEnquiryActivityAdmin,
} from "../controllers/enquiryController.js";
import {
  getAdminSiteVisits,
  updateSiteVisitStatusAdmin,
} from "../controllers/siteVisitController.js";

const router = express.Router();

// Enforce authentication & ADMIN role for all routes in this router
router.use(protect);
router.use(authorize("ADMIN"));

// Project Management
router.get("/projects", getAdminProjects);
router.post("/projects/upload-image", requireActiveSubscription, uploadProjectImageAdmin);
router.post("/projects/:id/upload-image", requireActiveSubscription, verifyProjectOwnership, uploadProjectImageAdmin);
router.post("/projects", requireActiveSubscription, createAdminProject);
router.get("/projects/:id", verifyProjectOwnership, getAdminProjectById);
router.put("/projects/:id", requireActiveSubscription, verifyProjectOwnership, updateAdminProject);
router.delete("/projects/:id", requireActiveSubscription, verifyProjectOwnership, deleteAdminProject);

// Project Layout Management
router.get("/projects/:id/layout", verifyProjectOwnership, getProjectLayoutAdmin);
router.post(
  "/projects/:id/layout-image",
  requireActiveSubscription,
  (req, res, next) => {
    if (req.params.id === "new" || req.params.id === "undefined") {
      return uploadProjectImageAdmin(req, res, next);
    }
    return verifyProjectOwnership(req, res, () => uploadProjectImageAdmin(req, res, next));
  }
);
router.put("/projects/:id/layout", requireActiveSubscription, verifyProjectOwnership, saveProjectLayoutAdmin);

// Plot Management
router.get("/projects/:id/plots", verifyProjectOwnership, getAdminProjectPlots);
router.post("/projects/:id/plots", requireActiveSubscription, verifyProjectOwnership, createAdminProjectPlot);
router.put("/projects/:id/plots/default-image", requireActiveSubscription, verifyProjectOwnership, updateProjectPlotsDefaultImage);
router.put("/plots/:id", requireActiveSubscription, verifyPlotOwnership, updateAdminPlot);
router.delete("/plots/:id", requireActiveSubscription, verifyPlotOwnership, deleteAdminPlot);

// Enquiries (Admin-specific leads)
router.get("/enquiries", getAdminEnquiries);
router.patch("/enquiries/:id/status", requireActiveSubscription, updateEnquiryStatusAdmin);
router.post("/enquiries/:id/activity", requireActiveSubscription, logEnquiryActivityAdmin);

// Site Visits (Admin-specific leads)
router.get("/site-visits", getAdminSiteVisits);
router.patch("/site-visits/:id/status", requireActiveSubscription, updateSiteVisitStatusAdmin);

// Profile & Security
router.get("/profile", getAdminProfile);
router.put("/profile", updateAdminProfile);
router.put("/profile/password", changeAdminPassword);

export default router;
