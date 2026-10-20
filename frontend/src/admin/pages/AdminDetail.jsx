import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAdmins } from "../context/AdminContext";
import { useProjects } from "../../context/ProjectContext";
import { usePlots } from "../../context/PlotContext";
import { getAdminDetailSummary } from "../data/superAdminSelectors";
import ConfirmationModal from "../components/ConfirmationModal";
import "../styles/super-admin.css";

const initials = (name = "") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const AdminDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { admins, toggleAdminStatus, deleteAdmin } = useAdmins();
  const { projects } = useProjects();
  const { plots } = usePlots();

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const detail = useMemo(
    () => getAdminDetailSummary(id, admins, projects, plots),
    [id, admins, projects, plots]
  );

  if (!detail || !detail.admin) {
    return (
      <div className="dashboard-page sa-page">
        <div className="sa-not-found">
          <h2>Administrator Not Found</h2>
          <p>No administrator account matches the ID "{id}".</p>
          <button
            type="button"
            className="sa-btn-primary"
            onClick={() => navigate("/super-admin/admins")}
          >
            Back to Admins
          </button>
        </div>
      </div>
    );
  }

  const { admin, summary, managedProjects } = detail;

  return (
    <div className="dashboard-page sa-page">
      {/* =====================================================
          TOP NAVIGATION & HEADER
      ===================================================== */}
      <div className="sa-detail-top">
        <Link to="/super-admin/admins" className="sa-back-link">
          &larr; Back to Administrators
        </Link>
      </div>

      {/* =====================================================
          ADMIN INFORMATION CARD
      ===================================================== */}
      <section className="dashboard-section sa-section sa-admin-info-card">
        <div className="sa-admin-info-main">
          <div className="sa-avatar sa-avatar-lg" aria-hidden="true">
            {initials(admin.name)}
          </div>

          <div className="sa-admin-info-text">
            <div className="sa-admin-info-title-row">
              <h1>{admin.name}</h1>
              <span className={`sa-badge sa-badge-${admin.status.toLowerCase()}`}>
                {admin.status}
              </span>
            </div>

            <div className="sa-admin-meta-grid">
              <div className="sa-meta-item">
                <span className="sa-meta-label">Role</span>
                <span className="sa-meta-value">{admin.role || "Administrator"}</span>
              </div>
              <div className="sa-meta-item">
                <span className="sa-meta-label">Email</span>
                <span className="sa-meta-value">{admin.email}</span>
              </div>
              <div className="sa-meta-item">
                <span className="sa-meta-label">Mobile</span>
                <span className="sa-meta-value">{admin.mobile || "Not specified"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="sa-admin-info-actions">
          <button
            type="button"
            className={`sa-btn-toggle ${
              admin.status === "Active" ? "deactivate" : "activate"
            }`}
            onClick={() => setConfirmModalOpen(true)}
          >
            {admin.status === "Active" ? "Deactivate Account" : "Activate Account"}
          </button>

          <button
            type="button"
            className="sa-btn-toggle delete"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            Delete Account
          </button>
        </div>
      </section>

      {/* =====================================================
          ADMIN SUMMARY (KPIs)
      ===================================================== */}
      <section className="dashboard-stats" aria-label="Admin workload summary">
        <div className="dashboard-stat-card">
          <div className="stat-content">
            <span className="stat-title">Projects Handled</span>
            <h2>{summary.projectsCount}</h2>
            <p>Assigned projects</p>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-content">
            <span className="stat-title">Available Plots</span>
            <h2>{summary.availablePlots}</h2>
            <p>Ready for booking</p>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-content">
            <span className="stat-title">Reserved Plots</span>
            <h2>{summary.reservedPlots}</h2>
            <p>Pending confirmation</p>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-content">
            <span className="stat-title">Sold Plots</span>
            <h2>{summary.soldPlots}</h2>
            <p>Completed sales</p>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-content">
            <span className="stat-title">Total Plots</span>
            <h2>{summary.totalPlots}</h2>
            <p>Total responsibility</p>
          </div>
        </div>
      </section>

      {/* =====================================================
          MANAGED PROJECTS TABLE
      ===================================================== */}
      <section className="dashboard-section sa-section">
        <div className="dashboard-section-header">
          <div>
            <h2>Managed Projects</h2>
            <p>Plot inventory breakdown for projects assigned to {admin.name}.</p>
          </div>
        </div>

        <div className="sa-table-scroll">
          <table className="sa-table">
            <thead>
              <tr>
                <th scope="col">Project Name</th>
                <th scope="col">Available</th>
                <th scope="col">Reserved</th>
                <th scope="col">Sold</th>
                <th scope="col">Total Plots</th>
              </tr>
            </thead>
            <tbody>
              {managedProjects.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
                    No projects are currently assigned to this administrator.
                  </td>
                </tr>
              ) : (
                managedProjects.map((proj) => (
                  <tr key={proj.id}>
                    <th scope="row">
                      <strong style={{ color: "#1e293b", fontSize: "13px" }}>
                        {proj.title}
                      </strong>
                    </th>
                    <td>{proj.available}</td>
                    <td>{proj.reserved}</td>
                    <td>{proj.sold}</td>
                    <td><strong>{proj.total}</strong></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* CONFIRMATION MODAL FOR DEACTIVATE / ACTIVATE */}
      <ConfirmationModal
        isOpen={confirmModalOpen}
        title={
          admin.status === "Active"
            ? "Deactivate Administrator?"
            : "Activate Administrator?"
        }
        message={
          admin.status === "Active"
            ? `Are you sure you want to deactivate ${admin.name}'s account?`
            : `Are you sure you want to activate ${admin.name}'s account?`
        }
        subMessage={
          admin.status === "Active"
            ? "This administrator will immediately lose operational access to manage projects, plots, and customer leads."
            : "This administrator will regain access to log in and manage assigned projects and plots."
        }
        confirmText={
          admin.status === "Active" ? "Deactivate Account" : "Activate Account"
        }
        type={admin.status === "Active" ? "danger" : "success"}
        isLoading={isTogglingStatus}
        onCancel={() => setConfirmModalOpen(false)}
        onConfirm={async () => {
          setIsTogglingStatus(true);
          try {
            await toggleAdminStatus(admin.id);
            setConfirmModalOpen(false);
          } finally {
            setIsTogglingStatus(false);
          }
        }}
      />

      {/* CONFIRMATION MODAL FOR PERMANENT DELETE */}
      <ConfirmationModal
        isOpen={confirmDeleteOpen}
        title="Delete Administrator?"
        message={`Are you sure you want to permanently delete ${admin.name}'s account?`}
        subMessage="This action will permanently delete this administrator from the database. Any projects assigned to them will be unassigned and preserved for reassignment. This cannot be undone."
        confirmText="Delete Admin"
        type="danger"
        isLoading={isDeleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          setIsDeleting(true);
          try {
            await deleteAdmin(admin._id || admin.id);
            setConfirmDeleteOpen(false);
            navigate("/super-admin/admins");
          } finally {
            setIsDeleting(false);
          }
        }}
      />
    </div>
  );
};

export default AdminDetail;
