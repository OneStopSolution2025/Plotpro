import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FaArrowLeft,
  FaBuilding,
  FaMapMarkerAlt,
  FaUserTie,
  FaEnvelope,
  FaPhoneAlt,
  FaEdit,
  FaPowerOff,
  FaLayerGroup,
  FaCheckCircle,
  FaClock,
  FaTimesCircle,
  FaExternalLinkAlt,
  FaPlus,
  FaShieldAlt,
  FaTrash,
} from "react-icons/fa";
import { useToast } from "../../context/ToastContext";
import { superAdminApi } from "../../services/api";
import ConfirmationModal from "../components/ConfirmationModal";
import BranchFormModal from "../components/BranchFormModal";
import "../styles/super-admin.css";

const initials = (name = "") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const BranchDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [branch, setBranch] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadBranchDetail = async () => {
    setIsLoading(true);
    try {
      const res = await superAdminApi.getBranchDetail(id);
      if (res?.success && res.data) {
        setBranch(res.data);
      } else {
        showToast(res?.message || "Failed to load branch details.", "error");
      }
    } catch (err) {
      showToast(err.message || "Failed to load branch details.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadBranchDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleToggleStatus = async () => {
    if (!branch) return;
    setIsTogglingStatus(true);
    try {
      const targetStatus = branch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      const res = await superAdminApi.toggleBranchStatus(branch.id, targetStatus);
      if (res?.success) {
        showToast(
          res.message ||
            `Branch ${targetStatus === "ACTIVE" ? "reactivated" : "deactivated"} successfully.`,
          "success"
        );
        setBranch((prev) => (prev ? { ...prev, status: targetStatus } : null));
        setIsConfirmOpen(false);
      } else {
        showToast(res?.message || "Failed to update branch status.", "error");
      }
    } catch (err) {
      showToast(err.message || "Failed to update branch status.", "error");
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleDeleteBranch = async () => {
    if (!branch) return;
    setIsDeleting(true);
    try {
      const res = await superAdminApi.deleteBranch(branch.id);
      if (res?.success) {
        showToast(
          res.message || `Branch "${branch.name}" deleted successfully.`,
          "success"
        );
        navigate("/super-admin/branches");
      } else {
        showToast(res?.message || "Failed to delete branch.", "error");
      }
    } catch (err) {
      showToast(err.message || "Failed to delete branch.", "error");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  };

  const summary = useMemo(() => {
    return (
      branch?.summary || {
        totalPlots: 0,
        availablePlots: 0,
        reservedPlots: 0,
        soldPlots: 0,
      }
    );
  }, [branch]);

  const projects = useMemo(() => {
    return branch?.projects || [];
  }, [branch]);

  if (isLoading) {
    return (
      <div className="dashboard-page sa-page">
        <div className="sa-detail-loading">
          <div className="sa-detail-spinner" />
          <p>Loading branch details…</p>
        </div>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="dashboard-page sa-page">
        <div className="sa-detail-empty">
          <h2>Branch Not Found</h2>
          <p>The requested branch could not be found or has been removed.</p>
          <button
            type="button"
            className="sa-btn-primary"
            onClick={() => navigate("/super-admin/branches")}
          >
            <FaArrowLeft style={{ marginRight: 6 }} /> Back to Branches
          </button>
        </div>
      </div>
    );
  }

  const isActive = branch.status === "ACTIVE";

  return (
    <div className="dashboard-page sa-page sa-branch-detail-page">
      {/* ── Breadcrumb Back Navigation ──────────────────────────── */}
      <div className="sa-detail-breadcrumb">
        <button
          type="button"
          className="sa-btn-back"
          onClick={() => navigate("/super-admin/branches")}
        >
          <FaArrowLeft style={{ marginRight: 8 }} /> Back to Branches
        </button>
      </div>

      {/* ── Two-Column Hero Overview: Branch Profile & Administrator ─ */}
      <div className="sa-branch-hero-grid">
        {/* Left Card: Branch Profile & Quick Actions */}
        <div className="sa-branch-profile-card">
          <div className="sa-branch-profile-header">
            <div className="sa-branch-profile-identity">
              <div className="sa-branch-avatar-large">
                {initials(branch.name)}
              </div>
              <div className="sa-branch-profile-meta">
                <div className="sa-branch-title-wrap">
                  <h1 className="sa-branch-hero-title">{branch.name}</h1>
                  <span className={`sa-badge sa-badge-${branch.status.toLowerCase()}`}>
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="sa-branch-location-text">
                  <FaMapMarkerAlt style={{ marginRight: 6, color: "#a63d2f" }} />
                  {branch.city || "Tamil Nadu"}
                  {branch.region ? ` • ${branch.region}` : ""}
                </p>
              </div>
            </div>

            {/* Actions: Edit & Activate/Deactivate */}
            <div className="sa-branch-profile-actions">
              <button
                type="button"
                className="sa-btn-secondary-action"
                onClick={() => setIsEditOpen(true)}
                title="Edit branch details"
              >
                <FaEdit style={{ marginRight: 6 }} /> Edit Branch
              </button>

              <button
                type="button"
                className={`sa-btn-status-action ${isActive ? "sa-btn-status--deactivate" : "sa-btn-status--activate"}`}
                onClick={() => setIsConfirmOpen(true)}
                title={isActive ? "Deactivate this branch" : "Reactivate this branch"}
              >
                <FaPowerOff style={{ marginRight: 6 }} />
                {isActive ? "Deactivate Branch" : "Activate Branch"}
              </button>

              <button
                type="button"
                className="sa-btn-status-action"
                onClick={() => setIsDeleteOpen(true)}
                title="Permanently delete this branch"
                style={{ background: "#ffffff", borderColor: "#fca5a5", color: "#dc2626" }}
              >
                <FaTrash style={{ marginRight: 6 }} /> Delete Branch
              </button>
            </div>
          </div>

          {/* Address & Notes info if available */}
          {(branch.address || branch.notes) && (
            <div className="sa-branch-profile-details">
              {branch.address && (
                <div className="sa-branch-detail-row">
                  <span className="sa-detail-label">Address:</span>
                  <span className="sa-detail-value">{branch.address}</span>
                </div>
              )}
              {branch.notes && (
                <div className="sa-branch-detail-row">
                  <span className="sa-detail-label">Notes:</span>
                  <span className="sa-detail-value">{branch.notes}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Card: Branch Administrator */}
        <div className="sa-branch-admin-card">
          <div className="sa-branch-admin-card-header">
            <span className="sa-card-kicker">
              <FaShieldAlt style={{ marginRight: 6, color: "#a63d2f" }} />
              BRANCH ADMINISTRATOR
            </span>
            {branch.branchAdmin?.status && (
              <span className={`sa-badge sa-badge-${branch.branchAdmin.status.toLowerCase()}`}>
                {branch.branchAdmin.status}
              </span>
            )}
          </div>

          {branch.branchAdmin ? (
            <div className="sa-branch-admin-profile">
              <div className="sa-admin-avatar">
                {initials(branch.branchAdmin.name || "BA")}
              </div>
              <div className="sa-admin-meta">
                <h3 className="sa-admin-name">
                  {branch.branchAdmin.name || "Branch Admin"}
                </h3>
                <div className="sa-admin-contacts">
                  {branch.branchAdmin.email && (
                    <a
                      href={`mailto:${branch.branchAdmin.email}`}
                      className="sa-admin-contact-link"
                      title="Send email"
                    >
                      <FaEnvelope style={{ marginRight: 6, color: "#a63d2f" }} />
                      <span>{branch.branchAdmin.email}</span>
                    </a>
                  )}
                  {branch.branchAdmin.phone ? (
                    <a
                      href={`tel:${branch.branchAdmin.phone}`}
                      className="sa-admin-contact-link"
                      title="Call phone"
                    >
                      <FaPhoneAlt style={{ marginRight: 6, color: "#a63d2f" }} />
                      <span>{branch.branchAdmin.phone}</span>
                    </a>
                  ) : (
                    <span className="sa-admin-contact-placeholder">
                      <FaPhoneAlt style={{ marginRight: 6, color: "#cbd5e1" }} />
                      No phone number provided
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="sa-branch-admin-unassigned">
              <FaUserTie className="sa-unassigned-icon" />
              <p>No administrator assigned to this branch yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Key Performance Indicators (5 Stat Cards) ─────────── */}
      <section className="dashboard-stats sa-branch-stats-grid" aria-label="Branch Key Metrics">
        {/* Metric 1: Managed Projects */}
        <div className="dashboard-stat-card">
          <div className="stat-icon blue">
            <FaBuilding />
          </div>
          <div className="stat-content">
            <span className="stat-title">MANAGED PROJECTS</span>
            <h2>{branch.totalProjects ?? projects.length}</h2>
            <p>Active developments</p>
          </div>
        </div>

        {/* Metric 2: Total Plots */}
        <div className="dashboard-stat-card">
          <div className="stat-icon blue">
            <FaLayerGroup />
          </div>
          <div className="stat-content">
            <span className="stat-title">TOTAL PLOTS</span>
            <h2>{summary.totalPlots}</h2>
            <p>Across all layouts</p>
          </div>
        </div>

        {/* Metric 3: Available Plots */}
        <div className="dashboard-stat-card">
          <div className="stat-icon green">
            <FaCheckCircle />
          </div>
          <div className="stat-content">
            <span className="stat-title">AVAILABLE PLOTS</span>
            <h2>{summary.availablePlots}</h2>
            <p>Ready for booking</p>
          </div>
        </div>

        {/* Metric 4: Reserved Plots */}
        <div className="dashboard-stat-card">
          <div className="stat-icon orange">
            <FaClock />
          </div>
          <div className="stat-content">
            <span className="stat-title">RESERVED PLOTS</span>
            <h2>{summary.reservedPlots}</h2>
            <p>Token held</p>
          </div>
        </div>

        {/* Metric 5: Sold Plots */}
        <div className="dashboard-stat-card">
          <div className="stat-icon pink">
            <FaTimesCircle />
          </div>
          <div className="stat-content">
            <span className="stat-title">SOLD PLOTS</span>
            <h2>{summary.soldPlots}</h2>
            <p>Completed sales</p>
          </div>
        </div>
      </section>

      {/* ── Branch Projects Section ──────────────────────────────── */}
      <section className="dashboard-section sa-section">
        <div className="sa-section-header-row">
          <div>
            <h2 className="sa-section-title">
              Branch Projects ({projects.length})
            </h2>
            <p className="sa-section-subtitle">
              All layouts and real estate developments assigned to {branch.name}.
            </p>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="sa-empty-state-card">
            <div className="sa-empty-state-icon-wrap">
              <FaBuilding />
            </div>
            <h3 className="sa-empty-state-title">No Projects Associated Yet</h3>
            <p className="sa-empty-state-desc">
              There are currently no real estate developments associated with {branch.name}.
              You can create new projects for this branch so its administrator can manage plots, customer enquiries, and site visits.
            </p>
            <button
              type="button"
              className="sa-btn-primary"
              onClick={() => navigate("/super-admin/projects/new")}
            >
              <FaPlus style={{ marginRight: 8 }} /> Create Project for this Branch
            </button>
          </div>
        ) : (
          <div className="sa-branch-projects-grid">
            {projects.map((proj) => {
              const stats = proj.plotStats || {
                total: 0,
                available: 0,
                reserved: 0,
                sold: 0,
              };

              const total = stats.total || 0;
              const availPct = total > 0 ? (stats.available / total) * 100 : 0;
              const resPct = total > 0 ? (stats.reserved / total) * 100 : 0;
              const soldPct = total > 0 ? (stats.sold / total) * 100 : 0;

              return (
                <div key={proj.id} className="sa-project-card">
                  <div className="sa-project-card-header">
                    <div>
                      <div className="sa-project-card-id">{proj.id}</div>
                      <h3 className="sa-project-card-title">{proj.title}</h3>
                      <div className="sa-project-card-city">
                        <FaMapMarkerAlt style={{ marginRight: 5, color: "#a63d2f" }} />
                        {proj.city || proj.location || "Location not set"}
                      </div>
                    </div>

                    <div className="sa-project-card-badges">
                      <span
                        className={`sa-badge sa-badge-${(proj.approvalStatus || proj.status || "active").toLowerCase()}`}
                      >
                        {proj.approvalStatus || proj.status || "Active"}
                      </span>
                    </div>
                  </div>

                  {/* Plot Statistics Chips */}
                  <div className="sa-plot-chips-row">
                    <span className="sa-plot-chip sa-plot-chip--total" title="Total plots">
                      <strong>{stats.total}</strong> Total
                    </span>
                    <span className="sa-plot-chip sa-plot-chip--available" title="Available plots">
                      <strong>{stats.available}</strong> Avail
                    </span>
                    <span className="sa-plot-chip sa-plot-chip--reserved" title="Reserved plots">
                      <strong>{stats.reserved}</strong> Res
                    </span>
                    <span className="sa-plot-chip sa-plot-chip--sold" title="Sold plots">
                      <strong>{stats.sold}</strong> Sold
                    </span>
                  </div>

                  {/* Progress / Distribution Bar */}
                  <div
                    className="sa-plot-distribution-bar"
                    title={`Available: ${stats.available} (${Math.round(availPct)}%) | Reserved: ${stats.reserved} (${Math.round(resPct)}%) | Sold: ${stats.sold} (${Math.round(soldPct)}%)`}
                  >
                    {total === 0 ? (
                      <div
                        className="sa-plot-bar-segment sa-plot-bar-segment--empty"
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <>
                        <div
                          className="sa-plot-bar-segment sa-plot-bar-segment--available"
                          style={{ width: `${availPct}%` }}
                        />
                        <div
                          className="sa-plot-bar-segment sa-plot-bar-segment--reserved"
                          style={{ width: `${resPct}%` }}
                        />
                        <div
                          className="sa-plot-bar-segment sa-plot-bar-segment--sold"
                          style={{ width: `${soldPct}%` }}
                        />
                      </>
                    )}
                  </div>

                  {/* Footer Action */}
                  <div className="sa-project-card-footer">
                    <button
                      type="button"
                      className="sa-btn-action sa-btn-action--sm"
                      onClick={() =>
                        navigate(`/admin/projects/${proj._id || proj.id}/plots`)
                      }
                      title="Inspect layout and plots for this project"
                    >
                      <FaExternalLinkAlt style={{ marginRight: 6, fontSize: "11px" }} />
                      View Plots
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Edit Branch Modal ────────────────────────────────────── */}
      <BranchFormModal
        open={isEditOpen}
        editingBranch={branch}
        onClose={() => setIsEditOpen(false)}
        onSaved={() => {
          setIsEditOpen(false);
          loadBranchDetail();
        }}
      />

      {/* ── Toggle Branch Status Confirmation ────────────────────── */}
      <ConfirmationModal
        isOpen={isConfirmOpen}
        title={isActive ? "Deactivate Branch" : "Activate Branch"}
        message={
          isActive
            ? `Are you sure you want to deactivate ${branch.name}?`
            : `Are you sure you want to reactivate ${branch.name}?`
        }
        subMessage={
          isActive
            ? "Deactivating this branch will pause login access for its Branch Admin. Projects assigned to this branch remain preserved."
            : "Reactivating this branch will restore login access for its Branch Admin."
        }
        confirmText={isActive ? "Deactivate Branch" : "Activate Branch"}
        cancelText="Cancel"
        type={isActive ? "warning" : "success"}
        isLoading={isTogglingStatus}
        onConfirm={handleToggleStatus}
        onCancel={() => setIsConfirmOpen(false)}
      />

      {/* ── Delete Branch Confirmation ───────────────────────────── */}
      <ConfirmationModal
        isOpen={isDeleteOpen}
        title="Delete Branch"
        message={`Are you sure you want to permanently delete "${branch?.name}"?`}
        subMessage="Associated projects will be unlinked and remain safely in your workspace. The branch administrator account will be removed and their seat will be released. This action cannot be undone."
        confirmText="Delete Branch"
        cancelText="Cancel"
        type="danger"
        isLoading={isDeleting}
        onConfirm={handleDeleteBranch}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
};

export default BranchDetail;
