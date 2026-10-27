import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Branch from "../models/Branch.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Subscription from "../models/Subscription.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";
import { createNotification } from "./notificationController.js";

/**
 * Branch Management — tenant-scoped, seat-safe.
 *
 * Conventions intentionally mirror superAdminController.createAdminAccount:
 *   • Ground-truth seat limit  = count of ACTIVE tenant ADMIN accounts
 *   • Atomic reservation       = Subscription.findOneAndUpdate with
 *       $expr: { $lt: ["$usedSeats", "$assignedSeats"] } and $inc: { usedSeats: 1 }
 *   • Self-healing sync        = usedSeats is reset to the actual ACTIVE admin
 *       count after every success AND failure path (no seat leaks from retries)
 *   • Release on deactivation  = conditional $inc { usedSeats: -1 } with
 *       usedSeats: { $gt: 0 } guard, guarded by status checks so retries
 *       can never release the same seat twice
 *   • Tenant identity          = ALWAYS req.user._id (client cannot force one)
 */

// ─── Small helpers (same atomic patterns as superAdminController) ────────────

const countActiveTenantAdmins = (tenantId) =>
  User.countDocuments({ role: "ADMIN", tenantId, status: "ACTIVE" });

const syncUsedSeats = async (tenantId, subscriptionId = null) => {
  const actualCount = await countActiveTenantAdmins(tenantId);
  const filter = subscriptionId ? { _id: subscriptionId } : { subscriberId: tenantId };
  await Subscription.updateOne(filter, { $set: { usedSeats: actualCount } });
  return actualCount;
};

/** Atomically reserve one seat. Returns the updated Subscription doc or null
 *  when the limit was reached / subscription invalid. */
const reserveSeatAtomically = (subscriptionId, effectiveSeats) =>
  Subscription.findOneAndUpdate(
    {
      _id: subscriptionId,
      status: { $in: ["ACTIVE", "TRIAL"] },
      expiryDate: { $gt: new Date() },
      $expr: {
        $and: [
          { $lt: ["$usedSeats", effectiveSeats ?? "$assignedSeats"] },
          { $lt: [{ $ifNull: ["$lifetimeAssignedSeats", 0] }, effectiveSeats ?? "$assignedSeats"] },
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

/** Best-effort advisory notifications — must never break the main flow. */
const notifyBranch = async (payload) => {
  try {
    await createNotification(payload);
  } catch (err) {
    console.error("[BranchNotification Error]:", err.message);
  }
};

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildBranchPayload = (branch, adminStats = {}) => {
  const adminObj = branch.branchAdmin
    ? {
        id: branch.branchAdmin._id ?? branch.branchAdmin,
        _id: branch.branchAdmin._id ?? branch.branchAdmin,
        name: branch.branchAdmin.name || adminStats.name || "",
        email: branch.branchAdmin.email || "",
        phone: branch.branchAdmin.phone || "",
        status: branch.branchAdmin.status || "ACTIVE",
      }
    : null;

  return {
    id: branch._id,
    _id: branch._id,
    name: branch.name,
    city: branch.city,
    region: branch.region || "",
    address: branch.address || "",
    notes: branch.notes || "",
    status: branch.status,
    tenantId: branch.tenantId,
    branchAdmin: adminObj,
    assignedAdminId: adminObj,
    createdAt: branch.createdAt,
  };
};

/**
 * Revert protections used when provisioning fails midway so no orphaned
 * branches / users / consumed seats can remain.
 */
const cleanupFailedProvisioning = async ({
  branchDoc = null,
  createdUserDoc = null,
  upgradedUserDoc = null,
  tenantId = null,
}) => {
  // Fresh account created in THIS request → remove it entirely
  if (createdUserDoc) {
    try {
      await User.deleteOne({ _id: createdUserDoc._id });
    } catch (cleanupErr) {
      console.error("[BranchProvisioning cleanup] user delete failed:", cleanupErr.message);
    }
  }

  // Pre-existing USER account that was (attempted) upgraded this request → revert
  if (upgradedUserDoc) {
    try {
      await User.updateOne(
        { _id: upgradedUserDoc._id },
        { $set: { role: "USER", tenantId: null, branchId: null } }
      );
    } catch (cleanupErr) {
      console.error("[BranchProvisioning cleanup] user revert failed:", cleanupErr.message);
    }
  }

  // Remove the branch created in THIS request (only our own doc)
  if (branchDoc) {
    try {
      await Branch.deleteOne({ _id: branchDoc._id, branchAdmin: null });
    } catch (cleanupErr) {
      console.error("[BranchProvisioning cleanup] branch delete failed:", cleanupErr.message);
    }
  }

  // Seat self-healing: re-sync usedSeats from ground truth (idempotent)
  if (tenantId) {
    try {
      await syncUsedSeats(tenantId);
    } catch (cleanupErr) {
      console.error("[BranchProvisioning cleanup] seat sync failed:", cleanupErr.message);
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    List all branches for the authenticated Super Admin's tenant
 * @route   GET /api/super-admin/branches
 * @access  Private (Super Admin)
 */
export const getBranches = async (req, res, next) => {
  try {
    const branches = await Branch.find({ tenantId: req.user._id })
      .populate("branchAdmin", "name email phone status")
      .sort({ createdAt: -1 });

    const data = await Promise.all(
      branches.map(async (branch) => {
        // Fallback: If branchAdmin is null or unpopulated, resolve from User model
        if (!branch.branchAdmin) {
          const fallbackAdmin = await User.findOne({
            role: "ADMIN",
            tenantId: req.user._id,
            branchId: branch._id,
            status: "ACTIVE",
          }).select("name email phone status");
          if (fallbackAdmin) {
            branch.branchAdmin = fallbackAdmin;
            Branch.updateOne({ _id: branch._id }, { $set: { branchAdmin: fallbackAdmin._id } }).catch(() => {});
          }
        }

        const [totalProjects, approvedProjects] = await Promise.all([
          Project.countDocuments({ branchId: branch._id, isArchived: false }),
          Project.countDocuments({
            branchId: branch._id,
            isArchived: false,
            approvalStatus: "APPROVED",
          }),
        ]);

        return {
          ...buildBranchPayload(branch),
          projectCount: totalProjects,
          approvedProjects,
          pendingProjects: Math.max(0, totalProjects - approvedProjects),
        };
      })
    );

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a branch and (normally) provision its Branch Admin account
 * @route   POST /api/super-admin/branches
 * @access  Private (Super Admin)
 *
 * Failure-safe order of operations (no orphans, no seat leaks, retry-safe):
 *   validate → reserve seat → create branch → create/upgrade admin →
 *   link admin ↔ branch → sync seats → notify.
 *   Every step after the seat reservation rolls back the prior steps on error.
 */
export const createBranch = async (req, res, next) => {
  try {
    const {
      name,
      city,
      region,
      address,
      notes,
      adminName,
      adminEmail,
      adminMobile,
      adminPassword,
    } = req.body;

    // ── 1. Input validation ────────────────────────────────────────────────
    const branchName = name?.trim();
    const branchCity = city?.trim();
    const adminEmailNormalized = adminEmail?.trim().toLowerCase();

    if (!branchName || !branchCity) {
      return res.status(400).json({
        success: false,
        message: "Branch name and city are required.",
      });
    }

    if (!adminName || !adminName.trim() || !adminEmailNormalized) {
      return res.status(400).json({
        success: false,
        message: "Branch Admin name and email are required.",
      });
    }

    // Duplicate branch name within THIS tenant (case-insensitive)
    const duplicateBranch = await Branch.findOne({
      tenantId: req.user._id,
      name: { $regex: `^${escapeRegex(branchName)}$`, $options: "i" },
    });
    if (duplicateBranch) {
      return res.status(400).json({
        success: false,
        message: `A branch named "${branchName}" already exists in your organization.`,
      });
    }

    // ── 2. Subscription & seat validation (mirrors createAdminAccount) ─────
    const activeSub = await Subscription.findOne({
      subscriberId: req.user._id,
    }).populate("planId");
    const subscriptionToUse = activeSub;

    if (activeSub) {
      if (activeSub.status !== "ACTIVE" && activeSub.status !== "TRIAL") {
        return res.status(403).json({
          success: false,
          isSubscriptionExpired: activeSub.status === "EXPIRED",
          message: `Subscription is ${activeSub.status.toLowerCase()}. Cannot add Branch Admin accounts. Please contact platform support.`,
        });
      }
      if (new Date(activeSub.expiryDate) <= new Date()) {
        return res.status(403).json({
          success: false,
          isSubscriptionExpired: true,
          message: "Your subscription has expired. Please renew your plan to manage Branch Admin accounts.",
        });
      }
    }

    const currentActiveAdmins = await countActiveTenantAdmins(req.user._id);
    const maxAllowedSeats = subscriptionToUse
      ? subscriptionToUse.getEffectiveSeats()
      : 0;

    const lifetimeAssigned = Math.max(
      subscriptionToUse?.lifetimeAssignedSeats || 0,
      currentActiveAdmins
    );

    if (currentActiveAdmins >= maxAllowedSeats || lifetimeAssigned >= maxAllowedSeats) {
      return res.status(400).json({
        success: false,
        message: `Branch Admin seat limit reached (${maxAllowedSeats} max). Deleting an admin does not provide extra seats. Please upgrade your subscription plan.`,
      });
    }

    // ── 3. Email classification (same rules as existing admin creation) ────
    const existingAccount = await User.findOne({
      email: adminEmailNormalized,
    }).select("+passwordHash");

    let existingUserDoc = null; // USER-role account eligible for upgrade
    if (existingAccount) {
      if (existingAccount.role === "ADMIN") {
        return res.status(400).json({
          success: false,
          message:
            "This email already belongs to a Branch/staff Admin account. Use a different email, or delete/suspend the existing account first.",
        });
      }
      if (
        existingAccount.role === "SUPER_ADMIN" ||
        existingAccount.role === "SUPREME_ADMIN"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This email belongs to an administrative account and cannot be reassigned.",
        });
      }
      // role === "USER" → eligible for upgrade (same as existing convention)
      existingUserDoc = existingAccount;
    }

    // ── 4. Atomic seat reservation ─────────────────────────────────────────
    const reservedSubscription = subscriptionToUse
      ? await reserveSeatAtomically(
          subscriptionToUse._id,
          subscriptionToUse.getEffectiveSeats()
        )
      : null;

    if (subscriptionToUse && !reservedSubscription) {
      // Lost the race for the last seat — nothing was created yet.
      return res.status(400).json({
        success: false,
        message: `Branch Admin seat limit reached (${maxAllowedSeats} max). Please upgrade your subscription to add more branch administrators.`,
      });
    }

    let branchDoc = null;
    let createdUserDoc = null;

    try {
      // ── 5. Create the branch (branchAdmin linked afterwards) ─────────────
      branchDoc = await Branch.create({
        tenantId: req.user._id,
        branchAdmin: null,
        name: branchName,
        city: branchCity,
        region: region?.trim() || "",
        address: address?.trim() || "",
        notes: notes?.trim() || "",
        status: "ACTIVE",
        createdBy: req.user._id,
      });

      // ── 6. Provision or upgrade the Branch Admin account ────────────────
      if (existingUserDoc) {
        // Upgrade existing customer account (same as createAdminAccount)
        existingUserDoc.role = "ADMIN";
        existingUserDoc.status = "ACTIVE";
        existingUserDoc.tenantId = req.user._id;
        existingUserDoc.branchId = branchDoc._id;
        if (adminName.trim()) existingUserDoc.name = adminName.trim();
        if (adminMobile && adminMobile.trim())
          existingUserDoc.phone = adminMobile.trim();
        if (adminPassword) {
          const salt = await bcrypt.genSalt(10);
          existingUserDoc.passwordHash = await bcrypt.hash(adminPassword, salt);
        }
        await existingUserDoc.save();
        branchDoc.branchAdmin = existingUserDoc._id;
        await branchDoc.save();
      } else {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(
          adminPassword || "Admin@123",
          salt
        );
        createdUserDoc = await User.create({
          name: adminName.trim(),
          email: adminEmailNormalized,
          passwordHash,
          phone: adminMobile ? adminMobile.trim() : "",
          role: "ADMIN",
          status: "ACTIVE",
          tenantId: req.user._id,
          branchId: branchDoc._id,
        });
        branchDoc.branchAdmin = createdUserDoc._id;
        await branchDoc.save();
      }
    } catch (provisionError) {
      // Full compensation: remove branch/user fragments, restore seat ledger
      await cleanupFailedProvisioning({
        branchDoc,
        createdUserDoc,
        upgradedUserDoc: existingUserDoc ? existingUserDoc : null,
        tenantId: req.user._id,
      });

      if (provisionError.code === 11000) {
        const isBranchIndex = (provisionError.message || "").includes("tenantId_1_name_1");
        return res.status(isBranchIndex ? 400 : 400).json({
          success: false,
          message: isBranchIndex
            ? `A branch named "${branchName}" already exists in your organization.`
            : "An account with this email already exists.",
        });
      }

      throw provisionError;
    }

    // ── 7. Self-healing seat sync (ground truth) ───────────────────────────
    if (subscriptionToUse) {
      await syncUsedSeats(req.user._id, subscriptionToUse._id);
    }

    // ── 8. Welcome notification (non-fatal) ────────────────────────────────
    await notifyBranch({
      recipient: branchDoc.branchAdmin,
      sender: req.user._id,
      senderRole: "SUPER_ADMIN",
      senderName: req.user.name || "Super Admin",
      type: "ADMIN_WELCOME",
      title: "Welcome to your branch!",
      message: `You have been assigned as the Branch Admin of "${branchDoc.name}" (${branchDoc.city}) by Super Admin.`,
      metadata: {
        adminId: String(branchDoc.branchAdmin),
        adminName: adminName.trim(),
        branchId: String(branchDoc._id),
        branchName: branchDoc.name,
      },
    });

    const populated = await Branch.findById(branchDoc._id).populate(
      "branchAdmin",
      "name email phone status"
    );

    res.status(201).json({
      success: true,
      message: `Branch "${branchDoc.name}" created successfully.`,
      data: buildBranchPayload(populated),
    });
  } catch (error) {
    // Unknown failure paths — best-effort seat resync so nothing leaks
    try {
      await syncUsedSeats(req.user._id);
    } catch (syncErr) {
      console.error("[createBranch] seat sync failed:", syncErr.message);
    }
    next(error);
  }
};

/**
 * @desc    Get branch detail with associated projects and manager
 * @route   GET /api/super-admin/branches/:id
 * @access  Private (Super Admin)
 */
export const getBranchDetail = async (req, res, next) => {
  try {
    const branch = await Branch.findOne({
      _id: req.params.id,
      tenantId: req.user._id,
    }).populate("branchAdmin", "name email phone status");

    if (!branch) {
      return res.status(404).json({ success: false, message: "Branch not found." });
    }

    const projectsRaw = await Project.find({ branchId: branch._id, isArchived: false })
      .populate("adminId", "name email phone")
      .sort({ customId: 1, createdAt: -1 })
      .select("customId title location city branchId adminId approvalStatus hasPendingUpdates pendingDeletion status createdAt");

    // ── Plot statistics per project (count + Available/Reserved/Sold split) ──
    const projectIds = projectsRaw.map((p) => p._id);
    const plotRows = projectIds.length
      ? await Plot.aggregate([
          { $match: { projectId: { $in: projectIds } } },
          { $group: { _id: { projectId: "$projectId", status: "$status" }, count: { $sum: 1 } } },
        ])
      : [];

    const statsByProject = new Map();
    const summary = { totalPlots: 0, availablePlots: 0, reservedPlots: 0, soldPlots: 0 };
    for (const row of plotRows) {
      const pid = row._id.projectId ? String(row._id.projectId) : null;
      if (!pid) continue;
      if (!statsByProject.has(pid)) {
        statsByProject.set(pid, { total: 0, available: 0, reserved: 0, sold: 0, other: 0 });
      }
      const s = statsByProject.get(pid);
      s.total += row.count;
      summary.totalPlots += row.count;
      switch (row._id.status) {
        case "Available":
          s.available += row.count;
          summary.availablePlots += row.count;
          break;
        case "Reserved":
          s.reserved += row.count;
          summary.reservedPlots += row.count;
          break;
        case "Sold":
          s.sold += row.count;
          summary.soldPlots += row.count;
          break;
        default:
          s.other += row.count;
          break;
      }
    }

    const projects = projectsRaw.map((p) => ({
      id: p.customId || String(p._id),
      _id: p._id,
      title: p.title,
      location: p.location,
      city: p.city,
      status: p.status,
      approvalStatus: p.approvalStatus,
      hasPendingUpdates: p.hasPendingUpdates,
      pendingDeletion: p.pendingDeletion,
      assignedAdminId: p.adminId ? (p.adminId._id ?? p.adminId) : null,
      assignedAdmin: p.adminId
        ? { name: p.adminId.name, email: p.adminId.email, phone: p.adminId.phone }
        : null,
      plotStats: statsByProject.get(String(p._id)) || {
        total: 0,
        available: 0,
        reserved: 0,
        sold: 0,
        other: 0,
      },
    }));

    res.status(200).json({
      success: true,
      data: {
        ...buildBranchPayload(branch),
        totalProjects: projectsRaw.length,
        summary,
        projects,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update branch details (excluding account management & status)
 * @route   PUT /api/super-admin/branches/:id
 * @access  Private (Super Admin)
 */
export const updateBranch = async (req, res, next) => {
  try {
    const branch = await Branch.findOne({
      _id: req.params.id,
      tenantId: req.user._id,
    });

    if (!branch) {
      return res.status(404).json({ success: false, message: "Branch not found." });
    }

    const { region, address, notes, name, city } = req.body;

    // Reject location/district modification once set at creation
    if ((city !== undefined && city.trim() !== branch.city) || (name !== undefined && name.trim() !== branch.name)) {
      return res.status(400).json({
        success: false,
        message: "Branch location and district cannot be modified once set during branch creation.",
      });
    }

    if (region !== undefined) branch.region = region.trim();
    if (address !== undefined) branch.address = address.trim();
    if (notes !== undefined) branch.notes = notes.trim();

    await branch.save();

    const populated = await Branch.findById(branch._id).populate(
      "branchAdmin",
      "name email phone status"
    );

    res.status(200).json({
      success: true,
      message: "Branch updated successfully.",
      data: buildBranchPayload(populated),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Activate / deactivate a branch (and synchronize its Branch Admin account)
 * @route   PATCH /api/super-admin/branches/:id/status
 * @access  Private (Super Admin)
 *
 * Safe behavior:
 *   • Deactivation → blocks the branch (and its admin login via the existing
 *     account-deactivation rules). Branch projects are NEVER silently
 *     reassigned, altered or archived — they stay with the tenant under the
 *     same branch reference for when the branch is reactivated.
 *   • Idempotency → toggling an already-targeted status returns 400, so
 *     retries cannot release seats twice.
 *   • Reactivation → consumes one seat through the SAME atomic reservation
 *     convention as account activation.
 */
export const toggleBranchStatus = async (req, res, next) => {
  try {
    const branch = await Branch.findOne({
      _id: req.params.id,
      tenantId: req.user._id,
    });

    if (!branch) {
      return res.status(404).json({ success: false, message: "Branch not found." });
    }

    // Target status resolution:
    //   • req.body.status ("ACTIVE" | "INACTIVE") → explicit set (retry-safe/idempotent)
    //   • no body → legacy toggle behavior for compatibility with simple clients
    const { status: requestedStatus } = req.body || {};
    let nextStatus;

    if (requestedStatus) {
      if (requestedStatus !== "ACTIVE" && requestedStatus !== "INACTIVE") {
        return res.status(400).json({
          success: false,
          message: "Invalid status value. Use \"ACTIVE\" or \"INACTIVE\".",
        });
      }
      nextStatus = requestedStatus;
    } else {
      nextStatus = branch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    }

    const branchAdmin = branch.branchAdmin
      ? await User.findById(branch.branchAdmin)
      : null;

    // ─── Deactivation ──────────────────────────────────────────────────────
    if (nextStatus === "INACTIVE") {
      if (branch.status === "INACTIVE") {
        return res.status(400).json({
          success: false,
          message: "Branch is already inactive.",
        });
      }

      branch.status = "INACTIVE";
      await branch.save();

      // Follow the existing staff-account deactivation conventions:
      // release the seat ONLY if the account was previously ACTIVE.
      if (branchAdmin && branchAdmin.status === "ACTIVE") {
        branchAdmin.status = "INACTIVE";
        await branchAdmin.save();

        await Subscription.updateOne(
          { subscriberId: req.user._id, usedSeats: { $gt: 0 } },
          { $inc: { usedSeats: -1 } }
        );
        await syncUsedSeats(req.user._id);

        await notifyBranch({
          recipient: branchAdmin._id,
          sender: req.user._id,
          senderRole: "SUPER_ADMIN",
          senderName: req.user.name || "Super Admin",
          type: "ADMIN_STATUS_CHANGED",
          title: "Branch Deactivated",
          message: `Branch "${branch.name}" has been deactivated by Super Admin. Your operational access is paused.`,
          metadata: {
            adminId: String(branchAdmin._id),
            adminName: branchAdmin.name,
            branchId: String(branch._id),
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: `Branch "${branch.name}" has been deactivated. Its projects remain in your workspace; the Branch Admin account has been paused.`,
        data: buildBranchPayload(branch, { name: branchAdmin?.name, status: "INACTIVE" }),
      });
    }

    // ─── Reactivation ──────────────────────────────────────────────────────
    if (branch.status === "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "Branch is already active.",
      });
    }

    // Platform-owner lock is honored exactly like account reactivation
    if (branchAdmin && branchAdmin.deactivatedBySupreme) {
      return res.status(403).json({
        success: false,
        message:
          "This Branch Admin account was deactivated by the Platform Owner (Supreme Admin) and cannot be reactivated from the subscriber dashboard. Please contact platform support or upgrade your plan.",
      });
    }

    if (branchAdmin) {
      // Seat reservation through the existing atomic convention
      const activeSub = await Subscription.findOne({ subscriberId: req.user._id });
      if (activeSub) {
        if (activeSub.status !== "ACTIVE" && activeSub.status !== "TRIAL") {
          return res.status(403).json({
            success: false,
            message: `Subscription is ${activeSub.status.toLowerCase()}. Cannot activate branch.`,
          });
        }
        if (new Date(activeSub.expiryDate) <= new Date()) {
          return res.status(403).json({
            success: false,
            message: "Your subscription has expired. Please renew your plan to activate branches.",
          });
        }

        const reserved = await reserveSeatAtomically(
          activeSub._id,
          activeSub.getEffectiveSeats()
        );
        if (!reserved) {
          return res.status(400).json({
            success: false,
            message: `Branch Admin seat limit reached (${activeSub.assignedSeats} max). Cannot reactivate this branch.`,
          });
        }
      }
    }

    // Both flips succeeded only after the seat was secured (when relevant)
    branch.status = "ACTIVE";
    await branch.save();

    if (branchAdmin && branchAdmin.status !== "ACTIVE") {
      branchAdmin.status = "ACTIVE";
      await branchAdmin.save();
    }

    await syncUsedSeats(req.user._id);

    await notifyBranch({
      recipient: branchAdmin?._id,
      sender: req.user._id,
      senderRole: "SUPER_ADMIN",
      senderName: req.user.name || "Super Admin",
      type: "ADMIN_STATUS_CHANGED",
      title: "Branch Reactivated",
      message: `Branch "${branch.name}" has been reactivated by Super Admin. Your operational access has been restored.`,
      metadata: {
        adminId: branchAdmin ? String(branchAdmin._id) : null,
        adminName: branchAdmin?.name,
        branchId: String(branch._id),
      },
    });

    const populated = await Branch.findById(branch._id).populate(
      "branchAdmin",
      "name email phone status"
    );

    res.status(200).json({
      success: true,
      message: `Branch "${branch.name}" has been reactivated.`,
      data: buildBranchPayload(populated),
    });
  } catch (error) {
    // Seat ledger self-healing on unexpected failures
    try {
      await syncUsedSeats(req.user._id);
    } catch (syncErr) {
      console.error("[toggleBranchStatus] seat sync failed:", syncErr.message);
    }
    next(error);
  }
};

/**
 * @desc    Permanently delete a branch, unlink its projects, and clean up its Branch Admin account
 * @route   DELETE /api/super-admin/branches/:id
 * @access  Private (Super Admin)
 */
export const deleteBranch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const branch = await Branch.findOne({ _id: id, tenantId: req.user._id });

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found or does not belong to your organization.",
      });
    }

    const branchName = branch.name;
    const adminId = branch.branchAdmin;

    // 1. Unlink any projects assigned to this branch so projects remain safely in the system
    await Project.updateMany(
      { branchId: branch._id },
      { $set: { branchId: null, adminId: null } }
    );

    // 2. If branch had a branchAdmin user, clean up admin account and release seat
    if (adminId) {
      const admin = await User.findById(adminId);
      if (admin) {
        // Release seat if admin was ACTIVE
        if (admin.status === "ACTIVE") {
          await Subscription.updateOne(
            { subscriberId: req.user._id, usedSeats: { $gt: 0 } },
            { $inc: { usedSeats: -1 } }
          );
        }

        // Unassign leads/enquiries assigned to this admin
        try {
          await Enquiry.updateMany(
            { assignedAdminId: admin._id },
            { $set: { assignedAdminId: null } }
          );
        } catch (e) {
          console.warn("[deleteBranch] Enquiry unassign warning:", e.message);
        }

        // Unassign site visits assigned to this admin
        try {
          await SiteVisit.updateMany(
            { assignedAdminId: admin._id },
            { $set: { assignedAdminId: null } }
          );
        } catch (e) {
          console.warn("[deleteBranch] SiteVisit unassign warning:", e.message);
        }

        // Delete the admin user record permanently
        await User.findByIdAndDelete(admin._id);
      }
    }

    // 3. Delete the branch document permanently
    await Branch.deleteOne({ _id: branch._id });

    // 4. Sync subscription usedSeats to actual count of active admins
    await syncUsedSeats(req.user._id);

    res.status(200).json({
      success: true,
      message: `Branch "${branchName}" and associated branch administrator have been deleted successfully.`,
      data: { id: branch._id },
    });
  } catch (error) {
    try {
      await syncUsedSeats(req.user._id);
    } catch (syncErr) {
      console.error("[deleteBranch] seat sync failed:", syncErr.message);
    }
    next(error);
  }
};

