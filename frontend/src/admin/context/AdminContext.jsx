import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useNotifications } from "./NotificationContext";
import { useAuth } from "../../context/AuthContext";
import { superAdminApi } from "../../services/api";

const AdminContext = createContext(null);
const STORAGE_KEY = "dreamcity-admins";

export const AdminProvider = ({ children }) => {
  const { user, role, isAuthenticated, isSuperAdmin: authIsSuperAdmin } = useAuth();
  const { addNotification } = useNotifications();
  const [admins, setAdmins] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((a) => ({
            ...a,
            status: a.status === "Active" || a.status === "ACTIVE" ? "Active" : "Inactive",
          }));
        }
      } catch (e) {
        console.warn("Failed to parse dreamcity-admins from localStorage:", e);
      }
    }
    return [];
  });

  const isSuperAdmin = authIsSuperAdmin || (isAuthenticated && (role === "SUPER_ADMIN" || user?.role === "SUPER_ADMIN"));

  const [subscriptionInfo, setSubscriptionInfo] = useState(null);

  const fetchSubscriptionInfo = useCallback(async () => {
    const token = localStorage.getItem("dreamcity_token");
    if (!token || !isAuthenticated || !isSuperAdmin) return;
    try {
      const res = await superAdminApi.getSubscriptionInfo();
      if (res?.success) {
        setSubscriptionInfo(res.data);
      }
    } catch (e) {
      console.warn("[AdminContext] Failed to load subscription info:", e.message);
    }
  }, [isAuthenticated, isSuperAdmin]);

  const fetchAdmins = useCallback(async () => {
    try {
      const token = localStorage.getItem("dreamcity_token");
      if (!token || !isAuthenticated || !isSuperAdmin) return;

      fetchSubscriptionInfo();

      const res = await superAdminApi.getAdmins();
      if (res?.success && Array.isArray(res.data)) {
        const formatted = res.data.map((a) => ({
          id: String(a._id),
          _id: a._id,
          name: a.name,
          email: a.email,
          mobile: a.phone || "",
          role: "Branch Administrator",
          status: a.status === "ACTIVE" ? "Active" : "Inactive",
          deactivatedBySupreme: Boolean(a.deactivatedBySupreme),
          assignedProjectsCount: a.assignedProjectsCount || 0,
          projectsCount: a.projectsCount || a.assignedProjectsCount || 0,
          totalPlots: a.totalPlots || 0,
          availablePlots: a.availablePlots || 0,
          reservedPlots: a.reservedPlots || 0,
          soldPlots: a.soldPlots || 0,
        }));
        setAdmins(formatted);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(formatted));
      }
    } catch (err) {
      console.warn("[AdminContext] Failed to fetch admins from API:", err.message);
    }
  }, [isAuthenticated, isSuperAdmin, fetchSubscriptionInfo]);

  useEffect(() => {
    if (!isAuthenticated || !isSuperAdmin) return;

    // Initial load
    fetchSubscriptionInfo();
    fetchAdmins();

    // Smart background polling (every 6 seconds) for real-time live updates
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchSubscriptionInfo();
        fetchAdmins();
      }
    }, 6000);

    // Instant refresh whenever the user switches back to this tab
    const handleFocus = () => {
      fetchSubscriptionInfo();
      fetchAdmins();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [isAuthenticated, isSuperAdmin, fetchAdmins, fetchSubscriptionInfo]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(admins));
  }, [admins]);

  const getAdminById = useCallback(
    (id) => admins.find((a) => String(a.id) === String(id) || String(a._id) === String(id)) || null,
    [admins]
  );

  const createAdmin = useCallback(
    async ({ name, email, mobile, password }) => {
      const trimmedName = name?.trim() || "";
      const trimmedEmail = email?.trim() || "";
      const trimmedMobile = mobile?.trim() || "";

      if (!trimmedName || !trimmedEmail) {
        return { success: false, error: "Name and Email are required." };
      }

      try {
        const res = await superAdminApi.createAdmin({
          name: trimmedName,
          email: trimmedEmail,
          mobile: trimmedMobile,
          password: password || "Admin@123",
        });

        if (res?.success && res.data) {
          const newAdmin = {
            id: String(res.data._id),
            _id: res.data._id,
            name: res.data.name,
            email: res.data.email,
            mobile: res.data.phone || "",
            role: "Branch Administrator",
            status: "Active",
            assignedProjectsCount: 0,
          };
          setAdmins((prev) => {
            const exists = prev.some((a) => a.email === newAdmin.email);
            if (exists) {
              return prev.map((a) => a.email === newAdmin.email ? { ...a, ...newAdmin } : a);
            }
            return [newAdmin, ...prev];
          });
          // Refresh subscription info after creation
          fetchSubscriptionInfo();
          return { success: true, admin: newAdmin };
        }
        return { success: false, error: res?.message || "Failed to create branch administrator account." };
      } catch (err) {
        console.error("[AdminContext] createAdmin API call failed:", err.message);
        return { success: false, error: err.message || "Failed to create branch administrator account." };
      }
    },
    [fetchSubscriptionInfo]
  );

  const updateAdmin = useCallback(
    async (id, fields) => {
      try {
        await superAdminApi.updateAdmin(id, {
          name: fields.name,
          email: fields.email,
          mobile: fields.mobile,
          status: fields.status === "Active" ? "ACTIVE" : fields.status === "Inactive" ? "INACTIVE" : undefined,
        });
      } catch (err) {
        console.warn("[AdminContext] updateAdmin API call failed, applying locally:", err.message);
      }

      setAdmins((prev) =>
        prev.map((a) => {
          if (String(a.id) !== String(id) && String(a._id) !== String(id)) return a;
          const updated = {
            ...a,
            name: fields.name?.trim() ?? a.name,
            email: fields.email?.trim() ?? a.email,
            mobile: fields.mobile?.trim() ?? a.mobile,
            status: fields.status ? (fields.status === "Active" ? "Active" : "Inactive") : a.status,
          };

          addNotification({
            adminId: a.id,
            adminName: updated.name,
            type: "PROFILE_UPDATED",
            title: "Account Details Updated",
            message: `Super Admin updated your account details (Name: "${updated.name}", Email: "${updated.email}").`,
          });

          return updated;
        })
      );
      return { success: true };
    },
    [addNotification]
  );

  const toggleAdminStatus = useCallback(
    async (id) => {
      try {
        const res = await superAdminApi.toggleAdminStatus(id);
        if (res && res.success === false) {
          return { success: false, error: res.message || "Failed to update admin status." };
        }
      } catch (err) {
        console.error("[AdminContext] toggleAdminStatus API failed:", err.message);
        return { success: false, error: err.message || "Failed to toggle status." };
      }

      setAdmins((prev) =>
        prev.map((a) => {
          if (String(a.id) !== String(id) && String(a._id) !== String(id)) return a;
          const nextStatus = a.status === "Active" ? "Inactive" : "Active";

          const now = new Date();
          const dateStr = now.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
          const timeStr = now.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          });

          if (nextStatus === "Inactive") {
            addNotification({
              adminId: a.id,
              adminName: a.name,
              type: "DEACTIVATED",
              title: "Account Deactivated",
              message: `Super Admin deactivated your branch admin account on ${dateStr} at ${timeStr}. Your operational access and permissions have been paused.`,
            });
          } else {
            addNotification({
              adminId: a.id,
              adminName: a.name,
              type: "ACTIVATED",
              title: "Account Activated",
              message: `Super Admin activated your branch admin account on ${dateStr} at ${timeStr}. Full branch administrator privileges have been restored.`,
            });
          }

          return { ...a, status: nextStatus };
        })
      );
      // Refresh subscription info after toggling
      fetchSubscriptionInfo();
      return { success: true };
    },
    [addNotification, fetchSubscriptionInfo]
  );

  const deleteAdmin = useCallback(
    async (id) => {
      // Find the target admin to get their real MongoDB _id
      const target = admins.find((a) => String(a.id) === String(id) || String(a._id) === String(id));
      const targetMongoId = target?._id || target?.id || id;

      try {
        await superAdminApi.deleteAdmin(targetMongoId);
      } catch (err) {
        console.warn("[AdminContext] deleteAdmin API call failed:", err.message);
        // If the error message indicates not found (already deleted) or other, we still proceed
      }

      setAdmins((prev) => {
        const updated = prev.filter(
          (a) => String(a.id) !== String(id) &&
                 String(a._id) !== String(id) &&
                 String(a.id) !== String(targetMongoId) &&
                 String(a._id) !== String(targetMongoId)
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });

      // Refetch from database to ensure state is in sync with backend
      await fetchAdmins();

      return { success: true };
    },
    [admins, fetchAdmins]
  );

  const value = {
    admins,
    subscriptionInfo,
    fetchSubscriptionInfo,
    fetchAdmins,
    getAdminById,
    createAdmin,
    updateAdmin,
    toggleAdminStatus,
    deleteAdmin,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};

export const useAdmins = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmins must be used within an AdminProvider");
  }
  return context;
};
