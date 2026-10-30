/**
 * DreamCity API Client
 * Provides centralized fetch wrappers with Bearer token authentication and error handling.
 */

import { appendQueryParams } from "./queryString.js";

// `import.meta.env` is provided by Vite at build time; the fallback keeps this
// module importable in plain Node (unit tests) without a bundler.
const env = import.meta.env || {};

export const BASE_URL = env.VITE_API_URL || "http://localhost:5000/api";

const getToken = () =>
  typeof localStorage === "undefined" ? null : localStorage.getItem("dreamcity_token");

export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem("dreamcity_token", token);
  } else {
    localStorage.removeItem("dreamcity_token");
  }
};

export const getAuthToken = () => getToken();

async function request(endpoint, options = {}) {
  const { params, ...fetchOptions } = options;

  const baseUrl = `${BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const url = appendQueryParams(baseUrl, params);
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...fetchOptions.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const config = {
    ...fetchOptions,
    credentials: "include",
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
  logout: () => api.post("/auth/logout"),
  getMe: () => api.get("/auth/me"),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  verifyOtp: (email, otp) => api.post("/auth/verify-otp", { email, otp }),
  resetPassword: (email, otp, newPassword) =>
    api.post("/auth/reset-password", { email, otp, newPassword }),
  // Super Admin (retailer) signup request flow — public
  getRetailerPlans: () => api.get("/auth/retailer/plans"),
  submitRetailerRequest: (payload) => api.post("/auth/retailer/request", payload),

  // ─── Single Active Device Authentication Endpoints ──────────────────────────
  verifyDeviceOtp: (data) => api.post("/auth/device/verify-otp", data),
  enrollFirstDevice: (data) => api.post("/auth/device/enroll-first-device", data),
  resendEnrollmentOtp: (data) => api.post("/auth/device/resend-enrollment-otp", data),
  getDeviceRequestStatus: (pollingToken) =>
    api.get("/auth/device/request-status", { headers: { Authorization: `Bearer ${pollingToken}` } }),
  claimApprovedSession: (pollingToken) =>
    api.post("/auth/device/claim-approved-session", {}, { headers: { Authorization: `Bearer ${pollingToken}` } }),
};


// ==================== PUBLIC APIs ====================
export const publicApi = {
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
  updateEnquiryStatus: (id, status, notes) => api.patch(`/admin/enquiries/${id}/status`, { status, notes }),
  logEnquiryActivity: (id, data) => api.post(`/admin/enquiries/${id}/activity`, data),
  getSiteVisits: () => api.get("/admin/site-visits"),
  updateSiteVisitStatus: (id, status) => api.patch(`/admin/site-visits/${id}/status`, { status }),
  getProfile: () => api.get("/admin/profile"),
  updateProfile: (data) => api.put("/admin/profile", data),
  changePassword: (data) => api.put("/admin/profile/password", data),
  uploadProjectImage: (data, projectId) => {
    const url = projectId && projectId !== "new"
      ? `/admin/projects/${projectId}/upload-image`
      : `/admin/projects/upload-image`;
    return api.post(url, data);
  },
  uploadLayoutImage: (projectId, data) => {
    const url = projectId && projectId !== "new"
      ? `/admin/projects/${projectId}/layout-image`
      : `/admin/projects/layout-image`;
    return api.post(url, data);
  },
  getProjectLayout: (projectId) => api.get(`/admin/projects/${projectId}/layout`),
  saveProjectLayout: (projectId, layoutData) => api.put(`/admin/projects/${projectId}/layout`, { layout: layoutData }),
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
  getBranches: () => api.get("/super-admin/branches"),
  createBranch: (data) => api.post("/super-admin/branches", data),
  getBranchDetail: (id) => api.get(`/super-admin/branches/${id}`),
  updateBranch: (id, data) => api.put(`/super-admin/branches/${id}`, data),
  toggleBranchStatus: (id, status) => api.patch(`/super-admin/branches/${id}/status`, status ? { status } : {}),
  deleteBranch: (id) => api.delete(`/super-admin/branches/${id}`),
  getAllEnquiries: (params) => api.get("/super-admin/enquiries", { params }),
  updateEnquiryStatus: (id, status, notes) => api.patch(`/super-admin/enquiries/${id}/status`, { status, notes }),
  getAllSiteVisits: () => api.get("/super-admin/site-visits"),
  updateSiteVisitStatus: (id, status, notes) => api.patch(`/super-admin/site-visits/${id}/status`, { status, notes }),
  getAllPlots: () => api.get("/super-admin/plots"),
  getProjectPlots: (id) => api.get(`/super-admin/projects/${id}/plots`),
  getSubscriptionInfo: () => api.get("/super-admin/subscription-info"),
  getProfile: () => api.get("/super-admin/profile"),
  updateProfile: (data) => api.put("/super-admin/profile", data),
  changePassword: (data) => api.put("/super-admin/profile/password", data),
  uploadProjectImage: (data, projectId) => {
    const url = projectId && projectId !== "new"
      ? `/super-admin/projects/${projectId}/upload-image`
      : `/super-admin/projects/upload-image`;
    return api.post(url, data);
  },
  uploadLayoutImage: (projectId, data) => api.post(`/super-admin/projects/${projectId}/layout-image`, data),
  getProjectLayout: (projectId) => api.get(`/super-admin/projects/${projectId}/layout`),
  saveProjectLayout: (projectId, layoutData) => api.put(`/super-admin/projects/${projectId}/layout`, { layout: layoutData }),
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
  deleteSubscriber: (id) => api.delete(`/supreme-admin/subscribers/${id}`),
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

  // Published Projects Overview (read-only)
  getPublishedProjectsSummary: () =>
    api.get("/supreme-admin/published-projects/summary"),
  getPublishedProjectsBySuperAdmin: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(
      `/supreme-admin/published-projects/super-admins${qs ? `?${qs}` : ""}`
    );
  },
  getPublishedProjectsByTenantAdmins: (subscriberId) =>
    api.get(
      `/supreme-admin/published-projects/super-admins/${subscriberId}`
    ),
  getPublishedProjectsByBranchAdmin: (subscriberId, adminId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(
      `/supreme-admin/published-projects/super-admins/${subscriberId}/admins/${adminId}/projects${qs ? `?${qs}` : ""}`
    );
  },

  // Retailer (Super Admin) account creation requests
  getRetailerRequests: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/supreme-admin/retailer-requests${qs ? `?${qs}` : ""}`);
  },
  getRetailerRequestById: (id) => api.get(`/supreme-admin/retailer-requests/${id}`),
  setPaymentVerification: (id, data) =>
    api.patch(`/supreme-admin/retailer-requests/${id}/payment-verification`, data),
  approveRetailerRequest: (id, data = {}) =>
    api.patch(`/supreme-admin/retailer-requests/${id}/approve`, data),
  rejectRetailerRequest: (id, data) =>
    api.patch(`/supreme-admin/retailer-requests/${id}/reject`, data),
  deleteRetailerRequest: (id) =>
    api.delete(`/supreme-admin/retailer-requests/${id}`),
  requestAdditionalInfo: (id, data) =>
    api.patch(`/supreme-admin/retailer-requests/${id}/request-info`, data),
  getBusinessDocUrl: (id, docType) =>
    `${BASE_URL}/supreme-admin/retailer-requests/${id}/documents/${docType}`,

  // ─── Trusted Device Oversight & Management ──────────────────────────────────
  getPendingDevices: () => api.get("/supreme-admin/devices/pending"),
  getActiveDevices: () => api.get("/supreme-admin/devices/active"),
  approveDeviceRequest: (requestId, data = {}) =>
    api.post(`/supreme-admin/devices/requests/${requestId}/approve`, data),
  rejectDeviceRequest: (requestId, data = {}) =>
    api.post(`/supreme-admin/devices/requests/${requestId}/reject`, data),
  revokeDevice: (deviceId, data = {}) =>
    api.post(`/supreme-admin/devices/${deviceId}/revoke`, data),
  emergencyResetDevice: (data) =>
    api.post("/supreme-admin/devices/emergency-reset", data),
};

// ==================== USER APIs ====================
export const userApi = {
  getProfile: () => api.get("/user/profile"),
  updateProfile: (data) => api.put("/user/profile", data),
  changePassword: (data) => api.put("/user/password", data),
  getWishlist: () => api.get("/user/wishlist"),
  toggleSaveProject: (id) => api.post(`/user/wishlist/projects/${id}`),
  toggleSavePlot: (id) => api.post(`/user/wishlist/plots/${id}`),
  getMyEnquiries: () => api.get("/user/enquiries"),
  getMySiteVisits: () => api.get("/user/site-visits"),
};

// ==================== NOTIFICATION APIs ====================
export const notificationApi = {
  getNotifications: () => api.get("/notifications"),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch("/notifications/read-all"),
  clearAll: () => api.delete("/notifications"),
};

export default api;
