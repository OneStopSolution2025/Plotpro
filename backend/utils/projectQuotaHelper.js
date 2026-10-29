import User from "../models/User.js";
import Project from "../models/Project.js";
import Subscription from "../models/Subscription.js";

/**
 * Accurately count all non-archived projects belonging to a Super Admin tenant.
 * Includes projects created/approved by Super Admin OR assigned to tenant staff admins.
 * Archived projects (isArchived: true) are strictly excluded.
 *
 * @param {string|mongoose.Types.ObjectId} tenantId
 * @returns {Promise<number>}
 */
export const countTenantProjects = async (tenantId) => {
  if (!tenantId) return 0;
  const tenantAdmins = await User.find({ role: "ADMIN", tenantId }).select("_id");
  const tenantAdminIds = tenantAdmins.map((a) => a._id);

  return await Project.countDocuments({
    isArchived: false,
    $or: [
      { approvedBy: tenantId },
      ...(tenantAdminIds.length > 0 ? [{ adminId: { $in: tenantAdminIds } }] : []),
    ],
  });
};

/**
 * Authoritatively verify whether a tenant has available project creation quota.
 *
 * @param {string|mongoose.Types.ObjectId} tenantId
 * @returns {Promise<{ allowed: boolean, code?: string, message?: string, data?: object }>}
 */
export const verifyTenantProjectQuota = async (tenantId) => {
  if (!tenantId) {
    return {
      allowed: false,
      code: "INVALID_TENANT",
      message: "Invalid organization or tenant workspace identifier.",
    };
  }

  const sub = await Subscription.findOne({ subscriberId: tenantId }).populate("planId");

  if (!sub) {
    return {
      allowed: false,
      code: "NO_SUBSCRIPTION",
      message: "No active workspace subscription found for this organization.",
    };
  }

  if (sub.status === "SUSPENDED") {
    return {
      allowed: false,
      code: "SUBSCRIPTION_SUSPENDED",
      message: "Your workspace subscription has been suspended. Creating projects is disabled.",
    };
  }

  const isDateExpired = Boolean(sub.expiryDate && new Date(sub.expiryDate) <= new Date());
  if (sub.status === "EXPIRED" || isDateExpired) {
    return {
      allowed: false,
      code: "SUBSCRIPTION_EXPIRED",
      message: "Your workspace subscription plan has expired. Please renew your subscription to create new projects.",
    };
  }

  const maxProjects = sub.getEffectiveProjects ? sub.getEffectiveProjects() : 3;
  const isUnlimited = maxProjects >= 999999 || Boolean(sub.planId?.isUnlimitedProjects);

  const usedProjects = await countTenantProjects(tenantId);

  if (!isUnlimited && usedProjects >= maxProjects) {
    return {
      allowed: false,
      code: "PROJECT_LIMIT_REACHED",
      message: `Project creation limit reached (${maxProjects} max). Upgrade your subscription plan to create more projects.`,
      data: {
        usedProjects,
        maxProjects,
        remainingProjects: 0,
        planName: sub.planId?.name || "Workspace Plan",
      },
    };
  }

  return {
    allowed: true,
    data: {
      usedProjects,
      maxProjects: isUnlimited ? 999999 : maxProjects,
      remainingProjects: isUnlimited ? 999999 : Math.max(0, maxProjects - usedProjects),
      planName: sub.planId?.name || "Workspace Plan",
    },
  };
};
