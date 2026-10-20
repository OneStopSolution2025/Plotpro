import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import {
  FaBuilding,
  FaUserCheck,
  FaExclamationTriangle,
  FaCheckCircle,
  FaTimes,
  FaMapMarkerAlt,
} from "react-icons/fa";
import { getProjectPlotSummary } from "../../data/superAdminSelectors";
import { useNotifications } from "../../context/NotificationContext";
import CustomDropdown from "../CustomDropdown";

/* =========================================================
   UNASSIGNED & PROJECT ASSIGNMENT SECTION
   ---------------------------------------------------------
   Allows Super Admin to monitor unassigned projects and
   assign or reassign them to available (Active) normal admins.
   ========================================================= */

const UnassignedProjectsSection = ({
  projects = [],
  plots = [],
  admins = [],
  assignProject,
}) => {
  // Filter for unassigned projects (no adminId or adminId === null)
  const unassignedProjects = useMemo(
    () => projects.filter((p) => !p.adminId || p.adminId === null),
    [projects]
  );

  // Available normal admins: strictly ACTIVE admins
  const availableAdmins = useMemo(
    () =>
      admins.filter(
        (a) =>
          String(a.status).toUpperCase() === "ACTIVE" && !a.deactivatedBySupreme
      ),
    [admins]
  );

  // Inactive admins (for permission awareness/display)
  const inactiveAdmins = useMemo(
    () =>
      admins.filter(
        (a) =>
          String(a.status).toUpperCase() !== "ACTIVE" || a.deactivatedBySupreme
      ),
    [admins]
  );

  // Project count handled by each admin for workload balancing
  const adminWorkload = useMemo(() => {
    const map = {};
    admins.forEach((admin) => {
      map[admin.id] = projects.filter(
        (p) => p.adminId && String(p.adminId) === String(admin.id)
      ).length;
    });
    return map;
  }, [admins, projects]);

  // View state: 'unassigned' or 'all'
  const [activeTab, setActiveTab] = useState(
    unassignedProjects.length > 0 ? "unassigned" : "all"
  );

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [targetProject, setTargetProject] = useState(null);
  const [selectedAdminId, setSelectedAdminId] = useState("");
  const [formError, setFormError] = useState("");
  const [toastMessage, setToastMessage] = useState(null);

  // Toast auto-clear
  const showToast = (message) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 4000);
  };

  // Open assignment modal for a specific project
  const handleOpenAssignModal = (project) => {
    setTargetProject(project);
    setSelectedAdminId(project.adminId || "");
    setFormError("");
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setTargetProject(null);
    setSelectedAdminId("");
    setFormError("");
  };

  const { addNotification } = useNotifications();

  // Execute assignment with permission validation
  const handleConfirmAssignment = (e) => {
    e.preventDefault();
    if (!targetProject) return;

    const previousAdmin = admins.find(
      (a) => String(a.id) === String(targetProject.adminId)
    );

    // If an admin is chosen, verify that the admin is an available ACTIVE admin
    if (selectedAdminId) {
      const chosenAdmin = admins.find(
        (a) => String(a.id) === String(selectedAdminId)
      );

      if (!chosenAdmin) {
        setFormError("The selected administrator was not found.");
        return;
      }

      if (chosenAdmin.status !== "Active") {
        setFormError(
          `Permission Denied: "${chosenAdmin.name}" is Inactive. Projects can only be assigned to Active administrators.`
        );
        return;
      }

      const res = assignProject(targetProject.id, selectedAdminId);
      if (res && res.success !== false) {
        showToast({
          type: "success",
          text: `Project "${targetProject.title}" successfully assigned to ${chosenAdmin.name}.`,
        });

        // Notify the newly assigned admin
        addNotification({
          adminId: chosenAdmin.id,
          adminName: chosenAdmin.name,
          type: "PROJECT_ASSIGNED",
          title: "New Project Assigned",
          message: `Super Admin assigned project "${targetProject.title}" (${targetProject.location}) to you to manage plots and details.`,
        });

        // If previously assigned to another admin, notify them of re-assignment
        if (previousAdmin && String(previousAdmin.id) !== String(chosenAdmin.id)) {
          addNotification({
            adminId: previousAdmin.id,
            adminName: previousAdmin.name,
            type: "PROJECT_UNASSIGNED",
            title: "Project Reallocated",
            message: `Super Admin reallocated project "${targetProject.title}" to ${chosenAdmin.name}.`,
          });
        }
      }
    } else {
      // Unassigning project
      const res = assignProject(targetProject.id, null);
      if (res && res.success !== false) {
        showToast({
          type: "info",
          text: `Project "${targetProject.title}" is now unassigned.`,
        });

        if (previousAdmin) {
          addNotification({
            adminId: previousAdmin.id,
            adminName: previousAdmin.name,
            type: "PROJECT_UNASSIGNED",
            title: "Project Unassigned",
            message: `Super Admin unassigned project "${targetProject.title}" from your account portfolio.`,
          });
        }
      }
    }

    handleCloseModal();
  };

  // Filter projects to display based on activeTab
  const displayedProjects =
    activeTab === "unassigned" ? unassignedProjects : projects;

  return (
    <section
      id="unassigned-projects-section"
      className="dashboard-section sa-section"
      aria-label="Project Assignments and Allocation"
    >
      {/* Toast Alert Notification */}
      {toastMessage && (
        <div
          className={`sa-alert-toast ${
            toastMessage.type === "success" ? "success" : "info"
          }`}
          role="status"
        >
          {toastMessage.type === "success" ? (
            <FaCheckCircle />
          ) : (
            <FaBuilding />
          )}
          <span>{toastMessage.text}</span>
          <button
            type="button"
            className="sa-alert-toast-close"
            onClick={() => setToastMessage(null)}
            aria-label="Close notification"
          >
            <FaTimes />
          </button>
        </div>
      )}

      {/* Section Header */}
      <div className="dashboard-section-header">
        <div>
          <h2>Project Assignments &amp; Allocation</h2>

        </div>

        {/* Tab Controls */}
        <div className="sa-tab-controls" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "unassigned"}
            className={`sa-tab-btn ${activeTab === "unassigned" ? "active" : ""}`}
            onClick={() => setActiveTab("unassigned")}
          >
            Unassigned
            <span
              className={`sa-tab-badge ${
                unassignedProjects.length > 0 ? "warning" : "muted"
              }`}
            >
              {unassignedProjects.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            className={`sa-tab-btn ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All Projects
            <span className="sa-tab-badge neutral">{projects.length}</span>
          </button>
        </div>
      </div>

      {/* Summary Status Banner */}
      {unassignedProjects.length > 0 ? (
        <div className="sa-assignment-banner warning" role="alert">
          <FaExclamationTriangle className="banner-icon" />
          <div className="banner-content">
            <strong>
              {unassignedProjects.length} Project
              {unassignedProjects.length > 1 ? "s" : ""} Awaiting Assignment
            </strong>
            <p>
              These projects currently have no designated normal administrator.
              Assign them to available active admins below to grant operational
              management.
            </p>
          </div>
        </div>
      ) : (
        <div className="sa-assignment-banner success" role="status">
          <FaCheckCircle className="banner-icon" />
          <div className="banner-content">
            <strong>All Projects Fully Assigned</strong>
            <p>
              All {projects.length} projects are currently allocated to active
              administrators. You can review or reassign any project at any time.
            </p>
          </div>
        </div>
      )}

      {/* Projects Table */}
      <div className="sa-table-scroll">
        <table className="sa-table">
          <caption className="sr-only">
            Project assignment status and administrator allocation list.
          </caption>

          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Type &amp; Status</th>
              <th scope="col">Plots (Avail / Total)</th>
              <th scope="col">Price</th>
              <th scope="col">Assigned Admin</th>
              <th scope="col">Permission &amp; Action</th>
            </tr>
          </thead>

          <tbody>
            {displayedProjects.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  style={{
                    textAlign: "center",
                    padding: "2.5rem 1rem",
                    color: "#94a3b8",
                  }}
                >
                  <FaCheckCircle
                    style={{
                      fontSize: "2rem",
                      color: "#10b981",
                      marginBottom: "0.5rem",
                      display: "block",
                      margin: "0 auto 8px",
                    }}
                  />
                  <strong>No unassigned projects.</strong>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "12px",
                      color: "#64748b",
                    }}
                  >
                    All projects are assigned. Switch to "All Projects" to
                    reallocate assignments.
                  </p>
                </td>
              </tr>
            ) : (
              displayedProjects.map((project) => {
                const summary = getProjectPlotSummary(project, plots);
                const assignedAdmin = admins.find(
                  (a) => String(a.id) === String(project.adminId)
                );
                const isUnassigned = !assignedAdmin;

                return (
                  <tr
                    key={project.id}
                    className={isUnassigned ? "sa-row-highlight" : ""}
                  >
                    {/* Project Name & Location */}
                    <th scope="row">
                      <span className="sa-project-avatar" aria-hidden="true">
                        <FaBuilding />
                      </span>
                      <div className="sa-person">
                        <strong>{project.title}</strong>
                        <small>
                          <FaMapMarkerAlt style={{ marginRight: 3 }} />
                          {project.location}
                        </small>
                      </div>
                    </th>

                    {/* Type & Status */}
                    <td>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span className="sa-pill-meta">{project.plotType || "Plots"}</span>
                        <span
                          className={`sa-badge ${
                            project.status === "Active"
                              ? "sa-badge-active"
                              : "sa-badge-inactive"
                          }`}
                        >
                          {project.status || "Active"}
                        </span>
                      </div>
                    </td>

                    {/* Plots Count */}
                    <td>
                      <strong style={{ color: "#0f172a" }}>
                        {summary.available}
                      </strong>
                      <span style={{ color: "#94a3b8" }}> / {summary.total}</span>
                    </td>

                    {/* Price */}
                    <td>{project.plotPrice || "—"}</td>

                    {/* Assigned Admin */}
                    <td>
                      {assignedAdmin ? (
                        <div className="sa-assigned-admin-cell">
                          <span className="sa-admin-indicator active" />
                          <div>
                            <strong style={{ color: "#1e293b", fontSize: "12px" }}>
                              {assignedAdmin.name}
                            </strong>
                            <div style={{ fontSize: "10px", color: "#64748b" }}>
                              {assignedAdmin.email}
                              {assignedAdmin.status !== "Active" && (
                                <span className="sa-text-danger" style={{ marginLeft: 4 }}>
                                  (Inactive)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="sa-badge sa-badge-unassigned">
                          Unassigned
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td>
                      <button
                        type="button"
                        className={
                          isUnassigned ? "sa-btn-primary sa-btn-sm" : "sa-btn-secondary sa-btn-sm"
                        }
                        onClick={() => handleOpenAssignModal(project)}
                      >
                        <FaUserCheck style={{ marginRight: 6 }} />
                        {isUnassigned ? "Assign Admin" : "Reassign"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* =====================================================
          ASSIGNMENT MODAL
      ===================================================== */}
      {modalOpen && targetProject && (
        <div
          className="sa-modal-overlay"
          onClick={handleCloseModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-modal-title"
        >
          <div
            className="sa-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "520px",
              width: "100%",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "visible",
            }}
          >
            <div className="sa-modal-header" style={{ flexShrink: 0 }}>
              <h3 id="assign-modal-title">
                {targetProject.adminId ? "Reassign Project" : "Assign Project to Administrator"}
              </h3>
              <button
                type="button"
                className="sa-modal-close"
                onClick={handleCloseModal}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={handleConfirmAssignment}
              className="sa-modal-form"
              style={{
                overflowY: "auto",
                overflowX: "visible",
                maxHeight: "calc(90vh - 70px)",
                paddingBottom: "40px",
              }}
            >
              {/* Project Preview Card */}
              <div className="sa-modal-project-card">
                <span className="sa-project-card-kicker">SELECTED PROJECT</span>
                <h4>{targetProject.title}</h4>
                <p>
                  <FaMapMarkerAlt style={{ marginRight: 4 }} />
                  {targetProject.location} • {targetProject.plotType}
                </p>
                <div className="sa-project-card-stats">
                  <span>
                    Total Plots: <strong>{targetProject.totalPlots || 0}</strong>
                  </span>
                  <span>
                    Price: <strong>{targetProject.plotPrice || "—"}</strong>
                  </span>
                </div>
              </div>

              {formError && (
                <div className="sa-form-error" role="alert">
                  <FaExclamationTriangle style={{ marginRight: 6 }} />
                  {formError}
                </div>
              )}

              {/* Administrator Selection */}
              <div className="sa-form-field">
                <label htmlFor="assign-admin-select">
                  Select Normal Administrator <span style={{ color: "#dc2626" }}>*</span>
                </label>

                <CustomDropdown
                  id="assign-admin-select"
                  className="sa-select-input"
                  value={selectedAdminId}
                  onChange={(e) => {
                    setSelectedAdminId(e.target.value);
                    setFormError("");
                  }}
                  placeholder="-- Leave Unassigned (None) --"
                >
                  <option value="">-- Leave Unassigned (None) --</option>

                  <optgroup label="Available Normal Admins (Active)">
                    {availableAdmins.map((admin) => (
                      <option key={admin.id} value={admin.id}>
                        {admin.name} — ({adminWorkload[admin.id] || 0} projects currently)
                      </option>
                    ))}
                  </optgroup>

                  {inactiveAdmins.length > 0 && (
                    <optgroup label="Inactive Admins (Permission Denied)">
                      {inactiveAdmins.map((admin) => (
                        <option key={admin.id} value={admin.id} disabled>
                          {admin.name} (Inactive — cannot assign)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </CustomDropdown>

                <div className="sa-field-permission-note">
                  <FaUserCheck style={{ color: "#a63d2f", marginRight: 4 }} />
                  <span>
                    <strong>Permission Rule:</strong> Only normal administrators with{" "}
                    <span style={{ color: "#059669", fontWeight: 700 }}>Active</span> status
                    are permitted to be assigned projects.
                  </span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="sa-modal-actions">
                <button
                  type="button"
                  className="sa-btn-secondary"
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>

                <button type="submit" className="sa-btn-primary">
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

UnassignedProjectsSection.propTypes = {
  projects: PropTypes.array.isRequired,
  plots: PropTypes.array.isRequired,
  admins: PropTypes.array.isRequired,
  assignProject: PropTypes.func.isRequired,
};

export default UnassignedProjectsSection;
