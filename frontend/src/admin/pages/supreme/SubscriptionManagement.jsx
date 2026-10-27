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
  const [plans, setPlans] = useState([]);
  const [actionTarget, setActionTarget] = useState(null);
  const [actionForm, setActionForm] = useState({
    planId: "",
    status: "ACTIVE",
    durationDays: 30,
    assignedSeats: 0,
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

  const fetchPlans = useCallback(async () => {
    try {
      const res = await supremeAdminApi.getPlans();
      if (res?.success) {
        setPlans(res.data || []);
      }
    } catch (err) {
      console.error("[SubscriptionManagement] Plans fetch error:", err);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

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
    const existingPlanId = sub.planId?._id || sub.planId || "";
    const matchedPlan = plans.find((p) => p._id === existingPlanId) || plans[0] || null;
    setActionForm({
      planId: matchedPlan?._id || existingPlanId,
      status: sub.effectiveStatus === "EXPIRED" ? "ACTIVE" : sub.status,
      durationDays: matchedPlan?.durationDays || 30,
      assignedSeats: matchedPlan ? (matchedPlan.maxAdminSeats ?? 0) : (sub.assignedSeats ?? 0),
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
                {subscriptions
                  .filter((s) => s.subscriberId && (s.subscriberId._id || s.subscriberId.id || s.subscriberId.email))
                  .map((sub) => {
                    const isExp = sub.effectiveStatus === "EXPIRED";
                    return (
                      <tr key={sub._id}>
                        <td style={{ padding: "14px 16px" }}>
                          <strong style={{ color: "#1e293b", fontSize: "14px" }}>
                            {sub.subscriberId?.businessName || sub.subscriberId?.name || "Subscriber"}
                          </strong>
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                            Owner: <strong>{sub.subscriberId?.name}</strong> • {sub.subscriberId?.email}
                          </div>
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
          <div className="sa-modal-responsive-card" style={{ maxWidth: "560px", overflow: "visible" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #e2e8f0" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>
                  Manage Subscription
                </h4>
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                  {actionTarget.subscriberId?.businessName || actionTarget.subscriberId?.name || "Subscriber"}
                </div>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setActionTarget(null)}
                style={{ cursor: "pointer", border: "none", background: "none", fontSize: "16px", color: "#64748b" }}
              />
            </div>

            <form onSubmit={handleActionSubmit}>
              <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Select Subscription Plan */}
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                    Select Subscription Plan
                  </label>
                  <CustomDropdown
                    value={actionForm.planId}
                    onChange={(e) => {
                      const sel = plans.find((p) => p._id === e.target.value);
                      setActionForm({
                        ...actionForm,
                        planId: e.target.value,
                        durationDays: sel ? sel.durationDays : actionForm.durationDays,
                        assignedSeats: sel ? (sel.maxAdminSeats ?? 0) : actionForm.assignedSeats,
                      });
                    }}
                    placeholder="Select a subscription plan..."
                  >
                    <option value="">Select a subscription plan...</option>
                    {plans.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} — ₹{p.price} ({p.maxAdminSeats} seats, {p.durationDays} days)
                      </option>
                    ))}
                  </CustomDropdown>
                </div>

                {/* Seat Quota & Status */}
                <div className="row g-3">
                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                      Branch Admin Seats
                    </label>
                    <div
                      style={{
                        padding: "8px 14px",
                        backgroundColor: "#f8fafc",
                        border: "1.5px solid #e2e8f0",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        minHeight: "40px",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: "#1e293b", fontSize: "14px" }}>
                        {actionForm.assignedSeats >= 999999
                          ? "Unlimited"
                          : `${actionForm.assignedSeats} Seat${actionForm.assignedSeats === 1 ? "" : "s"}`}
                      </span>
                      <span className="badge bg-secondary" style={{ fontSize: "11px", fontWeight: 600 }}>
                        Package Defined
                      </span>
                    </div>
                  </div>

                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                      Subscription Status
                    </label>
                    <CustomDropdown
                      value={actionForm.status}
                      direction="bottom"
                      onChange={(e) => setActionForm({ ...actionForm, status: e.target.value })}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="SUSPENDED">Suspended</option>
                      <option value="EXPIRED">Expired</option>
                      <option value="TRIAL">Trial</option>
                    </CustomDropdown>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  padding: "16px 24px",
                  borderTop: "1px solid #e2e8f0",
                  backgroundColor: "#f8fafc",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  borderBottomLeftRadius: "12px",
                  borderBottomRightRadius: "12px",
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActionTarget(null)}
                  disabled={updating}
                  style={{
                    backgroundColor: "#64748b",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    padding: "8px 18px",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updating}
                  style={{
                    backgroundColor: "#a63d2f",
                    borderColor: "#a63d2f",
                    borderRadius: "8px",
                    fontWeight: 600,
                    padding: "8px 20px",
                  }}
                >
                  {updating ? "Saving..." : "Update & Renew Subscription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionManagement;
