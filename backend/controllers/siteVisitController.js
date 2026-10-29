import SiteVisit from "../models/SiteVisit.js";
import Project from "../models/Project.js";
import Branch from "../models/Branch.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import { findProjectByIdentifier } from "../middleware/ownershipMiddleware.js";
import { getTenantContext } from "./superAdminController.js";
import { recordUnknownUserData } from "../utils/guestDataService.js";
import { getJwtSecret } from "../config/jwtConfig.js";

/**
 * @desc    Submit public site visit (requires approved project)
 * @route   POST /api/public/site-visits
 * @access  Public
 */
export const submitPublicSiteVisit = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      mobile,
      preferredDate,
      preferredTime,
      message,
      projectId,
      plot,
    } = req.body;

    if (!fullName || !mobile || !preferredDate || !preferredTime || !projectId) {
      return res.status(400).json({
        success: false,
        message: "Full name, mobile, preferred date, time, and project are required.",
      });
    }

    const project = await findProjectByIdentifier(projectId);

    // Rule: Never allow booking site visits for unapproved or archived projects
    if (!project || project.approvalStatus !== "APPROVED" || project.isArchived) {
      return res.status(400).json({
        success: false,
        message: "Site visits can only be booked for approved, active projects.",
      });
    }

    let branchId = project.branchId || null;
    let assignedAdminId = project.adminId || null;
    let tenantId = null;
    let customerId = null;

    // Optional customer token check for registered users
    if (req.headers?.authorization?.startsWith("Bearer ")) {
      try {
        const token = req.headers.authorization.split(" ")[1];
        // Best-effort customer attribution. Token payload contract (generateToken):
        // { userId, role, deviceId? } — verified with the central fail-closed
        // secret; any failure silently downgrades to a guest submission.
        const decoded = jwt.verify(token, getJwtSecret());
        if (decoded?.userId) {
          customerId = decoded.userId;
        }
      } catch {
        // Guest submission, customerId remains null
      }
    }

    if (branchId) {
      const branch = await Branch.findById(branchId);
      if (branch) {
        tenantId = branch.tenantId;
        if (!assignedAdminId && branch.branchAdmin) {
          assignedAdminId = branch.branchAdmin;
        }
      }
    }

    if (!branchId && assignedAdminId) {
      const admin = await User.findById(assignedAdminId);
      if (admin) {
        if (admin.branchId) branchId = admin.branchId;
        if (!tenantId && admin.tenantId) tenantId = admin.tenantId;
      }
    }

    if (!tenantId && project.approvedBy) {
      tenantId = project.approvedBy;
    }

    const siteVisit = await SiteVisit.create({
      fullName: fullName.trim(),
      email: email ? email.trim() : "",
      mobile: mobile.trim(),
      preferredDate,
      preferredTime,
      message: message ? message.trim() : "",
      projectId: project._id,
      plot: plot || "",
      branchId,
      assignedAdminId,
      tenantId,
      customerId,
      status: "Scheduled",
    });

    // If submitted as a guest without authenticated customerId, record in UnknownUserData
    if (!customerId && email) {
      await recordUnknownUserData({
        email: email.trim(),
        fullName: fullName.trim(),
        mobile: mobile.trim(),
        formType: "SITE_VISIT",
        referenceId: siteVisit._id,
        projectId: project._id,
        plot: plot || "",
        formData: { preferredDate, preferredTime, message: message ? message.trim() : "" },
      });
    }

    res.status(201).json({
      success: true,
      message: "Your site visit has been scheduled successfully.",
      data: siteVisit,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get site visits assigned to authenticated admin or their branch
 * @route   GET /api/admin/site-visits
 * @access  Private (Admin)
 */
export const getAdminSiteVisits = async (req, res, next) => {
  try {
    const adminProjects = await Project.find({
      $or: [
        { adminId: req.user._id },
        ...(req.user.branchId ? [{ branchId: req.user.branchId }] : []),
      ],
    }).select("_id");
    const projectIds = adminProjects.map((p) => p._id);

    const visits = await SiteVisit.find({
      $or: [
        { assignedAdminId: req.user._id },
        ...(req.user.branchId ? [{ branchId: req.user.branchId }] : []),
        ...(projectIds.length > 0 ? [{ projectId: { $in: projectIds } }] : []),
      ],
    })
      .populate("projectId", "title customId location branchId")
      .populate("branchId", "name city region")
      .sort({ preferredDate: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: visits.length,
      data: visits,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update site visit status for an admin-owned visit
 * @route   PATCH /api/admin/site-visits/:id/status
 * @access  Private (Admin)
 */
export const updateSiteVisitStatusAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const visit = await SiteVisit.findById(id);

    if (!visit) {
      return res.status(404).json({ success: false, message: "Site visit not found." });
    }

    let isAuthorized =
      (visit.assignedAdminId && visit.assignedAdminId.toString() === req.user._id.toString()) ||
      (req.user.branchId && visit.branchId && visit.branchId.toString() === req.user.branchId.toString());

    if (!isAuthorized && visit.projectId) {
      const ownedProject = await Project.findOne({
        _id: visit.projectId,
        $or: [
          { adminId: req.user._id },
          ...(req.user.branchId ? [{ branchId: req.user.branchId }] : []),
        ],
      });
      if (ownedProject) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You are not authorized to manage this site visit.",
      });
    }

    if (!["Scheduled", "Confirmed", "Completed", "Cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: Scheduled, Confirmed, Completed, Cancelled.",
      });
    }

    visit.status = status;
    await visit.save();

    res.status(200).json({
      success: true,
      message: "Site visit status updated.",
      data: visit,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all site visits across all branches (Super Admin oversight, tenant isolated)
 * @route   GET /api/super-admin/site-visits
 * @access  Private (Super Admin)
 */
export const getAllSiteVisitsSuperAdmin = async (req, res, next) => {
  try {
    const { tenantProjectIds, tenantAdminIds } = await getTenantContext(req.user._id);
    const tenantBranches = await Branch.find({ tenantId: req.user._id }).select("_id");
    const tenantBranchIds = tenantBranches.map((b) => b._id);

    const filter = {
      $or: [
        { tenantId: req.user._id },
        ...(tenantBranchIds.length > 0 ? [{ branchId: { $in: tenantBranchIds } }] : []),
        ...(tenantProjectIds.length > 0 ? [{ projectId: { $in: tenantProjectIds } }] : []),
        ...(tenantAdminIds.length > 0 ? [{ assignedAdminId: { $in: tenantAdminIds } }] : []),
      ],
    };

    const visits = await SiteVisit.find(filter)
      .populate({
        path: "projectId",
        select: "title customId location branchId adminId",
        populate: { path: "branchId", select: "name city region" },
      })
      .populate("branchId", "name city region")
      .populate("assignedAdminId", "name email phone")
      .sort({ preferredDate: 1, createdAt: -1 });

    const enriched = visits.map((v) => {
      const obj = v.toObject();
      if (!obj.branchId && obj.projectId?.branchId) {
        obj.branchId = obj.projectId.branchId;
      }
      return obj;
    });

    res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update site visit status (Super Admin oversight, tenant isolated)
 * @route   PATCH /api/super-admin/site-visits/:id/status
 * @access  Private (Super Admin)
 */
export const updateSiteVisitStatusSuperAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const visit = await SiteVisit.findById(id);
    if (!visit) {
      return res.status(404).json({ success: false, message: "Site visit not found." });
    }

    const { tenantProjectIds, tenantAdminIds } = await getTenantContext(req.user._id);
    const tenantBranches = await Branch.find({ tenantId: req.user._id }).select("_id");
    const tenantBranchIds = tenantBranches.map((b) => String(b._id));

    const belongsToTenant =
      (visit.tenantId && String(visit.tenantId) === String(req.user._id)) ||
      (visit.branchId && tenantBranchIds.includes(String(visit.branchId))) ||
      (visit.projectId && tenantProjectIds.some((pId) => String(pId) === String(visit.projectId))) ||
      (visit.assignedAdminId && tenantAdminIds.some((aId) => String(aId) === String(visit.assignedAdminId)));

    if (!belongsToTenant) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. Site visit does not belong to your tenant workspace.",
      });
    }

    if (!["Scheduled", "Confirmed", "Completed", "Cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: Scheduled, Confirmed, Completed, Cancelled.",
      });
    }

    visit.status = status;
    await visit.save();

    res.status(200).json({
      success: true,
      message: "Site visit status updated successfully.",
      data: visit,
    });
  } catch (error) {
    next(error);
  }
};
