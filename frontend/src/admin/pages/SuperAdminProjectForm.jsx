import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaArrowLeft,
  FaSave,
  FaPlus,
  FaTrash,
  FaExclamationCircle,
  FaCheckCircle,
  FaUserCheck,
} from "react-icons/fa";
import {
  commonBenefits,
  AVAILABLE_BENEFITS,
  DEFAULT_NEW_PROJECT_BENEFITS,
  AVAILABLE_HIGHLIGHTS,
  AVAILABLE_AMENITIES,
  DEFAULT_NEW_PROJECT_HIGHLIGHTS,
  DEFAULT_NEW_PROJECT_AMENITIES,
} from "../../data/projects";

import { useAdmins } from "../context/AdminContext";
import { superAdminApi } from "../../services/api";
import { useProjects } from "../../context/ProjectContext";
import CustomDropdown from "../components/CustomDropdown";
import "../styles/admin-project-form.css";
import "../styles/super-admin.css";

const combineWithSuffix = (value, suffix) => {
  if (!value || !suffix) return value || "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed} ${suffix}`;
};

const sanitizeTextNoDigits = (value) => value.replace(/\d/g, "");
const sanitizePlotPrice = (value) => {
  const cleaned = value.replace(/[₹,\s]/g, "").replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
};
const sanitizeProjectSize = (value) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
};
const sanitizePlotSizes = (value) => value.replace(/[^0-9\s\-–]/g, "");

const parsePriceLakhs = (plotPrice) => {
  if (!plotPrice || typeof plotPrice !== "string") return 0;
  const cleaned = plotPrice.replace(/[₹,]/g, "").trim();
  const lakhMatch = cleaned.match(/([\d.]+)\s*[Ll]akh/i);
  if (lakhMatch) return parseFloat(lakhMatch[1]);
  const numMatch = cleaned.match(/^([\d.]+)$/);
  if (numMatch) {
    const num = parseFloat(numMatch[1]);
    return num >= 1000 ? num / 100000 : num;
  }
  return 0;
};

const InputWithUnit = ({ value, onChange, placeholder, suffix, sanitize, ...rest }) => (
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

/* ========================================================
   SUPER ADMIN PROJECT FORM
   ======================================================== */
const SuperAdminProjectForm = () => {
  const navigate = useNavigate();
  const { admins } = useAdmins();
  const { setProjects, projects } = useProjects();

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [selectedAdminId, setSelectedAdminId] = useState("");

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
    about: { description: "", additionalDescription: "" },
    locationConnectivity: [{ name: "", distance: "" }],
    benefits: DEFAULT_NEW_PROJECT_BENEFITS,
    highlights: DEFAULT_NEW_PROJECT_HIGHLIGHTS,
    amenities: DEFAULT_NEW_PROJECT_AMENITIES,
  });

  // Plot counts
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

  // Available normal admins
  const activeAdmins = admins.filter((a) => a.status === "Active" || a.status === "ACTIVE");
  const inactiveAdmins = admins.filter((a) => a.status !== "Active" && a.status !== "ACTIVE");

  const updateArrayField = (fieldName, index, value) => {
    setForm((prev) => {
      const newArray = [...prev[fieldName]];
      newArray[index] = value;
      return { ...prev, [fieldName]: newArray };
    });
  };

  const addArrayItem = (fieldName, newItem) => {
    setForm((prev) => ({ ...prev, [fieldName]: [...prev[fieldName], newItem] }));
  };

  const removeArrayItem = (fieldName, index) => {
    setForm((prev) => ({
      ...prev,
      [fieldName]: prev[fieldName].filter((_, i) => i !== index),
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

  const validate = () => {
    const errors = [];
    if (!form.title.trim()) errors.push("Project title is required.");
    if (!form.location.trim()) errors.push("Location is required.");
    if (!form.plotPrice.trim()) errors.push("Plot price is required.");
    if (!plotsValid && total > 0)
      errors.push("Available + Reserved + Sold must equal Total Plots.");
    if (total === 0) errors.push("Total plots must be greater than 0.");
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validate();
    if (errors.length > 0) {
      setValidationErrors(errors);
      setMessage({ type: "error", text: errors[0] });
      return;
    }

    setValidationErrors([]);
    setSaving(true);
    setMessage(null);

    const combinedPlotPrice = combineWithSuffix(form.plotPrice, "Lakh");

    const payload = {
      title: form.title.trim(),
      location: form.location.trim(),
      city: form.city || form.location.split(",")[0].trim(),
      category: form.category,
      budget: form.budget,
      status: form.status,
      image: form.image || (form.images && form.images[0]) || "",
      defaultPlotImage: form.defaultPlotImage ? form.defaultPlotImage.trim() : "",
      plotType: form.plotType,
      plotPrice: combinedPlotPrice,
      priceLakhs: parsePriceLakhs(combinedPlotPrice),
      plotSizes: combineWithSuffix(form.plotSizes, "Sq.ft"),
      distance: form.distance,
      projectSize: combineWithSuffix(form.projectSize, "Acres"),
      totalPlots: Number(form.totalPlots),
      availablePlots: Number(form.availablePlots),
      reservedPlots: Number(form.reservedPlots),
      soldPlots: Number(form.soldPlots),
      launchDate: form.launchDate || "Not announced",
      details: form.details,
      images: form.images,
      about: form.about,
      locationConnectivity: form.locationConnectivity,
      benefits: form.benefits,
      highlights: form.highlights,
      amenities: form.amenities,
      // Optional admin assignment
      adminId: selectedAdminId || null,
    };

    try {
      const res = await superAdminApi.createProject(payload);
      const createdProject = res?.data;
      const targetId = createdProject?.id || createdProject?.customId || createdProject?._id;

      // Optimistically update ProjectContext
      if (createdProject) {
        setProjects((prev) => [
          ...prev,
          {
            ...createdProject,
            id: createdProject.id || createdProject.customId,
            approvalStatus: "APPROVED",
          },
        ]);
      }

      setMessage({
        type: "success",
        text: res.message || "Project created and approved successfully!",
      });

      setTimeout(() => {
        navigate("/super-admin/assignments");
      }, 1200);
    } catch (err) {
      console.error("[SuperAdminProjectForm] Submit error:", err);
      setMessage({
        type: "error",
        text: err.message || "Failed to create project. Please check required fields.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => navigate("/super-admin/assignments");

  return (
    <div className="admin-project-form-page">
      {/* Header */}
      <div className="form-header">
        <button className="back-btn" onClick={handleCancel}>
          <FaArrowLeft /> Back
        </button>
        <div>
          <h1>Create New Project</h1>
          <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
            Super Admin — project will be immediately{" "}
            <strong style={{ color: "#059669" }}>APPROVED</strong> and visible on the client site.
          </p>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={`form-message ${message.type}`}>
          {message.type === "success" ? <FaCheckCircle /> : <FaExclamationCircle />}
          {" "}{message.text}
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
            ADMIN ASSIGNMENT (SA only)
        ============================== */}
        <section className="form-section" style={{ border: "2px solid #fbf0ec", background: "#f0f9ff" }}>
          <h2 style={{ color: "#a63d2f" }}>
            <FaUserCheck style={{ marginRight: 8, verticalAlign: "middle" }} />
            Assign to Admin
          </h2>
          <div className="form-grid">
            <label className="full-width">
              Select Administrator (Optional — can be assigned later from Assignments page)
              <CustomDropdown
                value={selectedAdminId}
                onChange={(e) => setSelectedAdminId(e.target.value)}
                className="sa-select-input"
                style={{ marginTop: "6px" }}
                placeholder="— Leave Unassigned for now —"
              >
                <option value="">— Leave Unassigned for now —</option>
                <optgroup label="Active Admins">
                  {activeAdmins.map((admin) => (
                    <option key={admin.id || admin._id} value={admin.id || admin._id}>
                      {admin.name} — {admin.email}
                    </option>
                  ))}
                </optgroup>
                {inactiveAdmins.length > 0 && (
                  <optgroup label="Inactive Admins (cannot assign)">
                    {inactiveAdmins.map((admin) => (
                      <option key={admin.id || admin._id} value="" disabled>
                        {admin.name} (Inactive)
                      </option>
                    ))}
                  </optgroup>
                )}
              </CustomDropdown>
              {selectedAdminId && (
                <small style={{ color: "#059669", fontWeight: 600, marginTop: 4, display: "block" }}>
                  ✓ Project will be assigned to this admin upon creation.
                </small>
              )}
            </label>
          </div>
        </section>

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
              <CustomDropdown value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Agriculture">Agriculture</option>
              </CustomDropdown>
            </label>
            <label>
              Budget Range
              <CustomDropdown value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })}>
                <option value="below10">Below ₹10 Lakh</option>
                <option value="10-25">₹10 - ₹25 Lakh</option>
                <option value="25-50">₹25 - ₹50 Lakh</option>
                <option value="above50">Above ₹50 Lakh</option>
              </CustomDropdown>
            </label>
            <label>
              Status
              <CustomDropdown value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="Upcoming">Upcoming</option>
              </CustomDropdown>
            </label>
            <label>
              Plot Type
              <CustomDropdown value={form.plotType} onChange={(e) => setForm({ ...form, plotType: e.target.value })}>
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
                onChange={(v) => setForm({ ...form, plotPrice: v })}
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
                onChange={(v) => setForm({ ...form, projectSize: v })}
                placeholder="e.g., 12"
                suffix="Acres"
                sanitize={sanitizeProjectSize}
              />
            </label>
            <label>
              Plot Sizes
              <InputWithUnit
                value={form.plotSizes}
                onChange={(v) => setForm({ ...form, plotSizes: v })}
                placeholder="e.g., 600 – 2400"
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
                placeholder="e.g., 2 km to NH"
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
            <div className="validation-success">Plot counts are valid ✓</div>
          )}
        </section>

        {/* ==============================
            DESCRIPTION
        ============================== */}
        <section className="form-section">
          <h2>Project Hero Description</h2>
          <label className="full-width">
            <textarea
              value={form.details}
              maxLength={450}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              rows={4}
              placeholder="Short overview description for the top hero area..."
            />
            <div className="char-counter-row">
              <span className={`char-counter ${(form.details || "").length >= 450 ? "limit-reached" : (form.details || "").length > 400 ? "warning" : ""}`}>
                {(form.details || "").length} / 450 characters
              </span>
            </div>
          </label>
        </section>

        {/* ==============================
            IMAGES
        ============================== */}
        <section className="form-section">
          <h2>Project Cover & Gallery Images</h2>
          <label className="full-width" style={{ marginBottom: "1.25rem" }}>
            Cover Image URL (Shows on Project Card)
            <input
              type="url"
              placeholder="image URL"
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
            />
          </label>
        </section>

        {/* ==============================
            PROJECT BENEFITS (WHY CHOOSE US)
        ============================== */}
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

        {/* ==============================
            PROJECT AMENITIES
        ============================== */}
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

        {/* ==============================
            LOCATION CONNECTIVITY
        ============================== */}
        <section className="form-section">
          <h2>Location & Connectivity</h2>
          {form.locationConnectivity.map((loc, index) => (
            <div key={index} className="array-row">
              <input
                type="text"
                placeholder="Name (e.g., Airport, School)"
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
            onClick={() => addArrayItem("locationConnectivity", { name: "", distance: "" })}
          >
            <FaPlus /> Add Location
          </button>
        </section>

        {/* ==============================
            ABOUT
        ============================== */}
        <section className="form-section">
          <h2>About The Project Section</h2>

          <label className="full-width" style={{ marginBottom: "1rem" }}>
            <textarea
              value={form.about.description}
              maxLength={450}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  about: { ...prev.about, description: e.target.value },
                }))
              }
              rows={3}
              placeholder="Detailed description for 'About The Project' section..."
            />
            <div className="char-counter-row">
              <span className={`char-counter ${(form.about?.description || "").length >= 450 ? "limit-reached" : (form.about?.description || "").length > 400 ? "warning" : ""}`}>
                {(form.about?.description || "").length} / 450 characters
              </span>
            </div>
          </label>
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
            disabled={saving || !plotsValid}
            style={{ background: saving || !plotsValid ? undefined : "#059669" }}
          >
            {saving
              ? "Creating..."
              : (
                <>
                  <FaSave /> Create & Approve Project
                  {selectedAdminId && " & Assign"}
                </>
              )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SuperAdminProjectForm;
