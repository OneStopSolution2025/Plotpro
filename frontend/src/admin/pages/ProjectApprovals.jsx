import { useState, useMemo } from "react";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaBuilding,
  FaMapMarkerAlt,
  FaTag,
  FaExclamationTriangle,
  FaInbox,
  FaTrashAlt,
  FaEye,
  FaLayerGroup,
  FaCommentDots,
  FaUser,
  FaPhone,
  FaEnvelope,
  FaCheck,
  FaRulerCombined,
  FaCompass,
  FaShieldAlt,
} from "react-icons/fa";

import "../styles/super-admin.css";
import { useProjects } from "../../context/ProjectContext";
import { useAdmins } from "../context/AdminContext";
import { superAdminApi } from "../../services/api";

const ProjectApprovals = () => {
  const { projects, approveProject, rejectProject } = useProjects();
  const { admins } = useAdmins();

  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Inspection Modal State
  const [inspectingProject, setInspectingProject] = useState(null);
  const [inspectingPlots, setInspectingPlots] = useState([]);
  const [loadingPlots, setLoadingPlots] = useState(false);
  const [plotsError, setPlotsError] = useState(null);
  const [activeInspectTab, setActiveInspectTab] = useState("overview"); // "overview" | "plots" | "updates" | "feedback"
  const [feedbackText, setFeedbackText] = useState("");

  const showToast = (type, text) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const pendingList = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.approvalStatus === "PENDING" ||
          p.hasPendingUpdates ||
          p.pendingDeletion
      ),
    [projects]
  );

  const handleOpenInspect = async (project) => {
    setInspectingProject(project);
    setActiveInspectTab("overview");
    setFeedbackText("");
    setPlotsError(null);
    setLoadingPlots(true);
    try {
      const identifier = project.customId || project._id || project.id;
      const res = await superAdminApi.getProjectPlots(identifier);
      setInspectingPlots(res.data || []);
    } catch (err) {
      // Graceful fallback to getAllPlots filtered by project
      try {
        const allRes = await superAdminApi.getAllPlots();
        const allPlots = allRes.data || [];
        const filtered = allPlots.filter(
          (p) =>
            String(p.projectCustomId) === String(project.customId) ||
            String(p.projectId) === String(project._id || project.id)
        );
        setInspectingPlots(filtered);
      } catch (fallbackErr) {
        setPlotsError(err.message || "Failed to load project plots.");
        setInspectingPlots([]);
      }
    } finally {
      setLoadingPlots(false);
    }
  };

  const handleCloseInspect = () => {
    setInspectingProject(null);
    setInspectingPlots([]);
    setPlotsError(null);
    setFeedbackText("");
  };

  const handleApprove = async (projectId, isDeletion = false) => {
    setProcessingId(projectId);
    try {
      const res = await approveProject(projectId);
      if (res?.isDeleted || isDeletion) {
        showToast("success", "Project deletion approved. The project was permanently removed.");
      } else {
        showToast("success", "Project approved successfully and published to public listings!");
      }
      if (inspectingProject && (String(inspectingProject.id) === String(projectId) || String(inspectingProject._id) === String(projectId))) {
        handleCloseInspect();
      }
    } catch (err) {
      showToast("error", err.message || "Failed to process request");
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectConfirm = async (projectId, customReason = null) => {
    const reasonToSend = (customReason !== null ? customReason : rejectionReason).trim();
    if (!reasonToSend) {
      showToast("error", "Please provide a reason or revision instructions for rejection.");
      return;
    }
    setProcessingId(projectId);
    try {
      await rejectProject(projectId, reasonToSend);
      setRejectingId(null);
      setRejectionReason("");
      if (inspectingProject && (String(inspectingProject.id) === String(projectId) || String(inspectingProject._id) === String(projectId))) {
        handleCloseInspect();
      }
      showToast("info", "Revision request sent. Project rejected and admin notified with instructions.");
    } catch (err) {
      showToast("error", err.message || "Failed to reject project");
    } finally {
      setProcessingId(null);
    }
  };

  // Resolved admin for inspecting project
  const inspectingAdmin = useMemo(() => {
    if (!inspectingProject) return null;
    return admins.find(
      (a) =>
        String(a.id) === String(inspectingProject.adminId) ||
        String(a._id) === String(inspectingProject.adminId)
    );
  }, [admins, inspectingProject]);

  // Plots stats for inspecting project
  const plotStats = useMemo(() => {
    const total = inspectingPlots.length;
    const available = inspectingPlots.filter(
      (p) => (p.status || "").toLowerCase() === "available"
    ).length;
    const reserved = inspectingPlots.filter(
      (p) => (p.status || "").toLowerCase() === "reserved"
    ).length;
    const sold = inspectingPlots.filter(
      (p) => (p.status || "").toLowerCase() === "sold"
    ).length;
    return { total, available, reserved, sold };
  }, [inspectingPlots]);

  return (
    <div className="dashboard-page sa-page">
      {/* =====================================================
          HEADER
      ===================================================== */}
      <div className="sa-page-header">
        <div>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
              color: "#a63d2f",
              display: "block",
              marginBottom: "4px",
            }}
          >
            SUPER ADMIN
          </span>
          <h1 className="sa-page-title">Project Approvals & Review Workflow</h1>
          <p className="sa-page-subtitle">
            Review newly submitted projects and pending material modifications before public publishing.
          </p>
        </div>

        {pendingList.length > 0 && (
          <div
            style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0,
            }}
          >
            <FaExclamationTriangle />
            {pendingList.length} Action{pendingList.length > 1 ? "s" : ""} Required
          </div>
        )}
      </div>

      {/* =====================================================
          TOAST NOTIFICATION
      ===================================================== */}
      {toastMessage && (
        <div
          className={`sa-alert-toast ${
            toastMessage.type === "success"
              ? "success"
              : toastMessage.type === "info"
              ? "info"
              : "error"
          }`}
          role="status"
        >
          {toastMessage.type === "success" ? (
            <FaCheckCircle />
          ) : toastMessage.type === "info" ? (
            <FaClock />
          ) : (
            <FaExclamationTriangle />
          )}
          <span>{toastMessage.text}</span>
          <button
            type="button"
            className="sa-alert-toast-close"
            onClick={() => setToastMessage(null)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}

      {/* =====================================================
          EMPTY STATE
      ===================================================== */}
      {pendingList.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "4rem 2rem",
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            marginTop: "8px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "#ecfdf5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              color: "#059669",
              marginBottom: "16px",
            }}
          >
            <FaInbox />
          </div>
          <h3
            style={{
              margin: "0 0 6px",
              fontSize: "16px",
              fontWeight: 700,
              color: "#1e293b",
            }}
          >
            All Projects Approved & Up to Date
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "#64748b",
              maxWidth: "400px",
            }}
          >
            No projects are currently awaiting approval. When admins create new
            projects or modify approved projects, they will appear here.
          </p>
        </div>
      ) : (
        /* =====================================================
            PROJECT APPROVAL CARDS
        ===================================================== */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            marginTop: "8px",
          }}
        >
          {pendingList.map((project) => {
            const admin = admins.find(
              (a) =>
                String(a.id) === String(project.adminId) ||
                String(a._id) === String(project.adminId)
            );
            const isDeletion = Boolean(project.pendingDeletion);
            const isBrandNew = !isDeletion && project.approvalStatus === "PENDING";
            const isUpdate = !isDeletion && project.hasPendingUpdates;
            const isProcessing = processingId === project.id;

            return (
              <div
                key={project.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderLeft: isDeletion
                    ? "4px solid #dc2626"
                    : isBrandNew
                    ? "4px solid #f59e0b"
                    : "4px solid #d9835f",
                  borderRadius: "12px",
                  padding: "20px 24px",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                }}
              >
                {/* Card Top Row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "20px",
                    flexWrap: "wrap",
                  }}
                >
                  {/* Left — Project Info */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {/* Title + Status Badge Row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        flexWrap: "wrap",
                        marginBottom: "10px",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "8px",
                          background: isDeletion
                            ? "#fef2f2"
                            : isBrandNew
                            ? "#fff7ed"
                            : "#fbf0ec",
                          color: isDeletion
                            ? "#dc2626"
                            : isBrandNew
                            ? "#d97706"
                            : "#d9835f",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "16px",
                          flexShrink: 0,
                        }}
                      >
                        {isDeletion ? <FaTrashAlt /> : <FaBuilding />}
                      </div>

                      <div>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: "15px",
                            fontWeight: 800,
                            color: "#0f172a",
                            letterSpacing: "-0.2px",
                          }}
                        >
                          {project.title}
                        </h3>
                      </div>

                      {isDeletion && (
                        <span
                          className="sa-badge"
                          style={{
                            background: "#fef2f2",
                            color: "#b91c1c",
                            border: "1px solid #fecaca",
                            gap: "4px",
                          }}
                        >
                          <FaTrashAlt style={{ fontSize: "9px" }} />
                          Deletion Requested
                        </span>
                      )}
                      {isBrandNew && (
                        <span
                          className="sa-badge"
                          style={{
                            background: "#fff7ed",
                            color: "#b45309",
                            border: "1px solid #fde68a",
                            gap: "4px",
                          }}
                        >
                          <FaClock style={{ fontSize: "9px" }} />
                          New — Pending Approval
                        </span>
                      )}
                      {isUpdate && (
                        <span
                          className="sa-badge"
                          style={{
                            background: "#fbf0ec",
                            color: "#872e22",
                            border: "1px solid #f5d5c7",
                            gap: "4px",
                          }}
                        >
                          <FaTag style={{ fontSize: "9px" }} />
                          Material Edits Staged
                        </span>
                      )}
                    </div>

                    {/* Meta info */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "16px",
                        fontSize: "12px",
                        color: "#64748b",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <FaMapMarkerAlt
                          style={{ fontSize: "11px", color: "#94a3b8" }}
                        />
                        {project.location}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <FaBuilding
                          style={{ fontSize: "11px", color: "#94a3b8" }}
                        />
                        {project.totalPlots} plots ({project.availablePlots} available)
                      </span>
                      <span>
                        Admin:{" "}
                        <strong style={{ color: "#1e293b" }}>
                          {admin ? admin.name : "Unassigned"}
                        </strong>
                      </span>
                      <span>
                        Price:{" "}
                        <strong style={{ color: "#1e293b" }}>
                          {project.plotPrice || "—"}
                        </strong>
                      </span>
                    </div>

                    {/* Deletion Request Panel */}
                    {isDeletion && (
                      <div
                        style={{
                          marginTop: "14px",
                          padding: "12px 14px",
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            color: "#991b1b",
                            marginBottom: "4px",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.4px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <FaExclamationTriangle /> Warning: Admin Requested Permanent Deletion
                        </div>
                        <p style={{ margin: "0 0 6px", color: "#b91c1c", lineHeight: 1.4 }}>
                          If approved, this project and its {project.totalPlots || 0} associated plots will be permanently removed from the database and public listings.
                        </p>
                        {project.deletionReason && (
                          <div style={{ color: "#7f1d1d", fontSize: "11px" }}>
                            <strong>Reason:</strong> {project.deletionReason}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Proposed Changes Panel */}
                    {isUpdate && project.pendingUpdates && (
                      <div
                        style={{
                          marginTop: "14px",
                          padding: "12px 14px",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            color: "#1e293b",
                            marginBottom: "8px",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.4px",
                          }}
                        >
                          Proposed Changes by Admin:
                        </div>
                        <ul
                          style={{
                            margin: 0,
                            padding: "0 0 0 16px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          {Object.entries(project.pendingUpdates).map(
                            ([key, val]) => {
                              if (key === "submittedAt") return null;
                              const currentVal = project[key];
                              return (
                                <li key={key} style={{ color: "#475569" }}>
                                  <strong style={{ color: "#1e293b" }}>
                                    {key}:
                                  </strong>{" "}
                                  &ldquo;{String(currentVal)}&rdquo; &rarr;{" "}
                                  <span
                                    style={{
                                      color: "#a63d2f",
                                      fontWeight: 600,
                                    }}
                                  >
                                    &ldquo;{String(val)}&rdquo;
                                  </span>
                                </li>
                              );
                            }
                          )}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Right — Action Buttons */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      flexShrink: 0,
                      alignItems: "flex-end",
                    }}
                  >
                    {rejectingId === project.id ? (
                      /* Rejection reason input */
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          minWidth: "280px",
                        }}
                      >
                        <input
                          type="text"
                          className="sa-form-field"
                          style={{
                            padding: "9px 12px",
                            border: "1px solid #cbd5e1",
                            borderRadius: "6px",
                            fontSize: "13px",
                            color: "#1e293b",
                            outline: "none",
                            width: "100%",
                            boxSizing: "border-box",
                          }}
                          placeholder={
                            isDeletion
                              ? "Reason for rejecting deletion..."
                              : "Reason for rejection..."
                          }
                          value={rejectionReason}
                          autoFocus
                          onChange={(e) => setRejectionReason(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRejectConfirm(project.id);
                          }}
                        />
                        <div
                          style={{ display: "flex", gap: "8px" }}
                        >
                          <button
                            type="button"
                            className="sa-btn-reject"
                            style={{ flex: 1 }}
                            disabled={isProcessing}
                            onClick={() => handleRejectConfirm(project.id)}
                          >
                            <FaTimesCircle style={{ marginRight: "6px" }} />
                            {isProcessing ? "Processing..." : "Confirm Reject"}
                          </button>
                          <button
                            type="button"
                            className="sa-btn-secondary sa-btn-sm"
                            onClick={() => {
                              setRejectingId(null);
                              setRejectionReason("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Approve / Reject buttons */
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="sa-btn-inspect"
                          disabled={isProcessing}
                          onClick={() => handleOpenInspect(project)}
                        >
                          <FaEye style={{ marginRight: "6px" }} />
                          View Details & Plots
                        </button>

                        {isDeletion ? (
                          <>
                            <button
                              type="button"
                              className="sa-btn-reject"
                              style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff" }}
                              disabled={isProcessing}
                              onClick={() => handleApprove(project.id, true)}
                            >
                              <FaTrashAlt style={{ marginRight: "6px" }} />
                              {isProcessing ? "Deleting..." : "Approve Deletion"}
                            </button>
                            <button
                              type="button"
                              className="sa-btn-secondary"
                              disabled={isProcessing}
                              onClick={() => {
                                setRejectingId(project.id);
                                setRejectionReason("");
                              }}
                            >
                              <FaTimesCircle style={{ marginRight: "6px" }} />
                              Keep Project
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="sa-btn-approve"
                              disabled={isProcessing}
                              onClick={() => handleApprove(project.id)}
                            >
                              <FaCheckCircle style={{ marginRight: "6px" }} />
                              {isProcessing ? "Processing..." : "Approve & Publish"}
                            </button>
                            <button
                              type="button"
                              className="sa-btn-reject"
                              disabled={isProcessing}
                              onClick={() => {
                                setRejectingId(project.id);
                                setRejectionReason("");
                              }}
                            >
                              <FaTimesCircle style={{ marginRight: "6px" }} />
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================
          INSPECTION & REVIEW MODAL
      ===================================================== */}
      {inspectingProject && (
        <div
          className="sa-modal-overlay"
          onClick={handleCloseInspect}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="sa-modal sa-inspect-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sa-modal-header sa-inspect-modal-header">
              <div>
                <div className="sa-inspect-kicker">
                  PROJECT REVIEW &bull; ID #{inspectingProject.customId || inspectingProject.id}
                </div>
                <h3 className="sa-inspect-title">{inspectingProject.title}</h3>
                <div className="sa-inspect-meta-tags">
                  <span className="sa-pill-meta">
                    <FaMapMarkerAlt style={{ marginRight: "4px" }} />
                    {inspectingProject.location}, {inspectingProject.city}
                  </span>
                  <span className="sa-pill-meta">
                    <FaTag style={{ marginRight: "4px" }} />
                    {inspectingProject.category || inspectingProject.plotType}
                  </span>
                  <span className={`sa-badge ${inspectingProject.approvalStatus === "PENDING" ? "sa-badge-pending" : ""}`}>
                    {inspectingProject.approvalStatus}
                  </span>
                  {inspectingProject.pendingDeletion && (
                    <span className="sa-badge" style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>
                      Deletion Requested
                    </span>
                  )}
                  {inspectingProject.hasPendingUpdates && (
                    <span className="sa-badge" style={{ background: "#fbf0ec", color: "#872e22", border: "1px solid #f5d5c7" }}>
                      Updates Staged
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="sa-modal-close"
                onClick={handleCloseInspect}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            {/* Tabs */}
            <div className="sa-inspect-tabs-bar">
              <button
                type="button"
                className={`sa-inspect-tab-btn ${activeInspectTab === "overview" ? "active" : ""}`}
                onClick={() => setActiveInspectTab("overview")}
              >
                <FaBuilding /> Overview & Details
              </button>
              <button
                type="button"
                className={`sa-inspect-tab-btn ${activeInspectTab === "plots" ? "active" : ""}`}
                onClick={() => setActiveInspectTab("plots")}
              >
                <FaLayerGroup /> Plot Inventory ({loadingPlots ? "..." : inspectingPlots.length})
              </button>
              {inspectingProject.hasPendingUpdates && (
                <button
                  type="button"
                  className={`sa-inspect-tab-btn ${activeInspectTab === "updates" ? "active" : ""}`}
                  onClick={() => setActiveInspectTab("updates")}
                >
                  <FaTag /> Staged Changes
                </button>
              )}
              <button
                type="button"
                className={`sa-inspect-tab-btn ${activeInspectTab === "feedback" ? "active" : ""}`}
                onClick={() => setActiveInspectTab("feedback")}
              >
                <FaCommentDots /> Admin & Revision Notes
              </button>
            </div>

            {/* Body */}
            <div className="sa-inspect-body">
              {/* TAB 1: OVERVIEW & DETAILS */}
              {activeInspectTab === "overview" && (
                <div>
                  {inspectingProject.image && (
                    <img
                      src={inspectingProject.image}
                      alt={inspectingProject.title}
                      className="sa-inspect-hero"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}

                  {Array.isArray(inspectingProject.images) && inspectingProject.images.length > 0 && (
                    <div>
                      <span className="sa-inspect-spec-label">Project Gallery ({inspectingProject.images.length})</span>
                      <div className="sa-inspect-gallery">
                        {inspectingProject.images.map((imgUrl, i) => (
                          <img
                            key={i}
                            src={imgUrl}
                            alt={`Gallery ${i + 1}`}
                            className="sa-inspect-gallery-thumb"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="sa-inspect-specs-grid">
                    <div className="sa-inspect-spec-card">
                      <div className="sa-inspect-spec-label">Price Range / String</div>
                      <div className="sa-inspect-spec-value">{inspectingProject.plotPrice || "—"}</div>
                    </div>
                    <div className="sa-inspect-spec-card">
                      <div className="sa-inspect-spec-label">Starting Price</div>
                      <div className="sa-inspect-spec-value">
                        {inspectingProject.priceLakhs ? `₹${inspectingProject.priceLakhs} Lakhs` : "—"}
                      </div>
                    </div>
                    <div className="sa-inspect-spec-card">
                      <div className="sa-inspect-spec-label">Plot Sizes</div>
                      <div className="sa-inspect-spec-value">{inspectingProject.plotSizes || "—"}</div>
                    </div>
                    <div className="sa-inspect-spec-card">
                      <div className="sa-inspect-spec-label">Project Area / Size</div>
                      <div className="sa-inspect-spec-value">{inspectingProject.projectSize || "—"}</div>
                    </div>
                    <div className="sa-inspect-spec-card">
                      <div className="sa-inspect-spec-label">Distance from Hub</div>
                      <div className="sa-inspect-spec-value">{inspectingProject.distance || "—"}</div>
                    </div>
                    <div className="sa-inspect-spec-card">
                      <div className="sa-inspect-spec-label">Launch Date / Status</div>
                      <div className="sa-inspect-spec-value">
                        {inspectingProject.status || "Active"} ({inspectingProject.launchDate || "—"})
                      </div>
                    </div>
                  </div>

                  {/* About / Description */}
                  <div style={{ marginBottom: "20px" }}>
                    <div className="sa-inspect-spec-label">About Project & Description</div>
                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "14px",
                        fontSize: "13px",
                        color: "#334155",
                        lineHeight: 1.6,
                        whiteSpace: "pre-line",
                      }}
                    >
                      {inspectingProject.about?.description || inspectingProject.details || "No primary description provided."}
                      {inspectingProject.about?.additionalDescription && (
                        <p style={{ marginTop: "10px", color: "#475569" }}>
                          {inspectingProject.about.additionalDescription}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Amenities */}
                  {Array.isArray(inspectingProject.amenities) && inspectingProject.amenities.length > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <div className="sa-inspect-spec-label">Amenities</div>
                      <div className="sa-inspect-chips">
                        {inspectingProject.amenities.map((item, idx) => (
                          <span key={idx} className="sa-inspect-chip">
                            <FaCheck style={{ color: "#059669" }} /> {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Highlights */}
                  {Array.isArray(inspectingProject.highlights) && inspectingProject.highlights.length > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <div className="sa-inspect-spec-label">Highlights</div>
                      <div className="sa-inspect-chips">
                        {inspectingProject.highlights.map((item, idx) => (
                          <span key={idx} className="sa-inspect-chip" style={{ background: "#fbf0ec", color: "#1e40af" }}>
                            ★ {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Connectivity */}
                  {Array.isArray(inspectingProject.locationConnectivity) && inspectingProject.locationConnectivity.length > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <div className="sa-inspect-spec-label">Connectivity & Nearby Landmarks</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginTop: "8px" }}>
                        {inspectingProject.locationConnectivity.map((conn, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              borderRadius: "6px",
                              padding: "8px 12px",
                              fontSize: "12px",
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
                            <span style={{ fontWeight: 600, color: "#1e293b" }}>{conn.name}</span>
                            <span style={{ color: "#a63d2f", fontWeight: 700 }}>{conn.distance}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PLOT INVENTORY */}
              {activeInspectTab === "plots" && (
                <div>
                  <div className="sa-inspect-stats-grid">
                    <div className="sa-inspect-stat-box total">
                      <div className="sa-inspect-stat-num">{plotStats.total}</div>
                      <div className="sa-inspect-stat-lbl">Total Plots</div>
                    </div>
                    <div className="sa-inspect-stat-box available">
                      <div className="sa-inspect-stat-num" style={{ color: "#059669" }}>{plotStats.available}</div>
                      <div className="sa-inspect-stat-lbl">Available</div>
                    </div>
                    <div className="sa-inspect-stat-box reserved">
                      <div className="sa-inspect-stat-num" style={{ color: "#d97706" }}>{plotStats.reserved}</div>
                      <div className="sa-inspect-stat-lbl">Reserved</div>
                    </div>
                    <div className="sa-inspect-stat-box sold">
                      <div className="sa-inspect-stat-num" style={{ color: "#64748b" }}>{plotStats.sold}</div>
                      <div className="sa-inspect-stat-lbl">Sold</div>
                    </div>
                  </div>

                  {loadingPlots ? (
                    <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                      <FaClock style={{ fontSize: "24px", marginBottom: "8px" }} />
                      <p>Loading project plots from database...</p>
                    </div>
                  ) : plotsError ? (
                    <div className="sa-form-error">
                      <FaExclamationTriangle style={{ marginRight: "6px" }} />
                      {plotsError}
                    </div>
                  ) : inspectingPlots.length === 0 ? (
                    <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                      <FaLayerGroup style={{ fontSize: "32px", marginBottom: "8px", color: "#cbd5e1" }} />
                      <p style={{ margin: 0, fontWeight: 600 }}>No plots found for this project.</p>
                      <small>Plots have not yet been generated or inserted by the admin.</small>
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                      <table className="sa-inspect-table">
                        <thead>
                          <tr>
                            <th>Plot #</th>
                            <th>Size</th>
                            <th>Facing</th>
                            <th>Price</th>
                            <th>Status</th>
                            <th>Corner Plot</th>
                            <th>Thumbnail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inspectingPlots.map((plot) => (
                            <tr key={plot._id || plot.id || plot.customId}>
                              <td>
                                <strong style={{ color: "#a63d2f" }}>#{plot.plotNumber}</strong>
                              </td>
                              <td>{plot.size || "—"}</td>
                              <td>{plot.facing || "—"}</td>
                              <td>{plot.price || "—"}</td>
                              <td>
                                <span
                                  className="sa-badge"
                                  style={{
                                    background:
                                      (plot.status || "").toLowerCase() === "available"
                                        ? "#ecfdf5"
                                        : (plot.status || "").toLowerCase() === "reserved"
                                        ? "#fff7ed"
                                        : "#f1f5f9",
                                    color:
                                      (plot.status || "").toLowerCase() === "available"
                                        ? "#059669"
                                        : (plot.status || "").toLowerCase() === "reserved"
                                        ? "#b45309"
                                        : "#64748b",
                                    border:
                                      (plot.status || "").toLowerCase() === "available"
                                        ? "1px solid #a7f3d0"
                                        : (plot.status || "").toLowerCase() === "reserved"
                                        ? "1px solid #fde68a"
                                        : "1px solid #cbd5e1",
                                  }}
                                >
                                  {plot.status}
                                </span>
                              </td>
                              <td>{plot.cornerPlot ? "Yes (Corner)" : "Standard"}</td>
                              <td>
                                {plot.image ? (
                                  <img
                                    src={plot.image}
                                    alt={`Plot ${plot.plotNumber}`}
                                    style={{ width: "36px", height: "36px", borderRadius: "4px", objectFit: "cover" }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                ) : (
                                  <span style={{ color: "#94a3b8", fontSize: "11px" }}>No img</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: STAGED CHANGES */}
              {activeInspectTab === "updates" && inspectingProject.pendingUpdates && (
                <div>
                  <div style={{ marginBottom: "14px", fontSize: "13px", color: "#475569" }}>
                    The assigned admin has requested the following changes to this active project. Review each modification:
                  </div>
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                    <table className="sa-inspect-table">
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Current Live Value</th>
                          <th>Proposed Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(inspectingProject.pendingUpdates).map(([k, v]) => {
                          if (k === "submittedAt") return null;
                          return (
                            <tr key={k}>
                              <td><strong>{k}</strong></td>
                              <td style={{ color: "#64748b" }}>{String(inspectingProject[k] ?? "—")}</td>
                              <td style={{ color: "#a63d2f", fontWeight: 700 }}>{String(v)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: ADMIN & REVISION NOTES */}
              {activeInspectTab === "feedback" && (
                <div>
                  {/* Admin info card */}
                  <div className="sa-inspect-admin-card">
                    <div className="sa-inspect-admin-avatar">
                      <FaUser />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                        <h4 style={{ margin: 0, fontSize: "15px", color: "#0f172a" }}>
                          {inspectingAdmin ? inspectingAdmin.name : "Unassigned Administrator"}
                        </h4>
                        {inspectingAdmin && (
                          <span className={`sa-badge ${inspectingAdmin.status === "Active" ? "sa-badge-active" : "sa-badge-inactive"}`}>
                            {inspectingAdmin.status}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "12px", color: "#64748b" }}>
                        {inspectingAdmin?.email && (
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <FaEnvelope style={{ color: "#94a3b8" }} /> {inspectingAdmin.email}
                          </span>
                        )}
                        {inspectingAdmin?.phone && (
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <FaPhone style={{ color: "#94a3b8" }} /> {inspectingAdmin.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Revision notes input */}
                  <div
                    style={{
                      background: "#fff7ed",
                      border: "1px solid #fed7aa",
                      borderRadius: "10px",
                      padding: "18px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#9a3412", fontWeight: 700, fontSize: "13px", marginBottom: "6px" }}>
                      <FaCommentDots />
                      Revision & Change Request Instructions for Admin
                    </div>
                    <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#c2410c", lineHeight: 1.5 }}>
                      If changes are required before this project can be published, explain the required modifications below. Clicking &ldquo;Send Revision Request & Reject&rdquo; will return the project to the admin&rsquo;s &ldquo;Rejected Projects&rdquo; list with your feedback so they can fix and resubmit.
                    </p>

                    <textarea
                      rows={4}
                      className="sa-form-field"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        fontSize: "13px",
                        color: "#1e293b",
                        outline: "none",
                        boxSizing: "border-box",
                        resize: "vertical",
                        background: "#ffffff",
                      }}
                      placeholder="e.g., Please provide higher resolution layout plans, verify the total plot pricing calculations, and correct the nearby landmark distances..."
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                    />

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                      <button
                        type="button"
                        className="sa-btn-reject"
                        disabled={processingId === inspectingProject.id}
                        onClick={() => handleRejectConfirm(inspectingProject.id, feedbackText)}
                      >
                        <FaTimesCircle style={{ marginRight: "6px" }} />
                        {processingId === inspectingProject.id ? "Sending..." : "Send Revision Request & Reject Project"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sa-inspect-footer">

              <div className="sa-inspect-footer-actions">
                <button
                  type="button"
                  className="sa-btn-secondary"
                  onClick={handleCloseInspect}
                >
                  Close
                </button>

                {inspectingProject.pendingDeletion ? (
                  <>
                    <button
                      type="button"
                      className="sa-btn-secondary"
                      disabled={processingId === inspectingProject.id}
                      onClick={() => handleRejectConfirm(inspectingProject.id, "Deletion denied by Super Admin.")}
                    >
                      <FaTimesCircle style={{ marginRight: "6px" }} />
                      Keep Project
                    </button>
                    <button
                      type="button"
                      className="sa-btn-reject"
                      style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff" }}
                      disabled={processingId === inspectingProject.id}
                      onClick={() => handleApprove(inspectingProject.id, true)}
                    >
                      <FaTrashAlt style={{ marginRight: "6px" }} />
                      {processingId === inspectingProject.id ? "Deleting..." : "Approve Deletion"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="sa-btn-reject"
                      disabled={processingId === inspectingProject.id}
                      onClick={() => {
                        if (activeInspectTab !== "feedback") {
                          setActiveInspectTab("feedback");
                        } else {
                          handleRejectConfirm(inspectingProject.id, feedbackText);
                        }
                      }}
                    >
                      <FaTimesCircle style={{ marginRight: "6px" }} />
                      {activeInspectTab === "feedback" ? "Confirm Reject / Request Changes" : "Request Changes"}
                    </button>
                    <button
                      type="button"
                      className="sa-btn-approve"
                      disabled={processingId === inspectingProject.id}
                      onClick={() => handleApprove(inspectingProject.id)}
                    >
                      <FaCheckCircle style={{ marginRight: "6px" }} />
                      {processingId === inspectingProject.id ? "Processing..." : "Approve & Publish"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectApprovals;
