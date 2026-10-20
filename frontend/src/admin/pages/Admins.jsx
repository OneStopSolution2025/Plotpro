import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import { useAdmins } from "../context/AdminContext";
import { useProjects } from "../../context/ProjectContext";
import { usePlots } from "../../context/PlotContext";
import { buildAdminPerformance } from "../data/superAdminSelectors";
import ConfirmationModal from "../components/ConfirmationModal";
import "../styles/super-admin.css";

const initials = (name = "") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const Admins = () => {
  const { admins, subscriptionInfo, createAdmin, updateAdmin, toggleAdminStatus, deleteAdmin } = useAdmins();
  const { projects } = useProjects();
  const { plots } = usePlots();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [formData, setFormData] = useState({ name: "", email: "", mobile: "" });
  const [formError, setFormError] = useState("");
  const [confirmStatusAdmin, setConfirmStatusAdmin] = useState(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [confirmDeleteAdmin, setConfirmDeleteAdmin] = useState(null);
  const [isDeletingAdmin, setIsDeletingAdmin] = useState(false);

  const adminPerformance = useMemo(
    () => buildAdminPerformance(admins, projects, plots),
    [admins, projects, plots]
  );

  const { showToast } = useToast();
  const isLimitReached = Boolean(subscriptionInfo && subscriptionInfo.remainingSeats <= 0);

  const openCreateModal = () => {
    if (isLimitReached) {
      showToast(
        `Admin seat limit reached (${subscriptionInfo?.assignedSeats || 3} max). You cannot create more administrators under your current plan. Please upgrade your subscription or deactivate an existing administrator.`,
        "error"
      );
      return;
    }
    setEditingAdmin(null);
    setFormData({ name: "", email: "", mobile: "", password: "" });
    setFormError("");
    setModalOpen(true);
  };

  const openEditModal = (admin) => {
    setEditingAdmin(admin);
    setFormData({
      name: admin.name || "",
      email: admin.email || "",
      mobile: admin.mobile || "",
      password: "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingAdmin(null);
    setFormError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      setFormError("Name and Email are required.");
      return;
    }

    if (editingAdmin) {
      await updateAdmin(editingAdmin.id, formData);
    } else {
      const res = await createAdmin(formData);
      if (!res.success) {
        setFormError(res.error || "Failed to create admin.");
        return;
      }
    }
    closeModal();
  };

  return (
    <div className="dashboard-page sa-page">
      <div className="sa-page-header">
        <div>
          <span className="dashboard-kicker">ADMIN MANAGEMENT</span>
          <h1 className="sa-page-title">Administrators</h1>
          <p className="sa-page-subtitle">
            Manage administrator accounts, review project workloads, and control operational access.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {subscriptionInfo && (
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                color: "#334155",
              }}
            >
              <strong>Admin Seats:</strong>{" "}
              {subscriptionInfo.assignedSeats >= 999999 ? (
                <span style={{ color: "#059669", fontWeight: 700 }}>
                  {subscriptionInfo.usedSeats} active (Unlimited)
                </span>
              ) : (
                <>
                  <span style={{ color: subscriptionInfo.remainingSeats === 0 ? "#dc2626" : "#059669", fontWeight: 700 }}>
                    {subscriptionInfo.usedSeats} / {subscriptionInfo.assignedSeats}
                  </span>{" "}
                  ({subscriptionInfo.remainingSeats} remaining)
                </>
              )}
              {subscriptionInfo.isCustomOverride && (
                <span className="badge bg-warning text-dark ms-2" style={{ fontSize: "11px" }} title={subscriptionInfo.customOverrideReason || "Custom platform allocation"}>
                  Custom Allocation
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            className={`sa-btn-primary ${isLimitReached ? "disabled" : ""}`}
            style={isLimitReached ? { opacity: 0.6, cursor: "not-allowed", backgroundColor: "#64748b" } : {}}
            onClick={openCreateModal}
            title={isLimitReached ? "Admin seat limit reached. Upgrade your subscription to add more administrators." : "Add New Admin"}
          >
            + Add New Admin
          </button>
        </div>
      </div>

      <section className="dashboard-section sa-section">
        <div className="sa-table-scroll">
          <table className="sa-table">
            <thead>
              <tr>
                <th scope="col">Admin</th>
                <th scope="col">Contact</th>
                <th scope="col">Projects</th>
                <th scope="col">Total Plots</th>
                <th scope="col">Status</th>
                <th scope="col" style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {adminPerformance.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
                    No administrators found.
                  </td>
                </tr>
              ) : (
                adminPerformance.map((admin) => (
                  <tr key={admin.id}>
                    <th scope="row">
                      <span className="sa-avatar" aria-hidden="true">
                        {initials(admin.name)}
                      </span>
                      <span className="sa-person">
                        <strong>{admin.name}</strong>
                        <small>{admin.email}</small>
                      </span>
                    </th>

                    <td>{admin.mobile || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td><strong>{admin.projectsCount}</strong></td>
                    <td><strong>{admin.totalPlots}</strong></td>

                    <td>
                      <span className={`sa-badge sa-badge-${admin.status.toLowerCase()}`}>
                        {admin.status}
                      </span>
                      {admin.deactivatedBySupreme && admin.status === "Inactive" && (
                        <div style={{ marginTop: "4px" }}>
                          <span
                            className="badge bg-warning text-dark"
                            style={{ fontSize: "10px", padding: "2px 6px" }}
                            title="Deactivated by Platform Owner (Supreme Admin)"
                          >
                            Platform Locked
                          </span>
                        </div>
                      )}
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <div className="sa-action-group">
                        <Link
                          to={`/super-admin/admins/${admin.id}`}
                          className="sa-btn-action"
                          title="View Admin Details"
                        >
                          View
                        </Link>

                        <button
                          type="button"
                          className="sa-btn-action"
                          onClick={() => openEditModal(admin)}
                          title="Edit Admin"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className={`sa-btn-toggle ${
                            admin.status === "Active" ? "deactivate" : "activate"
                          }`}
                          onClick={() => {
                            if (admin.status !== "Active" && admin.deactivatedBySupreme) {
                              showToast(
                                "This administrator was deactivated by the Platform Owner (Supreme Admin) and cannot be reactivated from this dashboard. Please contact platform support or upgrade your plan.",
                                "error"
                              );
                              return;
                            }
                            setConfirmStatusAdmin(admin);
                          }}
                          disabled={admin.status !== "Active" && admin.deactivatedBySupreme}
                          style={
                            admin.status !== "Active" && admin.deactivatedBySupreme
                              ? { opacity: 0.5, cursor: "not-allowed" }
                              : {}
                          }
                          title={
                            admin.status !== "Active" && admin.deactivatedBySupreme
                              ? "Locked by Platform Owner"
                              : admin.status === "Active"
                              ? "Deactivate Admin"
                              : "Activate Admin"
                          }
                        >
                          {admin.status === "Active" ? "Deactivate" : "Activate"}
                        </button>

                        <button
                          type="button"
                          className="sa-btn-toggle delete"
                          onClick={() => setConfirmDeleteAdmin(admin)}
                          title="Delete Admin Permanently"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="sa-modal-overlay" onClick={closeModal}>
          <div className="sa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <h3>{editingAdmin ? "Edit Administrator" : "Add New Administrator"}</h3>
              <button
                type="button"
                className="sa-modal-close"
                onClick={closeModal}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="sa-modal-form">
              {formError && <div className="sa-form-error">{formError}</div>}

              <div className="sa-form-field">
                <label htmlFor="admin-name">Full Name *</label>
                <input
                  id="admin-name"
                  type="text"
                  placeholder="e.g. Arun Kumar"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="sa-form-field">
                <label htmlFor="admin-email">Email Address *</label>
                <input
                  id="admin-email"
                  type="email"
                  placeholder="e.g. arun@dreamcity.in"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="sa-form-field">
                <label htmlFor="admin-mobile">Mobile Number</label>
                <input
                  id="admin-mobile"
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                />
              </div>

              {!editingAdmin && (
                <div className="sa-form-field">
                  <label htmlFor="admin-password">Password (default: Admin@123)</label>
                  <input
                    id="admin-password"
                    type="text"
                    placeholder="Enter password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              )}

              <div className="sa-modal-actions">
                <button
                  type="button"
                  className="sa-btn-secondary"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button type="submit" className="sa-btn-primary">
                  {editingAdmin ? "Save Changes" : "Create Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR DEACTIVATE / ACTIVATE */}
      <ConfirmationModal
        isOpen={Boolean(confirmStatusAdmin)}
        title={
          confirmStatusAdmin?.status === "Active"
            ? "Deactivate Administrator?"
            : "Activate Administrator?"
        }
        message={
          confirmStatusAdmin?.status === "Active"
            ? `Are you sure you want to deactivate ${confirmStatusAdmin?.name}'s account?`
            : `Are you sure you want to activate ${confirmStatusAdmin?.name}'s account?`
        }
        subMessage={
          confirmStatusAdmin?.status === "Active"
            ? "This administrator will immediately lose operational access to manage projects, plots, and customer leads."
            : "This administrator will regain access to log in and manage assigned projects and plots."
        }
        confirmText={
          confirmStatusAdmin?.status === "Active" ? "Deactivate Account" : "Activate Account"
        }
        type={confirmStatusAdmin?.status === "Active" ? "danger" : "success"}
        isLoading={isTogglingStatus}
        onCancel={() => setConfirmStatusAdmin(null)}
        onConfirm={async () => {
          if (!confirmStatusAdmin) return;
          setIsTogglingStatus(true);
          try {
            const res = await toggleAdminStatus(confirmStatusAdmin.id);
            if (res && !res.success) {
              showToast(res.error || "Failed to toggle administrator status.", "error");
            } else {
              showToast(
                `Administrator account ${confirmStatusAdmin?.status === "Active" ? "deactivated" : "activated"} successfully.`,
                "success"
              );
            }
            setConfirmStatusAdmin(null);
          } finally {
            setIsTogglingStatus(false);
          }
        }}
      />

      {/* CONFIRMATION MODAL FOR PERMANENT DELETE */}
      <ConfirmationModal
        isOpen={Boolean(confirmDeleteAdmin)}
        title="Delete Administrator?"
        message={`Are you sure you want to permanently delete ${confirmDeleteAdmin?.name}'s account?`}
        subMessage="This action will permanently delete this administrator from the database. Any projects assigned to them will be unassigned and preserved for reassignment. This cannot be undone."
        confirmText="Delete Admin"
        type="danger"
        isLoading={isDeletingAdmin}
        onCancel={() => setConfirmDeleteAdmin(null)}
        onConfirm={async () => {
          if (!confirmDeleteAdmin) return;
          setIsDeletingAdmin(true);
          try {
            await deleteAdmin(confirmDeleteAdmin._id || confirmDeleteAdmin.id);
            setConfirmDeleteAdmin(null);
          } finally {
            setIsDeletingAdmin(false);
          }
        }}
      />
    </div>
  );
};

export default Admins;
