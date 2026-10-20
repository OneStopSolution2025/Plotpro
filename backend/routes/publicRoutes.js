import express from "express";
import {
  getPublicProjects,
  getPublicProjectById,
  getPublicProjectPlots,
  getPublicPlotById,
} from "../controllers/publicController.js";
import { submitPublicEnquiry } from "../controllers/enquiryController.js";
import { submitPublicSiteVisit } from "../controllers/siteVisitController.js";

import { checkMaintenanceMode } from "../middleware/maintenanceMiddleware.js";
import PlatformSettings from "../models/PlatformSettings.js";

const router = express.Router();

// Public Platform Status & Settings
router.get("/settings", async (req, res, next) => {
  try {
    let settings = await PlatformSettings.findOne({});
    if (!settings) {
      settings = await PlatformSettings.create({});
    }
    res.status(200).json({
      success: true,
      data: {
        platformName: settings.platformName,
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone,
        maintenanceMode: settings.maintenanceMode,
        allowSelfRegistration: settings.allowSelfRegistration,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Protect public routes with maintenance check
router.use(checkMaintenanceMode);

// Public Project & Plot Exploration
router.get("/projects", getPublicProjects);
router.get("/projects/:id", getPublicProjectById);
router.get("/projects/:id/plots", getPublicProjectPlots);
router.get("/plots/:id", getPublicPlotById);

// Public Lead Submissions
router.post("/enquiries", submitPublicEnquiry);
router.post("/site-visits", submitPublicSiteVisit);

export default router;

