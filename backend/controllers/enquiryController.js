import Enquiry from "../models/Enquiry.js";
import Project from "../models/Project.js";
import Branch from "../models/Branch.js";
import User from "../models/User.js";
import Plot from "../models/Plot.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { findProjectByIdentifier } from "../middleware/ownershipMiddleware.js";
import { getTenantContext } from "./superAdminController.js";
import { recordUnknownUserData } from "../utils/guestDataService.js";
import { getJwtSecret } from "../config/jwtConfig.js";

/**
 * @desc    Submit public enquiry (resolves project, branch, branchAdmin, tenantId)
 * @route   POST /api/public/enquiries
 * @access  Public
 */
export const submitPublicEnquiry = async (req, res, next) => {
  try {
    const { fullName, email, mobile, contactMethod, message, projectId, plot } = req.body;

    if (!fullName || !mobile) {
      return res.status(400).json({
        success: false,
        message: "Full name and mobile number are required.",
      });
    }

    let assignedAdminId = null;
    let resolvedProjectId = null;
    let branchId = null;
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

    if (projectId) {
      const project = await findProjectByIdentifier(projectId);
      if (!project || project.approvalStatus !== "APPROVED" || project.isArchived) {
        return res.status(400).json({
          success: false,
          message: "Cannot submit an enquiry for an unapproved or nonexistent project.",
        });
      }
      resolvedProjectId = project._id;
      assignedAdminId = project.adminId || null;
      branchId = project.branchId || null;

      // If branchId is present, resolve tenantId & fallback branchAdmin
      if (branchId) {
        const branch = await Branch.findById(branchId);
        if (branch) {
          tenantId = branch.tenantId;
          if (!assignedAdminId && branch.branchAdmin) {
            assignedAdminId = branch.branchAdmin;
          }
        }
      }

      // If branch was not directly on project, check if project.adminId has a branch
      if (!branchId && assignedAdminId) {
        const admin = await User.findById(assignedAdminId);
        if (admin) {
          if (admin.branchId) branchId = admin.branchId;
          if (!tenantId && admin.tenantId) tenantId = admin.tenantId;
        }
      }

      // Fallback tenant to project.approvedBy if still not resolved
      if (!tenantId && project.approvedBy) {
        tenantId = project.approvedBy;
      }
    }

    const initialActivity = {
      action: "ENQUIRY_CREATED",
      newStatus: "NEW",
      notes: message ? message.trim() : "Enquiry submitted by customer.",
      performedByName: fullName.trim(),
      performedByRole: "CUSTOMER",
      timestamp: new Date(),
    };

    const enquiry = await Enquiry.create({
      fullName: fullName.trim(),
      email: email ? email.trim() : "",
      mobile: mobile.trim(),
      contactMethod: contactMethod || "phone",
      message: message ? message.trim() : "",
      projectId: resolvedProjectId,
      plot: plot ? String(plot).trim() : "",
      branchId,
      assignedAdminId,
      tenantId,
      customerId,
      status: "NEW",
      activityLog: [initialActivity],
      lastActivity: {
        action: "ENQUIRY_CREATED",
        performedByName: fullName.trim(),
        timestamp: new Date(),
        newStatus: "NEW",
        notes: message ? message.trim() : "Enquiry submitted by customer.",
      },
    });

    // If submitted as a guest without authenticated customerId, record in UnknownUserData
    if (!customerId && email) {
      await recordUnknownUserData({
        email: email.trim(),
        fullName: fullName.trim(),
        mobile: mobile.trim(),
        formType: "ENQUIRY",
        referenceId: enquiry._id,
        projectId: resolvedProjectId,
        plot: plot ? String(plot).trim() : "",
        formData: { contactMethod, message: message ? message.trim() : "" },
      });
    }

    res.status(201).json({
      success: true,
      message: "Your enquiry has been submitted successfully.",
      data: enquiry,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get enquiries assigned to the authenticated admin or their branch
 * @route   GET /api/admin/enquiries
 * @access  Private (Admin)
 */
export const getAdminEnquiries = async (req, res, next) => {
  try {
    const projectQuery = {
      $or: [
        { adminId: req.user._id },
        ...(req.user.branchId ? [{ branchId: req.user.branchId }] : []),
      ],
    };
    const adminProjects = await Project.find(projectQuery).select("_id");
    const projectIds = adminProjects.map((p) => p._id);

    const enquiries = await Enquiry.find({
      $or: [
        { assignedAdminId: req.user._id },
        ...(req.user.branchId ? [{ branchId: req.user.branchId }] : []),
        ...(projectIds.length > 0 ? [{ projectId: { $in: projectIds } }] : []),
      ],
    })
      .populate("projectId", "title customId location branchId adminId")
      .populate("branchId", "name city region")
      .populate("assignedAdminId", "name email phone")
      .populate("activityLog.performedBy", "name email role")
      .sort({ createdAt: -1 });

    // Enrich with plot availability if enquiry.plot exists (read-only reference)
    const enriched = await Promise.all(
      enquiries.map(async (e) => {
        const obj = e.toObject();
        if (e.projectId && e.plot) {
          const plotDoc = await Plot.findOne({
            projectId: e.projectId._id,
            plotNumber: e.plot,
          }).select("status price size facing");
          if (plotDoc) {
            obj.plotDetails = {
              status: plotDoc.status,
              price: plotDoc.price,
              size: plotDoc.size,
              facing: plotDoc.facing,
            };
          }
        }
        return obj;
      })
    );

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
 * @desc    Update enquiry status for an admin-owned enquiry
 * @route   PATCH /api/admin/enquiries/:id/status
 * @access  Private (Admin)
 */
export const updateEnquiryStatusAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const enquiry = await Enquiry.findById(id);

    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found." });
    }

    let isAuthorized =
      (enquiry.assignedAdminId && String(enquiry.assignedAdminId) === String(req.user._id)) ||
      (req.user.branchId && enquiry.branchId && String(enquiry.branchId) === String(req.user.branchId));

    if (!isAuthorized && enquiry.projectId) {
      const ownedProject = await Project.findOne({
        _id: enquiry.projectId,
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
        message: "Forbidden: You are not authorized to update this enquiry.",
      });
    }

    if (!["NEW", "CONTACTED", "FOLLOW_UP", "CLOSED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: NEW, CONTACTED, FOLLOW_UP, CLOSED.",
      });
    }

    const prevStatus = enquiry.status;
    enquiry.status = status;

    const activityItem = {
      action: "STATUS_CHANGE",
      previousStatus: prevStatus,
      newStatus: status,
      notes: notes ? notes.trim() : "",
      performedBy: req.user._id,
      performedByName: req.user.name || "Branch Admin",
      performedByRole: req.user.role || "ADMIN",
      timestamp: new Date(),
    };

    enquiry.activityLog.push(activityItem);
    enquiry.lastActivity = {
      action: "STATUS_CHANGE",
      performedByName: req.user.name || "Branch Admin",
      timestamp: new Date(),
      newStatus: status,
      notes: notes ? notes.trim() : `Status changed to ${status}`,
    };

    await enquiry.save();

    const populated = await Enquiry.findById(enquiry._id)
      .populate("projectId", "title customId location branchId adminId")
      .populate("branchId", "name city region")
      .populate("assignedAdminId", "name email phone")
      .populate("activityLog.performedBy", "name email role");

    res.status(200).json({
      success: true,
      message: "Enquiry status updated successfully.",
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Log activity / touchpoint for an enquiry without changing status (Branch Admin)
 * @route   POST /api/admin/enquiries/:id/activity
 * @access  Private (Admin)
 */
export const logEnquiryActivityAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;

    if (!action) {
      return res.status(400).json({ success: false, message: "Action is required." });
    }

    const enquiry = await Enquiry.findById(id);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found." });
    }

    let isAuthorized =
      (enquiry.assignedAdminId && String(enquiry.assignedAdminId) === String(req.user._id)) ||
      (req.user.branchId && enquiry.branchId && String(enquiry.branchId) === String(req.user.branchId));

    if (!isAuthorized && enquiry.projectId) {
      const ownedProject = await Project.findOne({
        _id: enquiry.projectId,
        $or: [
          { adminId: req.user._id },
          ...(req.user.branchId ? [{ branchId: req.user.branchId }] : []),
        ],
      });
      if (ownedProject) isAuthorized = true;
    }

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You are not authorized to log activity for this enquiry.",
      });
    }

    const activityItem = {
      action: action.trim(),
      previousStatus: enquiry.status,
      newStatus: enquiry.status,
      notes: notes ? notes.trim() : "",
      performedBy: req.user._id,
      performedByName: req.user.name || "Branch Admin",
      performedByRole: req.user.role || "ADMIN",
      timestamp: new Date(),
    };

    enquiry.activityLog.push(activityItem);
    enquiry.lastActivity = {
      action: action.trim(),
      performedByName: req.user.name || "Branch Admin",
      timestamp: new Date(),
      newStatus: enquiry.status,
      notes: notes ? notes.trim() : "",
    };

    await enquiry.save();

    res.status(200).json({
      success: true,
      message: "Activity logged successfully.",
      data: enquiry,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all enquiries across all branches (Super Admin oversight, tenant isolated)
 * @route   GET /api/super-admin/enquiries?page=&limit=&search=&status=&branchId=
 * @access  Private (Super Admin)
 */
const ENQUIRY_STATUSES = ["NEW", "CONTACTED", "FOLLOW_UP", "CLOSED"];
const MAX_ENQUIRY_PAGE_SIZE = 100;

/** Escape user-supplied text before compiling it into a RegExp. */
const escapeRegExp = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Parse a positive integer query param, falling back when invalid. */
const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const getAllEnquiriesSuperAdmin = async (req, res, next) => {
  try {
    const { tenantProjectIds, tenantAdminIds } = await getTenantContext(req.user._id);

    // Super admin tenant isolation:
    // Matches tenantId directly OR projects/branches/admins belonging to this Super Admin tenant (legacy fallback)
    const tenantBranches = await Branch.find({ tenantId: req.user._id }).select("_id");
    const tenantBranchIds = tenantBranches.map((b) => b._id);

    const tenantScope = {
      $or: [
        { tenantId: req.user._id },
        ...(tenantBranchIds.length > 0 ? [{ branchId: { $in: tenantBranchIds } }] : []),
        ...(tenantProjectIds.length > 0 ? [{ projectId: { $in: tenantProjectIds } }] : []),
        ...(tenantAdminIds.length > 0 ? [{ assignedAdminId: { $in: tenantAdminIds } }] : []),
      ],
    };

    // ─── Optional filters (search / status / branch) ───────────────────
    const extraConditions = [];
    const query = req.query || {};
    const { search, status, branchId } = query;

    if (typeof search === "string" && search.trim()) {
      const rx = new RegExp(escapeRegExp(search.trim()), "i");
      extraConditions.push({
        $or: [
          { fullName: rx },
          { email: rx },
          { mobile: rx },
          { message: rx },
          { plot: rx },
        ],
      });
    }

    if (
      typeof status === "string" &&
      status.trim() &&
      status.trim().toUpperCase() !== "ALL"
    ) {
      const normalizedStatus = status.trim().toUpperCase();
      if (!ENQUIRY_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Allowed values: ${ENQUIRY_STATUSES.join(", ")}.`,
        });
      }
      extraConditions.push({ status: normalizedStatus });
    }

    if (typeof branchId === "string" && branchId.trim()) {
      const normalizedBranchId = branchId.trim();
      if (normalizedBranchId === "unassigned" || normalizedBranchId === "direct") {
        extraConditions.push({ branchId: null });
      } else if (mongoose.isValidObjectId(normalizedBranchId)) {
        extraConditions.push({ branchId: normalizedBranchId });
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid branchId.",
        });
      }
    }

    const filter =
      extraConditions.length > 0
        ? { $and: [tenantScope, ...extraConditions] }
        : tenantScope;

    // ─── Optional pagination (backward compatible) ─────────────────────
    // When `limit` is omitted the full list is returned, preserving the
    // original behaviour for dashboards that aggregate client-side.
    const paginationRequested =
      query.limit !== undefined && String(query.limit).trim() !== "";

    const page = parsePositiveInt(query.page, 1);
    const limit = Math.min(
      parsePositiveInt(query.limit, 20),
      MAX_ENQUIRY_PAGE_SIZE
    );
    const skip = (page - 1) * limit;

    const total = paginationRequested
      ? await Enquiry.countDocuments(filter)
      : null;

    let enquiryQuery = Enquiry.find(filter)
      .populate({
        path: "projectId",
        select: "title customId location branchId adminId",
        populate: { path: "branchId", select: "name city region" },
      })
      .populate("branchId", "name city region branchAdmin")
      .populate("assignedAdminId", "name email phone role branchId")
      .populate("activityLog.performedBy", "name email role")
      .sort({ createdAt: -1 });

    if (paginationRequested) {
      enquiryQuery = enquiryQuery.skip(skip).limit(limit);
    }

    const enquiries = await enquiryQuery;

    // Enrich with plot availability if enquiry has plot & project (read-only)
    const enriched = await Promise.all(
      enquiries.map(async (e) => {
        const obj = e.toObject();

        // Safe branch & admin fallback resolution for older records
        if (!obj.branchId && obj.projectId?.branchId) {
          obj.branchId = obj.projectId.branchId;
        }

        if (e.projectId && e.plot) {
          const plotDoc = await Plot.findOne({
            projectId: e.projectId._id,
            plotNumber: e.plot,
          }).select("status price size facing");
          if (plotDoc) {
            obj.plotDetails = {
              status: plotDoc.status,
              price: plotDoc.price,
              size: plotDoc.size,
              facing: plotDoc.facing,
            };
          }
        }
        return obj;
      })
    );

    const payload = {
      success: true,
      count: enriched.length,
      data: enriched,
    };

    if (paginationRequested) {
      const totalPages = Math.ceil(total / limit);
      payload.pagination = {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      };
    }

    return res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update any enquiry status (Super Admin oversight, tenant isolated)
 * @route   PATCH /api/super-admin/enquiries/:id/status
 * @access  Private (Super Admin)
 */
export const updateEnquiryStatusSuperAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const enquiry = await Enquiry.findById(id);

    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found." });
    }

    // Verify enquiry belongs to tenant
    const { tenantProjectIds, tenantAdminIds } = await getTenantContext(req.user._id);
    const tenantBranches = await Branch.find({ tenantId: req.user._id }).select("_id");
    const tenantBranchIds = tenantBranches.map((b) => String(b._id));

    const belongsToTenantDirect = enquiry.tenantId && String(enquiry.tenantId) === String(req.user._id);
    const belongsToBranch = enquiry.branchId && tenantBranchIds.includes(String(enquiry.branchId));
    const belongsToProject = enquiry.projectId && tenantProjectIds.some((pId) => String(pId) === String(enquiry.projectId));
    const belongsToAdmin = enquiry.assignedAdminId && tenantAdminIds.some((aId) => String(aId) === String(enquiry.assignedAdminId));

    if (!belongsToTenantDirect && !belongsToBranch && !belongsToProject && !belongsToAdmin) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. Enquiry does not belong to your tenant workspace.",
      });
    }

    if (!["NEW", "CONTACTED", "FOLLOW_UP", "CLOSED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: NEW, CONTACTED, FOLLOW_UP, CLOSED.",
      });
    }

    const prevStatus = enquiry.status;
    enquiry.status = status;

    const activityItem = {
      action: "STATUS_CHANGE",
      previousStatus: prevStatus,
      newStatus: status,
      notes: notes ? notes.trim() : "",
      performedBy: req.user._id,
      performedByName: req.user.name || "Super Admin",
      performedByRole: "SUPER_ADMIN",
      timestamp: new Date(),
    };

    enquiry.activityLog.push(activityItem);
    enquiry.lastActivity = {
      action: "STATUS_CHANGE",
      performedByName: req.user.name || "Super Admin",
      timestamp: new Date(),
      newStatus: status,
      notes: notes ? notes.trim() : `Status updated to ${status}`,
    };

    await enquiry.save();

    const populated = await Enquiry.findById(enquiry._id)
      .populate({
        path: "projectId",
        select: "title customId location branchId adminId",
        populate: { path: "branchId", select: "name city region" },
      })
      .populate("branchId", "name city region")
      .populate("assignedAdminId", "name email phone role")
      .populate("activityLog.performedBy", "name email role");

    res.status(200).json({
      success: true,
      message: "Enquiry status updated successfully.",
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};
