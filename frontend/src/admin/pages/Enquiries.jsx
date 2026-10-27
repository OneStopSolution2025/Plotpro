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
  const [statusNote, setStatusNote] = useState("");
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
            contactMethod: e.contactMethod || "phone",
            project: e.projectId?.title || "Direct Enquiry",
            interest: e.plot ? `Plot ${e.plot}` : "General Enquiry",
            date: new Date(e.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
            status:
              e.status === "NEW"
                ? "New"
                : e.status === "CONTACTED"
                ? "Contacted"
                : e.status === "FOLLOW_UP"
                ? "Follow Up"
                : "Closed",
            message: e.message || "",
            activityLog: e.activityLog || [],
            branch: e.branchId?.name || "",
            branchCity: e.branchId?.city || "",
            assignedAdminName: e.assignedAdminId?.name || "",
            plotDetails: e.plotDetails || null,
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

    // Auto-sync enquiries every 8 seconds
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible" && isAuthenticated) {
        fetchEnquiries();
      }
    }, 8000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
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

  const handleCall = (phone, id) => {
    if (isSubscriptionExpired) {
      alert("Workspace subscription has expired. Direct calling is restricted. Please contact your Super Administrator.");
      return;
    }
    if (!phone) {
      alert("Phone number is not available.");
      return;
    }
    if (id) {
      adminApi.logEnquiryActivity(id, { action: "CONTACTED_CALL", notes: "Placed phone call to customer." }).catch(() => {});
    }
    window.location.href = `tel:${cleanPhone(phone)}`;
  };

  const handleWhatsApp = (phone, name, id) => {
    if (isSubscriptionExpired) {
      alert("Workspace subscription has expired. WhatsApp messaging is restricted. Please contact your Super Administrator.");
      return;
    }
    if (!phone) {
      alert("Phone number is not available.");
      return;
    }
    if (id) {
      adminApi.logEnquiryActivity(id, { action: "CONTACTED_WHATSAPP", notes: "Initiated WhatsApp chat with customer." }).catch(() => {});
    }
    const message = `Hello ${name}, this is Plotpro regarding your enquiry.`;
    window.open(
      `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleEmail = (email, id) => {
    if (isSubscriptionExpired) {
      alert("Workspace subscription has expired. Direct emailing is restricted. Please contact your Super Administrator.");
      return;
    }
    if (!email) {
      alert("Email address is not available.");
      return;
    }
    if (id) {
      adminApi.logEnquiryActivity(id, { action: "CONTACTED_EMAIL", notes: "Opened email composer for customer." }).catch(() => {});
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
    setStatusNote("");
    setSelectedId(null);
  };

  const handleDelete = (id) => {
    setDeleteConfirmId(id);
    setSelectedId(null);
  };

  const confirmStatusChange = async (id, newStatus) => {
    const backendStatus =
      newStatus === "New"
        ? "NEW"
        : newStatus === "Contacted"
        ? "CONTACTED"
        : newStatus === "Follow Up"
        ? "FOLLOW_UP"
        : "CLOSED";
    try {
      const res = await adminApi.updateEnquiryStatus(id, backendStatus, statusNote);
      if (res?.success && res.data) {
        setEnquiries((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: newStatus,
                  activityLog: res.data.activityLog || item.activityLog,
                }
              : item
          )
        );
      } else {
        setEnquiries((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
        );
      }
    } catch (e) {
      console.warn("Failed to update enquiry status on server:", e);
      setEnquiries((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      );
    }
    setStatusNote("");
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
                      <span className={`contact-pref-pill pref-${enquiry.contactMethod || 'phone'}`} title={`Preferred Contact Method: ${enquiry.contactMethod === "whatsapp" ? "WhatsApp" : enquiry.contactMethod === "email" ? "Email" : "Phone Call"}`}>
                        {enquiry.contactMethod === "whatsapp" && <FaWhatsapp />}
                        {enquiry.contactMethod === "email" && <FaEnvelope />}
                        {(!enquiry.contactMethod || enquiry.contactMethod === "phone") && <FaPhone />}
                        <span>{enquiry.contactMethod === "whatsapp" ? "WhatsApp" : enquiry.contactMethod === "email" ? "Email" : "Call"}</span>
                      </span>
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
                      className={(!enquiry.contactMethod || enquiry.contactMethod === "phone") ? "enquiry-action-preferred phone-preferred" : ""}
                      title={isSubscriptionExpired ? "Calling disabled (Subscription expired)" : (!enquiry.contactMethod || enquiry.contactMethod === "phone") ? `Customer's Preferred Contact: Call ${enquiry.name}` : `Call ${enquiry.name}`}
                      aria-label={`Call ${enquiry.name}`}
                      onClick={() => handleCall(enquiry.phone, enquiry.id)}
                      disabled={isSubscriptionExpired}
                      style={isSubscriptionExpired ? { opacity: 0.4, cursor: "not-allowed", filter: "grayscale(1)" } : {}}
                    >
                      <FaPhone />
                    </button>

                    <button
                      className={enquiry.contactMethod === "whatsapp" ? "enquiry-action-preferred whatsapp-preferred" : ""}
                      title={isSubscriptionExpired ? "WhatsApp disabled (Subscription expired)" : enquiry.contactMethod === "whatsapp" ? `Customer's Preferred Contact: WhatsApp ${enquiry.name}` : `WhatsApp ${enquiry.name}`}
                      aria-label={`WhatsApp ${enquiry.name}`}
                      onClick={() => handleWhatsApp(enquiry.phone, enquiry.name, enquiry.id)}
                      disabled={isSubscriptionExpired}
                      style={isSubscriptionExpired ? { opacity: 0.4, cursor: "not-allowed", filter: "grayscale(1)" } : {}}
                    >
                      <FaWhatsapp />
                    </button>

                    <button
                      className={enquiry.contactMethod === "email" ? "enquiry-action-preferred email-preferred" : ""}
                      title={isSubscriptionExpired ? "Emailing disabled (Subscription expired)" : enquiry.contactMethod === "email" ? `Customer's Preferred Contact: Email ${enquiry.name}` : `Email ${enquiry.name}`}
                      aria-label={`Email ${enquiry.name}`}
                      onClick={() => handleEmail(enquiry.email, enquiry.id)}
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
                <label>Preferred Contact</label>
                <span className={`contact-pref-modal-badge pref-${selectedEnquiry.contactMethod || 'phone'}`}>
                  {selectedEnquiry.contactMethod === "whatsapp" && <FaWhatsapp />}
                  {selectedEnquiry.contactMethod === "email" && <FaEnvelope />}
                  {(!selectedEnquiry.contactMethod || selectedEnquiry.contactMethod === "phone") && <FaPhone />}
                  {" "}
                  {selectedEnquiry.contactMethod === "whatsapp" ? "WhatsApp" : selectedEnquiry.contactMethod === "email" ? "Email" : "Phone Call"}
                </span>
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
              {selectedEnquiry.branch && (
                <div className="enquiry-detail-row">
                  <label>Branch</label>
                  <span>
                    <strong>{selectedEnquiry.branch}</strong>
                    {selectedEnquiry.branchCity ? ` • ${selectedEnquiry.branchCity}` : ""}
                  </span>
                </div>
              )}
              {selectedEnquiry.plotDetails && (
                <div className="enquiry-detail-row">
                  <label>Plot Inventory</label>
                  <span style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 700,
                        backgroundColor:
                          selectedEnquiry.plotDetails.status === "Available"
                            ? "#ecfdf5"
                            : selectedEnquiry.plotDetails.status === "Reserved"
                            ? "#fef3c7"
                            : "#fee2e2",
                        color:
                          selectedEnquiry.plotDetails.status === "Available"
                            ? "#059669"
                            : selectedEnquiry.plotDetails.status === "Reserved"
                            ? "#d97706"
                            : "#dc2626",
                      }}
                    >
                      {selectedEnquiry.plotDetails.status}
                    </span>
                    <small style={{ color: "#64748b" }}>
                      {selectedEnquiry.plotDetails.size} • {selectedEnquiry.plotDetails.facing}
                    </small>
                  </span>
                </div>
              )}
              {selectedEnquiry.message && (
                <div className="enquiry-detail-row enquiry-message-row">
                  <label>Message</label>
                  <span className="enquiry-message-text">{selectedEnquiry.message}</span>
                </div>
              )}

              {/* Activity & History Log */}
              <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #e2e8f0" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "8px" }}>
                  Activity & Status History
                </label>
                {(!selectedEnquiry.activityLog || selectedEnquiry.activityLog.length === 0) ? (
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>No recorded activity yet.</span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "180px", overflowY: "auto" }}>
                    {selectedEnquiry.activityLog.map((act, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: "12px",
                          padding: "8px 10px",
                          background: "#f8fafc",
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#475569" }}>
                          <strong>{act.performedByName || "Staff"} ({act.performedByRole || "ADMIN"})</strong>
                          <small style={{ color: "#94a3b8" }}>
                            {new Date(act.timestamp).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </small>
                        </div>
                        <div style={{ marginTop: "3px", color: "#1e293b" }}>
                          {act.action === "STATUS_CHANGE"
                            ? `Status updated: ${act.previousStatus || "NEW"} → ${act.newStatus}`
                            : act.action === "ENQUIRY_CREATED"
                            ? "Enquiry submitted by customer"
                            : act.action.replace(/_/g, " ")}
                        </div>
                        {act.notes && (
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", fontStyle: "italic" }}>
                            "{act.notes}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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

              <div style={{ marginBottom: "14px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>
                  Follow-up Note (Optional)
                </label>
                <input
                  type="text"
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="e.g., Spoke with customer, interested in plot visit next week"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

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