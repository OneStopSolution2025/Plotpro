import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import "../styles/super-admin.css";

import SuperAdminStats from "../components/super-admin/SuperAdminStats";
import SuperAdminAnalytics from "../components/super-admin/SuperAdminAnalytics";
import SuperAdminReports from "../components/super-admin/SuperAdminReports";

import { useAdmins } from "../context/AdminContext";
import { useProjects } from "../../context/ProjectContext";
import { usePlots } from "../../context/PlotContext";
import { buildAdminPerformance } from "../data/superAdminSelectors";
import { superAdminHeader } from "../data/superAdminMockData";
import { formatCurrentDate } from "../../utils/dateUtils";
import { FaExclamationTriangle, FaShieldAlt, FaPlus, FaUserPlus, FaRocket } from "react-icons/fa";

const SuperAdminDashboard = () => {
  const { admins, subscriptionInfo } = useAdmins();
  const { projects } = useProjects();
  const { plots } = usePlots();
  const navigate = useNavigate();

  const allocatedSeats = subscriptionInfo?.assignedSeats ?? 0;
  const isBranchFeatureEnabled = allocatedSeats > 0;

  const adminPerformance = useMemo(
    () => buildAdminPerformance(admins, projects, plots),
    [admins, projects, plots]
  );

  const totalAdmins = admins.length;
  const activeAdmins = admins.filter((a) => a.status === "Active").length;
  const totalProjects = projects.length;
  const pendingProjects = projects.filter((p) => p.approvalStatus === "PENDING" || p.hasPendingUpdates);

  const stats = [
    {
      id: "total-admins",
      title: "Total Admins",
      value: String(totalAdmins),
      subtitle: `${activeAdmins} active`,
      tone: "blue",
      icon: "users",
    },
    {
      id: "active-admins",
      title: "Active Admins",
      value: String(activeAdmins),
      subtitle: "Currently active",
      tone: "green",
      icon: "userCheck",
    },
    {
      id: "pending-approvals",
      title: "Pending Approvals",
      value: String(pendingProjects.length),
      subtitle: pendingProjects.length === 0 ? "All caught up" : "Click to review",
      tone: pendingProjects.length === 0 ? "blue" : "orange",
      icon: "fileText",
      onClick: () => navigate("/super-admin/approvals"),
    },
    {
      id: "total-projects",
      title: "Total Projects",
      value: String(totalProjects),
      subtitle: `${pendingProjects.length} pending review`,
      tone: "blue",
      icon: "building",
      onClick: () => navigate("/super-admin/branches"),
    },
  ];

  return (
    <div className="dashboard-page sa-page">
      {/* =====================================================
          HEADER
      ===================================================== */}
      <section className="dashboard-welcome">
        <div className="dashboard-welcome-text">
          <span className="dashboard-kicker">{superAdminHeader.kicker}</span>

          <h1>
            {superAdminHeader.greeting}
            <span>{superAdminHeader.greetingAccent}</span>
          </h1>

          <p>{superAdminHeader.description}</p>
        </div>

        <div className="dashboard-date">
          <span>{superAdminHeader.dateLabel}</span>
          <strong>{formatCurrentDate({ style: "long" })}</strong>
        </div>
      </section>

      {/* =====================================================
          SUBSCRIPTION EXPIRED / WARNING BANNER
      ===================================================== */}
      {subscriptionInfo && subscriptionInfo.isExpired && (
        <div
          style={{
            backgroundColor: "#fef2f2",
            border: "1px solid #f87171",
            borderRadius: "10px",
            padding: "16px 20px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            boxShadow: "0 4px 6px -1px rgba(220, 38, 38, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                backgroundColor: "#fee2e2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#dc2626",
                fontSize: "20px",
                flexShrink: 0,
              }}
            >
              <FaExclamationTriangle />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "15px", color: "#991b1b" }}>
                Subscription Plan Expired (Read-Only Mode)
              </div>
              <div style={{ fontSize: "13px", color: "#7f1d1d", marginTop: "2px" }}>
                Your business subscription expired on{" "}
                <strong>
                  {subscriptionInfo.expiryDate
                    ? new Date(subscriptionInfo.expiryDate).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "recently"}
                </strong>
                . Creating new projects, activating branch administrator accounts, and operational modifications are temporarily paused until renewal.
              </div>
            </div>
          </div>

          <div style={{ flexShrink: 0 }}>
            <span
              className="badge bg-danger"
              style={{ fontSize: "12px", padding: "8px 14px", textTransform: "uppercase" }}
            >
              Renewal Required
            </span>
          </div>
        </div>
      )}


      {/* =====================================================
          NEW WORKSPACE ONBOARDING BANNER (Zero State)
      ===================================================== */}
      {totalAdmins === 0 && projects.length === 0 && (
        <div
          style={{
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px 28px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "20px",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px", maxWidth: "680px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                backgroundColor: "#fee2e2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#a63d2f",
                fontSize: "22px",
                flexShrink: 0,
              }}
            >
              <FaRocket />
            </div>
            <div>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: "700", color: "#1e293b" }}>
                Welcome to your PlotPro Workspace!
              </h3>
              <p style={{ margin: 0, fontSize: "14px", color: "#64748b", lineHeight: "1.5" }}>
                {isBranchFeatureEnabled
                  ? "Your business tenant workspace is configured and ready. You can now launch your first real estate project or invite branch administrators to start managing your plot portfolio."
                  : "Your business tenant workspace is configured and ready. You can now launch your first real estate project and manage your plot portfolio."}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="sa-btn-primary"
              onClick={() => navigate("/super-admin/projects/new")}
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 18px", fontSize: "13px" }}
            >
              <FaPlus /> Create First Project
            </button>
            {isBranchFeatureEnabled && (
              <button
                type="button"
                className="sa-btn-outline"
                onClick={() => navigate("/super-admin/branches")}
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 18px", fontSize: "13px" }}
              >
                <FaUserPlus /> Create Branch & Admin
              </button>
            )}
          </div>
        </div>
      )}

      {/* =====================================================
          ADMIN SUMMARY
      ===================================================== */}
      <SuperAdminStats stats={stats} />

      {/* =====================================================
          ADMIN PERFORMANCE & RESPONSIBILITY REPORT
      ===================================================== */}

      {/* =====================================================
          ADMIN-WISE ANALYTICS
      ===================================================== */}
      <SuperAdminAnalytics rows={adminPerformance} />

      {/* =====================================================
          ADMIN REPORTS & ANALYTICS
      ===================================================== */}
      <SuperAdminReports
        projects={projects}
        plots={plots}
        admins={admins}
      />
    </div>
  );
};

export default SuperAdminDashboard;