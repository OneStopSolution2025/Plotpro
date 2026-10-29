import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/api";

const AdminProfileContext = createContext(null);

const STORAGE_KEY = "dreamcity-admin-profile";

const DEFAULT_PROFILE = {
  id: "admin",
  name: "Branch Admin",
  mobile: "",
  email: "",
  role: "Branch Administrator",
  avatar: "",
};

export const AdminProfileProvider = ({ children }) => {
  const { user: authUser, role, isAuthenticated, setUser } = useAuth();

  const [profile, setProfile] = useState(() => {
    if (authUser) {
      return {
        id: String(authUser._id || authUser.id),
        name: authUser.name || "Branch Admin",
        email: authUser.email || "",
        mobile: authUser.phone || "",
        role:
          authUser.role === "SUPER_ADMIN"
            ? "Super Administrator"
            : "Branch Administrator",
        avatar: authUser.avatar || "",
      };
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_PROFILE, ...parsed };
      } catch (e) {
        console.warn("Failed to parse admin profile from localStorage:", e);
      }
    }
    return DEFAULT_PROFILE;
  });

  const [isSubscriptionExpired, setIsSubscriptionExpired] = useState(false);

  const fetchProfileStatus = useCallback(async () => {
    const token = localStorage.getItem("dreamcity_token");
    if (!token || !isAuthenticated) return;
    if (role !== "ADMIN" && authUser?.role !== "ADMIN") return;
    try {
      const res = await adminApi.getProfile();
      if (res?.success && res.data) {
        setIsSubscriptionExpired(Boolean(res.data.isSubscriptionExpired));
        setProfile((prev) => ({
          ...prev,
          name: res.data.name || prev.name,
          email: res.data.email || prev.email,
          mobile: res.data.phone || prev.mobile,
          // Branch context for Branch Admin accounts (null for legacy admins)
          branch: res.data.branch || null,
          projectQuota: res.data.projectQuota || null,
        }));
      }
    } catch (e) {
      console.warn("[AdminProfileContext] Failed to load profile status:", e.message);
    }
  }, [isAuthenticated, role, authUser?.role]);

  // Sync profile whenever authenticated user changes
  useEffect(() => {
    if (isAuthenticated && authUser) {
      const synced = {
        id: String(authUser._id || authUser.id),
        name: authUser.name,
        email: authUser.email,
        mobile: authUser.phone || "",
        role:
          authUser.role === "SUPER_ADMIN"
            ? "Super Administrator"
            : "Branch Administrator",
        avatar: authUser.avatar || "",
      };
      setProfile(synced);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(synced));
      fetchProfileStatus();
    } else if (!isAuthenticated) {
      setProfile(DEFAULT_PROFILE);
      setIsSubscriptionExpired(false);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [authUser, isAuthenticated, fetchProfileStatus]);

  useEffect(() => {
    if (profile && profile.id !== "admin") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }
  }, [profile]);

  const updateProfile = useCallback(
    async (fields) => {
      const trimmedName = fields.name?.trim() ?? profile.name;
      const trimmedMobile = fields.mobile !== undefined ? fields.mobile?.trim() : profile.mobile;

      try {
        const res = await adminApi.updateProfile({
          name: trimmedName,
          phone: trimmedMobile,
          mobile: trimmedMobile,
        });

        if (res?.success && res.data) {
          const updatedUser = res.data;
          const synced = {
            id: String(updatedUser._id || updatedUser.id),
            name: updatedUser.name,
            email: updatedUser.email,
            mobile: updatedUser.phone || "",
            role:
              updatedUser.role === "SUPER_ADMIN"
                ? "Super Administrator"
                : "Branch Administrator",
            avatar: updatedUser.avatar || "",
          };
          setProfile(synced);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(synced));
          if (authUser) {
            setUser((prev) => (prev ? { ...prev, ...updatedUser } : prev));
          }
          return { success: true, data: synced };
        }
      } catch (err) {
        console.warn("[AdminProfileContext] updateProfile API failed, falling back locally:", err.message);
      }

      // Local fallback
      const fallback = {
        ...profile,
        ...fields,
        name: trimmedName,
        mobile: trimmedMobile,
      };
      setProfile(fallback);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
      if (authUser) {
        setUser((prev) => (prev ? { ...prev, name: trimmedName, phone: trimmedMobile } : prev));
      }
      return { success: true, data: fallback };
    },
    [profile, authUser, setUser]
  );

  const switchAdminAccount = useCallback((admin) => {
    if (!admin) return;
    setProfile((prev) => ({
      ...prev,
      id: admin.id,
      name: admin.name,
      email: admin.email,
      mobile: admin.mobile || prev.mobile,
      role: admin.role || "Branch Administrator",
    }));
  }, []);

  const updateAvatar = useCallback(
    async (avatarDataUrl) => {
      try {
        await adminApi.updateProfile({ avatar: avatarDataUrl });
        if (authUser) {
          setUser((prev) => (prev ? { ...prev, avatar: avatarDataUrl } : prev));
        }
      } catch (err) {
        console.warn("[AdminProfileContext] updateAvatar API failed, saving locally:", err.message);
      }
      setProfile((prev) => ({ ...prev, avatar: avatarDataUrl }));
    },
    [authUser, setUser]
  );

  const removeAvatar = useCallback(
    async () => {
      try {
        await adminApi.updateProfile({ avatar: "" });
        if (authUser) {
          setUser((prev) => (prev ? { ...prev, avatar: "" } : prev));
        }
      } catch (err) {
        console.warn("[AdminProfileContext] removeAvatar API failed, removing locally:", err.message);
      }
      setProfile((prev) => ({ ...prev, avatar: "" }));
    },
    [authUser, setUser]
  );

  /**
   * Change password — calls the real backend API so MongoDB bcrypt hash is updated.
   * Returns a Promise<{ success: boolean, error?: string }>
   */
  const updatePassword = useCallback(
    async (currentPassword, newPassword, confirmPassword) => {
      if (!currentPassword) {
        return { success: false, error: "Current password is required." };
      }
      if (!newPassword) {
        return { success: false, error: "New password is required." };
      }
      if (newPassword.length < 8) {
        return {
          success: false,
          error: "New password must be at least 8 characters.",
        };
      }
      if (newPassword === currentPassword) {
        return {
          success: false,
          error: "New password must be different from current password.",
        };
      }
      if (newPassword !== confirmPassword) {
        return { success: false, error: "New passwords do not match." };
      }

      try {
        await adminApi.changePassword({ currentPassword, newPassword });
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err.message || "Failed to update password. Please try again.",
        };
      }
    },
    []
  );

  const value = {
    profile,
    isSubscriptionExpired,
    fetchProfileStatus,
    updateProfile,
    switchAdminAccount,
    updateAvatar,
    removeAvatar,
    updatePassword,
    hasPassword: true, // Always true — DB always has a bcrypt hash
  };

  return (
    <AdminProfileContext.Provider value={value}>
      {children}
    </AdminProfileContext.Provider>
  );
};

export const useAdminProfile = () => {
  const context = useContext(AdminProfileContext);
  if (!context) {
    throw new Error("useAdminProfile must be used within an AdminProfileProvider");
  }
  return context;
};