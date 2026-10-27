import { useState, useEffect, useCallback } from "react";
import { supremeAdminApi } from "../../../services/api";
import {
  FaSearch,
  FaBuilding,
  FaCheckCircle,
  FaBan,
  FaExclamationTriangle,
  FaCalendarAlt,
  FaUserShield,
  FaSync,
  FaTimes,
  FaPlus,
  FaKey,
  FaEnvelope,
  FaPhone,
  FaUser,
  FaLayerGroup,
  FaUsers,
  FaEye,
  FaEyeSlash,
  FaInfoCircle,
  FaTrash,
} from "react-icons/fa";
import ConfirmationModal from "../../components/ConfirmationModal";
import CustomDropdown from "../../components/CustomDropdown";
import "../../styles/super-admin.css";

const COUNTRY_CODES = [
  { code: "+91", label: "India (+91)", flag: "🇮🇳" },
  { code: "+1", label: "USA / Canada (+1)", flag: "🇺🇸" },
  { code: "+44", label: "UK (+44)", flag: "🇬🇧" },
  { code: "+60", label: "Malaysia (+60)", flag: "🇲🇾" },
  { code: "+65", label: "Singapore (+65)", flag: "🇸🇬" },
  { code: "+971", label: "UAE (+971)", flag: "🇦🇪" },
  { code: "+966", label: "Saudi Arabia (+966)", flag: "🇸🇦" },
  { code: "+61", label: "Australia (+61)", flag: "🇦🇺" },
  { code: "+49", label: "Germany (+49)", flag: "🇩🇪" },
  { code: "+33", label: "France (+33)", flag: "🇫🇷" },
];

const SubscriberManagement = () => {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Action Modals
  const [confirmTarget, setConfirmTarget] = useState(null); // for activate/suspend
  const [deleteTarget, setDeleteTarget] = useState(null); // for permanently deleting subscriber
  const [assignTarget, setAssignTarget] = useState(null); // for assigning plan
  const [viewAdminsTarget, setViewAdminsTarget] = useState(null); // for managing tenant admins
  const [tenantAdmins, setTenantAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [confirmDeleteAdminTarget, setConfirmDeleteAdminTarget] = useState(null);

  const [plans, setPlans] = useState([]);
  const [platformSettings, setPlatformSettings] = useState(null);
  const [assignForm, setAssignForm] = useState({
    planId: "",
    durationDays: 30,
    assignedSeats: 5,
    notes: "",
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Create Subscriber Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [phoneCountryCode, setPhoneCountryCode] = useState("+91");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [createForm, setCreateForm] = useState({
    businessName: "",
    name: "",
    email: "",
    phone: "",
    password: "",
    planId: "",
    durationDays: 30,
    assignedSeats: 3,
    status: "ACTIVE",
    notes: "",
  });
  const [createError, setCreateError] = useState(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  const showToast = (type, text) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const fetchSubscribers = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;

      const res = await supremeAdminApi.getSubscribers(params);
      if (res?.success) {
        setSubscribers(res.data);
      }
    } catch (err) {
      console.error("[SubscriberManagement] Fetch error:", err);
      if (!isSilent) {
        setError(err.message || "Failed to load subscribers.");
      }
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, [search, statusFilter]);

  const fetchPlansAndSettings = async () => {
    try {
      const [plansRes, settingsRes] = await Promise.allSettled([
        supremeAdminApi.getPlans(),
        supremeAdminApi.getSettings(),
      ]);

      if (plansRes.status === "fulfilled" && plansRes.value?.success) {
        setPlans(plansRes.value.data.filter((p) => p.isActive));
      }
      if (settingsRes.status === "fulfilled" && settingsRes.value?.success && settingsRes.value?.data) {
        setPlatformSettings(settingsRes.value.data);
      }
    } catch (e) {
      console.warn("Failed to load plans or settings:", e);
    }
  };

  useEffect(() => {
    fetchSubscribers(false);
    fetchPlansAndSettings();

    // Auto-sync subscribers list every 6 seconds in background
    const interval = setInterval(async () => {
      if (document.visibilityState === "visible") {
        fetchSubscribers(true);

        // If the 'View Admins' modal is currently open for a subscriber, silently refresh its admins list too!
        if (viewAdminsTarget?._id) {
          try {
            const subRes = await supremeAdminApi.getSubscriberById(viewAdminsTarget._id);
            if (subRes?.success && subRes.data) {
              setTenantAdmins(subRes.data.admins || []);
            }
          } catch {}
        }
      }
    }, 6000);

    const handleFocus = async () => {
      fetchSubscribers(true);
      if (viewAdminsTarget?._id) {
        try {
          const subRes = await supremeAdminApi.getSubscriberById(viewAdminsTarget._id);
          if (subRes?.success && subRes.data) {
            setTenantAdmins(subRes.data.admins || []);
          }
        } catch {}
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [fetchSubscribers, viewAdminsTarget?._id]);

  const handleToggleStatus = async () => {
    if (!confirmTarget) return;
    setActionLoading(true);
    try {
      const res = await supremeAdminApi.toggleSubscriberStatus(confirmTarget._id);
      if (res?.success) {
        showToast("success", res.message);
        setConfirmTarget(null);
        fetchSubscribers();
      }
    } catch (err) {
      showToast("error", err.message || "Failed to toggle status.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    const defaultPlan = plans[0] || null;
    setPhoneCountryCode("+91");
    setPhoneDigits("");
    setCreateForm({
      businessName: "",
      name: "",
      email: "",
      phone: "",
      password: "",
      planId: defaultPlan?._id || "",
      durationDays: defaultPlan?.durationDays || 30,
      assignedSeats: defaultPlan ? (defaultPlan.maxAdminSeats ?? 0) : 0,
      status: "ACTIVE",
      notes: "",
    });
    setCreateError(null);
    setIsCreateModalOpen(true);
  };

  const handleCreateSubscriber = async (e) => {
    e.preventDefault();
    setCreateError(null);

    if (!createForm.businessName.trim()) {
      setCreateError("Business name is required.");
      return;
    }
    if (!createForm.name.trim()) {
      setCreateError("Owner name is required.");
      return;
    }
    if (!createForm.email.trim()) {
      setCreateError("Email is required.");
      return;
    }
    if (phoneDigits && phoneDigits.length !== 10) {
      setCreateError("Phone number must be exactly 10 digits.");
      return;
    }
    if (!createForm.password || createForm.password.length < 6) {
      setCreateError("Password must be at least 6 characters.");
      return;
    }

    const isTrial = createForm.status === "TRIAL";
    let effectivePlanId = createForm.planId;

    if (!isTrial && !effectivePlanId) {
      setCreateError("Please select a subscription plan.");
      return;
    }

    // If TRIAL and no plan explicitly picked, assign the default baseline plan for relational integrity
    if (isTrial && !effectivePlanId && plans.length > 0) {
      effectivePlanId = plans[0]._id;
    }

    const effectiveDuration = isTrial
      ? (platformSettings?.defaultTrialDays !== undefined ? Number(platformSettings.defaultTrialDays) : 14)
      : Number(createForm.durationDays);

    const fullPhoneNumber = phoneDigits ? `${phoneCountryCode} ${phoneDigits}` : "";

    setActionLoading(true);
    try {
      const payload = {
        ...createForm,
        phone: fullPhoneNumber,
        planId: effectivePlanId,
        durationDays: effectiveDuration,
      };
      const res = await supremeAdminApi.createSubscriber(payload);
      if (res?.success) {
        showToast("success", res.message || "Subscriber created successfully!");
        setIsCreateModalOpen(false);
        fetchSubscribers();
      }
    } catch (err) {
      setCreateError(err.message || "Failed to create subscriber.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenAssign = (sub) => {
    setAssignTarget(sub);
    const existingPlanId = sub.subscription?.planId?._id || sub.subscription?.planId;
    const currentPlan = plans.find((p) => p._id === existingPlanId) || plans[0] || null;
    setAssignForm({
      planId: currentPlan?._id || "",
      durationDays: currentPlan?.durationDays || 30,
      assignedSeats: currentPlan ? (currentPlan.maxAdminSeats ?? 0) : 0,
      notes: sub.subscription?.notes || "",
    });
  };

  const handleDeleteSubscriber = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      const res = await supremeAdminApi.deleteSubscriber(deleteTarget._id || deleteTarget.id);
      if (res?.success) {
        showToast("success", res.message || "Subscriber account permanently deleted.");
        setDeleteTarget(null);
        fetchSubscribers();
      }
    } catch (err) {
      showToast("error", err.message || "Failed to delete subscriber.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenAdminsModal = async (sub) => {
    setViewAdminsTarget(sub);
    setLoadingAdmins(true);
    try {
      const res = await supremeAdminApi.getSubscriberById(sub._id);
      if (res?.success && res.data) {
        setTenantAdmins(res.data.admins || []);
      } else {
        setTenantAdmins([]);
      }
    } catch (err) {
      showToast("error", err.message || "Failed to load branch admins.");
      setTenantAdmins([]);
    } finally {
      setLoadingAdmins(false);
    }
  };

  const handleToggleTenantAdminStatus = async (admin) => {
    if (!viewAdminsTarget || !admin) return;
    setActionLoading(true);
    try {
      const res = await supremeAdminApi.toggleAdminStatus(viewAdminsTarget._id, admin._id);
      if (res?.success) {
        showToast("success", res.message || "Branch admin status updated.");
        // Refresh modal list & subscriber table
        const subRes = await supremeAdminApi.getSubscriberById(viewAdminsTarget._id);
        if (subRes?.success && subRes.data) {
          setTenantAdmins(subRes.data.admins || []);
        }
        fetchSubscribers();
      }
    } catch (err) {
      showToast("error", err.message || "Failed to update branch admin status.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTenantAdmin = async () => {
    if (!viewAdminsTarget || !confirmDeleteAdminTarget) return;
    setActionLoading(true);
    try {
      const res = await supremeAdminApi.deleteAdmin(viewAdminsTarget._id, confirmDeleteAdminTarget._id);
      if (res?.success) {
        showToast("success", res.message || "Branch admin deleted successfully.");
        setConfirmDeleteAdminTarget(null);
        // Refresh modal list & subscriber table
        const subRes = await supremeAdminApi.getSubscriberById(viewAdminsTarget._id);
        if (subRes?.success && subRes.data) {
          setTenantAdmins(subRes.data.admins || []);
        }
        fetchSubscribers();
      }
    } catch (err) {
      showToast("error", err.message || "Failed to delete branch admin.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignTarget) return;

    const requestedLimit = Number(assignForm.assignedSeats);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 0) {
      showToast("error", "Branch Admin seat limit must be a non-negative integer (0 or greater).");
      return;
    }

    if (requestedLimit < (assignTarget.activeAdminCount || 0)) {
      showToast(
        "error",
        `Cannot reduce seat limit to ${requestedLimit}. Subscriber currently has ${assignTarget.activeAdminCount} active Branch Admin(s). Please deactivate or delete surplus branch admins first.`
      );
      return;
    }

    setActionLoading(true);
    try {
      const res = await supremeAdminApi.assignSubscription(assignTarget._id, assignForm);
      if (res?.success) {
        showToast("success", "Subscription assigned successfully.");
        setAssignTarget(null);
        fetchSubscribers();
      }
    } catch (err) {
      showToast("error", err.message || "Failed to assign subscription.");
    } finally {
      setActionLoading(false);
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
      <div className="sa-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <span className="sa-brand-tag">TENANT DIRECTORY</span>
          <h1 className="sa-page-title">
            Subscriber <span>Businesses</span>
          </h1>
          <p className="sa-page-subtitle">
            Manage subscribing companies, view seat utilization, and control tenant workspace access.
          </p>
        </div>
        <button
          type="button"
          className="sa-btn-primary"
          onClick={handleOpenCreateModal}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            fontSize: "14px",
            fontWeight: "700",
            borderRadius: "8px",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(166, 61, 47, 0.25)",
          }}
        >
          <FaPlus /> Create Subscriber
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="sa-card sa-filter-bar">
        <div className="sa-filter-controls">
          <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
            <FaSearch style={{ position: "absolute", left: "14px", top: "12px", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search by business name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-control"
              style={{ paddingLeft: "38px" }}
            />
          </div>
          <div style={{ width: "180px" }}>
            <CustomDropdown
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder="All Statuses"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="TRIAL">Trial</option>
            </CustomDropdown>
          </div>
        </div>
        <button type="button" className="sa-btn-outline" onClick={fetchSubscribers}>
          <FaSync /> Refresh
        </button>
      </div>

      {/* Subscriber List Table */}
      <div className="sa-card" style={{ overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <div className="spinner-border text-primary" role="status" />
          </div>
        ) : error ? (
          <div className="alert alert-danger m-3">{error}</div>
        ) : subscribers.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "#64748b" }}>
            <FaBuilding style={{ fontSize: "40px", color: "#cbd5e1", marginBottom: "12px" }} />
            <p>No subscriber businesses match the specified filters.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: "14px", minWidth: "1100px" }}>
              <thead style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <tr style={{ color: "#475569", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  <th style={{ width: "24%", padding: "14px 16px" }}>Subscriber / Company</th>
                  <th style={{ width: "10%" }}>Status</th>
                  <th style={{ width: "18%" }}>Subscription</th>
                  <th style={{ width: "14%" }}>Branch Admin Seats</th>
                  <th style={{ width: "8%", textAlign: "center" }}>Projects</th>
                  <th style={{ width: "26%", textAlign: "right", paddingRight: "16px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((sub) => {
                  return (
                    <tr key={sub.id || sub._id}>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ color: "#1e293b", fontSize: "14px", fontWeight: 700 }}>
                          {sub.businessName || "Registered Business"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                          Owner: <strong style={{ color: "#334155" }}>{sub.ownerName || sub.name}</strong> • {sub.email}
                        </div>
                        {sub.phone && (
                          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                            {sub.phone}
                          </div>
                        )}
                      </td>
                      <td>
                        {(() => {
                          const effStatus = sub.effectiveStatus || (
                            sub.status === "INACTIVE"
                              ? "SUSPENDED"
                              : sub.subscription?.status === "EXPIRED" || (sub.subscription?.expiryDate && new Date(sub.subscription.expiryDate) <= new Date())
                              ? "EXPIRED"
                              : sub.subscription?.status === "TRIAL"
                              ? "TRIAL"
                              : !sub.subscription
                              ? "NO_PLAN"
                              : "ACTIVE"
                          );

                          if (effStatus === "EXPIRED") {
                            return <span className="badge bg-danger">Expired</span>;
                          }
                          if (effStatus === "SUSPENDED") {
                            return <span className="badge bg-danger">Suspended</span>;
                          }
                          if (effStatus === "TRIAL") {
                            return (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: "#ffedd5",
                                  color: "#c2410c",
                                  border: "1px solid #fed7aa",
                                  fontWeight: 700,
                                }}
                              >
                                Trial
                              </span>
                            );
                          }
                          if (effStatus === "NO_PLAN") {
                            return <span className="badge bg-secondary">No Plan</span>;
                          }
                          return <span className="badge bg-success">Active</span>;
                        })()}
                      </td>
                      <td>
                        {sub.subscription ? (
                          <div>
                            {sub.subscription.status === "TRIAL" ? (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: "#ffedd5",
                                  color: "#c2410c",
                                  border: "1px solid #fed7aa",
                                  fontWeight: 700,
                                }}
                              >
                                ⚡ Trial ({sub.subscription.planName || "Trial Plan"})
                              </span>
                            ) : sub.subscription.status === "EXPIRED" || (sub.subscription.expiryDate && new Date(sub.subscription.expiryDate) <= new Date()) ? (
                              <span className="badge bg-light text-danger" style={{ border: "1px solid #fca5a5" }}>
                                {sub.subscription.planName} (Expired)
                              </span>
                            ) : (
                              <span className="badge bg-light text-dark" style={{ border: "1px solid #cbd5e1" }}>
                                {sub.subscription.planName}
                              </span>
                            )}
                            <div
                              style={{
                                fontSize: "11px",
                                color: (sub.subscription.status === "EXPIRED" || (sub.subscription.expiryDate && new Date(sub.subscription.expiryDate) <= new Date())) ? "#dc2626" : "#64748b",
                                marginTop: "2px",
                                fontWeight: (sub.subscription.status === "EXPIRED" || (sub.subscription.expiryDate && new Date(sub.subscription.expiryDate) <= new Date())) ? "600" : "normal",
                              }}
                            >
                              Expires: {new Date(sub.subscription.expiryDate).toLocaleDateString()}
                            </div>
                          </div>
                        ) : (
                          <span className="badge bg-secondary">No Plan</span>
                        )}
                      </td>
                      <td>
                        {sub.subscription ? (
                          <span>
                            <strong>{sub.activeAdminCount}</strong> /{" "}
                            {sub.subscription.assignedSeats >= 999999 ? "∞" : `${sub.subscription.assignedSeats} seats`}
                            {sub.subscription.assignedSeats > 0 && sub.subscription.assignedSeats < 999999 && (
                              <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "4px" }}>
                                ({Math.max(0, sub.subscription.assignedSeats - sub.activeAdminCount)} left)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted">{sub.activeAdminCount} created</span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className="badge bg-light text-dark border">{sub.projectCount || 0}</span>
                      </td>
                      <td style={{ textAlign: "right", paddingRight: "16px", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="sa-btn-table-outline me-2"
                          onClick={() => handleOpenAdminsModal(sub)}
                          title="Manage branch admin accounts under this subscriber"
                        >
                          Branch Admins ({sub.activeAdminCount})
                        </button>
                        <button
                          type="button"
                          className="sa-btn-table-brand me-2"
                          onClick={() => handleOpenAssign(sub)}
                          title="Assign or update subscription package"
                        >
                          Plan / Seats
                        </button>
                        <button
                          type="button"
                          className={sub.status === "ACTIVE" ? "sa-btn-table-outline me-2" : "sa-btn-table-success me-2"}
                          onClick={() => setConfirmTarget(sub)}
                          title={sub.status === "ACTIVE" ? "Suspend workspace access" : "Activate workspace access"}
                        >
                          {sub.status === "ACTIVE" ? "Suspend" : "Activate"}
                        </button>
                        <button
                          type="button"
                          className="sa-btn-table-danger"
                          onClick={() => setDeleteTarget(sub)}
                          title="Permanently delete this subscriber account"
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                        >
                          <FaTrash style={{ fontSize: "11px" }} /> Delete
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

      {/* Confirmation Modal for Suspend / Activate */}
      {confirmTarget && (
        <ConfirmationModal
          isOpen={!!confirmTarget}
          title={confirmTarget.status === "ACTIVE" ? "Suspend Subscriber Account" : "Activate Subscriber Account"}
          message={`Are you sure you want to ${
            confirmTarget.status === "ACTIVE" ? "suspend" : "activate"
          } "${confirmTarget.businessName || confirmTarget.name}" (${confirmTarget.email})?`}
          subMessage={
            confirmTarget.status === "ACTIVE"
              ? "All branch administrators under this subscriber will immediately lose operational access. All project and plot data will remain securely preserved."
              : "Access will be immediately restored."
          }
          confirmText={confirmTarget.status === "ACTIVE" ? "Yes, Suspend Account" : "Yes, Activate Account"}
          type={confirmTarget.status === "ACTIVE" ? "danger" : "success"}
          isLoading={actionLoading}
          onConfirm={handleToggleStatus}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

      {/* Confirmation Modal for Permanent Subscriber Deletion */}
      {deleteTarget && (
        <ConfirmationModal
          isOpen={!!deleteTarget}
          title="Permanently Delete Subscriber Account"
          message={`Are you sure you want to PERMANENTLY DELETE "${deleteTarget.businessName || deleteTarget.name}" (${deleteTarget.email})?`}
          subMessage="This action is completely IRREVERSIBLE. All branches, projects, plot inventories, customer enquiries, site visits, branch admin accounts, and subscription records belonging to this tenant will be permanently erased."
          confirmText="Yes, Delete Permanently"
          type="danger"
          isLoading={actionLoading}
          onConfirm={handleDeleteSubscriber}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Modal for Assigning / Modifying Subscription */}
      {assignTarget && (
        <div className="sa-modal-responsive">
          <div className="sa-modal-responsive-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
              <h4 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>
                Manage Subscription: {assignTarget.name}
              </h4>
              <button
                type="button"
                className="btn-close"
                onClick={() => setAssignTarget(null)}
              />
            </div>

            <div className="sa-modal-body-scroll">
              <form onSubmit={handleAssignSubmit}>
                <div className="mb-3">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>
                    Select Subscription Plan
                  </label>
                  <CustomDropdown
                    value={assignForm.planId}
                    onChange={(e) => {
                      const sel = plans.find((p) => p._id === e.target.value);
                      setAssignForm({
                        ...assignForm,
                        planId: e.target.value,
                        assignedSeats: sel ? sel.maxAdminSeats : assignForm.assignedSeats,
                        durationDays: sel ? sel.durationDays : assignForm.durationDays,
                      });
                    }}
                    placeholder="Select a plan..."
                  >
                    <option value="">Select a plan...</option>
                    {plans.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} — ₹{p.price} ({p.isUnlimitedSeats || p.maxAdminSeats >= 999999 ? "Unlimited" : p.maxAdminSeats} seats, {p.durationDays} days)
                      </option>
                    ))}
                  </CustomDropdown>
                </div>

                <div className="row mb-3">
                  <div className="col-12 col-sm-6 mb-2 mb-sm-0">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>
                      Branch Admin Seats
                    </label>
                    <div
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        minHeight: "42px",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: "#1e293b", fontSize: "14px" }}>
                        {assignForm.assignedSeats >= 999999
                          ? "Unlimited"
                          : `${assignForm.assignedSeats} Seat${assignForm.assignedSeats === 1 ? "" : "s"}`}
                      </span>
                      <span className="badge bg-secondary" style={{ fontSize: "11px", fontWeight: 600 }}>
                        Package Defined
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                      Active branch admins: <strong>{assignTarget.activeAdminCount || 0}</strong>
                    </div>
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>
                      Validity (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={assignForm.durationDays}
                      onChange={(e) => setAssignForm({ ...assignForm, durationDays: Number(e.target.value) })}
                      required
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: "13px" }}>
                    Notes (Optional)
                  </label>
                  <textarea
                    className="form-control"
                    rows="2"
                    value={assignForm.notes}
                    onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                    placeholder="e.g. Standard plan assignment, billing renewal..."
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setAssignTarget(null)}
                    disabled={actionLoading}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                    {actionLoading ? "Saving..." : "Apply Subscription"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Manage Tenant Staff Admins Modal */}
      {viewAdminsTarget && (
        <div className="sa-modal-responsive">
          <div className="sa-modal-responsive-card wide">
            {/* Modal Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#f8fafc",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#1e293b" }}>
                  Branch Admins: {viewAdminsTarget.businessName || viewAdminsTarget.name}
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
                  Manage branch admin accounts under this subscriber ({tenantAdmins.filter(a => a.status === 'ACTIVE').length} active / {tenantAdmins.length} total)
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-light"
                onClick={() => setViewAdminsTarget(null)}
                style={{ fontSize: "18px", lineHeight: 1, padding: "4px 8px" }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="sa-modal-body-scroll">
              {loadingAdmins ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                  Loading branch admins...
                </div>
              ) : tenantAdmins.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                  No branch admin accounts found for this subscriber.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table align-middle" style={{ margin: 0 }}>
                    <thead>
                      <tr style={{ fontSize: "12px", textTransform: "uppercase", color: "#64748b", borderBottom: "2px solid #e2e8f0" }}>
                        <th>Branch Admin Details</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenantAdmins.map((admin) => (
                        <tr key={admin._id}>
                          <td>
                            <strong style={{ color: "#1e293b", fontSize: "13px" }}>{admin.name}</strong>
                            <div style={{ fontSize: "12px", color: "#64748b" }}>{admin.email}</div>
                          </td>
                          <td style={{ fontSize: "13px", color: "#475569" }}>
                            {admin.phone || "—"}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                admin.status === "ACTIVE" ? "bg-success" : "bg-secondary"
                              }`}
                              style={{ fontSize: "11px" }}
                            >
                              {admin.status === "ACTIVE" ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              className={`btn btn-sm me-2 ${
                                admin.status === "ACTIVE" ? "btn-outline-warning" : "btn-outline-success"
                              }`}
                              onClick={() => handleToggleTenantAdminStatus(admin)}
                              disabled={actionLoading}
                              title={
                                admin.status === "ACTIVE"
                                  ? "Deactivate account and release 1 seat"
                                  : "Reactivate account (consumes 1 seat)"
                              }
                            >
                              {admin.status === "ACTIVE" ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => setConfirmDeleteAdminTarget(admin)}
                              disabled={actionLoading}
                              title="Permanently remove branch admin account"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "flex-end",
                backgroundColor: "#f8fafc",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setViewAdminsTarget(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Subscriber (Modern Redesign) */}
      {isCreateModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.72)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1050,
            padding: "20px 16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !actionLoading) setIsCreateModalOpen(false);
          }}
        >
          <div
            style={{
              maxWidth: "680px",
              width: "100%",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              borderRadius: "16px",
              backgroundColor: "#ffffff",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)",
              overflow: "hidden",
              animation: "saFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 28px",
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #a63d2f 0%, #872e22 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    fontSize: "20px",
                    boxShadow: "0 6px 14px rgba(166, 61, 47, 0.25)",
                    flexShrink: 0,
                  }}
                >
                  <FaBuilding />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>
                    Create Subscriber Business
                  </h3>
                  <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "13px" }}>
                    Provision a new business workspace and Super Admin owner account
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="btn-close"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={actionLoading}
                style={{ padding: "8px", cursor: "pointer" }}
                aria-label="Close"
              />
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateSubscriber} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <style>{`
                .sa-create-modal-body input::placeholder,
                .sa-create-modal-body input::-webkit-input-placeholder,
                .sa-create-modal-body input::-moz-placeholder,
                .sa-create-modal-body input:-ms-input-placeholder {
                  font-size: 11px !important;
                  color: #94a3b8 !important;
                  font-weight: 400 !important;
                  opacity: 0.85 !important;
                  letter-spacing: -0.1px !important;
                }
              `}</style>
              <div className="sa-create-modal-body" style={{ padding: "24px 28px", overflowY: "auto", flex: 1 }}>
                {createError && (
                  <div
                    style={{
                      backgroundColor: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "10px",
                      padding: "12px 16px",
                      marginBottom: "20px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      color: "#991b1b",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    <FaExclamationTriangle style={{ flexShrink: 0, fontSize: "16px" }} />
                    <span>{createError}</span>
                  </div>
                )}

                {/* Section 1: Business Details */}
                <div style={{ marginBottom: "22px" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 800,
                      color: "#a63d2f",
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      marginBottom: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FaBuilding style={{ fontSize: "11px" }} /> Business & Workspace
                  </div>

                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                        Business / Company Name <span className="text-danger">*</span>
                      </label>
                      <div style={{ position: "relative" }}>
                        <FaBuilding style={{ position: "absolute", left: "14px", top: "12px", color: "#94a3b8" }} />
                        <input
                          type="text"
                          className="form-control sa-input-modern"
                          placeholder="e.g. Skyline Real Estate Developers"
                          value={createForm.businessName}
                          onChange={(e) => setCreateForm({ ...createForm, businessName: e.target.value })}
                          required
                          style={{ paddingLeft: "40px", borderRadius: "8px", height: "42px", borderColor: "#cbd5e1" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Super Admin Owner Account */}
                <div style={{ marginBottom: "22px" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 800,
                      color: "#a63d2f",
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      marginBottom: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FaUserShield style={{ fontSize: "11px" }} /> Super Admin Account Credentials
                  </div>

                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                        Owner Full Name <span className="text-danger">*</span>
                      </label>
                      <div style={{ position: "relative" }}>
                        <FaUser style={{ position: "absolute", left: "14px", top: "12px", color: "#94a3b8" }} />
                        <input
                          type="text"
                          className="form-control sa-input-modern"
                          placeholder="e.g. Rajesh Kumar"
                          value={createForm.name}
                          onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                          required
                          style={{ paddingLeft: "40px", borderRadius: "8px", height: "42px", borderColor: "#cbd5e1" }}
                        />
                      </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                        Phone Number
                      </label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <div style={{ width: "125px" }}>
                          <CustomDropdown
                            value={phoneCountryCode}
                            onChange={(e) => setPhoneCountryCode(e.target.value)}
                            placeholder="+91"
                          >
                            {COUNTRY_CODES.map((item) => (
                              <option key={item.code} value={item.code}>
                                {item.flag} {item.code}
                              </option>
                            ))}
                          </CustomDropdown>
                        </div>
                        <div style={{ position: "relative", flex: 1 }}>
                          <FaPhone style={{ position: "absolute", left: "14px", top: "12px", color: "#94a3b8" }} />
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={10}
                            className="form-control sa-input-modern"
                            placeholder="10-digit number"
                            value={phoneDigits}
                            onChange={(e) => {
                              // Only allow numbers, reject letters and symbols, restrict to 10 digits
                              const onlyNumbers = e.target.value.replace(/\D/g, "").slice(0, 10);
                              setPhoneDigits(onlyNumbers);
                            }}
                            style={{ paddingLeft: "40px", borderRadius: "8px", height: "42px", borderColor: "#cbd5e1" }}
                          />
                        </div>
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                        Digits only (e.g. 9876543210) • {phoneDigits.length}/10 digits
                      </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                        Login Email Address <span className="text-danger">*</span>
                      </label>
                      <div style={{ position: "relative" }}>
                        <FaEnvelope style={{ position: "absolute", left: "14px", top: "12px", color: "#94a3b8" }} />
                        <input
                          type="email"
                          className="form-control sa-input-modern"
                          placeholder="rajesh@skylinedev.com"
                          value={createForm.email}
                          onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                          required
                          style={{ paddingLeft: "40px", borderRadius: "8px", height: "42px", borderColor: "#cbd5e1" }}
                        />
                      </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                        Initial Password <span className="text-danger">*</span>
                      </label>
                      <div style={{ position: "relative" }}>
                        <FaKey style={{ position: "absolute", left: "14px", top: "12px", color: "#94a3b8" }} />
                        <input
                          type={showCreatePassword ? "text" : "password"}
                          className="form-control sa-input-modern"
                          placeholder="Min 6 characters"
                          value={createForm.password}
                          onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                          required
                          minLength={6}
                          style={{ paddingLeft: "40px", paddingRight: "40px", borderRadius: "8px", height: "42px", borderColor: "#cbd5e1" }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCreatePassword(!showCreatePassword)}
                          style={{
                            position: "absolute",
                            right: "12px",
                            top: "10px",
                            background: "none",
                            border: "none",
                            color: "#94a3b8",
                            cursor: "pointer",
                            fontSize: "15px",
                            padding: "2px",
                          }}
                          aria-label={showCreatePassword ? "Hide password" : "Show password"}
                        >
                          {showCreatePassword ? <FaEyeSlash /> : <FaEye />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 3: Subscription & Entitlements */}
                <div style={{ marginBottom: "18px" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 800,
                      color: "#a63d2f",
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      marginBottom: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FaLayerGroup style={{ fontSize: "11px" }} /> Plan & Entitlements
                  </div>

                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                        Initial Status
                      </label>
                      <CustomDropdown
                        value={createForm.status}
                        onChange={(e) => {
                          const nextStatus = e.target.value;
                          const selectedPlan = plans.find((p) => p._id === createForm.planId);
                          let nextDuration = createForm.durationDays;

                          if (nextStatus === "TRIAL") {
                            // Automatically apply Default Trial Duration configured in Platform Settings
                            nextDuration = platformSettings?.defaultTrialDays !== undefined
                              ? Number(platformSettings.defaultTrialDays)
                              : 14;
                          } else if (nextStatus === "ACTIVE" && selectedPlan) {
                            // Restore plan standard duration
                            nextDuration = selectedPlan.durationDays || 30;
                          }

                          setCreateForm({
                            ...createForm,
                            status: nextStatus,
                            durationDays: nextDuration,
                          });
                        }}
                      >
                        <option value="ACTIVE">ACTIVE (Paid Subscription)</option>
                        <option value="TRIAL">TRIAL (Free Trial Evaluation)</option>
                      </CustomDropdown>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: createForm.status === "TRIAL" ? "#94a3b8" : "#334155", marginBottom: "6px" }}>
                        Subscription Plan {createForm.status !== "TRIAL" && <span className="text-danger">*</span>}
                      </label>
                      <CustomDropdown
                        value={createForm.status === "TRIAL" ? "" : (createForm.planId || "")}
                        onChange={(e) => {
                          const selected = plans.find((p) => p._id === e.target.value);
                          setCreateForm({
                            ...createForm,
                            planId: e.target.value,
                            durationDays: selected ? selected.durationDays : createForm.durationDays,
                            assignedSeats: selected ? selected.maxAdminSeats : createForm.assignedSeats,
                          });
                        }}
                        disabled={createForm.status === "TRIAL"}
                        placeholder={createForm.status === "TRIAL" ? "Complimentary Trial — No Plan / Fee Required" : "Select a Plan..."}
                        options={
                          createForm.status === "TRIAL"
                            ? [{ value: "", label: "Complimentary Trial — No Plan / Fee Required" }]
                            : [
                                { value: "", label: "Select a Plan..." },
                                ...plans.map((p) => ({
                                  value: p._id,
                                  label: `${p.name} — ${p.maxAdminSeats} seats, ₹${p.price}`,
                                })),
                              ]
                        }
                      />
                      {createForm.status === "TRIAL" && (
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                          Plan and charges are bypassed for trial accounts.
                        </div>
                      )}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                        Duration (Days) <span className="text-danger">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="form-control sa-input-modern"
                        value={createForm.durationDays}
                        onChange={(e) => {
                          if (createForm.status !== "TRIAL") {
                            setCreateForm({ ...createForm, durationDays: Number(e.target.value) });
                          }
                        }}
                        readOnly={createForm.status === "TRIAL"}
                        disabled={createForm.status === "TRIAL"}
                        required
                        style={{
                          borderRadius: "8px",
                          height: "42px",
                          borderColor: "#cbd5e1",
                          backgroundColor: createForm.status === "TRIAL" ? "#f1f5f9" : "#fff",
                          color: createForm.status === "TRIAL" ? "#475569" : "#1e293b",
                          cursor: createForm.status === "TRIAL" ? "not-allowed" : "text",
                          fontWeight: createForm.status === "TRIAL" ? 700 : 500,
                        }}
                      />
                      {createForm.status === "TRIAL" ? (
                        <div style={{ fontSize: "11px", color: "#0284c7", marginTop: "4px", fontWeight: 500 }}>
                        </div>
                      ) : (
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                          Customizable active subscription validity
                        </div>
                      )}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                        Branch Admin Seat Limit <span className="text-danger">*</span>
                      </label>
                      <div style={{ position: "relative" }}>
                        <FaUsers style={{ position: "absolute", left: "14px", top: "12px", color: "#94a3b8" }} />
                        <input
                          type="number"
                          min="0"
                          className="form-control sa-input-modern"
                          value={createForm.assignedSeats}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              assignedSeats: Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                          required
                          style={{ paddingLeft: "40px", borderRadius: "8px", height: "42px", borderColor: "#cbd5e1" }}
                        />
                      </div>
                    </div>

                    <div className="col-12">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                        Administrative Notes (Optional)
                      </label>
                      <input
                        type="text"
                        className="form-control sa-input-modern"
                        placeholder="e.g. Signed via direct sales onboarding"
                        value={createForm.notes}
                        onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                        style={{ borderRadius: "8px", height: "42px", borderColor: "#cbd5e1" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Information Card */}
                
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  padding: "16px 28px",
                  borderTop: "1px solid #f1f5f9",
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: "12px",
                  backgroundColor: "#f8fafc",
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={actionLoading}
                  style={{ borderRadius: "8px", padding: "9px 20px", fontWeight: 600, fontSize: "13px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sa-btn-primary"
                  disabled={actionLoading}
                  style={{
                    borderRadius: "8px",
                    padding: "9px 24px",
                    fontWeight: 700,
                    fontSize: "13px",
                    minWidth: "150px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 4px 12px rgba(166, 61, 47, 0.25)",
                  }}
                >
                  {actionLoading ? "Provisioning..." : <><FaPlus /> Create Subscriber</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Staff Admin Permanent Deletion */}
      {confirmDeleteAdminTarget && (
        <ConfirmationModal
          isOpen={!!confirmDeleteAdminTarget}
          title="Permanently Delete Branch Admin"
          message={`Are you sure you want to permanently delete "${confirmDeleteAdminTarget.name}" (${confirmDeleteAdminTarget.email})? If this admin is active, 1 seat will be released. Any projects or leads assigned to them will be safely unassigned.`}
          confirmText="Yes, Delete Branch Admin"
          cancelText="Cancel"
          isDanger={true}
          onConfirm={handleDeleteTenantAdmin}
          onCancel={() => setConfirmDeleteAdminTarget(null)}
          loading={actionLoading}
        />
      )}
    </div>
  );
};

export default SubscriberManagement;

