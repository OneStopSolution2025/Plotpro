import express from "express";
import {
  getPublicProjects,
  getPublicProjectById,
  getPublicProjectPlots,
  getPublicPlotById,
} from "../controllers/publicController.js";
import { submitPublicEnquiry } from "../controllers/enquiryController.js";
import { submitPublicSiteVisit } from "../controllers/siteVisitController.js";

const router = express.Router();

// Public Project & Plot Exploration
router.get("/projects", getPublicProjects);
router.get("/projects/:id", getPublicProjectById);
router.get("/projects/:id/plots", getPublicProjectPlots);
router.get("/plots/:id", getPublicPlotById);

// Public Lead Submissions
router.post("/enquiries", submitPublicEnquiry);
router.post("/site-visits", submitPublicSiteVisit);

export default router;

