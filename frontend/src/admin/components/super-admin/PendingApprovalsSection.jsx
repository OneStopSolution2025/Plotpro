import { useState, useMemo } from "react";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaBuilding,
  FaMapMarkerAlt,
  FaTag,
} from "react-icons/fa";
import ConfirmationModal from "../ConfirmationModal";

/**
 * Super Admin Pending Project & Edit Approvals Component
 */
const PendingApprovalsSection = ({
  projects = [],
  admins = [],
  approveProject,
  rejectProject,
}) => {
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [alertModal, setAlertModal] = useState(null);

  const pendingList = useMemo(() => {
    return projects.filter(
      (p) => p.approvalStatus === "PENDING" || p.hasPendingUpdates
    );
  }, [projects]);

  const handleApprove = async (projectId) => {
    setProcessingId(projectId);
    try {
      await approveProject(projectId);
      setSuccessMsg("Project approved successfully and published to public listings!");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setAlertModal({
        title: "Approval Failed",
        message: err.message || "Failed to approve project",
        type: "danger",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectConfirm = async (projectId) => {
    if (!rejectionReason.trim()) {
      setAlertModal({
        title: "Reason Required",
        message: "Please provide a reason or revision note for rejection.",
        type: "warning",
      });
      return;
    }
    setProcessingId(projectId);
    try {
      await rejectProject(projectId, rejectionReason);
      setRejectingId(null);
      setRejectionReason("");
      setSuccessMsg("Project updates/creation rejected.");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setAlertModal({
        title: "Rejection Failed",
        message: err.message || "Failed to reject project",
        type: "danger",
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section id="pending-approvals-section" className="dashboard-section sa-section">
      <div className="dashboard-section-header">
        <div>
          <h2>Project Approvals &amp; Review Workflow</h2>
          <p>
            Review newly submitted projects and pending material modifications submitted by Administrators before public publishing.
          </p>
        </div>
        {pendingList.length > 0 && (
          <span className="badge bg-warning text-dark px-3 py-2 rounded-pill fw-semibold">
            {pendingList.length} Action Required
          </span>
        )}
      </div>

      {successMsg && (
        <div className="alert alert-success d-flex align-items-center mb-3">
          <FaCheckCircle className="me-2" />
          <span>{successMsg}</span>
        </div>
      )}

      {pendingList.length === 0 ? (
        <div className="p-4 text-center border rounded-3 bg-light text-muted">
          <FaCheckCircle className="text-success mb-2" size={32} />
          <h5 className="fw-semibold">All Projects Approved &amp; Up to Date</h5>
          <p className="mb-0 small">
            No projects are currently awaiting approval. When admins create new projects or modify approved projects, they will appear here.
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {pendingList.map((project) => {
            const admin = admins.find(
              (a) => String(a.id) === String(project.adminId) || String(a._id) === String(project.adminId)
            );
            const isBrandNew = project.approvalStatus === "PENDING";
            const isUpdate = project.hasPendingUpdates;
            const isProcessing = processingId === project.id;

            return (
              <div
                key={project.id}
                className="card shadow-sm border-0 p-3"
                style={{
                  borderLeft: isBrandNew ? "4px solid #f59e0b" : "4px solid #d9835f",
                  backgroundColor: "#ffffff",
                }}
              >
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                  <div>
                    <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <h4 className="mb-0 fw-bold">{project.title}</h4>
                      {isBrandNew && (
                        <span className="badge bg-warning text-dark">
                          <FaClock className="me-1" /> New Project Pending Approval
                        </span>
                      )}
                      {isUpdate && (
                        <span className="badge bg-info text-dark">
                          <FaTag className="me-1" /> Material Edits Staged for Approval
                        </span>
                      )}
                    </div>

                    <div className="d-flex gap-3 text-muted small flex-wrap mt-1">
                      <span>
                        <FaMapMarkerAlt className="me-1 text-secondary" />
                        {project.location}
                      </span>
                      <span>
                        <FaBuilding className="me-1 text-secondary" />
                        Total Plots: {project.totalPlots} ({project.availablePlots} available)
                      </span>
                      <span>
                        Managed by: <strong>{admin ? admin.name : "Unassigned"}</strong>
                      </span>
                      <span>Starting: {project.plotPrice}</span>
                    </div>

                    {isUpdate && project.pendingUpdates && (
                      <div className="mt-3 p-2 rounded bg-light border small">
                        <strong>Proposed Changes by Admin:</strong>
                        <ul className="mb-0 ps-3 mt-1">
                          {Object.entries(project.pendingUpdates).map(([key, val]) => {
                            if (key === "submittedAt") return null;
                            const currentVal = project[key];
                            return (
                              <li key={key}>
                                <strong>{key}:</strong> &ldquo;{String(currentVal)}&rdquo; &rarr;{" "}
                                <span className="text-primary fw-semibold">&ldquo;{String(val)}&rdquo;</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="d-flex gap-2 align-items-center">
                    {rejectingId === project.id ? (
                      <div className="d-flex flex-column gap-2" style={{ minWidth: "260px" }}>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Reason for rejection..."
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                        />
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-danger flex-grow-1"
                            disabled={isProcessing}
                            onClick={() => handleRejectConfirm(project.id)}
                          >
                            Confirm Reject
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
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
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-success px-3 py-2 fw-semibold"
                          disabled={isProcessing}
                          onClick={() => handleApprove(project.id)}
                        >
                          <FaCheckCircle className="me-1" />
                          {isProcessing ? "Processing..." : "Approve & Publish"}
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger px-3 py-2 fw-semibold"
                          disabled={isProcessing}
                          onClick={() => {
                            setRejectingId(project.id);
                            setRejectionReason("");
                          }}
                        >
                          <FaTimesCircle className="me-1" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
    </section>
  );
};

export default PendingApprovalsSection;
