import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";
import {
  getAllAdmins,
  createAdminAccount,
  updateAdminAccount,
  toggleAdminStatus,
  deleteAdminAccount,
  getAllProjectsSuperAdmin,
  getPendingProjects,
  approveProject,
  rejectProject,
  assignProjectAdmin,
  archiveProject,
  getSuperAdminAnalytics,
  getAllPlotsSuperAdmin,
  createProjectSuperAdmin,
  getProjectPlotsSuperAdmin,
  getSubscriptionInfo,
  uploadLayoutImageSuperAdmin,
  getProjectLayoutSuperAdmin,
  saveProjectLayoutSuperAdmin,
} from "../controllers/superAdminController.js";
import {
  getAllEnquiriesSuperAdmin,
  updateEnquiryStatusSuperAdmin,
} from "../controllers/enquiryController.js";
import {
  getBranches,
  createBranch,
  getBranchDetail,
  updateBranch,
  toggleBranchStatus,
  deleteBranch,
} from "../controllers/branchController.js";
import {
  getAllSiteVisitsSuperAdmin,
  updateSiteVisitStatusSuperAdmin,
} from "../controllers/siteVisitController.js";
import {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
} from "../controllers/adminProfileController.js";

const router = express.Router();

// Enforce authentication & SUPER_ADMIN role for all routes in this router
router.use(protect);
router.use(authorize("SUPER_ADMIN"));

// Analytics
router.get("/analytics", getSuperAdminAnalytics);

// Admin Management & Subscription Info
router.get("/subscription-info", getSubscriptionInfo);
router.get("/admins", getAllAdmins);
router.post("/admins", createAdminAccount);
router.put("/admins/:id", updateAdminAccount);
router.patch("/admins/:id/status", toggleAdminStatus);
router.delete("/admins/:id", deleteAdminAccount);

// Project Oversight, Creation & Approvals
router.get("/projects", getAllProjectsSuperAdmin);
router.post("/projects", createProjectSuperAdmin);
router.get("/projects/pending", getPendingProjects);
router.get("/projects/:id/plots", getProjectPlotsSuperAdmin);
router.patch("/projects/:id/approve", approveProject);
router.patch("/projects/:id/reject", rejectProject);
router.patch("/projects/:id/assign", assignProjectAdmin);
router.delete("/projects/:id", archiveProject);

// Project Layout Image Management
router.post("/projects/:id/layout-image", uploadLayoutImageSuperAdmin);
router.get("/projects/:id/layout", getProjectLayoutSuperAdmin);
router.put("/projects/:id/layout", saveProjectLayoutSuperAdmin);

// Plot Inventory Oversight
router.get("/plots", getAllPlotsSuperAdmin);

// Leads Oversight
router.get("/enquiries", getAllEnquiriesSuperAdmin);
router.patch("/enquiries/:id/status", updateEnquiryStatusSuperAdmin);
router.get("/site-visits", getAllSiteVisitsSuperAdmin);
router.patch("/site-visits/:id/status", updateSiteVisitStatusSuperAdmin);

// Profile & Security
// Branch Management (tenant-scoped, seat-safe)
router.get("/branches", getBranches);
router.post("/branches", createBranch);
router.get("/branches/:id", getBranchDetail);
router.put("/branches/:id", updateBranch);
router.patch("/branches/:id/status", toggleBranchStatus);
router.delete("/branches/:id", deleteBranch);

router.get("/profile", getAdminProfile);
router.put("/profile", updateAdminProfile);
router.put("/profile/password", changeAdminPassword);

export default router;

