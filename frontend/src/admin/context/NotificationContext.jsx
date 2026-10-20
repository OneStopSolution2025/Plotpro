import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { notificationApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch notifications from DB (strictly isolated by logged-in user token)
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      setLoading(true);
      const res = await notificationApi.getNotifications();
      if (res?.success) {
        // Map backend schema to what UI expects
        const mapped = (res.data || []).map((n) => ({
          id: n._id,
          recipient: n.recipient,
          senderName: n.senderName,
          senderRole: n.senderRole,
          actorName: n.senderName,
          type: n.type,
          title: n.title,
          message: n.message,
          projectId: n.metadata?.projectId || null,
          plotNumber: n.metadata?.plotNumber || null,
          timestamp: n.createdAt,
          read: n.read,
        }));
        setNotifications(mapped);
        setUnreadCount(res.unreadCount || mapped.filter((n) => !n.read).length);
      }
    } catch (err) {
      console.warn("[NotificationContext] fetch error:", err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Initial load and periodic poll every 15 seconds for real-time alerts
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  /**
   * Mark single notification as read
   */
  const markAsRead = useCallback(async (notificationId) => {
    try {
      // Optimistic UI update
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      await notificationApi.markRead(notificationId);
    } catch (err) {
      console.error("[NotificationContext] markAsRead error:", err.message);
    }
  }, []);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      await notificationApi.markAllRead();
    } catch (err) {
      console.error("[NotificationContext] markAllAsRead error:", err.message);
    }
  }, []);

  /**
   * Clear all notifications
   */
  const clearNotifications = useCallback(async () => {
    try {
      setNotifications([]);
      setUnreadCount(0);
      await notificationApi.clearAll();
    } catch (err) {
      console.error("[NotificationContext] clearNotifications error:", err.message);
    }
  }, []);

  // Backwards-compatible addNotification stub
  const addNotification = useCallback(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const value = {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
};
