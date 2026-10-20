import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { superAdminApi } from "../../services/api";

const SuperAdminProfileContext = createContext(null);

const STORAGE_KEY = "dreamcity-superadmin-profile";

const DEFAULT_PROFILE = {
  name: "Super Admin",
  email: "superadmin@dreamcity.in",
  mobile: "+91 99999 00000",
  role: "Super Administrator",
  avatar: "",
};

export const SuperAdminProfileProvider = ({ children }) => {
  const { user: authUser, isAuthenticated, setUser } = useAuth();

  const [profile, setProfile] = useState(() => {
    if (authUser && authUser.role === "SUPER_ADMIN") {
      return {
        id: String(authUser._id || authUser.id),
        name: authUser.name === "Supreme Admin" ? "Super Admin" : (authUser.name || "Super Admin"),
        email: authUser.email || "",
        mobile: authUser.phone || "",
        role: "Super Administrator",
        avatar: authUser.avatar || "",
      };
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.role === "Supreme Administrator") parsed.role = "Super Administrator";
        if (parsed.name === "Supreme Admin") parsed.name = "Super Admin";
        return { ...DEFAULT_PROFILE, ...parsed };
      } catch (e) {
        console.warn("Failed to parse super admin profile from localStorage:", e);
      }
    }
    return DEFAULT_PROFILE;
  });

  // Sync profile whenever authenticated user changes
  useEffect(() => {
    if (isAuthenticated && authUser && authUser.role === "SUPER_ADMIN") {
      const synced = {
        id: String(authUser._id || authUser.id),
        name: authUser.name === "Supreme Admin" ? "Super Admin" : (authUser.name || "Super Admin"),
        email: authUser.email || "",
        mobile: authUser.phone || "",
        role: "Super Administrator",
        avatar: authUser.avatar || "",
      };
      setProfile(synced);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(synced));
    } else if (!isAuthenticated) {
      setProfile(DEFAULT_PROFILE);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [authUser, isAuthenticated]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  const updateProfile = useCallback(
    async (fields) => {
      const trimmedName = fields.name?.trim() ?? profile.name;
      const trimmedMobile = fields.mobile !== undefined ? fields.mobile?.trim() : profile.mobile;

      try {
        const res = await superAdminApi.updateProfile({
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
            role: "Super Administrator",
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
        console.warn("[SuperAdminProfileContext] updateProfile API failed, falling back locally:", err.message);
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

  const updateAvatar = useCallback(
    async (avatarDataUrl) => {
      try {
        await superAdminApi.updateProfile({ avatar: avatarDataUrl });
        if (authUser) {
          setUser((prev) => (prev ? { ...prev, avatar: avatarDataUrl } : prev));
        }
      } catch (err) {
        console.warn("[SuperAdminProfileContext] updateAvatar API failed, saving locally:", err.message);
      }
      setProfile((prev) => ({ ...prev, avatar: avatarDataUrl }));
    },
    [authUser, setUser]
  );

  const removeAvatar = useCallback(
    async () => {
      try {
        await superAdminApi.updateProfile({ avatar: "" });
        if (authUser) {
          setUser((prev) => (prev ? { ...prev, avatar: "" } : prev));
        }
      } catch (err) {
        console.warn("[SuperAdminProfileContext] removeAvatar API failed, removing locally:", err.message);
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
        await superAdminApi.changePassword({ currentPassword, newPassword });
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
    updateProfile,
    updateAvatar,
    removeAvatar,
    updatePassword,
    hasPassword: true, // Always true — DB always has a bcrypt hash
  };

  return (
    <SuperAdminProfileContext.Provider value={value}>
      {children}
    </SuperAdminProfileContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSuperAdminProfile = () => {
  const context = useContext(SuperAdminProfileContext);
  if (!context) {
    throw new Error(
      "useSuperAdminProfile must be used within a SuperAdminProfileProvider"
    );
  }
  return context;
};
