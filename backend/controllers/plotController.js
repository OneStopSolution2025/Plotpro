import Plot from "../models/Plot.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import { createNotification } from "./notificationController.js";

/**
 * @desc    Get all plots belonging to an admin-owned project
 * @route   GET /api/admin/projects/:id/plots
 * @access  Private (Admin)
 */
export const getAdminProjectPlots = async (req, res, next) => {
  try {
    const project = req.project;

    const plots = await Plot.find({ projectId: project._id }).sort({
      plotNumber: 1,
      createdAt: 1,
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
 * @desc    Create a new plot inside an admin-owned project
 * @route   POST /api/admin/projects/:id/plots
 * @access  Private (Admin)
 */
export const createAdminProjectPlot = async (req, res, next) => {
  try {
    const project = req.project;
    const { plotNumber, size, facing, price, status, image, images } = req.body;

    if (!plotNumber || !size || !facing || !price) {
      return res.status(400).json({
        success: false,
        message: "plotNumber, size, facing, and price are required.",
      });
    }

    // Check for duplicate plotNumber in this project
    const existingPlot = await Plot.findOne({
      projectId: project._id,
      plotNumber: String(plotNumber).trim(),
    });

    if (existingPlot) {
      return res.status(400).json({
        success: false,
        message: `Plot number ${plotNumber} already exists in this project.`,
      });
    }

    const plotIndex = (await Plot.countDocuments({ projectId: project._id })) + 1;
    const customId = `${project.customId || project._id}-${plotIndex}`;

    const newPlot = await Plot.create({
      customId,
      projectId: project._id,
      projectCustomId: project.customId || null,
      plotNumber: String(plotNumber).trim(),
      size: size.trim(),
      facing: facing.trim(),
      price: price.trim(),
      status: status || "Available",
      image: image || project.image || "",
      images: images || project.images || [],
    });

    res.status(201).json({
      success: true,
      message: "Plot created successfully.",
      data: newPlot,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a plot (ownership verified through parent project)
 * @route   PUT /api/admin/plots/:id
 * @access  Private (Admin)
 */
export const updateAdminPlot = async (req, res, next) => {
  try {
    const plot = req.plot;
    const { size, facing, price, status, image, images } = req.body;

    const oldStatus = plot.status;
    if (size !== undefined) plot.size = size.trim();
    if (facing !== undefined) plot.facing = facing.trim();
    if (price !== undefined) plot.price = price.trim();
    if (status !== undefined) plot.status = status;
    if (image !== undefined) plot.image = image;
    if (images !== undefined) plot.images = images;

    await plot.save();

    // If status changed to Sold, notify all Super Admins
    if (status === "Sold" && oldStatus !== "Sold") {
      try {
        const parentProject = await Project.findById(plot.projectId).select("title customId");
        const superAdmins = await User.find({ role: "SUPER_ADMIN" }).select("_id");
        for (const sa of superAdmins) {
          await createNotification({
            recipient: sa._id,
            sender: req.user._id,
            senderRole: "ADMIN",
            senderName: req.user.name || "Normal Admin",
            type: "PLOT_SOLD",
            title: "Plot Marked as Sold",
            message: `${req.user.name || "Admin"} marked Plot #${plot.plotNumber} in "${parentProject?.title || "Project"}" as SOLD.`,
            metadata: {
              projectId: String(parentProject?.customId || plot.projectId),
              projectTitle: parentProject?.title,
              plotNumber: String(plot.plotNumber),
              adminId: String(req.user._id),
              adminName: req.user.name,
            },
          });
        }
      } catch (notifErr) {
        console.error("[PlotSold Notification Error]:", notifErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "Plot updated successfully.",
      data: plot,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a plot (ownership verified through parent project)
 * @route   DELETE /api/admin/plots/:id
 * @access  Private (Admin)
 */
export const deleteAdminPlot = async (req, res, next) => {
  try {
    const plot = req.plot;
    await plot.deleteOne();

    res.status(200).json({
      success: true,
      message: "Plot deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Apply a common plot image to all plots of a project
 * @route   PUT /api/admin/projects/:id/plots/default-image
 * @access  Private (Admin)
 */
export const updateProjectPlotsDefaultImage = async (req, res, next) => {
  try {
    const project = req.project;
    const { defaultPlotImage } = req.body;

    if (!defaultPlotImage || !defaultPlotImage.trim()) {
      return res.status(400).json({
        success: false,
        message: "Default plot image URL is required.",
      });
    }

    const trimmedUrl = defaultPlotImage.trim();

    // 1. Update project document
    project.defaultPlotImage = trimmedUrl;
    await project.save();

    // 2. Bulk update all plots under this project
    await Plot.updateMany(
      { projectId: project._id },
      {
        $set: {
          image: trimmedUrl,
          images: [trimmedUrl],
        },
      }
    );

    const updatedPlots = await Plot.find({ projectId: project._id }).sort({
      plotNumber: 1,
      createdAt: 1,
    });

    res.status(200).json({
      success: true,
      message: `Common plot image updated for all ${updatedPlots.length} plots successfully.`,
      defaultPlotImage: trimmedUrl,
      data: updatedPlots,
    });
  } catch (error) {
    next(error);
  }
};

