import { useState, useEffect, useCallback } from "react";
import { supremeAdminApi } from "../../../services/api";
import {
  FaPlus,
  FaEdit,
  FaTrash,
  FaCheck,
  FaTimes,
  FaLayerGroup,
  FaSync,
  FaExclamationCircle,
  FaInfinity,
} from "react-icons/fa";
import CustomDropdown from "../../components/CustomDropdown";
import "../../styles/super-admin.css";

const getIntervalLabel = (plan) => {
  const days = Number(plan?.durationDays) || 30;
  const interval = (plan?.billingInterval || "").toUpperCase();

  if (days === 30 || (interval === "MONTHLY" && days >= 28 && days <= 31)) {
    return "Monthly";
  }
  if (days === 60) {
    return "Bi-Monthly (60 Days)";
  }
  if (days === 90 || interval === "QUARTERLY") {
    return "Quarterly";
  }
  if (days === 180) {
    return "Half-Yearly (180 Days)";
  }
  if (days === 365 || interval === "ANNUAL") {
    return "Annual";
  }
  if (interval && interval !== "CUSTOM" && interval !== "MONTHLY") {
    return interval.charAt(0) + interval.slice(1).toLowerCase();
  }
  return `${days} Days`;
};

const PlanManagement = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form Modal (Create / Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0,
    currency: "INR",
    billingInterval: "MONTHLY",
    durationDays: 30,
    maxAdminSeats: 3,
    isUnlimitedSeats: false,
    maxProjects: 20,
    features: "",
    isActive: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Delete Confirmation Modal
  const [deleteConfirmPlan, setDeleteConfirmPlan] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (type, text) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await supremeAdminApi.getPlans();
      if (res?.success) {
        setPlans(res.data);
      }
    } catch (err) {
      console.error("[PlanManagement] Fetch error:", err);
      setError(err.message || "Failed to load subscription plans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setFormData({
      name: "",
      description: "",
      price: 4999,
      currency: "INR",
      billingInterval: "MONTHLY",
      durationDays: 30,
      maxAdminSeats: 3,
      isUnlimitedSeats: false,
      maxProjects: 10,
      features: "Lead Management, Project Showcase, Admin Controls",
      isActive: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (plan) => {
    setEditingPlan(plan);
    const isUnlimited = Boolean(plan.isUnlimitedSeats || plan.maxAdminSeats >= 999999);
    setFormData({
      name: plan.name,
      description: plan.description || "",
      price: plan.price,
      currency: plan.currency || "INR",
      billingInterval: plan.billingInterval || "MONTHLY",
      durationDays: plan.durationDays || 30,
      maxAdminSeats: isUnlimited ? 10 : (plan.maxAdminSeats || 3),
      isUnlimitedSeats: isUnlimited,
      maxProjects: plan.maxProjects || 20,
      features: Array.isArray(plan.features) ? plan.features.join(", ") : "",
      isActive: plan.isActive,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        price: Number(formData.price),
        durationDays: Number(formData.durationDays),
        maxAdminSeats: formData.isUnlimitedSeats ? 999999 : Number(formData.maxAdminSeats),
        isUnlimitedSeats: Boolean(formData.isUnlimitedSeats),
        maxProjects: Number(formData.maxProjects),
        features: formData.features
          ? formData.features
              .split(",")
              .map((f) => f.trim())
              .filter(Boolean)
          : [],
      };

      if (editingPlan) {
        await supremeAdminApi.updatePlan(editingPlan._id, payload);
        showToast("success", "Plan updated successfully.");
      } else {
        await supremeAdminApi.createPlan(payload);
        showToast("success", "Subscription plan created successfully.");
      }
      setModalOpen(false);
      fetchPlans();
    } catch (err) {
      showToast("error", err.message || "Failed to save plan.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (plan) => {
    try {
      const res = await supremeAdminApi.togglePlanStatus(plan._id);
      if (res?.success) {
        showToast("success", res.message);
        fetchPlans();
      }
    } catch (err) {
      showToast("error", err.message || "Failed to toggle status.");
    }
  };

  const handleDeletePlan = async () => {
    if (!deleteConfirmPlan) return;
    setDeleting(true);
    try {
      const res = await supremeAdminApi.deletePlan(deleteConfirmPlan._id);
      if (res?.success) {
        showToast("success", res.message || "Plan deleted successfully.");
        setDeleteConfirmPlan(null);
        fetchPlans();
      }
    } catch (err) {
      showToast("error", err.message || "Failed to delete plan.");
    } finally {
      setDeleting(false);
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
          <span className="sa-brand-tag">TIER CONFIGURATION</span>
          <h1 className="sa-page-title">
            Subscription <span>Plans</span>
          </h1>
          <p className="sa-page-subtitle">
            Create, price, and manage feature limits and Admin seat entitlements across plans.
          </p>
        </div>
        <div>
          <button type="button" className="sa-btn-primary" onClick={handleOpenCreate}>
            <FaPlus /> Create New Plan
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div style={{ padding: "60px 0", textAlign: "center" }}>
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : error ? (
        <div className="alert alert-danger m-3">{error}</div>
      ) : plans.length === 0 ? (
        <div className="sa-card" style={{ padding: "60px 0", textAlign: "center" }}>
          <FaLayerGroup style={{ fontSize: "40px", color: "#cbd5e1", marginBottom: "12px" }} />
          <p>No subscription plans found. Click &quot;Create New Plan&quot; to define your first tier.</p>
        </div>
      ) : (
        <div className="sa-plans-grid">
          {plans.map((p) => (
            <div
              key={p._id}
              className="sa-card"
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
                marginBottom: 0,
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 4px 0", color: "#1e293b" }}>{p.name}</h3>
                    <span
                      className="badge"
                      style={{
                        backgroundColor: "#f1f5f9",
                        color: "#475569",
                        border: "1px solid #e2e8f0",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: "6px"
                      }}
                    >
                      {getIntervalLabel(p)}
                    </span>
                  </div>
                  <span className={`badge ${p.isActive ? "bg-success" : "bg-secondary"}`}>
                    {p.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                <div style={{ margin: "16px 0", borderBottom: "1px solid #f1f5f9", paddingBottom: "16px" }}>
                  <span style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>
                    ₹{p.price.toLocaleString()}
                  </span>
                  <span style={{ fontSize: "13px", color: "#64748b", marginLeft: "6px" }}>
                    / {p.durationDays === 30 ? "month (30 days)" : `${p.durationDays} days`}
                  </span>
                </div>

                <p style={{ fontSize: "13px", color: "#64748b", minHeight: "38px" }}>
                  {p.description || "No description provided."}
                </p>

                <div style={{ margin: "16px 0" }}>
                  <div style={{ fontSize: "13px", marginBottom: "8px", color: "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
                    <strong>Admin Seats:</strong>
                    {p.isUnlimitedSeats || p.maxAdminSeats >= 999999 ? (
                      <span className="badge bg-primary d-inline-flex align-items-center gap-1" style={{ fontSize: "11px" }}>
                        <FaInfinity /> Unlimited Seats
                      </span>
                    ) : (
                      <span>{p.maxAdminSeats} seats max</span>
                    )}
                  </div>

                  {Array.isArray(p.features) && p.features.length > 0 && (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "12px", color: "#64748b" }}>
                      {p.features.map((feat, idx) => (
                        <li key={idx} style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
                          <FaCheck style={{ color: "#10b981", fontSize: "10px", marginRight: "6px" }} />
                          {feat}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", borderTop: "1px solid #f1f5f9", paddingTop: "16px", marginTop: "12px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary flex-grow-1"
                  onClick={() => handleOpenEdit(p)}
                >
                  <FaEdit style={{ marginRight: "4px" }} /> Edit
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${p.isActive ? "btn-outline-warning" : "btn-outline-success"}`}
                  onClick={() => handleToggleStatus(p)}
                >
                  {p.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => setDeleteConfirmPlan(p)}
                  title="Delete Subscription Plan"
                >
                  <FaTrash style={{ marginRight: "4px" }} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Plan Form Modal */}
      {modalOpen && (
        <div className="sa-modal-responsive">
          <div className="sa-modal-responsive-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
              <h4 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>
                {editingPlan ? "Edit Subscription Plan" : "Create New Subscription Plan"}
              </h4>
              <button type="button" className="btn-close" onClick={() => setModalOpen(false)} />
            </div>

            <div className="sa-modal-body-scroll">
              <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>Plan Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Enterprise Tier"
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>Description</label>
                <textarea
                  className="form-control"
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Summary of target business size..."
                />
              </div>

              <div className="row mb-3">
                <div className="col-6">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                  />
                </div>
                <div className="col-6">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>Billing Interval</label>
                  <CustomDropdown
                    value={formData.billingInterval}
                    onChange={(e) => {
                      const nextInterval = e.target.value;
                      let nextDays = formData.durationDays;
                      if (nextInterval === "MONTHLY" && (!nextDays || nextDays === 90 || nextDays === 365 || nextDays === 60)) {
                        nextDays = 30;
                      } else if (nextInterval === "QUARTERLY" && (!nextDays || nextDays === 30 || nextDays === 365 || nextDays === 60)) {
                        nextDays = 90;
                      } else if (nextInterval === "ANNUAL" && (!nextDays || nextDays === 30 || nextDays === 90 || nextDays === 60)) {
                        nextDays = 365;
                      }
                      setFormData({ ...formData, billingInterval: nextInterval, durationDays: nextDays });
                    }}
                  >
                    <option value="MONTHLY">Monthly (30 days)</option>
                    <option value="QUARTERLY">Quarterly (90 days)</option>
                    <option value="ANNUAL">Annual (365 days)</option>
                    <option value="CUSTOM">Custom Interval</option>
                  </CustomDropdown>
                </div>
              </div>

              <div className="row mb-3">
                <div className="col-6">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>Max Admin Seats</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={formData.isUnlimitedSeats ? "" : formData.maxAdminSeats}
                    disabled={formData.isUnlimitedSeats}
                    onChange={(e) => setFormData({ ...formData, maxAdminSeats: e.target.value })}
                    placeholder={formData.isUnlimitedSeats ? "Unlimited" : "e.g. 5"}
                    required={!formData.isUnlimitedSeats}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>Duration (Days)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={formData.durationDays}
                    onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Unlimited Admin Seats Toggle */}
              <div className="form-check form-switch mb-3 p-2 rounded" style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <input
                  className="form-check-input ms-0 me-2"
                  type="checkbox"
                  id="unlimitedSeatsCheck"
                  checked={formData.isUnlimitedSeats}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      isUnlimitedSeats: e.target.checked,
                      maxAdminSeats: e.target.checked ? 999999 : 5,
                    })
                  }
                />
                <label className="form-check-label fw-bold" htmlFor="unlimitedSeatsCheck" style={{ fontSize: "13px", color: "#1e293b" }}>
                  <FaInfinity style={{ color: "#a63d2f", marginRight: "6px" }} />
                  Set Unlimited Admin Seats (No limit on staff accounts)
                </label>
                <div style={{ fontSize: "11px", color: "#64748b", marginLeft: "28px" }}>
                  Subscribers on this tier can create unlimited Staff Admin accounts without quota limits.
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>
                  Features (Comma separated)
                </label>
                <textarea
                  className="form-control"
                  rows="2"
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  placeholder="e.g. 10 Admin Seats, Custom Plot Layouts, Priority Support"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingPlan ? "Update Plan" : "Create Plan"}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmPlan && (
        <div className="sa-modal-responsive">
          <div className="sa-modal-responsive-card" style={{ maxWidth: "460px" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#fee2e2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>
                <FaExclamationCircle />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  Delete Subscription Plan
                </h4>
                <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                  This action permanently deletes the tier from the catalog.
                </p>
              </div>
            </div>

            <div style={{ padding: "20px 24px" }}>
              <p style={{ fontSize: "14px", color: "#334155", margin: 0 }}>
                Are you sure you want to delete the plan <strong>&quot;{deleteConfirmPlan.name}&quot;</strong>?
              </p>
              <div className="alert alert-warning mt-3 mb-0" style={{ fontSize: "12px", padding: "10px 14px" }}>
                <strong>Note:</strong> If any subscriber is currently assigned to this active plan, deletion will be blocked safely to preserve tenant access.
              </div>
            </div>

            <div className="sa-modal-footer-responsive">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteConfirmPlan(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeletePlan}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Yes, Delete Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanManagement;
