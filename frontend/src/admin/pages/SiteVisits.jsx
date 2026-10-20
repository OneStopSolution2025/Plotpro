import { useState, useEffect, useRef } from "react";
import {
  FaSearch,
  FaPhone,
  FaCalendarAlt,
  FaEllipsisH,
  FaFilter,
  FaEye,
  FaEdit,
  FaTrash,
  FaTimes,
  FaPlus,
  FaSave,
} from "react-icons/fa";

import { useProjects } from "../../context/ProjectContext";
import { usePlots } from "../../context/PlotContext";
import { adminApi, superAdminApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useAdminProfile } from "../context/AdminProfileContext";
import CustomDropdown from "../components/CustomDropdown";

import "../styles/site-visits.css";

const initialVisits = [
  {
    id: 1,
    name: "Arun Kumar",
    phone: "+91 98765 43210",
    project: "Green Valley",
    plot: "Plot A-24",
    date: "26 Sep 2026",
    time: "10:30 AM",
    status: "Scheduled",
  },
  {
    id: 2,
    name: "Priya S",
    phone: "+91 98765 12345",
    project: "Sunrise City",
    plot: "Plot B-18",
    date: "26 Sep 2026",
    time: "02:00 PM",
    status: "Confirmed",
  },
  {
    id: 3,
    name: "Ramesh J",
    phone: "+91 98432 67890",
    project: "Lake View",
    plot: "Plot C-08",
    date: "27 Sep 2026",
    time: "11:00 AM",
    status: "Scheduled",
  },
  {
    id: 4,
    name: "Meena K",
    phone: "+91 97890 11223",
    project: "Green Valley",
    plot: "Plot A-41",
    date: "23 Sep 2026",
    time: "04:30 PM",
    status: "Completed",
  },
  {
    id: 5,
    name: "Senthil V",
    phone: "+91 96543 22110",
    project: "Sunrise City",
    plot: "Plot B-32",
    date: "22 Sep 2026",
    time: "10:00 AM",
    status: "Cancelled",
  },
];

const VISIT_STATUSES = ["Scheduled", "Confirmed", "Completed", "Cancelled"];
const STORAGE_KEY = "dreamcity-site-visits";

const cleanPhone = (phone) => phone ? phone.replace(/[\s\-+]/g, "") : "";

const maskPhone = (phone) => {
  if (!phone) return "—";
  const str = String(phone).trim();
  if (str.length <= 4) return "****";
  const visiblePrefix = str.slice(0, 5);
  return `${visiblePrefix}*****`;
};

const formatDateForDisplay = (isoDate) => {
  if (!isoDate) return "";
  const date = new Date(isoDate + "T00:00:00");
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const formatTimeForDisplay = (time24) => {
  if (!time24) return "";
  const [h, m] = time24.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
};

const parseDisplayDate = (displayDate) => {
  if (!displayDate) return "";
  const parts = displayDate.split(" ");
  if (parts.length !== 3) return "";
  const day = parts[0].padStart(2, "0");
  const monthMap = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  const month = monthMap[parts[1]] || "01";
  const year = parts[2];
  return `${year}-${month}-${day}`;
};

const parseDisplayTime = (displayTime) => {
  if (!displayTime) return "";
  const parts = displayTime.split(" ");
  if (parts.length !== 2) return "";
  const timePart = parts[0];
  const ampm = parts[1];
  const [h, m] = timePart.split(":");
  let hour = parseInt(h, 10);
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${m}`;
};

const initialFormState = {
  name: "",
  phone: "",
  projectId: "",
  project: "",
  plot: "",
  date: "",
  time: "",
  status: "Scheduled",
};

const SiteVisits = () => {
  const { projects } = useProjects();
  const { plots } = usePlots();

  const { role, user, isAuthenticated } = useAuth();
  const { isSubscriptionExpired } = useAdminProfile();
  const [visits, setVisits] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewDetailsId, setViewDetailsId] = useState(null);
  const [changeStatusId, setChangeStatusId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [isVisitFormOpen, setIsVisitFormOpen] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchVisits = async () => {
      setLoading(true);
      try {
        let res;
        if (role === "SUPER_ADMIN") {
          res = await superAdminApi.getAllSiteVisits();
        } else {
          res = await adminApi.getSiteVisits();
        }

        if (isMounted && res?.success && Array.isArray(res.data)) {
          const formatted = res.data.map((v) => ({
            id: v._id,
            _id: v._id,
            name: v.fullName,
            phone: v.mobile,
            project: v.projectId?.title || "Direct Visit",
            plot: v.plot ? `Plot ${v.plot}` : "—",
            date: v.preferredDate || new Date(v.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
            time: v.preferredTime || "10:00 AM",
            status: v.status || "Scheduled",
            message: v.message || "",
          }));
          setVisits(formatted);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(formatted));
        } else if (isMounted) {
          setVisits([]);
          localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
        }
      } catch (err) {
        console.warn("Failed to fetch site visits from API:", err);
        if (isMounted) setVisits([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchVisits();

    return () => {
      isMounted = false;
    };
  }, [role, user?._id, isAuthenticated]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visits));
  }, [visits]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-more-menu]')) {
        setSelectedId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCall = (phone) => {
    if (isSubscriptionExpired) {
      alert("Workspace subscription has expired. Direct calling is restricted. Please contact your Super Administrator.");
      return;
    }
    if (!phone) {
      alert("Phone number is not available.");
      return;
    }
    window.location.href = `tel:${cleanPhone(phone)}`;
  };

  const toggleMoreMenu = (id, e) => {
    e.stopPropagation();
    setSelectedId(selectedId === id ? null : id);
  };

  const handleViewDetails = (id) => {
    setViewDetailsId(id);
    setSelectedId(null);
  };

  const handleChangeStatus = (id) => {
    setChangeStatusId(id);
    setSelectedId(null);
  };

  const handleDelete = (id) => {
    if (isSubscriptionExpired) {
      alert("Workspace subscription has expired. Deleting site visits is restricted. Please contact your Super Administrator.");
      return;
    }
    setDeleteConfirmId(id);
    setSelectedId(null);
  };

  const handleEditVisit = (id) => {
    if (isSubscriptionExpired) {
      alert("Workspace subscription has expired. Modifying site visits is restricted. Please contact your Super Administrator.");
      return;
    }
    const visit = visits.find((v) => v.id === id);
    if (!visit) return;

    const project = projects.find((p) => p.title === visit.project);
    const projectId = project ? project.id : "";

    setFormData({
      name: visit.name,
      phone: visit.phone,
      projectId: projectId,
      project: visit.project,
      plot: visit.plot === "—" ? "" : visit.plot,
      date: parseDisplayDate(visit.date),
      time: parseDisplayTime(visit.time),
      status: visit.status,
    });
    setEditingVisitId(id);
    setIsVisitFormOpen(true);
    setSelectedId(null);
  };

  const openAddForm = () => {
    if (isSubscriptionExpired) {
      alert("Workspace subscription has expired. Scheduling new site visits is restricted. Please contact your Super Administrator.");
      return;
    }
    setFormData(initialFormState);
    setEditingVisitId(null);
    setErrors({});
    setIsVisitFormOpen(true);
  };

  const closeForm = () => {
    setIsVisitFormOpen(false);
    setEditingVisitId(null);
    setFormData(initialFormState);
    setErrors({});
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "Full name is required.";
    if (!formData.phone.trim()) newErrors.phone = "Phone number is required.";
    if (!formData.projectId) newErrors.project = "Project is required.";
    if (!formData.date) newErrors.date = "Preferred date is required.";
    if (!formData.time) newErrors.time = "Preferred time is required.";
    if (!formData.status) newErrors.status = "Status is required.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFormSubmit = () => {
    if (!validateForm()) return;

    const selectedProject = projects.find((p) => p.id === formData.projectId);
    const projectTitle = selectedProject ? selectedProject.title : formData.project;

    const newVisit = {
      id: editingVisitId ? editingVisitId : Date.now(),
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      project: projectTitle,
      plot: formData.plot.trim() || "—",
      date: formatDateForDisplay(formData.date),
      time: formatTimeForDisplay(formData.time),
      status: formData.status,
    };

    if (editingVisitId) {
      setVisits((prev) =>
        prev.map((item) =>
          item.id === editingVisitId ? { ...item, ...newVisit } : item
        )
      );
    } else {
      setVisits((prev) => [newVisit, ...prev]);
    }

    closeForm();
  };

  const confirmStatusChange = async (id, newStatus) => {
    try {
      await adminApi.updateSiteVisitStatus(id, newStatus);
    } catch (e) {
      console.warn("Failed to update site visit status on server:", e);
    }
    setVisits((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: newStatus } : item
      )
    );
    setChangeStatusId(null);
  };

  const confirmDelete = (id) => {
    setVisits((prev) => prev.filter((item) => item.id !== id));
    setDeleteConfirmId(null);
  };

  const getStatusClass = (status) => status.toLowerCase().replace(" ", "-");

  const selectedVisit = visits.find((v) => v.id === viewDetailsId);
  const changeStatusVisit = visits.find((v) => v.id === changeStatusId);
  const deleteVisit = visits.find((v) => v.id === deleteConfirmId);

  const activeProjects = projects.filter((p) => p.status === "Active" || p.status === "Completed" || p.status === "Upcoming");
  const projectPlots = plots.filter((p) => p.projectId === formData.projectId);

  const handleProjectChange = (e) => {
    const projectId = e.target.value;
    const project = projects.find((p) => String(p.id) === String(projectId));
    setFormData((prev) => ({
      ...prev,
      projectId,
      project: project ? project.title : "",
      plot: "",
    }));
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSelectChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <div className="site-visits-page">
      {/* Header */}
      <div className="site-visits-header">
        <div>
          <span className="site-visits-kicker">CUSTOMER VISITS</span>
          <h1>Site Visits</h1>
        </div>

        <div className="site-visits-header-actions">
          <button className="site-visits-add-btn" onClick={openAddForm}>
            <FaPlus /> Add Site Visit
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="site-visits-summary">
        <div className="site-visit-summary-card">
          <span>Total Visits</span>
          <strong>{visits.length}</strong>
          <small>All scheduled visits</small>
        </div>

        <div className="site-visit-summary-card">
          <span>Upcoming</span>
          <strong>{visits.filter((v) => v.status === "Scheduled" || v.status === "Confirmed").length}</strong>
          <small>Future site visits</small>
        </div>

        <div className="site-visit-summary-card">
          <span>Completed</span>
          <strong>{visits.filter((v) => v.status === "Completed").length}</strong>
          <small>Successful visits</small>
        </div>

      </div>

      {/* Main Card */}
      <section className="site-visits-card">
        <div className="site-visits-toolbar">
          <div>
            <h2>All Site Visits</h2>
            <p>Track upcoming and completed customer visits.</p>
          </div>

          <div className="site-visits-search">
            <FaSearch />
            <input
              type="text"
              placeholder="Search customer or project..."
            />
          </div>
        </div>

        <div className="site-visits-table-wrapper">
          <div className="site-visits-table">
            {/* Table Header */}
            <div className="site-visits-table-header">
              <span>Customer</span>
              <span>Project / Plot</span>
              <span>Date & Time</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {/* Rows */}
            {visits.map((visit) => (
              <div className="site-visits-table-row" key={visit.id}>
                {/* Customer */}
                <div className="site-visit-customer">
                  <span className="site-visit-avatar">
                    {visit.name
                      .split(" ")
                      .map((word) => word[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <div>
                    <strong>{visit.name}</strong>
                    <small>{isSubscriptionExpired ? maskPhone(visit.phone) : visit.phone}</small>
                  </div>
                </div>

                {/* Project */}
                <div className="site-visit-project">
                  <strong>{visit.project}</strong>
                  <small>{visit.plot}</small>
                </div>

                {/* Date */}
                <div className="site-visit-date">
                  <strong>
                    <FaCalendarAlt />
                    {visit.date}
                  </strong>
                  <small>{visit.time}</small>
                </div>

                {/* Status */}
                <div>
                  <span className={`site-visit-badge ${getStatusClass(visit.status)}`}>
                    {visit.status}
                  </span>
                </div>

                {/* Actions */}
                <div className="site-visit-actions">
                  <button
                    title={isSubscriptionExpired ? "Calling disabled (Subscription expired)" : `Call ${visit.name}`}
                    aria-label={`Call ${visit.name}`}
                    onClick={() => handleCall(visit.phone)}
                    disabled={isSubscriptionExpired}
                    style={isSubscriptionExpired ? { opacity: 0.4, cursor: "not-allowed", filter: "grayscale(1)" } : {}}
                  >
                    <FaPhone />
                  </button>

                  <div className="site-visit-more-wrapper" data-more-menu>
                    <button
                      title={`More actions for ${visit.name}`}
                      aria-label={`More actions for ${visit.name}`}
                      onClick={(e) => toggleMoreMenu(visit.id, e)}
                    >
                      <FaEllipsisH />
                    </button>

                    {selectedId === visit.id && (
                      <div className="site-visit-more-menu">
                        <button
                          className="more-menu-item"
                          onClick={() => handleViewDetails(visit.id)}
                        >
                          <FaEye /> View Details
                        </button>
                        <button
                          className="more-menu-item"
                          onClick={() => handleEditVisit(visit.id)}
                        >
                          <FaEdit /> Edit Visit
                        </button>
                        <button
                          className="more-menu-item"
                          onClick={() => handleChangeStatus(visit.id)}
                        >
                          <FaEdit /> Change Status
                        </button>
                        <button
                          className="more-menu-item more-menu-item-danger"
                          onClick={() => handleDelete(visit.id)}
                        >
                          <FaTrash /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Add/Edit Site Visit Modal */}
      {isVisitFormOpen && (
        <div className="site-visit-modal-overlay" onClick={closeForm}>
          <div className="site-visit-modal site-visit-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="site-visit-modal-header">
              <h3>{editingVisitId ? "Edit Site Visit" : "Add Site Visit"}</h3>
              <button
                className="site-visit-modal-close"
                onClick={closeForm}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="site-visit-modal-body site-visit-form-body">
              <form onSubmit={(e) => { e.preventDefault(); handleFormSubmit(); }}>
                <div className="site-visit-form-grid">
                  <div className="site-visit-form-group">
                    <label className="site-visit-form-label">
                      Full Name <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      className="site-visit-form-input"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      placeholder="Enter full name"
                    />
                    {errors.name && <span className="site-visit-form-error">{errors.name}</span>}
                  </div>

                  <div className="site-visit-form-group">
                    <label className="site-visit-form-label">
                      Mobile Number <span className="required">*</span>
                    </label>
                    <input
                      type="tel"
                      className="site-visit-form-input"
                      value={formData.phone}
                      onChange={(e) => handleInputChange("phone", e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                    {errors.phone && <span className="site-visit-form-error">{errors.phone}</span>}
                  </div>

                  <div className="site-visit-form-group">
                    <label className="site-visit-form-label">
                      Project <span className="required">*</span>
                    </label>
                    <CustomDropdown
                      className="site-visit-form-select"
                      value={formData.projectId}
                      onChange={handleProjectChange}
                      placeholder="Select Project"
                    >
                      <option value="">Select Project</option>
                      {activeProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.title}
                        </option>
                      ))}
                    </CustomDropdown>
                    {errors.project && <span className="site-visit-form-error">{errors.project}</span>}
                  </div>

                  <div className="site-visit-form-group">
                    <label className="site-visit-form-label">
                      Plot
                    </label>
                    <CustomDropdown
                      className="site-visit-form-select"
                      value={formData.plot}
                      onChange={(e) => handleSelectChange("plot", e.target.value)}
                      placeholder="Select Plot (Optional)"
                    >
                      <option value="">Select Plot (Optional)</option>
                      {projectPlots.map((plot) => (
                        <option key={plot.id} value={plot.plotNumber}>
                          {plot.plotNumber}
                        </option>
                      ))}
                    </CustomDropdown>
                  </div>

                  <div className="site-visit-form-group">
                    <label className="site-visit-form-label">
                      Preferred Date <span className="required">*</span>
                    </label>
                    <input
                      type="date"
                      className="site-visit-form-input"
                      value={formData.date}
                      onChange={(e) => handleInputChange("date", e.target.value)}
                    />
                    {errors.date && <span className="site-visit-form-error">{errors.date}</span>}
                  </div>

                  <div className="site-visit-form-group">
                    <label className="site-visit-form-label">
                      Preferred Time <span className="required">*</span>
                    </label>
                    <input
                      type="time"
                      className="site-visit-form-input"
                      value={formData.time}
                      onChange={(e) => handleInputChange("time", e.target.value)}
                    />
                    {errors.time && <span className="site-visit-form-error">{errors.time}</span>}
                  </div>

                  <div className="site-visit-form-group">
                    <label className="site-visit-form-label">
                      Status <span className="required">*</span>
                    </label>
                    <CustomDropdown
                      className="site-visit-form-select"
                      value={formData.status}
                      onChange={(e) => handleSelectChange("status", e.target.value)}
                      placeholder="Select Status"
                    >
                      {VISIT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </CustomDropdown>
                    {errors.status && <span className="site-visit-form-error">{errors.status}</span>}
                  </div>
                </div>

                <div className="site-visit-form-actions">
                  <button
                    type="button"
                    className="site-visit-btn-secondary"
                    onClick={closeForm}
                  >
                    <FaTimes /> Cancel
                  </button>
                  <button
                    type="submit"
                    className="site-visit-btn-primary"
                  >
                    <FaSave /> {editingVisitId ? "Save Changes" : "Add Site Visit"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {viewDetailsId && selectedVisit && (
        <div className="site-visit-modal-overlay" onClick={() => setViewDetailsId(null)}>
          <div className="site-visit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="site-visit-modal-header">
              <h3>Site Visit Details</h3>
              <button
                className="site-visit-modal-close"
                onClick={() => setViewDetailsId(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="site-visit-modal-body">
              <div className="site-visit-detail-row">
                <label>Customer</label>
                <span>{selectedVisit.name}</span>
              </div>
              <div className="site-visit-detail-row">
                <label>Phone</label>
                <span>{isSubscriptionExpired ? maskPhone(selectedVisit.phone) : selectedVisit.phone}</span>
              </div>
              <div className="site-visit-detail-row">
                <label>Project</label>
                <span>{selectedVisit.project}</span>
              </div>
              <div className="site-visit-detail-row">
                <label>Plot</label>
                <span>{selectedVisit.plot}</span>
              </div>
              <div className="site-visit-detail-row">
                <label>Date</label>
                <span>{selectedVisit.date}</span>
              </div>
              <div className="site-visit-detail-row">
                <label>Time</label>
                <span>{selectedVisit.time}</span>
              </div>
              <div className="site-visit-detail-row">
                <label>Status</label>
                <span className={`site-visit-badge ${getStatusClass(selectedVisit.status)}`}>
                  {selectedVisit.status}
                </span>
              </div>
            </div>
            <div className="site-visit-modal-footer">
              <button className="site-visit-btn-primary" onClick={() => setViewDetailsId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Status Modal */}
      {changeStatusId && changeStatusVisit && (
        <div className="site-visit-modal-overlay" onClick={() => setChangeStatusId(null)}>
          <div className="site-visit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="site-visit-modal-header">
              <h3>Change Status</h3>
              <button
                className="site-visit-modal-close"
                onClick={() => setChangeStatusId(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="site-visit-modal-body">
              <p>Update status for <strong>{changeStatusVisit.name}</strong></p>
              <div className="site-visit-status-options">
                {VISIT_STATUSES.map((status) => (
                  <button
                    key={status}
                    className={`site-visit-status-option ${
                      status === changeStatusVisit.status ? "active" : ""
                    }`}
                    onClick={() => confirmStatusChange(changeStatusId, status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            <div className="site-visit-modal-footer">
              <button className="site-visit-btn-secondary" onClick={() => setChangeStatusId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && deleteVisit && (
        <div className="site-visit-modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="site-visit-modal site-visit-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="site-visit-modal-header">
              <h3>Delete Site Visit</h3>
              <button
                className="site-visit-modal-close"
                onClick={() => setDeleteConfirmId(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="site-visit-modal-body">
              <p>Are you sure you want to delete this site visit?</p>
              <p className="site-visit-delete-name"><strong>{deleteVisit.name}</strong></p>
              <p className="site-visit-delete-warning">This action cannot be undone.</p>
            </div>
            <div className="site-visit-modal-footer">
              <button className="site-visit-btn-secondary" onClick={() => setDeleteConfirmId(null)}>
                <FaTimes /> Cancel
              </button>
              <button
                className="site-visit-btn-danger"
                onClick={() => confirmDelete(deleteConfirmId)}
              >
                <FaTrash /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SiteVisits;