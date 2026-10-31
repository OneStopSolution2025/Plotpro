import { useState, useCallback, useEffect, useMemo, useRef } from "react";

import { useParams, useNavigate } from "react-router-dom";

import { useProjects, findProjectByIdentifier, getProjectRouteSlug } from "../../context/ProjectContext";
import { usePlots } from "../../context/PlotContext";
import { useAdminProfile } from "../context/AdminProfileContext";
import { useNotifications } from "../context/NotificationContext";

import {
  FaArrowLeft,
  FaMapMarkerAlt,
  FaSearch,
  FaCog,
  FaEdit,
  FaSave,
  FaTimes,
  FaPlus,
  FaTrash,
  FaExclamationTriangle,
  FaCheckCircle,
  FaPaperPlane,
  FaMapMarkedAlt,
  FaCloudUploadAlt,
  FaSpinner,
} from "react-icons/fa";

import ConfirmationModal from "../components/ConfirmationModal";
import CustomDropdown from "../components/CustomDropdown";
import { adminApi, superAdminApi } from "../../services/api";
import { resolveImageUrl } from "../../utils/imageUrl";
import "../styles/projectplots.css";
import "../styles/admin-project-form.css";

const ProjectPlots = () => {
  // useParams() is a React Router hook.
  // It reads the dynamic :id or :projectName from the current URL.
  const { id } = useParams();

  // useNavigate() lets us move to another route using JavaScript.
  const navigate = useNavigate();

  // Get project data from ProjectContext.
  const { projects, setProjects, updateProject, refreshProjects, isLoading: projectsLoading } = useProjects();

  // Get plot data and updatePlot() from PlotContext.
  const { plots, setPlots, updatePlot, createPlot, deletePlot, fetchPlotsForProject } = usePlots();

  // Admin profile & notifications
  const { profile, isSubscriptionExpired } = useAdminProfile();
  const { addNotification } = useNotifications();

  // Find the current project using the URL id (matching slug, title, id, customId, or _id).
  const project = findProjectByIdentifier(projects, id);

  const [loadingPlots, setLoadingPlots] = useState(true);
  const [plotsError, setPlotsError] = useState(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitSuccess, setResubmitSuccess] = useState(false);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);

  // Layout / Cover image modal state
  const [isUploadingLayout, setIsUploadingLayout] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [isDragOverLayout, setIsDragOverLayout] = useState(false);
  const [layoutImagePreview, setLayoutImagePreview] = useState("");
  const layoutFileInputRef = useRef(null);
  const [layoutUploadMessage, setLayoutUploadMessage] = useState(null);

  // Keep layoutImagePreview in sync with project only when modal opens or route project changes (not during active editing)
  useEffect(() => {
    if (project && showLayoutEditor) {
      setLayoutImagePreview(project.image || (project.images && project.images[0]) || project.layout?.referenceImageUrl || project.layout?.imageUrl || "");
    }
  }, [showLayoutEditor, project?.id]);

  // Search input state.
  const [search, setSearch] = useState("");

  // Current selected status filter.
  const [statusFilter, setStatusFilter] = useState("All");

  // Plot currently being edited.
  const [editingPlot, setEditingPlot] = useState(null);

  // Form state for editing a plot.
  const [editForm, setEditForm] = useState({
    size: "",
    facing: "",
    price: "",
    status: "",
    image: "",
  });

  // Add Plot modal state
  const [addingPlot, setAddingPlot] = useState(false);
  const [addForm, setAddForm] = useState({
    plotNumber: "",
    size: "",
    facing: "East",
    price: "",
    status: "Available",
    image: "",
  });
  const [addError, setAddError] = useState("");

  // Delete confirmation state
  const [deletingPlotId, setDeletingPlotId] = useState(null);
  const [plotToDelete, setPlotToDelete] = useState(null);
  const [showResubmitConfirm, setShowResubmitConfirm] = useState(false);
  const [alertModal, setAlertModal] = useState(null);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setEditingPlot(null);
        setAddingPlot(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const targetProjectId = project ? (project.customId || project.id || project._id) : null;

  const loadProjectPlots = useCallback(async () => {
    if (!targetProjectId) return;
    setLoadingPlots(true);
    setPlotsError(null);
    try {
      await fetchPlotsForProject(targetProjectId);
    } catch (err) {
      console.error("Failed to load project plots:", err);
      setPlotsError({
        status: err.status || (err.message?.includes("403") || err.message?.includes("Forbidden") ? 403 : (err.message?.includes("404") || err.message?.includes("not found") ? 404 : 500)),
        message: err.message || "Failed to load plots",
      });
    } finally {
      setLoadingPlots(false);
    }
  }, [targetProjectId, fetchPlotsForProject]);

  useEffect(() => {
    let isCancelled = false;

    if (projectsLoading) return;

    if (!project) {
      setLoadingPlots(false);
      return;
    }

    const runFetch = async () => {
      try {
        await fetchPlotsForProject(targetProjectId);
        if (!isCancelled) {
          setLoadingPlots(false);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("Failed to load project plots:", err);
          setPlotsError({
            status: err.status || (err.message?.includes("403") || err.message?.includes("Forbidden") ? 403 : (err.message?.includes("404") || err.message?.includes("not found") ? 404 : 500)),
            message: err.message || "Failed to load plots",
          });
          setLoadingPlots(false);
        }
      }
    };

    runFetch();

    return () => {
      isCancelled = true;
    };
  }, [targetProjectId, fetchPlotsForProject, projectsLoading]);

  // When changing projects (e.g. navigation to another project), reset loading state
  useEffect(() => {
    setLoadingPlots(true);
    setPlotsError(null);
  }, [targetProjectId]);

  // Get only plots belonging to this project with natural alphanumeric sorting.
  const projectPlots = useMemo(() => {
    if (!project) return [];
    const seenIds = new Set();
    const seenNumbers = new Set();

    return plots
      .filter((plot) => {
        const pId = String(plot.projectId);
        const pCustId = String(plot.projectCustomId || "");
        const pMongoId = String(plot.projectMongoId || "");
        const targetId = String(project.id);
        const targetCustomId = String(project.customId || "");
        const targetMongoId = String(project._id || "");

        const matches =
          pId === targetId ||
          pId === targetCustomId ||
          pId === targetMongoId ||
          (pCustId && (pCustId === targetId || pCustId === targetCustomId)) ||
          (pMongoId && (pMongoId === targetId || pMongoId === targetMongoId));

        if (!matches) return false;

        const plotKey = String(plot._id || plot.id || "");
        const plotNum = String(plot.plotNumber || "").trim().toLowerCase();

        if (plotKey && seenIds.has(plotKey)) return false;
        if (plotNum && seenNumbers.has(plotNum)) return false;

        if (plotKey) seenIds.add(plotKey);
        if (plotNum) seenNumbers.add(plotNum);

        return true;
      })
      .sort((a, b) => {
        const numA = String(a.plotNumber || "").trim();
        const numB = String(b.plotNumber || "").trim();
        return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: "base" });
      });
  }, [project, plots]);

  // Derived values.
  const totalPlots = projectPlots.length;

  const availablePlots = projectPlots.filter(
    (plot) => plot.status === "Available"
  ).length;

  const reservedPlots = projectPlots.filter(
    (plot) => plot.status === "Reserved"
  ).length;

  const soldPlots = projectPlots.filter(
    (plot) => plot.status === "Sold"
  ).length;

  // Apply search and status filters.
  const filteredResults = projectPlots.filter((plot) => {
    const matchesStatus =
      statusFilter === "All" ||
      plot.status === statusFilter;

    const searchText = search.toLowerCase();

    const matchesSearch =
      plot.plotNumber
        .toString()
        .toLowerCase()
        .includes(searchText) ||
      plot.size
        .toLowerCase()
        .includes(searchText) ||
      plot.facing
        .toLowerCase()
        .includes(searchText) ||
      plot.price
        .toLowerCase()
        .includes(searchText);

    return matchesStatus && matchesSearch;
  });

  // Open edit modal.
  const handleEditClick = (plot) => {
    if (isSubscriptionExpired) {
      alert("Your organization's workspace subscription has expired. Modifying plots is restricted. Please contact your Super Administrator.");
      return;
    }

    setEditForm({
      size: plot.size,
      facing: plot.facing,
      price: plot.price,
      status: plot.status,
      image: plot.image || "",
    });

    setEditingPlot(plot);
  };

  // Save edited plot with persistent backend update.
  const handleEditSave = async () => {
    if (!editingPlot || !project) return;

    try {
      if (updatePlot) {
        await updatePlot(editingPlot.id || editingPlot._id, editForm);
        const projId = project.customId || project.id || project._id;
        await fetchPlotsForProject(projId);
      } else {
        const updatedPlots = plots.map((plot) =>
          plot.id === editingPlot.id
            ? {
              ...plot,
              ...editForm,
            }
            : plot
        );
        setPlots(updatedPlots);
      }
    } catch (err) {
      console.error("Failed to update plot:", err);
      // Fallback local update
      const updatedPlots = plots.map((plot) =>
        plot.id === editingPlot.id
          ? {
            ...plot,
            ...editForm,
          }
          : plot
      );
      setPlots(updatedPlots);
    }

    const isSuperAdminRole =
      profile?.role === "Super Administrator" ||
      profile?.role === "Supreme Administrator" ||
      profile?.role === "SUPER_ADMIN";

    if (!isSuperAdminRole) {
      addNotification({
        recipient: "super_admin",
        type: "PLOT_UPDATED",
        title: "Plot Status Updated",
        message: `${profile?.name || "Branch Admin"} updated Plot #${editingPlot.plotNumber} in "${project.title}" — Status: ${editForm.status}, Price: ${editForm.price}, Size: ${editForm.size}.`,
        actorName: profile?.name || "Branch Admin",
        projectId: project.id,
        plotNumber: editingPlot.plotNumber,
      });
    }

    setEditingPlot(null);
  };

  // Close edit modal.
  const handleEditCancel = () => {
    setEditingPlot(null);
  };

  // Update form fields.
  const handleEditChange = (e) => {
    setEditForm({
      ...editForm,
      [e.target.name]: e.target.value,
    });
  };

  // Calculate next available plot number
  const getNextPlotNumber = useCallback(() => {
    const existingNumbers = projectPlots
      .map((p) => Number(p.plotNumber))
      .filter((n) => !isNaN(n));
    return existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  }, [projectPlots]);

  // Open Add Plot modal
  const handleAddClick = () => {
    if (isSubscriptionExpired) {
      alert("Your organization's workspace subscription has expired. Creating plots is restricted. Please contact your Super Administrator.");
      return;
    }
    const nextNumber = getNextPlotNumber();
    setAddForm({
      plotNumber: String(nextNumber),
      size: "",
      facing: "East",
      price: "",
      status: "Available",
      image: "",
    });
    setAddError("");
    setAddingPlot(true);
  };

  // Close Add Plot modal
  const handleAddCancel = () => {
    setAddingPlot(false);
    setAddError("");
  };

  // Handle Add Plot form changes
  const handleAddChange = (e) => {
    setAddForm({
      ...addForm,
      [e.target.name]: e.target.value,
    });
    if (addError) setAddError("");
  };

  // Save new plot
  const handleAddSave = async () => {
    if (!project) return;
    if (!addForm.plotNumber || !addForm.size || !addForm.facing || !addForm.price) {
      setAddError("Plot number, size, facing, and price are required.");
      return;
    }

    const projId = project.customId || project.id || project._id;
    try {
      await createPlot(projId, addForm);
      // Refresh plots from backend
      await fetchPlotsForProject(projId);
      handleAddCancel();
    } catch (err) {
      console.error("Failed to create plot:", err);
      const msg = err?.message || err?.data?.message || "";
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        setAddError("Plot number already exists in this project.");
      } else if (msg.includes("Forbidden") || msg.includes("403")) {
        setAddError("You do not have permission to manage this project's plots.");
      } else {
        setAddError("Failed to create plot. Please try again.");
      }
    }
  };

  // Handle delete plot trigger
  const handleDeleteClick = (plot) => {
    if (!project) return;
    if (isSubscriptionExpired) {
      alert("Your organization's workspace subscription has expired. Deleting plots is restricted. Please contact your Super Administrator.");
      return;
    }
    setPlotToDelete(plot);
  };

  const confirmDeletePlot = async () => {
    if (!plotToDelete || !project) return;
    const projId = project.customId || project.id || project._id;
    const plotId = plotToDelete.id || plotToDelete._id;
    setDeletingPlotId(plotId);

    try {
      await deletePlot(plotId);
      await fetchPlotsForProject(projId);
      setPlotToDelete(null);
    } catch (err) {
      console.error("Failed to delete plot:", err);
      const msg = err?.message || err?.data?.message || "";
      if (msg.includes("Forbidden") || msg.includes("403")) {
        setAlertModal({
          title: "Permission Denied",
          message: "You do not have permission to manage this project's plots.",
          type: "warning",
        });
      } else {
        setAlertModal({
          title: "Deletion Failed",
          message: "Failed to delete plot. Please try again.",
          type: "danger",
        });
      }
    } finally {
      setDeletingPlotId(null);
    }
  };

  // Handle resubmitting rejected project for Super Admin approval
  const handleResubmitProject = async () => {
    if (!project) return;
    setShowResubmitConfirm(true);
  };

  const confirmResubmitProject = async () => {
    if (!project) return;
    setResubmitting(true);
    try {
      if (updateProject) {
        await updateProject(project.id || project._id, {
          approvalStatus: "PENDING",
        });
      }
      if (addNotification) {
        addNotification({
          recipient: "super_admin",
          type: "PROJECT_UPDATED",
          title: "Project Resubmitted for Approval",
          message: `${profile?.name || "Branch Admin"} updated plots and resubmitted "${project.title}" for approval.`,
          actorName: profile?.name || "Branch Admin",
          projectId: project.id || project._id,
        });
      }
      setShowResubmitConfirm(false);
      setResubmitSuccess(true);
      setTimeout(() => setResubmitSuccess(false), 6000);
    } catch (err) {
      console.error("Failed to resubmit project:", err);
      setShowResubmitConfirm(false);
      setAlertModal({
        title: "Resubmission Failed",
        message: err.message || "Failed to resubmit project for approval.",
        type: "danger",
      });
    } finally {
      setResubmitting(false);
    }
  };

  // Conditional early renders (placed strictly after all hooks)
  // 1. Loading state
  if (projectsLoading || (loadingPlots && !project)) {
    return (
      <div className="project-plots-admin" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <div className="loading-spinner" style={{ margin: "0 auto 16px" }} />
          <p>Loading project plots...</p>
        </div>
      </div>
    );
  }

  // 2. 403 Forbidden / Ownership denied
  if (plotsError?.status === 403) {
    return (
      <div className="not-found access-denied">
        <h2>Access Denied</h2>
        <p>You do not have permission to view or manage plots for this project.</p>
        <button
          className="back-link"
          onClick={() => navigate("/admin/projects")}
        >
          <FaArrowLeft /> Back to Projects
        </button>
      </div>
    );
  }

  // 3. 404 Not Found
  if (!project || plotsError?.status === 404) {
    return (
      <div className="not-found">
        <h2>Project Not Found</h2>
        <p>The project you are looking for does not exist or has been removed.</p>
        <button
          className="back-link"
          onClick={() => navigate("/admin/projects")}
        >
          <FaArrowLeft /> Back to Projects
        </button>
      </div>
    );
  }

  // 4. Plots still loading for resolved project (only if no plots are loaded yet)
  if (loadingPlots && projectPlots.length === 0) {
    return (
      <div className="project-plots-admin" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <div className="loading-spinner" style={{ margin: "0 auto 16px" }} />
          <p>Loading plots for {project.title}...</p>
        </div>
      </div>
    );
  }

  // 5. Generic plots error
  if (plotsError) {
    return (
      <div className="not-found">
        <h2>Unable to Load Plots</h2>
        <p>{plotsError.message || "Failed to load plots for this project."}</p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "16px" }}>
          <button className="manage-btn" onClick={loadProjectPlots}>
            Retry
          </button>
          <button className="back-link" onClick={() => navigate("/admin/projects")}>
            <FaArrowLeft /> Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="project-plots-admin">

        {/* Back Button */}
        <div
          className="back-link"
          onClick={() => navigate("/admin/projects")}
        >
          <FaArrowLeft /> Back to Projects
        </div>

        {/* Header Section */}
        <div className="project-plots-header">

          <div className="project-info">

            <h1>
              {project.title} - Plots
            </h1>

            <div className="project-location">
              <FaMapMarkerAlt /> {project.location}
            </div>

            <div className="project-meta-pills">

              <span className="meta-pill">
                {project.plotType}
              </span>

              <span className="meta-pill">
                Starts from {project.plotPrice}
              </span>

              <span className="meta-pill">
                Status: {project.status}
              </span>

              <span className={`meta-pill approval-status ${String(project.approvalStatus || "PENDING").toLowerCase()}`}>
                {project.approvalStatus || "PENDING"}
              </span>

            </div>

          </div>

          <div className="header-actions">
            <button
              className="manage-btn"
              onClick={() => setShowLayoutEditor(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <FaMapMarkedAlt /> Layout Image
            </button>

            <button
              className="manage-btn"
              onClick={() =>
                navigate(
                  `/admin/projects/${getProjectRouteSlug(project, projects)}/manage-details`
                )
              }
            >
              <FaCog /> Manage Project Details
            </button>

            <button
              className="manage-btn add-plot-btn"
              onClick={handleAddClick}
            >
              <FaPlus /> Add Plot
            </button>

          </div>

        </div>

        {/* Rejected Project Notice Banner */}
        {project.approvalStatus === "REJECTED" && (
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: "10px",
              padding: "16px 20px",
              margin: "0 0 24px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", minWidth: "260px", flex: 1 }}>
              <FaExclamationTriangle style={{ color: "#e11d48", fontSize: "20px", marginTop: "2px", flexShrink: 0 }} />
              <div>
                <strong style={{ display: "block", color: "#9f1239", fontSize: "14px", marginBottom: "4px" }}>
                  Project Rejected by Super Administrator
                </strong>
                {project.rejectionReason && (
                  <div style={{ color: "#be123c", fontSize: "13px", marginBottom: "6px" }}>
                    <strong>Requested Changes:</strong> &ldquo;{project.rejectionReason}&rdquo;
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              className="manage-btn"
              style={{
                background: "#059669",
                borderColor: "#059669",
                color: "#ffffff",
                whiteSpace: "nowrap",
                alignSelf: "center",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 18px",
                fontWeight: 700,
              }}
              disabled={resubmitting}
              onClick={handleResubmitProject}
            >
              <FaPaperPlane /> {resubmitting ? "Resubmitting..." : "Resubmit for Approval"}
            </button>
          </div>
        )}

        {resubmitSuccess && (
          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: "8px",
              padding: "12px 18px",
              margin: "0 0 20px",
              color: "#065f46",
              fontSize: "13px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FaCheckCircle style={{ color: "#059669" }} />
            Project and plots have been resubmitted to the Super Administrator for approval!
          </div>
        )}

        {/* Stats Cards */}
        <div className="plots-stats-grid">
          <div className="plot-stat-card total">
            <div className="plot-stat-top">
              <span className="stat-label">Total Plots</span>
              <div className="plot-stat-indicator"></div>
            </div>
            <div className="stat-value">{totalPlots}</div>
            <span className="plot-stat-desc">Master layout inventory</span>
          </div>

          <div className="plot-stat-card available">
            <div className="plot-stat-top">
              <span className="stat-label">Available</span>
              <div className="plot-stat-indicator"></div>
            </div>
            <div className="stat-value">{availablePlots}</div>
            <span className="plot-stat-desc">Open for new bookings</span>
          </div>

          <div className="plot-stat-card reserved">
            <div className="plot-stat-top">
              <span className="stat-label">Reserved</span>
              <div className="plot-stat-indicator"></div>
            </div>
            <div className="stat-value">{reservedPlots}</div>
            <span className="plot-stat-desc">Hold deposit pending</span>
          </div>

          <div className="plot-stat-card sold">
            <div className="plot-stat-top">
              <span className="stat-label">Sold</span>
              <div className="plot-stat-indicator"></div>
            </div>
            <div className="stat-value">{soldPlots}</div>
            <span className="plot-stat-desc">Successfully registered</span>
          </div>
        </div>

        {/* Toolbar / Filters */}
        <div className="plots-controls">

          <div className="search-wrapper">

            <FaSearch />

            <input
              type="text"
              placeholder="Search by plot number, size, facing..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />

          </div>

          <div className="filter-group">

            {[
              "All",
              "Available",
              "Reserved",
              "Sold",
            ].map((status) => (
              <button
                key={status}
                className={`filter-btn ${statusFilter === status
                  ? "active"
                  : ""
                  }`}
                onClick={() =>
                  setStatusFilter(status)
                }
              >
                {status}
              </button>
            ))}

          </div>

        </div>

        {/* Data Table */}
        <div className="plots-table-container">

          {filteredResults.length > 0 ? (

            <table className="plots-table">

              <thead>

                <tr>
                  <th>Plot Number</th>
                  <th>Size</th>
                  <th>Facing</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>

              </thead>

              <tbody>

                {filteredResults.map((plot) => (

                  <tr key={plot.id}>

                    <td>
                      <strong>
                        {plot.plotNumber}
                      </strong>
                    </td>

                    <td>
                      {plot.size}
                    </td>

                    <td>
                      {plot.facing}
                    </td>

                    <td>
                      {plot.price}
                    </td>

                    <td>

                      <span
                        className={`status-badge ${plot.status.toLowerCase()}`}
                      >
                        {plot.status}
                      </span>

                    </td>

                    <td>

                      <div className="action-buttons">

                        <button
                          className="view-btn"
                          onClick={() => {
                            const projectSlug = getProjectRouteSlug(project, projects) || project.slug || project.id;
                            const plotSlug = plot.plotNumber ? encodeURIComponent(plot.plotNumber) : plot.id;
                            navigate(projectSlug ? `/plot-details/${projectSlug}/${plotSlug}` : `/plot-details/${plot.id}`);
                          }}
                        >
                          View
                        </button>

                        <button
                          className="edit-btn"
                          onClick={() =>
                            handleEditClick(plot)
                          }
                        >
                          <FaEdit />
                        </button>

                        <button
                          className="delete-btn"
                          onClick={() => handleDeleteClick(plot)}
                          title="Delete Plot"
                          disabled={deletingPlotId === (plot.id || plot._id)}
                        >
                          <FaTrash />
                        </button>

                      </div>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          ) : (

            <div className="not-found">

              <p>
                No plots matching your filters.
              </p>

            </div>

          )}

        </div>

      </div>

      {/* Edit Plot Modal */}
      {editingPlot && (

        <div
          className="modal-overlay"
          onClick={handleEditCancel}
        >

          <div
            className="modal-content"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            {/* Modal Header */}
            <div className="modal-header">

              <h3>
                Edit Plot{" "}
                <span>
                  {editingPlot.plotNumber}
                </span>
              </h3>

              <button
                className="modal-close"
                onClick={handleEditCancel}
              >
                <FaTimes />
              </button>

            </div>

            {/* Modal Body */}
            <div className="modal-body">
              <div className="modal-form-grid">
                <div className="form-group">
                  <label>Size*</label>
                  <input
                    type="text"
                    name="size"
                    value={editForm.size}
                    onChange={handleEditChange}
                    placeholder="e.g. 600 sq.ft"
                  />
                </div>

                <div className="form-group">
                  <label>Facing*</label>
                  <CustomDropdown
                    name="facing"
                    value={editForm.facing}
                    onChange={handleEditChange}
                  >
                    <option value="East">East</option>
                    <option value="West">West</option>
                    <option value="North">North</option>
                    <option value="South">South</option>
                    <option value="North-East">North-East</option>
                    <option value="North-West">North-West</option>
                    <option value="South-East">South-East</option>
                    <option value="South-West">South-West</option>
                  </CustomDropdown>
                </div>

                <div className="form-group">
                  <label>Price*</label>
                  <input
                    type="text"
                    name="price"
                    value={editForm.price}
                    onChange={handleEditChange}
                    placeholder="e.g. ₹12 Lakh"
                  />
                </div>

                <div className="form-group">
                  <label>Status*</label>
                  <CustomDropdown
                    name="status"
                    value={editForm.status}
                    onChange={handleEditChange}
                  >
                    <option value="Available">Available</option>
                    <option value="Reserved">Reserved</option>
                    <option value="Sold">Sold</option>
                  </CustomDropdown>
                </div>

                <div className="form-group full-width">
                  <label>Plot Image URL (Optional override)</label>
                  <input
                    type="url"
                    name="image"
                    placeholder="e.g. https://images.unsplash.com/..."
                    value={editForm.image || ""}
                    onChange={handleEditChange}
                  />

                  {editForm.image && (
                    <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
                      <img
                        src={editForm.image}
                        alt="Plot preview"
                        style={{ width: "90px", height: "60px", objectFit: "cover", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                        onError={(e) => { e.target.style.display = "none"; }}
                        onLoad={(e) => { e.target.style.display = "block"; }}
                      />
                      <small style={{ color: "#64748b" }}>Live preview of this plot's customized image</small>
                    </div>
                  )}
                </div>
              </div>
            </div>


            {/* Modal Footer */}
            <div className="modal-footer">

              <button
                className="btn-cancel"
                onClick={handleEditCancel}
              >
                <FaTimes /> Cancel
              </button>

              <button
                className="btn-save"
                onClick={handleEditSave}
              >
                <FaSave /> Save Changes
              </button>

            </div>

          </div>

        </div>

      )}

      {/* Add Plot Modal */}
      {addingPlot && (
        <div
          className="modal-overlay"
          onClick={handleAddCancel}
        >
          <div
            className="modal-content"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            {/* Modal Header */}
            <div className="modal-header">
              <h3>Add New Plot</h3>
              <button
                className="modal-close"
                onClick={handleAddCancel}
              >
                <FaTimes />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {addError && (
                <div className="modal-error" style={{ marginBottom: "1rem", padding: "0.75rem", background: "#f8d7da", color: "#721c24", borderRadius: "6px", fontSize: "0.85rem" }}>
                  {addError}
                </div>
              )}

              <div className="modal-form-grid">
                <div className="form-group">
                  <label>Plot Number*</label>
                  <input
                    type="number"
                    name="plotNumber"
                    min="1"
                    value={addForm.plotNumber}
                    onChange={handleAddChange}
                    placeholder="e.g. 1"
                  />
                </div>

                <div className="form-group">
                  <label>Size*</label>
                  <input
                    type="text"
                    name="size"
                    value={addForm.size}
                    onChange={handleAddChange}
                    placeholder="e.g. 600 sq.ft"
                  />
                </div>

                <div className="form-group">
                  <label>Facing*</label>
                  <CustomDropdown
                    name="facing"
                    value={addForm.facing}
                    onChange={handleAddChange}
                  >
                    <option value="East">East</option>
                    <option value="West">West</option>
                    <option value="North">North</option>
                    <option value="South">South</option>
                    <option value="North-East">North-East</option>
                    <option value="North-West">North-West</option>
                    <option value="South-East">South-East</option>
                    <option value="South-West">South-West</option>
                  </CustomDropdown>
                </div>

                <div className="form-group">
                  <label>Price*</label>
                  <input
                    type="text"
                    name="price"
                    value={addForm.price}
                    onChange={handleAddChange}
                    placeholder="e.g. ₹12 Lakh"
                  />
                </div>

                <div className="form-group full-width">
                  <label>Status*</label>
                  <CustomDropdown
                    name="status"
                    value={addForm.status}
                    onChange={handleAddChange}
                  >
                    <option value="Available">Available</option>
                    <option value="Reserved">Reserved</option>
                    <option value="Sold">Sold</option>
                  </CustomDropdown>
                </div>

                <div className="form-group full-width">
                  <label>Plot Image URL (Optional)</label>
                  <input
                    type="url"
                    name="image"
                    value={addForm.image}
                    onChange={handleAddChange}
                    placeholder="e.g. https://images.unsplash.com/..."
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              <button
                className="btn-cancel"
                onClick={handleAddCancel}
              >
                <FaTimes /> Cancel
              </button>
              <button
                className="btn-save btn-add"
                onClick={handleAddSave}
              >
                <FaSave /> Add Plot
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CONFIRM PLOT DELETION MODAL */}
      <ConfirmationModal
        isOpen={Boolean(plotToDelete)}
        title={`Delete Plot ${plotToDelete?.plotNumber}?`}
        message={`Are you sure you want to delete Plot ${plotToDelete?.plotNumber} in "${project?.title}"?`}
        subMessage="This action cannot be undone. All plot specs and details will be removed."
        confirmText="Delete Plot"
        type="danger"
        isLoading={Boolean(deletingPlotId)}
        onCancel={() => setPlotToDelete(null)}
        onConfirm={confirmDeletePlot}
      />

      {/* CONFIRM RESUBMISSION FOR SUPER ADMIN APPROVAL */}
      <ConfirmationModal
        isOpen={showResubmitConfirm}
        title="Resubmit Project for Approval?"
        message={`Are you sure you want to resubmit "${project?.title}" and its plots to the Super Administrator?`}
        subMessage="The Super Admin will review your updated project and plot details before publishing to public listings."
        confirmText="Resubmit Now"
        type="info"
        isLoading={resubmitting}
        onCancel={() => setShowResubmitConfirm(false)}
        onConfirm={confirmResubmitProject}
      />

      {/* NOTICE / ERROR ALERT MODAL */}
      <ConfirmationModal
        isOpen={Boolean(alertModal)}
        title={alertModal?.title || "Notice"}
        message={alertModal?.message || ""}
        type={alertModal?.type || "info"}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setAlertModal(null)}
        onCancel={() => setAlertModal(null)}
      />

      {/* CLEAN PROJECT LAYOUT / COVER IMAGE UPLOAD MODAL */}
      {showLayoutEditor && project && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!isUploadingLayout && !isSavingLayout) {
              setShowLayoutEditor(false);
              setLayoutUploadMessage(null);
            }
          }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: "680px" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <h3>
                Project Layout Image <span>({project.title})</span>
              </h3>
              <button
                className="modal-close"
                onClick={() => {
                  if (!isUploadingLayout && !isSavingLayout) {
                    setShowLayoutEditor(false);
                    setLayoutUploadMessage(null);
                  }
                }}
                disabled={isUploadingLayout || isSavingLayout}
              >
                <FaTimes />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {layoutUploadMessage && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    fontSize: "0.875rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    backgroundColor: layoutUploadMessage.type === "success" ? "#dcfce7" : "#fee2e2",
                    color: layoutUploadMessage.type === "success" ? "#166534" : "#991b1b",
                    border: `1px solid ${layoutUploadMessage.type === "success" ? "#bbf7d0" : "#fecaca"}`,
                  }}
                >
                  {layoutUploadMessage.type === "success" ? <FaCheckCircle /> : <FaExclamationTriangle />}
                  <span>{layoutUploadMessage.text}</span>
                </div>
              )}

              <input
                ref={layoutFileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml, image/avif, image/bmp"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  if (!file.type.startsWith("image/")) {
                    setLayoutUploadMessage({ type: "error", text: "Please select a valid image file (PNG, JPG, WebP)." });
                    return;
                  }

                  if (file.size > 20 * 1024 * 1024) {
                    setLayoutUploadMessage({ type: "error", text: "Image file size exceeds the 20MB limit." });
                    return;
                  }

                  setIsUploadingLayout(true);
                  setLayoutUploadMessage(null);

                  const reader = new FileReader();
                  reader.onload = async (evt) => {
                    const dataUrl = evt.target.result;
                    const img = new Image();
                    img.onload = async () => {
                      const detectedWidth = img.naturalWidth || 1200;
                      const detectedHeight = img.naturalHeight || 800;
                      try {
                        const targetId = project._id || project.id || "new";
                        const isSuperAdminRole =
                          profile?.role === "Super Administrator" ||
                          profile?.role === "Supreme Administrator" ||
                          profile?.role === "SUPER_ADMIN";
                        const uploadApi = isSuperAdminRole ? superAdminApi : adminApi;

                        const res = await uploadApi.uploadProjectImage(
                          {
                            fileData: dataUrl,
                            mimeType: file.type,
                            width: detectedWidth,
                            height: detectedHeight,
                          },
                          targetId
                        );

                        if (res?.success && res.data?.imageUrl) {
                          const uploadedUrl = res.data.imageUrl;
                          setLayoutImagePreview(uploadedUrl);
                          setLayoutUploadMessage({ type: "success", text: "Project layout image uploaded successfully to persistent storage!" });
                        } else {
                          setLayoutUploadMessage({ type: "error", text: res?.message || "Failed to upload image." });
                        }
                      } catch (err) {
                        console.error("Upload layout image error:", err);
                        setLayoutUploadMessage({ type: "error", text: err.data?.message || err.message || "Upload failed." });
                      } finally {
                        setIsUploadingLayout(false);
                      }
                    };
                    img.onerror = () => {
                      setIsUploadingLayout(false);
                      setLayoutUploadMessage({ type: "error", text: "Failed to read image dimensions." });
                    };
                    img.src = dataUrl;
                  };
                  reader.onerror = () => {
                    setIsUploadingLayout(false);
                    setLayoutUploadMessage({ type: "error", text: "Failed to read file." });
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />

              {layoutImagePreview ? (
                <div className="project-image-preview-card" style={{ flexDirection: "column", alignItems: "stretch", gap: "1rem" }}>
                  <div
                    style={{
                      width: "100%",
                      height: "260px",
                      borderRadius: "10px",
                      overflow: "hidden",
                      background: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                    }}
                  >
                    <img
                      src={resolveImageUrl(layoutImagePreview)}
                      alt="Project Layout Preview"
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "10px",
                        left: "10px",
                        background: "rgba(15, 23, 42, 0.75)",
                        color: "#fff",
                        padding: "4px 10px",
                        borderRadius: "20px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      Layout / Cover Image
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.85rem", color: "#64748b", wordBreak: "break-all" }}>
                      {layoutImagePreview}
                    </span>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="btn-cancel"
                        style={{ padding: "0.45rem 0.85rem", fontSize: "0.8rem" }}
                        onClick={() => layoutFileInputRef.current?.click()}
                        disabled={isUploadingLayout || isSavingLayout}
                      >
                        <FaCloudUploadAlt /> Replace
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        style={{ padding: "0.45rem 0.85rem", fontSize: "0.8rem", color: "#dc2626", borderColor: "#fecaca" }}
                        onClick={() => setLayoutImagePreview("")}
                        disabled={isUploadingLayout || isSavingLayout}
                      >
                        <FaTrash /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={`project-image-dropzone ${isDragOverLayout ? "drag-over" : ""} ${isUploadingLayout ? "uploading" : ""}`}
                  style={{ minHeight: "220px" }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverLayout(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragOverLayout(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverLayout(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && layoutFileInputRef.current) {
                      const dt = new DataTransfer();
                      dt.items.add(file);
                      layoutFileInputRef.current.files = dt.files;
                      layoutFileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                  }}
                  onClick={() => {
                    if (!isUploadingLayout) layoutFileInputRef.current?.click();
                  }}
                >
                  {isUploadingLayout ? (
                    <div className="dropzone-content">
                      <FaSpinner className="dropzone-icon fa-spin" />
                      <p className="dropzone-primary-text">Uploading layout image & converting to WebP...</p>
                      <span className="dropzone-secondary-text">Please wait while the image is compressed and optimized for persistent storage</span>
                    </div>
                  ) : (
                    <div className="dropzone-content">
                      <div className="dropzone-icon-wrap">
                        <FaCloudUploadAlt className="dropzone-icon" />
                      </div>
                      <p className="dropzone-primary-text">
                        Drag &amp; drop layout image here, or <span className="dropzone-browse-link">browse</span>
                      </p>
                      <span className="dropzone-secondary-text">
                        PNG, JPG, JPEG, WEBP supported (up to 20MB)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => {
                  setShowLayoutEditor(false);
                  setLayoutUploadMessage(null);
                }}
                disabled={isUploadingLayout || isSavingLayout}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-save"
                disabled={isUploadingLayout || isSavingLayout}
                onClick={async () => {
                  setIsSavingLayout(true);
                  setLayoutUploadMessage(null);
                  try {
                    const cleanUrl = layoutImagePreview.trim();
                    const targetId = project._id || project.id;
                    const existingImages = Array.isArray(project.images) ? [...project.images] : [];
                    if (cleanUrl) {
                      if (existingImages.length === 0) existingImages.push(cleanUrl);
                      else existingImages[0] = cleanUrl;
                    }

                    const layoutPayload = {
                      ...(project.layout || {}),
                      referenceImageUrl: cleanUrl,
                      imageUrl: cleanUrl,
                      provider: "volume",
                    };

                    if (updateProject) {
                      await updateProject(targetId, {
                        image: cleanUrl,
                        images: existingImages,
                        layout: layoutPayload,
                      });
                    }

                    setLayoutUploadMessage({ type: "success", text: "Project layout image successfully saved and updated!" });
                    setTimeout(() => {
                      setShowLayoutEditor(false);
                      setLayoutUploadMessage(null);
                    }, 1000);
                  } catch (err) {
                    console.error("Failed to save project layout image:", err);
                    setLayoutUploadMessage({ type: "error", text: err.message || "Failed to save project image." });
                  } finally {
                    setIsSavingLayout(false);
                  }
                }}
              >
                {isSavingLayout ? <FaSpinner className="fa-spin" /> : <FaSave />}
                <span>{isSavingLayout ? "Saving..." : "Save Image"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
};

export default ProjectPlots;