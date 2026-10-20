import Enquiry from "../models/Enquiry.js";
import { findProjectByIdentifier } from "../middleware/ownershipMiddleware.js";
import { getTenantContext } from "./superAdminController.js";

/**
 * @desc    Submit public enquiry (resolves project adminId)
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
    }

    const enquiry = await Enquiry.create({
      fullName: fullName.trim(),
      email: email ? email.trim() : "",
      mobile: mobile.trim(),
      contactMethod: contactMethod || "phone",
      message: message ? message.trim() : "",
      projectId: resolvedProjectId,
      plot: plot || "",
      assignedAdminId,
      status: "NEW",
    });

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
 * @desc    Get enquiries assigned to the authenticated admin
 * @route   GET /api/admin/enquiries
 * @access  Private (Admin)
 */
export const getAdminEnquiries = async (req, res, next) => {
  try {
    const enquiries = await Enquiry.find({ assignedAdminId: req.user._id })
      .populate("projectId", "title customId location")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: enquiries.length,
      data: enquiries,
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
    const { status } = req.body;

    const enquiry = await Enquiry.findById(id);

    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found." });
    }

    if (!enquiry.assignedAdminId || enquiry.assignedAdminId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You are not assigned to this enquiry.",
      });
    }

    if (!["NEW", "CONTACTED", "CLOSED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: NEW, CONTACTED, CLOSED.",
      });
    }

    enquiry.status = status;
    await enquiry.save();

    res.status(200).json({
      success: true,
      message: "Enquiry status updated.",
      data: enquiry,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all enquiries across all admins (Super Admin oversight)
 * @route   GET /api/super-admin/enquiries
 * @access  Private (Super Admin)
 */
export const getAllEnquiriesSuperAdmin = async (req, res, next) => {
  try {
    const { tenantProjectIds, tenantAdminIds } = await getTenantContext(req.user._id);

    // If tenant has no projects and no staff admins, they have 0 enquiries
    if (tenantProjectIds.length === 0 && tenantAdminIds.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    const enquiries = await Enquiry.find({
      $or: [
        ...(tenantProjectIds.length > 0 ? [{ projectId: { $in: tenantProjectIds } }] : []),
        ...(tenantAdminIds.length > 0 ? [{ assignedAdminId: { $in: tenantAdminIds } }] : []),
      ],
    })
      .populate("projectId", "title customId location")
      .populate("assignedAdminId", "name email phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: enquiries.length,
      data: enquiries,
    });
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
    const { status } = req.body;

    const enquiry = await Enquiry.findById(id);

    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found." });
    }

    // Verify enquiry belongs to tenant
    const { tenantProjectIds, tenantAdminIds } = await getTenantContext(req.user._id);
    const belongsToProject = enquiry.projectId && tenantProjectIds.some((pId) => String(pId) === String(enquiry.projectId));
    const belongsToAdmin = enquiry.assignedAdminId && tenantAdminIds.some((aId) => String(aId) === String(enquiry.assignedAdminId));

    if (!belongsToProject && !belongsToAdmin) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. Enquiry does not belong to your tenant workspace.",
      });
    }

    if (!["NEW", "CONTACTED", "CLOSED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: NEW, CONTACTED, CLOSED.",
      });
    }

    enquiry.status = status;
    await enquiry.save();

    res.status(200).json({
      success: true,
      message: "Enquiry status updated.",
      data: enquiry,
    });
  } catch (error) {
    next(error);
  }
};

