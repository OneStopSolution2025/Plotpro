import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi, publicApi, setAuthToken } from "../services/api";
import { triggerGlobalToast } from "./ToastContext";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(() => localStorage.getItem("dreamcity_token"));
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session on mount, plus instant suspension listener
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem("dreamcity_token");
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await authApi.getMe();
        if (response?.success && response.user) {
          setUser(response.user);
        } else {
          setAuthToken(null);
          setUser(null);
          setTokenState(null);
        }
      } catch (err) {
        console.warn("[Auth] Failed to restore session:", err.message);
        // Only clear credentials if backend explicitly replied with 401 or 403 (invalid/expired session)
        // If it's a network glitch or "Failed to fetch", keep the token so the user is not abruptly logged out
        if (err.status === 401 || err.status === 403) {
          setAuthToken(null);
          setUser(null);
          setTokenState(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen for global auth rejection events (e.g. 403 suspension from backend)
    let isHandlingEviction = false;
    const handleAuthError = (event) => {
      if (isHandlingEviction) return;
      isHandlingEviction = true;

      console.warn("[Auth] Account suspended or session revoked:", event.detail);
      setAuthToken(null);
      setTokenState(null);
      setUser(null);

      const toastMsg = event.detail?.message || "Your account access has been suspended by the platform administrator.";
      triggerGlobalToast(toastMsg, "error");

      // Smoothly navigate to login after user has sufficient time to read the toast
      setTimeout(() => {
        window.location.href = "/login";
      }, 3500);
    };

    window.addEventListener("plotpro:auth-error", handleAuthError);

    // Heartbeat check every 8 seconds when user is logged in as Super Admin or Admin
    const heartbeatInterval = setInterval(async () => {
      const currentToken = localStorage.getItem("dreamcity_token");
      if (!currentToken) return;

      try {
        const res = await authApi.getMe();
        if (res?.success && res.user) {
          if (res.user.status === "INACTIVE") {
            handleAuthError({ detail: { message: "Your account has been suspended by the platform administrator." } });
          }
        }
      } catch (err) {
        // Only trigger auth error if backend explicitly returned 401 or 403 with suspension/revocation
        // Pure network failures ("Failed to fetch") must NOT log the user out
        if (err.status === 401) {
          handleAuthError({ detail: { message: err.message || "Session expired. Please log in again." } });
        } else if (err.status === 403 && (
          err.data?.message?.includes("suspended") ||
          err.data?.message?.includes("deactivated")
        )) {
          handleAuthError({ detail: { message: err.message } });
        }
      }
    }, 8000);

    return () => {
      window.removeEventListener("plotpro:auth-error", handleAuthError);
      clearInterval(heartbeatInterval);
    };
  }, []);

  const login = async (email, password) => {
    setIsLoading(true);
    try {
      const response = await authApi.login({ email, password });
      if (response?.success && response.token) {
        setAuthToken(response.token);
        setTokenState(response.token);
        setUser(response.user);
        return { success: true, user: response.user };
      }
      // Pass through device challenge responses without throwing an error:
      if (
        response?.requiresDeviceOtp ||
        response?.requiresFirstDeviceEnrollmentOtp ||
        response?.requiresTransferApproval ||
        response?.requiresDeviceRecovery
      ) {
        return response;
      }
      throw new Error(response?.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (name, email, password, phone = "") => {
    setIsLoading(true);
    try {
      const response = await authApi.register({ name, email, password, phone });
      if (response?.success && response.token) {
        setAuthToken(response.token);
        setTokenState(response.token);
        setUser(response.user);
        return { success: true, user: response.user };
      }
      throw new Error(response?.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (credential) => {
    setIsLoading(true);
    try {
      const response = await authApi.googleLogin(credential);
      if (response?.success && response.token) {
        setAuthToken(response.token);
        setTokenState(response.token);
        setUser(response.user);
        return { success: true, user: response.user };
      }
      if (
        response?.requiresDeviceOtp ||
        response?.requiresFirstDeviceEnrollmentOtp ||
        response?.requiresTransferApproval ||
        response?.requiresDeviceRecovery
      ) {
        return response;
      }
      throw new Error(response?.message || "Google authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (e) {
      console.warn("[Auth] Server logout notice:", e.message);
    } finally {
      setAuthToken(null);
      setTokenState(null);
      setUser(null);
      try {
        localStorage.removeItem("dreamcity-projects");
        localStorage.removeItem("dreamcity-plots-v2");
        localStorage.removeItem("dreamcity-enquiries");
        localStorage.removeItem("dreamcity-site-visits");
        localStorage.removeItem("dreamcity-customers");
        localStorage.removeItem("dreamcity-admin-profile");
      } catch (e) {
        console.warn("[Auth] Failed to clean localStorage on logout:", e);
      }
    }
  };

  const value = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user,
    role: user?.role || null,
    isAdmin: user?.role === "ADMIN" || user?.role === "SUPER_ADMIN",
    isSuperAdmin: user?.role === "SUPER_ADMIN",
    isSupremeAdmin: user?.role === "SUPREME_ADMIN",
    isNormalAdmin: user?.role === "ADMIN",
    login,
    signup,
    loginWithGoogle,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default AuthContext;
