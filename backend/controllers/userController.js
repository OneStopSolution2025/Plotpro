import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";
import { findProjectByIdentifier, findPlotByIdentifier } from "../middleware/ownershipMiddleware.js";

/**
 * @desc    Get current user profile
 * @route   GET /api/user/profile
 * @access  Private
 */
export const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-passwordHash")
      .populate({
        path: "savedProjects",
        match: { isArchived: false, approvalStatus: "APPROVED" },
        select: "customId title location plotPrice priceLakhs totalPlots availablePlots image images",
      })
      .populate({
        path: "savedPlots",
        select: "customId plotNumber size facing price status projectId projectCustomId",
        populate: {
          path: "projectId",
          select: "customId title location",
        },
      });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user profile details (name, phone, email)
 * @route   PUT /api/user/profile
 * @access  Private
 */
export const updateUserProfile = async (req, res, next) => {
  try {
    const { name, phone, email, avatar } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (avatar !== undefined) user.avatar = avatar;

    if (email && email.trim().toLowerCase() !== user.email) {
      const emailNormalized = email.trim().toLowerCase();
      const existing = await User.findOne({ email: emailNormalized, _id: { $ne: user._id } });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "An account with this email address already exists.",
        });
      }
      user.email = emailNormalized;
    }

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
 * @desc    Change user password
 * @route   PUT /api/user/password
 * @access  Private
 */
export const changeUserPassword = async (req, res, next) => {
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
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
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

/**
 * @desc    Get user wishlist (saved projects and plots)
 * @route   GET /api/user/wishlist
 * @access  Private
 */
export const getUserWishlist = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: "savedProjects",
        match: { isArchived: false, approvalStatus: "APPROVED" },
        select: "customId title location plotPrice priceLakhs totalPlots availablePlots image images status",
      })
      .populate({
        path: "savedPlots",
        select: "customId plotNumber size facing price status projectId projectCustomId image images",
        populate: {
          path: "projectId",
          select: "customId title location",
        },
      });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        projects: user.savedProjects || [],
        plots: user.savedPlots || [],
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle saving a project to user wishlist
 * @route   POST /api/user/wishlist/projects/:id
 * @access  Private
 */
export const toggleSaveProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await findProjectByIdentifier(id);

    if (!project || project.isArchived || project.approvalStatus !== "APPROVED") {
      return res.status(404).json({ success: false, message: "Project not found or not active." });
    }

    const user = await User.findById(req.user._id);
    const existingIndex = user.savedProjects.findIndex(
      (pId) => pId.toString() === project._id.toString()
    );

    let isSaved = false;
    if (existingIndex > -1) {
      // Remove from wishlist
      user.savedProjects.splice(existingIndex, 1);
      isSaved = false;
    } else {
      // Add to wishlist
      user.savedProjects.push(project._id);
      isSaved = true;
    }

    await user.save();

    res.status(200).json({
      success: true,
      saved: isSaved,
      message: isSaved ? "Project added to your wishlist." : "Project removed from your wishlist.",
      projectId: project._id,
      projectCustomId: project.customId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle saving a plot to user wishlist
 * @route   POST /api/user/wishlist/plots/:id
 * @access  Private
 */
export const toggleSavePlot = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plot = await findPlotByIdentifier(id);

    if (!plot) {
      return res.status(404).json({ success: false, message: "Plot not found." });
    }

    const user = await User.findById(req.user._id);
    const existingIndex = user.savedPlots.findIndex(
      (pId) => pId.toString() === plot._id.toString()
    );

    let isSaved = false;
    if (existingIndex > -1) {
      // Remove from wishlist
      user.savedPlots.splice(existingIndex, 1);
      isSaved = false;
    } else {
      // Add to wishlist
      user.savedPlots.push(plot._id);
      isSaved = true;
    }

    await user.save();

    res.status(200).json({
      success: true,
      saved: isSaved,
      message: isSaved ? "Plot added to your wishlist." : "Plot removed from your wishlist.",
      plotId: plot._id,
      plotCustomId: plot.customId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get enquiries submitted by the current user
 * @route   GET /api/user/enquiries
 * @access  Private
 */
export const getUserEnquiries = async (req, res, next) => {
  try {
    const user = req.user;
    const matchConditions = [{ customerId: user._id }];

    if (user.email) {
      matchConditions.push({ email: { $regex: new RegExp(`^${user.email.trim()}$`, "i") } });
    }
    if (user.phone) {
      // Clean phone match (digits or exact)
      const digits = user.phone.replace(/\D/g, "");
      if (digits.length >= 7) {
        matchConditions.push({ mobile: { $regex: digits.slice(-10) } });
      } else {
        matchConditions.push({ mobile: user.phone });
      }
    }

    const enquiries = await Enquiry.find({ $or: matchConditions })
      .populate("projectId", "customId title location city image images layout")
      .populate("branchId", "name location city phone email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: enquiries,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get site visits scheduled by the current user
 * @route   GET /api/user/site-visits
 * @access  Private
 */
export const getUserSiteVisits = async (req, res, next) => {
  try {
    const user = req.user;
    const matchConditions = [{ customerId: user._id }];

    if (user.email) {
      matchConditions.push({ email: { $regex: new RegExp(`^${user.email.trim()}$`, "i") } });
    }
    if (user.phone) {
      const digits = user.phone.replace(/\D/g, "");
      if (digits.length >= 7) {
        matchConditions.push({ mobile: { $regex: digits.slice(-10) } });
      } else {
        matchConditions.push({ mobile: user.phone });
      }
    }

    const siteVisits = await SiteVisit.find({ $or: matchConditions })
      .populate("projectId", "customId title location city image images layout")
      .populate("branchId", "name location city phone email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: siteVisits,
    });
  } catch (error) {
    next(error);
  }
};
