import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Project from "../models/Project.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";
import PlatformSettings from "../models/PlatformSettings.js";
import { createNotification } from "./notificationController.js";

/**
 * @desc    Get Supreme Admin platform overview stats
 * @route   GET /api/supreme-admin/overview
 * @access  Private (Supreme Admin)
 */
export const getPlatformOverview = async (req, res, next) => {
  try {
    const totalSubscribers = await User.countDocuments({ role: "SUPER_ADMIN" });
    const activeSubscribers = await User.countDocuments({ role: "SUPER_ADMIN", status: "ACTIVE" });
    const suspendedSubscribers = await User.countDocuments({ role: "SUPER_ADMIN", status: "INACTIVE" });

    // Subscriptions breakdown
    const now = new Date();
    const activeSubscriptions = await Subscription.countDocuments({ status: "ACTIVE", expiryDate: { $gt: now } });
    const expiredSubscriptions = await Subscription.countDocuments({
      $or: [{ status: "EXPIRED" }, { expiryDate: { $lte: now } }],
    });
    const suspendedSubscriptions = await Subscription.countDocuments({ status: "SUSPENDED" });
    const trialSubscriptions = await Subscription.countDocuments({ status: "TRIAL", expiryDate: { $gt: now } });

    // Renewals due soon (within 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const renewalsDueSoonCount = await Subscription.countDocuments({
      status: "ACTIVE",
      expiryDate: { $gt: now, $lte: sevenDaysFromNow },
    });

    const renewalsDueSoon = await Subscription.find({
      status: "ACTIVE",
      expiryDate: { $gt: now, $lte: sevenDaysFromNow },
    })
      .populate("subscriberId", "name email phone businessName status")
      .populate("planId", "name price maxAdminSeats")
      .limit(10);

    // Platform-wide staff Admin counts
    const totalAdmins = await User.countDocuments({ role: "ADMIN" });
    const activeAdmins = await User.countDocuments({ role: "ADMIN", status: "ACTIVE" });

    // Platform-wide projects and enquiries
    const totalProjects = await Project.countDocuments({ isArchived: false });
    const totalEnquiries = await Enquiry.countDocuments({});

    // Platform-wide seat utilization
    const subscriptions = await Subscription.find({}).populate("planId");
    let totalSeatsAllocated = 0;
    let totalSeatsUsed = 0;
    let hasUnlimitedSeats = false;
    subscriptions.forEach((sub) => {
      const isUnlimited =
        sub.assignedSeats >= 999999 || (sub.planId && sub.planId.isUnlimitedSeats);
      if (isUnlimited) {
        hasUnlimitedSeats = true;
      } else {
        totalSeatsAllocated += sub.assignedSeats || 0;
      }
      totalSeatsUsed += sub.usedSeats || 0;
    });

    res.status(200).json({
      success: true,
      data: {
        subscribers: {
          total: totalSubscribers,
          active: activeSubscribers,
          suspended: suspendedSubscribers,
        },
        subscriptions: {
          active: activeSubscriptions,
          expired: expiredSubscriptions,
          suspended: suspendedSubscriptions,
          trial: trialSubscriptions,
          renewalsDueSoon: renewalsDueSoonCount,
        },
        admins: {
          total: totalAdmins,
          active: activeAdmins,
        },
        platform: {
          totalProjects,
          totalEnquiries,
          totalSeatsAllocated,
          totalSeatsUsed,
          hasUnlimitedSeats,
        },
        renewalsList: renewalsDueSoon,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all subscriber businesses
 * @route   GET /api/supreme-admin/subscribers
 * @access  Private (Supreme Admin)
 */
export const getSubscribers = async (req, res, next) => {
  try {
    const { search, status, subscriptionStatus } = req.query;

    const query = { role: "SUPER_ADMIN" };

    if (status && status.toUpperCase() === "SUSPENDED") {
      query.status = "INACTIVE";
    }

    if (search) {
      const reg = new RegExp(search.trim(), "i");
      query.$or = [{ name: reg }, { email: reg }, { businessName: reg }, { phone: reg }];
    }

    const subscribers = await User.find(query).select("-passwordHash").sort({ createdAt: -1 });

    const now = new Date();
    const subscribersWithDetails = await Promise.all(
      subscribers.map(async (sub) => {
        const subscription = await Subscription.findOne({ subscriberId: sub._id })
          .populate("planId")
          .sort({ createdAt: -1 });

        // Count verified admins strictly belonging to this tenant
        const adminCount = await User.countDocuments({
          role: "ADMIN",
          tenantId: sub._id,
        });

        const activeAdminCount = await User.countDocuments({
          role: "ADMIN",
          status: "ACTIVE",
          tenantId: sub._id,
        });

        // Project metrics belonging to subscriber
        const projectCount = await Project.countDocuments({
          isArchived: false,
          approvedBy: sub._id,
        });

        const effectiveSeats = subscription ? subscription.getEffectiveSeats() : 3;

        let subSubStatus = null;
        if (subscription) {
          const isExp = Boolean(subscription.expiryDate && new Date(subscription.expiryDate) <= now);
          subSubStatus = isExp ? "EXPIRED" : subscription.status;
        }

        // Determine unified effectiveStatus for the subscriber
        let effectiveStatus = "ACTIVE";
        if (sub.status === "INACTIVE") {
          effectiveStatus = "SUSPENDED";
        } else if (subSubStatus === "EXPIRED") {
          effectiveStatus = "EXPIRED";
        } else if (subSubStatus === "TRIAL") {
          effectiveStatus = "TRIAL";
        } else if (!subscription) {
          effectiveStatus = "NO_PLAN";
        } else {
          effectiveStatus = "ACTIVE";
        }

        return {
          ...sub.toObject(),
          id: String(sub._id),
          businessName: sub.businessName || "Registered Business",
          ownerName: sub.name,
          effectiveStatus,
          subscription: subscription
            ? {
                id: subscription._id,
                planName: subscription.planId ? subscription.planId.name : "Custom",
                status: subSubStatus,
                startDate: subscription.startDate,
                expiryDate: subscription.expiryDate,
                assignedSeats: effectiveSeats,
                usedSeats: subscription.usedSeats,
                isCustomOverride: subscription.isCustomOverride || false,
                customOverrideReason: subscription.customOverrideReason || "",
              }
            : null,
          adminCount,
          activeAdminCount,
          projectCount,
        };
      })
    );

    let filtered = subscribersWithDetails;

    // Filter by unified status if provided
    if (status) {
      const targetStatus = status.toUpperCase();
      if (["ACTIVE", "EXPIRED", "SUSPENDED", "TRIAL", "NO_PLAN"].includes(targetStatus)) {
        filtered = filtered.filter((s) => s.effectiveStatus === targetStatus);
      } else if (targetStatus === "INACTIVE") {
        filtered = filtered.filter((s) => s.effectiveStatus === "SUSPENDED");
      }
    }

    // Optional filter by subscription status in memory if provided
    if (subscriptionStatus) {
      filtered = filtered.filter(
        (s) => s.subscription && s.subscription.status === subscriptionStatus.toUpperCase()
      );
    }

    res.status(200).json({
      success: true,
      count: filtered.length,
      data: filtered,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get detailed view of a single subscriber
 * @route   GET /api/supreme-admin/subscribers/:id
 * @access  Private (Supreme Admin)
 */
export const getSubscriberById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const subscriber = await User.findOne({ _id: id, role: "SUPER_ADMIN" }).select("-passwordHash");

    if (!subscriber) {
      return res.status(404).json({ success: false, message: "Subscriber not found." });
    }

    const subscription = await Subscription.findOne({ subscriberId: subscriber._id })
      .populate("planId")
      .sort({ createdAt: -1 });

    const admins = await User.find({
      role: "ADMIN",
      tenantId: subscriber._id,
    }).select("-passwordHash");

    res.status(200).json({
      success: true,
      data: {
        subscriber: {
          ...subscriber.toObject(),
          businessName: subscriber.businessName || "Registered Business",
          ownerName: subscriber.name,
        },
        subscription: subscription
          ? {
              ...subscription.toObject(),
              assignedSeats: subscription.getEffectiveSeats(),
            }
          : null,
        admins,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle subscriber status (Activate / Suspend)
 * @route   PATCH /api/supreme-admin/subscribers/:id/status
 * @access  Private (Supreme Admin)
 */
export const toggleSubscriberStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const subscriber = await User.findOne({ _id: id, role: "SUPER_ADMIN" });

    if (!subscriber) {
      return res.status(404).json({ success: false, message: "Subscriber not found." });
    }

    const nextStatus = subscriber.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    subscriber.status = nextStatus;
    await subscriber.save();

    res.status(200).json({
      success: true,
      message: `Subscriber account ${nextStatus === "ACTIVE" ? "activated" : "suspended"} successfully.`,
      data: {
        _id: subscriber._id,
        name: subscriber.name,
        email: subscriber.email,
        status: subscriber.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle tenant admin status as Supreme Admin
 * @route   PATCH /api/supreme-admin/subscribers/:subscriberId/admins/:adminId/status
 * @access  Private (Supreme Admin)
 */
export const toggleAdminStatusBySupreme = async (req, res, next) => {
  try {
    const { subscriberId, adminId } = req.params;

    const subscriber = await User.findOne({ _id: subscriberId, role: "SUPER_ADMIN" });
    if (!subscriber) {
      return res.status(404).json({ success: false, message: "Subscriber not found." });
    }

    const admin = await User.findOne({ _id: adminId, role: "ADMIN", tenantId: subscriber._id });
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin account not found under this subscriber." });
    }

    const nextStatus = admin.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    if (nextStatus === "ACTIVE") {
      const activeSub = await Subscription.findOne({ subscriberId: subscriber._id });
      if (activeSub) {
        if (activeSub.status !== "ACTIVE" && activeSub.status !== "TRIAL") {
          return res.status(403).json({
            success: false,
            message: `Subscriber's subscription is ${activeSub.status.toLowerCase()}. Cannot activate Admin.`,
          });
        }
        if (new Date(activeSub.expiryDate) <= new Date()) {
          return res.status(403).json({
            success: false,
            message: "Subscriber's subscription has expired. Cannot activate Admin.",
          });
        }
        const effectiveSeats = activeSub.getEffectiveSeats();
        const reserved = await Subscription.findOneAndUpdate(
          {
            _id: activeSub._id,
            status: { $in: ["ACTIVE", "TRIAL"] },
            expiryDate: { $gt: new Date() },
            $expr: { $lt: ["$usedSeats", effectiveSeats] },
          },
          { $inc: { usedSeats: 1 } },
          { returnDocument: "after" }
        );
        if (!reserved) {
          return res.status(400).json({
            success: false,
            message: `Subscriber's admin seat limit reached (${effectiveSeats} max). Cannot activate account.`,
          });
        }
      }
    } else {
      // Deactivating to INACTIVE -> release seat
      await Subscription.updateOne(
        { subscriberId: subscriber._id, usedSeats: { $gt: 0 } },
        { $inc: { usedSeats: -1 } }
      );
    }

    admin.status = nextStatus;
    if (nextStatus === "INACTIVE") {
      admin.deactivatedBySupreme = true;
    } else {
      admin.deactivatedBySupreme = false;
    }
    await admin.save();

    // Notify the Super Admin (workspace subscriber) about Supreme Admin's action
    await createNotification({
      recipient: subscriber._id,
      sender: req.user._id,
      senderRole: "SUPREME_ADMIN",
      senderName: req.user.name || "Supreme Administrator",
      type: "ADMIN_STATUS_CHANGED",
      title: `Staff Admin ${nextStatus === "ACTIVE" ? "Activated" : "Deactivated"} by Platform Owner`,
      message: `Staff Administrator "${admin.name}" (${admin.email}) has been ${nextStatus.toLowerCase()} by the Supreme Administrator (Platform Owner). ${
        nextStatus === "INACTIVE"
          ? "1 seat has been released from your subscription allocation. This account is locked by platform management."
          : "1 seat has been utilized from your subscription allocation."
      }`,
      metadata: {
        adminId: String(admin._id),
        adminName: admin.name,
      },
    });

    res.status(200).json({
      success: true,
      message: `Admin account "${admin.name}" set to ${admin.status.toLowerCase()}.`,
      data: admin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Permanently delete tenant admin account as Supreme Admin
 * @route   DELETE /api/supreme-admin/subscribers/:subscriberId/admins/:adminId
 * @access  Private (Supreme Admin)
 */
export const deleteAdminAccountBySupreme = async (req, res, next) => {
  try {
    const { subscriberId, adminId } = req.params;

    const subscriber = await User.findOne({ _id: subscriberId, role: "SUPER_ADMIN" });
    if (!subscriber) {
      return res.status(404).json({ success: false, message: "Subscriber not found." });
    }

    const admin = await User.findOne({ _id: adminId, role: "ADMIN", tenantId: subscriber._id });
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin account not found under this subscriber." });
    }

    // Release seat if admin was ACTIVE
    if (admin.status === "ACTIVE") {
      await Subscription.updateOne(
        { subscriberId: subscriber._id, usedSeats: { $gt: 0 } },
        { $inc: { usedSeats: -1 } }
      );
    }

    // 1. Unassign all projects assigned to this admin so projects remain safely in subscriber workspace
    await Project.updateMany(
      { adminId: admin._id },
      { $set: { adminId: null } }
    );

    // 2. Unassign customer leads (enquiries)
    await Enquiry.updateMany(
      { assignedAdminId: admin._id },
      { $set: { assignedAdminId: null } }
    );

    // 3. Unassign site visits
    await SiteVisit.updateMany(
      { assignedAdminId: admin._id },
      { $set: { assignedAdminId: null } }
    );

    // 4. Delete admin user record
    await User.findByIdAndDelete(admin._id);

    // Notify the Super Admin (workspace subscriber) about Supreme Admin's deletion
    await createNotification({
      recipient: subscriber._id,
      sender: req.user._id,
      senderRole: "SUPREME_ADMIN",
      senderName: req.user.name || "Supreme Administrator",
      type: "ADMIN_DELETED",
      title: "Staff Admin Deleted by Platform Owner",
      message: `Staff Administrator "${admin.name}" (${admin.email}) has been permanently deleted by the Supreme Administrator (Platform Owner). Any projects or leads assigned to them were safely preserved in your workspace and unassigned.`,
      metadata: {
        adminId: String(admin._id),
        adminName: admin.name,
      },
    });

    res.status(200).json({
      success: true,
      message: `Administrator "${admin.name}" permanently deleted and their projects unassigned safely.`,
      data: { id: String(admin._id) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Assign or renew a subscription for a subscriber
 * @route   POST /api/supreme-admin/subscribers/:id/subscription
 * @access  Private (Supreme Admin)
 */
export const assignSubscriberSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { planId, durationDays, assignedSeats, isCustomOverride, customOverrideReason, status, notes } = req.body;

    const subscriber = await User.findOne({ _id: id, role: "SUPER_ADMIN" });
    if (!subscriber) {
      return res.status(404).json({ success: false, message: "Subscriber not found." });
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found." });
    }

    // Authoritative seat calculation:
    // Follow plan.maxAdminSeats unless an explicit custom override is granted with a reason
    let effectiveSeats = plan.maxAdminSeats;
    let overrideFlag = false;
    let overrideReasonText = "";

    if (isCustomOverride) {
      overrideFlag = true;
      overrideReasonText = customOverrideReason ? String(customOverrideReason).trim() : "Custom seat allocation approved by Platform Owner";
      effectiveSeats = assignedSeats ? Math.max(1, Number(assignedSeats)) : plan.maxAdminSeats;
    }

    const effectiveDays = durationDays ? Number(durationDays) : plan.durationDays;

    // Check existing active admin count strictly belonging to this subscriber
    const currentActiveAdmins = await User.countDocuments({
      role: "ADMIN",
      status: "ACTIVE",
      tenantId: subscriber._id,
    });

    if (effectiveSeats < currentActiveAdmins) {
      return res.status(400).json({
        success: false,
        message: `Cannot reduce seat limit to ${effectiveSeats}. Subscriber currently has ${currentActiveAdmins} active Admin accounts. Please deactivate surplus admins first.`,
      });
    }

    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + effectiveDays);

    let subscription = await Subscription.findOne({ subscriberId: subscriber._id });

    if (subscription) {
      subscription.planId = plan._id;
      subscription.status = status || "ACTIVE";
      subscription.startDate = startDate;
      subscription.expiryDate = expiryDate;
      subscription.assignedSeats = effectiveSeats;
      subscription.usedSeats = currentActiveAdmins;
      subscription.isCustomOverride = overrideFlag;
      subscription.customOverrideReason = overrideReasonText;
      if (notes !== undefined) subscription.notes = notes;
      await subscription.save();
    } else {
      subscription = await Subscription.create({
        subscriberId: subscriber._id,
        planId: plan._id,
        status: status || "ACTIVE",
        startDate,
        expiryDate,
        assignedSeats: effectiveSeats,
        usedSeats: currentActiveAdmins,
        isCustomOverride: overrideFlag,
        customOverrideReason: overrideReasonText,
        notes: notes || "",
      });
    }

    res.status(200).json({
      success: true,
      message: "Subscription updated successfully.",
      data: subscription,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all subscription plans
 * @route   GET /api/supreme-admin/plans
 * @access  Private (Supreme Admin)
 */
export const getPlans = async (req, res, next) => {
  try {
    const plans = await Plan.find({}).sort({ price: 1, createdAt: 1 });
    res.status(200).json({
      success: true,
      count: plans.length,
      data: plans,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new subscription plan
 * @route   POST /api/supreme-admin/plans
 * @access  Private (Supreme Admin)
 */
export const createPlan = async (req, res, next) => {
  try {
    const {
      name,
      description,
      price,
      currency,
      billingInterval,
      durationDays,
      maxAdminSeats,
      isUnlimitedSeats,
      maxProjects,
      features,
    } = req.body;

    const unlimited = Boolean(isUnlimitedSeats);

    if (!name || price === undefined || !durationDays || (!unlimited && !maxAdminSeats)) {
      return res.status(400).json({
        success: false,
        message: "Name, price, durationDays, and seat allocation are required fields.",
      });
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const existing = await Plan.findOne({ $or: [{ name: name.trim() }, { slug }] });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "A plan with this name already exists.",
      });
    }

    const effectiveSeats = unlimited ? 999999 : Number(maxAdminSeats);

    const plan = await Plan.create({
      name: name.trim(),
      slug,
      description: description ? description.trim() : "",
      price: Number(price),
      currency: currency || "INR",
      billingInterval: billingInterval || "MONTHLY",
      durationDays: Number(durationDays),
      maxAdminSeats: effectiveSeats,
      isUnlimitedSeats: unlimited,
      maxProjects: maxProjects ? Number(maxProjects) : 50,
      features: Array.isArray(features) ? features : [],
    });

    res.status(201).json({
      success: true,
      message: "Subscription plan created successfully.",
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update an existing subscription plan
 * @route   PUT /api/supreme-admin/plans/:id
 * @access  Private (Supreme Admin)
 */
export const updatePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await Plan.findById(id);

    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found." });
    }

    const {
      name,
      description,
      price,
      currency,
      billingInterval,
      durationDays,
      maxAdminSeats,
      isUnlimitedSeats,
      maxProjects,
      features,
      isActive,
    } = req.body;

    if (name) {
      plan.name = name.trim();
      plan.slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    }
    if (description !== undefined) plan.description = description.trim();
    if (price !== undefined) plan.price = Number(price);
    if (currency) plan.currency = currency;
    if (billingInterval) plan.billingInterval = billingInterval;
    if (durationDays) plan.durationDays = Number(durationDays);
    if (isUnlimitedSeats !== undefined) {
      plan.isUnlimitedSeats = Boolean(isUnlimitedSeats);
      if (plan.isUnlimitedSeats) {
        plan.maxAdminSeats = 999999;
      } else if (maxAdminSeats) {
        plan.maxAdminSeats = Number(maxAdminSeats);
      }
    } else if (maxAdminSeats) {
      plan.maxAdminSeats = Number(maxAdminSeats);
    }
    if (maxProjects) plan.maxProjects = Number(maxProjects);
    if (features) plan.features = Array.isArray(features) ? features : plan.features;
    if (isActive !== undefined) plan.isActive = Boolean(isActive);

    await plan.save();

    res.status(200).json({
      success: true,
      message: "Plan updated successfully.",
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a subscription plan
 * @route   DELETE /api/supreme-admin/plans/:id
 * @access  Private (Supreme Admin)
 */
export const deletePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await Plan.findById(id);

    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found." });
    }

    // Check if any active subscriber is currently using this plan
    const activeSubscriptionsCount = await Subscription.countDocuments({
      planId: plan._id,
      status: { $in: ["ACTIVE", "TRIAL"] },
    });

    if (activeSubscriptionsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plan "${plan.name}" because it is currently assigned to ${activeSubscriptionsCount} active subscription(s). Please reassign them or deactivate the plan instead.`,
      });
    }

    await Plan.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: `Plan "${plan.name}" deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle plan active status
 * @route   PATCH /api/supreme-admin/plans/:id/status
 * @access  Private (Supreme Admin)
 */
export const togglePlanStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await Plan.findById(id);

    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found." });
    }

    plan.isActive = !plan.isActive;
    await plan.save();

    res.status(200).json({
      success: true,
      message: `Plan ${plan.isActive ? "activated" : "deactivated"} successfully.`,
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all subscriptions
 * @route   GET /api/supreme-admin/subscriptions
 * @access  Private (Supreme Admin)
 */
export const getSubscriptions = async (req, res, next) => {
  try {
    const { status } = req.query;

    const subscriptions = await Subscription.find({})
      .populate("subscriberId", "name email phone businessName status")
      .populate("planId", "name price durationDays maxAdminSeats")
      .sort({ createdAt: -1 });

    const now = new Date();
    let evaluated = subscriptions.map((sub) => {
      const isExpired = Boolean(sub.expiryDate && new Date(sub.expiryDate) <= now);
      return {
        ...sub.toObject(),
        effectiveStatus: isExpired ? "EXPIRED" : sub.status,
      };
    });

    if (status) {
      const targetStatus = status.toUpperCase();
      evaluated = evaluated.filter((sub) => sub.effectiveStatus === targetStatus);
    }

    res.status(200).json({
      success: true,
      count: evaluated.length,
      data: evaluated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update subscription status or manual renewal
 * @route   PATCH /api/supreme-admin/subscriptions/:id/status
 * @access  Private (Supreme Admin)
 */
export const updateSubscriptionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, extendDays } = req.body;

    const subscription = await Subscription.findById(id).populate("subscriberId planId");
    if (!subscription) {
      return res.status(404).json({ success: false, message: "Subscription not found." });
    }

    if (status && ["ACTIVE", "EXPIRED", "SUSPENDED", "TRIAL"].includes(status)) {
      subscription.status = status;
    }

    if (extendDays && Number(extendDays) > 0) {
      const baseDate = new Date(subscription.expiryDate) > new Date() ? new Date(subscription.expiryDate) : new Date();
      baseDate.setDate(baseDate.getDate() + Number(extendDays));
      subscription.expiryDate = baseDate;
      subscription.status = "ACTIVE";
    }

    await subscription.save();

    res.status(200).json({
      success: true,
      message: "Subscription updated successfully.",
      data: subscription,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get platform-wide admin seat usage
 * @route   GET /api/supreme-admin/seat-usage
 * @access  Private (Supreme Admin)
 */
export const getSeatUsage = async (req, res, next) => {
  try {
    const subscribers = await User.find({ role: "SUPER_ADMIN" }).select("name email businessName status");

    const usageBreakdown = await Promise.all(
      subscribers.map(async (sub) => {
        const subscription = await Subscription.findOne({ subscriberId: sub._id }).populate("planId");

        const activeAdmins = await User.countDocuments({
          role: "ADMIN",
          status: "ACTIVE",
          tenantId: sub._id,
        });

        const inactiveAdmins = await User.countDocuments({
          role: "ADMIN",
          status: "INACTIVE",
          tenantId: sub._id,
        });

        const assignedSeats = subscription ? subscription.getEffectiveSeats() : 3;
        const usedSeats = subscription && subscription.usedSeats !== undefined ? subscription.usedSeats : activeAdmins;

        const isUnlimited =
          assignedSeats >= 999999 || (subscription?.planId && subscription.planId.isUnlimitedSeats);

        return {
          subscriberId: sub._id,
          name: sub.name,
          email: sub.email,
          businessName: sub.businessName || "Registered Business",
          subscriberStatus: sub.status,
          planName: subscription?.planId?.name || "Default",
          subscriptionStatus: subscription?.status || "NONE",
          assignedSeats,
          usedSeats,
          activeAdmins,
          inactiveAdmins,
          isUnlimited,
          isCustomOverride: subscription?.isCustomOverride || false,
          customOverrideReason: subscription?.customOverrideReason || "",
          utilizationPercent: isUnlimited ? 0 : Math.round((usedSeats / assignedSeats) * 100),
          isNearCapacity: isUnlimited ? false : usedSeats >= assignedSeats,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: usageBreakdown.length,
      data: usageBreakdown,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get platform global settings
 * @route   GET /api/supreme-admin/settings
 * @access  Private (Supreme Admin)
 */
export const getPlatformSettings = async (req, res, next) => {
  try {
    let settings = await PlatformSettings.findOne({});
    if (!settings) {
      settings = await PlatformSettings.create({});
    }
    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update platform global settings
 * @route   PUT /api/supreme-admin/settings
 * @access  Private (Supreme Admin)
 */
export const updatePlatformSettings = async (req, res, next) => {
  try {
    const { platformName, supportEmail, supportPhone, maintenanceMode, allowSelfRegistration, defaultTrialDays } =
      req.body;

    let settings = await PlatformSettings.findOne({});
    if (!settings) {
      settings = new PlatformSettings();
    }

    if (platformName) settings.platformName = platformName.trim();
    if (supportEmail) settings.supportEmail = supportEmail.trim();
    if (supportPhone) settings.supportPhone = supportPhone.trim();
    if (maintenanceMode !== undefined) settings.maintenanceMode = Boolean(maintenanceMode);
    if (allowSelfRegistration !== undefined) settings.allowSelfRegistration = Boolean(allowSelfRegistration);
    if (defaultTrialDays !== undefined) settings.defaultTrialDays = Number(defaultTrialDays);

    await settings.save();

    res.status(200).json({
      success: true,
      message: "Platform settings updated successfully.",
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new Subscriber Business and its SUPER_ADMIN account
 * @route   POST /api/supreme-admin/subscribers
 * @access  Private (Supreme Admin)
 */
export const createSubscriber = async (req, res, next) => {
  let createdUser = null;
  let createdSubscription = null;
  try {
    const {
      businessName,
      name,
      email,
      phone,
      password,
      planId,
      durationDays,
      assignedSeats,
      isCustomOverride,
      customOverrideReason,
      status,
    } = req.body;

    // 1. Mandatory fields validation
    if (!businessName || !String(businessName).trim()) {
      return res.status(400).json({ success: false, message: "Business name is required." });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "Owner/Full name is required." });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ success: false, message: "Email address is required." });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password is required and must be at least 6 characters.",
      });
    }
    if (!planId) {
      return res.status(400).json({ success: false, message: "Subscription plan is required." });
    }

    const emailNormalized = String(email).trim().toLowerCase();
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(emailNormalized)) {
      return res.status(400).json({ success: false, message: "Please use a valid email address." });
    }

    // 2. Check duplicate email
    const existingUser = await User.findOne({ email: emailNormalized });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email address already exists.",
      });
    }

    // 3. Plan verification
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(400).json({ success: false, message: "Selected subscription plan not found." });
    }
    if (!plan.isActive) {
      return res.status(400).json({ success: false, message: "Selected subscription plan is inactive." });
    }

    // 4. Derive seat entitlement
    let finalAssignedSeats = plan.maxAdminSeats || 3;
    let overrideFlag = false;
    let overrideReasonText = "";

    if (isCustomOverride) {
      overrideFlag = true;
      overrideReasonText = customOverrideReason
        ? String(customOverrideReason).trim()
        : "Custom seat allocation approved during subscriber onboarding";
      finalAssignedSeats = assignedSeats ? Math.max(1, Number(assignedSeats)) : (plan.maxAdminSeats || 3);
    } else if (assignedSeats && Number(assignedSeats) !== plan.maxAdminSeats) {
      // If frontend provided a custom assignedSeats different from plan default
      overrideFlag = true;
      overrideReasonText = customOverrideReason
        ? String(customOverrideReason).trim()
        : "Custom seat override configured at creation";
      finalAssignedSeats = Math.max(1, Number(assignedSeats));
    }

    // 5. Subscription dates & status
    const effectiveDays = durationDays ? Math.max(1, Number(durationDays)) : (plan.durationDays || 30);
    const startDate = new Date();
    const expiryDate = new Date(startDate.getTime() + effectiveDays * 24 * 60 * 60 * 1000);

    const subStatus = status && ["ACTIVE", "TRIAL"].includes(status) ? status : "ACTIVE";

    // 6. Secure Password Hashing
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 7. Create Super Admin User
    createdUser = await User.create({
      name: String(name).trim(),
      email: emailNormalized,
      phone: phone ? String(phone).trim() : "",
      passwordHash,
      role: "SUPER_ADMIN",
      businessName: String(businessName).trim(),
      status: "ACTIVE",
      tenantId: null, // Super Admin is the tenant root
    });

    // 8. Create Subscription record (0 used seats initially)
    createdSubscription = await Subscription.create({
      subscriberId: createdUser._id,
      planId: plan._id,
      status: subStatus,
      startDate,
      expiryDate,
      assignedSeats: finalAssignedSeats,
      usedSeats: 0,
      isCustomOverride: overrideFlag,
      customOverrideReason: overrideReasonText,
      notes: req.body.notes ? String(req.body.notes).trim() : "",
    });

    res.status(201).json({
      success: true,
      message: `Subscriber business "${createdUser.businessName}" created successfully with Super Admin account.`,
      data: {
        subscriber: {
          _id: createdUser._id,
          name: createdUser.name,
          email: createdUser.email,
          phone: createdUser.phone,
          businessName: createdUser.businessName,
          role: createdUser.role,
          status: createdUser.status,
          createdAt: createdUser.createdAt,
        },
        subscription: {
          _id: createdSubscription._id,
          planName: plan.name,
          status: createdSubscription.status,
          startDate: createdSubscription.startDate,
          expiryDate: createdSubscription.expiryDate,
          assignedSeats: finalAssignedSeats,
          usedSeats: 0,
        },
      },
    });
  } catch (error) {
    // Compensating cleanup on standalone MongoDB to prevent orphan records
    if (createdSubscription) {
      try {
        await Subscription.findByIdAndDelete(createdSubscription._id);
      } catch (cleanSubErr) {
        console.error("[CreateSubscriber Cleanup Error] Failed to delete orphan subscription:", cleanSubErr.message);
      }
    }
    if (createdUser) {
      try {
        await User.findByIdAndDelete(createdUser._id);
      } catch (cleanUserErr) {
        console.error("[CreateSubscriber Cleanup Error] Failed to delete orphan user:", cleanUserErr.message);
      }
    }
    next(error);
  }
};
