import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
  getAllAdmins,
  createAdminAccount,
  updateAdminAccount,
  toggleAdminStatus,
  getAllProjectsSuperAdmin,
  getPendingProjects,
  approveProject,
  rejectProject,
  assignProjectAdmin,
  archiveProject,
  getSuperAdminAnalytics,
  getAllPlotsSuperAdmin,
  createProjectSuperAdmin,
} from "../controllers/superAdminController.js";
import { getAllEnquiriesSuperAdmin } from "../controllers/enquiryController.js";
import { getAllSiteVisitsSuperAdmin } from "../controllers/siteVisitController.js";
import { changeAdminPassword } from "../controllers/adminProfileController.js";

const router = express.Router();

// Enforce authentication & SUPER_ADMIN role for all routes in this router
router.use(protect);
router.use(authorize("SUPER_ADMIN"));

// Analytics
router.get("/analytics", getSuperAdminAnalytics);

// Admin Management
router.get("/admins", getAllAdmins);
router.post("/admins", createAdminAccount);
router.put("/admins/:id", updateAdminAccount);
router.patch("/admins/:id/status", toggleAdminStatus);

// Project Oversight, Creation & Approvals
router.get("/projects", getAllProjectsSuperAdmin);
router.post("/projects", createProjectSuperAdmin);
router.get("/projects/pending", getPendingProjects);
router.patch("/projects/:id/approve", approveProject);
router.patch("/projects/:id/reject", rejectProject);
router.patch("/projects/:id/assign", assignProjectAdmin);
router.delete("/projects/:id", archiveProject);

// Plot Inventory Oversight
router.get("/plots", getAllPlotsSuperAdmin);

// Leads Oversight
router.get("/enquiries", getAllEnquiriesSuperAdmin);
router.get("/site-visits", getAllSiteVisitsSuperAdmin);

// Profile & Security
router.put("/profile/password", changeAdminPassword);

export default router;

