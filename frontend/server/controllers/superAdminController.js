import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";
import { findProjectByIdentifier } from "../middleware/ownershipMiddleware.js";

/**
 * @desc    Get all admin users with assigned project metrics
 * @route   GET /api/super-admin/admins
 * @access  Private (Super Admin)
 */
export const getAllAdmins = async (req, res, next) => {
  try {
    const admins = await User.find({ role: "ADMIN" }).select("-passwordHash").sort({ createdAt: -1 });

    // Calculate project count and plots breakdown for each admin
    const adminsWithMetrics = await Promise.all(
      admins.map(async (admin) => {
        const adminProjects = await Project.find({
          adminId: admin._id,
          isArchived: false,
        }).select("_id customId title");

        const projectIds = adminProjects.map((p) => p._id);
        const totalPlots = await Plot.countDocuments({ projectId: { $in: projectIds } });
        const availablePlots = await Plot.countDocuments({ projectId: { $in: projectIds }, status: "Available" });
        const reservedPlots = await Plot.countDocuments({ projectId: { $in: projectIds }, status: "Reserved" });
        const soldPlots = await Plot.countDocuments({ projectId: { $in: projectIds }, status: "Sold" });

        return {
          ...admin.toObject(),
          id: String(admin._id),
          assignedProjectsCount: adminProjects.length,
          projectsCount: adminProjects.length,
          totalPlots,
          availablePlots,
          reservedPlots,
          soldPlots,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: adminsWithMetrics.length,
      data: adminsWithMetrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new admin account
 * @route   POST /api/super-admin/admins
 * @access  Private (Super Admin)
 */
export const createAdminAccount = async (req, res, next) => {
  try {
    const { name, email, mobile, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required.",
      });
    }

    const emailNormalized = email.trim().toLowerCase();
    const existing = await User.findOne({ email: emailNormalized });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password || "Admin@123", salt);

    const newAdmin = await User.create({
      name: name.trim(),
      email: emailNormalized,
      passwordHash,
      phone: mobile ? mobile.trim() : "",
      role: "ADMIN",
      status: "ACTIVE",
    });

    res.status(201).json({
      success: true,
      message: "Admin account created successfully.",
      data: {
        _id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        phone: newAdmin.phone,
        role: newAdmin.role,
        status: newAdmin.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update admin account details
 * @route   PUT /api/super-admin/admins/:id
 * @access  Private (Super Admin)
 */
export const updateAdminAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, mobile, status } = req.body;

    const admin = await User.findById(id);
    if (!admin || admin.role !== "ADMIN") {
      return res.status(404).json({ success: false, message: "Admin not found." });
    }

    if (name) admin.name = name.trim();
    if (email) admin.email = email.trim().toLowerCase();
    if (mobile) admin.phone = mobile.trim();
    if (status && ["ACTIVE", "INACTIVE"].includes(status)) admin.status = status;

    await admin.save();

    res.status(200).json({
      success: true,
      message: "Admin updated successfully.",
      data: admin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle admin status (ACTIVE / INACTIVE)
 * @route   PATCH /api/super-admin/admins/:id/status
 * @access  Private (Super Admin)
 */
export const toggleAdminStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const admin = await User.findById(id);

    if (!admin || admin.role !== "ADMIN") {
      return res.status(404).json({ success: false, message: "Admin not found." });
    }

    admin.status = admin.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await admin.save();

    res.status(200).json({
      success: true,
      message: `Admin account has been ${admin.status.toLowerCase()}.`,
      data: admin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all projects (Super Admin view across all admins)
 * @route   GET /api/super-admin/projects
 * @access  Private (Super Admin)
 */
export const getAllProjectsSuperAdmin = async (req, res, next) => {
  try {
    const projects = await Project.find({ isArchived: false })
      .populate("adminId", "name email phone")
      .sort({ customId: 1, createdAt: -1 });

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
 * @desc    Get all plots across all projects (Super Admin view)
 * @route   GET /api/super-admin/plots
 * @access  Private (Super Admin)
 */
export const getAllPlotsSuperAdmin = async (req, res, next) => {
  try {
    const plots = await Plot.find({}).sort({ projectCustomId: 1, plotNumber: 1 });

    res.status(200).json({
      success: true,
      count: plots.length,
      data: plots,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get pending projects or projects with pending updates
 * @route   GET /api/super-admin/projects/pending
 * @access  Private (Super Admin)
 */
export const getPendingProjects = async (req, res, next) => {
  try {
    const pendingProjects = await Project.find({
      isArchived: false,
      $or: [{ approvalStatus: "PENDING" }, { hasPendingUpdates: true }],
    })
      .populate("adminId", "name email phone")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: pendingProjects.length,
      data: pendingProjects,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve project or approve pending edits
 * @route   PATCH /api/super-admin/projects/:id/approve
 * @access  Private (Super Admin)
 */
export const approveProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await findProjectByIdentifier(id);

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    // If project had pending updates staged, merge them into the live document
    if (project.hasPendingUpdates && project.pendingUpdates) {
      const updates = project.pendingUpdates;
      delete updates.submittedAt;
      Object.assign(project, updates);
      project.pendingUpdates = null;
      project.hasPendingUpdates = false;
    }

    project.approvalStatus = "APPROVED";
    project.approvedAt = new Date();
    project.approvedBy = req.user._id;
    project.rejectionReason = "";

    await project.save();

    res.status(200).json({
      success: true,
      message: `Project "${project.title}" has been approved and is now live on the public website.`,
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reject project or reject pending edits
 * @route   PATCH /api/super-admin/projects/:id/reject
 * @access  Private (Super Admin)
 */
export const rejectProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const project = await findProjectByIdentifier(id);

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    // If rejecting pending edits on an already APPROVED project
    if (project.approvalStatus === "APPROVED" && project.hasPendingUpdates) {
      project.pendingUpdates = null;
      project.hasPendingUpdates = false;
      project.rejectionReason = reason || "Proposed updates were rejected by Super Admin.";
      await project.save();

      return res.status(200).json({
        success: true,
        message: "Pending updates rejected. Existing live project remains unaffected.",
        data: project,
      });
    }

    // If rejecting a brand new PENDING project
    project.approvalStatus = "REJECTED";
    project.rejectionReason = reason || "Project rejected by Super Admin.";
    await project.save();

    res.status(200).json({
      success: true,
      message: `Project "${project.title}" has been rejected.`,
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Assign or unassign a project to an admin
 * @route   PATCH /api/super-admin/projects/:id/assign
 * @access  Private (Super Admin)
 */
export const assignProjectAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { adminId } = req.body;

    const project = await findProjectByIdentifier(id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    if (adminId) {
      const adminUser = await User.findById(adminId);
      if (!adminUser || adminUser.role !== "ADMIN") {
        return res.status(400).json({ success: false, message: "Invalid admin user ID." });
      }
      project.adminId = adminUser._id;
    } else {
      project.adminId = null; // Unassigned
    }

    await project.save();

    // Note: Rule #18: Historical enquiries and site visits are NOT silently reassigned!
    res.status(200).json({
      success: true,
      message: adminId ? "Project assigned to admin successfully." : "Project marked as unassigned.",
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Soft-delete / archive an approved project
 * @route   DELETE /api/super-admin/projects/:id
 * @access  Private (Super Admin)
 */
export const archiveProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await findProjectByIdentifier(id);

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    project.isArchived = true;
    await project.save();

    res.status(200).json({
      success: true,
      message: `Project "${project.title}" has been archived and removed from public listings.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get comprehensive system analytics for Super Admin
 * @route   GET /api/super-admin/analytics
 * @access  Private (Super Admin)
 */
export const getSuperAdminAnalytics = async (req, res, next) => {
  try {
    const totalProjects = await Project.countDocuments({ isArchived: false });
    const approvedProjects = await Project.countDocuments({ isArchived: false, approvalStatus: "APPROVED" });
    const pendingProjects = await Project.countDocuments({
      isArchived: false,
      $or: [{ approvalStatus: "PENDING" }, { hasPendingUpdates: true }],
    });
    const unassignedProjects = await Project.countDocuments({
      isArchived: false,
      $or: [{ adminId: null }, { adminId: { $exists: false } }],
    });

    const totalAdmins = await User.countDocuments({ role: "ADMIN" });
    const activeAdmins = await User.countDocuments({ role: "ADMIN", status: "ACTIVE" });
    const inactiveAdmins = totalAdmins - activeAdmins;

    const totalPlots = await Plot.countDocuments();
    const availablePlots = await Plot.countDocuments({ status: "Available" });
    const reservedPlots = await Plot.countDocuments({ status: "Reserved" });
    const soldPlots = await Plot.countDocuments({ status: "Sold" });

    const totalEnquiries = await Enquiry.countDocuments();
    const newEnquiries = await Enquiry.countDocuments({ status: "NEW" });

    const totalSiteVisits = await SiteVisit.countDocuments();
    const scheduledSiteVisits = await SiteVisit.countDocuments({ status: "Scheduled" });

    // Admin performance breakdown
    const admins = await User.find({ role: "ADMIN" }).select("-passwordHash").sort({ createdAt: -1 });
    const adminPerformance = await Promise.all(
      admins.map(async (admin) => {
        const adminProjects = await Project.find({ adminId: admin._id, isArchived: false }).select("_id customId title");
        const projectIds = adminProjects.map((p) => p._id);
        const adminPlots = await Plot.find({ projectId: { $in: projectIds } });

        const pAvailable = adminPlots.filter((p) => p.status === "Available").length;
        const pReserved = adminPlots.filter((p) => p.status === "Reserved").length;
        const pSold = adminPlots.filter((p) => p.status === "Sold").length;

        return {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          phone: admin.phone || "",
          status: admin.status === "ACTIVE" ? "Active" : "Inactive",
          projectsCount: adminProjects.length,
          availablePlots: pAvailable,
          reservedPlots: pReserved,
          soldPlots: pSold,
          totalPlots: adminPlots.length,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        projects: {
          total: totalProjects,
          approved: approvedProjects,
          pending: pendingProjects,
          unassigned: unassignedProjects,
        },
        admins: {
          total: totalAdmins,
          active: activeAdmins,
          inactive: inactiveAdmins,
        },
        plots: {
          total: totalPlots,
          available: availablePlots,
          reserved: reservedPlots,
          sold: soldPlots,
        },
        enquiries: {
          total: totalEnquiries,
          new: newEnquiries,
        },
        siteVisits: {
          total: totalSiteVisits,
          scheduled: scheduledSiteVisits,
        },
        adminPerformance,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new project as Super Admin (immediately APPROVED, optionally assigned to an admin)
 * @route   POST /api/super-admin/projects
 * @access  Private (Super Admin)
 */
export const createProjectSuperAdmin = async (req, res, next) => {
  try {
    const {
      title, location, city, category, budget, status,
      plotPrice, priceLakhs, plotType, plotSizes, distance,
      projectSize, launchDate, details, image, images,
      about, benefits, highlights, amenities, locationConnectivity,
      availablePlots: availableCount, reservedPlots: reservedCount,
      soldPlots: soldCount, adminId: assignedAdminId,
    } = req.body;

    if (!title || !location || !plotPrice) {
      return res.status(400).json({
        success: false,
        message: "Title, location, and plotPrice are required.",
      });
    }

    // Validate assigned admin if provided
    let assignedAdmin = null;
    if (assignedAdminId) {
      assignedAdmin = await User.findById(assignedAdminId);
      if (!assignedAdmin || assignedAdmin.role !== "ADMIN") {
        return res.status(400).json({
          success: false,
          message: "Invalid admin ID. Please select a valid Normal Administrator.",
        });
      }
    }

    // Determine next integer customId
    const maxProject = await Project.findOne().sort({ customId: -1 });
    const nextCustomId = maxProject && maxProject.customId ? maxProject.customId + 1 : 1;

    // Parse priceLakhs if not provided
    let parsedPriceLakhs = priceLakhs;
    if (!parsedPriceLakhs && plotPrice) {
      const match = plotPrice.replace(/[₹,]/g, "").match(/([\d.]+)\s*[Ll]akh/i);
      parsedPriceLakhs = match ? parseFloat(match[1]) : 0;
    }

    const newProject = await Project.create({
      title: title.trim(),
      location: location.trim(),
      city: city || location.split(",")[0].trim(),
      category: category || "Residential",
      budget: budget || "below10",
      status: status || "Active",
      plotPrice,
      priceLakhs: parsedPriceLakhs || 0,
      plotType: plotType || "Residential",
      plotSizes: plotSizes || "",
      distance: distance || "",
      projectSize: projectSize || "",
      launchDate: launchDate || "Not announced",
      details: details || "",
      image: image || (images && images[0]) || "",
      images: images || [],
      about: about || { description: "", additionalDescription: "" },
      benefits: benefits || [],
      highlights: highlights || [],
      amenities: amenities || [],
      locationConnectivity: locationConnectivity || [],
      customId: nextCustomId,
      adminId: assignedAdmin ? assignedAdmin._id : null,
      // Super Admin projects are immediately APPROVED — no pending workflow
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
      approvedBy: req.user._id,
      rejectionReason: "",
      hasPendingUpdates: false,
      pendingUpdates: null,
      isArchived: false,
    });

    // Generate initial plots if counts are provided
    const numAvailable = Number(availableCount) || 0;
    const numReserved = Number(reservedCount) || 0;
    const numSold = Number(soldCount) || 0;
    const totalCount = numAvailable + numReserved + numSold;

    if (totalCount > 0) {
      const plotsToInsert = [];
      let plotIdx = 1;
      const defaultPlotPrice = newProject.plotPrice || "₹12 Lakh";
      const defaultPlotSize = newProject.plotSizes ? newProject.plotSizes.split("–")[0].trim() : "600 sq.ft";

      const statusList = [
        ...Array(numAvailable).fill("Available"),
        ...Array(numReserved).fill("Reserved"),
        ...Array(numSold).fill("Sold"),
      ];

      for (const plotStatus of statusList) {
        plotsToInsert.push({
          customId: `${nextCustomId}-${plotIdx}`,
          projectId: newProject._id,
          projectCustomId: nextCustomId,
          plotNumber: String(plotIdx),
          size: defaultPlotSize,
          facing: "East",
          price: defaultPlotPrice,
          status: plotStatus,
          image: newProject.image || "",
          images: newProject.images || [],
        });
        plotIdx++;
      }

      await Plot.insertMany(plotsToInsert);
    }

    res.status(201).json({
      success: true,
      message: assignedAdmin
        ? `Project "${newProject.title}" created, approved, and assigned to ${assignedAdmin.name}.`
        : `Project "${newProject.title}" created and approved. You can assign an admin from the Assignments page.`,
      data: {
        ...newProject.toObject(),
        id: newProject.customId,
        totalPlots: totalCount,
        availablePlots: numAvailable,
        reservedPlots: numReserved,
        soldPlots: numSold,
        adminId: assignedAdmin ? String(assignedAdmin._id) : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

