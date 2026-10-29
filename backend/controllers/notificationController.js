import Notification from "../models/Notification.js";

/**
 * Helper to emit a notification safely into MongoDB
 */
export const createNotification = async ({
  recipient,
  sender = null,
  senderRole = "SYSTEM",
  senderName = "System",
  type,
  title,
  message,
  metadata = {},
}) => {
  try {
    if (!recipient) return null;
    return await Notification.create({
      recipient,
      sender,
      senderRole,
      senderName,
      type,
      title,
      message,
      metadata,
    });
  } catch (error) {
    console.error("[createNotification error]:", error.message);
    return null;
  }
};

/**
 * @desc    Get notifications for the logged in user (isolated by recipient)
 * @route   GET /api/notifications
 * @access  Private (Admin / Super Admin)
 */
export const getMyNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      read: false,
    });

    res.status(200).json({
      success: true,
      unreadCount,
      count: notifications.length,
      data: notifications,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark a single notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private
 */
export const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOne({
      _id: id,
      recipient: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    notification.read = true;
    notification.readAt = new Date();
    await notification.save();

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark all user's notifications as read
 * @route   PATCH /api/notifications/read-all
 * @access  Private
 */
export const markAllNotificationsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Clear / delete all notifications for current user
 * @route   DELETE /api/notifications
 * @access  Private
 */
export const clearMyNotifications = async (req, res, next) => {
  try {
    await Notification.deleteMany({ recipient: req.user._id });

    res.status(200).json({
      success: true,
      message: "Notifications cleared",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Manual trigger to clean up all viewed notifications from DB
 * @route   POST /api/notifications/cleanup
 * @access  Private (Admin / Super Admin / Supreme Admin)
 */
export const triggerNotificationCleanup = async (req, res, next) => {
  try {
    const { cleanupViewedNotifications } = await import(
      "../services/notificationCleanupService.js"
    );
    const result = await cleanupViewedNotifications();

    res.status(200).json({
      success: true,
      message: `Cleaned up ${result.deletedCount} viewed notifications from database.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};
