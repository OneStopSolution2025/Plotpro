import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";

/**
 * @desc    Get current admin profile
 * @route   GET /api/admin/profile
 * @access  Private (Admin)
 */
export const getAdminProfile = async (req, res) => {
  let isSubscriptionExpired = false;
  if (req.user.tenantId) {
    const sub = await Subscription.findOne({ subscriberId: req.user.tenantId });
    if (sub) {
      const isDateExpired = Boolean(sub.expiryDate && new Date(sub.expiryDate) <= new Date());
      isSubscriptionExpired = sub.status === "EXPIRED" || isDateExpired;
    }
  }

  res.status(200).json({
    success: true,
    data: {
      ...req.user.toObject ? req.user.toObject() : req.user,
      isSubscriptionExpired,
    },
  });
};

/**
 * @desc    Update current admin profile
 * @route   PUT /api/admin/profile
 * @access  Private (Admin)
 */
export const updateAdminProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (req.body.name) user.name = req.body.name.trim();
    if (req.body.phone !== undefined) user.phone = req.body.phone.trim();
    if (req.body.mobile !== undefined) user.phone = req.body.mobile.trim();
    if (req.body.avatar !== undefined) user.avatar = req.body.avatar;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Change password
 * @route   PUT /api/admin/profile/password
 * @access  Private (Admin)
 */
export const changeAdminPassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long.",
      });
    }

    const user = await User.findById(req.user._id).select("+passwordHash");

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password does not match.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    next(error);
  }
};
