import { useState, useEffect, useCallback } from "react";
import { supremeAdminApi } from "../../../services/api";
import { FaChair, FaExclamationTriangle, FaCheckCircle, FaSync, FaInfinity } from "react-icons/fa";
import "../../styles/super-admin.css";

const SeatUsageOverview = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSeatUsage = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await supremeAdminApi.getSeatUsage();
      if (res?.success) {
        setData(res.data);
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

    // Auto-sync seat usage every 6 seconds in background
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchSeatUsage(true);
      }
    }, 6000);

    const handleFocus = () => fetchSeatUsage(true);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [fetchSeatUsage]);

  const hasUnlimited = data.some((curr) => curr.isUnlimited || (curr.assignedSeats || 0) >= 999999);
  const totalAssigned = data
    .filter((curr) => !curr.isUnlimited && (curr.assignedSeats || 0) < 999999)
    .reduce((acc, curr) => acc + (curr.assignedSeats || 0), 0);
  const totalUsed = data.reduce((acc, curr) => acc + (curr.usedSeats || 0), 0);

  return (
    <div className="dashboard-page sa-page">
      {/* Header */}
      <div className="sa-page-header">
        <div>
          <span className="sa-brand-tag">QUOTA UTILIZATION</span>
          <h1 className="sa-page-title">
            Admin Seat <span>Usage Breakdown</span>
          </h1>
        </div>
        <div>
          <button type="button" className="sa-btn-outline" onClick={fetchSeatUsage}>
            <FaSync /> Refresh
          </button>
        </div>
      </div>

      {/* Aggregate Stats */}


      {/* Breakdown Table */}
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
                  <th>Plan Tier</th>
                  <th>Seats Used / Quota</th>
                  <th>Utilization</th>
                  <th>Account Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => {
                  const isItemUnlimited = item.isUnlimited || (item.assignedSeats || 0) >= 999999;
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
                      </td>
                      <td>
                        <strong>{item.usedSeats}</strong> /{" "}
                        {isItemUnlimited ? (
                          <span
                            className="badge bg-light text-primary d-inline-flex align-items-center gap-1"
                            style={{ border: "1px solid #cbd5e1", fontSize: "12px", verticalAlign: "middle" }}
                          >
                            <FaInfinity /> Unlimited
                          </span>
                        ) : (
                          `${item.assignedSeats} seats`
                        )}
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          {item.activeAdmins} active • {item.inactiveAdmins} inactive (released)
                        </div>
                      </td>
                      <td style={{ width: "220px" }}>
                        {isItemUnlimited ? (
                          <div>
                            <div className="progress" style={{ height: "8px", marginBottom: "4px" }}>
                              <div
                                className="progress-bar bg-success"
                                role="progressbar"
                                style={{ width: "100%" }}
                              />
                            </div>
                            <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: "600" }}>
                              Unlimited Quota
                            </span>
                          </div>
                        ) : (
                          <div>
                            <div className="progress" style={{ height: "8px", marginBottom: "4px" }}>
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
