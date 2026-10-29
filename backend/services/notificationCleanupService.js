import Notification from "../models/Notification.js";
import TrustedDevice from "../models/TrustedDevice.js";
import DeviceApprovalRequest from "../models/DeviceApprovalRequest.js";

let cleanupTimer = null;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

/**
 * Permanently delete viewed/read notifications from MongoDB.
 * Unread notifications (read: false) are NEVER deleted.
 *
 * @returns {Promise<{ deletedCount: number }>}
 */
export const cleanupViewedNotifications = async () => {
  try {
    const result = await Notification.deleteMany({ read: true });
    const count = result?.deletedCount || 0;
    if (count > 0) {
      console.log(
        `[NotificationCleanup] Purged ${count} viewed notifications from MongoDB Atlas.`
      );
    } else {
      console.log("[NotificationCleanup] No viewed notifications to clean up.");
    }
    return { deletedCount: count };
  } catch (error) {
    console.error("[NotificationCleanup error]: Failed to clean up notifications:", error.message);
    return { deletedCount: 0, error: error.message };
  }
};

/**
 * Permanently delete obsolete/non-active device data from MongoDB:
 * 1. Only active approved devices (status: "APPROVED") stay in TrustedDevice.
 * 2. Only active pending requests (status: "PENDING_APPROVAL" or "APPROVED_PENDING_CLAIM" that have not expired) stay in DeviceApprovalRequest.
 * All REJECTED, CANCELLED, EXPIRED, CLAIMED, REVOKED, REPLACED records are purged to maintain minimal storage.
 */
export const cleanupStaleDeviceData = async () => {
  try {
    // 1. Purge non-approved trusted devices (REVOKED, REPLACED, etc.)
    const deviceRes = await TrustedDevice.deleteMany({
      status: { $ne: "APPROVED" },
    });

    // 2. Purge stale device approval requests (REJECTED, CANCELLED, EXPIRED, CLAIMED, or past expiration)
    const requestRes = await DeviceApprovalRequest.deleteMany({
      $or: [
        { status: { $in: ["REJECTED", "CANCELLED", "EXPIRED", "CLAIMED"] } },
        { expiresAt: { $lt: new Date() } },
      ],
    });

    const devicesPurged = deviceRes?.deletedCount || 0;
    const requestsPurged = requestRes?.deletedCount || 0;

    if (devicesPurged > 0 || requestsPurged > 0) {
      console.log(
        `[DeviceDataCleanup] Purged ${devicesPurged} stale trusted devices and ${requestsPurged} inactive approval requests from DB.`
      );
    }
    return { devicesPurged, requestsPurged };
  } catch (error) {
    console.error("[DeviceDataCleanup error]: Failed to clean up stale device records:", error.message);
    return { devicesPurged: 0, requestsPurged: 0, error: error.message };
  }
};

/**
 * Start the background scheduler that executes cleanup routines every 2 hours.
 */
export const startNotificationCleanupScheduler = () => {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  console.log("[StorageMaintenance] 2-Hour automated cleanup scheduler initialized (Notifications & Devices).");

  // Run a quiet initial cleanup after 15 seconds of server startup to handle accumulated records
  const initialTimeout = setTimeout(async () => {
    try {
      await cleanupViewedNotifications();
      await cleanupStaleDeviceData();
    } catch (err) {
      console.warn("[StorageMaintenance] Initial scan error:", err.message);
    }
  }, 15000);

  if (initialTimeout.unref) {
    initialTimeout.unref();
  }

  // Periodic timer: every 2 hours
  cleanupTimer = setInterval(async () => {
    try {
      await cleanupViewedNotifications();
      await cleanupStaleDeviceData();
    } catch (err) {
      console.error("[StorageMaintenance interval error]:", err.message);
    }
  }, TWO_HOURS_MS);

  // Unref timer so it doesn't hold open Node process during graceful exit / tests
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
};

/**
 * Stop scheduler (used for test teardown / server shutdown)
 */
export const stopNotificationCleanupScheduler = () => {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    console.log("[StorageMaintenance] Scheduler stopped.");
  }
};
