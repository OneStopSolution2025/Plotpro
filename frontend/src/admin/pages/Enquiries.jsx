import { useState, useEffect, useRef } from "react";
import {
  FaSearch,
  FaPhone,
  FaWhatsapp,
  FaEnvelope,
  FaEllipsisH,
  FaFilter,
  FaEye,
  FaEdit,
  FaTrash,
  FaTimes,
} from "react-icons/fa";

import "../styles/enquiries.css";
import { adminApi, superAdminApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useAdminProfile } from "../context/AdminProfileContext";

const ENQUIRY_STATUSES = ["New", "Contacted", "Follow Up", "Closed"];
const STORAGE_KEY = "dreamcity-enquiries";

const cleanPhone = (phone) => phone ? phone.replace(/[\s\-+]/g, "") : "";

const maskPhone = (phone) => {
  if (!phone) return "—";
  const str = String(phone).trim();
  if (str.length <= 4) return "****";
  const visiblePrefix = str.slice(0, 5);
  return `${visiblePrefix}*****`;
};

const maskEmail = (email) => {
  if (!email) return "—";
  const [userPart, domain] = email.split("@");
  if (!domain) return "—";
  const maskedUser = userPart.length > 2 ? `${userPart.slice(0, 2)}***` : `${userPart[0]}***`;
  return `${maskedUser}@${domain}`;
};

const Enquiries = () => {
  const { role, user, isAuthenticated } = useAuth();
  const { isSubscriptionExpired } = useAdminProfile();
  const [enquiries, setEnquiries] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [viewDetailsId, setViewDetailsId] = useState(null);
  const [changeStatusId, setChangeStatusId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchEnquiries = async () => {
      setLoading(true);
      try {
        let res;
        if (role === "SUPER_ADMIN") {
          res = await superAdminApi.getAllEnquiries();
        } else {
          res = await adminApi.getEnquiries();
        }

        if (isMounted && res?.success && Array.isArray(res.data)) {
          const formatted = res.data.map((e) => ({
            id: e._id,
            _id: e._id,
            name: e.fullName,
            phone: e.mobile,
            email: e.email || "",
            project: e.projectId?.title || "Direct Enquiry",
            interest: e.plot ? `Plot ${e.plot}` : "General Enquiry",
            date: new Date(e.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
            status: e.status === "NEW" ? "New" : e.status === "CONTACTED" ? "Contacted" : "Closed",
            message: e.message || "",
          }));
          setEnquiries(formatted);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(formatted));
          window.dispatchEvent(new Event("dreamcity-enquiries-updated"));
        } else if (isMounted) {
          setEnquiries([]);
          localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
          window.dispatchEvent(new Event("dreamcity-enquiries-updated"));
        }
      } catch (err) {
        console.warn("Failed to fetch enquiries from API:", err);
        if (isMounted) setEnquiries([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchEnquiries();

    return () => {
      isMounted = false;
    };
  }, [role, user?._id, isAuthenticated]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enquiries));
    window.dispatchEvent(new Event("dreamcity-enquiries-updated"));
  }, [enquiries]);

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

  const handleWhatsApp = (phone, name) => {
    if (isSubscriptionExpired) {
      alert("Workspace subscription has expired. WhatsApp messaging is restricted. Please contact your Super Administrator.");
      return;
    }
    if (!phone) {
      alert("Phone number is not available.");
      return;
    }
    const message = `Hello ${name}, this is DreamCity regarding your enquiry.`;
    window.open(
      `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleEmail = (email) => {
    if (isSubscriptionExpired) {
      alert("Workspace subscription has expired. Direct emailing is restricted. Please contact your Super Administrator.");
      return;
    }
    if (!email) {
      alert("Email address is not available.");
      return;
    }
    window.location.href = `mailto:${email}`;
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
    setDeleteConfirmId(id);
    setSelectedId(null);
  };

  const confirmStatusChange = async (id, newStatus) => {
    const backendStatus = newStatus === "New" ? "NEW" : newStatus === "Contacted" ? "CONTACTED" : "CLOSED";
    try {
      await adminApi.updateEnquiryStatus(id, backendStatus);
    } catch (e) {
      console.warn("Failed to update enquiry status on server:", e);
    }
    setEnquiries((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: newStatus } : item
      )
    );
    setChangeStatusId(null);
  };

  const confirmDelete = (id) => {
    setEnquiries((prev) => prev.filter((item) => item.id !== id));
    setDeleteConfirmId(null);
  };

  const getStatusClass = (status) => status.toLowerCase().replace(" ", "-");

  const filteredEnquiries = enquiries.filter((e) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      e.name?.toLowerCase().includes(term) ||
      e.project?.toLowerCase().includes(term) ||
      e.email?.toLowerCase().includes(term) ||
      e.phone?.toLowerCase().includes(term) ||
      e.interest?.toLowerCase().includes(term) ||
      e.message?.toLowerCase().includes(term)
    );
  });

  const selectedEnquiry = enquiries.find((e) => e.id === viewDetailsId);
  const changeStatusEnquiry = enquiries.find((e) => e.id === changeStatusId);
  const deleteEnquiry = enquiries.find((e) => e.id === deleteConfirmId);

  return (
    <div className="enquiries-page">
      {/* Header */}
      <div className="enquiries-header">
        <div>
          <span className="enquiries-kicker">CUSTOMER MANAGEMENT</span>
          <h1>Enquiries</h1>
        </div>
      </div>

      {/* Summary */}
      <div className="enquiries-summary">
        <div className="enquiry-summary-card">
          <span>Total Enquiries</span>
          <strong>{enquiries.length}</strong>
          <small>All customer enquiries</small>
        </div>

        <div className="enquiry-summary-card">
          <span>New</span>
          <strong>{enquiries.filter((e) => e.status === "New").length}</strong>
          <small>Need attention</small>
        </div>

        <div className="enquiry-summary-card">
          <span>Follow Ups</span>
          <strong>{enquiries.filter((e) => e.status === "Follow Up").length}</strong>
          <small>Pending follow-ups</small>
        </div>
      </div>

      {/* Table Card */}
      <section className="enquiries-card">
        <div className="enquiries-toolbar">
          <div>
            <h2>All Enquiries</h2>
            <p>Recent customer leads and their current status.</p>
          </div>

          <div className="enquiries-search">
            <FaSearch />
            <input
              type="text"
              placeholder="Search customer or project..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="enquiries-table-wrapper">
          <div className="enquiries-table">
            {/* Table Header */}
            <div className="enquiries-table-header">
              <span>Customer</span>
              <span>Project</span>
              <span>Interest</span>
              <span>Date</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {/* Rows */}
            {filteredEnquiries.length === 0 ? (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  color: "#64748b",
                  gridColumn: "1 / -1",
                }}
              >
                <p style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600, color: "#475569" }}>
                  {searchTerm.trim() ? `No enquiries matching "${searchTerm.trim()}"` : "No enquiries found"}
                </p>
                <small style={{ color: "#94a3b8" }}>
                  {searchTerm.trim() ? "Try searching with a different customer name, project, or phone number." : "Customer enquiries will appear here."}
                </small>
              </div>
            ) : (
              filteredEnquiries.map((enquiry, index) => {
                const openUp = filteredEnquiries.length > 2 && index >= filteredEnquiries.length - 2;
                return (
                <div className="enquiries-table-row" key={enquiry.id}>
                  <div className="enquiry-customer">
                    <span className="enquiry-avatar">
                      {enquiry.name
                        .split(" ")
                        .map((word) => word[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <div>
                      <strong>{enquiry.name}</strong>
                      <small>{isSubscriptionExpired ? maskPhone(enquiry.phone) : enquiry.phone}</small>
                    </div>
                  </div>

                  <div className="enquiry-project">{enquiry.project}</div>
                  <div className="enquiry-interest">{enquiry.interest}</div>
                  <div className="enquiry-date">{enquiry.date}</div>

                  <div>
                    <span className={`enquiry-badge ${getStatusClass(enquiry.status)}`}>
                      {enquiry.status}
                    </span>
                  </div>

                  <div className="enquiry-actions">
                    <button
                      title={isSubscriptionExpired ? "Calling disabled (Subscription expired)" : `Call ${enquiry.name}`}
                      aria-label={`Call ${enquiry.name}`}
                      onClick={() => handleCall(enquiry.phone)}
                      disabled={isSubscriptionExpired}
                      style={isSubscriptionExpired ? { opacity: 0.4, cursor: "not-allowed", filter: "grayscale(1)" } : {}}
                    >
                      <FaPhone />
                    </button>

                    <button
                      title={isSubscriptionExpired ? "WhatsApp disabled (Subscription expired)" : `WhatsApp ${enquiry.name}`}
                      aria-label={`WhatsApp ${enquiry.name}`}
                      onClick={() => handleWhatsApp(enquiry.phone, enquiry.name)}
                      disabled={isSubscriptionExpired}
                      style={isSubscriptionExpired ? { opacity: 0.4, cursor: "not-allowed", filter: "grayscale(1)" } : {}}
                    >
                      <FaWhatsapp />
                    </button>

                    <button
                      title={isSubscriptionExpired ? "Emailing disabled (Subscription expired)" : `Email ${enquiry.name}`}
                      aria-label={`Email ${enquiry.name}`}
                      onClick={() => handleEmail(enquiry.email)}
                      disabled={isSubscriptionExpired}
                      style={isSubscriptionExpired ? { opacity: 0.4, cursor: "not-allowed", filter: "grayscale(1)" } : {}}
                    >
                      <FaEnvelope />
                    </button>

                    <div className="enquiry-more-wrapper" data-more-menu>
                      <button
                        title={`More actions for ${enquiry.name}`}
                        aria-label={`More actions for ${enquiry.name}`}
                        onClick={(e) => toggleMoreMenu(enquiry.id, e)}
                      >
                        <FaEllipsisH />
                      </button>

                      {selectedId === enquiry.id && (
                        <div className={`enquiry-more-menu ${openUp ? "enquiry-more-menu-up" : ""}`}>

                          <button
                            className="more-menu-item"
                            onClick={() => handleViewDetails(enquiry.id)}
                          >
                            <FaEye /> View Details
                          </button>
                          <button
                            className="more-menu-item"
                            onClick={() => handleChangeStatus(enquiry.id)}
                          >
                            <FaEdit /> Change Status
                          </button>
                          <button
                            className="more-menu-item more-menu-item-danger"
                            onClick={() => handleDelete(enquiry.id)}
                          >
                            <FaTrash /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* View Details Modal */}
      {viewDetailsId && selectedEnquiry && (
        <div className="enquiry-modal-overlay" onClick={() => setViewDetailsId(null)}>
          <div className="enquiry-modal" onClick={(e) => e.stopPropagation()}>
            <div className="enquiry-modal-header">
              <h3>Enquiry Details</h3>
              <button
                className="enquiry-modal-close"
                onClick={() => setViewDetailsId(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="enquiry-modal-body">
              <div className="enquiry-detail-row">
                <label>Customer</label>
                <span>{selectedEnquiry.name}</span>
              </div>
              <div className="enquiry-detail-row">
                <label>Phone</label>
                <span>{isSubscriptionExpired ? maskPhone(selectedEnquiry.phone) : selectedEnquiry.phone}</span>
              </div>
              <div className="enquiry-detail-row">
                <label>Email</label>
                <span>{isSubscriptionExpired ? maskEmail(selectedEnquiry.email) : (selectedEnquiry.email || "—")}</span>
              </div>
              <div className="enquiry-detail-row">
                <label>Project</label>
                <span>{selectedEnquiry.project}</span>
              </div>
              <div className="enquiry-detail-row">
                <label>Interest</label>
                <span>{selectedEnquiry.interest}</span>
              </div>
              <div className="enquiry-detail-row">
                <label>Date</label>
                <span>{selectedEnquiry.date}</span>
              </div>
              <div className="enquiry-detail-row">
                <label>Status</label>
                <span className={`enquiry-badge ${getStatusClass(selectedEnquiry.status)}`}>
                  {selectedEnquiry.status}
                </span>
              </div>
            </div>
            <div className="enquiry-modal-footer">
              <button className="enquiry-btn-primary" onClick={() => setViewDetailsId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Status Modal */}
      {changeStatusId && changeStatusEnquiry && (
        <div className="enquiry-modal-overlay" onClick={() => setChangeStatusId(null)}>
          <div className="enquiry-modal" onClick={(e) => e.stopPropagation()}>
            <div className="enquiry-modal-header">
              <h3>Change Status</h3>
              <button
                className="enquiry-modal-close"
                onClick={() => setChangeStatusId(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="enquiry-modal-body">
              <p>Update status for <strong>{changeStatusEnquiry.name}</strong></p>
              <div className="enquiry-status-options">
                {ENQUIRY_STATUSES.map((status) => (
                  <button
                    key={status}
                    className={`enquiry-status-option ${
                      status === changeStatusEnquiry.status ? "active" : ""
                    }`}
                    onClick={() => confirmStatusChange(changeStatusId, status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            <div className="enquiry-modal-footer">
              <button className="enquiry-btn-secondary" onClick={() => setChangeStatusId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && deleteEnquiry && (
        <div className="enquiry-modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="enquiry-modal enquiry-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="enquiry-modal-header">
              <h3>Delete Enquiry</h3>
              <button
                className="enquiry-modal-close"
                onClick={() => setDeleteConfirmId(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="enquiry-modal-body">
              <p>Are you sure you want to delete this enquiry?</p>
              <p className="enquiry-delete-name"><strong>{deleteEnquiry.name}</strong></p>
              <p className="enquiry-delete-warning">This action cannot be undone.</p>
            </div>
            <div className="enquiry-modal-footer">
<button className="enquiry-btn-secondary" onClick={() => setDeleteConfirmId(null)}>
              <FaTimes /> Cancel
            </button>
              <button
                className="enquiry-btn-danger"
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

export default Enquiries;