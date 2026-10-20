import { useState, useEffect, useCallback } from "react";
import { supremeAdminApi } from "../../../services/api";
import {
  FaCalendarCheck,
  FaSync,
  FaCheckCircle,
  FaBan,
  FaClock,
} from "react-icons/fa";
import CustomDropdown from "../../components/CustomDropdown";
import "../../styles/super-admin.css";

const SubscriptionManagement = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  // Quick Action Modal
  const [actionTarget, setActionTarget] = useState(null);
  const [actionForm, setActionForm] = useState({
    status: "ACTIVE",
    extendDays: 30,
  });
  const [updating, setUpdating] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (type, text) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchSubscriptions = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await supremeAdminApi.getSubscriptions(params);
      if (res?.success) {
        setSubscriptions(res.data);
      }
    } catch (err) {
      console.error("[SubscriptionManagement] Fetch error:", err);
      if (!isSilent) {
        setError(err.message || "Failed to load subscriptions.");
      }
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchSubscriptions(false);

    // Auto-sync subscriptions every 8 seconds in background
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchSubscriptions(true);
      }
    }, 8000);

    const handleFocus = () => fetchSubscriptions(true);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [fetchSubscriptions]);

  const handleOpenAction = (sub) => {
    setActionTarget(sub);
    setActionForm({
      status: sub.effectiveStatus === "EXPIRED" ? "ACTIVE" : sub.status,
      extendDays: 30,
    });
  };

  const handleActionSubmit = async (e) => {
    e.preventDefault();
    if (!actionTarget) return;
    setUpdating(true);
    try {
      const res = await supremeAdminApi.updateSubscriptionStatus(actionTarget._id, actionForm);
      if (res?.success) {
        showToast("success", "Subscription updated successfully.");
        setActionTarget(null);
        fetchSubscriptions();
      }
    } catch (err) {
      showToast("error", err.message || "Failed to update subscription.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="dashboard-page sa-page">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 9999,
            padding: "12px 20px",
            borderRadius: "6px",
            color: "#fff",
            backgroundColor: toastMessage.type === "success" ? "#059669" : "#dc2626",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {toastMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="sa-page-header">
        <div>
          <span className="sa-brand-tag">SUBSCRIPTION LIFECYCLE</span>
          <h1 className="sa-page-title">
            Active & Expired <span>Subscriptions</span>
          </h1>
          <p className="sa-page-subtitle">
            Inspect tenant validity, renew terms, or suspend subscriptions across the platform.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="sa-card sa-filter-bar">
        <div className="sa-filter-controls">
          <div style={{ width: "230px" }}>
            <CustomDropdown
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder="All Subscription Statuses"
            >
              <option value="">All Subscription Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="TRIAL">Trial</option>
            </CustomDropdown>
          </div>
        </div>
        <button type="button" className="sa-btn-outline" onClick={fetchSubscriptions}>
          <FaSync /> Refresh
        </button>
      </div>

      {/* Subscriptions Table */}
      <div className="sa-card" style={{ overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <div className="spinner-border text-primary" role="status" />
          </div>
        ) : error ? (
          <div className="alert alert-danger m-3">{error}</div>
        ) : subscriptions.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "#64748b" }}>
            <FaCalendarCheck style={{ fontSize: "40px", color: "#cbd5e1", marginBottom: "12px" }} />
            <p>No subscriptions found.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: "14px" }}>
              <thead style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <tr style={{ color: "#475569", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  <th style={{ padding: "14px 16px" }}>Subscriber</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Seat Entitlement</th>
                  <th>Start Date</th>
                  <th>Expiry Date</th>
                  <th style={{ textAlign: "right", paddingRight: "16px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => {
                  const isExp = sub.effectiveStatus === "EXPIRED";
                  return (
                    <tr key={sub._id}>
                      <td style={{ padding: "14px 16px" }}>
                        <strong style={{ color: "#1e293b" }}>{sub.subscriberId?.name || "Subscriber"}</strong>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{sub.subscriberId?.email}</div>
                      </td>
                      <td>
                        <span className="badge bg-light text-dark" style={{ border: "1px solid #cbd5e1" }}>
                          {sub.planId?.name || "Plan"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            isExp
                              ? "bg-danger"
                              : sub.status === "ACTIVE"
                              ? "bg-success"
                              : sub.status === "SUSPENDED"
                              ? "bg-warning text-dark"
                              : "bg-info text-dark"
                          }`}
                        >
                          {isExp ? "Expired" : sub.status}
                        </span>
                      </td>
                      <td>
                        <strong>{sub.usedSeats || 0}</strong> /{" "}
                        {sub.assignedSeats >= 999999 ? "∞ active" : `${sub.assignedSeats} active`}
                      </td>
                      <td style={{ color: "#64748b", fontSize: "13px" }}>
                        {new Date(sub.startDate).toLocaleDateString()}
                      </td>
                      <td style={{ color: isExp ? "#dc2626" : "#1e293b", fontWeight: 600, fontSize: "13px" }}>
                        {new Date(sub.expiryDate).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: "right", paddingRight: "16px" }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => handleOpenAction(sub)}
                        >
                          Renew / Status
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {actionTarget && (
        <div className="sa-modal-responsive">
          <div className="sa-modal-responsive-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
              <h4 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>
                Manage Subscription
              </h4>
              <button type="button" className="btn-close" onClick={() => setActionTarget(null)} />
            </div>

            <div className="sa-modal-body-scroll">
              <form onSubmit={handleActionSubmit}>
                <div className="mb-3">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>
                    Subscription Status
                  </label>
                  <CustomDropdown
                    value={actionForm.status}
                    onChange={(e) => setActionForm({ ...actionForm, status: e.target.value })}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="TRIAL">Trial</option>
                  </CustomDropdown>
                </div>

                <div className="mb-3">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>
                    Extend Term by Days (Optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={actionForm.extendDays}
                    onChange={(e) => setActionForm({ ...actionForm, extendDays: Number(e.target.value) })}
                    placeholder="e.g. 30"
                  />
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                    Adding days will extend the current expiry date or set from today if already expired.
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setActionTarget(null)}
                    disabled={updating}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={updating}>
                    {updating ? "Saving..." : "Update Subscription"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionManagement;
