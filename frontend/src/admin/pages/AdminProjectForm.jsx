import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "../../context/ProjectContext";
import { usePlots } from "../../context/PlotContext";
import {
  FaArrowLeft,
  FaSave,
  FaPlus,
  FaTrash,
  FaExclamationCircle,
  FaCloudUploadAlt,
  FaImage,
  FaSpinner,
  FaTimes,
  FaLayerGroup,
} from "react-icons/fa";
import { adminApi } from "../../services/api";
import { resolveImageUrl } from "../../utils/imageUrl";
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

  const maxProjects = profile?.projectQuota?.maxProjects ?? 10;
  const usedProjects = profile?.projectQuota?.usedProjects ?? (projects ? projects.filter((p) => !p.isArchived).length : 0);
  const remainingProjects = profile?.projectQuota?.remainingProjects ?? Math.max(0, maxProjects - usedProjects);
  const isUnlimitedProjects = Boolean(profile?.projectQuota?.isUnlimitedProjects || maxProjects >= 999999);
  const isProjectLimitReached = Boolean(profile?.projectQuota?.isLimitReached || (!isUnlimitedProjects && remainingProjects <= 0));

  const [isEditing, setIsEditing] = useState(false);
  const [projectId, setProjectId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  const [form, setForm] = useState({
    title: "",
    location: "",
    category: "Residential",
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

  // Auto-populate location from branch (read-only)
  useEffect(() => {
    if (profile?.branch?.city) {
      const branchLocation = profile.branch.region
        ? `${profile.branch.city}, ${profile.branch.region}`
        : profile.branch.city;
      setForm((prev) => ({ ...prev, location: branchLocation }));
    }
  }, [profile?.branch]);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ── Default Plot Image Upload Handling ──
  const [isUploadingPlotImage, setIsUploadingPlotImage] = useState(false);
  const [isPlotDragOver, setIsPlotDragOver] = useState(false);
  const plotFileInputRef = useRef(null);

  const handleImageFileChange = async (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please select a valid image file (PNG, JPG, or WebP)." });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setMessage({ type: "error", text: "Image file size exceeds the 20MB limit." });
      return;
    }

    setIsUploadingImage(true);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target.result;
      const img = new Image();
      img.onload = async () => {
        const detectedWidth = img.naturalWidth || 1200;
        const detectedHeight = img.naturalHeight || 800;

        try {
          const targetId = projectId || "new";
          const res = await adminApi.uploadProjectImage(
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
            setForm((prev) => {
              const newImgs = [...prev.images];
              if (newImgs.length === 0) newImgs.push(uploadedUrl);
              else newImgs[0] = uploadedUrl;
              return { ...prev, image: uploadedUrl, images: newImgs };
            });
            setMessage({ type: "success", text: "Project layout / cover image uploaded successfully!" });
          } else {
            setMessage({ type: "error", text: res?.message || "Failed to upload image." });
          }
        } catch (err) {
          console.error("Upload error:", err);
          setMessage({ type: "error", text: err.data?.message || err.message || "Upload failed." });
        } finally {
          setIsUploadingImage(false);
        }
      };
      img.onerror = () => {
        setIsUploadingImage(false);
        setMessage({ type: "error", text: "Failed to read image dimensions." });
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setIsUploadingImage(false);
      setMessage({ type: "error", text: "Failed to read image file." });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setForm((prev) => {
      const newImgs = [...prev.images];
      if (newImgs.length > 0 && newImgs[0] === prev.image) {
        newImgs.shift();
      }
      return { ...prev, image: "", images: newImgs };
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePlotImageFileChange = async (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please select a valid image file (PNG, JPG, or WebP) for the plot image." });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setMessage({ type: "error", text: "Plot image file size exceeds the 20MB limit." });
      return;
    }

    setIsUploadingPlotImage(true);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target.result;
      const img = new Image();
      img.onload = async () => {
        const detectedWidth = img.naturalWidth || 1200;
        const detectedHeight = img.naturalHeight || 800;

        try {
          const targetId = projectId || "new";
          const res = await adminApi.uploadProjectImage(
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
            setForm((prev) => ({ ...prev, defaultPlotImage: uploadedUrl }));
            setMessage({ type: "success", text: "Default plot image uploaded successfully!" });
          } else {
            setMessage({ type: "error", text: res?.message || "Failed to upload plot image." });
          }
        } catch (err) {
          console.error("Upload plot image error:", err);
          setMessage({ type: "error", text: err.data?.message || err.message || "Upload plot image failed." });
        } finally {
          setIsUploadingPlotImage(false);
        }
      };
      img.onerror = () => {
        setIsUploadingPlotImage(false);
        setMessage({ type: "error", text: "Failed to read plot image dimensions." });
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setIsUploadingPlotImage(false);
      setMessage({ type: "error", text: "Failed to read plot image file." });
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePlotImage = () => {
    setForm((prev) => ({ ...prev, defaultPlotImage: "" }));
    if (plotFileInputRef.current) {
      plotFileInputRef.current.value = "";
    }
  };

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
        
        // Location is auto-set from branch (read-only), not from project
        // City and Budget are no longer in form - they come from branch context
        setForm({
          title: project.title,
          location: project.location, // Kept for reference but will be overridden by branch
          category: project.category || "Residential",
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
      if (!exists && current.length >= 4) {
        setMessage({ type: "error", text: "You can select a maximum of 4 project benefits (Why Choose Us)." });
        return prev;
      }
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
      const exists = current.includes(item);
      if (!exists && current.length >= 8) {
        setMessage({ type: "error", text: "You can select a maximum of 8 project amenities." });
        return prev;
      }
      const updated = exists
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

    // Build location and city from branch (read-only)
    const branchCity = profile?.branch?.city || "";
    const branchRegion = profile?.branch?.region || "";
    const branchLocation = branchRegion ? `${branchCity}, ${branchRegion}` : branchCity;

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

        const coverImageUrl = form.image || (form.images && form.images[0]) || "";
        const updatePayload = {
          title: form.title.trim(),
          location: branchLocation,
          city: branchCity,
          category: form.category,
          status: form.status,
          image: coverImageUrl,
          ...(coverImageUrl
            ? {
                layout: existingProject?.layout
                  ? { ...existingProject.layout, imageUrl: coverImageUrl, referenceImageUrl: coverImageUrl }
                  : { imageUrl: coverImageUrl, referenceImageUrl: coverImageUrl },
              }
            : {}),
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
            message: `${profile?.name || "Branch Admin"} updated project "${form.title}" (${branchLocation || "Tamil Nadu"}).`,
            actorName: profile?.name || "Branch Admin",
            projectId: projectId,
          });
        }

        setMessage({ type: "success", text: "Project updated successfully!" });
        setTimeout(() => {
          navigate("/admin/projects");
        }, 600);
      } else {
        const priceLakhsValue = parsePriceLakhs(form.plotPrice);
        const coverImageUrl = form.image || (form.images && form.images[0]) || "";
        const newProjectPayload = {
          title: form.title.trim(),
          location: branchLocation,
          city: branchCity,
          category: form.category,
          status: form.status,
          image: coverImageUrl,
          ...(coverImageUrl
            ? { layout: { imageUrl: coverImageUrl, referenceImageUrl: coverImageUrl } }
            : {}),
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
            message: `${profile?.name || "Branch Admin"} added new project "${form.title}" in ${branchLocation || "Tamil Nadu"} with ${newTotal} plots.`,
            actorName: profile?.name || "Branch Admin",
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
      <div className="form-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button className="back-btn" onClick={handleCancel}>
            <FaArrowLeft /> Back to Projects
          </button>
          <h1>{isEditing ? "Edit Project" : "Add New Project"}</h1>
        </div>

        {/* Project Quota Limit Banner */}
        {!isEditing && (
          <div
            style={{
              background: isProjectLimitReached ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${isProjectLimitReached ? "#fecaca" : "#bbf7d0"}`,
              borderRadius: "12px",
              padding: "10px 16px",
              display: "inline-flex",
              alignItems: "center",
              gap: "12px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: isProjectLimitReached ? "#fee2e2" : "#dcfce7",
                color: isProjectLimitReached ? "#dc2626" : "#16a34a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                flexShrink: 0,
              }}
            >
              <FaLayerGroup />
            </div>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: isProjectLimitReached ? "#991b1b" : "#15803d" }}>
                Organization Project Quota
              </div>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#1e293b", marginTop: "1px" }}>
                {isUnlimitedProjects ? (
                  <span>Unlimited Projects Available</span>
                ) : (
                  <span>
                    <strong>{usedProjects}</strong> / <strong>{maxProjects}</strong> Projects Used{" "}
                    <span style={{ color: isProjectLimitReached ? "#dc2626" : "#16a34a", fontWeight: 600, fontSize: "12.5px", marginLeft: "4px" }}>
                      ({remainingProjects} remaining)
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
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
              Location * (Auto-set from branch)
              <input
                type="text"
                value={form.location}
                readOnly
                style={{ backgroundColor: "#f8fafc", cursor: "not-allowed" }}
              />
              {profile?.branch && (
                <small style={{ color: "#64748b", display: "block", marginTop: "4px" }}>
                  Auto-filled from your branch: {profile.branch.name} ({profile.branch.city}
                  {profile.branch.region ? `, ${profile.branch.region}` : ""})
                </small>
              )}
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
          <h2>Project Hero Description *</h2>
         
          <label className="full-width">
            <textarea
              value={form.details}
              maxLength={300}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              rows={4}
              placeholder="Short overview description for the top hero area..."
              required
            />
            <div className="char-counter-row">
              <span className={`char-counter ${(form.details || "").length >= 300 ? "limit-reached" : (form.details || "").length > 250 ? "warning" : ""}`}>
                {(form.details || "").length} / 300 characters
              </span>
            </div>
          </label>
        </section>

        <section className="form-section">
          <h2>About The Project Section *</h2>
         
          <label className="full-width">
            Main Description *
            <textarea
              value={form.about?.description || ""}
              maxLength={300}
              onChange={(e) => updateObjectField("about", "description", e.target.value)}
              rows={4}
              placeholder="Main description for 'About The Project' section on client website..."
              required
            />
            <div className="char-counter-row">
              <span className={`char-counter ${(form.about?.description || "").length >= 300 ? "limit-reached" : (form.about?.description || "").length > 250 ? "warning" : ""}`}>
                {(form.about?.description || "").length} / 300 characters
              </span>
            </div>
          </label>
        </section>

        <section className="form-section">
          <h2>Project Cover &amp; Gallery Images</h2>
          <div className="project-image-upload-wrapper" style={{ marginBottom: "1.75rem" }}>
            <label className="project-image-field-label">
              Project Layout &amp; Cover Image *
              <span className="project-image-field-hint">
                Mandatory: Upload the master layout or site plan. This image is displayed on the project card and rendered as the primary layout viewer on the project details page.
              </span>
            </label>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/png, image/jpeg, image/jpg, image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageFileChange(file);
                e.target.value = "";
              }}
            />

            {form.image ? (
              <div className="project-image-preview-card">
                <div className="project-image-preview-media">
                  <img
                    src={resolveImageUrl(form.image)}
                    alt="Project layout preview"
                    className="project-image-preview-img"
                    onError={(e) => { e.target.style.display = "none"; }}
                    onLoad={(e) => { e.target.style.display = "block"; }}
                  />
                </div>
                <div className="project-image-preview-info">
                  <div className="project-image-preview-badge">
                    <FaImage /> Cover Image
                  </div>
                  <p className="project-image-preview-desc">
                    Active layout image displayed to buyers and used as the default cover.
                  </p>
                  <div className="project-image-preview-actions">
                    <button
                      type="button"
                      className="project-image-action-btn project-image-replace-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                    >
                      {isUploadingImage ? <FaSpinner className="fa-spin" /> : <FaCloudUploadAlt />}
                      {isUploadingImage ? "Uploading..." : "Replace Image"}
                    </button>
                    <button
                      type="button"
                      className="project-image-action-btn project-image-remove-btn"
                      onClick={handleRemoveImage}
                      disabled={isUploadingImage}
                    >
                      <FaTimes /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`project-image-dropzone ${isDragOver ? "drag-over" : ""} ${isUploadingImage ? "uploading" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleImageFileChange(file);
                }}
                onClick={() => {
                  if (!isUploadingImage) fileInputRef.current?.click();
                }}
              >
                {isUploadingImage ? (
                  <div className="dropzone-content">
                    <FaSpinner className="dropzone-icon fa-spin" />
                    <p className="dropzone-primary-text">Uploading image to cloud...</p>
                    <span className="dropzone-secondary-text">Please wait while the image is being optimized and saved</span>
                  </div>
                ) : (
                  <div className="dropzone-content">
                    <div className="dropzone-icon-wrap">
                      <FaCloudUploadAlt className="dropzone-icon" />
                    </div>
                    <p className="dropzone-primary-text">
                      Drag & drop your layout image here, or <span className="dropzone-browse-link">browse</span>
                    </p>
                    <span className="dropzone-secondary-text">
                      PNG, JPG, JPEG, WEBP supported (up to 20MB)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Default Plot Image Upload Area */}
          <div className="project-image-upload-wrapper full-width" style={{ marginBottom: "1.25rem" }}>
            <label className="project-image-field-label">
              Default Plot Image
              <span className="project-image-optional-badge">Applies to all plots created in this project</span>
            </label>
            <p className="project-image-field-sub">
              Upload a default image for plots in this project. If not provided, plots will automatically inherit the project layout cover image.
            </p>

            <input
              ref={plotFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePlotImageFileChange(file);
              }}
            />

            {form.defaultPlotImage ? (
              <div className="project-image-preview-card">
                <div className="project-image-preview-thumb-wrap">
                  <img
                    src={form.defaultPlotImage}
                    alt="Default Plot Preview"
                    className="project-image-preview-thumb"
                  />
                  <div className="project-image-preview-overlay">
                    <span className="preview-badge">Plot Image</span>
                  </div>
                </div>
                <div className="project-image-preview-meta">
                  <div className="project-image-preview-name-row">
                    <span className="project-image-name">Default Plot Cover</span>
                    <span className="project-image-status-pill">Ready</span>
                  </div>
                  <p className="project-image-preview-url" title={form.defaultPlotImage}>
                    {form.defaultPlotImage}
                  </p>
                  <div className="project-image-btn-row">
                    <button
                      type="button"
                      className="project-image-action-btn project-image-replace-btn"
                      onClick={() => plotFileInputRef.current?.click()}
                      disabled={isUploadingPlotImage}
                    >
                      <FaCloudUploadAlt /> Replace Plot Image
                    </button>
                    <button
                      type="button"
                      className="project-image-action-btn project-image-remove-btn"
                      onClick={handleRemovePlotImage}
                      disabled={isUploadingPlotImage}
                    >
                      <FaTimes /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`project-image-dropzone ${isPlotDragOver ? "drag-over" : ""} ${isUploadingPlotImage ? "uploading" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsPlotDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsPlotDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsPlotDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handlePlotImageFileChange(file);
                }}
                onClick={() => {
                  if (!isUploadingPlotImage) plotFileInputRef.current?.click();
                }}
              >
                {isUploadingPlotImage ? (
                  <div className="dropzone-content">
                    <FaSpinner className="dropzone-icon fa-spin" />
                    <p className="dropzone-primary-text">Uploading plot image to cloud...</p>
                    <span className="dropzone-secondary-text">Please wait while the image is being optimized and saved</span>
                  </div>
                ) : (
                  <div className="dropzone-content">
                    <div className="dropzone-icon-wrap">
                      <FaCloudUploadAlt className="dropzone-icon" />
                    </div>
                    <p className="dropzone-primary-text">
                      Drag &amp; drop default plot image here, or <span className="dropzone-browse-link">browse</span>
                    </p>
                    <span className="dropzone-secondary-text">
                      PNG, JPG, JPEG, WEBP supported (up to 20MB)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

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
            <span className={`checkbox-count-badge ${form.benefits.length >= 4 ? "limit-reached" : form.benefits.length > 0 ? "has-selected" : ""}`}>
              {form.benefits.length} / 4 selected (Max 4)
            </span>
          </div>
          <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b" }}>
            Select up to 4 key benefits displayed in the &quot;Benefits of Project&quot; section on the client site.
          </p>
          <div className="checkbox-group-grid">
            {AVAILABLE_BENEFITS.map((benefit) => {
              const isChecked = form.benefits.some((b) => b.title === benefit.title);
              const isDisabled = !isChecked && form.benefits.length >= 4;
              return (
                <label
                  key={benefit.title}
                  className={`checkbox-card has-desc ${isChecked ? "selected" : ""} ${isDisabled ? "disabled-card" : ""}`}
                  style={isDisabled ? { opacity: 0.55, cursor: "not-allowed", filter: "grayscale(20%)" } : {}}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => handleToggleBenefit(benefit)}
                  />
                  <div className="checkbox-content-wrap">
                    <span className="checkbox-title">
                      {benefit.title}
                      {isDisabled && <span style={{ marginLeft: 6, fontSize: "0.7rem", color: "#64748b" }}>(Max 4)</span>}
                    </span>
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
            DTCP and RERA Approved are pre-applied by default. Select key selling points and verified features for this project.
          </p>
          <div className="checkbox-group-grid">
            {AVAILABLE_HIGHLIGHTS.map((item) => {
              const isChecked = form.highlights.includes(item);
              const isGovernmentApproval = item === "DTCP Approved" || item === "RERA Approved";
              return (
                <label
                  key={item}
                  className={`checkbox-card ${isChecked ? "selected" : ""}`}
                  style={isGovernmentApproval ? { borderColor: "#059669", borderWidth: "1.5px" } : {}}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleHighlight(item)}
                  />
                  <span className="checkbox-label-text">
                    {item}
                    {isGovernmentApproval && (
                      <span style={{ marginLeft: 6, fontSize: "0.7rem", color: "#059669", fontWeight: 700, background: "#ecfdf5", padding: "2px 6px", borderRadius: 4 }}>
                        Default
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Amenities Section */}
        <section className="form-section">
          <div className="checkbox-section-header">
            <h2>Project Amenities</h2>
            <span className={`checkbox-count-badge ${form.amenities.length >= 8 ? "limit-reached" : form.amenities.length > 0 ? "has-selected" : ""}`}>
              {form.amenities.length} / 8 selected (Max 8)
            </span>
          </div>
          <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b" }}>
            Select up to 8 verified amenities available in this layout or gated community.
          </p>
          <div className="checkbox-group-grid">
            {AVAILABLE_AMENITIES.map((item) => {
              const isChecked = form.amenities.includes(item);
              const isDisabled = !isChecked && form.amenities.length >= 8;
              return (
                <label
                  key={item}
                  className={`checkbox-card ${isChecked ? "selected" : ""} ${isDisabled ? "disabled-card" : ""}`}
                  style={isDisabled ? { opacity: 0.55, cursor: "not-allowed", filter: "grayscale(20%)" } : {}}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => handleToggleAmenity(item)}
                  />
                  <span className="checkbox-label-text">
                    {item}
                    {isDisabled && (
                      <span style={{ marginLeft: 6, fontSize: "0.7rem", color: "#64748b" }}>(Max 8)</span>
                    )}
                  </span>
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