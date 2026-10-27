import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supremeAdminApi } from "../../../services/api";
import {
  FaUsers,
  FaCalendarCheck,
  FaExclamationTriangle,
  FaBuilding,
  FaUserShield,
  FaComments,
  FaChair,
  FaArrowRight,
  FaSync,
  FaInfinity,
  FaClock,
} from "react-icons/fa";
import "../../styles/super-admin.css";

const SupremeOverview = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverview = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await supremeAdminApi.getOverview();
      if (res?.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error("[SupremeOverview] Fetch error:", err);
      if (!isSilent) {
        setError(err.message || "Failed to load platform overview metrics.");
      }
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchOverview(false);

    // Auto-sync Supreme Admin platform metrics every 10 seconds
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchOverview(true);
      }
    }, 10000);

    const handleFocus = () => fetchOverview(true);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [fetchOverview]);

  if (loading) {
    return (
      <div className="dashboard-page sa-page">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading platform data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page sa-page">
        <div className="alert alert-danger" role="alert" style={{ margin: "20px" }}>
          <FaExclamationTriangle style={{ marginRight: "8px" }} />
          {error}
          <button className="btn btn-sm btn-outline-danger ms-3" onClick={fetchOverview}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { subscribers, subscriptions, admins, platform, renewalsList, retailerRequests } = data || {};

  return (
    <div className="dashboard-page sa-page">
      {/* Header */}
      <div className="sa-page-header">
        <div>
          <span className="sa-brand-tag">PLATFORM OWNER CONTROL CENTER</span>
          <h1 className="sa-page-title">
            PlotPro <span>Platform Overview</span>
          </h1>
          <p className="sa-page-subtitle">
            Live aggregated metrics across all tenant subscribers, subscription plans, and platform assets.
          </p>
        </div>
        <div>
          <button
            type="button"
            className="sa-btn-outline"
            onClick={fetchOverview}
          >
            <FaSync /> Refresh Metrics
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="dashboard-stats">
        {/* Subscribers */}
        <div className="dashboard-stat-card">
          <div className="stat-icon" style={{ background: "#fbf0ec", color: "#a63d2f" }}>
            <FaBuilding />
          </div>
          <div className="stat-content">
            <span className="stat-title">Subscribers</span>
            <h2>{subscribers?.total || 0}</h2>
            <p>
              {subscribers?.active || 0} Active • {subscribers?.suspended || 0} Suspended
            </p>
          </div>
        </div>

        {/* Active Subscriptions */}
        <div className="dashboard-stat-card">
          <div className="stat-icon" style={{ background: "#fbf0ec", color: "#a63d2f" }}>
            <FaCalendarCheck />
          </div>
          <div className="stat-content">
            <span className="stat-title">Active Subscriptions</span>
            <h2>{subscriptions?.active || 0}</h2>
            <p>
              {subscriptions?.trial || 0} Trial • {subscriptions?.expired || 0} Expired
            </p>
          </div>
        </div>

        {/* Retailer Approval Requests */}
        <Link to="/supreme-admin/retailer-requests" style={{ textDecoration: "none" }}>
          <div
            className="dashboard-stat-card"
            style={{
              cursor: "pointer",
              borderLeft: "3px solid " + ((retailerRequests?.pending || 0) > 0 ? "#d97706" : "transparent"),
            }}
          >
            <div className="stat-icon" style={{ background: "#fff4e5", color: "#b45309" }}>
              <FaClock />
            </div>
            <div className="stat-content">
              <span className="stat-title">Pending Approvals</span>
              <h2>{retailerRequests?.pending ?? 0}</h2>
              <p>Retailer accounts awaiting review</p>
            </div>
          </div>
        </Link>

        {/* Staff Admins */}
        <div className="dashboard-stat-card">
          <div className="stat-icon" style={{ background: "#fbf0ec", color: "#a63d2f" }}>
            <FaUserShield />
          </div>
          <div className="stat-content">
            <span className="stat-title">Total Staff Admins (Branch Admins)</span>
            <h2>{admins?.total || 0}</h2>
            <p>
              {admins?.active || 0} Active Agents
            </p>
          </div>
        </div>

        {/* Admin Seat Utilization */}

      </div>

      {/* Two Column Split */}
      <div className="sa-overview-grid">
        {/* Renewals Due Soon */}
        <div className="sa-card">
          <div className="sa-card-header">
            <h3>Renewals Due Soon ({renewalsList?.length || 0})</h3>
            <Link to="/supreme-admin/subscriptions" className="sa-link-action">
              View All <FaArrowRight style={{ fontSize: "11px" }} />
            </Link>
          </div>

          <div className="sa-card-body" style={{ padding: (!renewalsList || renewalsList.length === 0) ? "30px" : "0" }}>
            {(!renewalsList || renewalsList.length === 0) ? (
              <div style={{ textAlign: "center", color: "#64748b" }}>
                <FaCalendarCheck style={{ fontSize: "32px", color: "#cbd5e1", marginBottom: "8px" }} />
                <p style={{ margin: 0, fontSize: "14px" }}>No subscriptions due for renewal within the next 7 days.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: "13px" }}>
                  <thead style={{ background: "#f8fafc" }}>
                    <tr style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase" }}>
                      <th style={{ padding: "12px 18px" }}>Subscriber</th>
                      <th>Plan</th>
                      <th>Expires</th>
                      <th style={{ paddingRight: "18px" }}>Seats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renewalsList.map((item) => (
                      <tr key={item._id}>
                        <td style={{ padding: "12px 18px" }}>
                          <strong>{item.subscriberId?.name || "Subscriber"}</strong>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>{item.subscriberId?.email}</div>
                        </td>
                        <td>
                          <span className="badge-brand" style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "11px" }}>
                            {item.planId?.name || "Plan"}
                          </span>
                        </td>
                        <td style={{ color: "#dc2626", fontWeight: 600 }}>
                          {new Date(item.expiryDate).toLocaleDateString()}
                        </td>
                        <td style={{ paddingRight: "18px" }}>{item.assignedSeats}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupremeOverview;
