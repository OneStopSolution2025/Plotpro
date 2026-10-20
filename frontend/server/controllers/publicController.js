import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import {
  findProjectByIdentifier,
  findPlotByIdentifier,
} from "../middleware/ownershipMiddleware.js";

/**
 * @desc    Get all publicly visible APPROVED projects
 * @route   GET /api/public/projects
 * @access  Public
 */
export const getPublicProjects = async (req, res, next) => {
  try {
    const { category, city, plotType, minPrice, maxPrice } = req.query;

    const filter = {
      isArchived: false,
      approvalStatus: "APPROVED",
    };

    if (category && category !== "All Projects") {
      filter.category = category;
    }

    if (city) {
      filter.city = new RegExp(city.trim(), "i");
    }

    if (plotType && plotType !== "All") {
      filter.plotType = plotType;
    }

    if (minPrice || maxPrice) {
      filter.priceLakhs = {};
      if (minPrice) filter.priceLakhs.$gte = Number(minPrice);
      if (maxPrice) filter.priceLakhs.$lte = Number(maxPrice);
    }

    const projects = await Project.find(filter).sort({ customId: 1, createdAt: -1 });

    // Derive plot counters dynamically from Plot collection
    const projectsWithCounts = await Promise.all(
      projects.map(async (p) => {
        const total = await Plot.countDocuments({ projectId: p._id });
        const available = await Plot.countDocuments({ projectId: p._id, status: "Available" });
        const reserved = await Plot.countDocuments({ projectId: p._id, status: "Reserved" });
        const sold = await Plot.countDocuments({ projectId: p._id, status: "Sold" });

        return {
          ...p.toObject(),
          id: p.customId || p._id, // Backward-compatible id for frontend components
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
 * @desc    Get single approved project details (accepts customId or _id)
 * @route   GET /api/public/projects/:id
 * @access  Public
 */
export const getPublicProjectById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await findProjectByIdentifier(id);

    // Rule: Never expose PENDING or REJECTED or archived projects to the public
    if (!project || project.approvalStatus !== "APPROVED" || project.isArchived) {
      return res.status(404).json({
        success: false,
        message: "Project not found or not currently available for public viewing.",
      });
    }

    const total = await Plot.countDocuments({ projectId: project._id });
    const available = await Plot.countDocuments({ projectId: project._id, status: "Available" });
    const reserved = await Plot.countDocuments({ projectId: project._id, status: "Reserved" });
    const sold = await Plot.countDocuments({ projectId: project._id, status: "Sold" });

    res.status(200).json({
      success: true,
      data: {
        ...project.toObject(),
        id: project.customId || project._id,
        totalPlots: total,
        availablePlots: available,
        reservedPlots: reserved,
        soldPlots: sold,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get plots for an approved project
 * @route   GET /api/public/projects/:id/plots
 * @access  Public
 */
export const getPublicProjectPlots = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await findProjectByIdentifier(id);

    if (!project || project.approvalStatus !== "APPROVED" || project.isArchived) {
      return res.status(404).json({
        success: false,
        message: "Project not found or not approved.",
      });
    }

    const plots = await Plot.find({ projectId: project._id }).sort({ plotNumber: 1 });

    const formattedPlots = plots.map((plot) => ({
      ...plot.toObject(),
      id: plot.customId || plot._id, // Backward-compatible id (e.g. "1-1")
      projectId: project.customId || project._id,
    }));

    res.status(200).json({
      success: true,
      count: formattedPlots.length,
      data: formattedPlots,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single plot details (only if parent project is APPROVED)
 * @route   GET /api/public/plots/:id
 * @access  Public
 */
export const getPublicPlotById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plot = await findPlotByIdentifier(id);

    if (!plot) {
      return res.status(404).json({ success: false, message: "Plot not found." });
    }

    const parentProject = await Project.findById(plot.projectId);

    // Rule: Public cannot see plots belonging to PENDING or REJECTED projects
    if (!parentProject || parentProject.approvalStatus !== "APPROVED" || parentProject.isArchived) {
      return res.status(404).json({
        success: false,
        message: "Plot not found or not currently available for public viewing.",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...plot.toObject(),
        id: plot.customId || plot._id,
        projectId: parentProject.customId || parentProject._id,
      },
    });
  } catch (error) {
    next(error);
  }
};
