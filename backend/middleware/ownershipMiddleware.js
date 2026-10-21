import mongoose from "mongoose";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";

/**
 * Universal project finder supporting both MongoDB _id and customId (integer).
 */
export const findProjectByIdentifier = async (id) => {
  if (!id) return null;
  const strId = String(id).trim();

  // If 24-char hex string, try ObjectId first
  if (/^[0-9a-fA-F]{24}$/.test(strId)) {
    const byId = await Project.findById(strId);
    if (byId) return byId;
  }

  // Try numeric customId
  const numericId = Number(strId);
  if (!isNaN(numericId)) {
    const byCustomId = await Project.findOne({ customId: numericId });
    if (byCustomId) return byCustomId;
  }

  // Try case-insensitive title or slug match (e.g. "green-meadows" -> "Green Meadows")
  const escaped = strId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexPattern = escaped.replace(/[-_]+/g, "[\\s_\\-]+");
  try {
    const byTitle = await Project.findOne({
      title: { $regex: new RegExp(`^${regexPattern}$`, "i") }
    });
    if (byTitle) return byTitle;
  } catch (err) {
    console.warn("[findProjectByIdentifier] Regex match warning:", err.message);
  }

  if (mongoose.Types.ObjectId.isValid(strId)) {
    return await Project.findById(strId);
  }

  return null;
};

/**
 * Universal plot finder supporting both MongoDB _id and customId (string, e.g. "1-1").
 */
export const findPlotByIdentifier = async (id) => {
  if (!id) return null;
  const strId = String(id).trim();

  // Try customId first (e.g. "1-1")
  const byCustomId = await Plot.findOne({ customId: strId });
  if (byCustomId) return byCustomId;

  // If 24-char hex string, try ObjectId
  if (/^[0-9a-fA-F]{24}$/.test(strId)) {
    return await Plot.findById(strId);
  }

  if (mongoose.Types.ObjectId.isValid(strId)) {
    return await Plot.findById(strId);
  }

  return null;
};

/**
 * Middleware ensuring that the Project referenced by req.params.id (or req.params.projectId)
 * is owned by the authenticated admin (req.user._id).
 */
export const verifyProjectOwnership = async (req, res, next) => {
  try {
    const projectId = req.params.projectId || req.params.id;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project identifier is required.",
      });
    }

    const project = await findProjectByIdentifier(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found.",
      });
    }

    // Verify ownership
    if (!project.adminId || project.adminId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not own or have permission to access this project.",
      });
    }

    req.project = project;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware ensuring that the Plot referenced by req.params.id belongs to a project
 * owned by the authenticated admin.
 */
export const verifyPlotOwnership = async (req, res, next) => {
  try {
    const plotId = req.params.id;

    if (!plotId) {
      return res.status(400).json({
        success: false,
        message: "Plot identifier is required.",
      });
    }

    const plot = await findPlotByIdentifier(plotId);

    if (!plot) {
      return res.status(404).json({
        success: false,
        message: "Plot not found.",
      });
    }

    const parentProject = await Project.findById(plot.projectId);

    if (!parentProject) {
      return res.status(404).json({
        success: false,
        message: "Parent project for this plot does not exist.",
      });
    }

    if (!parentProject.adminId || parentProject.adminId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to modify plots for this project.",
      });
    }

    req.plot = plot;
    req.parentProject = parentProject;
    next();
  } catch (error) {
    next(error);
  }
};
