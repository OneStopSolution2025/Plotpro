import mongoose from "mongoose";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Branch from "../models/Branch.js";

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
 * Resolve the project access scope for a staff admin (role: "ADMIN").
 *
 * Two mutually exclusive, role-specific scopes — NO broad OR fallback:
 *
 *  1. ADMIN_WITH_BRANCH ("regular/Branch Admin", user.branchId set):
 *     may access ONLY projects assigned to that branch, and only while the
 *     branch is ACTIVE and still owned by the admin's own tenant.
 *
 *  2. LEGACY_ADMIN (user.branchId null):
 *     keeps the pre-existing ownership rules — strictly their own projects
 *     (adminId === user._id). Never gains access to any branch's projects.
 *
 * Returns one of:
 *   { type: "ADMIN_WITH_BRANCH", branch, filter }
 *   { type: "LEGACY_ADMIN", filter: { adminId } }
 *   { type: "INVALID", reason }            // stale/tampered branch assignment
 */
export const resolveAdminProjectScope = async (user) => {
  if (user.branchId) {
    const branch = await Branch.findById(user.branchId).select(
      "tenantId status name"
    );

    // Tamper guard: the assigned branch must still belong to the user's tenant
    if (
      !branch ||
      String(branch.tenantId) !== String(user.tenantId || "")
    ) {
      return { type: "INVALID", reason: "invalid_branch_assignment" };
    }

    if (branch.status !== "ACTIVE") {
      return { type: "INVALID", reason: "branch_deactivated" };
    }

    // Strict branch scope — deliberately NO adminId OR-condition.
    return {
      type: "ADMIN_WITH_BRANCH",
      branch,
      filter: { branchId: branch._id },
    };
  }

  return {
    type: "LEGACY_ADMIN",
    filter: { adminId: user._id },
  };
};

/**
 * Shareable 403 response for branch-scope violations.
 */
const branchScopeForbidden = (res, reason) => {
  const message =
    reason === "branch_deactivated"
      ? "Forbidden: Your branch has been deactivated. Access to projects is paused."
      : "Forbidden: Your branch assignment is invalid. Please contact your Branch Administrator.";
  return res.status(403).json({ success: false, message });
};

/**
 * Middleware ensuring that the Project referenced by req.params.id (or req.params.projectId)
 * is accessible by the authenticated staff admin (req.user._id).
 *
 * - Legacy Admin (no branch): must own the project (adminId match) — unchanged behavior.
 * - Branch Admin: must be an ACTIVE branch of their tenant, and the project
 *   must belong to that exact branch. Direct API requests to other branches'
 *   projects are rejected.
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

    const user = req.user;

    // ── Legacy Admin (no branch) — preserved ownership-only rule ────────────
    if (!user.branchId) {
      if (!project.adminId || project.adminId.toString() !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You do not own or have permission to access this project.",
        });
      }

      req.project = project;
      return next();
    }

    // ── Branch Admin — tenant ownership + strict branch scope ───────────────
    const scope = await resolveAdminProjectScope(user);
    if (scope.type === "INVALID") {
      return branchScopeForbidden(res, scope.reason);
    }

    if (
      !project.branchId ||
      project.branchId.toString() !== user.branchId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: This project is not assigned to your branch.",
      });
    }

    req.project = project;
    return next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware ensuring that the Plot referenced by req.params.id belongs to a project
 * the authenticated staff admin can access (same role-specific rules as above).
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

    const user = req.user;

    // ── Legacy Admin (no branch) — preserved ownership-only rule ────────────
    if (!user.branchId) {
      if (
        !parentProject.adminId ||
        parentProject.adminId.toString() !== user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You do not have permission to modify plots for this project.",
        });
      }

      req.plot = plot;
      req.parentProject = parentProject;
      return next();
    }

    // ── Branch Admin — tenant ownership + strict branch scope ───────────────
    const scope = await resolveAdminProjectScope(user);
    if (scope.type === "INVALID") {
      return branchScopeForbidden(res, scope.reason);
    }

    if (
      !parentProject.branchId ||
      parentProject.branchId.toString() !== user.branchId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Plots of this project are not assigned to your branch.",
      });
    }

    req.plot = plot;
    req.parentProject = parentProject;
    return next();
  } catch (error) {
    next(error);
  }
};
