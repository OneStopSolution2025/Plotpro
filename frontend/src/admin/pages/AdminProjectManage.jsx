import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjects, findProjectByIdentifier, getProjectRouteSlug } from "../../context/ProjectContext";
import { usePlots } from "../../context/PlotContext";
import { useAdminProfile } from "../context/AdminProfileContext";
import { useNotifications } from "../context/NotificationContext";
import { adminApi } from "../../services/api";
import { FaArrowLeft, FaSave, FaPlus, FaTrash, FaInfoCircle, FaImage, FaCheckCircle, FaExclamationTriangle, FaThLarge } from "react-icons/fa";
import ConfirmationModal from "../components/ConfirmationModal";
import "../styles/admin-project-form.css";

const AdminProjectManage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { projects, setProjects, updateProject, isLoading: projectsLoading } = useProjects();
  const { plots, setPlots } = usePlots();
  const { profile, isSubscriptionExpired } = useAdminProfile();
  const { addNotification } = useNotifications();

  const project = findProjectByIdentifier(projects, id);
  const loadedProjectIdRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [applyingPlotImage, setApplyingPlotImage] = useState(false);
  const [confirmApplyModal, setConfirmApplyModal] = useState(false);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState("details");

  const [form, setForm] = useState({
    // Project details (editable)
    image: "",
    defaultPlotImage: "",
    projectSize: "",
    plotSizes: "",
    distance: "",
    launchDate: "",
    details: "",
    images: [],
    about: { description: "" },
    locationConnectivity: [{ name: "", distance: "" }],
  });

  // Only initialize form fields when project first loads or route id changes,
  // preventing 7-second background polling from overwriting user edits.
  useEffect(() => {
    if (project && (!loadedProjectIdRef.current || String(loadedProjectIdRef.current) !== String(project.id))) {
      loadedProjectIdRef.current = project.id;
      const primaryImg = project.image || (Array.isArray(project.images) && project.images[0]) || "";
      const allImgs = Array.isArray(project.images) && project.images.length > 0
        ? project.images
        : (primaryImg ? [primaryImg] : []);

      setForm({
        image: primaryImg,
        defaultPlotImage: project.defaultPlotImage || "",
        projectSize: project.projectSize || "",
        plotSizes: project.plotSizes || "",
        distance: project.distance || "",
        launchDate: project.launchDate || "",
        details: project.details || "",
        images: allImgs,
        about: project.about || { description: "" },
        locationConnectivity: project.locationConnectivity && project.locationConnectivity.length > 0
          ? project.locationConnectivity
          : [{ name: "", distance: "" }],
      });
    }
  }, [project, id]);

  if (!project) {
    if (projectsLoading) {
      return (
        <div className="admin-project-form-page" style={{ textAlign: "center", padding: "4rem" }}>
          <p style={{ color: "#666" }}>Loading project details...</p>
        </div>
      );
    }
    return (
      <div className="admin-project-form-page" style={{ textAlign: "center", padding: "4rem" }}>
        <FaInfoCircle style={{ fontSize: "3rem", color: "#ffc107", marginBottom: "1rem" }} />
        <h2>Project Not Found</h2>
        <p>The project you are looking for does not exist or has been removed.</p>
        <button className="back-btn" onClick={() => navigate("/admin/projects")} style={{ marginTop: "1.5rem" }}>
          <FaArrowLeft /> Back to Projects
        </button>
      </div>
    );
  }

  // Calculate plot stats from actual plots
  const projectPlots = plots.filter((p) => p.projectId === project.id);
  const totalPlots = projectPlots.length;
  const availablePlots = projectPlots.filter((p) => p.status === "Available").length;
  const reservedPlots = projectPlots.filter((p) => p.status === "Reserved").length;
  const soldPlots = projectPlots.filter((p) => p.status === "Sold").length;

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

  const handleSave = async (e) => {
    e.preventDefault();

    if (isSubscriptionExpired) {
      alert("Your organization's workspace subscription has expired. Modifying project details is restricted. Please contact your Super Administrator.");
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const coverImage = (form.image && form.image.trim()) || (form.images && form.images[0]) || "";
      
      let updatedImages = Array.isArray(form.images) ? [...form.images] : [];
      if (coverImage) {
        if (!updatedImages.includes(coverImage)) {
          updatedImages = [coverImage, ...updatedImages];
        } else if (updatedImages[0] !== coverImage) {
          updatedImages = [coverImage, ...updatedImages.filter((img) => img !== coverImage)];
        }
      }

      const updatePayload = {
        image: coverImage,
        defaultPlotImage: form.defaultPlotImage ? form.defaultPlotImage.trim() : "",
        images: updatedImages,
        projectSize: form.projectSize,
        plotSizes: form.plotSizes,
        distance: form.distance,
        launchDate: form.launchDate,
        details: form.details,
        about: form.about,
        locationConnectivity: form.locationConnectivity,
      };

      const res = await updateProject(project.id, updatePayload);

      // Keep local form state in sync with saved values
      setForm((prev) => ({
        ...prev,
        image: coverImage,
        defaultPlotImage: updatePayload.defaultPlotImage,
        images: updatedImages,
      }));

      // Local state fallback update
      setProjects((prev) =>
        prev.map((p) =>
          String(p.id) === String(project.id) ||
          String(p._id) === String(project.id) ||
          String(p.customId) === String(project.id)
            ? { ...p, ...updatePayload }
            : p
        )
      );

      if (profile?.role !== "Super Administrator") {
        addNotification({
          recipient: "super_admin",
          type: "PROJECT_UPDATED",
          title: "Project Details Updated",
          message: `${profile?.name || "Normal Admin"} updated details for "${project.title}".`,
          actorName: profile?.name || "Normal Admin",
          projectId: project.id,
        });
      }

      const successNotice = "Project details saved successfully!";
      setMessage({ type: "success", text: successNotice });
    } catch (err) {
      console.error("[AdminProjectManage] Save error:", err);
      setMessage({ type: "error", text: err.message || "Failed to save project details." });
    } finally {
      setSaving(false);
    }
  };

  const handleApplyPlotImageToAll = () => {
    if (isSubscriptionExpired) {
      alert("Your organization's workspace subscription has expired. Modifying plots is restricted. Please contact your Super Administrator.");
      return;
    }
    const imageUrl = (form.defaultPlotImage || "").trim();
    if (!imageUrl) {
      setMessage({ type: "error", text: "Please provide a valid Default Plot Image URL first." });
      return;
    }
    setConfirmApplyModal(true);
  };

  const confirmApplyPlotImageToAll = async () => {
    const imageUrl = (form.defaultPlotImage || "").trim();
    if (!imageUrl) return;

    setConfirmApplyModal(false);
    setApplyingPlotImage(true);
    setMessage(null);

    try {
      // 1. Call backend API to update project default and all plots in DB
      await adminApi.updateProjectPlotsDefaultImage(project.id, imageUrl);

      // 2. Update local projects state
      setProjects((prev) =>
        prev.map((p) =>
          String(p.id) === String(project.id) || String(p._id) === String(project.id)
            ? { ...p, defaultPlotImage: imageUrl }
            : p
        )
      );

      // 3. Update local plots state for this project
      setPlots((prev) =>
        prev.map((pl) =>
          String(pl.projectId) === String(project.id)
            ? { ...pl, image: imageUrl, images: [imageUrl] }
            : pl
        )
      );

      setMessage({
        type: "success",
        text: "Default plot image successfully applied to all plots in this project!",
      });
    } catch (err) {
      console.error("[AdminProjectManage] Error applying plot image:", err);
      setMessage({
        type: "error",
        text: err.message || "Failed to apply plot image to all plots.",
      });
    } finally {
      setApplyingPlotImage(false);
    }
  };

  return (
    <div className="admin-project-form-page">
      <div className="form-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <button className="back-btn" onClick={() => navigate(`/admin/projects/${getProjectRouteSlug(project, projects)}/manage`)}>
            <FaArrowLeft /> Back to Plots
          </button>
          <div>
            <h1>Manage Project Details</h1>
            <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>
              {project.title} — {project.location}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="back-btn"
          style={{ background: "#fbf0ec", borderColor: "#f5d5c7", color: "#a63d2f", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}
          onClick={() => navigate(`/admin/projects/${getProjectRouteSlug(project, projects)}/manage`)}
        >
          <FaThLarge /> Go to Plots Manager
        </button>
      </div>

      {/* Rejected Project Notice Banner */}
      {project.approvalStatus === "REJECTED" && (
        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: "10px",
            padding: "16px 20px",
            margin: "0 0 20px",
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
          }}
        >
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
            <p style={{ margin: 0, color: "#881337", fontSize: "12px", lineHeight: 1.4 }}>
              Update project details here, or use the <strong>Go to Plots Manager</strong> button to add or edit individual plots.
            </p>
          </div>
        </div>
      )}

      {/* Project Info Bar */}
      <div className="project-info-bar">
        <div className="info-item">
          <span className="info-label">Plot Type</span>
          <span className="info-value">{project.plotType}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Price</span>
          <span className="info-value">{project.plotPrice}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Status</span>
          <span className={`info-value status-${project.status.toLowerCase()}`}>{project.status}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Total Plots</span>
          <span className="info-value">{totalPlots}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Available</span>
          <span className="info-value available">{availablePlots}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Reserved</span>
          <span className="info-value reserved">{reservedPlots}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Sold</span>
          <span className="info-value sold">{soldPlots}</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button
          className={activeTab === "details" ? "active" : ""}
          onClick={() => setActiveTab("details")}
        >
          Project Details
        </button>
        <button
          className={activeTab === "gallery" ? "active" : ""}
          onClick={() => setActiveTab("gallery")}
        >
          Gallery
        </button>
        <button
          className={activeTab === "location" ? "active" : ""}
          onClick={() => setActiveTab("location")}
        >
          Location
        </button>
      </div>

      {message && (
        <div className={`form-message ${message.type}`} style={{ margin: "1rem 0" }}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="project-form" noValidate>
        {/* Tab: Project Details */}
        {activeTab === "details" && (
          <>
            <section className="form-section">
              <h2>Project Cover Image</h2>

              <div className="form-grid">
                <label className="full-width">
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
              </div>
              {form.image && (
                <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                  <img
                    src={form.image}
                    alt="Cover preview"
                    style={{ width: "220px", height: "130px", objectFit: "cover", borderRadius: "8px", border: "1px solid #ddd" }}
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                    onLoad={(e) => {
                      e.target.style.display = "block";
                    }}
                  />
                  <span style={{ fontSize: "0.85rem", color: "#666" }}>Preview of Project Card image</span>
                </div>
              )}
            </section>

            <section className="form-section">
              <h2>Common / Default Plot Image</h2>
              <div className="form-grid">
                <label className="full-width">
                  <input
                    type="url"
                    placeholder="e.g. https://images.unsplash.com/... or plot image URL"
                    value={form.defaultPlotImage}
                    onChange={(e) => setForm({ ...form, defaultPlotImage: e.target.value })}
                  />
                </label>
              </div>

              {form.defaultPlotImage && (
                <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                  <img
                    src={form.defaultPlotImage}
                    alt="Default Plot preview"
                    style={{ width: "220px", height: "130px", objectFit: "cover", borderRadius: "8px", border: "1px solid #ddd" }}
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                    onLoad={(e) => {
                      e.target.style.display = "block";
                    }}
                  />
                  <span style={{ fontSize: "0.85rem", color: "#666" }}>
                    Plots without an individual image will display this default photo.
                  </span>
                </div>
              )}

              <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleApplyPlotImageToAll}
                  disabled={applyingPlotImage || !form.defaultPlotImage}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.6rem 1.2rem",
                    backgroundColor: "#198754",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 600,
                    cursor: applyingPlotImage || !form.defaultPlotImage ? "not-allowed" : "pointer",
                    opacity: applyingPlotImage || !form.defaultPlotImage ? 0.65 : 1,
                    boxShadow: "0 2px 4px rgba(25,135,84,0.25)"
                  }}
                >
                  <FaImage /> {applyingPlotImage ? "Applying to All Plots..." : "Apply to All Plots in This Project"}
                </button>
              </div>
            </section>

            <section className="form-section">
              <h2>Basic Project Details</h2>
              <div className="form-grid">
                <label>
                  Project Size (e.g., "12 Acres")
                  <input
                    type="text"
                    value={form.projectSize}
                    onChange={(e) => setForm({ ...form, projectSize: e.target.value })}
                  />
                </label>
                <label>
                  Plot Sizes (e.g., "600 – 2400 Sq.ft")
                  <input
                    type="text"
                    value={form.plotSizes}
                    onChange={(e) => setForm({ ...form, plotSizes: e.target.value })}
                  />
                </label>
                <label>
                  Distance (e.g., "2 km to NH")
                  <input
                    type="text"
                    value={form.distance}
                    onChange={(e) => setForm({ ...form, distance: e.target.value })}
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
              <h2>Project Hero Description</h2>
              <label className="full-width">
                <textarea
                  value={form.details}
                  maxLength={300}
                  onChange={(e) => setForm({ ...form, details: e.target.value })}
                  rows={5}
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
                  onChange={(e) =>
                    updateObjectField("about", "description", e.target.value)
                  }
                  rows={4}
                  placeholder="Detailed description for 'About The Project' section..."
                />
                <div className="char-counter-row">
                  <span className={`char-counter ${(form.about?.description || "").length >= 300 ? "limit-reached" : (form.about?.description || "").length > 250 ? "warning" : ""}`}>
                    {(form.about?.description || "").length} / 300 characters
                  </span>
                </div>
              </label>
            </section>
          </>
        )}

        {/* Tab: Gallery */}
        {activeTab === "gallery" && (
          <section className="form-section">
            <h2>Gallery & Cover Images</h2>
            <label className="full-width" style={{ marginBottom: "1.25rem" }}>
              Project Cover Image URL (Shows on Project Card)
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

            <label className="full-width">
              All Gallery Images (One per line)
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
                rows={6}
                placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg&#10;https://example.com/image3.jpg"
              />
            </label>
            {form.images.length > 0 && (
              <div className="image-preview">
                {form.images.map((img, i) => (
                  <div key={i} className="preview-item">
                    <img src={img} alt={`Gallery ${i + 1}`} onError={(e) => (e.target.style.display = "none")} />
                    <span>{i === 0 ? "Cover Image" : `Image ${i + 1}`}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Tab: Location & Connectivity */}
        {activeTab === "location" && (
          <section className="form-section">
            <h2>Location & Connectivity</h2>
            {form.locationConnectivity.map((loc, index) => (
              <div key={index} className="array-row">
                <input
                  type="text"
                  placeholder="Name (e.g., Airport, School, Hospital)"
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
        )}

        <div className="form-actions">
          <button type="button" className="cancel-btn" onClick={() => navigate(`/admin/projects/${project.id}/plots`)}>
            Back to Plots
          </button>
          <button type="submit" className="save-btn" disabled={saving}>
            {saving ? "Saving..." : (<> <FaSave /> Save Changes </>)}
          </button>
        </div>
      </form>

      {/* CONFIRM APPLY DEFAULT IMAGE TO ALL PLOTS */}
      <ConfirmationModal
        isOpen={confirmApplyModal}
        title="Apply Image to All Plots?"
        message="Are you sure you want to apply this default image to ALL plots in this project?"
        subMessage="This will update the image for each plot in this project with the URL provided above."
        confirmText="Apply to All Plots"
        type="warning"
        isLoading={applyingPlotImage}
        onCancel={() => setConfirmApplyModal(false)}
        onConfirm={confirmApplyPlotImageToAll}
      />
    </div>
  );
};

export default AdminProjectManage;