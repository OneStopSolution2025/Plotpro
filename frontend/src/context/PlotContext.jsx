import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useLocation } from "react-router-dom";

import { plots as initialPlots } from "../data/plots";
import { publicApi, adminApi, superAdminApi } from "../services/api";
import { useAuth } from "./AuthContext";
import { useProjects } from "./ProjectContext";

const PlotContext = createContext();

export const VALID_PLOT_STATUSES = ["Available", "Reserved", "Sold"];

export const normalizePlot = (plot) => {
  if (!plot) return null;
  const id = plot.customId || plot.id || plot._id;
  const projectId = plot.projectCustomId != null ? (Number(plot.projectCustomId) || plot.projectCustomId) : (plot.projectId?._id || plot.projectId);

  return {
    ...plot,
    id: String(id),
    customId: plot.customId || String(id),
    _id: plot._id,
    projectId,
    projectCustomId: plot.projectCustomId != null ? (Number(plot.projectCustomId) || plot.projectCustomId) : projectId,
    projectMongoId: plot.projectId?._id ? String(plot.projectId._id) : (plot.projectId ? String(plot.projectId) : ""),
    plotNumber: String(plot.plotNumber || ""),
    status: plot.status || "Available",
    size: plot.size || "1,200 sq.ft",
    facing: plot.facing || "North",
    price: plot.price || "₹12 Lakh",
    image: plot.image || "",
    images: Array.isArray(plot.images) ? plot.images : [],
  };
};

const findPlotById = (plots, id) => {
  const searchId = String(id);
  return plots.find((plot) => String(plot.id) === searchId || String(plot.customId) === searchId || String(plot._id) === searchId);
};

const getNextPlotIndex = (plots, projectId) => {
  const projectPlots = plots.filter((p) => String(p.projectId) === String(projectId));
  if (projectPlots.length === 0) return 1;

  const maxIndex = projectPlots.reduce((max, plot) => {
    let plotIndex = 0;

    if (typeof plot.id === "string" && plot.id.includes("-")) {
      const parts = plot.id.split("-");
      if (parts[0] === String(projectId)) {
        plotIndex = Number(parts[1]);
      }
    } else if (typeof plot.plotNumber === "string" && !isNaN(Number(plot.plotNumber))) {
      plotIndex = Number(plot.plotNumber);
    }

    return plotIndex > max ? plotIndex : max;
  }, 0);

  return maxIndex + 1;
};

const validatePlot = (plot, allPlots = [], allProjects = [], excludeId = null) => {
  const errors = [];

  const existingPlot = allPlots.find(
    (p) => String(p.id) === String(plot.id) && (excludeId === null || String(p.id) !== String(excludeId))
  );
  if (existingPlot) {
    errors.push(`Plot ID "${plot.id}" already exists`);
  }

  const projectExists = allProjects.some((p) => String(p.id) === String(plot.projectId));
  if (!projectExists) {
    errors.push(`Project ID "${plot.projectId}" does not exist`);
  }

  if (!plot.plotNumber || !plot.plotNumber.toString().trim()) {
    errors.push("Plot number is required");
  }

  const duplicateInProject = allPlots.find(
    (p) =>
      String(p.projectId) === String(plot.projectId) &&
      String(p.plotNumber) === String(plot.plotNumber) &&
      (excludeId === null || String(p.id) !== String(excludeId))
  );
  if (duplicateInProject) {
    errors.push(`Plot number "${plot.plotNumber}" already exists in project ${plot.projectId}`);
  }

  if (!VALID_PLOT_STATUSES.includes(plot.status)) {
    errors.push(`Invalid status. Must be one of: ${VALID_PLOT_STATUSES.join(", ")}`);
  }

  if (!plot.size || !plot.size.trim()) {
    errors.push("Plot size is required");
  }

  if (!plot.facing || !plot.facing.trim()) {
    errors.push("Plot facing is required");
  }

  if (!plot.price || !plot.price.trim()) {
    errors.push("Plot price is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const STORAGE_KEY = "dreamcity-plots-v2";

export const PlotProvider = ({ children }) => {
  const { role, isAuthenticated, isLoading: authLoading } = useAuth();
  const { projects } = useProjects();
  const [plots, setPlots] = useState([]);
  const location = useLocation();

  const pathname = location.pathname || "";
  const isSuperAdminRoute = pathname.startsWith("/super-admin");
  const isAdminRoute = !isSuperAdminRoute && pathname.startsWith("/admin");
  const isPublicRoute = !isSuperAdminRoute && !isAdminRoute;

  // Load plots dynamically when inside admin dashboard routes
  useEffect(() => {
    if (authLoading) return;

    // Do NOT run admin-restricted bulk plot loader on public client routes
    if (isPublicRoute) return;

    if (!isAuthenticated) {
      setPlots([]);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    let isMounted = true;

    const loadPlots = async () => {
      try {
        // ================================
        // SUPER ADMIN → ALL PLOTS
        // ================================
        if (role === "SUPER_ADMIN" && isSuperAdminRoute) {
          const res = await superAdminApi.getAllPlots();

          if (res?.success && Array.isArray(res.data) && isMounted) {
            setPlots(res.data.map(normalizePlot));
          } else if (isMounted) {
            setPlots([]);
          }

          return;
        }

        // ================================
        // NORMAL ADMIN → OWN PROJECT PLOTS
        // ================================
        if (role === "ADMIN" && isAdminRoute) {
          if (!Array.isArray(projects) || projects.length === 0) {
            if (isMounted) setPlots([]);
            return;
          }

          const projectPlotResults = await Promise.all(
            projects.map(async (project) => {
              try {
                const projectId =
                  project.customId || project.id || project._id;

                const res = await adminApi.getProjectPlots(projectId);

                if (res?.success && Array.isArray(res.data)) {
                  return res.data.map(normalizePlot);
                }

                return [];
              } catch (err) {
                console.warn(
                  `[PlotContext] Failed to load plots for project ${project.id}:`,
                  err.message
                );

                return [];
              }
            })
          );

          if (isMounted) {
            const allAdminPlots = projectPlotResults.flat();
            setPlots(allAdminPlots);
          }
        }
      } catch (err) {
        console.warn(
          "[PlotContext] Failed to load dashboard plots:",
          err.message
        );

        if (isMounted) {
          setPlots([]);
        }
      }
    };

    loadPlots();

    // Auto-sync every 8 seconds for real-time plot status updates inside admin routes
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadPlots();
      }
    }, 8000);

    const handleFocus = () => loadPlots();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [
    role,
    isAuthenticated,
    authLoading,
    projects,
    isAdminRoute,
    isSuperAdminRoute,
    isPublicRoute,
  ]);

  const fetchPlotsForProject = useCallback(async (projectId) => {
    if (!projectId) return [];
    try {
      let res;
      // On admin dashboard routes, try adminApi first
      if (isAdminRoute && role === "ADMIN") {
        try {
          res = await adminApi.getProjectPlots(projectId);
        } catch (adminErr) {
          // If the admin doesn't own this project or 403 occurs, fall back to publicApi
          console.warn(`[PlotContext] Admin API failed for project ${projectId}, falling back to publicApi:`, adminErr.message);
          res = await publicApi.getProjectPlots(projectId);
        }
      } else if (isSuperAdminRoute && role === "SUPER_ADMIN") {
        try {
          res = await adminApi.getProjectPlots(projectId);
        } catch {
          res = await publicApi.getProjectPlots(projectId);
        }
      } else {
        // ALWAYS use public API on public client-facing routes
        res = await publicApi.getProjectPlots(projectId);
      }

      if (res?.success && Array.isArray(res.data)) {
        const normalized = res.data.map(normalizePlot);
        setPlots((prev) => {
          const target = String(projectId);
          const otherPlots = prev.filter((p) => {
            const pId = String(p.projectId);
            const pCustId = String(p.projectCustomId || "");
            const pMongoId = String(p.projectMongoId || "");
            return pId !== target && pCustId !== target && pMongoId !== target;
          });
          return [...otherPlots, ...normalized];
        });
        return normalized;
      }
      return [];
    } catch (err) {
      console.warn(`[PlotContext] Failed to fetch plots for project ${projectId}:`, err.message);
      return [];
    }
  }, [role, isAdminRoute, isSuperAdminRoute]);

  const createPlot = useCallback(async (projectId, plotData) => {
    try {
      const res = await adminApi.createPlot(projectId, plotData);
      if (res?.success && res.data) {
        const normalized = normalizePlot(res.data);
        setPlots((prev) => [...prev, normalized]);
        return { success: true, plot: normalized };
      }
      throw new Error(res?.message || "Failed to create plot");
    } catch (err) {
      console.error("[PlotContext] createPlot error:", err);
      throw err;
    }
  }, []);

  const updatePlot = useCallback(async (plotId, plotData) => {
    try {
      const res = await adminApi.updatePlot(plotId, plotData);
      if (res?.success && res.data) {
        const normalized = normalizePlot(res.data);
        setPlots((prev) =>
          prev.map((p) => (String(p.id) === String(plotId) || String(p._id) === String(plotId) ? normalized : p))
        );
        return { success: true, plot: normalized };
      }
      throw new Error(res?.message || "Failed to update plot");
    } catch (err) {
      console.error("[PlotContext] updatePlot error:", err);
      throw err;
    }
  }, []);

  const deletePlot = useCallback(async (plotId) => {
    try {
      await adminApi.deletePlot(plotId);
      setPlots((prev) => prev.filter((p) => String(p.id) !== String(plotId) && String(p._id) !== String(plotId)));
      return { success: true };
    } catch (err) {
      console.error("[PlotContext] deletePlot error:", err);
      throw err;
    }
  }, []);

  const getNextIndex = useCallback((projectId) => getNextPlotIndex(plots, projectId), [plots]);
  const findById = useCallback((id) => findPlotById(plots, id), [plots]);
  const validate = useCallback((plot, allProjects, excludeId) =>
    validatePlot(plot, plots, allProjects, excludeId), [plots]);

  return (
    <PlotContext.Provider
      value={{
        plots,
        setPlots,
        fetchPlotsForProject,
        createPlot,
        updatePlot,
        deletePlot,
        getNextPlotIndex: getNextIndex,
        findPlotById: findById,
        validatePlot: validate,
        VALID_PLOT_STATUSES,
      }}
    >
      {children}
    </PlotContext.Provider>
  );
};

export const usePlots = () => {
  return useContext(PlotContext);
};