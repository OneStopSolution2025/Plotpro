import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supremeAdminApi } from "../../../services/api";
import {
  FaChair,
  FaExclamationTriangle,
  FaCheckCircle,
  FaSync,
  FaInfinity,
} from "react-icons/fa";
import "../../styles/super-admin.css";

const SeatUsageOverview = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (type, text) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const fetchSeatUsage = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await supremeAdminApi.getSeatUsage();
      if (res?.success) {
        setData(res.data || []);
      }
    } catch (err) {
      console.error("[SeatUsageOverview] Fetch error:", err);
      if (!isSilent) {
        setError(err.message || "Failed to load seat usage data.");
      }
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchSeatUsage(false);

    // Auto-sync every 8 seconds
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchSeatUsage(true);
      }
    }, 8000);

    const handleFocus = () => {
      fetchSeatUsage(true);
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [fetchSeatUsage]);

  // Aggregate metrics
  const totalSubscribers = data.length;
  const totalAssignedSeats = data.reduce(
    (acc, curr) => (curr.isUnlimited ? acc : acc + (curr.assignedSeats || 0)),
    0
  );
  const totalUsedSeats = data.reduce(
    (acc, curr) => acc + (curr.usedSeats || 0),
    0
  );
  const totalActiveAdmins = data.reduce(
    (acc, curr) => acc + (curr.activeAdmins || 0),
    0
  );

  return (
    <div className="super-admin-content" style={{ padding: "24px" }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`alert alert-${
            toastMessage.type === "success" ? "success" : "danger"
          }`}
          style={{
            position: "fixed",
            top: "24px",
            right: "24px",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
            borderRadius: "8px",
          }}
        >
          {toastMessage.type === "success" ? (
            <FaCheckCircle />
          ) : (
            <FaExclamationTriangle />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 700,
              margin: "0 0 6px",
              color: "#0f172a",
            }}
          >
            Admin Seat Quota Oversight
          </h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: "14px" }}>
            Inspect package limits, override individual subscriber quotas, and track branch admin seats.
          </p>
        </div>
        <button
          type="button"
          className="sa-btn-outline"
          onClick={() => fetchSeatUsage(false)}
          style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
        >
          <FaSync className={loading ? "spinner" : ""} /> Refresh
        </button>
      </div>

      {/* Metrics Banner */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div className="sa-card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
            TOTAL SUBSCRIBERS
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#0f172a",
              marginTop: "4px",
            }}
          >
            {totalSubscribers}
          </div>
        </div>

        <div className="sa-card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
            TOTAL SEATS PROVISIONED
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#0f172a",
              marginTop: "4px",
            }}
          >
            {totalAssignedSeats}
          </div>
        </div>

        <div className="sa-card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
            ACTIVE ADMINS CREATED
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#16a34a",
              marginTop: "4px",
            }}
          >
            {totalActiveAdmins}
          </div>
        </div>

        <div className="sa-card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
            GLOBAL UTILIZATION
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#0f172a",
              marginTop: "4px",
            }}
          >
            {totalAssignedSeats > 0
              ? `${Math.round((totalUsedSeats / totalAssignedSeats) * 100)}%`
              : "0%"}
          </div>
        </div>
      </div>

      {/* OVERVIEW BREAKDOWN */}
      <div className="sa-card" style={{ overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <div className="spinner-border text-primary" role="status" />
          </div>
        ) : error ? (
          <div className="alert alert-danger m-3">{error}</div>
        ) : data.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "#64748b" }}>
            <p>No tenant seat data available.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: "14px" }}>
              <thead style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <tr style={{ color: "#475569", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  <th style={{ padding: "14px 16px" }}>Subscriber</th>
                  <th>Package Tier</th>
                  <th>Seats Assigned</th>
                  <th>Seats Used</th>
                  <th>Remaining Seats</th>
                  <th>Utilization</th>
                  <th>Account Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => {
                  const isItemUnlimited = item.isUnlimited || (item.assignedSeats || 0) >= 999999;
                  const remaining = item.remainingSeats !== undefined ? item.remainingSeats : Math.max(0, (item.assignedSeats || 0) - (item.usedSeats || 0));

                  return (
                    <tr key={item.subscriberId}>
                      <td style={{ padding: "14px 16px" }}>
                        <strong>{item.businessName || item.name}</strong>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{item.email}</div>
                      </td>
                      <td>
                        <span className="badge bg-light text-dark" style={{ border: "1px solid #cbd5e1" }}>
                          {item.planName}
                        </span>
                        {item.isCustomOverride && (
                          <span className="badge bg-warning text-dark ms-1" style={{ fontSize: "10px" }} title={item.customOverrideReason}>
                            Custom
                          </span>
                        )}
                      </td>
                      <td>
                        {isItemUnlimited ? (
                          <span
                            className="badge bg-light text-primary d-inline-flex align-items-center gap-1"
                            style={{ border: "1px solid #cbd5e1", fontSize: "12px" }}
                          >
                            <FaInfinity /> Unlimited
                          </span>
                        ) : (
                          <strong>{item.assignedSeats} seats</strong>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: item.usedSeats > 0 ? "#1e293b" : "#94a3b8" }}>
                          {item.usedSeats}
                        </span>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          {item.activeAdmins} active
                        </div>
                      </td>
                      <td>
                        {isItemUnlimited ? (
                          <span className="badge bg-success">Available</span>
                        ) : remaining === 0 ? (
                          <span className="badge bg-danger" style={{ fontSize: "11px" }}>
                            0 remaining (Limit Reached)
                          </span>
                        ) : (
                          <span className="badge bg-success" style={{ fontSize: "11px" }}>
                            {remaining} remaining
                          </span>
                        )}
                      </td>
                      <td style={{ width: "160px" }}>
                        {isItemUnlimited ? (
                          <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: "600" }}>
                            Unlimited Quota
                          </span>
                        ) : (
                          <div>
                            <div className="progress" style={{ height: "6px", marginBottom: "4px" }}>
                              <div
                                className={`progress-bar ${
                                  item.utilizationPercent >= 100
                                    ? "bg-danger"
                                    : item.utilizationPercent >= 80
                                    ? "bg-warning"
                                    : "bg-success"
                                }`}
                                role="progressbar"
                                style={{ width: `${Math.min(100, item.utilizationPercent)}%` }}
                              />
                            </div>
                            <span style={{ fontSize: "11px", color: "#64748b" }}>
                              {item.utilizationPercent}% consumed
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${item.subscriberStatus === "ACTIVE" ? "bg-success" : "bg-danger"}`}>
                          {item.subscriberStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SeatUsageOverview;
