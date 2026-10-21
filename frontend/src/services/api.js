/**
 * DreamCity API Client
 * Provides centralized fetch wrappers with Bearer token authentication and error handling.
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const getToken = () => localStorage.getItem("dreamcity_token");

export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem("dreamcity_token", token);
  } else {
    localStorage.removeItem("dreamcity_token");
  }
};

export const getAuthToken = () => getToken();

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  if (config.body && typeof config.body === "object" && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  try {
    const res = await fetch(url, config);

    // Parse JSON response safely
    let data;
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = { message: await res.text() };
    }

    if (!res.ok) {
      const error = new Error(data.message || `Request failed with status ${res.status}`);
      error.status = res.status;
      error.data = data;

      // Only trigger plotpro:auth-error if the logged-in user's own session/account is suspended/revoked
      const isAccountSuspended = data.isSuspended || 
        (res.status === 403 && (
          data.message?.includes("business subscriber account has been suspended") ||
          data.message?.includes("subscription has been suspended") ||
          data.message?.includes("organization account has been suspended") ||
          data.message?.includes("Your account has been deactivated")
        ));

      if (res.status === 401 || isAccountSuspended) {
        window.dispatchEvent(
          new CustomEvent("plotpro:auth-error", {
            detail: { status: res.status, message: data.message || "Session revoked" },
          })
        );
      }

      throw error;
    }

    return data;
  } catch (error) {
    console.error(`[API Error] ${options.method || "GET"} ${endpoint}:`, error.message);
    throw error;
  }
}

export const api = {
  get: (endpoint, options) => request(endpoint, { ...options, method: "GET" }),
  post: (endpoint, body, options) => request(endpoint, { ...options, method: "POST", body }),
  put: (endpoint, body, options) => request(endpoint, { ...options, method: "PUT", body }),
  patch: (endpoint, body, options) => request(endpoint, { ...options, method: "PATCH", body }),
  delete: (endpoint, options) => request(endpoint, { ...options, method: "DELETE" }),
};

// ==================== AUTH APIs ====================
export const authApi = {
  login: (credentials) => api.post("/auth/login", credentials),
  register: (userData) => api.post("/auth/register", userData),
  googleLogin: (credential) => api.post("/auth/google", { credential }),
  getMe: () => api.get("/auth/me"),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  verifyOtp: (email, otp) => api.post("/auth/verify-otp", { email, otp }),
  resetPassword: (email, otp, newPassword) =>
    api.post("/auth/reset-password", { email, otp, newPassword }),
};


// ==================== PUBLIC APIs ====================
export const publicApi = {
  getSettings: () => api.get("/public/settings"),
  getProjects: () => api.get("/public/projects"),
  getProjectById: (id) => api.get(`/public/projects/${id}`),
  getProjectPlots: (id) => api.get(`/public/projects/${id}/plots`),
  getPlotById: (id) => api.get(`/public/plots/${id}`),
  submitEnquiry: (data) => api.post("/public/enquiries", data),
  submitSiteVisit: (data) => api.post("/public/site-visits", data),
};

// ==================== ADMIN APIs ====================
export const adminApi = {
  getProjects: () => api.get("/admin/projects"),
  getProjectById: (id) => api.get(`/admin/projects/${id}`),
  createProject: (data) => api.post("/admin/projects", data),
  updateProject: (id, data) => api.put(`/admin/projects/${id}`, data),
  deleteProject: (id) => api.delete(`/admin/projects/${id}`),
  getProjectPlots: (projectId) => api.get(`/admin/projects/${projectId}/plots`),
  createPlot: (projectId, data) => api.post(`/admin/projects/${projectId}/plots`, data),
  updateProjectPlotsDefaultImage: (projectId, defaultPlotImage) =>
    api.put(`/admin/projects/${projectId}/plots/default-image`, { defaultPlotImage }),
  updatePlot: (plotId, data) => api.put(`/admin/plots/${plotId}`, data),
  deletePlot: (plotId) => api.delete(`/admin/plots/${plotId}`),
  getEnquiries: () => api.get("/admin/enquiries"),
  updateEnquiryStatus: (id, status) => api.patch(`/admin/enquiries/${id}/status`, { status }),
  getSiteVisits: () => api.get("/admin/site-visits"),
  updateSiteVisitStatus: (id, status) => api.patch(`/admin/site-visits/${id}/status`, { status }),
  getProfile: () => api.get("/admin/profile"),
  updateProfile: (data) => api.put("/admin/profile", data),
  changePassword: (data) => api.put("/admin/profile/password", data),
};

// ==================== SUPER ADMIN APIs ====================
export const superAdminApi = {
  getAnalytics: () => api.get("/super-admin/analytics"),
  getAdmins: () => api.get("/super-admin/admins"),
  createAdmin: (data) => api.post("/super-admin/admins", data),
  updateAdmin: (id, data) => api.put(`/super-admin/admins/${id}`, data),
  toggleAdminStatus: (id) => api.patch(`/super-admin/admins/${id}/status`),
  deleteAdmin: (id) => api.delete(`/super-admin/admins/${id}`),
  getAllProjects: () => api.get("/super-admin/projects"),
  createProject: (data) => api.post("/super-admin/projects", data),
  getPendingProjects: () => api.get("/super-admin/projects/pending"),
  approveProject: (id) => api.patch(`/super-admin/projects/${id}/approve`),
  rejectProject: (id, reason) => api.patch(`/super-admin/projects/${id}/reject`, { reason }),
  assignProject: (id, adminId) => api.patch(`/super-admin/projects/${id}/assign`, { adminId }),
  archiveProject: (id) => api.delete(`/super-admin/projects/${id}`),
  getAllEnquiries: () => api.get("/super-admin/enquiries"),
  updateEnquiryStatus: (id, status) => api.patch(`/super-admin/enquiries/${id}/status`, { status }),
  getAllSiteVisits: () => api.get("/super-admin/site-visits"),
  getAllPlots: () => api.get("/super-admin/plots"),
  getProjectPlots: (id) => api.get(`/super-admin/projects/${id}/plots`),
  getSubscriptionInfo: () => api.get("/super-admin/subscription-info"),
  getProfile: () => api.get("/super-admin/profile"),
  updateProfile: (data) => api.put("/super-admin/profile", data),
  changePassword: (data) => api.put("/super-admin/profile/password", data),
};

// ==================== SUPREME ADMIN APIs ====================
export const supremeAdminApi = {
  getOverview: () => api.get("/supreme-admin/overview"),
  getSubscribers: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/supreme-admin/subscribers${qs ? `?${qs}` : ""}`);
  },
  createSubscriber: (data) => api.post("/supreme-admin/subscribers", data),
  getSubscriberById: (id) => api.get(`/supreme-admin/subscribers/${id}`),
  toggleSubscriberStatus: (id) => api.patch(`/supreme-admin/subscribers/${id}/status`),
  assignSubscription: (subscriberId, data) =>
    api.post(`/supreme-admin/subscribers/${subscriberId}/subscription`, data),
  toggleAdminStatus: (subscriberId, adminId) =>
    api.patch(`/supreme-admin/subscribers/${subscriberId}/admins/${adminId}/status`),
  deleteAdmin: (subscriberId, adminId) =>
    api.delete(`/supreme-admin/subscribers/${subscriberId}/admins/${adminId}`),
  getPlans: () => api.get("/supreme-admin/plans"),
  createPlan: (data) => api.post("/supreme-admin/plans", data),
  updatePlan: (id, data) => api.put(`/supreme-admin/plans/${id}`, data),
  deletePlan: (id) => api.delete(`/supreme-admin/plans/${id}`),
  togglePlanStatus: (id) => api.patch(`/supreme-admin/plans/${id}/status`),
  getSubscriptions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/supreme-admin/subscriptions${qs ? `?${qs}` : ""}`);
  },
  updateSubscriptionStatus: (id, data) =>
    api.patch(`/supreme-admin/subscriptions/${id}/status`, data),
  getSeatUsage: () => api.get("/supreme-admin/seat-usage"),
  getSettings: () => api.get("/supreme-admin/settings"),
  updateSettings: (data) => api.put("/supreme-admin/settings", data),
};

// ==================== USER APIs ====================
export const userApi = {
  getProfile: () => api.get("/user/profile"),
  updateProfile: (data) => api.put("/user/profile", data),
  changePassword: (data) => api.put("/user/password", data),
  getWishlist: () => api.get("/user/wishlist"),
  toggleSaveProject: (id) => api.post(`/user/wishlist/projects/${id}`),
  toggleSavePlot: (id) => api.post(`/user/wishlist/plots/${id}`),
};

// ==================== NOTIFICATION APIs ====================
export const notificationApi = {
  getNotifications: () => api.get("/notifications"),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch("/notifications/read-all"),
  clearAll: () => api.delete("/notifications"),
};

export default api;
