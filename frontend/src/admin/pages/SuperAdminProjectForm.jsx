import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useProjects } from "../../context/ProjectContext";
import {
  FaArrowLeft,
  FaSave,
  FaPlus,
  FaTrash,
  FaExclamationCircle,
  FaCheckCircle,
  FaCloudUploadAlt,
  FaImage,
  FaSpinner,
  FaTimes,
  FaBuilding,
  FaLock,
  FaLayerGroup,
} from "react-icons/fa";
import { superAdminApi } from "../../services/api";
import { useAdmins } from "../context/AdminContext";
import { useToast } from "../../context/ToastContext";
import { resolveImageUrl } from "../../utils/imageUrl";
import {
  AVAILABLE_BENEFITS,
  DEFAULT_NEW_PROJECT_BENEFITS,
  AVAILABLE_HIGHLIGHTS,
  AVAILABLE_AMENITIES,
  DEFAULT_NEW_PROJECT_HIGHLIGHTS,
  DEFAULT_NEW_PROJECT_AMENITIES,
} from "../../data/projects";
import CustomDropdown from "../components/CustomDropdown";
import "../styles/admin-project-form.css";
import "../styles/super-admin.css";

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
 * Sanitize plot price input - allow only digits and single decimal point
 */
const sanitizePlotPrice = (value) => {
  const cleaned = value.replace(/[₹,\s]/g, "").replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
};

/**
 * Sanitize project size input - allow only digits and single decimal point
 */
const sanitizeProjectSize = (value) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
};

/**
 * Sanitize plot sizes input - allow digits, spaces, hyphens, en-dash
 */
const sanitizePlotSizes = (value) => value.replace(/[^0-9\s\-–]/g, "");

/**
 * Wrapper component for input with fixed unit suffix.
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

/* ========================================================
   SUPER ADMIN PROJECT FORM (REPLICA OF BRANCH ADMIN FORM)
   ======================================================== */
const SuperAdminProjectForm = () => {
  const navigate = useNavigate();
  const locationHook = useLocation();
  const {
    projects,
    setProjects,
    parsePriceLakhs,
    isValidPlotPrice,
  } = useProjects();
  const { subscriptionInfo, fetchSubscriptionInfo } = useAdmins();
  const { showToast } = useToast();

  useEffect(() => {
    if (fetchSubscriptionInfo) {
      fetchSubscriptionInfo();
    }
  }, [fetchSubscriptionInfo]);

  const allocatedSeats = subscriptionInfo?.assignedSeats ?? 0;
  const isBranchFeatureEnabled = allocatedSeats > 0;
  const maxProjects = subscriptionInfo?.maxProjects ?? 10;
  const usedProjects = subscriptionInfo?.usedProjects ?? (projects ? projects.filter((p) => !p.isArchived).length : 0);
  const remainingProjects = subscriptionInfo?.remainingProjects ?? Math.max(0, maxProjects - usedProjects);
  const isUnlimitedProjects = Boolean(subscriptionInfo?.isUnlimitedProjects || maxProjects >= 999999);
  const isProjectLimitReached = Boolean(subscriptionInfo?.isProjectLimitReached || (!isUnlimitedProjects && remainingProjects <= 0));

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  // ── Branch scoping state ──────────────────────────────────────
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState("");

  const [form, setForm] = useState({
    title: "",
    location: "",
    city: "",
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

  // Load tenant branches
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBranchesLoading(true);
        const res = await superAdminApi.getBranches();
        if (!cancelled && res?.success) {
          const loadedBranches = res.data || [];
          setBranches(loadedBranches);

          // Check if URL has ?branchId=...
          const params = new URLSearchParams(locationHook.search);
          const branchParam = params.get("branchId");
          if (branchParam) {
            const found = loadedBranches.find((b) => String(b.id || b._id) === String(branchParam));
            if (found) {
              setSelectedBranchId(String(found.id || found._id));
            }
          }
        }
      } catch (err) {
        console.error("Failed to load branches:", err);
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationHook.search]);

  // Find active branches & selected branch
  const activeBranches = branches.filter((b) => b.status === "ACTIVE" || b.status === "Active");
  const selectedBranch = branches.find(
    (b) => String(b.id || b._id) === String(selectedBranchId)
  );

  // ── Auto-prefill and lock Location & City when branch is selected ──
  useEffect(() => {
    if (selectedBranch) {
      const branchCity = selectedBranch.city ? selectedBranch.city.trim() : "";
      const branchRegion = selectedBranch.region ? selectedBranch.region.trim() : "";
      const branchLocation = branchRegion ? `${branchCity}, ${branchRegion}` : branchCity;

      setForm((prev) => ({
        ...prev,
        location: branchLocation,
        city: branchCity,
      }));
    }
  }, [selectedBranch]);

  // ── Image Upload Handling (Drag & Drop + Cloudinary/Storage) ──
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
          const res = await superAdminApi.uploadProjectImage(
            {
              fileData: dataUrl,
              mimeType: file.type,
              width: detectedWidth,
              height: detectedHeight,
            },
            "new"
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
          const res = await superAdminApi.uploadProjectImage(
            {
              fileData: dataUrl,
              mimeType: file.type,
              width: detectedWidth,
              height: detectedHeight,
            },
            "new"
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

  // ── Plot validation logic ──
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

  // ── Array & Object state updaters ──
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
        const limitMsg = "You can select a maximum of 4 project benefits (Why Choose Us).";
        setMessage({ type: "error", text: limitMsg });
        showToast(limitMsg, "error");
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
        const limitMsg = "You can select a maximum of 8 project amenities.";
        setMessage({ type: "error", text: limitMsg });
        showToast(limitMsg, "error");
        return prev;
      }
      const updated = exists
        ? current.filter((a) => a !== item)
        : [...current, item];
      return { ...prev, amenities: updated };
    });
  };

  // ── Form submission ──
  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = [];
    if (isBranchFeatureEnabled && !selectedBranchId) {
      errors.push("Branch & Branch Admin assignment is required. Every project must be assigned to an active branch office.");
    }
    if (!form.title.trim()) errors.push("Project Title is required.");
    if (!form.location.trim()) errors.push("Location is required.");
    if (!form.plotPrice.trim()) errors.push("Plot Price is required.");
    if (!form.image && (!form.images || !form.images.length || !form.images[0])) {
      errors.push("Project Cover / Master Layout Image is required.");
    }
    if (!form.details || !form.details.trim()) {
      errors.push("Project Hero Description is required.");
    }
    if (!form.about?.description || !form.about.description.trim()) {
      errors.push("About The Project Section (Main Description) is required.");
    }
    if (!plotsValid) {
      if (total === 0) errors.push("Total plots must be greater than 0.");
      else errors.push("Available + Reserved + Sold must equal Total Plots.");
    }

    const combinedPlotPrice = combineWithSuffix(form.plotPrice, "Lakh");
    if (isValidPlotPrice && !isValidPlotPrice(combinedPlotPrice)) {
      errors.push("Invalid plot price format. Use format like '8.5', '12', or '12.5'");
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      setMessage({ type: "error", text: errors.join(". ") });
      showToast(errors[0], "error");
      return;
    }

    setValidationErrors([]);
    setSaving(true);
    setMessage(null);

    const coverImageUrl = form.image || (form.images && form.images[0]) || "";
    const effectiveCity = form.city ? form.city.trim() : form.location.split(",")[0].trim();

    const payload = {
      title: form.title.trim(),
      location: form.location.trim(),
      city: effectiveCity,
      category: form.category,
      status: form.status,
      image: coverImageUrl,
      ...(coverImageUrl
        ? { layout: { imageUrl: coverImageUrl, referenceImageUrl: coverImageUrl } }
        : {}),
      defaultPlotImage: form.defaultPlotImage ? form.defaultPlotImage.trim() : "",
      plotType: form.plotType,
      plotPrice: combinedPlotPrice,
      priceLakhs: parsePriceLakhs(combinedPlotPrice),
      plotSizes: combineWithSuffix(form.plotSizes, "Sq.ft"),
      distance: form.distance,
      projectSize: combineWithSuffix(form.projectSize, "Acres"),
      totalPlots: total,
      availablePlots: available,
      reservedPlots: reserved,
      soldPlots: sold,
      launchDate: form.launchDate || "Not announced",
      details: form.details,
      images: form.images,
      benefits: form.benefits,
      about: form.about,
      highlights: form.highlights,
      amenities: form.amenities,
      locationConnectivity: form.locationConnectivity,
      branchId: selectedBranchId || null,
    };

    try {
      const res = await superAdminApi.createProject(payload);
      const createdProject = res?.data;

      // Optimistically update ProjectContext
      if (createdProject && setProjects) {
        setProjects((prev) => [
          ...prev,
          {
            ...createdProject,
            id: createdProject.id || createdProject.customId,
            approvalStatus: "APPROVED",
          },
        ]);
      }

      const successMsg = res?.message || "Project created and published successfully to the client website!";
      setMessage({
        type: "success",
        text: successMsg,
      });
      showToast(successMsg, "success");

      setTimeout(() => {
        if (selectedBranchId) {
          navigate(`/super-admin/branches/${selectedBranchId}`);
        } else {
          navigate("/super-admin/branches");
        }
      }, 700);
    } catch (err) {
      console.error("[SuperAdminProjectForm] Submit error:", err);
      const errMsg = err.data?.message || err.message || "Failed to save project. Please check required fields.";
      setMessage({
        type: "error",
        text: errMsg,
      });
      showToast(errMsg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (selectedBranchId) {
      navigate(`/super-admin/branches/${selectedBranchId}`);
    } else {
      navigate("/super-admin/branches");
    }
  };

  return (
    <div className="admin-project-form-page">
      <div className="form-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button className="back-btn" onClick={handleCancel}>
            <FaArrowLeft /> Back to Branches
          </button>
          <div>
            <h1>Add New Project</h1>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
              Super Admin — Project will be automatically{" "}
              <strong style={{ color: "#059669" }}>APPROVED</strong> and published directly on the client site.
            </p>
          </div>
        </div>

        {/* Project Quota Limit Banner */}
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
              Subscription Project Quota
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
      </div>

      {message && (
        <div className={`form-message ${message.type}`}>
          {message.type === "success" ? <FaCheckCircle /> : <FaExclamationCircle />} {message.text}
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
        {/* ==============================
            BRANCH & ADMIN ASSIGNMENT
        ============================== */}
        {isBranchFeatureEnabled && (
          <section className="form-section" style={{ border: "2px solid #e2e8f0", background: "#f8fafc" }}>
            <h2 style={{ color: "#a63d2f", display: "flex", alignItems: "center", gap: 8 }}>
              <FaBuilding /> Branch &amp; Admin Assignment *
            </h2>
            <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b" }}>
              Every project must be assigned to an active branch office and managed by a Branch Admin. Selecting a branch locks the project&apos;s location &amp; city to that Branch Admin&apos;s operational territory.
            </p>

            {activeBranches.length === 0 && !branchesLoading ? (
              <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 12 }}>
                <p style={{ margin: 0, color: "#991b1b", fontSize: "0.88rem", fontWeight: 600 }}>
                  <FaExclamationCircle style={{ marginRight: 6 }} />
                  No active branches found. You must create at least one Branch with an active Branch Admin before publishing a project.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/super-admin/branches")}
                  style={{
                    marginTop: 8,
                    padding: "6px 12px",
                    background: "#a63d2f",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Go to Branch Management
                </button>
              </div>
            ) : (
              <div className="form-grid">
                <label className="full-width">
                  Select Branch &amp; Branch Admin *
                  <CustomDropdown
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    placeholder="-- Select Branch & Branch Admin (Required) --"
                    required
                  >
                    <option value="" disabled>-- Select Branch &amp; Branch Admin (Required) --</option>
                    {activeBranches.map((branch) => {
                      const adminName = branch.branchAdmin?.name || branch.branchAdmin?.email || "No Admin Assigned";
                      const regionText = branch.region ? `, ${branch.region}` : "";
                      return (
                        <option key={branch.id || branch._id} value={branch.id || branch._id}>
                          {branch.name} — Admin: {adminName} ({branch.city}{regionText})
                        </option>
                      );
                    })}
                  </CustomDropdown>

                  {selectedBranch ? (
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8 }}>
                      <small style={{ color: "#065f46", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        <FaLock size={12} />
                        Auto-locked to territory: {selectedBranch.name} ({selectedBranch.city}{selectedBranch.region ? `, ${selectedBranch.region}` : ""}).
                        Branch Admin: {selectedBranch.branchAdmin?.name || "Pending"}.
                      </small>
                    </div>
                  ) : (
                    <small style={{ color: "#dc2626", fontWeight: 600, display: "block", marginTop: 4 }}>
                      * Branch assignment is mandatory. Please select an active branch office above.
                    </small>
                  )}
                </label>
              </div>
            )}
          </section>
        )}

        {/* ==============================
            BASIC INFORMATION
        ============================== */}
        <section className="form-section">
          <h2>Basic Information</h2>
          <div className="form-grid">
            <label>
              Project Title *
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Greenwood Enclave"
                required
              />
            </label>

            <label>
              Location *
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                readOnly={isBranchFeatureEnabled}
                style={
                  isBranchFeatureEnabled
                    ? { backgroundColor: "#f8fafc", cursor: "not-allowed", color: "#334155" }
                    : {}
                }
                placeholder={
                  isBranchFeatureEnabled
                    ? selectedBranch
                      ? "e.g. Dindigul, Tamil Nadu"
                      : "Select a Branch above to lock location"
                    : "e.g. Dindigul, Tamil Nadu"
                }
                required
              />
             
            </label>

            <label>
              City *
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                readOnly={isBranchFeatureEnabled}
                style={
                  isBranchFeatureEnabled
                    ? { backgroundColor: "#f8fafc", cursor: "not-allowed", color: "#334155" }
                    : {}
                }
                placeholder={
                  isBranchFeatureEnabled
                    ? selectedBranch
                      ? "e.g. Dindigul"
                      : "Select a Branch above to lock city"
                    : "e.g. Dindigul"
                }
                required
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

        {/* ==============================
            PROJECT DETAILS
        ============================== */}
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

        {/* ==============================
            PLOT SUMMARY
        ============================== */}
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

        {/* ==============================
            PROJECT HERO DESCRIPTION
        ============================== */}
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

        {/* ==============================
            ABOUT THE PROJECT SECTION
        ============================== */}
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

        {/* ==============================
            PROJECT COVER & GALLERY IMAGES
        ============================== */}
        <section className="form-section">
          <h2>Project Cover &amp; Gallery Images</h2>
          <div className="project-image-upload-wrapper" style={{ marginBottom: "1.75rem" }}>
            <label className="project-image-field-label">
              Project Layout &amp; Cover Image *
              <span className="project-image-field-hint">
                Mandatory: Upload the master layout or site plan. This image is displayed on the project card and rendered as the primary layout viewer on the client site.
              </span>
            </label>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml, image/avif, image/bmp"
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
                    <FaImage /> Master Layout & Cover Image
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
                    <p className="dropzone-primary-text">Uploading image & converting to WebP...</p>
                    <span className="dropzone-secondary-text">Please wait while the image is compressed and optimized for persistent storage</span>
                  </div>
                ) : (
                  <div className="dropzone-content">
                    <div className="dropzone-icon-wrap">
                      <FaCloudUploadAlt className="dropzone-icon" />
                    </div>
                    <p className="dropzone-primary-text">
                      Drag &amp; drop your layout image here, or <span className="dropzone-browse-link">browse</span>
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
              accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml, image/avif, image/bmp"
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
                    <p className="dropzone-primary-text">Uploading plot image & converting to WebP...</p>
                    <span className="dropzone-secondary-text">Please wait while the image is compressed and optimized for persistent storage</span>
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

        {/* ==============================
            PROJECT BENEFITS (WHY CHOOSE US)
        ============================== */}
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
          <div className="benefits-grid-dense">
            {AVAILABLE_BENEFITS.map((benefit) => {
              const isChecked = form.benefits.some((b) => b.title === benefit.title);
              const isDisabled = !isChecked && form.benefits.length >= 4;
              return (
                <label
                  key={benefit.title}
                  className={`benefit-card-dense ${isChecked ? "selected" : ""} ${isDisabled ? "disabled-card" : ""}`}
                  style={isDisabled ? { opacity: 0.55, cursor: "not-allowed", filter: "grayscale(20%)" } : {}}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => handleToggleBenefit(benefit)}
                  />
                  <div className="benefit-card-dense-header">
                    <span className="benefit-card-dense-title">{benefit.title}</span>
                    <span className="benefit-card-dense-pill">{isChecked ? "Active" : isDisabled ? "Max 4" : "Add"}</span>
                  </div>
                  <span className="benefit-card-dense-desc">{benefit.description}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* ==============================
            PROJECT HIGHLIGHTS
        ============================== */}
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

        {/* ==============================
            PROJECT AMENITIES
        ============================== */}
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

        {/* ==============================
            LOCATION & CONNECTIVITY
        ============================== */}
        <section className="form-section">
          <h2>Location &amp; Connectivity</h2>
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

        {/* ==============================
            FORM ACTIONS
        ============================== */}
        <div className="form-actions">
          <button type="button" className="cancel-btn" onClick={handleCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="save-btn"
            disabled={saving || !plotsValid || (isBranchFeatureEnabled && !selectedBranchId)}
            style={{
              background:
                saving || !plotsValid || (isBranchFeatureEnabled && !selectedBranchId)
                  ? undefined
                  : "#059669",
            }}
          >
            {saving ? (
              "Creating & Publishing..."
            ) : isBranchFeatureEnabled && !selectedBranchId ? (
              <>
                <FaLock /> Select Branch &amp; Admin to Publish
              </>
            ) : selectedBranch ? (
              <>
                <FaSave /> Create &amp; Approve Project to {selectedBranch.name}
              </>
            ) : (
              <>
                <FaSave /> Create &amp; Approve Project
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SuperAdminProjectForm;
