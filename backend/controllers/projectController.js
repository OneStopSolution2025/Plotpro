import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import User from "../models/User.js";
import Branch from "../models/Branch.js";
import { createNotification } from "./notificationController.js";
import { resolveAdminProjectScope } from "../middleware/ownershipMiddleware.js";
import storageService from "../services/storageService.js";

const ALLOWED_PROJECT_FIELDS = [
  "title",
  "location",
  "city",
  "category",
  "plotType",
  "budget",
  "plotPrice",
  "priceLakhs",
  "plotSizes",
  "totalPlots",
  "availablePlots",
  "reservedPlots",
  "soldPlots",
  "distance",
  "projectSize",
  "status",
  "launchDate",
  "details",
  "image",
  "defaultPlotImage",
  "images",
  "about",
  "benefits",
  "highlights",
  "amenities",
  "locationConnectivity",
  "layout",
];

/**
 * Helper to parse price string to Lakhs.
 */
const parsePriceLakhs = (plotPrice) => {
  if (!plotPrice || typeof plotPrice !== "string") return 0;
  const cleaned = plotPrice.replace(/[₹,]/g, "").trim();
  const crMatch = cleaned.match(/([\d.]+)\s*(?:cr|crore|crores)\b/i);
  if (crMatch) {
    const val = parseFloat(crMatch[1]);
    return isNaN(val) ? 0 : val * 100;
  }
  const lakhMatch = cleaned.match(/([\d.]+)\s*(?:lakh|lakhs|lac|lacs|l)\b/i);
  if (lakhMatch) {
    const val = parseFloat(lakhMatch[1]);
    return isNaN(val) ? 0 : val;
  }
  const numMatch = cleaned.match(/^([\d.]+)$/);
  if (numMatch) {
    const num = parseFloat(numMatch[1]);
    if (isNaN(num)) return 0;
    if (num >= 100000) {
      return num / 100000;
    }
    return num;
  }
  return 0;
};

/**
 * Filter request body to only include allowed project fields.
 * Prevents tampering with adminId, approvalStatus, approvedBy, etc.
 */
const sanitizeProjectInput = (body) => {
  const sanitized = {};
  for (const field of ALLOWED_PROJECT_FIELDS) {
    if (body[field] !== undefined) {
      sanitized[field] = body[field];
    }
  }
  if (sanitized.plotPrice && sanitized.priceLakhs === undefined) {
    sanitized.priceLakhs = parsePriceLakhs(sanitized.plotPrice);
  }
  return sanitized;
};

/**
 * @desc    Get all projects owned by the authenticated admin
 * @route   GET /api/admin/projects
 * @access  Private (Admin)
 */
export const getAdminProjects = async (req, res, next) => {
  try {
    // Role-specific listing scope:
    //  • Legacy Admin (no branch)  → strictly their own projects (adminId)
    //  • Branch Admin              → strictly their branch's projects
    //  • Invalid/deactivated branch → blocked
    const scope = await resolveAdminProjectScope(req.user);
    if (scope.type === "INVALID") {
      return res.status(403).json({
        success: false,
        message:
          scope.reason === "branch_deactivated"
            ? "Forbidden: Your branch has been deactivated. Project access is paused."
            : "Forbidden: Your branch assignment is invalid. Please contact your Super Admin.",
      });
    }

    const projects = await Project.find({
      ...scope.filter,
      isArchived: false,
    }).sort({ customId: 1, createdAt: -1 });

    const projectsWithCounts = await Promise.all(
      projects.map(async (p) => {
        const total = await Plot.countDocuments({ projectId: p._id });
        const available = await Plot.countDocuments({ projectId: p._id, status: "Available" });
        const reserved = await Plot.countDocuments({ projectId: p._id, status: "Reserved" });
        const sold = await Plot.countDocuments({ projectId: p._id, status: "Sold" });

        return {
          ...p.toObject(),
          id: p.customId || p._id,
          totalPlots: total,
          availablePlots: available,
          reservedPlots: reserved,
          soldPlots: sold,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: projectsWithCounts.length,
      data: projectsWithCounts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single project owned by authenticated admin
 * @route   GET /api/admin/projects/:id
 * @access  Private (Admin)
 */
export const getAdminProjectById = async (req, res) => {
  res.status(200).json({
    success: true,
    data: req.project,
  });
};

/**
 * @desc    Create a new project (Status defaults to PENDING)
 * @route   POST /api/admin/projects
 * @access  Private (Admin)
 */
export const createAdminProject = async (req, res, next) => {
  try {
    const sanitized = sanitizeProjectInput(req.body);

    if (!sanitized.city && sanitized.location) {
      sanitized.city = sanitized.location.split(",")[0].trim();
    }

    if (!sanitized.title || !sanitized.location || !sanitized.plotPrice) {
      return res.status(400).json({
        success: false,
        message: "Title, location, and plotPrice are required.",
      });
    }

    // ── Branch scoping (server-side only; never trusted from the client) ──
    // Legacy Admin (no branch) → project stays unbranched (branchId: null)
    // Branch Admin             → project is stamped with their ACTIVE branch
    let branchId = null;
    if (req.user.branchId) {
      const branch = await Branch.findById(req.user.branchId).select(
        "tenantId status"
      );
      if (!branch || String(branch.tenantId) !== String(req.user.tenantId || "")) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: Your branch assignment is invalid. Please contact your Super Admin.",
        });
      }
      if (branch.status !== "ACTIVE") {
        return res.status(403).json({
          success: false,
          message: "Forbidden: Your branch has been deactivated. Project creation is paused.",
        });
      }
      branchId = branch._id;
    }

    // Determine next integer customId
    const maxProject = await Project.findOne().sort({ customId: -1 });
    const nextCustomId = maxProject && maxProject.customId ? maxProject.customId + 1 : 1;

    const newProject = await Project.create({
      ...sanitized,
      customId: nextCustomId,
      adminId: req.user._id,
      branchId, // server-derived: user's branch or null for legacy admins
      approvalStatus: "PENDING", // Always PENDING for new admin projects
      approvedAt: null,
      approvedBy: null,
      rejectionReason: "",
      hasPendingUpdates: false,
      pendingUpdates: null,
      isArchived: false,
    });

    // Generate initial plots if counts are provided
    const availableCount = Number(req.body.availablePlots) || 0;
    const reservedCount = Number(req.body.reservedPlots) || 0;
    const soldCount = Number(req.body.soldPlots) || 0;
    const totalCount = availableCount + reservedCount + soldCount;

    if (totalCount > 0) {
      const plotsToInsert = [];
      let plotIdx = 1;
      const defaultPlotPrice = newProject.plotPrice || "₹12 Lakh";
      const defaultPlotSize = newProject.plotSizes ? newProject.plotSizes.split("–")[0].trim() : "600 sq.ft";
      const initialPlotImage = newProject.defaultPlotImage || newProject.image || "";
      const initialPlotImages = initialPlotImage ? [initialPlotImage] : [];

      for (let i = 0; i < availableCount; i++) {
        plotsToInsert.push({
          customId: `${nextCustomId}-${plotIdx}`,
          projectId: newProject._id,
          projectCustomId: nextCustomId,
          plotNumber: String(plotIdx),
          size: defaultPlotSize,
          facing: "East",
          price: defaultPlotPrice,
          status: "Available",
          image: initialPlotImage,
          images: initialPlotImages,
        });
        plotIdx++;
      }

      for (let i = 0; i < reservedCount; i++) {
        plotsToInsert.push({
          customId: `${nextCustomId}-${plotIdx}`,
          projectId: newProject._id,
          projectCustomId: nextCustomId,
          plotNumber: String(plotIdx),
          size: defaultPlotSize,
          facing: "East",
          price: defaultPlotPrice,
          status: "Reserved",
          image: initialPlotImage,
          images: initialPlotImages,
        });
        plotIdx++;
      }

      for (let i = 0; i < soldCount; i++) {
        plotsToInsert.push({
          customId: `${nextCustomId}-${plotIdx}`,
          projectId: newProject._id,
          projectCustomId: nextCustomId,
          plotNumber: String(plotIdx),
          size: defaultPlotSize,
          facing: "East",
          price: defaultPlotPrice,
          status: "Sold",
          image: initialPlotImage,
          images: initialPlotImages,
        });
        plotIdx++;
      }

      if (plotsToInsert.length > 0) {
        await Plot.insertMany(plotsToInsert);
      }
    }

    // Notify all Super Admins about the new project awaiting approval
    try {
      const superAdmins = await User.find({ role: "SUPER_ADMIN" }).select("_id");
      for (const sa of superAdmins) {
        await createNotification({
          recipient: sa._id,
          sender: req.user._id,
          senderRole: "ADMIN",
          senderName: req.user.name || "Branch Admin",
          type: "PROJECT_CREATED",
          title: "New Project Awaiting Approval",
          message: `${req.user.name || "Branch Admin"} created new project "${newProject.title}" in ${newProject.location}. Needs your approval.`,
          metadata: {
            projectId: String(newProject.customId || newProject._id),
            projectTitle: newProject.title,
            adminId: String(req.user._id),
            adminName: req.user.name,
          },
        });
      }
    } catch (notifErr) {
      console.error("[ProjectCreated Notification Error]:", notifErr.message);
    }

    res.status(201).json({
      success: true,
      message: "Project created successfully and submitted for Super Admin approval.",
      data: {
        ...newProject.toObject(),
        id: newProject.customId,
        totalPlots: totalCount,
        availablePlots: availableCount,
        reservedPlots: reservedCount,
        soldPlots: soldCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update project (Applies edits directly without requiring Super Admin re-approval)
 * @route   PUT /api/admin/projects/:id
 * @access  Private (Admin)
 */

const syncProjectPlotInventory = async (
  project,
  totalPlots,
  availablePlots,
  reservedPlots,
  soldPlots
) => {
  const requestedTotal = Number(totalPlots);
  const requestedAvailable = Number(availablePlots);
  const requestedReserved = Number(reservedPlots);
  const requestedSold = Number(soldPlots);

  // -----------------------------------------
  // Validate requested inventory
  // -----------------------------------------

  if (
    !Number.isInteger(requestedTotal) ||
    requestedTotal < 0
  ) {
    throw new Error("Total plots must be a valid number.");
  }

  if (
    !Number.isInteger(requestedAvailable) ||
    requestedAvailable < 0
  ) {
    throw new Error("Available plots must be a valid number.");
  }

  if (
    !Number.isInteger(requestedReserved) ||
    requestedReserved < 0
  ) {
    throw new Error("Reserved plots must be a valid number.");
  }

  if (
    !Number.isInteger(requestedSold) ||
    requestedSold < 0
  ) {
    throw new Error("Sold plots must be a valid number.");
  }

  if (
    requestedAvailable +
      requestedReserved +
      requestedSold !==
    requestedTotal
  ) {
    throw new Error(
      "Available + Reserved + Sold must equal Total Plots."
    );
  }

  // -----------------------------------------
  // Load existing plots
  // -----------------------------------------

  let existingPlots = await Plot.find({
    projectId: project._id,
  }).sort({ plotNumber: 1 });

  // -----------------------------------------
  // Current counts
  // -----------------------------------------

  let currentAvailable = existingPlots.filter(
    (plot) => plot.status === "Available"
  ).length;

  let currentReserved = existingPlots.filter(
    (plot) => plot.status === "Reserved"
  ).length;

  let currentSold = existingPlots.filter(
    (plot) => plot.status === "Sold"
  ).length;

  let currentTotal = existingPlots.length;

  // -----------------------------------------
  // 1. Adjust status counts
  // -----------------------------------------

  // We NEVER automatically change/delete Sold plots.
  // We preserve Sold plots first.

  // Reduce Available → Reserved/Sold
  if (currentAvailable > requestedAvailable) {
    let excess = currentAvailable - requestedAvailable;

    const availablePlots = existingPlots.filter(
      (plot) => plot.status === "Available"
    );

    for (
      let i = 0;
      i < availablePlots.length && excess > 0;
      i++
    ) {
      const plot = availablePlots[i];

      if (currentReserved < requestedReserved) {
        plot.status = "Reserved";
        await plot.save();

        currentAvailable--;
        currentReserved++;
        excess--;
      } else if (currentSold < requestedSold) {
        plot.status = "Sold";
        await plot.save();

        currentAvailable--;
        currentSold++;
        excess--;
      }
    }
  }

  // Reduce Reserved → Available/Sold
  if (currentReserved > requestedReserved) {
    let excess = currentReserved - requestedReserved;

    const reservedPlots = existingPlots.filter(
      (plot) => plot.status === "Reserved"
    );

    for (
      let i = 0;
      i < reservedPlots.length && excess > 0;
      i++
    ) {
      const plot = reservedPlots[i];

      if (currentAvailable < requestedAvailable) {
        plot.status = "Available";
        await plot.save();

        currentReserved--;
        currentAvailable++;
        excess--;
      } else if (currentSold < requestedSold) {
        plot.status = "Sold";
        await plot.save();

        currentReserved--;
        currentSold++;
        excess--;
      }
    }
  }

  // Reduce Sold → Available/Reserved
  //
  // We avoid automatically changing Sold plots.
  // This protects already-sold inventory.
  //
  // Therefore if requestedSold is lower than currentSold,
  // we do not silently change those plots.
  //
  // The final validation below will stop an unsafe request.

  // -----------------------------------------
  // 2. Refresh plots after status changes
  // -----------------------------------------

  existingPlots = await Plot.find({
    projectId: project._id,
  }).sort({ plotNumber: 1 });

  currentAvailable = existingPlots.filter(
    (plot) => plot.status === "Available"
  ).length;

  currentReserved = existingPlots.filter(
    (plot) => plot.status === "Reserved"
  ).length;

  currentSold = existingPlots.filter(
    (plot) => plot.status === "Sold"
  ).length;

  currentTotal = existingPlots.length;

  // -----------------------------------------
  // 3. Create new plots if required
  // -----------------------------------------

  const requiredNewAvailable =
    Math.max(0, requestedAvailable - currentAvailable);

  const requiredNewReserved =
    Math.max(0, requestedReserved - currentReserved);

  const requiredNewSold =
    Math.max(0, requestedSold - currentSold);

  const plotsToCreate = [];

  const existingPlotNumbers = existingPlots
    .map((plot) => Number(plot.plotNumber))
    .filter((number) => Number.isFinite(number));

  let nextPlotNumber =
    existingPlotNumbers.length > 0
      ? Math.max(...existingPlotNumbers) + 1
      : 1;

  const defaultPlotPrice =
    project.plotPrice || "₹12 Lakh";

  const defaultPlotSize =
    project.plotSizes
      ? project.plotSizes.split("–")[0].trim()
      : "600 sq.ft";

  const defaultImage =
    project.defaultPlotImage ||
    project.image ||
    "";

  const createPlotData = (status) => {
    const plotNumber = String(nextPlotNumber);

    const plot = {
      customId: `${project.customId}-${plotNumber}`,
      projectId: project._id,
      projectCustomId: project.customId,
      plotNumber,
      size: defaultPlotSize,
      facing: "East",
      price: defaultPlotPrice,
      status,
      image: defaultImage,
      images: defaultImage ? [defaultImage] : [],
    };

    nextPlotNumber++;

    return plot;
  };

  for (let i = 0; i < requiredNewAvailable; i++) {
    plotsToCreate.push(
      createPlotData("Available")
    );
  }

  for (let i = 0; i < requiredNewReserved; i++) {
    plotsToCreate.push(
      createPlotData("Reserved")
    );
  }

  for (let i = 0; i < requiredNewSold; i++) {
    plotsToCreate.push(
      createPlotData("Sold")
    );
  }

  if (plotsToCreate.length > 0) {
    await Plot.insertMany(plotsToCreate);
  }

  // -----------------------------------------
  // 4. Refresh after creation
  // -----------------------------------------

  existingPlots = await Plot.find({
    projectId: project._id,
  }).sort({ plotNumber: 1 });

  currentTotal = existingPlots.length;

  currentAvailable = existingPlots.filter(
    (plot) => plot.status === "Available"
  ).length;

  currentReserved = existingPlots.filter(
    (plot) => plot.status === "Reserved"
  ).length;

  currentSold = existingPlots.filter(
    (plot) => plot.status === "Sold"
  ).length;

  // -----------------------------------------
  // 5. Handle total reduction
  // -----------------------------------------

  if (currentTotal > requestedTotal) {
    const excessCount =
      currentTotal - requestedTotal;

    const removablePlots = existingPlots.filter(
      (plot) => plot.status === "Available"
    );

    if (removablePlots.length < excessCount) {
      throw new Error(
        "Cannot reduce total plots because there are not enough Available plots to safely remove. Sold and Reserved plots are protected."
      );
    }

    const plotsToDelete =
      removablePlots
        .sort(
          (a, b) =>
            Number(b.plotNumber) -
            Number(a.plotNumber)
        )
        .slice(0, excessCount);

    await Plot.deleteMany({
      _id: {
        $in: plotsToDelete.map(
          (plot) => plot._id
        ),
      },
    });
  }

  // -----------------------------------------
  // 6. Final authoritative counts
  // -----------------------------------------

  const finalTotal = await Plot.countDocuments({
    projectId: project._id,
  });

  const finalAvailable = await Plot.countDocuments({
    projectId: project._id,
    status: "Available",
  });

  const finalReserved = await Plot.countDocuments({
    projectId: project._id,
    status: "Reserved",
  });

  const finalSold = await Plot.countDocuments({
    projectId: project._id,
    status: "Sold",
  });

  if (
    finalTotal !== requestedTotal ||
    finalAvailable !== requestedAvailable ||
    finalReserved !== requestedReserved ||
    finalSold !== requestedSold
  ) {
    throw new Error(
      `Inventory sync failed. Requested ${requestedTotal}/${requestedAvailable}/${requestedReserved}/${requestedSold}, but database has ${finalTotal}/${finalAvailable}/${finalReserved}/${finalSold}.`
    );
  }

  return {
    totalPlots: finalTotal,
    availablePlots: finalAvailable,
    reservedPlots: finalReserved,
    soldPlots: finalSold,
  };
};


export const updateAdminProject = async (req, res, next) => {
  try {
    const project = req.project;

    const sanitized = sanitizeProjectInput(req.body);

    // -----------------------------------------
    // Inventory values
    // -----------------------------------------

    const hasInventoryUpdate =
      req.body.totalPlots !== undefined ||
      req.body.availablePlots !== undefined ||
      req.body.reservedPlots !== undefined ||
      req.body.soldPlots !== undefined;

    let inventoryCounts = null;

    if (hasInventoryUpdate) {
      inventoryCounts = await syncProjectPlotInventory(
        project,
        Number(req.body.totalPlots),
        Number(req.body.availablePlots),
        Number(req.body.reservedPlots),
        Number(req.body.soldPlots)
      );

      // These fields are not stored in Project.
      // They are returned from actual Plot documents.
      delete sanitized.totalPlots;
      delete sanitized.availablePlots;
      delete sanitized.reservedPlots;
      delete sanitized.soldPlots;
    }

    // -----------------------------------------
    // Update project metadata
    // -----------------------------------------

    Object.assign(project, sanitized);

    // Clear previous staged updates
    project.pendingUpdates = null;
    project.hasPendingUpdates = false;

    // Rejected project → resubmit
    if (project.approvalStatus === "REJECTED") {
      project.approvalStatus = "PENDING";
      project.rejectionReason = "";
    }

    await project.save();

    // -----------------------------------------
    // Return authoritative plot counts
    // -----------------------------------------

    const finalTotal =
      inventoryCounts?.totalPlots ??
      await Plot.countDocuments({
        projectId: project._id,
      });

    const finalAvailable =
      inventoryCounts?.availablePlots ??
      await Plot.countDocuments({
        projectId: project._id,
        status: "Available",
      });

    const finalReserved =
      inventoryCounts?.reservedPlots ??
      await Plot.countDocuments({
        projectId: project._id,
        status: "Reserved",
      });

    const finalSold =
      inventoryCounts?.soldPlots ??
      await Plot.countDocuments({
        projectId: project._id,
        status: "Sold",
      });

    res.status(200).json({
      success: true,
      pendingApproval: false,
      message: "Project updated successfully.",
      data: {
        ...project.toObject(),

        id: project.customId || project._id,

        totalPlots: finalTotal,
        availablePlots: finalAvailable,
        reservedPlots: finalReserved,
        soldPlots: finalSold,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete project (Only allowed if PENDING or REJECTED)
 * @route   DELETE /api/admin/projects/:id
 * @access  Private (Admin)
 */
export const deleteAdminProject = async (req, res, next) => {
  try {
    const project = req.project;

    // Rule: For APPROVED projects, Admin cannot directly delete; submit deletion approval request to Super Admin
    if (project.approvalStatus === "APPROVED") {
      project.pendingDeletion = true;
      project.deletionReason = req.body?.reason || "Admin requested project deletion.";
      await project.save();

      // Notify Super Admins
      try {
        const superAdmins = await User.find({ role: "SUPER_ADMIN" }).select("_id");
        for (const sa of superAdmins) {
          await createNotification({
            recipient: sa._id,
            sender: req.user._id,
            senderRole: "ADMIN",
            senderName: req.user.name || "Branch Admin",
            type: "PROJECT_DELETE_REQUESTED",
            title: "Project Deletion Requested",
            message: `${req.user.name || "Branch Admin"} requested deletion of project "${project.title}". Super Admin approval is required.`,
            metadata: {
              projectId: String(project.customId || project._id),
              projectTitle: project.title,
              adminId: String(req.user._id),
              adminName: req.user.name,
            },
          });
        }
      } catch (notifErr) {
        console.error("[ProjectDeleteRequest Notification Error]:", notifErr.message);
      }

      return res.status(200).json({
        success: true,
        pendingApproval: true,
        message: "Deletion request submitted. Super Administrator approval is required before removal.",
        data: project,
      });
    }

    // For unapproved projects (PENDING / REJECTED), direct deletion is permitted
    await Plot.deleteMany({ projectId: project._id });
    await project.deleteOne();

    res.status(200).json({
      success: true,
      message: "Project and its plots were deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload project cover/layout image to Cloudinary (Admin / Branch Admin)
 * @route   POST /api/admin/projects/upload-image OR /api/admin/projects/:id/upload-image
 * @access  Private (Admin)
 */
export const uploadProjectImageAdmin = async (req, res, next) => {
  try {
    const { fileData, mimeType, width, height } = req.body;
    if (!fileData) {
      return res.status(400).json({
        success: false,
        message: "No image file data provided.",
      });
    }

    const tenantId = req.user.tenantId || req.user._id;
    const projectId = req.params.id || "new_project";

    const uploadResult = await storageService.uploadLayoutImage({
      fileData,
      mimeType: mimeType || "image/png",
      projectId,
      tenantId,
    });

    res.status(200).json({
      success: true,
      message: "Image uploaded successfully.",
      data: {
        imageUrl: uploadResult.imageUrl,
        publicId: uploadResult.publicId,
        provider: uploadResult.provider,
        width: uploadResult.width || width || 0,
        height: uploadResult.height || height || 0,
        format: uploadResult.format,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code || "UPLOAD_ERROR",
      });
    }
    next(error);
  }
};

/**
 * @desc    Get project layout configuration for admin
 * @route   GET /api/admin/projects/:id/layout
 * @access  Private (Admin)
 */
export const getProjectLayoutAdmin = async (req, res, next) => {
  try {
    const project = req.project;
    if (!project || project.isArchived) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    const plots = await Plot.find({ projectId: project._id }).sort({ plotNumber: 1 });

    res.status(200).json({
      success: true,
      data: {
        layout: project.layout || {
          referenceImageUrl: "",
          imageUrl: "",
          provider: "cloudinary",
          publicId: "",
          version: 1,
          width: 1200,
          height: 800,
          compassOrientation: 0,
          blocks: [],
          roads: [],
          commonAreas: [],
          regions: [],
        },
        plots: plots.map((p) => ({
          _id: p._id,
          id: p.customId || p._id,
          plotNumber: p.plotNumber,
          status: p.status,
          size: p.size,
          facing: p.facing,
          price: p.price,
        })),
        storageConfigured: storageService.isConfigured(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Save project layout configuration for admin
 * @route   PUT /api/admin/projects/:id/layout
 * @access  Private (Admin)
 */
export const saveProjectLayoutAdmin = async (req, res, next) => {
  try {
    const project = req.project;
    const { layout } = req.body;

    if (!layout || typeof layout !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid layout data payload.",
      });
    }

    if (!project || project.isArchived) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    // 1. Fetch all real plots belonging to this project
    const projectPlots = await Plot.find({ projectId: project._id });
    const plotIdMap = new Map();
    projectPlots.forEach((p) => {
      plotIdMap.set(String(p._id), p);
      if (p.customId) plotIdMap.set(String(p.customId), p);
    });

    const validatedRegions = [];
    const seenPlotIds = new Set();
    const rawRegions = Array.isArray(layout.regions) ? layout.regions : [];

    for (let i = 0; i < rawRegions.length; i++) {
      const region = rawRegions[i];
      if (!region) continue;

      const rawPlotId = String(region.plotId || "").trim();
      const matchedPlot = plotIdMap.get(rawPlotId);

      if (!matchedPlot) {
        return res.status(400).json({
          success: false,
          message: `Region at index ${i} references invalid Plot ID "${rawPlotId}". Plot does not belong to this project or branch.`,
        });
      }

      const standardPlotId = String(matchedPlot._id);
      if (seenPlotIds.has(standardPlotId)) {
        return res.status(400).json({
          success: false,
          message: `Duplicate plot mapping: Plot "${matchedPlot.plotNumber}" is assigned to multiple layout regions.`,
        });
      }
      seenPlotIds.add(standardPlotId);

      if (!Array.isArray(region.points) || region.points.length < 3) {
        return res.status(400).json({
          success: false,
          message: `Region for plot "${matchedPlot.plotNumber}" must contain at least 3 polygon coordinate vertices.`,
        });
      }

      const cleanPoints = [];
      for (const pt of region.points) {
        const x = Number(pt.x);
        const y = Number(pt.y);
        if (isNaN(x) || isNaN(y) || x < 0 || x > 100 || y < 0 || y > 100) {
          return res.status(400).json({
            success: false,
            message: `Invalid coordinate [${pt.x}, ${pt.y}] in plot "${matchedPlot.plotNumber}". Normalized coordinates must be between 0 and 100.`,
          });
        }
        cleanPoints.push({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
      }

      const rawBlockId = region.blockId ? String(region.blockId).trim() : "";
      const rawBlockName = region.block ? String(region.block).trim() : "";

      validatedRegions.push({
        id: region.id || `reg_${Date.now()}_${i}`,
        plotId: matchedPlot._id,
        plotNumber: matchedPlot.plotNumber,
        blockId: rawBlockId,
        block: rawBlockName,
        shapeType: "polygon",
        points: cleanPoints,
        labelPosition: region.labelPosition && !isNaN(region.labelPosition.x) && !isNaN(region.labelPosition.y)
          ? { x: Number(region.labelPosition.x), y: Number(region.labelPosition.y) }
          : undefined,
      });
    }

    // 2. Validate roads if present
    const rawRoads = Array.isArray(layout.roads) ? layout.roads : [];
    const validatedRoads = [];
    for (let i = 0; i < rawRoads.length; i++) {
      const road = rawRoads[i];
      if (!road || !Array.isArray(road.points) || road.points.length < 2) continue;
      const cleanPoints = [];
      let valid = true;
      for (const pt of road.points) {
        const x = Number(pt.x);
        const y = Number(pt.y);
        if (isNaN(x) || isNaN(y) || x < 0 || x > 100 || y < 0 || y > 100) {
          valid = false;
          break;
        }
        cleanPoints.push({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
      }
      if (valid && cleanPoints.length >= 2) {
        validatedRoads.push({
          id: road.id || `road_${Date.now()}_${i}`,
          name: road.name ? String(road.name).trim() : `Road ${i + 1}`,
          widthFt: road.widthFt ? String(road.widthFt).trim() : "30 Ft",
          points: cleanPoints,
        });
      }
    }

    // 3. Validate common areas if present
    const rawCommonAreas = Array.isArray(layout.commonAreas) ? layout.commonAreas : [];
    const validatedCommonAreas = [];
    for (let i = 0; i < rawCommonAreas.length; i++) {
      const area = rawCommonAreas[i];
      if (!area || !Array.isArray(area.points) || area.points.length < 3) continue;
      const cleanPoints = [];
      let valid = true;
      for (const pt of area.points) {
        const x = Number(pt.x);
        const y = Number(pt.y);
        if (isNaN(x) || isNaN(y) || x < 0 || x > 100 || y < 0 || y > 100) {
          valid = false;
          break;
        }
        cleanPoints.push({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
      }
      if (valid && cleanPoints.length >= 3) {
        validatedCommonAreas.push({
          id: area.id || `common_${Date.now()}_${i}`,
          name: area.name ? String(area.name).trim() : `Park ${i + 1}`,
          type: area.type ? String(area.type).trim() : "park",
          points: cleanPoints,
        });
      }
    }

    // Optimistic Concurrency check
    const currentVersion = (project.layout && project.layout.version) || 0;
    if (layout.expectedVersion !== undefined && layout.expectedVersion !== null) {
      if (Number(layout.expectedVersion) !== currentVersion) {
        return res.status(409).json({
          success: false,
          conflict: true,
          message: `Conflict: Layout has been updated by another user (Server revision ${currentVersion}, client expected ${layout.expectedVersion}). Please reload before saving.`,
        });
      }
    }

    const oldPublicId = project.layout?.publicId;
    const newPublicId = layout.publicId;

    const referenceImg = layout.referenceImageUrl || layout.imageUrl || project.layout?.referenceImageUrl || project.layout?.imageUrl || "";

    const updatedLayout = {
      referenceImageUrl: referenceImg ? String(referenceImg).trim() : "",
      imageUrl: referenceImg ? String(referenceImg).trim() : "",
      provider: layout.provider || "cloudinary",
      publicId: newPublicId || oldPublicId || "",
      version: currentVersion + 1,
      width: Number(layout.width) || project.layout?.width || 1200,
      height: Number(layout.height) || project.layout?.height || 800,
      compassOrientation: Number(layout.compassOrientation) || 0,
      blocks: Array.isArray(layout.blocks)
        ? layout.blocks.map((b) => ({
            id: String(b.id || b.name).trim(),
            name: String(b.name || b.id).trim(),
            color: b.color || "#3b82f6",
            description: b.description ? String(b.description).trim() : "",
          }))
        : project.layout?.blocks || [],
      roads: validatedRoads,
      commonAreas: validatedCommonAreas,
      regions: validatedRegions,
    };

    project.layout = updatedLayout;
    if (referenceImg && (!project.image || project.image === "")) {
      project.image = referenceImg;
      if (!Array.isArray(project.images) || project.images.length === 0) {
        project.images = [referenceImg];
      }
    }
    await project.save();

    if (oldPublicId && newPublicId && oldPublicId !== newPublicId) {
      storageService.deleteLayoutImage(oldPublicId, project._id).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: "Project layout saved and published successfully.",
      data: project.layout,
    });
  } catch (error) {
    next(error);
  }
};

