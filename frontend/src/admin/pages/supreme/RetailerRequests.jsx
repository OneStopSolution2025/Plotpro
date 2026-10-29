import { useState, useEffect, useCallback } from "react";
import { getLenis } from "../../../components/SmoothScrollProvider";
import { supremeAdminApi, authApi } from "../../../services/api";
import {
  FaClipboardList,
  FaSync,
  FaSearch,
  FaEye,
  FaCheckCircle,
  FaTimesCircle,
  FaShieldAlt,
  FaRupeeSign,
  FaUserCheck,
  FaExclamationTriangle,
  FaClock,
  FaBan,
  FaImage,
  FaFileAlt,
  FaQuestionCircle,
  FaHistory,
  FaBuilding,
  FaCopy,
  FaTrash,
} from "react-icons/fa";
import "../../styles/super-admin.css";

/* ────────────────────────────────────────────────────────────────
   Shared small helpers
   ──────────────────────────────────────────────────────────────── */

const getStatusBadge = (status) => {
  const styles = {
    PENDING: { background: "#fff7e6", color: "#9a6700", border: "1px solid #f5c451" },
    PENDING_REVIEW: { background: "#fff7e6", color: "#9a6700", border: "1px solid #f5c451" },
    APPROVED: { background: "#e6f6ec", color: "#18794e", border: "1px solid #6ecf9a" },
    REJECTED: { background: "#fdecec", color: "#b02a37", border: "1px solid #f1aeb5" },
    INFO_REQUESTED: { background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" },
  };
  const label =
    status === "PENDING_REVIEW"
      ? "PENDING REVIEW"
      : status === "INFO_REQUESTED"
      ? "INFO REQUESTED"
      : status;

  return (
    <span
      className="badge"
      style={{
        fontSize: "11.5px",
        fontWeight: 600,
        padding: "5px 10px",
        borderRadius: "999px",
        ...(styles[status] || styles.PENDING),
      }}
    >
      {label}
    </span>
  );
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const fmtMoney = (obj) =>
  obj ? `${obj.currency || "INR"} ${Number(obj.price ?? obj.amount ?? 0).toLocaleString("en-IN")}` : "—";

const hasPaymentEvidence = (p) => Boolean(p?.method || p?.transactionId || p?.proofUrl);

/* ────────────────────────────────────────────────────────────────
   Main page component
   ──────────────────────────────────────────────────────────────── */

const RetailerRequests = () => {
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Detail modal
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Approve modal
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveData, setApproveData] = useState({ planId: "", durationDays: "", isCustomOverride: false, assignedSeats: "", customOverrideReason: "" });
  const [activePlans, setActivePlans] = useState([]);
  const [busy, setBusy] = useState(false);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  // Delete modal (for rejected requests)
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Request Info modal
  const [requestInfoTarget, setRequestInfoTarget] = useState(null);
  const [requestInfoNote, setRequestInfoNote] = useState("");
  const [docLoading, setDocLoading] = useState(false);

  const [actionError, setActionError] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4200);
  };

  const fetchRequests = useCallback(
    async (isSilent = false) => {
      if (!isSilent) {
        setLoading(true);
        setError(null);
      }
      try {
        const params = {};
        if (statusFilter && statusFilter !== "ALL") params.status = statusFilter;
        if (search.trim()) params.search = search.trim();
        const res = await supremeAdminApi.getRetailerRequests(params);
        if (res?.success) {
          setRequests(res.data || []);
          if (res.counts) setCounts(res.counts);
        }
      } catch (err) {
        console.error("[RetailerRequests] fetch error:", err);
        if (!isSilent) setError(err.message || "Failed to load retailer requests.");
      } finally {
        if (!isSilent) setLoading(false);
      }
    },
    [statusFilter, search]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRequests(false);
    authApi.getRetailerPlans().then((res) => {
      if (res?.success && Array.isArray(res.data)) {
        setActivePlans(res.data);
      }
    }).catch(() => {});
  }, [statusFilter, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body & smooth scroll when detail modal or action modals are active
  const isAnyModalOpen = Boolean(detail || approveTarget || rejectTarget || requestInfoTarget || deleteTarget);
  useEffect(() => {
    const lenis = getLenis();
    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
      if (lenis) lenis.stop();
    } else {
      document.body.style.overflow = "";
      if (lenis) lenis.start();
    }
    return () => {
      document.body.style.overflow = "";
      if (lenis) lenis.start();
    };
  }, [isAnyModalOpen]);

  const openDetail = async (id) => {
    setDetailLoading(true);
    setActionError("");
    try {
      const res = await supremeAdminApi.getRetailerRequestById(id);
      setDetail(res?.data || null);
    } catch (err) {
      showToast("error", err.message || "Failed to load request details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const openApprove = async (req) => {
    setApproveTarget(req);
    const initialPlanId = String(req?.plan?._id || req?.requestedPlanId?._id || req?.requestedPlanId || "");
    setApproveData({
      planId: initialPlanId,
      durationDays: "",
      isCustomOverride: false,
      assignedSeats: "",
      customOverrideReason: "",
    });
    setActionError("");
    if (!activePlans.length) {
      try {
        const res = await authApi.getRetailerPlans();
        if (res?.success) setActivePlans(res.data || []);
      } catch {
        /* list may already be populated from requests */
      }
    }
  };

  const confirmApprove = async () => {
    setBusy(true);
    setActionError("");
    try {
      const payload = {};
      const targetRequestedPlanId = String(approveTarget?.plan?._id || approveTarget?.requestedPlanId?._id || approveTarget?.requestedPlanId || "");
      // Only send overrides when they differ from the stored application
      if (approveData.planId && String(approveData.planId) !== targetRequestedPlanId) {
        payload.planId = approveData.planId;
      }
      if (approveData.durationDays) payload.durationDays = Number(approveData.durationDays);
      if (approveData.isCustomOverride) {
        payload.isCustomOverride = true;
        payload.assignedSeats = approveData.assignedSeats !== "" && !isNaN(approveData.assignedSeats)
          ? Number(approveData.assignedSeats)
          : undefined;
        payload.customOverrideReason = approveData.customOverrideReason || undefined;
      }
      const res = await supremeAdminApi.approveRetailerRequest(approveTarget.id, payload);
      if (res?.success) {
        showToast("success", res.message || "Request approved.");
        setApproveTarget(null);
        setDetail(null);
        fetchRequests(true);
      }
    } catch (err) {
      setActionError(err.message || "Approval failed.");
    } finally {
      setBusy(false);
    }
  };

  const confirmReject = async () => {
    setBusy(true);
    setActionError("");
    try {
      const res = await supremeAdminApi.rejectRetailerRequest(rejectTarget.id, {
        rejectionReason: rejectReason,
      });
      if (res?.success) {
        showToast("success", "Request rejected and the applicant has been notified.");
        setRejectTarget(null);
        setRejectReason("");
        setDetail(null);
        fetchRequests(true);
      }
    } catch (err) {
      setActionError(err.message || "Rejection failed.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setActionError("");
    try {
      const res = await supremeAdminApi.deleteRetailerRequest(deleteTarget.id);
      if (res?.success) {
        showToast(
          "success",
          res.message ||
            (deleteTarget.status === "APPROVED"
              ? `Approved Super Admin "${deleteTarget.businessName}" and associated workspace deleted successfully.`
              : `Rejected request for "${deleteTarget.businessName}" deleted successfully. The email can now apply again.`)
        );
        setDeleteTarget(null);
        setDetail(null);
        fetchRequests(true);
      }
    } catch (err) {
      setActionError(err.message || "Failed to delete request.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRequestInfo = async () => {
    if (!requestInfoTarget || !requestInfoNote.trim()) {
      setActionError("Please describe the specific documents or information requested.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const targetId = requestInfoTarget.id || requestInfoTarget._id;
      const res = await supremeAdminApi.requestAdditionalInfo(targetId, {
        note: requestInfoNote.trim(),
      });
      if (res?.success) {
        showToast("success", "Information request successfully sent to the applicant.");
        setRequestInfoTarget(null);
        setRequestInfoNote("");
        if (detail && (detail.id === targetId || detail._id === targetId)) {
          setDetail(res.data);
        }
        fetchRequests(true);
      }
    } catch (err) {
      setActionError(err.message || "Failed to submit information request.");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDoc = async (id, docType) => {
    try {
      setDocLoading(true);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/supreme-admin/retailer-requests/${id}/documents/${docType}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error("Document could not be retrieved from secure storage.");
      }
      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      window.open(objectUrl, "_blank");
    } catch (err) {
      showToast("error", err.message || "Failed to load document.");
    } finally {
      setDocLoading(false);
    }
  };

  const toggleVerifyPayment = async (req) => {
    setBusy(true);
    setActionError("");
    try {
      const target = !req.payment?.verified;
      const res = await supremeAdminApi.setPaymentVerification(req.id, {
        verified: target,
        note: target ? "Manually verified by Supreme Admin" : "",
      });
      if (res?.success) {
        showToast(target ? "success" : "warning", res.message);
        // Refresh whatever view is open
        if (detail?.id === req.id) {
          await openDetail(req.id);
        } else {
          fetchRequests(true);
        }
      }
    } catch (err) {
      setActionError(err.message || "Could not update payment verification.");
    } finally {
      setBusy(false);
    }
  };

  /* ────────────────────────────────────────────────────────────────
     Render
     ──────────────────────────────────────────────────────────────── */

  return (
    <div className="dashboard-page sa-page">
      {/* Header */}
      <div className="sa-page-header">
        <div>
          <span className="sa-brand-tag">ONBOARDING CONTROL</span>
          <h1 className="sa-page-title">
            Retailer Account <span>Approval Requests</span>
          </h1>
          <p className="sa-page-subtitle">
            Review package selection and KYC identity before provisioning Super Admin accounts. Payment capture is handled by the upcoming gateway integration.
          </p>
        </div>
        <div>
          <button type="button" className="sa-btn-outline" onClick={() => fetchRequests(true)}>
            <FaSync /> Refresh
          </button>
        </div>
      </div>

      {/* Global toast */}
      {toast && (
        <div
          className="alert"
          style={{
            margin: "0 0 16px",
            background: toast.type === "success" ? "#e6f6ec" : toast.type === "warning" ? "#fff7e6" : "#fdecec",
            color: toast.type === "success" ? "#18794e" : toast.type === "warning" ? "#9a6700" : "#b02a37",
            border: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {toast.type === "success" ? <FaCheckCircle /> : <FaExclamationTriangle />} {toast.text}
        </div>
      )}

      {/* Stats */}
      <div className="dashboard-stats" style={{ marginBottom: 18 }}>
        <div className="dashboard-stat-card">
          <div className="stat-icon" style={{ background: "#fff4e5", color: "#b45309" }}>
            <FaClock />
          </div>
          <div className="stat-content">
            <span className="stat-title">Pending</span>
            <h2>{counts.pending}</h2>
            <p>Awaiting your review</p>
          </div>
        </div>
        <div className="dashboard-stat-card">
          <div className="stat-icon" style={{ background: "#e6f6ec", color: "#18794e" }}>
            <FaUserCheck />
          </div>
          <div className="stat-content">
            <span className="stat-title">Approved</span>
            <h2>{counts.approved}</h2>
            <p>Accounts provisioned</p>
          </div>
        </div>
        <div className="dashboard-stat-card">
          <div className="stat-icon" style={{ background: "#fdecec", color: "#b02a37" }}>
            <FaBan />
          </div>
          <div className="stat-content">
            <span className="stat-title">Rejected</span>
            <h2>{counts.rejected}</h2>
            <p>Declined applications</p>
          </div>
        </div>
      </div>

      {/* Filters + list */}
      <div className="sa-card" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
            padding: "14px 16px",
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["PENDING", "APPROVED", "REJECTED", "INFO_REQUESTED", "ALL"].map((s) => {
              const label =
                s === "INFO_REQUESTED"
                  ? "Info Requested"
                  : s.charAt(0) + s.slice(1).toLowerCase();
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  style={{
                    padding: "7px 16px",
                    borderRadius: "999px",
                    border: "1px solid " + (statusFilter === s ? "#1e40af" : "#cbd5e1"),
                    background: statusFilter === s ? "#1e40af" : "#ffffff",
                    color: statusFilter === s ? "#ffffff" : "#475569",
                    fontWeight: 600,
                    fontSize: "12.5px",
                    cursor: "pointer",
                  }}
                >
                  {label}
                  {s === "PENDING" && counts.pending > 0 ? ` (${counts.pending})` : ""}
                  {s === "INFO_REQUESTED" && counts.infoRequested > 0 ? ` (${counts.infoRequested})` : ""}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", minWidth: 220 }}>
            <input
              type="text"
              placeholder="Search business, email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSearch(searchInput);
              }}
              style={{
                flex: 1,
                padding: "7px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
              }}
            />
            <button
              type="button"
              className="sa-btn-outline"
              style={{ padding: "8px 12px" }}
              onClick={() => setSearch(searchInput)}
            >
              <FaSearch size={13} />
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <div className="spinner-border text-primary" role="status" />
          </div>
        ) : error ? (
          <div className="alert alert-danger m-3">{error}</div>
        ) : requests.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "#64748b" }}>
            <FaClipboardList style={{ fontSize: "32px", marginBottom: "10px", color: "#94a3b8" }} />
            <p>No retailer requests found for this filter.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: "14px" }}>
              <thead style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <tr style={{ color: "#475569", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  <th style={{ padding: "14px 16px" }}>Business / Applicant</th>
                  <th>Package</th>
                  <th>Payment</th>
                  <th>Verified</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const planName = r.plan?.name || r.requestedPlanId?.name || r.planSnapshot?.name || "—";
                  const isAnnual = r.plan?.billingInterval === "ANNUAL" || r.planSnapshot?.billingInterval === "ANNUAL";
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "14px 16px" }}>
                        <strong style={{ color: "#1e293b" }}>{r.businessName}</strong>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          {r.email} {r.businessTypeLabel ? `• ${r.businessTypeLabel}` : ""}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span className="badge bg-light text-dark" style={{ border: "1px solid #cbd5e1" }}>
                            {planName}
                          </span>
                          {isAnnual ? (
                            <span
                              className="badge"
                              style={{
                                background: "#ecfdf5",
                                color: "#065f46",
                                border: "1px solid #a7f3d0",
                                fontSize: "10.5px",
                                fontWeight: 700,
                              }}
                            >
                              ANNUAL (1 YR)
                            </span>
                          ) : (
                            <span
                              className="badge"
                              style={{
                                background: "#f1f5f9",
                                color: "#475569",
                                border: "1px solid #cbd5e1",
                                fontSize: "10.5px",
                              }}
                            >
                              MONTHLY
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: "13px" }}>
                        {hasPaymentEvidence(r.payment) ? (
                          <>
                            <FaRupeeSign size={11} style={{ color: "#64748b" }} /> {fmtMoney({ currency: r.payment?.currency, amount: r.payment?.amount })}
                            <div style={{ fontSize: "11.5px", color: "#94a3b8" }}>{r.payment?.transactionId || "—"}</div>
                          </>
                        ) : (
                          <span style={{ fontSize: "12px", color: "#94a3b8" }}>Gateway pending</span>
                        )}
                      </td>
                      <td>
                        {hasPaymentEvidence(r.payment) ? (
                          r.payment?.verified ? (
                            <span className="badge bg-success-subtle text-success" style={{ fontSize: "11px", border: "1px solid #a7f3d0", borderRadius: "999px", background: "#e6f6ec", color: "#18794e" }}>
                              <FaCheckCircle size={10} /> Verified
                            </span>
                          ) : (
                            <span className="badge bg-danger-subtle" style={{ fontSize: "11px", border: "1px solid #f1aeb5", borderRadius: "999px", background: "#fdecec", color: "#b02a37" }}>
                              <FaTimesCircle size={10} /> Not verified
                            </span>
                          )
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td>{getStatusBadge(r.status)}</td>
                      <td style={{ fontSize: "13px", color: "#64748b" }}>{fmtDate(r.createdAt)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          style={{ fontSize: "12px", borderRadius: "8px" }}
                          onClick={() => openDetail(r.id)}
                        >
                          <FaEye size={12} /> Review
                        </button>
                        {["PENDING", "PENDING_REVIEW", "INFO_REQUESTED"].includes(r.status) && (
                          <>
                           
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              style={{ fontSize: "12px", borderRadius: "8px", marginInlineStart: 6 }}
                              disabled={hasPaymentEvidence(r.payment) && !r.payment?.verified}
                              title={
                                hasPaymentEvidence(r.payment) && !r.payment?.verified
                                  ? "Verify the payment first"
                                  : ""
                              }
                              onClick={() => openApprove(r)}
                            >
                              <FaCheckCircle size={12} /> Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              style={{ fontSize: "12px", borderRadius: "8px", marginInlineStart: 6 }}
                              onClick={() => {
                                setRejectTarget(r);
                                setRejectReason("");
                                setActionError("");
                              }}
                            >
                              <FaTimesCircle size={12} /> Reject
                            </button>
                          </>
                        )}
                        {["REJECTED", "APPROVED"].includes(r.status) && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            style={{ fontSize: "12px", borderRadius: "8px", marginInlineStart: 6 }}
                            onClick={() => {
                              setDeleteTarget(r);
                              setActionError("");
                            }}
                            title={
                              r.status === "APPROVED"
                                ? "Delete this approved Super Admin account and workspace data"
                                : "Delete this rejected request so the applicant can apply again"
                            }
                          >
                            <FaTrash size={11} style={{ marginRight: 4 }} /> Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detail modal ── */}
      {detailLoading && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}
        >
          <div className="spinner-border text-light" role="status" />
        </div>
      )}

      {detail && !detailLoading && (
        <div
          className="sa-modal-backdrop"
          data-lenis-prevent
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: "24px 16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div
            className="sa-modal-content"
            data-lenis-prevent
            style={{
              width: "100%",
              maxWidth: 780,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              background: "#ffffff",
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 25px 70px rgba(18,29,49,0.35)",
              border: "1px solid #eef2f6",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            {/* Modal header (Fixed at top) */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "18px 24px",
                background: "linear-gradient(135deg, #121d31 0%, #1e2e4a 100%)",
                borderBottom: "3px solid #a63d2f",
                color: "#fff",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(166,61,47,0.2)", border: "1px solid rgba(166,61,47,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fca59b", flexShrink: 0 }}>
                  <FaBuilding size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.2px" }}>{detail.businessName}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: 12.5, color: "#94a3b8" }}>{detail.email}</span>
                    <span style={{ color: "#475569" }}>•</span>
                    {getStatusBadge(detail.status)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#cbd5e1",
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  transition: "all 0.2s ease",
                }}
              >
                ×
              </button>
            </div>

            {/* Scrollable body content */}
            <div
              data-lenis-prevent
              style={{
                padding: "24px 26px",
                overflowY: "auto",
                flex: 1,
                overscrollBehavior: "contain",
              }}
            >
              {actionError && (
                <div className="alert alert-danger py-2" style={{ fontSize: "13px", borderRadius: 10 }}>
                  {actionError}
                </div>
              )}

              {/* Applicant & Business Verification grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.6, color: "#a63d2f", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    <FaUserCheck size={13} color="#a63d2f" /> Applicant &amp; Authority
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
                    <div><strong>Legal Name:</strong> {detail.businessVerification?.applicantLegalName || detail.name}</div>
                    <div><strong>Role:</strong> {detail.applicantRoleLabel || detail.businessVerification?.applicantRole || "Owner / Proprietor"}</div>
                    <div style={{ color: "#64748b" }}><strong>Email:</strong> {detail.email}</div>
                    <div style={{ color: "#64748b" }}><strong>Phone:</strong> {detail.phone || "No phone"}</div>
                    <div style={{ color: "#64748b" }}><strong>Submitted:</strong> {fmtDateTime(detail.createdAt)}</div>
                  </div>
                </div>

                <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.6, color: "#121d31", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    <FaShieldAlt size={13} color="#121d31" /> Business Entity &amp; Identifiers
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
                    <div><strong>Business Type:</strong> {detail.businessTypeLabel || detail.businessVerification?.businessType || "—"}</div>
                    <div>
                      <strong>PAN:</strong>{" "}
                      {detail.panNumber || detail.businessVerification?.panNumber ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontFamily: "monospace", letterSpacing: 1.2, fontWeight: 700, background: "#e2e8f0", color: "#0f172a", padding: "2px 8px", borderRadius: 4, fontSize: 13 }}>
                            {detail.panNumber || detail.businessVerification?.panNumber}
                          </span>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: "2px 6px", fontSize: 11, height: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}
                            onClick={() => {
                              navigator.clipboard.writeText(detail.panNumber || detail.businessVerification?.panNumber);
                              showToast("success", "PAN copied to clipboard!");
                            }}
                            title="Copy PAN for verification"
                          >
                            <FaCopy size={11} /> Copy
                          </button>
                        </span>
                      ) : (
                        <span style={{ fontFamily: "monospace", letterSpacing: 1, background: "#e2e8f0", padding: "1px 6px", borderRadius: 4 }}>
                          {detail.maskedPan || "—"}
                        </span>
                      )}
                    </div>
                    {detail.businessVerification?.registrationNumber && (
                      <div>
                        <strong>CIN / LLPIN:</strong>{" "}
                        <span style={{ fontFamily: "monospace" }}>{detail.businessVerification.registrationNumber}</span>
                      </div>
                    )}
                    {detail.businessVerification?.hasGst && (
                      <div>
                        <strong>GSTIN:</strong>{" "}
                        <span style={{ fontFamily: "monospace" }}>{detail.businessVerification.gstin || "Declared"}</span>
                      </div>
                    )}
                    {!detail.businessVerification && detail.identity && (
                      <div style={{ color: "#64748b" }}>
                        <strong>Legacy KYC:</strong> {detail.idTypeLabel || detail.identity.idType} - {detail.identity.idNumber}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Uploaded Verification Documents Section (Incorporation Certificate or Authorization Letter) */}
              {detail.businessVerification && (detail.businessVerification.registrationDocKey || detail.businessVerification.authLetterDocKey) && (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
                  <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.6, color: "#a63d2f", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <FaFileAlt color="#a63d2f" /> Uploaded Verification Documents
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                    {/* Registration / CIN / LLPIN Document */}
                    {["LLP", "PVT_LTD", "PUBLIC_LTD"].includes(detail.businessVerification.businessType) && (
                      <div style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>Incorporation Certificate</div>
                          <div style={{ fontSize: 11, color: "#64748b", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: 140 }}>
                            {detail.businessVerification.registrationDocName || "Incorporation"}
                          </div>
                        </div>
                        {detail.businessVerification.registrationDocKey ? (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ fontSize: 11, borderRadius: 6, padding: "4px 10px", background: "#121d31", color: "#fff", border: "none" }}
                            disabled={docLoading}
                            onClick={() => handleOpenDoc(detail.id || detail._id, "registration")}
                          >
                            <FaEye size={10} /> View
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>Missing</span>
                        )}
                      </div>
                    )}

                    {/* Authorization Letter Document */}
                    {detail.businessVerification.applicantRole === "AUTHORIZED_REPRESENTATIVE" && (
                      <div style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>Authorization Letter</div>
                          <div style={{ fontSize: 11, color: "#64748b", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: 140 }}>
                            {detail.businessVerification.authLetterDocName || "Auth Letter"}
                          </div>
                        </div>
                        {detail.businessVerification.authLetterDocKey ? (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ fontSize: 11, borderRadius: 6, padding: "4px 10px", background: "#121d31", color: "#fff", border: "none" }}
                            disabled={docLoading}
                            onClick={() => handleOpenDoc(detail.id || detail._id, "auth")}
                          >
                            <FaEye size={10} /> View
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>Missing</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Package Card */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderLeft: "4px solid #a63d2f",
                  borderRadius: 14,
                  padding: "16px 20px",
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    fontSize: 11.5,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    color: "#a63d2f",
                    fontWeight: 700,
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <FaRupeeSign size={12} /> Requested Package
                </div>
                {detail.plan ? (
                  (() => {
                    const isAnnual =
                      detail.plan?.billingInterval === "ANNUAL" ||
                      detail.planSnapshot?.billingInterval === "ANNUAL";
                    return (
                      <div>
                        {/* Top line: Plan Name, Price, and Duration */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: 12,
                            paddingBottom: 12,
                            borderBottom: "1px solid #e2e8f0",
                            marginBottom: 12,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: "#121d31" }}>
                              {detail.plan.name}
                            </span>
                            <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>
                              ({isAnnual ? "Annual Subscription" : "Monthly Subscription"})
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span
                              style={{
                                background: isAnnual ? "#ecfdf5" : "#f1f5f9",
                                color: isAnnual ? "#065f46" : "#334155",
                                border: isAnnual ? "1px solid #a7f3d0" : "1px solid #cbd5e1",
                                padding: "4px 12px",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {isAnnual ? "Annual — 1 Year (365 days)" : `${detail.plan.durationDays || 30} days`}
                            </span>
                            <div style={{ fontSize: 17, fontWeight: 800, color: "#a63d2f" }}>
                              {fmtMoney(detail.plan)}{" "}
                              <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>
                                {isAnnual ? "/year" : "/month"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Entitlement Chips Grid */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          <div
                            style={{
                              background: "#ffffff",
                              border: "1px solid #cbd5e1",
                              borderRadius: 8,
                              padding: "6px 14px",
                              fontSize: 13,
                              color: "#1e293b",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span style={{ color: "#a63d2f", fontWeight: 700 }}>Project Limit:</span>{" "}
                            {detail.plan.isUnlimitedProjects || detail.plan.maxProjects >= 999999
                              ? "Unlimited projects"
                              : `${detail.plan.maxProjects ?? 10} projects max`}
                          </div>

                          <div
                            style={{
                              background: "#ffffff",
                              border: "1px solid #cbd5e1",
                              borderRadius: 8,
                              padding: "6px 14px",
                              fontSize: 13,
                              color: "#1e293b",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span style={{ color: "#a63d2f", fontWeight: 700 }}>Staff Admin Seats:</span>{" "}
                            {detail.plan.isUnlimitedSeats || detail.plan.maxAdminSeats >= 999999
                              ? "Unlimited seats"
                              : `${detail.plan.maxAdminSeats} branch admin seats`}
                          </div>

                          {!detail.plan.isActive && (
                            <div
                              style={{
                                background: "#fef2f2",
                                border: "1px solid #fecaca",
                                borderRadius: 8,
                                padding: "6px 12px",
                                fontSize: 12,
                                color: "#b91c1c",
                                fontWeight: 600,
                              }}
                            >
                              Package now inactive — pick a different package on approval
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div style={{ fontSize: 13, color: "#b02a37" }}>
                    The originally requested package no longer exists. Choose another active package when approving.
                  </div>
                )}
              </div>

              {/* Payment details (only when payment was captured) */}
              {hasPaymentEvidence(detail.payment) ? (
                <div style={{ background: "#fffbf2", border: "1px solid #fda94f", borderRadius: 10, padding: "14px 16px", marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#9a6700", fontWeight: 700 }}>Payment Details</div>
                    {detail.status === "PENDING" && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => toggleVerifyPayment(detail)}
                        style={{
                          fontSize: "12px",
                          borderRadius: "8px",
                          background: detail.payment?.verified ? "#b45309" : "#18794e",
                          color: "#fff",
                        }}
                      >
                        {detail.payment?.verified ? "Revoke verification" : "Mark Payment Verified"}
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 24px", fontSize: 13.5 }}>
                    <span>
                      <strong style={{ color: "#64748b" }}>Method:</strong> {detail.paymentMethodLabel || detail.payment?.method || "—"}
                    </span>
                    <span>
                      <strong style={{ color: "#64748b" }}>Txn / Ref ID:</strong> {detail.payment?.transactionId || "—"}
                    </span>
                    <span>
                      <strong style={{ color: "#64748b" }}>Amount declared:</strong> {fmtMoney({ currency: detail.payment?.currency, amount: detail.payment?.amount })}
                    </span>
                    <span>
                      <strong style={{ color: "#64748b" }}>Paid on:</strong> {fmtDate(detail.payment?.paidOn)}
                    </span>
                    <span>
                      {detail.payment?.verified ? (
                        <span style={{ color: "#18794e", fontWeight: 600 }}>Payment manually verified</span>
                      ) : (
                        <span style={{ color: "#b02a37", fontWeight: 600 }}>NOT verified — proof is evidence only</span>
                      )}
                    </span>
                  </div>
                  {detail.payment?.notes && (
                    <div style={{ marginTop: 6, fontSize: 13, color: "#52657d" }}>
                      <strong style={{ color: "#64748b" }}>Notes:</strong> {detail.payment.notes}
                    </div>
                  )}
                  {detail.payment?.proofUrl ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                        <FaImage /> Payment proof screenshot (legacy record — securely served)
                      </div>
                      <button
                        type="button"
                        className="sa-btn-outline"
                        onClick={() => handleOpenDoc(detail.id || detail._id, "paymentProof")}
                        disabled={docLoading}
                      >
                        {docLoading ? "Loading proof..." : "View Payment Proof (Secure)"}
                      </button>
                      {detail.payment.verifiedAt && (
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                          Verified at {fmtDateTime(detail.payment.verifiedAt)}
                          {detail.payment.verificationNote ? ` — ${detail.payment.verificationNote}` : ""}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, fontSize: 13, color: "#92400e" }}>
                      No payment proof screenshot was uploaded. Verify against the transaction reference with your bank/records.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 13, color: "#64748b" }}>
                  <strong style={{ color: "#475569" }}>Payment:</strong> not collected on this request —
                  package fee payments will be captured through the payment gateway integration (upcoming).
                </div>
              )}

              {/* Review trail */}
              {(detail.reviewedAt || detail.provisioned) && (
                <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 13 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>Review Trail</div>
                  {detail.reviewedAt && (
                    <div>
                      {detail.status} by {detail.reviewedBy?.name || "Supreme Admin"} at {fmtDateTime(detail.reviewedAt)}
                      {detail.reviewNote ? ` — "${detail.reviewNote}"` : ""}
                    </div>
                  )}
                  {detail.provisioned?.subscription && (
                    <div style={{ color: "#18794e" }}>
                      Provisioned: <strong>{detail.plan?.name}</strong> • expires {fmtDate(detail.provisioned.subscription.expiryDate)} • seats {detail.provisioned.subscription.assignedSeats}
                    </div>
                  )}
                </div>
              )}

              {/* Audit History Timeline */}
              {Array.isArray(detail.auditHistory) && detail.auditHistory.length > 0 && (
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", marginBottom: 18, fontSize: 13, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.6, color: "#121d31", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <FaHistory color="#a63d2f" /> Verification Audit Trail
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {detail.auditHistory.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0", borderBottom: idx < detail.auditHistory.length - 1 ? "1px dashed #e2e8f0" : "none" }}>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: item.action === "APPROVED" ? "#e6f6ec" : item.action === "REJECTED" ? "#fdecec" : item.action === "INFO_REQUESTED" ? "#fffbeb" : "#f1f5f9",
                          color: item.action === "APPROVED" ? "#18794e" : item.action === "REJECTED" ? "#b02a37" : item.action === "INFO_REQUESTED" ? "#b45309" : "#334155",
                          flexShrink: 0
                        }}>
                          {item.action}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div>
                            <strong>{item.performedByName || "Reviewer"}</strong>
                            {item.reason && <span style={{ color: "#475569" }}> — "{item.reason}"</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmtDateTime(item.timestamp)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {["PENDING", "PENDING_REVIEW", "INFO_REQUESTED"].includes(detail.status) && (
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      borderRadius: 10,
                      fontWeight: 600,
                      color: "#b45309",
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      fontSize: 13,
                      padding: "8px 16px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onClick={() => {
                      setRequestInfoTarget(detail);
                      setRequestInfoNote("");
                      setActionError("");
                    }}
                  >
                    <FaQuestionCircle /> Request Info
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      borderRadius: 10,
                      fontWeight: 600,
                      color: "#b02a37",
                      background: "#fdecec",
                      border: "1px solid #f1aeb5",
                      fontSize: 13,
                      padding: "8px 16px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onClick={() => {
                      setRejectTarget(detail);
                      setRejectReason("");
                      setActionError("");
                    }}
                  >
                    <FaTimesCircle /> Reject
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      borderRadius: 10,
                      fontWeight: 600,
                      color: "#ffffff",
                      background: "linear-gradient(135deg, #a63d2f 0%, #872e22 100%)",
                      border: "none",
                      fontSize: 13,
                      padding: "8px 18px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: "0 4px 12px rgba(166,61,47,0.25)",
                    }}
                    disabled={hasPaymentEvidence(detail.payment) && !detail.payment?.verified}
                    title={
                      hasPaymentEvidence(detail.payment) && !detail.payment?.verified
                        ? "Verify the payment before approving"
                        : ""
                    }
                    onClick={() => openApprove(detail)}
                  >
                    <FaCheckCircle /> Approve &amp; Activate Account
                  </button>
                </div>
              )}

              {["REJECTED", "APPROVED"].includes(detail.status) && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 24,
                    paddingTop: 18,
                    borderTop: "1px solid #f1f5f9",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    {detail.status === "APPROVED" ? (
                      <>
                        This Super Admin is provisioned. Deleting it will permanently remove the <strong style={{ color: "#1e293b" }}>{detail.email}</strong> account, its subscription, staff branch admins, and all projects/plots in this workspace.
                      </>
                    ) : (
                      <>
                        This request was rejected. Deleting it frees up <strong style={{ color: "#1e293b" }}>{detail.email}</strong> so the applicant can submit a fresh application.
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      borderRadius: 10,
                      fontWeight: 600,
                      color: "#ffffff",
                      background: "#dc2626",
                      border: "none",
                      fontSize: 13,
                      padding: "8px 18px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onClick={() => {
                      setDeleteTarget(detail);
                      setActionError("");
                    }}
                  >
                    <FaTrash size={12} /> {detail.status === "APPROVED" ? "Delete Approved Super Admin" : "Delete Rejected Request"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Approve modal ── */}
      {approveTarget && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(18,29,49,0.65)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000, padding: 16 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setApproveTarget(null);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 500,
              background: "#fff",
              borderRadius: 18,
              padding: "24px 26px",
              boxShadow: "0 24px 60px rgba(18,29,49,0.35)",
              border: "1px solid #eef2f6",
              maxHeight: "90vh",
              overflowY: "auto",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e6f6ec", color: "#18794e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FaCheckCircle size={18} />
              </div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#121d31" }}>
                Approve Super Admin Account
              </h3>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
              Provisions <strong>{approveTarget.businessName}</strong> as an active Super Admin with full workspace dashboard access.
            </p>

            {actionError && <div className="alert alert-danger py-2" style={{ fontSize: 13, borderRadius: 8 }}>{actionError}</div>}

            {/* Plan selection */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#a63d2f", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Package to activate
              </label>
              {(() => {
                const snapshot = approveTarget?.planSnapshot || approveTarget?.plan;
                const isAnnual = snapshot?.billingInterval === "ANNUAL";
                const fallbackPlan = activePlans.find((p) => String(p._id) === String(approveData.planId));
                const selectedPlan = snapshot || fallbackPlan;
                const durationDays = snapshot?.durationDays || (isAnnual ? 365 : (fallbackPlan?.durationDays || 30));

                return (
                  <div
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      borderLeft: "4px solid #a63d2f",
                      background: "#f8fafc",
                      fontSize: 13.5,
                      color: "#1e293b",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <span>
                      {selectedPlan?.name || "Selected Package"} —{" "}
                      <strong style={{ color: "#a63d2f" }}>
                        {selectedPlan ? fmtMoney(selectedPlan) : ""}
                      </strong>{" "}
                      <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
                        {isAnnual ? "/year" : "/month"}
                      </span>{" "}
                      ({isAnnual ? "Annual — 365 days" : `${durationDays} days`},{" "}
                      {selectedPlan?.isUnlimitedProjects || selectedPlan?.maxProjects >= 999999 ? "Unlimited" : `${selectedPlan?.maxProjects ?? 50}`} projects,{" "}
                      {selectedPlan?.isUnlimitedSeats ? "Unlimited" : `${selectedPlan?.maxAdminSeats ?? 0}`} seats)
                    </span>
                    <span style={{ fontSize: 11, background: isAnnual ? "#ecfdf5" : "#e2e8f0", color: isAnnual ? "#065f46" : "#475569", border: isAnnual ? "1px solid #a7f3d0" : "none", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
                      {isAnnual ? "ANNUAL (LOCKED)" : "LOCKED"}
                    </span>
                  </div>
                );
              })()}
              <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>
                This is the exact package selected by the user during signup and cannot be changed.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-light"
                style={{ borderRadius: 10, fontWeight: 600, padding: "8px 16px" }}
                disabled={busy}
                onClick={() => setApproveTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  borderRadius: 10,
                  fontWeight: 600,
                  color: "#fff",
                  background: "linear-gradient(135deg, #a63d2f 0%, #872e22 100%)",
                  padding: "8px 20px",
                  border: "none",
                  boxShadow: "0 4px 12px rgba(166,61,47,0.25)"
                }}
                disabled={busy || (approveData.isCustomOverride && approveData.assignedSeats === "")}
                onClick={confirmApprove}
              >
                {busy ? "Approving…" : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject modal ── */}
      {rejectTarget && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000, padding: 16 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setRejectTarget(null);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: "#fff",
              borderRadius: 14,
              padding: 22,
              boxShadow: "0 24px 60px rgba(15,23,42,0.35)",
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#b02a37" }}>
              Reject Request
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
              The applicant for <strong>{rejectTarget.businessName}</strong> will be emailed the reason below.
            </p>

            {actionError && <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>{actionError}</div>}

            <textarea
              rows={3}
              placeholder="Rejection reason (required)…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid #cbd5e1", fontSize: 13.5, fontFamily: "inherit" }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-light"
                style={{ borderRadius: 10, fontWeight: 600 }}
                disabled={busy}
                onClick={() => setRejectTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ borderRadius: 10, fontWeight: 600 }}
                disabled={busy || !rejectReason.trim()}
                onClick={confirmReject}
              >
                {busy ? "Rejecting…" : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Request Additional Information Modal ── */}
      {requestInfoTarget && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000, padding: 16 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setRequestInfoTarget(null);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              background: "#fff",
              borderRadius: 14,
              padding: 22,
              boxShadow: "0 24px 60px rgba(15,23,42,0.35)",
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#0f2542" }}>
              Request Additional Information
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
              Ask <strong>{requestInfoTarget.businessName}</strong> to provide clarification or re-upload specific documents. An email notification will be sent to <strong>{requestInfoTarget.email}</strong>.
            </p>

            {actionError && <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>{actionError}</div>}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                Instructions / Required Documents:
              </label>
              <textarea
                rows={4}
                value={requestInfoNote}
                onChange={(e) => setRequestInfoNote(e.target.value)}
                placeholder="e.g. Please provide a clearer scanned copy of the Certificate of Incorporation and updated GST certificate."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={busy}
                onClick={() => setRequestInfoTarget(null)}
                style={{ borderRadius: 8, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-warning"
                disabled={busy || !requestInfoNote.trim()}
                onClick={handleRequestInfo}
                style={{ borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", background: "#d97706", borderColor: "#d97706" }}
              >
                {busy ? "Sending…" : "Send Request to Applicant"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Request Modal (Rejected or Approved) ── */}
      {deleteTarget && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000, padding: 16 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) setDeleteTarget(null);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#ffffff",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 25px 60px rgba(0,0,0,0.25)",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#fee2e2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                <FaTrash />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                  {deleteTarget.status === "APPROVED" ? "Delete Approved Super Admin?" : "Delete Rejected Request?"}
                </h3>
                <span style={{ fontSize: 12.5, color: "#64748b" }}>
                  {deleteTarget.status === "APPROVED"
                    ? "Permanently remove Super Admin account and workspace data"
                    : "Permanently remove this rejected application"}
                </span>
              </div>
            </div>

            <p style={{ margin: "12px 0 16px", fontSize: 13.5, color: "#475569", lineHeight: 1.6 }}>
              Are you sure you want to delete {deleteTarget.status === "APPROVED" ? "the approved Super Admin account" : "the rejected request"} for{" "}
              <strong>{deleteTarget.businessName}</strong> (<strong>{deleteTarget.email}</strong>)?
            </p>

            {deleteTarget.status === "APPROVED" ? (
              <div style={{ padding: "12px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 12.5, color: "#991b1b", fontWeight: 600, marginBottom: 4 }}>
                  ⚠️ Irreversible Action:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#b91c1c", lineHeight: 1.6 }}>
                  <li>Super Admin login and subscription will be permanently removed.</li>
                  <li>All staff branch admins under this tenant will be deleted.</li>
                  <li>All branches, projects, plots, enquiries, and site visits will be cleaned up.</li>
                  <li>The email address <strong>{deleteTarget.email}</strong> will be freed for fresh registration if needed.</li>
                </ul>
              </div>
            ) : (
              <div style={{ padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 12.5, color: "#0f172a" }}>
                  ✓ Deleting this request will completely remove it from the system and allow <strong>{deleteTarget.email}</strong> to submit a new retailer account application.
                </span>
              </div>
            )}

            {actionError && <div className="alert alert-danger py-2" style={{ fontSize: 13, marginBottom: 14 }}>{actionError}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                style={{ borderRadius: 8, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isDeleting}
                onClick={confirmDelete}
                style={{ borderRadius: 8, fontSize: 13, fontWeight: 600, background: "#dc2626", borderColor: "#dc2626", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {isDeleting ? "Deleting…" : (<><FaTrash size={12} /> {deleteTarget.status === "APPROVED" ? "Delete Super Admin" : "Delete Request"}</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RetailerRequests;
