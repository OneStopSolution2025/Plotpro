import SiteVisit from "../models/SiteVisit.js";
import { findProjectByIdentifier } from "../middleware/ownershipMiddleware.js";

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

    const siteVisit = await SiteVisit.create({
      fullName: fullName.trim(),
      email: email ? email.trim() : "",
      mobile: mobile.trim(),
      preferredDate,
      preferredTime,
      message: message ? message.trim() : "",
      projectId: project._id,
      plot: plot || "",
      assignedAdminId: project.adminId || null,
      status: "Scheduled",
    });

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
 * @desc    Get site visits assigned to authenticated admin
 * @route   GET /api/admin/site-visits
 * @access  Private (Admin)
 */
export const getAdminSiteVisits = async (req, res, next) => {
  try {
    const visits = await SiteVisit.find({ assignedAdminId: req.user._id })
      .populate("projectId", "title customId location")
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

    if (!visit.assignedAdminId || visit.assignedAdminId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You are not assigned to this site visit.",
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
 * @desc    Get all site visits across all admins (Super Admin oversight)
 * @route   GET /api/super-admin/site-visits
 * @access  Private (Super Admin)
 */
export const getAllSiteVisitsSuperAdmin = async (req, res, next) => {
  try {
    const visits = await SiteVisit.find({})
      .populate("projectId", "title customId location")
      .populate("assignedAdminId", "name email phone")
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
