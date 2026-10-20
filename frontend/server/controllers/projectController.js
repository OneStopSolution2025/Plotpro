import Project from "../models/Project.js";
import Plot from "../models/Plot.js";

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
  "distance",
  "projectSize",
  "status",
  "launchDate",
  "image",
  "images",
  "about",
  "benefits",
  "highlights",
  "amenities",
  "locationConnectivity",
];

/**
 * Helper to parse price string to Lakhs.
 */
const parsePriceLakhs = (plotPrice) => {
  if (!plotPrice || typeof plotPrice !== "string") return 0;
  const cleaned = plotPrice.replace(/[₹,]/g, "").trim();
  const lakhMatch = cleaned.match(/([\d.]+)\s*[Ll]akh/i);
  if (lakhMatch) return parseFloat(lakhMatch[1]);
  const numMatch = cleaned.match(/^([\d.]+)$/);
  if (numMatch) {
    const num = parseFloat(numMatch[1]);
    return num >= 1000 ? num / 100000 : num;
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
    const projects = await Project.find({
      adminId: req.user._id,
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

    // Determine next integer customId
    const maxProject = await Project.findOne().sort({ customId: -1 });
    const nextCustomId = maxProject && maxProject.customId ? maxProject.customId + 1 : 1;

    const newProject = await Project.create({
      ...sanitized,
      customId: nextCustomId,
      adminId: req.user._id,
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
          image: newProject.image || "",
          images: newProject.images || [],
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
          image: newProject.image || "",
          images: newProject.images || [],
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
          image: newProject.image || "",
          images: newProject.images || [],
        });
        plotIdx++;
      }

      if (plotsToInsert.length > 0) {
        await Plot.insertMany(plotsToInsert);
      }
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
export const updateAdminProject = async (req, res, next) => {
  try {
    const project = req.project;
    const sanitized = sanitizeProjectInput(req.body);

    // Apply edits directly to the project
    Object.assign(project, sanitized);

    // Clear any previous staged updates
    project.pendingUpdates = null;
    project.hasPendingUpdates = false;

    // If project was REJECTED, applying edits resubmits it as PENDING for initial approval
    if (project.approvalStatus === "REJECTED") {
      project.approvalStatus = "PENDING";
      project.rejectionReason = "";
    }

    await project.save();

    res.status(200).json({
      success: true,
      pendingApproval: false,
      message: "Project updated successfully.",
      data: project,
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

    // Rule: Admin CANNOT delete an APPROVED project
    if (project.approvalStatus === "APPROVED") {
      return res.status(403).json({
        success: false,
        message: "Approved projects cannot be deleted by an Admin. Please contact Super Administrator to archive this project.",
      });
    }

    // Delete associated plots
    await Plot.deleteMany({ projectId: project._id });
    await project.deleteOne();

    res.status(200).json({
      success: true,
      message: "Pending project and its plots were deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};
