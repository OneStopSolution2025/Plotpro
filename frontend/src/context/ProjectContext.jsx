import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useLocation } from "react-router-dom";

import { publicApi, adminApi, superAdminApi } from "../services/api";
import { useAuth } from "./AuthContext";

const ProjectContext = createContext();

export const VALID_STATUSES = ["Active", "Completed", "Upcoming"];
export const VALID_PLOT_TYPES = ["Residential", "Commercial", "Agriculture", "Villa Plot"];

/**
 * Parse plotPrice string to numeric lakhs value.
 * Handles formats: "8.5 Lakh", "12 Lakh", "₹12.5 Lakh", "₹ 12,50,000"
 */
export const parsePriceLakhs = (plotPrice) => {
  if (!plotPrice || typeof plotPrice !== "string") return 0;

  const cleaned = plotPrice.replace(/[₹,]/g, "").trim();

  // Match "X.X Cr" or "X Crore" (case insensitive) -> 1 Cr = 100 Lakhs
  const crMatch = cleaned.match(/([\d.]+)\s*(?:cr|crore|crores)\b/i);
  if (crMatch) {
    const val = parseFloat(crMatch[1]);
    return isNaN(val) ? 0 : val * 100;
  }

  // Match "X.X Lakh", "X Lakhs", "X L", "X Lac", "X Lacs" (case insensitive)
  const lakhMatch = cleaned.match(/([\d.]+)\s*(?:lakh|lakhs|lac|lacs|l)\b/i);
  if (lakhMatch) {
    const val = parseFloat(lakhMatch[1]);
    return isNaN(val) ? 0 : val;
  }

  // Match plain number (entered in lakhs in PlotPro admin fields, e.g. 8.5, 12, 1000)
  // Only convert if explicitly full INR denomination >= 10,000,000 (1 Cr) or 100,000 (1 Lakh)
  const numMatch = cleaned.match(/^([\d.]+)$/);
  if (numMatch) {
    const num = parseFloat(numMatch[1]);
    if (isNaN(num)) return 0;
    if (num >= 100000) {
      return num / 100000;
    }
    return num;
  }

  return 0;
};

/**
 * Validate plotPrice string format.
 */
export const isValidPlotPrice = (plotPrice) => {
  if (!plotPrice || typeof plotPrice !== "string") return false;
  const cleaned = plotPrice.replace(/[₹,]/g, "").trim();
  return /^[\d.]+\s*[Ll]akh$/.test(cleaned);
};

const getNextProjectId = (projects) => {
  const maxId = projects.reduce((max, project) => {
    const id = Number(project.id);
    return id > max ? id : max;
  }, 0);
  return maxId + 1;
};

const validateProject = (project) => {
  const errors = [];

  if (!project.title || !project.title.trim()) {
    errors.push("Project title is required");
  }

  if (!project.location || !project.location.trim()) {
    errors.push("Location is required");
  }

  if (!project.image && (!project.images || !project.images.length || !project.images[0])) {
    errors.push("Project Cover / Master Layout Image is required");
  }

  if (!project.details || !project.details.trim()) {
    errors.push("Project Hero Description is required");
  }

  if (!project.about || !project.about.description || !project.about.description.trim()) {
    errors.push("About The Project Section (Main Description) is required");
  }

  if (!VALID_STATUSES.includes(project.status)) {
    errors.push(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  if (!VALID_PLOT_TYPES.includes(project.plotType)) {
    errors.push(`Invalid plot type. Must be one of: ${VALID_PLOT_TYPES.join(", ")}`);
  }

  const totalPlots = Number(project.totalPlots);
  const availablePlots = Number(project.availablePlots);
  const reservedPlots = Number(project.reservedPlots);
  const soldPlots = Number(project.soldPlots);

  if (!Number.isInteger(totalPlots) || totalPlots <= 0) {
    errors.push("Total plots must be a positive integer");
  }

  if (!Number.isInteger(availablePlots) || availablePlots < 0) {
    errors.push("Available plots must be a non-negative integer");
  }

  if (!Number.isInteger(reservedPlots) || reservedPlots < 0) {
    errors.push("Reserved plots must be a non-negative integer");
  }

  if (!Number.isInteger(soldPlots) || soldPlots < 0) {
    errors.push("Sold plots must be a non-negative integer");
  }

  if (availablePlots + reservedPlots + soldPlots !== totalPlots) {
    errors.push("Available + Reserved + Sold must equal Total Plots");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Create a clean URL-friendly slug from project title/name.
 */
export const slugifyProject = (project) => {
  if (!project) return "";
  const title = (typeof project === "string" ? project : (project.title || project.name || "")).trim();
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || String(project.customId || project.id || project._id || "");
};

/**
 * Generate a unique route slug for project navigation.
 */
export const getProjectRouteSlug = (project, allProjects = []) => {
  if (!project) return "";
  const baseSlug = slugifyProject(project);
  if (!Array.isArray(allProjects) || allProjects.length <= 1) return baseSlug;
  const duplicates = allProjects.filter((p) => slugifyProject(p) === baseSlug);
  if (duplicates.length > 1 && project.customId) {
    return `${baseSlug}-${project.customId}`;
  }
  return baseSlug;
};

/**
 * Find project by slug, title, customId, or MongoDB _id.
 */
export const findProjectByIdentifier = (projects, identifier) => {
  if (!projects || !identifier) return null;
  const cleanId = String(identifier).trim();
  const lowerId = cleanId.toLowerCase();

  // 1. Direct match by getProjectRouteSlug
  let found = projects.find((p) => getProjectRouteSlug(p, projects) === lowerId);
  if (found) return found;

  // 2. Match by base slug
  found = projects.find((p) => slugifyProject(p) === lowerId);
  if (found) return found;

  // 3. Match by case-insensitive title
  found = projects.find((p) => String(p.title || "").toLowerCase().trim() === decodeURIComponent(cleanId).toLowerCase());
  if (found) return found;

  // 4. Match by slug-customId suffix (e.g. "green-valley-19")
  found = projects.find((p) => {
    const cid = String(p.customId || p.id || "");
    return cid && lowerId.endsWith(`-${cid.toLowerCase()}`);
  });
  if (found) return found;

  // 5. Match by customId, id, or _id
  found = projects.find((p) => String(p.customId) === cleanId || String(p.id) === cleanId || String(p._id) === cleanId);
  if (found) return found;

  return null;
};

/**
 * Normalize backend/localStorage project documents to canonical frontend schema
 */
export const normalizeProject = (p) => {
  if (!p) return null;
  const id = p.customId ? (Number(p.customId) || p.customId) : (p.id || p._id);
  const slug = slugifyProject(p);
  const totalPlots = Number(p.totalPlots) || 0;
  const availablePlots = Number(p.availablePlots) || 0;
  const reservedPlots = Number(p.reservedPlots) || 0;
  const soldPlots = Number(p.soldPlots) || 0;

  return {
    ...p,
    id,
    customId: p.customId || String(id),
    _id: p._id,
    slug,
    title: p.title || "",
    location: p.location || "",
    status: p.status || "Active",
    plotPrice: p.plotPrice || "₹12 Lakh",
    priceLakhs: typeof p.priceLakhs === "number" && p.priceLakhs > 0 ? p.priceLakhs : parsePriceLakhs(p.plotPrice),
    plotType: p.plotType || "Residential",
    totalPlots,
    availablePlots,
    reservedPlots,
    soldPlots,
    launchDate: p.launchDate || "",
    details: p.details || p.description || "",
    description: p.description || p.details || "",
    features: Array.isArray(p.features) ? p.features : [],
    images: (Array.isArray(p.pendingUpdates?.images) && p.pendingUpdates.images.length > 0)
      ? p.pendingUpdates.images
      : (Array.isArray(p.images) && p.images.length > 0
          ? p.images
          : (p.pendingUpdates?.image ? [p.pendingUpdates.image] : (p.image ? [p.image] : []))),
    image: p.pendingUpdates?.image || (Array.isArray(p.pendingUpdates?.images) && p.pendingUpdates.images[0]) || p.image || (Array.isArray(p.images) && p.images[0]) || "",
    defaultPlotImage: p.defaultPlotImage || "",
    adminId: p.adminId?._id ? String(p.adminId._id) : (p.adminId ? String(p.adminId) : null),
    assignedAdmin: p.adminId && typeof p.adminId === "object" ? p.adminId : null,
    approvalStatus: p.approvalStatus || "APPROVED",
    hasPendingUpdates: !!p.hasPendingUpdates,
    pendingUpdates: p.pendingUpdates || null,
    layout: p.layout || p.pendingUpdates?.layout || null,
    rejectionReason: p.rejectionReason || "",
    isArchived: !!p.isArchived,
  };
};

export const ProjectProvider = ({ children }) => {
  const { user, role, isAuthenticated, isLoading: authLoading } = useAuth();
  const location = useLocation();

  // Scoped datasets to prevent permission/dataset leakage
  const [publicProjects, setPublicProjects] = useState([]);
  const [adminProjects, setAdminProjects] = useState([]);
  const [superAdminProjects, setSuperAdminProjects] = useState([]);

  const [isLoadingPublic, setIsLoadingPublic] = useState(true);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(true);
  const [isLoadingSuperAdmin, setIsLoadingSuperAdmin] = useState(true);

  // Determine current active route scope
  const pathname = location.pathname || "";
  const isSuperAdminRoute = pathname.startsWith("/super-admin");
  const isAdminRoute = !isSuperAdminRoute && pathname.startsWith("/admin");
  const isPublicRoute = !isSuperAdminRoute && !isAdminRoute;

  // Clear stale cached project data in localStorage if any exists
  useEffect(() => {
    try {
      localStorage.removeItem("dreamcity-projects");
    } catch {}
  }, []);

  // Fetch Public Projects (strictly from GET /api/public/projects)
  const fetchPublicProjects = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoadingPublic(true);
    try {
      const res = await publicApi.getProjects();
      if (res?.success && Array.isArray(res.data)) {
        const normalized = res.data.map(normalizeProject);
        if (isSilent) {
          setPublicProjects((prev) => {
            if (prev.length === normalized.length) {
              const isUnchanged = prev.every((p, idx) => {
                const n = normalized[idx];
                return (
                  String(p.id) === String(n.id) &&
                  String(p.customId) === String(n.customId) &&
                  p.title === n.title &&
                  p.price === n.price &&
                  p.status === n.status &&
                  p.totalPlots === n.totalPlots &&
                  p.availablePlots === n.availablePlots &&
                  p.reservedPlots === n.reservedPlots &&
                  p.soldPlots === n.soldPlots &&
                  p.approvalStatus === n.approvalStatus &&
                  p.layout?.version === n.layout?.version &&
                  p.layout?.imageUrl === n.layout?.imageUrl &&
                  (p.layout?.regions?.length || 0) === (n.layout?.regions?.length || 0)
                );
              });
              if (isUnchanged) return prev;
            }
            return normalized;
          });
        } else {
          setPublicProjects(normalized);
        }
        return normalized;
      }
      if (!isSilent) setPublicProjects([]);
      return [];
    } catch (err) {
      console.warn("[ProjectContext] Public API fetch failed:", err.message);
      if (!isSilent) setPublicProjects([]);
      return [];
    } finally {
      if (!isSilent) setIsLoadingPublic(false);
    }
  }, []);

  // Fetch Admin Projects (strictly from GET /api/admin/projects)
  const fetchAdminProjects = useCallback(async (isSilent = false) => {
    if (!isAuthenticated || role !== "ADMIN") {
      setAdminProjects([]);
      return [];
    }
    if (!isSilent) setIsLoadingAdmin(true);
    try {
      const res = await adminApi.getProjects();
      if (res?.success && Array.isArray(res.data)) {
        const normalized = res.data.map(normalizeProject);
        setAdminProjects(normalized);
        return normalized;
      }
      if (!isSilent) setAdminProjects([]);
      return [];
    } catch (err) {
      console.warn("[ProjectContext] Admin API fetch failed:", err.message);
      if (!isSilent) setAdminProjects([]);
      return [];
    } finally {
      if (!isSilent) setIsLoadingAdmin(false);
    }
  }, [isAuthenticated, role]);

  // Fetch Super Admin Projects (strictly from GET /api/super-admin/projects)
  const fetchSuperAdminProjects = useCallback(async (isSilent = false) => {
    if (!isAuthenticated || role !== "SUPER_ADMIN") {
      setSuperAdminProjects([]);
      return [];
    }
    if (!isSilent) setIsLoadingSuperAdmin(true);
    try {
      const res = await superAdminApi.getAllProjects();
      if (res?.success && Array.isArray(res.data)) {
        const normalized = res.data.map(normalizeProject);
        setSuperAdminProjects(normalized);
        return normalized;
      }
      if (!isSilent) setSuperAdminProjects([]);
      return [];
    } catch (err) {
      console.warn("[ProjectContext] Super Admin API fetch failed:", err.message);
      if (!isSilent) setSuperAdminProjects([]);
      return [];
    } finally {
      if (!isSilent) setIsLoadingSuperAdmin(false);
    }
  }, [isAuthenticated, role]);

  // Always load public projects for public pages on mount or when on public routes + Smart Auto-Sync
  useEffect(() => {
    if (isPublicRoute) {
      fetchPublicProjects(false);

      const interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchPublicProjects(true);
        }
      }, 7000);

      const handleFocus = () => fetchPublicProjects(true);
      window.addEventListener("focus", handleFocus);
      document.addEventListener("visibilitychange", handleFocus);

      return () => {
        clearInterval(interval);
        window.removeEventListener("focus", handleFocus);
        document.removeEventListener("visibilitychange", handleFocus);
      };
    }
  }, [isPublicRoute, fetchPublicProjects]);

  // Load Admin projects on /admin/* routes when authenticated as ADMIN + Smart Auto-Sync
  useEffect(() => {
    if (isAdminRoute && isAuthenticated && role === "ADMIN" && !authLoading) {
      fetchAdminProjects(false);

      const interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchAdminProjects(true);
        }
      }, 7000);

      const handleFocus = () => fetchAdminProjects(true);
      window.addEventListener("focus", handleFocus);
      document.addEventListener("visibilitychange", handleFocus);

      return () => {
        clearInterval(interval);
        window.removeEventListener("focus", handleFocus);
        document.removeEventListener("visibilitychange", handleFocus);
      };
    } else if (!isAdminRoute && !isAuthenticated) {
      setAdminProjects([]);
    }
  }, [isAdminRoute, isAuthenticated, role, authLoading, fetchAdminProjects]);

  // Load Super Admin projects on /super-admin/* routes when authenticated as SUPER_ADMIN + Smart Auto-Sync
  useEffect(() => {
    if (isSuperAdminRoute && isAuthenticated && role === "SUPER_ADMIN" && !authLoading) {
      fetchSuperAdminProjects(false);

      const interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchSuperAdminProjects(true);
        }
      }, 7000);

      const handleFocus = () => fetchSuperAdminProjects(true);
      window.addEventListener("focus", handleFocus);
      document.addEventListener("visibilitychange", handleFocus);

      return () => {
        clearInterval(interval);
        window.removeEventListener("focus", handleFocus);
        document.removeEventListener("visibilitychange", handleFocus);
      };
    } else if (!isSuperAdminRoute && !isAuthenticated) {
      setSuperAdminProjects([]);
    }
  }, [isSuperAdminRoute, isAuthenticated, role, authLoading, fetchSuperAdminProjects]);

  // Clear admin/super admin in-memory data on user or role change
  useEffect(() => {
    if (!isAuthenticated) {
      setAdminProjects([]);
      setSuperAdminProjects([]);
    }
  }, [isAuthenticated, user?._id, role]);

  // Active projection based on current route context
  const projects = useMemo(() => {
    if (isSuperAdminRoute) {
      return superAdminProjects;
    }
    if (isAdminRoute) {
      return adminProjects;
    }
    return publicProjects;
  }, [isSuperAdminRoute, isAdminRoute, superAdminProjects, adminProjects, publicProjects]);

  const isLoading = useMemo(() => {
    if (authLoading) return true;
    if (isSuperAdminRoute) return isLoadingSuperAdmin;
    if (isAdminRoute) return isLoadingAdmin;
    return isLoadingPublic;
  }, [authLoading, isSuperAdminRoute, isAdminRoute, isLoadingSuperAdmin, isLoadingAdmin, isLoadingPublic]);

  // Scoped setter to support legacy setProjects callers within their current scope
  const setProjects = useCallback((action) => {
    if (isSuperAdminRoute) {
      setSuperAdminProjects(action);
    } else if (isAdminRoute) {
      setAdminProjects(action);
    } else {
      setPublicProjects(action);
    }
  }, [isSuperAdminRoute, isAdminRoute]);

  // Refresh active route dataset
  const refreshProjects = useCallback(async () => {
    if (isSuperAdminRoute) {
      return fetchSuperAdminProjects();
    }
    if (isAdminRoute) {
      return fetchAdminProjects();
    }
    return fetchPublicProjects();
  }, [isSuperAdminRoute, isAdminRoute, fetchSuperAdminProjects, fetchAdminProjects, fetchPublicProjects]);

  const getNextId = useCallback(() => getNextProjectId(projects), [projects]);
  const validate = useCallback((project) => validateProject(project), []);

  /**
   * Assigns a project to an administrator by adminId.
   */
  const assignProject = useCallback(async (projectId, adminId) => {
    try {
      await superAdminApi.assignProject(projectId, adminId);
    } catch (e) {
      console.warn("[ProjectContext] API assign project failed, applying locally:", e.message);
    }

    setSuperAdminProjects((prev) =>
      prev.map((project) => {
        if (String(project.id) === String(projectId) || String(project._id) === String(projectId)) {
          return {
            ...project,
            adminId: adminId ? String(adminId) : null,
          };
        }
        return project;
      })
    );
    return { success: true };
  }, []);

  const unassignProject = useCallback((projectId) => {
    return assignProject(projectId, null);
  }, [assignProject]);

  const createProject = useCallback(async (projectData) => {
    try {
      const res = await adminApi.createProject(projectData);
      if (res?.success && res.data) {
        const normalized = normalizeProject(res.data);
        // Only add to adminProjects scope, NEVER to publicProjects
        setAdminProjects((prev) => [normalized, ...prev]);
        return { success: true, project: normalized };
      }
      throw new Error(res?.message || "Failed to create project");
    } catch (err) {
      console.error("[ProjectContext] createProject API error:", err);
      throw err;
    }
  }, []);

  const updateProject = useCallback(async (projectId, projectData) => {
    try {
      const res = await adminApi.updateProject(projectId, projectData);
      if (res?.success && res.data) {
        const normalized = normalizeProject(res.data);
        // Update in adminProjects
        setAdminProjects((prev) =>
          prev.map((p) =>
            String(p.id) === String(projectId) ||
            String(p._id) === String(projectId) ||
            String(p.customId) === String(projectId)
              ? normalized
              : p
          )
        );
        return { success: true, project: normalized, pendingApproval: res.pendingApproval };
      }
      throw new Error(res?.message || "Failed to update project");
    } catch (err) {
      console.error("[ProjectContext] updateProject API error:", err);
      throw err;
    }
  }, []);

  const deleteProject = useCallback(async (projectId) => {
    try {
      const res = await adminApi.deleteProject(projectId);
      if (res?.pendingApproval) {
        // If deletion is pending Super Admin approval, update project status locally in adminProjects
        setAdminProjects((prev) =>
          prev.map((p) =>
            String(p.id) === String(projectId) || String(p._id) === String(projectId)
              ? { ...p, pendingDeletion: true }
              : p
          )
        );
        return { success: true, pendingApproval: true, message: res.message };
      } else {
        // Immediately removed (PENDING or REJECTED project)
        setAdminProjects((prev) =>
          prev.filter(
            (p) => String(p.id) !== String(projectId) && String(p._id) !== String(projectId)
          )
        );
        return { success: true, pendingApproval: false, message: res?.message };
      }
    } catch (err) {
      console.error("[ProjectContext] deleteProject API error:", err);
      throw err;
    }
  }, []);

  const approveProject = useCallback(async (projectId) => {
    try {
      const res = await superAdminApi.approveProject(projectId);
      if (res?.success) {
        if (res.isDeleted) {
          // Permanently removed upon approval of deletion request
          setSuperAdminProjects((prev) =>
            prev.filter(
              (p) => String(p.id) !== String(projectId) && String(p._id) !== String(projectId)
            )
          );
          setAdminProjects((prev) =>
            prev.filter(
              (p) => String(p.id) !== String(projectId) && String(p._id) !== String(projectId)
            )
          );
          setPublicProjects((prev) =>
            prev.filter(
              (p) => String(p.id) !== String(projectId) && String(p._id) !== String(projectId)
            )
          );
          // Also refresh public projects from server
          fetchPublicProjects();
          return res;
        }

        if (res.data) {
          const normalized = normalizeProject(res.data);
          // Update in superAdminProjects
          setSuperAdminProjects((prev) =>
            prev.map((p) =>
              String(p.id) === String(projectId) || String(p._id) === String(projectId)
                ? normalized
                : p
            )
          );
          // Also refresh public projects so when visiting public routes, it is immediately updated
          fetchPublicProjects();
          return res;
        }
      }
    } catch (err) {
      console.error("[ProjectContext] approveProject error:", err);
      throw err;
    }
  }, [fetchPublicProjects]);

  const rejectProject = useCallback(async (projectId, reason) => {
    try {
      const res = await superAdminApi.rejectProject(projectId, reason);
      if (res?.success && res.data) {
        const normalized = normalizeProject(res.data);
        // Update in superAdminProjects
        setSuperAdminProjects((prev) =>
          prev.map((p) =>
            String(p.id) === String(projectId) || String(p._id) === String(projectId)
              ? normalized
              : p
          )
        );
        // Refresh public projects in case it was previously public
        fetchPublicProjects();
        return res;
      }
    } catch (err) {
      console.error("[ProjectContext] rejectProject error:", err);
      throw err;
    }
  }, [fetchPublicProjects]);

  return (
    <ProjectContext.Provider
      value={{
        projects,
        setProjects,
        isLoading,
        refreshProjects,
        createProject,
        updateProject,
        deleteProject,
        approveProject,
        rejectProject,
        assignProject,
        unassignProject,
        getNextProjectId: getNextId,
        validateProject: validate,
        parsePriceLakhs,
        isValidPlotPrice,
        VALID_STATUSES,
        VALID_PLOT_TYPES,
        publicProjects,
        adminProjects,
        superAdminProjects,
        refreshPublicProjects: fetchPublicProjects,
        refreshAdminProjects: fetchAdminProjects,
        refreshSuperAdminProjects: fetchSuperAdminProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = () => {
  return useContext(ProjectContext);
};