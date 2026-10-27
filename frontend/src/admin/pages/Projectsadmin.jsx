import { useState, useCallback, useMemo } from "react";
import { useProjects, getProjectRouteSlug } from "../../context/ProjectContext";
import { usePlots } from "../../context/PlotContext";
import { useAdminProfile } from "../context/AdminProfileContext";
import { useNotifications } from "../context/NotificationContext";
import { useNavigate } from "react-router-dom";
import CustomDropdown from "../components/CustomDropdown";


/**
 * Extract the editable value portion from a stored string by removing the suffix.
 */
const extractValue = (storedValue, suffix) => {
  if (!storedValue || !suffix) return storedValue || "";
  const suffixWithSpace = ` ${suffix}`;
  if (storedValue.endsWith(suffixWithSpace)) {
    return storedValue.slice(0, -suffixWithSpace.length);
  }
  if (storedValue.endsWith(suffix)) {
    return storedValue.slice(0, -suffix.length);
  }
  return storedValue;
};

/**
 * Combine a raw input value with its fixed suffix.
 */
const combineWithSuffix = (value, suffix) => {
  if (!value || !suffix) return value || "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed} ${suffix}`;
};

/**
 * Sanitize text input - remove numeric characters
 * "Dindigul123" -> "Dindigul"
 */
const sanitizeTextNoDigits = (value) => value.replace(/\d/g, '');

/**
 * Sanitize plot price input - allow only digits and single decimal point
 * "8.5abc" -> "8.5", "₹12.5" -> "12.5", "8 Lakh" -> "8", "8.5.5" -> "8.5"
 */
const sanitizePlotPrice = (value) => {
  const cleaned = value.replace(/[₹,\s]/g, '').replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  return parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
};

/**
 * Wrapper component for input with fixed unit suffix.
 * Supports optional sanitize function for input validation.
 */
const InputWithUnit = ({ value, onChange, placeholder, suffix, sanitize, ...rest }) => {
  return (
    <div className="input-with-unit">
      <input
        value={value}
        onChange={(e) => onChange(sanitize ? sanitize(e.target.value) : e.target.value)}
        placeholder={placeholder}
        {...rest}
      />
      <span className="input-unit">{suffix}</span>
    </div>
  );
};


import {
  FaSearch,
  FaPlus,
  FaThLarge,
  FaList,
  FaMapMarkerAlt,
  FaEllipsisH,
  FaEye,
  FaEdit,
  FaTrash,
  FaChevronDown,
  FaArrowRight,
  FaBuilding,
  FaCheckCircle,
  FaEllipsisV,
  FaTimesCircle,
  FaCheckDouble,
  FaCog,
  FaClock,
  FaExclamationTriangle,
} from "react-icons/fa";

import projectFallbackImg from "../../assets/projectimg1.png";
import ConfirmationModal from "../components/ConfirmationModal";
import "../styles/projectsadmin.css";
const Projects = () => {

  const { projects, setProjects, updateProject, deleteProject, parsePriceLakhs, isValidPlotPrice } = useProjects();
  const { plots, setPlots } = usePlots();
  const { profile, isSubscriptionExpired } = useAdminProfile();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState("grid");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Projects");
  const [projectStatusDropdownOpen, setProjectStatusDropdownOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);

  const [selectedProject, setSelectedProject] = useState(null);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [alertModal, setAlertModal] = useState(null);

  // Basic edit form only
  const [editForm, setEditForm] = useState({
    title: "",
    location: "",
    status: "",
    plotPrice: "",
    plotType: "Residential",
    totalPlots: "",
    availablePlots: "",
    reservedPlots: "",
    soldPlots: "",
    launchDate: "",
  });

  const editTotal = Number(editForm.totalPlots) || 0;
  const editAvailable = Number(editForm.availablePlots) || 0;
  const editReserved = Number(editForm.reservedPlots) || 0;
  const editSold = Number(editForm.soldPlots) || 0;

  const editRemaining =
    editTotal - editAvailable - editReserved - editSold;

  const editPlotsValid =
    editTotal > 0 &&
    editAvailable >= 0 &&
    editReserved >= 0 &&
    editSold >= 0 &&
    editAvailable + editReserved + editSold === editTotal;

  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  const getPlotIndex = (plot, projectId) => {
    if (typeof plot.id === "string" && plot.id.includes("-")) {
      const parts = plot.id.split("-");
      if (parts[0] === String(projectId)) return Number(parts[1]);
    } else if (typeof plot.id === "number") {
      const idStr = String(plot.id);
      const projectIdStr = String(projectId);
      if (idStr.startsWith(projectIdStr)) {
        const suffix = idStr.slice(projectIdStr.length);
        if (suffix.length === 2 && !isNaN(Number(suffix))) return Number(suffix);
      }
    } else if (typeof plot.plotNumber === "string" && !isNaN(Number(plot.plotNumber))) {
      const plotNum = Number(plot.plotNumber);
      const projectIdStr = String(projectId);
      const plotNumStr = String(plotNum);
      if (plotNumStr.startsWith(projectIdStr)) {
        const suffix = plotNumStr.slice(projectIdStr.length);
        if (suffix.length === 2 && !isNaN(Number(suffix))) return Number(suffix);
      } else {
        return plotNum;
      }
    }
    return 0;
  };

  const syncPlotsForProject = useCallback((
    currentProjectId,
    newTotal,
    newAvailable,
    newReserved,
    newSold,
    currentPlots,
    projectPlotType,
    projectPlotPrice
  ) => {
    const projectIdStr = String(currentProjectId);

    const existingProjectPlots = currentPlots
      .filter((p) => p.projectId === currentProjectId)
      .sort((a, b) => getPlotIndex(a, currentProjectId) - getPlotIndex(b, currentProjectId));

    let updatedPlots = currentPlots.filter((p) => p.projectId !== currentProjectId);

    const existingCount = existingProjectPlots.length;
    const retainCount = Math.min(existingCount, newTotal);

    const retainedPlots = existingProjectPlots.slice(0, retainCount);

    let currentAvailable = retainedPlots.filter(p => p.status === "Available").length;
    let currentReserved = retainedPlots.filter(p => p.status === "Reserved").length;
    let currentSold = retainedPlots.filter(p => p.status === "Sold").length;

    const plotsToAdjust = [...retainedPlots];

    const changePlotStatus = (plot, newStatus) => ({
      ...plot,
      status: newStatus
    });

    if (currentAvailable > newAvailable) {
      const excess = currentAvailable - newAvailable;
      for (let i = 0; i < plotsToAdjust.length && excess > 0; i++) {
        if (plotsToAdjust[i].status === "Available") {
          if (currentReserved < newReserved) {
            plotsToAdjust[i] = changePlotStatus(plotsToAdjust[i], "Reserved");
            currentReserved++;
            currentAvailable--;
          } else if (currentSold < newSold) {
            plotsToAdjust[i] = changePlotStatus(plotsToAdjust[i], "Sold");
            currentSold++;
            currentAvailable--;
          }
        }
      }
    }

    if (currentReserved > newReserved) {
      const excess = currentReserved - newReserved;
      for (let i = 0; i < plotsToAdjust.length && excess > 0; i++) {
        if (plotsToAdjust[i].status === "Reserved") {
          if (currentAvailable < newAvailable) {
            plotsToAdjust[i] = changePlotStatus(plotsToAdjust[i], "Available");
            currentAvailable++;
            currentReserved--;
          } else if (currentSold < newSold) {
            plotsToAdjust[i] = changePlotStatus(plotsToAdjust[i], "Sold");
            currentSold++;
            currentReserved--;
          }
        }
      }
    }

    if (currentSold > newSold) {
      const excess = currentSold - newSold;
      for (let i = 0; i < plotsToAdjust.length && excess > 0; i++) {
        if (plotsToAdjust[i].status === "Sold") {
          if (currentAvailable < newAvailable) {
            plotsToAdjust[i] = changePlotStatus(plotsToAdjust[i], "Available");
            currentAvailable++;
            currentSold--;
          } else if (currentReserved < newReserved) {
            plotsToAdjust[i] = changePlotStatus(plotsToAdjust[i], "Reserved");
            currentReserved++;
            currentSold--;
          }
        }
      }
    }

    const newPlots = [];
    let nextIndex = existingCount > 0 ?
      Math.max(...existingProjectPlots.map(p => getPlotIndex(p, currentProjectId))) + 1 : 1;

    while (currentAvailable < newAvailable) {
      const plotNumber = String(nextIndex);
      newPlots.push({
        id: `${projectIdStr}-${nextIndex}`,
        projectId: currentProjectId,
        plotNumber,
        image: existingProjectPlots[0]?.image || "",
        images: existingProjectPlots[0]?.images || [],
        size: existingProjectPlots[0]?.size || "600 sq.ft",
        facing: existingProjectPlots[0]?.facing || "East",
        price: existingProjectPlots[0]?.price || projectPlotPrice || "₹12 Lakh",
        status: "Available",
      });
      currentAvailable++;
      nextIndex++;
    }

    while (currentReserved < newReserved) {
      const plotNumber = String(nextIndex);
      newPlots.push({
        id: `${projectIdStr}-${nextIndex}`,
        projectId: currentProjectId,
        plotNumber,
        image: existingProjectPlots[0]?.image || "",
        images: existingProjectPlots[0]?.images || [],
        size: existingProjectPlots[0]?.size || "600 sq.ft",
        facing: existingProjectPlots[0]?.facing || "East",
        price: existingProjectPlots[0]?.price || projectPlotPrice || "₹12 Lakh",
        status: "Reserved",
      });
      currentReserved++;
      nextIndex++;
    }

    while (currentSold < newSold) {
      const plotNumber = String(nextIndex);
      newPlots.push({
        id: `${projectIdStr}-${nextIndex}`,
        projectId: currentProjectId,
        plotNumber,
        image: existingProjectPlots[0]?.image || "",
        images: existingProjectPlots[0]?.images || [],
        size: existingProjectPlots[0]?.size || "600 sq.ft",
        facing: existingProjectPlots[0]?.facing || "East",
        price: existingProjectPlots[0]?.price || projectPlotPrice || "₹12 Lakh",
        status: "Sold",
      });
      currentSold++;
      nextIndex++;
    }

    updatedPlots = [...updatedPlots, ...plotsToAdjust, ...newPlots];
    return updatedPlots;
  }, []);

  const handleDeleteProject = (projectId) => {
    const targetProject = projects.find((project) => project.id === projectId || project._id === projectId);
    if (!targetProject) return;
    setOpenMenu(null);
    setProjectToDelete(targetProject);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    const projectId = projectToDelete.id || projectToDelete._id;
    setIsDeleting(true);

    try {
      if (deleteProject) {
        const res = await deleteProject(projectId);
        setProjectToDelete(null);
        if (res?.pendingApproval) {
          setAlertModal({
            title: "Deletion Request Submitted",
            message: "Deletion request has been submitted to the Super Administrator for approval.",
            type: "info",
          });
        } else {
          setAlertModal({
            title: "Project Deleted",
            message: "Project has been deleted successfully.",
            type: "success",
          });
        }
      } else {
        setProjects((prev) => prev.filter((project) => project.id !== projectId && project._id !== projectId));
        setProjectToDelete(null);
      }
    } catch (err) {
      console.error("[Projectsadmin] Failed to delete project:", err);
      setProjectToDelete(null);
      setAlertModal({
        title: "Delete Failed",
        message: err.message || "Failed to delete project",
        type: "danger",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const validatePlotCounts = () => {
    const total = Number(editForm.totalPlots);
    const available = Number(editForm.availablePlots);
    const reserved = Number(editForm.reservedPlots);
    const sold = Number(editForm.soldPlots);

    if (available + reserved + sold !== total) {
      return false;
    }

    return true;
  };

  const handleSaveProject = () => {

    if (!validatePlotCounts()) {
      setAlertModal({
        title: "Validation Error",
        message: "Available, Reserved and Sold plots cannot exceed Total Plots.",
        type: "warning",
      });
      return;
    }

    // Validate plotPrice format (check combined value with suffix)
    const combinedPlotPrice = combineWithSuffix(editForm.plotPrice, "Lakh");
    if (!isValidPlotPrice(combinedPlotPrice)) {
      setAlertModal({
        title: "Invalid Plot Price",
        message: "Invalid plot price format. Use format like '8.5 Lakh', '12 Lakh', or '₹12.5 Lakh'",
        type: "warning",
      });
      return;
    }

    // Also validate raw input doesn't contain invalid characters after sanitization
    const sanitizedPrice = sanitizePlotPrice(editForm.plotPrice);
    if (sanitizedPrice !== editForm.plotPrice) {
      // Update the form with sanitized value
      setEditForm(prev => ({ ...prev, plotPrice: sanitizedPrice }));
    }

    const projectId = selectedProject.id;
    const newTotal = Number(editForm.totalPlots);
    const newAvailable = Number(editForm.availablePlots);
    const newReserved = Number(editForm.reservedPlots);
    const newSold = Number(editForm.soldPlots);

    const existingProject = projects.find((p) => p.id === projectId);
    const inventoryChanged =
      existingProject.totalPlots !== newTotal ||
      existingProject.availablePlots !== newAvailable ||
      existingProject.reservedPlots !== newReserved ||
      existingProject.soldPlots !== newSold;

    // First, update the project
    const updatedProjects = projects.map((project) => {
      if (project.id === projectId) {
        const combinedPlotPrice = combineWithSuffix(editForm.plotPrice, "Lakh");
        return {
          ...project,
          title: editForm.title,
          location: editForm.location,
          status: editForm.status,
          plotPrice: combinedPlotPrice,
          priceLakhs: parsePriceLakhs(combinedPlotPrice),
          plotType: editForm.plotType,
          totalPlots: newTotal,
          availablePlots: newAvailable,
          reservedPlots: newReserved,
          soldPlots: newSold,
          launchDate: editForm.launchDate,
        };
      }

      return project;
    });

    setProjects(updatedProjects);

    if (updateProject) {
      const combinedPlotPrice = combineWithSuffix(editForm.plotPrice, "Lakh");

      updateProject(projectId, {
        title: editForm.title,
        location: editForm.location,
        status: editForm.status,
        plotPrice: combinedPlotPrice,
        plotType: editForm.plotType,
        launchDate: editForm.launchDate,

        // Inventory counts
        totalPlots: newTotal,
        availablePlots: newAvailable,
        reservedPlots: newReserved,
        soldPlots: newSold,
      }).catch((err) =>
        console.warn("[Projectsadmin] server update error:", err)
      );
    }

    // Now sync the plots in PlotContext - only regenerate if inventory counts changed
    if (inventoryChanged) {
      const updatedPlots = syncPlotsForProject(
        projectId,
        newTotal,
        newAvailable,
        newReserved,
        newSold,
        plots,
        editForm.plotType,
        editForm.plotPrice
      );
      setPlots(updatedPlots);
    }

    if (profile?.role !== "Super Administrator") {
      addNotification({
        recipient: "super_admin",
        type: "PROJECT_UPDATED",
        title: "Project Updated",
        message: `${profile?.name || "Branch Admin"} updated "${editForm.title}" (${editForm.location}) — Total: ${newTotal}, Status: ${editForm.status}.`,
        actorName: profile?.name || "Branch Admin",
        projectId: projectId,
      });
    }

    setSelectedProject(null);
  };

  // Derive separated status lists
  const approvedProjects = useMemo(
    () => projects.filter((project) => project.approvalStatus === "APPROVED"),
    [projects]
  );

  const pendingProjects = useMemo(
    () => projects.filter((project) => project.approvalStatus === "PENDING"),
    [projects]
  );

  const rejectedProjects = useMemo(
    () => projects.filter((project) => project.approvalStatus === "REJECTED"),
    [projects]
  );

  // Main list filters strictly over APPROVED projects
  const filteredProjects = useMemo(() => {
    const searchValue = search.toLowerCase();

    return approvedProjects.filter((project) => {
      const matchesSearch =
        project.title.toLowerCase().includes(searchValue) ||
        project.location.toLowerCase().includes(searchValue);

      const matchesStatus =
        status === "All Projects" || project.status === status;

      return matchesSearch && matchesStatus;
    });
  }, [approvedProjects, search, status]);

  // Total plots strictly counted from APPROVED projects
  const totalPlots = useMemo(
    () => approvedProjects.reduce((sum, project) => sum + (Number(project.totalPlots) || 0), 0),
    [approvedProjects]
  );

  return (
    <>
      <div className="projects-page">

        {/* =====================================================
          HEADER
        ===================================================== */}

        <div className="projects-page-header">

          <div>

            <span className="projects-kicker">
              PROJECT MANAGEMENT
            </span>

            <h1>
              Projects
            </h1>

          </div>

          <button
            className="projects-add-btn"
            disabled={isSubscriptionExpired}
            title={isSubscriptionExpired ? "Workspace subscription has expired. Adding projects is disabled." : "Add Project"}
            style={isSubscriptionExpired ? { opacity: 0.6, cursor: "not-allowed", filter: "grayscale(0.6)" } : {}}
            onClick={() => {
              if (isSubscriptionExpired) {
                alert("Your organization's workspace subscription has expired. Creating new projects is locked. Please contact your Super Administrator.");
                return;
              }
              navigate("/admin/projects/new");
            }}
          >
            <FaPlus />
            Add Project
          </button>

        </div>


        {/* =====================================================
          OVERVIEW CARDS (APPROVED ONLY + PENDING + REJECTED)
        ===================================================== */}

        <div className="projects-overview">

          {/* 1. Total Projects (Approved Only) */}
          <div className="projects-overview-card">

            <div className="projects-overview-icon blue">
              <FaBuilding />
            </div>

            <div>
              <strong>{approvedProjects.length}</strong>
              <span>Total Projects</span>
            </div>

          </div>


          {/* 2. Pending Approval */}
          <div className="projects-overview-card">

            <div className="projects-overview-icon amber">
              <FaClock />
            </div>

            <div>
              <strong>{pendingProjects.length}</strong>
              <span>Pending Approval</span>
            </div>

          </div>


          {/* 3. Rejected */}
          <div className="projects-overview-card">

            <div className="projects-overview-icon red">
              <FaTimesCircle />
            </div>

            <div>
              <strong>{rejectedProjects.length}</strong>
              <span>Rejected</span>
            </div>

          </div>


          {/* 4. Total Plots (Approved Only) */}
          <div className="projects-overview-card">

            <div className="projects-overview-icon black">
              <FaMapMarkerAlt />
            </div>

            <div>
              <strong>{totalPlots}</strong>
              <span>Total Plots</span>
            </div>

          </div>

        </div>


        {/* =====================================================
          TOOLBAR
        ===================================================== */}

        <div className="projects-toolbar">

          <div className="projects-search">

            <FaSearch />

            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

          </div>


          <div className="projects-status-select">

            <div className="projects-status-select custom-project-filter">

              <button
                type="button"
                className="project-filter-trigger"
                onClick={() =>
                  setProjectStatusDropdownOpen(
                    !projectStatusDropdownOpen
                  )
                }
              >
                <span>{status}</span>

                <FaChevronDown
                  className={
                    projectStatusDropdownOpen
                      ? "project-filter-chevron open"
                      : "project-filter-chevron"
                  }
                />
              </button>

              {projectStatusDropdownOpen && (
                <div className="project-filter-options">

                  <button
                    type="button"
                    className={status === "All Projects" ? "selected" : ""}
                    onClick={() => {
                      setStatus("All Projects");
                      setProjectStatusDropdownOpen(false);
                    }}
                  >
                    All Projects
                  </button>

                  <button
                    type="button"
                    className={status === "Active" ? "selected" : ""}
                    onClick={() => {
                      setStatus("Active");
                      setProjectStatusDropdownOpen(false);
                    }}
                  >
                    Active
                  </button>

                  <button
                    type="button"
                    className={status === "Completed" ? "selected" : ""}
                    onClick={() => {
                      setStatus("Completed");
                      setProjectStatusDropdownOpen(false);
                    }}
                  >
                    Completed
                  </button>

                </div>
              )}

            </div>

          </div>


          <div className="projects-view-toggle">

            <button
              className={
                viewMode === "grid"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setViewMode("grid")
              }
            >
              <FaThLarge />
            </button>

            <button
              className={
                viewMode === "list"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setViewMode("list")
              }
            >
              <FaList />
            </button>

          </div>

        </div>


        {/* =====================================================
          RESULT HEADER
        ===================================================== */}

        <div className="projects-results">

          <div>
            <strong>
              {filteredProjects.length}
            </strong>

            <span>
              projects
            </span>
          </div>
        </div>


        {/* =====================================================
          GRID VIEW
        ===================================================== */}

        {viewMode === "grid" && (
          <div className="projects-grid">

            {filteredProjects.map((project) => {

              const soldPercentage =
                project.totalPlots > 0
                  ? ((project.soldPlots / project.totalPlots) * 100).toFixed(1)
                  : 0;

              return (
                <article
                  className="project-admin-card"
                  key={project.id}
                >

                  {/* Image */}

                  <div className="project-admin-image">

                    <img
                      src={
                        project.image ||
                        (project.images && project.images.length > 0 && project.images[0]) ||
                        projectFallbackImg
                      }
                      alt={project.title}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = projectFallbackImg;
                      }}
                    />

                    <span
                      className={`project-status ${project.status.toLowerCase()}`}
                    >
                      {project.status}
                    </span>

                    {project.pendingDeletion && (
                      <span
                        className="project-status"
                        style={{
                          top: "40px",
                          background: "#dc2626",
                          color: "#ffffff",
                          fontSize: "10px",
                          fontWeight: 700,
                          letterSpacing: "0.4px",
                        }}
                      >
                        Deletion Pending
                      </span>
                    )}


                    <div className="project-menu">

                      <button
                        onClick={() =>
                          setOpenMenu(
                            openMenu === project.id
                              ? null
                              : project.id
                          )
                        }
                      >
                        <FaEllipsisH />
                      </button>

                      {openMenu === project.id && (
                        <div className="project-menu-dropdown">

                          <button
                            type="button"
                            onClick={() => {
                              navigate(`/admin/projects/${getProjectRouteSlug(project, projects)}/manage-details`);
                              setOpenMenu(null);
                            }}
                          >
                            <FaCog />
                            Manage Details
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (isSubscriptionExpired) {
                                alert("Your organization's workspace subscription has expired. Project editing is restricted.");
                                return;
                              }
                              console.log("EDIT CLICKED", project);

                              setSelectedProject(project);

                              setEditForm({
                                title: project.title,
                                location: project.location,
                                status: project.status,
                                plotPrice: project.plotPrice,
                                plotType: project.plotType,
                                totalPlots: project.totalPlots,
                                availablePlots: project.availablePlots,
                                reservedPlots: project.reservedPlots,
                                soldPlots: project.soldPlots,
                                launchDate: project.launchDate || "",
                              });

                              setOpenMenu(null);
                            }}
                            style={isSubscriptionExpired ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                            title={isSubscriptionExpired ? "Editing disabled (Subscription expired)" : "Edit Project"}
                          >
                            <FaEdit />
                            Edit Project
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (isSubscriptionExpired) {
                                alert("Your organization's workspace subscription has expired. Project deletion is restricted.");
                                return;
                              }
                              handleDeleteProject(project.id);
                            }}
                            className="delete"
                            style={isSubscriptionExpired ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                            title={isSubscriptionExpired ? "Deletion disabled (Subscription expired)" : "Delete Project"}
                          >
                            <FaTrash />
                            Delete Project
                          </button>

                        </div>
                      )}

                    </div>

                  </div>


                  {/* Content */}

                  <div className="project-admin-content">

                    <div className="project-admin-heading">

                      <div>

                        <h3>
                          {project.title}
                        </h3>

                        <p>
                          <FaMapMarkerAlt />
                          {project.location}
                        </p>

                      </div>

                    </div>

                    {/* Price */}

                    <div className="project-price">

                      <span>
                        Starting from
                      </span>

                      <strong>
                        {project.plotPrice}
                      </strong>

                      <small>
                        / Plot
                      </small>

                    </div>


                    {/* Stats */}

                    <div className="project-stats">

                      <div>
                        <strong>
                          {project.totalPlots}
                        </strong>

                        <span>
                          Total
                        </span>
                      </div>

                      <div>
                        <strong>
                          {project.availablePlots}
                        </strong>

                        <span>
                          Available
                        </span>
                      </div>

                      <div>
                        <strong>
                          {project.reservedPlots}
                        </strong>

                        <span>
                          Reserved
                        </span>
                      </div>

                      <div>
                        <strong>
                          {project.soldPlots}
                        </strong>

                        <span>
                          Sold
                        </span>
                      </div>

                    </div>


                    {/* Progress */}

                    <div className="project-sales">

                      <div className="project-sales-heading">

                        <span>
                          Sales progress
                        </span>

                        <strong>
                          {soldPercentage}%
                        </strong>

                      </div>

                      <div className="project-sales-bar">

                        <span
                          style={{
                            width: `${soldPercentage}%`,
                          }}
                        />
                      </div>

                    </div>


                    {/* Footer */}

                    <div className="project-card-footer">

                      <div className="project-launch">

                        <span>
                          Launch
                        </span>

                        <strong>
                          {project.launchDate}
                        </strong>

                      </div>

                      <button onClick={() => navigate(`/admin/projects/${getProjectRouteSlug(project, projects)}/manage`)}>
                        View
                        <FaArrowRight />
                      </button>

                    </div>

                  </div>

                </article>
              );
            })}

          </div>
        )}


        {/* =====================================================
          LIST VIEW
        ===================================================== */}

        {viewMode === "list" && (
          <div className="projects-list">

            <div className="projects-list-head">

              <span>Project</span>
              <span>Status</span>
              <span>Total</span>
              <span>Available</span>
              <span>Sold</span>
              <span>Starting Price</span>
              <span />

            </div>


            {filteredProjects.map((project) => (
              <div
                className="projects-list-row"
                key={project.id}
              >

                <div className="list-project-info">

                  <img
                    src={
                      project.image ||
                      (project.images && project.images.length > 0 && project.images[0]) ||
                      projectFallbackImg
                    }
                    alt={project.title}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = projectFallbackImg;
                    }}
                  />

                  <div>

                    <strong>
                      {project.title}
                    </strong>

                    <span>
                      <FaMapMarkerAlt />
                      {project.location}
                    </span>

                  </div>

                </div>


                <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                  <span
                    className={`project-status list-project-status ${project.status.toLowerCase()}`}
                  >
                    {project.status}
                  </span>
                  {project.pendingDeletion && (
                    <span
                      style={{
                        background: "#dc2626",
                        color: "#ffffff",
                        fontSize: "9px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        textTransform: "uppercase",
                      }}
                    >
                      Deletion Pending
                    </span>
                  )}
                </div>


                <strong>
                  {project.totalPlots}
                </strong>


                <strong className="available-number">
                  {project.availablePlots}
                </strong>


                <strong>
                  {project.soldPlots}
                </strong>


                <strong>
                  {project.plotPrice}
                </strong>


                <div className="list-project-actions">
                  <button
                    className="list-project-menu"
                    onClick={() =>
                      setOpenMenu(
                        openMenu === project.id ? null : project.id
                      )
                    }
                  >
                    <FaEllipsisV />
                  </button>

                  {openMenu === project.id && (
                    <div className="project-menu-dropdown list-dropdown">
                      <button onClick={() => {
                        navigate(`/admin/projects/${getProjectRouteSlug(project, projects)}/manage`);
                        setOpenMenu(null);
                      }}>
                        <FaEye />
                        View Project
                      </button>

                      <button
                        onClick={() => {
                          if (isSubscriptionExpired) {
                            alert("Your organization's workspace subscription has expired. Project editing is restricted.");
                            return;
                          }
                          setSelectedProject(project);

                          setEditForm({
                            title: project.title,
                            location: project.location,
                            status: project.status,
                            plotPrice: project.plotPrice,
                            plotType: project.plotType,
                            totalPlots: project.totalPlots,
                            availablePlots: project.availablePlots,
                            reservedPlots: project.reservedPlots,
                            soldPlots: project.soldPlots,
                            launchDate: project.launchDate || "",
                          });

                          setOpenMenu(null);
                        }}
                        style={isSubscriptionExpired ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                        title={isSubscriptionExpired ? "Editing disabled (Subscription expired)" : "Edit Project"}
                      >
                        <FaEdit />
                        Edit Project
                      </button>

                      <button
                        className="delete"
                        onClick={() => {
                          if (isSubscriptionExpired) {
                            alert("Your organization's workspace subscription has expired. Project deletion is restricted.");
                            return;
                          }
                          handleDeleteProject(project.id);
                        }}
                        style={isSubscriptionExpired ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                        title={isSubscriptionExpired ? "Deletion disabled (Subscription expired)" : "Delete Project"}
                      >
                        <FaTrash />
                        Delete Project
                      </button>
                    </div>
                  )}
                </div>

              </div>
            ))}

          </div>
        )}


        {/* =====================================================
          APPROVED PROJECTS EMPTY STATE
        ===================================================== */}
        {filteredProjects.length === 0 && (
          <div className="projects-empty">
            <div>
              <FaTimesCircle />
            </div>
            <h3>No approved projects found</h3>
            <p>Try changing your search or project status filter.</p>
            <button
              onClick={() => {
                setSearch("");
                setStatus("All Projects");
              }}
            >
              Clear filters
            </button>
          </div>
        )}

        {/* =====================================================
          PENDING APPROVAL SECTION
        ===================================================== */}
        {pendingProjects.length > 0 && (
          <section className="admin-status-section">
            <div className="admin-status-section-header pending">
              <div>
                <h2>
                  <FaClock style={{ color: "#d97706" }} />
                  Pending Approval
                  <span className="count-pill">{pendingProjects.length}</span>
                </h2>
                <p className="admin-status-section-desc">
                  These projects are submitted and awaiting Super Admin approval before going live on the public website.
                </p>
              </div>
            </div>

            <div className="admin-status-grid">
              {pendingProjects.map((project) => (
                <div key={project.id} className="admin-status-card pending">
                  <div className="admin-status-card-top">
                    <div>
                      <h3 className="admin-status-card-title">{project.title}</h3>
                      <p className="admin-status-card-loc">
                        <FaMapMarkerAlt /> {project.location}
                      </p>
                    </div>
                    <span className="approval-badge pending">
                      <FaClock /> Pending Approval
                    </span>
                  </div>

                  <div className="admin-status-card-meta">
                    <span>
                      Type: <strong>{project.plotType || "Residential"}</strong>
                    </span>
                    <span>
                      Total Plots: <strong>{project.totalPlots}</strong>
                    </span>
                    <span>
                      Price: <strong>{project.plotPrice}</strong>
                    </span>
                  </div>

                  <div className="admin-status-waiting-msg">
                    <FaClock /> Waiting for Super Admin approval
                  </div>

                  <div className="admin-status-card-actions">
                    <button
                      type="button"
                      className="admin-status-action-btn"
                      onClick={() => navigate(`/admin/projects/${getProjectRouteSlug(project, projects)}/manage`)}
                    >
                      <FaEye /> View Plots
                    </button>
                    <button
                      type="button"
                      className="admin-status-action-btn"
                      onClick={() => navigate(`/admin/projects/${getProjectRouteSlug(project, projects)}/manage-details`)}
                    >
                      <FaCog /> Manage Details
                    </button>
                    <button
                      type="button"
                      className="admin-status-action-btn"
                      onClick={() => {
                        setSelectedProject(project);
                        setEditForm({
                          title: project.title,
                          location: project.location,
                          status: project.status,
                          plotPrice: project.plotPrice,
                          plotType: project.plotType,
                          totalPlots: project.totalPlots,
                          availablePlots: project.availablePlots,
                          reservedPlots: project.reservedPlots,
                          soldPlots: project.soldPlots,
                          launchDate: project.launchDate || "",
                        });
                      }}
                    >
                      <FaEdit /> Edit
                    </button>
                    <button
                      type="button"
                      className="admin-status-action-btn danger"
                      onClick={() => handleDeleteProject(project.id)}
                    >
                      <FaTrash /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* =====================================================
          REJECTED SECTION
        ===================================================== */}
        {rejectedProjects.length > 0 && (
          <section className="admin-status-section">
            <div className="admin-status-section-header rejected">
              <div>
                <h2>
                  <FaTimesCircle style={{ color: "#dc2626" }} />
                  Rejected Projects
                  <span className="count-pill">{rejectedProjects.length}</span>
                </h2>
                <p className="admin-status-section-desc">
                  These projects require changes requested by Super Admin. Review the reason, update the details, and resubmit for approval.
                </p>
              </div>
            </div>

            <div className="admin-status-grid">
              {rejectedProjects.map((project) => (
                <div key={project.id} className="admin-status-card rejected">
                  <div className="admin-status-card-top">
                    <div>
                      <h3 className="admin-status-card-title">{project.title}</h3>
                      <p className="admin-status-card-loc">
                        <FaMapMarkerAlt /> {project.location}
                      </p>
                    </div>
                    <span className="approval-badge rejected">
                      <FaTimesCircle /> Rejected
                    </span>
                  </div>

                  <div className="admin-status-card-meta">
                    <span>
                      Type: <strong>{project.plotType || "Residential"}</strong>
                    </span>
                    <span>
                      Total Plots: <strong>{project.totalPlots}</strong>
                    </span>
                    <span>
                      Price: <strong>{project.plotPrice}</strong>
                    </span>
                  </div>

                  {project.rejectionReason && (
                    <div className="admin-status-rejection-box">
                      <div className="admin-status-rejection-header">
                        <FaExclamationTriangle /> Reason for Rejection:
                      </div>
                      <p className="admin-status-rejection-reason">
                        {project.rejectionReason}
                      </p>
                    </div>
                  )}

                  <div className="admin-status-card-actions">
                    <button
                      type="button"
                      className="admin-status-action-btn primary"
                      onClick={() => navigate(`/admin/projects/${getProjectRouteSlug(project, projects)}/manage`)}
                    >
                      <FaThLarge /> Manage Plots
                    </button>
                    <button
                      type="button"
                      className="admin-status-action-btn"
                      onClick={() => {
                        setSelectedProject(project);
                        setEditForm({
                          title: project.title,
                          location: project.location,
                          status: project.status,
                          plotPrice: project.plotPrice,
                          plotType: project.plotType,
                          totalPlots: project.totalPlots,
                          availablePlots: project.availablePlots,
                          reservedPlots: project.reservedPlots,
                          soldPlots: project.soldPlots,
                          launchDate: project.launchDate || "",
                        });
                      }}
                    >
                      <FaEdit /> Edit &amp; Resubmit
                    </button>
                    <button
                      type="button"
                      className="admin-status-action-btn"
                      onClick={() => navigate(`/admin/projects/${getProjectRouteSlug(project, projects)}/manage-details`)}
                    >
                      <FaCog /> Manage Details
                    </button>
                    <button
                      type="button"
                      className="admin-status-action-btn danger"
                      onClick={() => handleDeleteProject(project.id)}
                    >
                      <FaTrash /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      {selectedProject && (
        <div className="project-modal-overlay">
          <div className="project-modal">

            <div className="project-modal-header">
              <h2>Edit Project</h2>

              <button
                type="button"
                onClick={() => setSelectedProject(null)}
              >
                <FaTimesCircle />
              </button>
            </div>

            <div className="project-form">

              <label>
                Project Name
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      title: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                Location
                <input
                  type="text"
                  value={editForm.location}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      location: sanitizeTextNoDigits(e.target.value),
                    })
                  }
                />
              </label>

              <label>
                Status

                <div className="custom-status-select">

                  <button
                    type="button"
                    className="custom-status-trigger"
                    onClick={() =>
                      setStatusDropdownOpen(!statusDropdownOpen)
                    }
                  >
                    <span>{editForm.status}</span>

                    <FaChevronDown
                      className={
                        statusDropdownOpen
                          ? "status-chevron open"
                          : "status-chevron"
                      }
                    />
                  </button>

                  {statusDropdownOpen && (
                    <div className="custom-status-options">

                      <button
                        type="button"
                        className={editForm.status === "Active" ? "selected" : ""}
                        onClick={() => {
                          setEditForm({
                            ...editForm,
                            status: "Active",
                          });

                          setStatusDropdownOpen(false);
                        }}
                      >
                        Active
                      </button>

                      <button
                        type="button"
                        className={editForm.status === "Completed" ? "selected" : ""}
                        onClick={() => {
                          setEditForm({
                            ...editForm,
                            status: "Completed",
                          });

                          setStatusDropdownOpen(false);
                        }}
                      >
                        Completed
                      </button>

                      <button
                        type="button"
                        className={editForm.status === "Upcoming" ? "selected" : ""}
                        onClick={() => {
                          setEditForm({
                            ...editForm,
                            status: "Upcoming",
                          });

                          setStatusDropdownOpen(false);
                        }}
                      >
                        Upcoming
                      </button>

                    </div>
                  )}

                </div>
              </label>

              <label>
                Plot Type
                <CustomDropdown
                  value={editForm.plotType}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      plotType: e.target.value,
                    })
                  }
                >
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Agriculture">Agriculture</option>
                  <option value="Villa Plot">Villa Plot</option>
                </CustomDropdown>
              </label>
              <label>
                Plot Price
                <InputWithUnit
                  value={editForm.plotPrice}
                  onChange={(e) => setEditForm({ ...editForm, plotPrice: e })}
                  placeholder="e.g. 8.5"
                  suffix="Lakh"
                  sanitize={sanitizePlotPrice}
                />
              </label>

              <label>
                Total Plots
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.totalPlots}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      totalPlots: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                Available Plots
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.availablePlots}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      availablePlots: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                Reserved Plots
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.reservedPlots}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      reservedPlots: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                Sold Plots

                <input
                  type="number"
                  min="0"
                  max={Math.max(
                    0,
                    editTotal - editAvailable - editReserved
                  )}
                  value={editForm.soldPlots}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      soldPlots: e.target.value,
                    })
                  }
                />

                {editTotal > 0 && (
                  <span
                    className={
                      editPlotsValid
                        ? "plot-helper-text"
                        : "plot-helper-text error"
                    }
                  >
                    {editPlotsValid
                      ? "Plot count is valid"
                      : `Maximum sold plots: ${Math.max(
                        0,
                        editTotal - editAvailable - editReserved
                      )}`}
                  </span>
                )}
              </label>
              <label>
                Launch Date
                <input
                  type="date"
                  value={editForm.launchDate}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      launchDate: e.target.value,
                    })
                  }
                />
              </label>
              <div className="project-modal-actions">
                <button
                  type="button"
                  className="project-cancel-btn"
                  onClick={() => setSelectedProject(null)}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="project-save-btn"
                  onClick={handleSaveProject}
                  disabled={!editPlotsValid}
                >
                  Save Changes
                </button>
              </div>
            </div>

          </div>
        </div>
      )}


      {/* CONFIRM PROJECT DELETION MODAL */}
      <ConfirmationModal
        isOpen={Boolean(projectToDelete)}
        title={
          projectToDelete?.approvalStatus === "APPROVED"
            ? "Request Project Deletion?"
            : `Delete "${projectToDelete?.title || "Project"}"?`
        }
        message={
          projectToDelete?.approvalStatus === "APPROVED"
            ? `Are you sure you want to request deletion of "${projectToDelete?.title || "this project"}"?`
            : `Are you sure you want to permanently delete "${projectToDelete?.title || "this project"}"?`
        }
        subMessage={
          projectToDelete?.approvalStatus === "APPROVED"
            ? "Since this project is published, your deletion request will be sent to the Super Administrator for approval before permanent removal."
            : "This action cannot be undone. The project and all associated plot records will be deleted."
        }
        confirmText={
          projectToDelete?.approvalStatus === "APPROVED"
            ? "Submit Deletion Request"
            : "Delete Project"
        }
        type="danger"
        isLoading={isDeleting}
        onCancel={() => setProjectToDelete(null)}
        onConfirm={confirmDeleteProject}
      />

      {/* NOTICE / VALIDATION MODAL */}
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

    </>
  );
};

export default Projects;