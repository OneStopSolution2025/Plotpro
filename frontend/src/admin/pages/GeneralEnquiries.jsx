import { useState, useEffect } from "react";
import {
  FaSearch,
  FaPhone,
  FaEnvelope,
  FaEllipsisH,
  FaEye,
  FaEdit,
  FaTimes,
  FaInbox,
} from "react-icons/fa";

import "../styles/enquiries.css";
import { superAdminApi } from "../../services/api";
import ConfirmationModal from "../components/ConfirmationModal";

const cleanPhone = (phone) => (phone ? phone.replace(/[\s\-+]/g, "") : "");

const STATUS_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "CLOSED", label: "Closed" },
];

const GeneralEnquiries = () => {
  const [enquiries, setEnquiries] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [viewDetailsId, setViewDetailsId] = useState(null);
  const [changeStatusId, setChangeStatusId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [alertModal, setAlertModal] = useState(null);

  // Fetch all enquiries from MongoDB and filter strictly for general enquiries (projectId == null)
  const fetchGeneralEnquiries = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminApi.getAllEnquiries();
      if (res?.success && Array.isArray(res.data)) {
        // Filter strictly general website enquiries (no project reference)
        const generalOnes = res.data.filter((e) => !e.projectId);
        setEnquiries(generalOnes);
      } else {
        setEnquiries([]);
      }
    } catch (err) {
      console.error("[GeneralEnquiries] Failed to fetch enquiries:", err);
      setError(err.message || "Failed to load enquiries.");
      setEnquiries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGeneralEnquiries();
  }, []);

  // Close more menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest("[data-more-menu]")) {
        setSelectedId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setViewDetailsId(null);
        setChangeStatusId(null);
        setSelectedId(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCall = (phone) => {
    if (!phone) {
      setAlertModal({
        title: "Contact Info Unavailable",
        message: "Phone number is not available for this enquiry.",
        type: "warning",
      });
      return;
    }
    window.location.href = `tel:${cleanPhone(phone)}`;
  };

  const handleEmail = (email) => {
    if (!email) {
      setAlertModal({
        title: "Contact Info Unavailable",
        message: "Email address is not available for this enquiry.",
        type: "warning",
      });
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

  const confirmStatusChange = async (id, newStatus) => {
    setUpdatingStatus(true);
    try {
      const res = await superAdminApi.updateEnquiryStatus(id, newStatus);
      if (res?.success && res.data) {
        setEnquiries((prev) =>
          prev.map((item) => (item._id === id ? { ...item, status: newStatus } : item))
        );
      }
      setChangeStatusId(null);
    } catch (err) {
      setAlertModal({
        title: "Status Update Failed",
        message: err.message || "Failed to update enquiry status",
        type: "danger",
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "NEW":
        return <span className="enquiry-badge new">New</span>;
      case "CONTACTED":
        return <span className="enquiry-badge contacted">Contacted</span>;
      case "CLOSED":
        return <span className="enquiry-badge closed">Closed</span>;
      default:
        return <span className="enquiry-badge">{status}</span>;
    }
  };

  // Filtered list based on search term
  const filteredEnquiries = enquiries.filter((e) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.fullName?.toLowerCase().includes(term) ||
      e.email?.toLowerCase().includes(term) ||
      e.mobile?.toLowerCase().includes(term) ||
      e.message?.toLowerCase().includes(term)
    );
  });

  const selectedEnquiry = enquiries.find((e) => e._id === viewDetailsId);
  const changeStatusEnquiry = enquiries.find((e) => e._id === changeStatusId);

  // Summary counts
  const totalCount = enquiries.length;
  const newCount = enquiries.filter((e) => e.status === "NEW").length;
  const contactedCount = enquiries.filter((e) => e.status === "CONTACTED").length;
  const closedCount = enquiries.filter((e) => e.status === "CLOSED").length;

  return (
    <div className="enquiries-page">
      {/* Header */}
      <div className="enquiries-header">
        <div>
          <span className="enquiries-kicker">GENERAL ENQUIRIES</span>
          <h1>General Enquiries</h1>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="enquiries-summary">
        <div className="enquiry-summary-card">
          <span>Total</span>
          <strong>{totalCount}</strong>
          <small>All website contact leads</small>
        </div>

        <div className="enquiry-summary-card">
          <span>New</span>
          <strong>{newCount}</strong>
          <small>Awaiting response</small>
        </div>

        <div className="enquiry-summary-card">
          <span>Contacted</span>
          <strong>{contactedCount}</strong>
          <small>In communication</small>
        </div>

        <div className="enquiry-summary-card">
          <span>Closed</span>
          <strong>{closedCount}</strong>
          <small>Resolved enquiries</small>
        </div>
      </div>

      {/* Table Card */}
      <section className="enquiries-card">
        <div className="enquiries-toolbar">
          <div>
            <h2>Website Messages</h2>
            <p>Direct inquiries received from the public Contact page.</p>
          </div>

          <div className="enquiries-search">
            <FaSearch />
            <input
              type="text"
              placeholder="Search by customer, email, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="enquiries-table-wrapper">
          {loading ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "#64748b" }}>
              Loading general enquiries from database...
            </div>
          ) : error ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "#e53e3e" }}>
              {error}
            </div>
          ) : filteredEnquiries.length === 0 ? (
            <div
              style={{
                padding: "60px 24px",
                textAlign: "center",
                color: "#64748b",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <FaInbox size={42} style={{ color: "#cbd5e1" }} />
              <p style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#475569" }}>
                No general enquiries found
              </p>
              <small style={{ color: "#94a3b8" }}>
                Customer messages submitted through the website Contact form will appear here.
              </small>
            </div>
          ) : (
            <div className="enquiries-table" style={{ minWidth: "1050px" }}>
              {/* Table Header */}
              <div
                className="enquiries-table-header"
                style={{ gridTemplateColumns: "1.4fr 1.3fr 1fr 2fr 100px 90px 120px" }}
              >
                <span>Customer</span>
                <span>Email</span>
                <span>Mobile</span>
                <span>Message</span>
                <span>Date</span>
                <span>Status</span>
                <span style={{ textAlign: "right", paddingRight: "8px" }}>Actions</span>
              </div>

              {/* Rows */}
              {filteredEnquiries.map((enquiry) => (
                <div
                  className="enquiries-table-row"
                  key={enquiry._id}
                  style={{ gridTemplateColumns: "1.4fr 1.3fr 1fr 2fr 100px 90px 120px" }}
                >
                  {/* Customer */}
                  <div className="enquiry-customer">
                    <span className="enquiry-avatar">
                      {enquiry.fullName
                        ? enquiry.fullName
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()
                        : "U"}
                    </span>
                    <div>
                      <strong>{enquiry.fullName}</strong>
                    </div>
                  </div>

                  {/* Email */}
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#475569",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {enquiry.email ? (
                      <a
                        href={`mailto:${enquiry.email}`}
                        style={{ color: "#a63d2f", textDecoration: "none" }}
                        title={enquiry.email}
                      >
                        {enquiry.email}
                      </a>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </div>

                  {/* Mobile */}
                  <div style={{ fontSize: "12px", color: "#334155" }}>
                    <strong>{enquiry.mobile}</strong>
                  </div>

                  {/* Message Preview */}
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: "8px",
                    }}
                    title={enquiry.message}
                  >
                    {enquiry.message || <span style={{ color: "#94a3b8" }}>No message</span>}
                  </div>

                  {/* Date */}
                  <div className="enquiry-date">
                    {new Date(enquiry.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>

                  {/* Status */}
                  <div className="enquiry-status">{getStatusBadge(enquiry.status)}</div>

                  {/* Actions */}
                  <div className="enquiry-actions" style={{ justifyContent: "flex-end" }}>
                    <button
                      title="Call Customer"
                      onClick={() => handleCall(enquiry.mobile)}
                      type="button"
                    >
                      <FaPhone />
                    </button>

                    {enquiry.email ? (
                      <button
                        title="Send Email"
                        onClick={() => handleEmail(enquiry.email)}
                        type="button"
                      >
                        <FaEnvelope />
                      </button>
                    ) : null}

                    <div className="enquiry-more-wrapper" data-more-menu>
                      <button
                        title="More Actions"
                        onClick={(e) => toggleMoreMenu(enquiry._id, e)}
                        type="button"
                      >
                        <FaEllipsisH />
                      </button>

                      {selectedId === enquiry._id && (
                        <div className="enquiry-more-menu">
                          <button
                            type="button"
                            className="more-menu-item"
                            onClick={() => handleViewDetails(enquiry._id)}
                          >
                            <FaEye /> View Details
                          </button>
                          <button
                            type="button"
                            className="more-menu-item"
                            onClick={() => handleChangeStatus(enquiry._id)}
                          >
                            <FaEdit /> Change Status
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* =========================================================
          VIEW DETAILS MODAL
      ========================================================= */}
      {viewDetailsId && selectedEnquiry && (
        <div className="enquiry-modal-overlay" onClick={() => setViewDetailsId(null)}>
          <div className="enquiry-modal" onClick={(e) => e.stopPropagation()}>
            <div className="enquiry-modal-header">
              <h3>General Enquiry Details</h3>
              <button
                className="enquiry-modal-close"
                onClick={() => setViewDetailsId(null)}
                type="button"
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>

            <div className="enquiry-modal-body">
              <div className="enquiry-detail-row">
                <label>Customer</label>
                <span>{selectedEnquiry.fullName}</span>
              </div>

              <div className="enquiry-detail-row">
                <label>Email</label>
                <span>
                  {selectedEnquiry.email ? (
                    <a href={`mailto:${selectedEnquiry.email}`} style={{ color: "#a63d2f", textDecoration: "none" }}>
                      {selectedEnquiry.email}
                    </a>
                  ) : (
                    "Not provided"
                  )}
                </span>
              </div>

              <div className="enquiry-detail-row">
                <label>Mobile</label>
                <span>
                  <a href={`tel:${cleanPhone(selectedEnquiry.mobile)}`} style={{ color: "#a63d2f", textDecoration: "none" }}>
                    {selectedEnquiry.mobile}
                  </a>
                </span>
              </div>

              <div className="enquiry-detail-row">
                <label>Category</label>
                <span style={{ color: "#a63d2f", fontWeight: 600 }}>General Website Enquiry</span>
              </div>

              <div className="enquiry-detail-row">
                <label>Date</label>
                <span>
                  {new Date(selectedEnquiry.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <div className="enquiry-detail-row">
                <label>Status</label>
                <span>{getStatusBadge(selectedEnquiry.status)}</span>
              </div>

              <div style={{ marginTop: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.4px",
                    marginBottom: "8px",
                  }}
                >
                  Message Content:
                </label>
                <div
                  style={{
                    padding: "14px 16px",
                    background: "#f8fafc",
                    borderRadius: "10px",
                    border: "1px solid #edf1f5",
                    color: "#1e293b",
                    fontSize: "13px",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    maxHeight: "180px",
                    overflowY: "auto",
                  }}
                >
                  {selectedEnquiry.message || "No message content provided."}
                </div>
              </div>
            </div>

            <div className="enquiry-modal-footer">
              <button
                className="enquiry-btn-secondary"
                onClick={() => setViewDetailsId(null)}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          CHANGE STATUS MODAL
      ========================================================= */}
      {changeStatusId && changeStatusEnquiry && (
        <div className="enquiry-modal-overlay" onClick={() => setChangeStatusId(null)}>
          <div className="enquiry-modal enquiry-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="enquiry-modal-header">
              <h3>Change Status</h3>
              <button
                className="enquiry-modal-close"
                onClick={() => setChangeStatusId(null)}
                type="button"
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>

            <div className="enquiry-modal-body">
              <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#64748b" }}>
                Update status for enquiry from <strong>{changeStatusEnquiry.fullName}</strong>:
              </p>

              <div className="enquiry-status-options" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px" }}>
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`enquiry-status-option ${changeStatusEnquiry.status === opt.value ? "active" : ""}`}
                    disabled={updatingStatus}
                    onClick={() => confirmStatusChange(changeStatusEnquiry._id, opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="enquiry-modal-footer">
              <button
                className="enquiry-btn-secondary"
                onClick={() => setChangeStatusId(null)}
                type="button"
                disabled={updatingStatus}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTICE / ALERT MODAL */}
      <ConfirmationModal
        isOpen={Boolean(alertModal)}
        title={alertModal?.title || "Notice"}
        message={alertModal?.message || ""}
        type={alertModal?.type || "info"}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setAlertModal(null)}
        onCancel={() => setAlertModal(null)}
      />
    </div>
  );
};

export default GeneralEnquiries;
