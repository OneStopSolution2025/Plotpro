import { useState, useEffect, useCallback } from "react";
import { supremeAdminApi } from "../../../services/api";
import {
  FaShieldAlt,
  FaSync,
  FaCheckCircle,
  FaTimesCircle,
  FaBan,
  FaExclamationTriangle,
  FaHistory,
  FaLaptop,
  FaMobileAlt,
  FaKey,
  FaUserShield,
} from "react-icons/fa";
import "../../styles/super-admin.css";

const TrustedDevices = () => {
  const [activeTab, setActiveTab] = useState("pending"); // 'pending' | 'active'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeDevices, setActiveDevices] = useState([]);

  // Modals state
  const [actionModal, setActionModal] = useState({
    type: null, // 'approve' | 'reject' | 'revoke' | 'emergencyReset'
    item: null,
  });
  const [reviewNote, setReviewNote] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "pending") {
        const res = await supremeAdminApi.getPendingDevices();
        if (res?.success) setPendingRequests(res.data || []);
      } else if (activeTab === "active") {
        const res = await supremeAdminApi.getActiveDevices();
        if (res?.success) setActiveDevices(res.data || []);
      }
    } catch (err) {
      setError(err.message || "Failed to load device data.");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async () => {
    if (!actionModal.item) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await supremeAdminApi.approveDeviceRequest(actionModal.item._id, {
        reviewNotes: reviewNote,
      });
      if (res?.success) {
        setSuccessMsg("Device approved and activated. Previous device was replaced.");
        setActionModal({ type: null, item: null });
        setReviewNote("");
        fetchData();
      }
    } catch (err) {
      setError(err.message || "Failed to approve device.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!actionModal.item) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await supremeAdminApi.rejectDeviceRequest(actionModal.item._id, {
        reviewNotes: reviewNote,
      });
      if (res?.success) {
        setSuccessMsg("Device request rejected.");
        setActionModal({ type: null, item: null });
        setReviewNote("");
        fetchData();
      }
    } catch (err) {
      setError(err.message || "Failed to reject device.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!actionModal.item) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await supremeAdminApi.revokeDevice(actionModal.item._id, {
        reason: reviewNote,
      });
      if (res?.success) {
        setSuccessMsg("Device revoked. Active sessions terminated.");
        setActionModal({ type: null, item: null });
        setReviewNote("");
        fetchData();
      }
    } catch (err) {
      setError(err.message || "Failed to revoke device.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmergencyReset = async () => {
    if (!actionModal.item) return;
    if (reviewNote.trim().length < 15) {
      setError("Justification reason must be at least 15 characters.");
      return;
    }
    if (!adminPassword) {
      setError("Supreme Admin password confirmation is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await supremeAdminApi.emergencyResetDevice({
        targetUserId: actionModal.item.userId?._id || actionModal.item._id,
        adminPassword,
        justificationReason: reviewNote,
      });
      if (res?.success) {
        setSuccessMsg("Emergency reset executed successfully.");
        setActionModal({ type: null, item: null });
        setReviewNote("");
        setAdminPassword("");
        fetchData();
      }
    } catch (err) {
      setError(err.message || "Emergency reset failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="super-admin-content" style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 6px", color: "#0f172a" }}>
            Trusted Device Security Oversight
          </h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: "14px" }}>
            Strict One-Approved-Device-Per-Account policy enforcement for Super Admins and Branch Admins.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="btn btn-outline-secondary"
          style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}
        >
          <FaSync className={loading ? "spinner" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="alert alert-danger" style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px" }}>
          <FaExclamationTriangle />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success" style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px" }}>
          <FaCheckCircle />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "10px", borderBottom: "2px solid #e2e8f0", marginBottom: "20px" }}>
        <button
          onClick={() => setActiveTab("pending")}
          style={{
            padding: "10px 18px",
            border: "none",
            background: "none",
            fontWeight: 700,
            fontSize: "14px",
            color: activeTab === "pending" ? "#2563eb" : "#64748b",
            borderBottom: activeTab === "pending" ? "3px solid #2563eb" : "none",
            cursor: "pointer",
          }}
        >
          Pending Device Approvals ({pendingRequests.length})
        </button>
        <button
          onClick={() => setActiveTab("active")}
          style={{
            padding: "10px 18px",
            border: "none",
            background: "none",
            fontWeight: 700,
            fontSize: "14px",
            color: activeTab === "active" ? "#2563eb" : "#64748b",
            borderBottom: activeTab === "active" ? "3px solid #2563eb" : "none",
            cursor: "pointer",
          }}
        >
          Active Trusted Devices ({activeDevices.length})
        </button>
      </div>

      {/* ──────────────── TAB 1: PENDING APPROVAL REQUESTS ──────────────── */}
      {activeTab === "pending" && (
        <div className="card shadow-sm border-0" style={{ borderRadius: "12px", overflow: "hidden" }}>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: "13.5px" }}>
              <thead style={{ background: "#f8fafc", color: "#475569" }}>
                <tr>
                  <th>ADMIN / TENANT</th>
                  <th>ROLE</th>
                  <th>NEW REQUESTED DEVICE</th>
                  <th>CURRENT APPROVED DEVICE</th>
                  <th>REQUESTED AT</th>
                  <th style={{ textAlign: "right" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                      No pending device registration requests.
                    </td>
                  </tr>
                ) : (
                  pendingRequests.map((r) => (
                    <tr key={r._id}>
                      <td>
                        <strong>{r.user?.name || "Unknown"}</strong>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{r.user?.email}</div>
                        {r.tenant?.businessName && (
                          <div style={{ fontSize: "11px", color: "#2563eb" }}>Tenant: {r.tenant.businessName}</div>
                        )}
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border">{r.role}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.deviceLabel}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          {r.os?.name} • {r.browser?.name}
                        </div>
                        <div style={{ marginTop: "4px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          <span className="badge bg-primary text-white" style={{ fontSize: "10px" }}>
                            💻 Workstation Transfer Request
                          </span>
                        </div>
                      </td>
                      <td>
                        {r.currentApprovedDevice ? (
                          <div>
                            <div style={{ fontWeight: 600, color: "#dc2626" }}>
                              {r.currentApprovedDevice.deviceLabel}
                            </div>
                            <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                              Will be replaced & revoked
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "#16a34a", fontSize: "12px", fontWeight: 600 }}>None (First Device)</span>
                        )}
                      </td>
                      <td>{new Date(r.requestedAt).toLocaleString("en-IN")}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          onClick={() => setActionModal({ type: "approve", item: r })}
                          className="btn btn-sm btn-success me-2"
                          style={{ fontSize: "12px" }}
                        >
                          Approve & Replace
                        </button>
                        <button
                          onClick={() => setActionModal({ type: "reject", item: r })}
                          className="btn btn-sm btn-outline-danger"
                          style={{ fontSize: "12px" }}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────── TAB 2: ACTIVE TRUSTED DEVICES ──────────────── */}
      {activeTab === "active" && (
        <div className="card shadow-sm border-0" style={{ borderRadius: "12px", overflow: "hidden" }}>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: "13.5px" }}>
              <thead style={{ background: "#f8fafc", color: "#475569" }}>
                <tr>
                  <th>ADMIN / TENANT</th>
                  <th>ROLE</th>
                  <th>APPROVED DEVICE</th>
                  <th>APPROVED AT</th>
                  <th>LAST ACTIVE</th>
                  <th style={{ textAlign: "right" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {activeDevices.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                      No active trusted devices found.
                    </td>
                  </tr>
                ) : (
                  activeDevices.map((d) => (
                    <tr key={d._id}>
                      <td>
                        <strong>{d.userId?.name || "Unknown"}</strong>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{d.userId?.email}</div>
                        {d.userId?.businessName && (
                          <div style={{ fontSize: "11px", color: "#2563eb" }}>Business: {d.userId.businessName}</div>
                        )}
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border">{d.role}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{d.deviceLabel}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          {d.os?.name} • {d.browser?.name}
                        </div>
                        <div style={{ marginTop: "4px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          <span className="badge bg-success text-white" style={{ fontSize: "10px" }}>
                            {d.isCurrentSession ? "🟢 Active Session" : "⚪ Standby / Logged Out"}
                          </span>
                        </div>
                      </td>
                      <td>{new Date(d.approvedAt).toLocaleDateString("en-IN")}</td>
                      <td>{d.lastUsedAt ? new Date(d.lastUsedAt).toLocaleString("en-IN") : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          onClick={() => setActionModal({ type: "revoke", item: d })}
                          className="btn btn-sm btn-outline-danger me-2"
                          style={{ fontSize: "12px" }}
                        >
                          Revoke Device
                        </button>
                        <button
                          onClick={() => setActionModal({ type: "emergencyReset", item: d })}
                          className="btn btn-sm btn-danger"
                          style={{ fontSize: "12px" }}
                        >
                          Emergency Reset
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────── ACTION MODAL ──────────────── */}
      {actionModal.type && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div style={{ background: "#ffffff", borderRadius: "14px", width: "100%", maxWidth: "500px", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px", color: "#0f172a" }}>
              {actionModal.type === "approve" && "Confirm Device Approval & Replacement"}
              {actionModal.type === "reject" && "Reject Device Registration"}
              {actionModal.type === "revoke" && "Revoke Trusted Device Access"}
              {actionModal.type === "emergencyReset" && "Emergency Device Reset"}
            </h3>

            <p style={{ fontSize: "13.5px", color: "#64748b", lineHeight: "1.5" }}>
              {actionModal.type === "approve" &&
                "Approving this new device will atomically mark any previous approved workstation as REPLACED and immediately revoke its active sessions."}
              {actionModal.type === "reject" && "The pending device registration will be rejected."}
              {actionModal.type === "revoke" &&
                "Revoking this device will terminate all active administrative dashboard sessions immediately."}
              {actionModal.type === "emergencyReset" &&
                "This action revokes all existing devices for this user and cancels all pending requests. Supreme Admin password reauthentication is strictly required."}
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                {actionModal.type === "emergencyReset" ? "Justification Reason (Mandatory, min 15 chars)*" : "Audit / Review Note (Optional)"}
              </label>
              <textarea
                rows="3"
                className="form-control"
                placeholder="Enter justification or review details..."
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                style={{ fontSize: "13px" }}
              />
            </div>

            {actionModal.type === "emergencyReset" && (
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#dc2626", marginBottom: "6px" }}>
                  Supreme Admin Password Confirmation*
                </label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Enter your Supreme Admin password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  style={{ fontSize: "13px" }}
                  required
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setActionModal({ type: null, item: null });
                  setReviewNote("");
                  setAdminPassword("");
                }}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              {actionModal.type === "approve" && (
                <button type="button" className="btn btn-success" onClick={handleApprove} disabled={isSubmitting}>
                  {isSubmitting ? "Approving..." : "Confirm Approval"}
                </button>
              )}
              {actionModal.type === "reject" && (
                <button type="button" className="btn btn-danger" onClick={handleReject} disabled={isSubmitting}>
                  {isSubmitting ? "Rejecting..." : "Reject Request"}
                </button>
              )}
              {actionModal.type === "revoke" && (
                <button type="button" className="btn btn-danger" onClick={handleRevoke} disabled={isSubmitting}>
                  {isSubmitting ? "Revoking..." : "Revoke Device"}
                </button>
              )}
              {actionModal.type === "emergencyReset" && (
                <button type="button" className="btn btn-danger" onClick={handleEmergencyReset} disabled={isSubmitting}>
                  {isSubmitting ? "Executing Reset..." : "Execute Emergency Reset"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrustedDevices;
