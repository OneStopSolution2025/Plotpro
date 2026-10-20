import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "./Adminlayouts";
import { useSuperAdminProfile } from "../context/SuperAdminProfileContext";
import { useAdmins } from "../context/AdminContext";
import { useAuth } from "../../context/AuthContext";
import { superAdminNavGroups } from "../data/superAdminNav";
import { FaExclamationTriangle, FaSignOutAlt, FaShieldAlt } from "react-icons/fa";

const SuperAdminLayout = () => {
  const navigate = useNavigate();
  const { profile } = useSuperAdminProfile();
  const { subscriptionInfo, fetchSubscriptionInfo } = useAdmins();
  const { logout } = useAuth();
  const [checking, setChecking] = useState(!subscriptionInfo);

  useEffect(() => {
    let isMounted = true;
    const checkSub = async () => {
      if (fetchSubscriptionInfo) {
        await fetchSubscriptionInfo();
      }
      if (isMounted) {
        setChecking(false);
      }
    };
    checkSub();
    return () => {
      isMounted = false;
    };
  }, [fetchSubscriptionInfo]);

  const isExpired = Boolean(subscriptionInfo && subscriptionInfo.isExpired);

  // Renewal Alert Modal (When remainingDays <= 3) — Hooks MUST be unconditional!
  const remainingDays = typeof subscriptionInfo?.remainingDays === "number" ? subscriptionInfo.remainingDays : null;
  const isExpiringSoon = !isExpired && remainingDays !== null && remainingDays <= 3;
  const subId = subscriptionInfo?.subscriptionId || "active_sub";

  const [showAlertModal, setShowAlertModal] = useState(() => {
    if (!isExpiringSoon) return false;
    const dismissed = sessionStorage.getItem(`renewal_alert_dismissed_${subId}`);
    return !dismissed;
  });

  useEffect(() => {
    if (isExpiringSoon) {
      const dismissed = sessionStorage.getItem(`renewal_alert_dismissed_${subId}`);
      if (!dismissed) {
        setShowAlertModal(true);
      }
    }
  }, [isExpiringSoon, subId]);

  const handleDismissAlert = () => {
    sessionStorage.setItem(`renewal_alert_dismissed_${subId}`, "true");
    setShowAlertModal(false);
  };

  const isTrial = subscriptionInfo?.status === "TRIAL" || subscriptionInfo?.isTrial;
  const formattedExpiry = subscriptionInfo?.expiryDate
    ? new Date(subscriptionInfo.expiryDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Soon";

  // If initial subscription check is in progress and we don't have subscriptionInfo yet, show loading spinner
  if (checking && !subscriptionInfo) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8fafc",
          color: "#64748b",
        }}
      >
        <div
          className="spinner-border text-primary"
          role="status"
          style={{ width: "3rem", height: "3rem", marginBottom: "16px", color: "#a63d2f" }}
        >
          <span className="visually-hidden">Loading...</span>
        </div>
        <p style={{ fontSize: "15px", fontWeight: 500 }}>Verifying workspace subscription...</p>
      </div>
    );
  }

  // If expired, DO NOT render the dashboard/outlet at all. Render strictly the blocking screen!
  if (isExpired) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#0f172a",
          backgroundImage: "radial-gradient(at top left, #1e293b 0%, #0f172a 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999999,
          padding: "20px",
        }}
      >
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            maxWidth: "520px",
            width: "100%",
            padding: "40px 36px",
            textAlign: "center",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.45)",
            border: "1px solid #fee2e2",
          }}
        >
          {/* Warning Icon Circle */}
          <div
            style={{
              width: "76px",
              height: "76px",
              borderRadius: "50%",
              backgroundColor: "#fee2e2",
              color: "#dc2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              fontSize: "36px",
            }}
          >
            <FaExclamationTriangle />
          </div>

          <span
            style={{
              display: "inline-block",
              padding: "4px 14px",
              borderRadius: "20px",
              backgroundColor: "#fef2f2",
              color: "#991b1b",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              marginBottom: "12px",
              border: "1px solid #fecaca",
            }}
          >
            Subscription Expired
          </span>

          <h2
            style={{
              fontSize: "22px",
              fontWeight: 800,
              color: "#0f172a",
              margin: "0 0 12px",
              lineHeight: 1.3,
            }}
          >
            Access Suspended — Renewal Required
          </h2>

          <p
            style={{
              fontSize: "14px",
              color: "#475569",
              lineHeight: 1.6,
              margin: "0 0 24px",
            }}
          >
            Your PlotPro business workspace subscription expired on{" "}
            <strong style={{ color: "#0f172a" }}>
              {subscriptionInfo?.expiryDate
                ? new Date(subscriptionInfo.expiryDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "recently"}
            </strong>
            . Access to projects, staff administrator dashboards, customer leads, and inventory management has been completely locked.
          </p>

          {/* Plan Info Card */}
          <div
            style={{
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              padding: "14px 18px",
              marginBottom: "24px",
              textAlign: "left",
              fontSize: "13px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "#64748b" }}>Current Plan:</span>
              <strong style={{ color: "#0f172a" }}>{subscriptionInfo?.planName || "Standard Plan"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "#64748b" }}>Allocated Seats:</span>
              <strong style={{ color: "#0f172a" }}>{subscriptionInfo?.assignedSeats || 0} Staff Admins</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Status:</span>
              <span className="badge bg-danger" style={{ fontSize: "11px", padding: "3px 8px" }}>
                EXPIRED
              </span>
            </div>
          </div>

          {/* Instruction Callout */}
          <div
            style={{
              backgroundColor: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "28px",
              fontSize: "13px",
              color: "#1e40af",
              lineHeight: 1.5,
              textAlign: "left",
            }}
          >
            Please contact the <strong>Supreme Administrator (Platform Owner)</strong> or your account manager to renew or upgrade your plan and restore operational access.
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button
              type="button"
              onClick={logout}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "12px 24px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#ffffff",
                color: "#334155",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                width: "100%",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <FaSignOutAlt />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AdminLayout
        navGroups={superAdminNavGroups}
        user={profile}
        profilePath="/super-admin/profile"
      />

      {/* Modern Centered Modal Dialog matching Announcement style */}
      {showAlertModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "20px",
          }}
          onClick={handleDismissAlert}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              maxWidth: "560px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #e2e8f0",
              position: "relative",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px 16px",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#0f172a",
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                Subscription Renewal Notice
              </h2>
              <button
                type="button"
                onClick={handleDismissAlert}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#ffffff",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: "16px",
                  transition: "all 0.2s ease",
                }}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "24px", color: "#334155", fontSize: "14px", lineHeight: 1.6 }}>
              {/* Tags / Pills row like the reference UI */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "18px", flexWrap: "wrap", alignItems: "center" }}>
                <span
                  style={{
                    backgroundColor: isTrial ? "#ffedd5" : "#fee2e2",
                    color: isTrial ? "#c2410c" : "#b91c1c",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {isTrial ? "Trial Workspace" : "Expiring Soon"}
                </span>

                <span
                  style={{
                    backgroundColor: "#fef3c7",
                    color: "#b45309",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "6px",
                  }}
                >
                  ⏳ {remainingDays} {remainingDays === 1 ? "Day" : "Days"} Left
                </span>

                <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "auto" }}>
                  Expiry: {formattedExpiry}
                </span>
              </div>

              {/* Title Header */}
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                ⚠️ Action Required: Your Account is Expiring Soon
              </h3>

              <p style={{ margin: "0 0 12px 0" }}>
                Dear <strong>{profile?.name || "Super Admin"}</strong>,
              </p>

              <p style={{ margin: "0 0 14px 0" }}>
                Your current {isTrial ? "Trial period" : "Subscription Plan"} for workspace <strong>{profile?.name || "Dreamcity"}</strong> will reach its expiration date in{" "}
                <span style={{ color: "#dc2626", fontWeight: 700 }}>
                  {remainingDays} {remainingDays === 1 ? "day" : "days"} (on {formattedExpiry})
                </span>.
              </p>

              <div
                style={{
                  backgroundColor: "#fff7ed",
                  border: "1px solid #ffedd5",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  marginBottom: "16px",
                  fontSize: "13px",
                  color: "#9a3412",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "4px" }}>Why should you renew now?</div>
                Once expired, administrator staff logins and property assignments will be suspended until renewal is confirmed by the Supreme Administrator.
              </div>

              <p style={{ margin: "0 0 16px 0" }}>
                Please reach out to the <strong>Supreme Administrator (Platform Owner)</strong> to extend your subscription, upgrade admin seats, or convert your trial account into an active commercial plan.
              </p>

              <div
                style={{
                  backgroundColor: "#f8fafc",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  fontSize: "12px",
                  color: "#64748b",
                  border: "1px solid #e2e8f0",
                }}
              >
                📅 <strong>Scheduled Expiry:</strong> {formattedExpiry} • <strong>Workspace:</strong> {profile?.name || "Super Admin"}
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid #f1f5f9",
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                backgroundColor: "#fafafa",
                borderRadius: "0 0 16px 16px",
              }}
            >
              <button
                type="button"
                onClick={handleDismissAlert}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#475569",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Remind Me Later
              </button>

              <button
                type="button"
                onClick={() => {
                  handleDismissAlert();
                  navigate("/super-admin/subscription");
                }}
                style={{
                  padding: "9px 20px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#a63d2f",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(166, 61, 47, 0.25)",
                }}
              >
                View Subscription Details
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SuperAdminLayout;

