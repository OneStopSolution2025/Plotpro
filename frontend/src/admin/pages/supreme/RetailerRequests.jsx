import { useState, useEffect, useCallback } from "react";
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
} from "react-icons/fa";
import "../../styles/super-admin.css";

/* ────────────────────────────────────────────────────────────────
   Shared small helpers
   ──────────────────────────────────────────────────────────────── */

const getStatusBadge = (status) => {
  const styles = {
    PENDING: { background: "#fff7e6", color: "#9a6700", border: "1px solid #f5c451" },
    APPROVED: { background: "#e6f6ec", color: "#18794e", border: "1px solid #6ecf9a" },
    REJECTED: { background: "#fdecec", color: "#b02a37", border: "1px solid #f1aeb5" },
  };
  return (
    <span className="badge" style={{ fontSize: "11.5px", fontWeight: 600, padding: "5px 10px", borderRadius: "999px", ...(styles[status] || styles.PENDING) }}>
      {status}
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
  }, [statusFilter, search]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setApproveData({
      planId: String(req.requestedPlanId || ""),
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
      // Only send overrides when they differ from the stored application
      if (approveData.planId && String(approveData.planId) !== String(approveTarget.requestedPlanId)) {
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
          <div style={{ display: "flex", gap: 6 }}>
            {["PENDING", "APPROVED", "REJECTED", "ALL"].map((s) => (
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
                {s.charAt(0) + s.slice(1).toLowerCase()}
                {s === "PENDING" && counts.pending > 0 ? ` (${counts.pending})` : ""}
              </button>
            ))}
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
                  const planName = r.requestedPlanId?.name || r.planSnapshot?.name || "—";
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "14px 16px" }}>
                        <strong style={{ color: "#1e293b" }}>{r.businessName}</strong>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{r.email}</div>
                      </td>
                      <td>
                        <span className="badge bg-light text-dark" style={{ border: "1px solid #cbd5e1" }}>
                          {planName}
                        </span>
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
                        {r.status === "PENDING" && (
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
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 3000, overflowY: "auto", padding: "40px 16px" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 720,
              background: "#ffffff",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 24px 60px rgba(15,23,42,0.3)",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "18px 22px",
                background: "#0f2542",
                color: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FaShieldAlt />
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{detail.businessName}</h3>
                  <span style={{ fontSize: 12, color: "#a8b9d1" }}>{detail.email} • {getStatusBadge(detail.status)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                style={{ background: "none", border: "none", color: "#a8b9d1", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "22px" }}>
              {actionError && (
                <div className="alert alert-danger py-2" style={{ fontSize: "13px" }}>
                  {actionError}
                </div>
              )}

              {/* Applicant grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#64748b", fontWeight: 700 }}>Applicant</div>
                  <div style={{ marginTop: 4 }}>
                    <div><strong>{detail.name}</strong></div>
                    <div style={{ fontSize: 13, color: "#64748b" }}>{detail.email}</div>
                    <div style={{ fontSize: 13, color: "#64748b" }}>{detail.phone || "No phone"}</div>
                    <div style={{ fontSize: 13, color: "#64748b" }}>Requested: {fmtDateTime(detail.createdAt)}</div>
                  </div>
                </div>

                <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#64748b", fontWeight: 700 }}>Identity (KYC)</div>
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 13 }}><strong>ID type:</strong> {detail.idTypeLabel || detail.identity?.idType}</div>
                    <div style={{ fontSize: 13 }}><strong>ID number:</strong> {detail.identity?.idNumber}</div>
                  </div>
                </div>
              </div>

              {/* Package */}
              <div style={{ background: "#f6f9ff", border: "1px solid #c3d9f7", borderRadius: 10, padding: "14px 16px", marginBottom: 18 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#1e4e8f", fontWeight: 700, marginBottom: 6 }}>
                  Requested Package
                </div>
                {detail.plan ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px", fontSize: 13.5 }}>
                    <span><strong>{detail.plan.name}</strong></span>
                    <span>{fmtMoney(detail.plan)}</span>
                    <span>{detail.plan.durationDays} days</span>
                    <span>
                      {detail.plan.isUnlimitedSeats || detail.plan.maxAdminSeats >= 999999
                        ? "Unlimited branch admin seats"
                        : `${detail.plan.maxAdminSeats} branch admin seats`}
                    </span>
                    {!detail.plan.isActive && (
                      <span style={{ color: "#b02a37", fontWeight: 600 }}>
                        (Package now inactive — pick a different package on approval)
                      </span>
                    )}
                  </div>
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
                        <FaImage /> Payment proof screenshot ({detail.payment.proofUrl ? "Cloudinary" : ""})
                      </div>
                      <a href={detail.payment.proofUrl} target="_blank" rel="noreferrer">
                        <img
                          src={detail.payment.proofUrl}
                          alt="Payment proof"
                          style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, border: "1px solid #e2e8f0" }}
                        />
                      </a>
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

              {/* Actions */}
              {detail.status === "PENDING" && (
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    style={{ borderRadius: 10, fontWeight: 600 }}
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
                    className="btn btn-success"
                    style={{ borderRadius: 10, fontWeight: 600 }}
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
            </div>
          </div>
        </div>
      )}

      {/* ── Approve modal ── */}
      {approveTarget && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000, padding: 16 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setApproveTarget(null);
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
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#0f2542" }}>
              Approve Super Admin Account
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
              Provisions <strong>{approveTarget.businessName}</strong> as an active Super Admin and creates its
              subscription (admin-seat limits included) from the selected package.
            </p>

            {actionError && <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>{actionError}</div>}

            {/* Plan selection */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
                Package to activate
              </label>
              <select
                value={approveData.planId}
                onChange={(e) => setApproveData((p) => ({ ...p, planId: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #cbd5e1", fontSize: 13.5 }}
              >
                {activePlans.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} — {fmtMoney(p)} ({p.durationDays} days, {p.isUnlimitedSeats ? "Unlimited" : `${p.maxAdminSeats}`} seats){!p.isActive ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                Entitlements (price, seats, duration) always come from the platform package configuration.
              </div>
            </div>

            {/* Duration override */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
                Duration override (days — optional)
              </label>
              <input
                type="number"
                min="1"
                placeholder="Leave empty to use package duration"
                value={approveData.durationDays}
                onChange={(e) => setApproveData((p) => ({ ...p, durationDays: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #cbd5e1", fontSize: 13.5 }}
              />
            </div>

            {/* Seat override */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#475569" }}>
                <input
                  type="checkbox"
                  checked={approveData.isCustomOverride}
                  onChange={(e) => setApproveData((p) => ({ ...p, isCustomOverride: e.target.checked }))}
                />
                Grant custom seat override
              </label>
              {approveData.isCustomOverride && (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="number"
                    min="0"
                    placeholder="Custom branch admin seat count (0+)"
                    value={approveData.assignedSeats}
                    onChange={(e) => setApproveData((p) => ({ ...p, assignedSeats: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #cbd5e1", fontSize: 13.5, marginBottom: 8 }}
                  />
                  <input
                    type="text"
                    placeholder="Reason for the override (stored in the audit trail)"
                    value={approveData.customOverrideReason}
                    onChange={(e) => setApproveData((p) => ({ ...p, customOverrideReason: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #cbd5e1", fontSize: 13.5 }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-light"
                style={{ borderRadius: 10, fontWeight: 600 }}
                disabled={busy}
                onClick={() => setApproveTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-success"
                style={{ borderRadius: 10, fontWeight: 600 }}
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
    </div>
  );
};

export default RetailerRequests;
