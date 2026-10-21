import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "../../context/ProjectContext";
import { usePlots } from "../../context/PlotContext";
import { FaArrowLeft, FaSave, FaPlus, FaTrash, FaExclamationCircle } from "react-icons/fa";
import {
  commonBenefits,
  AVAILABLE_BENEFITS,
  DEFAULT_NEW_PROJECT_BENEFITS,
  AVAILABLE_HIGHLIGHTS,
  AVAILABLE_AMENITIES,
  DEFAULT_NEW_PROJECT_HIGHLIGHTS,
  DEFAULT_NEW_PROJECT_AMENITIES,
} from "../../data/projects";
import { useAdminProfile } from "../context/AdminProfileContext";
import { useNotifications } from "../context/NotificationContext";
import CustomDropdown from "../components/CustomDropdown";
import "../styles/admin-project-form.css";

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
 * Examples:
 *   "8.5" + "Lakh" -> "8.5 Lakh"
 *   "12" + "Acres" -> "12 Acres"
 *   "600 – 2400" + "Sq.ft" -> "600 – 2400 Sq.ft"
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
 * Sanitize project size input - allow only digits and single decimal point
 * "12abc" -> "12", "12.5abc" -> "12.5"
 */
const sanitizeProjectSize = (value) => {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  return parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
};

/**
 * Sanitize plot sizes input - allow digits, spaces, hyphens, en-dash
 * "600 - 2400" -> "600 - 2400", "600abc" -> "600"
 */
const sanitizePlotSizes = (value) => value.replace(/[^0-9\s\-–]/g, '');

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

const AdminProjectForm = () => {
  const navigate = useNavigate();
  const {
    projects,
    setProjects,
    createProject,
    updateProject,
    getNextProjectId,
    validateProject,
    parsePriceLakhs,
    isValidPlotPrice,
  } = useProjects();
  const { plots, setPlots, getNextPlotIndex } = usePlots();
  const { profile, isSubscriptionExpired } = useAdminProfile();
  const { addNotification } = useNotifications();

  const [isEditing, setIsEditing] = useState(false);
  const [projectId, setProjectId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  const [form, setForm] = useState({
    title: "",
    location: "",
    city: "",
    category: "Residential",
    budget: "below10",
    status: "Active",
    plotPrice: "",
    plotType: "Residential",
    plotSizes: "",
    distance: "",
    projectSize: "",
    totalPlots: "",
    availablePlots: "",
    reservedPlots: "",
    soldPlots: "",
    launchDate: "",
    details: "",
    image: "",
    defaultPlotImage: "",
    images: [],
    about: { description: "" },
    locationConnectivity: [{ name: "", distance: "" }],
    benefits: DEFAULT_NEW_PROJECT_BENEFITS,
    highlights: DEFAULT_NEW_PROJECT_HIGHLIGHTS,
    amenities: DEFAULT_NEW_PROJECT_AMENITIES,
  });

  const total = Number(form.totalPlots) || 0;
  const available = Number(form.availablePlots) || 0;
  const reserved = Number(form.reservedPlots) || 0;
  const sold = Number(form.soldPlots) || 0;

  const plotsValid =
    total > 0 &&
    available >= 0 &&
    reserved >= 0 &&
    sold >= 0 &&
    available + reserved + sold === total;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId) {
      const project = projects.find((p) => String(p.id) === String(editId));
      if (project) {
        setIsEditing(true);
        setProjectId(project.id);
        // Extract raw values for fields with fixed suffixes
        const rawPlotPrice = extractValue(project.plotPrice, "Lakh");
        const rawProjectSize = extractValue(project.projectSize, "Acres");
        const rawPlotSizes = extractValue(project.plotSizes, "Sq.ft");
        
        setForm({
          title: project.title,
          location: project.location,
          city: project.city || "",
          category: project.category || "Residential",
          budget: project.budget || "below10",
          status: project.status,
          plotPrice: rawPlotPrice,
          plotType: project.plotType,
          plotSizes: rawPlotSizes,
          distance: project.distance || "",
          projectSize: rawProjectSize,
          totalPlots: project.totalPlots,
          availablePlots: project.availablePlots,
          reservedPlots: project.reservedPlots,
          soldPlots: project.soldPlots,
          launchDate: project.launchDate || "",
          details: project.details || "",
          image: project.image || "",
          defaultPlotImage: project.defaultPlotImage || "",
          images: project.images || [],
          about: project.about || { description: ""},
          locationConnectivity: project.locationConnectivity || [{ name: "", distance: "" }],
          // For existing projects: load saved array directly, never overwrite with default options
          benefits: Array.isArray(project.benefits) ? project.benefits : [],
          highlights: Array.isArray(project.highlights) ? project.highlights : [],
          amenities: Array.isArray(project.amenities) ? project.amenities : [],
        });
      }
    }
  }, [projects]);

  const updateArrayField = (fieldName, index, value) => {
    setForm((prev) => {
      const newArray = [...prev[fieldName]];
      newArray[index] = value;
      return { ...prev, [fieldName]: newArray };
    });
  };

  const addArrayItem = (fieldName, newItem) => {
    setForm((prev) => ({
      ...prev,
      [fieldName]: [...prev[fieldName], newItem],
    }));
  };

  const removeArrayItem = (fieldName, index) => {
    setForm((prev) => {
      const newArray = prev[fieldName].filter((_, i) => i !== index);
      return { ...prev, [fieldName]: newArray };
    });
  };

  const updateObjectField = (fieldName, key, value) => {
    setForm((prev) => ({
      ...prev,
      [fieldName]: { ...prev[fieldName], [key]: value },
    }));
  };

  const handleToggleBenefit = (benefitObj) => {
    setForm((prev) => {
      const current = Array.isArray(prev.benefits) ? prev.benefits : [];
      const exists = current.some((b) => b.title === benefitObj.title);
      const updated = exists
        ? current.filter((b) => b.title !== benefitObj.title)
        : [...current, benefitObj];
      return { ...prev, benefits: updated };
    });
  };

  const handleToggleHighlight = (item) => {
    setForm((prev) => {
      const current = Array.isArray(prev.highlights) ? prev.highlights : [];
      const updated = current.includes(item)
        ? current.filter((h) => h !== item)
        : [...current, item];
      return { ...prev, highlights: updated };
    });
  };

  const handleToggleAmenity = (item) => {
    setForm((prev) => {
      const current = Array.isArray(prev.amenities) ? prev.amenities : [];
      const updated = current.includes(item)
        ? current.filter((a) => a !== item)
        : [...current, item];
      return { ...prev, amenities: updated };
    });
  };

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
    
    // Get existing plots for this project, sorted by their index
    const existingProjectPlots = currentPlots
      .filter((p) => p.projectId === currentProjectId)
      .sort((a, b) => getPlotIndex(a, currentProjectId) - getPlotIndex(b, currentProjectId));
    
    // Other projects' plots remain unchanged
    let updatedPlots = currentPlots.filter((p) => p.projectId !== currentProjectId);
    
    const existingCount = existingProjectPlots.length;
    const retainCount = Math.min(existingCount, newTotal);
    
    // Retain existing plots (preserve their exact IDs and all data)
    const retainedPlots = existingProjectPlots.slice(0, retainCount);
    
    // Count current statuses among retained plots
    let currentAvailable = retainedPlots.filter(p => p.status === "Available").length;
    let currentReserved = retainedPlots.filter(p => p.status === "Reserved").length;
    let currentSold = retainedPlots.filter(p => p.status === "Sold").length;
    
    // We may need to adjust statuses of retained plots to match required counts
    // Strategy: preserve existing statuses as much as possible, only change when necessary
    // First, try to meet requirements by changing status of retained plots (minimal change)
    // Only add new plots if we need more total plots than we have retained
    
    const plotsToAdjust = [...retainedPlots]; // mutable copy for status adjustments
    
    // Helper to change a plot's status
    const changePlotStatus = (plot, newStatus) => ({
      ...plot,
      status: newStatus
    });
    
    // Adjust statuses among retained plots to get closer to target
    // Priority: don't change status if already correct; change excess to deficit
    
    // If we have too many Available, change some to Reserved/Sold as needed
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
    
    // If we have too many Reserved
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
    
    // If we have too many Sold
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
    
    // Now add new plots if we still need more total plots
    const newPlots = [];
    let nextIndex = existingCount > 0 ? 
      Math.max(...existingProjectPlots.map(p => getPlotIndex(p, currentProjectId))) + 1 : 1;
    
    // Add Available plots
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
    
    // Add Reserved plots
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
    
    // Add Sold plots
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
    
    // Combine: other projects + adjusted retained + new plots
    updatedPlots = [...updatedPlots, ...plotsToAdjust, ...newPlots];
    return updatedPlots;
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubscriptionExpired) {
      alert("Your organization's workspace subscription has expired. Creating or updating projects is restricted. Please contact your Super Administrator.");
      return;
    }

    const validation = validateProject(form, projects, isEditing ? projectId : null);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      setMessage({ type: "error", text: validation.errors.join(". ") });
      return;
    }

    // Validate plotPrice format (check combined value with suffix)
    const combinedPlotPrice = combineWithSuffix(form.plotPrice, "Lakh");
    if (!isValidPlotPrice(combinedPlotPrice)) {
      const errorMsg = "Invalid plot price format. Use format like '8.5 Lakh', '12 Lakh', or '₹12.5 Lakh'";
      setValidationErrors([errorMsg]);
      setMessage({ type: "error", text: errorMsg });
      return;
    }

    setValidationErrors([]);
    setSaving(true);
    setMessage(null);

    const newTotal = Number(form.totalPlots);
    const newAvailable = Number(form.availablePlots);
    const newReserved = Number(form.reservedPlots);
    const newSold = Number(form.soldPlots);

    try {
      if (isEditing) {
        const existingProject = projects.find((p) => p.id === projectId);
        const inventoryChanged =
          existingProject.totalPlots !== newTotal ||
          existingProject.availablePlots !== newAvailable ||
          existingProject.reservedPlots !== newReserved ||
          existingProject.soldPlots !== newSold;

        const updatePayload = {
          title: form.title.trim(),
          location: form.location.trim(),
          city: form.city,
          category: form.category,
          budget: form.budget,
          status: form.status,
          image: form.image || (form.images && form.images[0]) || "",
          defaultPlotImage: form.defaultPlotImage ? form.defaultPlotImage.trim() : "",
          plotPrice: combineWithSuffix(form.plotPrice, "Lakh"),
          priceLakhs: parsePriceLakhs(combineWithSuffix(form.plotPrice, "Lakh")),
          plotType: form.plotType,
          plotSizes: combineWithSuffix(form.plotSizes, "Sq.ft"),
          distance: form.distance,
          projectSize: combineWithSuffix(form.projectSize, "Acres"),
          totalPlots: newTotal,
          availablePlots: newAvailable,
          reservedPlots: newReserved,
          soldPlots: newSold,
          launchDate: form.launchDate,
          details: form.details,
          images: form.images,
          about: form.about,
          locationConnectivity: form.locationConnectivity,
          benefits: form.benefits,
          highlights: form.highlights,
          amenities: form.amenities,
        };

        if (updateProject) {
          await updateProject(projectId, updatePayload);
        }

        const updatedProjects = projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                ...updatePayload,
              }
            : p
        );
        setProjects(updatedProjects);

        if (inventoryChanged) {
          const updatedPlots = syncPlotsForProject(
            projectId,
            newTotal,
            newAvailable,
            newReserved,
            newSold,
            plots,
            form.plotType,
            form.plotPrice
          );
          setPlots(updatedPlots);
        }

        if (profile?.role !== "Super Administrator") {
          addNotification({
            recipient: "super_admin",
            type: "PROJECT_UPDATED",
            title: "Project Details Updated",
            message: `${profile?.name || "Normal Admin"} updated project "${form.title}" (${form.location || form.city || "Tamil Nadu"}).`,
            actorName: profile?.name || "Normal Admin",
            projectId: projectId,
          });
        }

        setMessage({ type: "success", text: "Project updated successfully!" });
        setTimeout(() => {
          navigate("/admin/projects");
        }, 600);
      } else {
        const priceLakhsValue = parsePriceLakhs(form.plotPrice);
        const newProjectPayload = {
          title: form.title.trim(),
          location: form.location.trim(),
          city: form.city || (form.location ? form.location.split(",")[0].trim() : "Tamil Nadu"),
          category: form.category,
          budget: form.budget,
          status: form.status,
          image: form.image || (form.images && form.images[0]) || "",
          defaultPlotImage: form.defaultPlotImage ? form.defaultPlotImage.trim() : "",
          plotType: form.plotType,
          plotPrice: combineWithSuffix(form.plotPrice, "Lakh"),
          priceLakhs: priceLakhsValue,
          plotSizes: combineWithSuffix(form.plotSizes, "Sq.ft"),
          distance: form.distance,
          projectSize: combineWithSuffix(form.projectSize, "Acres"),
          totalPlots: newTotal,
          availablePlots: newAvailable,
          reservedPlots: newReserved,
          soldPlots: newSold,
          launchDate: form.launchDate || "Not announced",
          details: form.details,
          images: form.images,
          benefits: form.benefits,
          about: form.about,
          highlights: form.highlights,
          amenities: form.amenities,
          locationConnectivity: form.locationConnectivity,
        };

        const res = await createProject(newProjectPayload);
        const createdProject = res?.project || res?.data;
        const targetId = createdProject?.id || createdProject?.customId || createdProject?._id;

        if (profile?.role !== "Super Administrator") {
          addNotification({
            recipient: "super_admin",
            type: "PROJECT_CREATED",
            title: "New Project Added",
            message: `${profile?.name || "Normal Admin"} added new project "${form.title}" in ${form.location || form.city || "Tamil Nadu"} with ${newTotal} plots.`,
            actorName: profile?.name || "Normal Admin",
            projectId: targetId,
          });
        }

        setMessage({ type: "success", text: "Project created and saved to database successfully!" });
        setTimeout(() => {
          navigate(`/admin/projects/${targetId}/manage`);
        }, 600);
      }
    } catch (err) {
      console.error("[AdminProjectForm] Submit error:", err);
      setMessage({ type: "error", text: err.message || "Failed to save project. Please check required fields." });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate("/admin/projects");
  };

  return (
    <div className="admin-project-form-page">
      <div className="form-header">
        <button className="back-btn" onClick={handleCancel}>
          <FaArrowLeft /> Back to Projects
        </button>
        <h1>{isEditing ? "Edit Project" : "Add New Project"}</h1>
      </div>

      {message && (
        <div className={`form-message ${message.type}`}>
          {message.text}
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="form-message error">
          <FaExclamationCircle />
          <ul style={{ margin: "0.5rem 0 0 1.5rem", padding: 0 }}>
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="project-form" noValidate>
        <section className="form-section">
          <h2>Basic Information</h2>
          <div className="form-grid">
            <label>
              Project Title *
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label>
              Location *
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: sanitizeTextNoDigits(e.target.value) })}
                required
              />
            </label>
            <label>
              City
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: sanitizeTextNoDigits(e.target.value) })}
              />
            </label>
            <label>
              Category
              <CustomDropdown
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Agriculture">Agriculture</option>
              </CustomDropdown>
            </label>
            <label>
              Budget Range
              <CustomDropdown
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              >
                <option value="below10">Below ₹10 Lakh</option>
                <option value="10-25">₹10 - ₹25 Lakh</option>
                <option value="25-50">₹25 - ₹50 Lakh</option>
                <option value="above50">Above ₹50 Lakh</option>
              </CustomDropdown>
            </label>
            <label>
              Status
              <CustomDropdown
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="Upcoming">Upcoming</option>
              </CustomDropdown>
            </label>
            <label>
              Plot Type
              <CustomDropdown
                value={form.plotType}
                onChange={(e) => setForm({ ...form, plotType: e.target.value })}
              >
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Agriculture">Agriculture</option>
                <option value="Villa Plot">Villa Plot</option>
              </CustomDropdown>
            </label>
            <label>
              Plot Price *
              <InputWithUnit
                value={form.plotPrice}
                onChange={(e) => setForm({ ...form, plotPrice: e })}
                placeholder="e.g. 8.5"
                suffix="Lakh"
                sanitize={sanitizePlotPrice}
                required
              />
            </label>
          </div>
        </section>

        <section className="form-section">
          <h2>Project Details</h2>
          <div className="form-grid">
            <label>
              Project Size
              <InputWithUnit
                value={form.projectSize}
                onChange={(e) => setForm({ ...form, projectSize: e })}
                placeholder="e.g. 12"
                suffix="Acres"
                sanitize={sanitizeProjectSize}
              />
            </label>
            <label>
              Plot Sizes
              <InputWithUnit
                value={form.plotSizes}
                onChange={(e) => setForm({ ...form, plotSizes: e })}
                placeholder="e.g. 600 – 2400"
                suffix="Sq.ft"
                sanitize={sanitizePlotSizes}
              />
            </label>
            <label>
              Distance
              <input
                type="text"
                value={form.distance}
                onChange={(e) => setForm({ ...form, distance: e.target.value })}
                placeholder="e.g. 2 km to NH"
              />
            </label>
            <label>
              Launch Date
              <input
                type="date"
                value={form.launchDate}
                onChange={(e) => setForm({ ...form, launchDate: e.target.value })}
              />
            </label>
          </div>
        </section>

        <section className="form-section">
          <h2>Plot Summary *</h2>
          <div className="form-grid plots-grid">
            <label>
              Total Plots
              <input
                type="number"
                min="1"
                step="1"
                value={form.totalPlots}
                onChange={(e) => setForm({ ...form, totalPlots: e.target.value })}
              />
            </label>
            <label>
              Available
              <input
                type="number"
                min="0"
                step="1"
                value={form.availablePlots}
                onChange={(e) => setForm({ ...form, availablePlots: e.target.value })}
              />
            </label>
            <label>
              Reserved
              <input
                type="number"
                min="0"
                step="1"
                value={form.reservedPlots}
                onChange={(e) => setForm({ ...form, reservedPlots: e.target.value })}
              />
            </label>
            <label>
              Sold
              <input
                type="number"
                min="0"
                step="1"
                value={form.soldPlots}
                onChange={(e) => setForm({ ...form, soldPlots: e.target.value })}
              />
            </label>
          </div>
          {!plotsValid && total > 0 && (
            <div className="validation-error">
              Available + Reserved + Sold must equal Total Plots
            </div>
          )}
          {plotsValid && total > 0 && (
            <div className="validation-success">
              Plot counts are valid ✓
            </div>
          )}
        </section>

        <section className="form-section">
          <h2>Project Hero Description</h2>
         
          <label className="full-width">
            <textarea
              value={form.details}
              maxLength={300}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              rows={4}
              placeholder="Short overview description for the top hero area..."
            />
            <div className="char-counter-row">
              <span className={`char-counter ${(form.details || "").length >= 300 ? "limit-reached" : (form.details || "").length > 250 ? "warning" : ""}`}>
                {(form.details || "").length} / 300 characters
              </span>
            </div>
          </label>
        </section>

        <section className="form-section">
          <h2>About The Project Section</h2>
         
          <label className="full-width">
            Main Description
            <textarea
              value={form.about?.description || ""}
              maxLength={300}
              onChange={(e) => updateObjectField("about", "description", e.target.value)}
              rows={4}
              placeholder="Main description for 'About The Project' section on client website..."
            />
            <div className="char-counter-row">
              <span className={`char-counter ${(form.about?.description || "").length >= 300 ? "limit-reached" : (form.about?.description || "").length > 250 ? "warning" : ""}`}>
                {(form.about?.description || "").length} / 300 characters
              </span>
            </div>
          </label>
        </section>

        <section className="form-section">
          <h2>Project Cover & Gallery Images</h2>
          <label className="full-width" style={{ marginBottom: "1.25rem" }}>
            Cover Image URL (Shows on Project Card)
            <input
              type="url"
              placeholder="e.g. https://images.unsplash.com/..."
              value={form.image}
              onChange={(e) => {
                const val = e.target.value;
                setForm((prev) => {
                  const newImgs = [...prev.images];
                  if (val) {
                    if (newImgs.length === 0) newImgs.push(val);
                    else newImgs[0] = val;
                  }
                  return { ...prev, image: val, images: newImgs };
                });
              }}
            />
          </label>
          {form.image && (
            <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              <img
                src={form.image}
                alt="Cover preview"
                style={{ width: "200px", height: "120px", objectFit: "cover", borderRadius: "8px", border: "1px solid #ddd" }}
                onError={(e) => { e.target.style.display = "none"; }}
                onLoad={(e) => { e.target.style.display = "block"; }}
              />
              <span style={{ fontSize: "0.85rem", color: "#666" }}>Preview of card cover image</span>
            </div>
          )}

          <label className="full-width" style={{ marginBottom: "1.25rem" }}>
            Default Plot Image URL (Applies to all plots created in this project)
            <input
              type="url"
              placeholder="e.g. https://images.unsplash.com/..."
              value={form.defaultPlotImage}
              onChange={(e) => setForm({ ...form, defaultPlotImage: e.target.value })}
            />
            <small style={{ color: "#64748b", display: "block", marginTop: "4px" }}>
              If left blank, plots will automatically inherit the project cover image above.
            </small>
          </label>
          {form.defaultPlotImage && (
            <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              <img
                src={form.defaultPlotImage}
                alt="Default plot preview"
                style={{ width: "200px", height: "120px", objectFit: "cover", borderRadius: "8px", border: "1px solid #ddd" }}
                onError={(e) => { e.target.style.display = "none"; }}
                onLoad={(e) => { e.target.style.display = "block"; }}
              />
              <span style={{ fontSize: "0.85rem", color: "#666" }}>Preview of default plot image</span>
            </div>
          )}

          <label className="full-width">
            Gallery Images (One per line)
            <textarea
              value={form.images.join("\n")}
              onChange={(e) => {
                const urls = e.target.value.split("\n").filter((url) => url.trim());
                setForm((prev) => ({
                  ...prev,
                  images: urls,
                  image: urls[0] || prev.image,
                }));
              }}
              rows={4}
              placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
            />
            <small>One image URL per line. The first image will be used as the cover image.</small>
          </label>
        </section>

        {/* Benefits Section */}
        <section className="form-section">
          <div className="checkbox-section-header">
            <h2>Project Benefits (Why Choose Us)</h2>
            <span className={`checkbox-count-badge ${form.benefits.length > 0 ? "has-selected" : ""}`}>
              {form.benefits.length} selected
            </span>
          </div>
          <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b" }}>
            Select the key benefits displayed in the &quot;Benefits of Project&quot; section on the client site.
          </p>
          <div className="checkbox-group-grid">
            {AVAILABLE_BENEFITS.map((benefit) => {
              const isChecked = form.benefits.some((b) => b.title === benefit.title);
              return (
                <label key={benefit.title} className={`checkbox-card has-desc ${isChecked ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleBenefit(benefit)}
                  />
                  <div className="checkbox-content-wrap">
                    <span className="checkbox-title">{benefit.title}</span>
                    <span className="checkbox-desc">{benefit.description}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {/* Highlights Section */}
        <section className="form-section">
          <div className="checkbox-section-header">
            <h2>Project Highlights</h2>
            <span className={`checkbox-count-badge ${form.highlights.length > 0 ? "has-selected" : ""}`}>
              {form.highlights.length} selected
            </span>
          </div>
          <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b" }}>
            Select key selling points and verified features for this project.
          </p>
          <div className="checkbox-group-grid">
            {AVAILABLE_HIGHLIGHTS.map((item) => {
              const isChecked = form.highlights.includes(item);
              return (
                <label key={item} className={`checkbox-card ${isChecked ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleHighlight(item)}
                  />
                  <span className="checkbox-label-text">{item}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Amenities Section */}
        <section className="form-section">
          <div className="checkbox-section-header">
            <h2>Project Amenities</h2>
            <span className={`checkbox-count-badge ${form.amenities.length > 0 ? "has-selected" : ""}`}>
              {form.amenities.length} selected
            </span>
          </div>
          <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b" }}>
            Select verified amenities available in this layout or gated community.
          </p>
          <div className="checkbox-group-grid">
            {AVAILABLE_AMENITIES.map((item) => {
              const isChecked = form.amenities.includes(item);
              return (
                <label key={item} className={`checkbox-card ${isChecked ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleAmenity(item)}
                  />
                  <span className="checkbox-label-text">{item}</span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="form-section">
          <h2>Location & Connectivity</h2>
          {form.locationConnectivity.map((loc, index) => (
            <div key={index} className="array-row">
              <input
                type="text"
                placeholder="Name (e.g. Airport, School)"
                value={loc.name}
                onChange={(e) =>
                  updateArrayField("locationConnectivity", index, { ...loc, name: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="Distance (e.g., 15 km)"
                value={loc.distance}
                onChange={(e) =>
                  updateArrayField("locationConnectivity", index, { ...loc, distance: e.target.value })
                }
              />
              {form.locationConnectivity.length > 1 && (
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => removeArrayItem("locationConnectivity", index)}
                >
                  <FaTrash />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="add-btn"
            onClick={() =>
              addArrayItem("locationConnectivity", { name: "", distance: "" })
            }
          >
            <FaPlus /> Add Location
          </button>
        </section>

        <div className="form-actions">
          <button type="button" className="cancel-btn" onClick={handleCancel}>
            Cancel
          </button>
          <button type="submit" className="save-btn" disabled={saving || !plotsValid}>
            {saving ? "Saving..." : (<> <FaSave /> Save Project </>)}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminProjectForm;