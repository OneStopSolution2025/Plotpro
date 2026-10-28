import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import Branch from "../models/Branch.js";
import { findProjectByIdentifier } from "../middleware/ownershipMiddleware.js";
import { createNotification } from "./notificationController.js";
import { storageService } from "../services/storageService.js";

/**
 * Helper to resolve tenant admins, projects, and plot IDs for a Super Admin
 */
export const getTenantContext = async (superAdminId) => {
  const tenantAdmins = await User.find({
    role: "ADMIN",
    tenantId: superAdminId,
  }).select("_id");
  const tenantAdminIds = tenantAdmins.map((a) => a._id);

  const tenantProjects = await Project.find({
    isArchived: false,
    $or: [
      { approvedBy: superAdminId },
      ...(tenantAdminIds.length > 0 ? [{ adminId: { $in: tenantAdminIds } }] : []),
    ],
  }).select("_id customId title adminId approvedBy approvalStatus hasPendingUpdates pendingDeletion");

  const tenantProjectIds = tenantProjects.map((p) => p._id);

  return {
    tenantAdminIds,
    tenantProjects,
    tenantProjectIds,
  };
};

/**
 * Check if a specific project belongs to the given Super Admin's tenant
 */
export const isProjectInTenant = (project, superAdminId, tenantAdminIds) => {
  if (!project) return false;
  if (project.approvedBy && String(project.approvedBy) === String(superAdminId)) {
    return true;
  }
  if (project.adminId && tenantAdminIds.some((id) => String(id) === String(project.adminId))) {
    return true;
  }
  return false;
};

/**
 * @desc    Get all admin users with assigned project metrics
 * @route   GET /api/super-admin/admins
 * @access  Private (Super Admin)
 */
export const getAllAdmins = async (req, res, next) => {
  try {
    // Strictly tenant-isolated query: admins belonging to this Super Admin
    const tenantFilter = {
      role: "ADMIN",
      tenantId: req.user._id,
    };
    const admins = await User.find(tenantFilter).select("-passwordHash").sort({ createdAt: -1 });

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

    // ─── Seat Limit & Subscription Validation ──────────────────────────────────
    // Find active subscription for this subscriber
    const activeSub = await Subscription.findOne({
      subscriberId: req.user._id,
    }).populate("planId");

    let subscriptionToUse = activeSub;

    // Check if subscription exists and is valid
    if (activeSub) {
      if (activeSub.status !== "ACTIVE" && activeSub.status !== "TRIAL") {
        return res.status(403).json({
          success: false,
          message: `Subscription is ${activeSub.status.toLowerCase()}. Cannot add Admin accounts. Please contact platform support.`,
        });
      }
      if (new Date(activeSub.expiryDate) <= new Date()) {
        return res.status(403).json({
          success: false,
          message: "Your subscription has expired. Please renew your plan to manage Admin accounts.",
        });
      }
    }

    // Direct, ground-truth seat limit check based on actual active admins in database
    const currentActiveAdmins = await User.countDocuments({
      role: "ADMIN",
      tenantId: req.user._id,
      status: "ACTIVE",
    });

    const maxAllowedSeats = subscriptionToUse ? subscriptionToUse.getEffectiveSeats() : 0;
    const lifetimeAssigned = Math.max(
      subscriptionToUse?.lifetimeAssignedSeats || 0,
      currentActiveAdmins
    );

    if (currentActiveAdmins >= maxAllowedSeats || lifetimeAssigned >= maxAllowedSeats) {
      return res.status(400).json({
        success: false,
        message: `Admin seat limit reached (${maxAllowedSeats} max). Deleting an admin does not provide extra seats. Please upgrade your subscription plan.`,
      });
    }

    // Atomic seat reservation if a subscription record exists
    let reservedSubscription = null;
    if (subscriptionToUse) {
      reservedSubscription = await Subscription.findOneAndUpdate(
        {
          _id: subscriptionToUse._id,
          status: { $in: ["ACTIVE", "TRIAL"] },
          expiryDate: { $gt: new Date() },
          $expr: {
            $and: [
              { $lt: ["$usedSeats", "$assignedSeats"] },
              { $lt: [{ $ifNull: ["$lifetimeAssignedSeats", 0] }, "$assignedSeats"] },
            ],
          },
        },
        {
          $inc: {
            usedSeats: 1,
            lifetimeAssignedSeats: 1,
          },
        },
        { returnDocument: "after" }
      );

      if (!reservedSubscription) {
        return res.status(400).json({
          success: false,
          message: `Admin seat limit reached (${maxAllowedSeats} max). Deleting an admin does not provide extra seats. Please upgrade your subscription plan.`,
        });
      }
    }

    const emailNormalized = email.trim().toLowerCase();
    const existing = await User.findOne({ email: emailNormalized }).select("+passwordHash");

    if (existing) {
      // If already ADMIN or SUPER_ADMIN — reject and rollback reservation
      if (existing.role === "ADMIN") {
        if (reservedSubscription) {
          await Subscription.updateOne({ _id: reservedSubscription._id }, { $inc: { usedSeats: -1 } });
        }
        return res.status(400).json({
          success: false,
          message: "This email already belongs to an Admin account.",
        });
      }
      if (existing.role === "SUPER_ADMIN" || existing.role === "SUPREME_ADMIN") {
        if (reservedSubscription) {
          await Subscription.updateOne({ _id: reservedSubscription._id }, { $inc: { usedSeats: -1 } });
        }
        return res.status(400).json({
          success: false,
          message: "This email belongs to an administrative account and cannot be reassigned.",
        });
      }

      // Existing USER account — upgrade role to ADMIN and assign tenantId
      existing.role = "ADMIN";
      existing.status = "ACTIVE";
      existing.tenantId = req.user._id;
      if (name && name.trim()) existing.name = name.trim();
      if (mobile && mobile.trim()) existing.phone = mobile.trim();
      if (password) {
        const salt = await bcrypt.genSalt(10);
        existing.passwordHash = await bcrypt.hash(password, salt);
      }
      await existing.save();

      await createNotification({
        recipient: existing._id,
        sender: req.user._id,
        senderRole: "SUPER_ADMIN",
        senderName: req.user.name || "Super Admin",
        type: "ADMIN_WELCOME",
        title: "Your account has been upgraded!",
        message: `Your DreamCity account has been upgraded to Administrator by Super Administrator.`,
        metadata: {
          adminId: String(existing._id),
          adminName: existing.name,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Existing user account upgraded to Admin successfully.",
        data: {
          _id: existing._id,
          name: existing.name,
          email: existing.email,
          phone: existing.phone,
          role: existing.role,
          status: existing.status,
          tenantId: existing.tenantId,
        },
      });
    }

    // No existing account — create fresh admin account
    let newAdmin;
    try {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password || "Admin@123", salt);

      newAdmin = await User.create({
        name: name.trim(),
        email: emailNormalized,
        passwordHash,
        phone: mobile ? mobile.trim() : "",
        role: "ADMIN",
        status: "ACTIVE",
        tenantId: req.user._id,
      });

      // Synchronize subscription usedSeats to actual count of active admins
      if (subscriptionToUse) {
        const actualCount = await User.countDocuments({
          role: "ADMIN",
          tenantId: req.user._id,
          status: "ACTIVE",
        });
        await Subscription.updateOne({ _id: subscriptionToUse._id }, { $set: { usedSeats: actualCount } });
      }
    } catch (createError) {
      // Re-sync subscription if creation failed
      if (subscriptionToUse) {
        const actualCount = await User.countDocuments({
          role: "ADMIN",
          tenantId: req.user._id,
          status: "ACTIVE",
        });
        await Subscription.updateOne({ _id: subscriptionToUse._id }, { $set: { usedSeats: actualCount } });
      }
      throw createError;
    }

    // Notify the newly created admin account
    await createNotification({
      recipient: newAdmin._id,
      sender: req.user._id,
      senderRole: "SUPER_ADMIN",
      senderName: req.user.name || "Super Admin",
      type: "ADMIN_WELCOME",
      title: "Welcome to DreamCity!",
      message: `Your administrator account has been created by Super Administrator. Your initial password has been set.`,
      metadata: {
        adminId: String(newAdmin._id),
        adminName: newAdmin.name,
      },
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
        tenantId: newAdmin.tenantId,
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
    if (status && ["ACTIVE", "INACTIVE"].includes(status) && status !== admin.status) {
      if (status === "ACTIVE" && admin.deactivatedBySupreme) {
        return res.status(403).json({
          success: false,
          message: "This administrator account was deactivated by the Platform Owner (Supreme Admin) and cannot be reactivated from the subscriber dashboard.",
        });
      }
      // Status toggle logic should go through toggleAdminStatus, but if updated here:
      if (status === "ACTIVE") {
        const activeSub = await Subscription.findOne({ subscriberId: req.user._id });
        if (activeSub) {
          const reserved = await Subscription.findOneAndUpdate(
            {
              _id: activeSub._id,
              status: { $in: ["ACTIVE", "TRIAL"] },
              expiryDate: { $gt: new Date() },
              $expr: { $lt: ["$usedSeats", activeSub.getEffectiveSeats ? activeSub.getEffectiveSeats() : "$assignedSeats"] },
            },
            { $inc: { usedSeats: 1 } },
            { returnDocument: "after" }
          );
          if (!reserved) {
            return res.status(400).json({
              success: false,
              message: "Admin seat limit reached. Cannot activate admin account.",
            });
          }
        }
      } else if (status === "INACTIVE" && admin.status === "ACTIVE") {
        await Subscription.updateOne(
          { subscriberId: req.user._id, usedSeats: { $gt: 0 } },
          { $inc: { usedSeats: -1 } }
        );
      }
      admin.status = status;
    }

    await admin.save();

    // Isolated notification directly to the updated admin
    await createNotification({
      recipient: admin._id,
      sender: req.user._id,
      senderRole: "SUPER_ADMIN",
      senderName: req.user.name || "Super Admin",
      type: "ADMIN_UPDATED",
      title: "Account Details Updated",
      message: `Your account details were updated by Super Administrator.`,
      metadata: {
        adminId: String(admin._id),
        adminName: admin.name,
      },
    });

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

    // Verify tenant ownership
    if (String(admin.tenantId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Unauthorized. Admin belongs to another tenant." });
    }

    const nextStatus = admin.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    // Block reactivation if deactivated by Supreme Admin
    if (nextStatus === "ACTIVE" && admin.deactivatedBySupreme) {
      return res.status(403).json({
        success: false,
        message: "This administrator account was deactivated by the Platform Owner (Supreme Admin) and cannot be reactivated from the subscriber dashboard. Please contact platform support or upgrade your plan.",
      });
    }

    // If reactivating to ACTIVE, check and atomically reserve seat
    if (nextStatus === "ACTIVE") {
      const activeSub = await Subscription.findOne({ subscriberId: req.user._id });
      if (activeSub) {
        if (activeSub.status !== "ACTIVE" && activeSub.status !== "TRIAL") {
          return res.status(403).json({
            success: false,
            message: `Subscription is ${activeSub.status.toLowerCase()}. Cannot activate Admin.`,
          });
        }
        if (new Date(activeSub.expiryDate) <= new Date()) {
          return res.status(403).json({
            success: false,
            message: "Your subscription has expired. Please renew your plan to activate Admin accounts.",
          });
        }
        const reserved = await Subscription.findOneAndUpdate(
          {
            _id: activeSub._id,
            status: { $in: ["ACTIVE", "TRIAL"] },
            expiryDate: { $gt: new Date() },
            $expr: { $lt: ["$usedSeats", "$assignedSeats"] },
          },
          { $inc: { usedSeats: 1 } },
          { returnDocument: "after" }
        );
        if (!reserved) {
          return res.status(400).json({
            success: false,
            message: `Admin seat limit reached (${activeSub.assignedSeats} max). Cannot activate admin account.`,
          });
        }
      }
    } else {
      // Deactivating to INACTIVE -> release seat
      await Subscription.updateOne(
        { subscriberId: req.user._id, usedSeats: { $gt: 0 } },
        { $inc: { usedSeats: -1 } }
      );
    }

    admin.status = nextStatus;
    await admin.save();

    // Isolated notification directly to that specific admin
    await createNotification({
      recipient: admin._id,
      sender: req.user._id,
      senderRole: "SUPER_ADMIN",
      senderName: req.user.name || "Super Admin",
      type: "ADMIN_STATUS_CHANGED",
      title: "Account Status Changed",
      message: `Your administrator account has been set to ${admin.status.toUpperCase()} by Super Administrator.`,
      metadata: {
        adminId: String(admin._id),
        adminName: admin.name,
      },
    });

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
 * @desc    Permanently delete an admin account and clean up their assignments
 * @route   DELETE /api/super-admin/admins/:id
 * @access  Private (Super Admin)
 */
export const deleteAdminAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const admin = await User.findById(id);

    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found." });
    }

    if (admin.role !== "ADMIN") {
      return res.status(400).json({
        success: false,
        message: "Only normal Administrator accounts can be deleted through this endpoint.",
      });
    }

    // Tenant isolation guard (consistent with toggleAdminStatus)
    if (String(admin.tenantId || "") !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. Admin belongs to another tenant.",
      });
    }

    // Release seat if admin was ACTIVE
    if (admin.status === "ACTIVE") {
      await Subscription.updateOne(
        { subscriberId: req.user._id, usedSeats: { $gt: 0 } },
        { $inc: { usedSeats: -1 } }
      );
    }

    // 1. Unassign all projects assigned to this admin so projects remain safely in the system
    await Project.updateMany(
      { adminId: admin._id },
      { $set: { adminId: null } }
    );

    // 2. Unassign all customer leads (enquiries) assigned to this admin
    await Enquiry.updateMany(
      { assignedAdminId: admin._id },
      { $set: { assignedAdminId: null } }
    );

    // 3. Unassign all site visits assigned to this admin
    await SiteVisit.updateMany(
      { assignedAdminId: admin._id },
      { $set: { assignedAdminId: null } }
    );

    // 4. Delete the admin user record permanently from DB
    await User.findByIdAndDelete(admin._id);

    // 5. Detach the admin from any branch they managed (branch itself is kept)
    await Branch.updateMany(
      { branchAdmin: admin._id },
      { $set: { branchAdmin: null } }
    );

    // Sync subscription usedSeats to actual count of active admins
    const actualRemainingCount = await User.countDocuments({
      role: "ADMIN",
      tenantId: req.user._id,
      status: "ACTIVE",
    });
    await Subscription.updateOne(
      { subscriberId: req.user._id },
      { $set: { usedSeats: actualRemainingCount } }
    );

    res.status(200).json({
      success: true,
      message: `Administrator "${admin.name}" has been permanently deleted from database.`,
      data: { id: String(admin._id) },
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
    const { tenantAdminIds } = await getTenantContext(req.user._id);

    // Strictly tenant-owned projects: created/approved by Super Admin OR assigned to tenant staff admin
    const query = {
      isArchived: false,
      $or: [
        { approvedBy: req.user._id },
        ...(tenantAdminIds.length > 0 ? [{ adminId: { $in: tenantAdminIds } }] : []),
      ],
    };

    const projects = await Project.find(query)
      .populate("adminId", "name email phone")
      .populate("branchId", "name city status")
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
 * @desc    Get all plots across all projects (Super Admin view, tenant isolated)
 * @route   GET /api/super-admin/plots
 * @access  Private (Super Admin)
 */
export const getAllPlotsSuperAdmin = async (req, res, next) => {
  try {
    const { tenantProjectIds } = await getTenantContext(req.user._id);

    if (tenantProjectIds.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    const plots = await Plot.find({ projectId: { $in: tenantProjectIds } }).sort({
      projectCustomId: 1,
      plotNumber: 1,
    });

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
 * @desc    Get pending projects or projects with pending updates (tenant isolated)
 * @route   GET /api/super-admin/projects/pending
 * @access  Private (Super Admin)
 */
export const getPendingProjects = async (req, res, next) => {
  try {
    const { tenantAdminIds } = await getTenantContext(req.user._id);

    const pendingProjects = await Project.find({
      isArchived: false,
      $and: [
        {
          $or: [
            { approvalStatus: "PENDING" },
            { hasPendingUpdates: true },
            { pendingDeletion: true },
          ],
        },
        {
          $or: [
            { approvedBy: req.user._id },
            ...(tenantAdminIds.length > 0 ? [{ adminId: { $in: tenantAdminIds } }] : []),
          ],
        },
      ],
    })
      .populate("adminId", "name email phone")
      .populate("branchId", "name city status")
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
 * @desc    Approve project or approve pending edits / deletions
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

    const { tenantAdminIds } = await getTenantContext(req.user._id);
    if (!isProjectInTenant(project, req.user._id, tenantAdminIds)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. Project does not belong to your tenant workspace.",
      });
    }

    // Handle Deletion Approval
    if (project.pendingDeletion) {
      const deletedTitle = project.title;
      const ownerAdminId = project.adminId;
      const customId = project.customId;

      // Delete associated plots and project document completely from database
      await Plot.deleteMany({ projectId: project._id });
      await project.deleteOne();

      // Notify the owner admin
      if (ownerAdminId) {
        await createNotification({
          recipient: ownerAdminId,
          sender: req.user._id,
          senderRole: "SUPER_ADMIN",
          senderName: req.user.name || "Super Admin",
          type: "PROJECT_DELETED",
          title: "Project Deletion Approved",
          message: `Super Admin approved deletion of "${deletedTitle}". The project has been permanently removed from the website and database.`,
          metadata: {
            projectId: String(customId || id),
            projectTitle: deletedTitle,
          },
        });
      }

      return res.status(200).json({
        success: true,
        isDeleted: true,
        message: `Project "${deletedTitle}" deletion approved and permanently removed.`,
        data: { _id: project._id, id: customId || id, isDeleted: true },
      });
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

    // Notify only the project's owner admin (isolated)
    if (project.adminId) {
      await createNotification({
        recipient: project.adminId,
        sender: req.user._id,
        senderRole: "SUPER_ADMIN",
        senderName: req.user.name || "Super Admin",
        type: "PROJECT_APPROVED",
        title: "Project Approved!",
        message: `Your project "${project.title}" has been approved by Super Administrator and is now live on the website.`,
        metadata: {
          projectId: String(project.customId || project._id),
          projectTitle: project.title,
        },
      });
    }

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
 * @desc    Reject project or reject pending edits / deletions
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

    const { tenantAdminIds } = await getTenantContext(req.user._id);
    if (!isProjectInTenant(project, req.user._id, tenantAdminIds)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. Project does not belong to your tenant workspace.",
      });
    }

    // If rejecting a pending deletion request on an approved project
    if (project.pendingDeletion) {
      project.pendingDeletion = false;
      project.deletionReason = "";
      await project.save();

      if (project.adminId) {
        await createNotification({
          recipient: project.adminId,
          sender: req.user._id,
          senderRole: "SUPER_ADMIN",
          senderName: req.user.name || "Super Admin",
          type: "GENERAL",
          title: "Project Deletion Rejected",
          message: `Deletion request for "${project.title}" was rejected by Super Administrator. The project remains active.${reason ? ` Reason: ${reason}` : ""}`,
          metadata: {
            projectId: String(project.customId || project._id),
            projectTitle: project.title,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: `Deletion request for "${project.title}" rejected. Project remains active.`,
        data: project,
      });
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

    // Notify only the project's owner admin (isolated)
    if (project.adminId) {
      await createNotification({
        recipient: project.adminId,
        sender: req.user._id,
        senderRole: "SUPER_ADMIN",
        senderName: req.user.name || "Super Admin",
        type: "PROJECT_REJECTED",
        title: "Project Rejected",
        message: `Your project "${project.title}" was rejected by Super Administrator.${reason ? ` Reason: ${reason}` : ""}`,
        metadata: {
          projectId: String(project.customId || project._id),
          projectTitle: project.title,
        },
      });
    }

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
    const { adminId, branchId: requestedBranchId } = req.body;

    const project = await findProjectByIdentifier(id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    const { tenantAdminIds } = await getTenantContext(req.user._id);
    if (!isProjectInTenant(project, req.user._id, tenantAdminIds)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. Project does not belong to your tenant workspace.",
      });
    }

    let assignedBranch = null;

    if (adminId) {
      // Must be a staff admin belonging to this Super Admin's tenant
      const adminUser = await User.findOne({ _id: adminId, role: "ADMIN", tenantId: req.user._id });
      if (!adminUser) {
        return res.status(400).json({
          success: false,
          message: "Invalid admin user ID. Admin does not belong to your organization.",
        });
      }

      // Branch consistency: a Branch Admin's projects must carry their branch;
      // a legacy admin (no branch) can never own a branch-scoped project.
      if (adminUser.branchId) {
        const adminBranch = await Branch.findOne({
          _id: adminUser.branchId,
          tenantId: req.user._id,
        });
        if (!adminBranch) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid admin assignment. The selected admin's branch no longer exists in your organization.",
          });
        }
        if (
          requestedBranchId &&
          String(adminBranch._id) !== String(requestedBranchId)
        ) {
          return res.status(400).json({
            success: false,
            message: "The selected admin belongs to a different branch.",
          });
        }
        assignedBranch = adminBranch;
      }

      project.adminId = adminUser._id;
      project.branchId = assignedBranch ? assignedBranch._id : null;
    } else if (requestedBranchId) {
      // Branch-only association (no specific admin yet)
      const branch = await Branch.findOne({
        _id: requestedBranchId,
        tenantId: req.user._id,
      });
      if (!branch) {
        return res.status(400).json({
          success: false,
          message: "Invalid branch ID. Branch does not belong to your organization.",
        });
      }

      // Invariant guard: a project still owned by a legacy admin (no branch)
      // cannot be branch-scoped without reassigning ownership.
      if (project.adminId) {
        const currentOwner = await User.findById(project.adminId);
        const ownerBranchId = currentOwner?.branchId
          ? String(currentOwner.branchId)
          : null;
        if (!ownerBranchId || ownerBranchId !== String(branch._id)) {
          return res.status(400).json({
            success: false,
            message:
              "This project is owned by an admin without a matching branch assignment. Assign it to that branch's admin before scoping it to the branch.",
          });
        }
      }

      project.branchId = branch._id;
    } else {
      project.adminId = null; // Unassigned
    }

    await project.save();

    // Isolated notification to the assigned admin
    if (adminId) {
      await createNotification({
        recipient: adminId,
        sender: req.user._id,
        senderRole: "SUPER_ADMIN",
        senderName: req.user.name || "Super Admin",
        type: "PROJECT_ASSIGNED",
        title: "Project Assigned to You",
        message: `Project "${project.title}" has been assigned to your portfolio${assignedBranch ? ` (${assignedBranch.name})` : ""} by Super Administrator.`,
        metadata: {
          projectId: String(project.customId || project._id),
          projectTitle: project.title,
          branchId: assignedBranch ? String(assignedBranch._id) : null,
        },
      });
    }

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

    const { tenantAdminIds } = await getTenantContext(req.user._id);
    if (!isProjectInTenant(project, req.user._id, tenantAdminIds)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. Project does not belong to your tenant workspace.",
      });
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
    // 1. Find all verified admins belonging to this tenant
    const tenantAdmins = await User.find({
      role: "ADMIN",
      tenantId: req.user._id,
    }).select("_id name email phone status createdAt").sort({ createdAt: -1 });

    const { tenantProjects, tenantProjectIds } = await getTenantContext(req.user._id);

    const totalProjects = tenantProjects.length;
    const approvedProjects = tenantProjects.filter((p) => p.approvalStatus === "APPROVED").length;
    const pendingProjects = tenantProjects.filter(
      (p) => p.approvalStatus === "PENDING" || p.hasPendingUpdates
    ).length;
    const unassignedProjects = tenantProjects.filter(
      (p) => !p.adminId || p.adminId === null
    ).length;

    // 3. Admin counts strictly within this tenant
    const totalAdmins = tenantAdmins.length;
    const activeAdmins = tenantAdmins.filter((a) => a.status === "ACTIVE").length;
    const inactiveAdmins = totalAdmins - activeAdmins;

    // 4. Plots belonging to tenant projects
    const totalPlots = await Plot.countDocuments({ projectId: { $in: tenantProjectIds } });
    const availablePlots = await Plot.countDocuments({ projectId: { $in: tenantProjectIds }, status: "Available" });
    const reservedPlots = await Plot.countDocuments({ projectId: { $in: tenantProjectIds }, status: "Reserved" });
    const soldPlots = await Plot.countDocuments({ projectId: { $in: tenantProjectIds }, status: "Sold" });

    // 5. Enquiries belonging to tenant projects
    const totalEnquiries = await Enquiry.countDocuments({ projectId: { $in: tenantProjectIds } });
    const newEnquiries = await Enquiry.countDocuments({ projectId: { $in: tenantProjectIds }, status: "NEW" });

    // 6. Site Visits belonging to tenant projects
    const totalSiteVisits = await SiteVisit.countDocuments({ projectId: { $in: tenantProjectIds } });
    const scheduledSiteVisits = await SiteVisit.countDocuments({ projectId: { $in: tenantProjectIds }, status: "Scheduled" });

    // 7. Admin performance breakdown for tenant admins only
    const adminPerformance = await Promise.all(
      tenantAdmins.map(async (admin) => {
        const adminProjects = tenantProjects.filter(
          (p) => p.adminId && p.adminId.toString() === admin._id.toString()
        );
        const adminProjectIds = adminProjects.map((p) => p._id);
        const adminPlots = await Plot.find({ projectId: { $in: adminProjectIds } });

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
      projectSize, launchDate, details, image, defaultPlotImage, images,
      about, benefits, highlights, amenities, locationConnectivity,
      availablePlots: availableCount, reservedPlots: reservedCount,
      soldPlots: soldCount, adminId: assignedAdminId,
      branchId: requestedBranchId,
      layout,
    } = req.body;

    if (!title || !location || !plotPrice) {
      return res.status(400).json({
        success: false,
        message: "Title, location, and plotPrice are required.",
      });
    }

    // Check subscription status and expiry
    const activeSub = await Subscription.findOne({ subscriberId: req.user._id });
    if (activeSub) {
      if (activeSub.status === "SUSPENDED") {
        return res.status(403).json({
          success: false,
          message: "Your subscription has been suspended. Cannot create projects.",
        });
      }
      if (new Date(activeSub.expiryDate) <= new Date()) {
        return res.status(403).json({
          success: false,
          message: "Your subscription plan has expired. Please renew your subscription to create new projects.",
        });
      }
    }

    // Validate assigned admin if provided
    let assignedAdmin = null;
    if (assignedAdminId) {
      assignedAdmin = await User.findById(assignedAdminId);
      if (!assignedAdmin || assignedAdmin.role !== "ADMIN") {
        return res.status(400).json({
          success: false,
          message: "Invalid admin ID. Please select a valid Branch Administrator.",
        });
      }
      if (String(assignedAdmin.tenantId || "") !== String(req.user._id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid admin ID. Admin does not belong to your organization.",
        });
      }
    }

    // ── Branch assignment (server-validated; strictly required for all new projects) ──
    if (!requestedBranchId) {
      return res.status(400).json({
        success: false,
        message: "Branch & Branch Admin assignment is required. Every project must be assigned to an active branch office.",
      });
    }

    let assignedBranch = await Branch.findOne({
      _id: requestedBranchId,
      tenantId: req.user._id,
      status: "ACTIVE",
    });
    if (!assignedBranch) {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive branch selected. Please assign the project to an active branch office.",
      });
    }

    // Resolve branch admin if not explicitly passed
    if (!assignedAdmin && assignedBranch.branchAdmin) {
      assignedAdmin = await User.findById(assignedBranch.branchAdmin);
    }
    if (!assignedAdmin) {
      const activeBranchAdmin = await User.findOne({
        role: "ADMIN",
        tenantId: req.user._id,
        branchId: assignedBranch._id,
        status: "ACTIVE",
      });
      if (activeBranchAdmin) {
        assignedAdmin = activeBranchAdmin;
        assignedBranch.branchAdmin = activeBranchAdmin._id;
        await assignedBranch.save();
      }
    }

    if (assignedAdmin) {
      const adminBranchId = assignedAdmin.branchId
        ? String(assignedAdmin.branchId)
        : null;

      if (requestedBranchId && !adminBranchId) {
        return res.status(400).json({
          success: false,
          message:
            "This admin account has no branch assignment. Branch-scoped projects require a Branch Admin account.",
        });
      }
      if (assignedAdmin.branchId) {
        // Verify the admin's branch is real & in-tenant
        const adminBranch = await Branch.findOne({
          _id: assignedAdmin.branchId,
          tenantId: req.user._id,
        });
        if (!adminBranch) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid admin assignment. The selected admin's branch no longer exists in your organization.",
          });
        }
        if (assignedBranch && String(adminBranch._id) !== String(assignedBranch._id)) {
          return res.status(400).json({
            success: false,
            message: "The selected admin belongs to a different branch.",
          });
        }
        assignedBranch = adminBranch;
      }
    }

    // Determine next integer customId
    const maxProject = await Project.findOne().sort({ customId: -1 });
    const nextCustomId = maxProject && maxProject.customId ? maxProject.customId + 1 : 1;

    // Parse priceLakhs if not provided
    let parsedPriceLakhs = priceLakhs;
    if (!parsedPriceLakhs && plotPrice) {
      const cleaned = plotPrice.replace(/[₹,]/g, "").trim();
      const crMatch = cleaned.match(/([\d.]+)\s*(?:cr|crore|crores)\b/i);
      const lakhMatch = cleaned.match(/([\d.]+)\s*(?:lakh|lakhs|lac|lacs|l)\b/i);
      const numMatch = cleaned.match(/^([\d.]+)$/);
      if (crMatch) {
        parsedPriceLakhs = parseFloat(crMatch[1]) * 100;
      } else if (lakhMatch) {
        parsedPriceLakhs = parseFloat(lakhMatch[1]);
      } else if (numMatch) {
        const num = parseFloat(numMatch[1]);
        parsedPriceLakhs = num >= 100000 ? num / 100000 : num;
      } else {
        parsedPriceLakhs = 0;
      }
    }

    // Determine location and city; when assigned to a branch, authoritatively lock to branch territory
    let effectiveLocation = location ? location.trim() : "";
    let effectiveCity = city ? city.trim() : (location ? location.split(",")[0].trim() : "");
    if (assignedBranch) {
      effectiveLocation = assignedBranch.region
        ? `${assignedBranch.city}, ${assignedBranch.region}`
        : assignedBranch.city;
      effectiveCity = assignedBranch.city;
    }

    const newProject = await Project.create({
      title: title.trim(),
      location: effectiveLocation,
      city: effectiveCity,
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
      defaultPlotImage: defaultPlotImage || "",
      images: images || [],
      about: about || { description: "", additionalDescription: "" },
      benefits: benefits || [],
      highlights: highlights || [],
      amenities: amenities || [],
      locationConnectivity: locationConnectivity || [],
      customId: nextCustomId,
      adminId: assignedAdmin ? assignedAdmin._id : (assignedBranch?.branchAdmin || null),
      branchId: assignedBranch ? assignedBranch._id : null,
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
      const initialPlotImage = newProject.defaultPlotImage || newProject.image || "";
      const initialPlotImages = initialPlotImage ? [initialPlotImage] : [];

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
          image: initialPlotImage,
          images: initialPlotImages,
        });
        plotIdx++;
      }

      await Plot.insertMany(plotsToInsert);
    }

    // Persist layout subdocument and map regions to newly generated plots if provided
    if (
      layout &&
      typeof layout === "object" &&
      (layout.imageUrl || (Array.isArray(layout.regions) && layout.regions.length > 0))
    ) {
      let validatedRegions = [];
      const rawRegions = Array.isArray(layout.regions) ? layout.regions : [];

      if (totalCount > 0) {
        const plotMapByNumber = new Map();
        const createdPlots = await Plot.find({ projectId: newProject._id });
        createdPlots.forEach((p) => {
          plotMapByNumber.set(String(p.plotNumber), p._id);
        });

        const seenPlotIds = new Set();
        for (let i = 0; i < rawRegions.length; i++) {
          const region = rawRegions[i];
          if (!region) continue;

          const pNum = String(region.plotNumber || (i + 1)).trim();
          const pId = plotMapByNumber.get(pNum) || region.plotId;

          if (pId && !seenPlotIds.has(String(pId))) {
            seenPlotIds.add(String(pId));
            validatedRegions.push({
              id: region.id || `reg_${Date.now()}_${i}`,
              plotId: pId,
              plotNumber: pNum,
              block: region.block ? String(region.block).trim() : "",
              shapeType: "polygon",
              points: Array.isArray(region.points) ? region.points : [],
              labelPosition: region.labelPosition,
            });
          }
        }
      } else {
        validatedRegions = rawRegions;
      }

      newProject.layout = {
        imageUrl: layout.imageUrl ? String(layout.imageUrl).trim() : "",
        provider: layout.provider || "cloudinary",
        publicId: layout.publicId || "",
        version: 1,
        width: Number(layout.width) || 0,
        height: Number(layout.height) || 0,
        blocks: Array.isArray(layout.blocks) ? layout.blocks : [],
        regions: validatedRegions,
      };
      await newProject.save();
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

/**
 * @desc    Get all plots belonging to a specific project (for Super Admin inspection)
 * @route   GET /api/super-admin/projects/:id/plots
 * @access  Private (Super Admin)
 */
export const getProjectPlotsSuperAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await findProjectByIdentifier(id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    const { tenantAdminIds } = await getTenantContext(req.user._id);
    if (!isProjectInTenant(project, req.user._id, tenantAdminIds)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. Project does not belong to your tenant workspace.",
      });
    }

    const plots = await Plot.find({ projectId: project._id }).sort({ plotNumber: 1 });
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
 * @desc    Get current subscriber's subscription and seat usage info
 * @route   GET /api/super-admin/subscription-info
 * @access  Private (Super Admin)
 */
export const getSubscriptionInfo = async (req, res, next) => {
  try {
    const sub = await Subscription.findOne({ subscriberId: req.user._id }).populate("planId");
    
    // Count verified active admin accounts strictly belonging to this tenant
    const activeAdminsCount = await User.countDocuments({
      role: "ADMIN",
      status: "ACTIVE",
      tenantId: req.user._id,
    });

    if (!sub) {
      return res.status(200).json({
        success: true,
        data: {
          hasSubscription: false,
          status: "NONE",
          planName: "Default Workspace",
          assignedSeats: 0,
          usedSeats: activeAdminsCount,
          remainingSeats: 0,
          expiryDate: null,
          isExpired: false,
          isCustomOverride: false,
          customOverrideReason: "",
        },
      });
    }

    const isDateExpired = Boolean(sub.expiryDate && new Date(sub.expiryDate) <= new Date());
    const isExpired = sub.status === "EXPIRED" || isDateExpired;
    const effectiveSeats = sub.getEffectiveSeats();

    let remainingDays = 0;
    if (sub.expiryDate) {
      const diffMs = new Date(sub.expiryDate) - new Date();
      remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    const isTrial = sub.status === "TRIAL";
    const isExpiringSoon = !isExpired && remainingDays <= 3;

    // Keep lifetimeAssignedSeats at least equal to current active admins (high-water mark)
    const currentLifetime = Math.max(sub.lifetimeAssignedSeats || 0, activeAdminsCount);
    if ((sub.lifetimeAssignedSeats || 0) < currentLifetime) {
      await Subscription.updateOne({ _id: sub._id }, { $set: { lifetimeAssignedSeats: currentLifetime } });
      sub.lifetimeAssignedSeats = currentLifetime;
    }

    // Always self-heal sub.usedSeats to match the actual active admins count
    if (sub.usedSeats !== activeAdminsCount) {
      await Subscription.updateOne({ _id: sub._id }, { $set: { usedSeats: activeAdminsCount } });
      sub.usedSeats = activeAdminsCount;
    }

    // Remaining seats: If total seats provisioned or active reached effective limit, no more can be added even if an admin is deleted.
    const effectiveUsed = Math.max(activeAdminsCount, sub.lifetimeAssignedSeats || 0);
    const remainingSeats = Math.max(0, effectiveSeats - effectiveUsed);

    res.status(200).json({
      success: true,
      data: {
        hasSubscription: true,
        subscriptionId: sub._id,
        status: isExpired ? "EXPIRED" : sub.status,
        isTrial,
        planName: sub.planId ? sub.planId.name : (isTrial ? "Trial Plan" : "Custom Plan"),
        assignedSeats: effectiveSeats,
        usedSeats: activeAdminsCount,
        lifetimeAssignedSeats: sub.lifetimeAssignedSeats || activeAdminsCount,
        actualActiveAdmins: activeAdminsCount,
        remainingSeats,
        isCustomOverride: sub.isCustomOverride || false,
        customOverrideReason: sub.customOverrideReason || "",
        startDate: sub.startDate,
        expiryDate: sub.expiryDate,
        remainingDays,
        isExpiringSoon,
        isExpired,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload layout image to Cloudinary for a project
 * @route   POST /api/super-admin/projects/:id/layout-image
 * @access  Private (Super Admin)
 */
export const uploadLayoutImageSuperAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fileData, mimeType, width, height } = req.body;

    if (!fileData) {
      return res.status(400).json({
        success: false,
        message: "No image file data provided.",
      });
    }

    const { tenantAdminIds } = await getTenantContext(req.user._id);
    let resolvedProjectId = "new_project";
    let resolvedProject = null;

    if (id && id !== "undefined" && id !== "new") {
      resolvedProject = await findProjectByIdentifier(id);
      if (!resolvedProject || resolvedProject.isArchived) {
        return res.status(404).json({ success: false, message: "Project not found." });
      }

      if (!isProjectInTenant(resolvedProject, req.user._id, tenantAdminIds)) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You do not have permission to manage layout for this project.",
        });
      }
      resolvedProjectId = resolvedProject._id;
    }

    // Upload via storageService (strictly Cloudinary; throws 503 if not configured)
    const uploadResult = await storageService.uploadLayoutImage({
      fileData,
      mimeType: mimeType || "image/png",
      projectId: resolvedProjectId,
      tenantId: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Layout image uploaded successfully to persistent storage.",
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
 * @desc    Get project layout configuration
 * @route   GET /api/super-admin/projects/:id/layout
 * @access  Private (Super Admin)
 */
export const getProjectLayoutSuperAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tenantAdminIds } = await getTenantContext(req.user._id);
    const project = await findProjectByIdentifier(id);

    if (!project || project.isArchived) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    if (!isProjectInTenant(project, req.user._id, tenantAdminIds)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to access layout for this project.",
      });
    }

    // Get project plots for mapping reference
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
 * @desc    Save project layout configuration (regions, coordinates, blocks, roads, common areas)
 * @route   PUT /api/super-admin/projects/:id/layout
 * @access  Private (Super Admin)
 */
export const saveProjectLayoutSuperAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { layout } = req.body;

    if (!layout || typeof layout !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid layout data payload.",
      });
    }

    const { tenantAdminIds } = await getTenantContext(req.user._id);
    const project = await findProjectByIdentifier(id);

    if (!project || project.isArchived) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    if (!isProjectInTenant(project, req.user._id, tenantAdminIds)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to modify layout for this project.",
      });
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
          message: `Region at index ${i} references invalid Plot ID "${rawPlotId}". Plot does not belong to this project or tenant.`,
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

      // Validate points (must be >= 3 points with x, y in range 0 - 100)
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

    // 3. Validate common areas (parks, pathways, amenities) if present
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

    // Preserve previous Cloudinary asset until replacement is confirmed
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

    // Governance & Approval Workflow
    // If project is awaiting initial approval, route changes to pendingUpdates
    if (project.approvalStatus === "PENDING") {
      project.pendingUpdates = project.pendingUpdates || {};
      project.pendingUpdates.layout = updatedLayout;
      project.hasPendingUpdates = true;
      await project.save();

      return res.status(200).json({
        success: true,
        message: "Project layout changes staged in pending approval queue.",
        data: updatedLayout,
        staged: true,
      });
    }

    project.layout = updatedLayout;
    await project.save();

    // Now that replacement layout is safely committed to DB, if publicId changed, delete old asset
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
