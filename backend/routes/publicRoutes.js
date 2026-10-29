import express from "express";
import {
  getPublicProjects,
  getPublicProjectById,
  getPublicProjectPlots,
  getPublicPlotById,
} from "../controllers/publicController.js";
import { submitPublicEnquiry } from "../controllers/enquiryController.js";
import { submitPublicSiteVisit } from "../controllers/siteVisitController.js";
import {
  enquiryLimiter,
  siteVisitLimiter,
} from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

// Public Project & Plot Exploration
router.get("/projects", getPublicProjects);
router.get("/projects/:id", getPublicProjectById);
router.get("/projects/:id/plots", getPublicProjectPlots);
router.get("/plots/:id", getPublicPlotById);

// Public Lead Submissions — SEPARATE limiter buckets per form so a burst of
// enquiries can never starve site-visit bookings (or vice versa).
router.post("/enquiries", enquiryLimiter, submitPublicEnquiry);
router.post("/site-visits", siteVisitLimiter, submitPublicSiteVisit);

export default router;

