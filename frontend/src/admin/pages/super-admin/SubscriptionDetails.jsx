import { useEffect, useState } from "react";
import {
  FaCreditCard,
  FaCalendarAlt,
  FaUsers,
  FaShieldAlt,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaSyncAlt,
  FaBuilding,
  FaInfinity,
  FaLayerGroup,
  FaEnvelope,
  FaPhoneAlt,
  FaUserCheck,
  FaPaperPlane,
} from "react-icons/fa";
import { superAdminApi } from "../../../services/api";
import { useAdmins } from "../../context/AdminContext";
import { useSuperAdminProfile } from "../../context/SuperAdminProfileContext";
import "../../styles/admingeneral.css";

const SubscriptionDetails = () => {
  const { subscriptionInfo, fetchSubscriptionInfo } = useAdmins();
  const { profile } = useSuperAdminProfile();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (fetchSubscriptionInfo) {
      fetchSubscriptionInfo();
    }
  }, [fetchSubscriptionInfo]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (fetchSubscriptionInfo) {
      await fetchSubscriptionInfo();
    }
    setTimeout(() => setRefreshing(false), 500);
  };

  const isUnlimited = (val) => typeof val === "number" && val >= 999999;

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return String(dateStr);
    }
  };

  const status = subscriptionInfo?.status || "ACTIVE";
  const isTrial = status === "TRIAL" || subscriptionInfo?.isTrial;
  const isExpired = subscriptionInfo?.isExpired;
  const remainingDays = typeof subscriptionInfo?.remainingDays === "number" ? subscriptionInfo.remainingDays : 0;
  const assignedSeats = subscriptionInfo?.assignedSeats ?? 3;
  const usedSeats = subscriptionInfo?.usedSeats ?? 0;
  const remainingSeats = subscriptionInfo?.remainingSeats ?? Math.max(0, assignedSeats - usedSeats);
  
  // Project creation quota
  const maxProjects = subscriptionInfo?.maxProjects ?? 3;
  const usedProjects = subscriptionInfo?.usedProjects ?? 0;
  const remainingProjects = subscriptionInfo?.remainingProjects ?? Math.max(0, maxProjects - usedProjects);
  const isUnlimitedProjects = Boolean(subscriptionInfo?.isUnlimitedProjects || maxProjects >= 999999);
  const percentProjectsUsed = isUnlimitedProjects
    ? 5
    : maxProjects > 0
    ? Math.min(100, Math.round((usedProjects / maxProjects) * 100))
    : 0;

  const planName = subscriptionInfo?.planName || (isTrial ? "Trial Workspace Plan" : "Standard Plan");

  // Calculate percentage used (if not unlimited)
  const percentUsed = isUnlimited(assignedSeats)
    ? 5
    : assignedSeats > 0
    ? Math.min(100, Math.round((usedSeats / assignedSeats) * 100))
    : 0;

  return (
    <div className="admin-page-container" style={{ padding: "28px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a", margin: "0 0 6px 0" }}>
            Workspace Subscription & Plan Quota
          </h1>
          <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
            Review your active plan entitlement, admin staff limits, remaining validity, and renewal status.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "9px 16px",
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            color: "#334155",
            cursor: refreshing ? "not-allowed" : "pointer",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            transition: "all 0.2s ease",
          }}
        >
          <FaSyncAlt className={refreshing ? "fa-spin" : ""} style={{ fontSize: "12px", color: "#64748b" }} />
          <span>Refresh Details</span>
        </button>
      </div>

      {/* Expiry Warning Alert (If <= 3 days left or expired) */}
      {isExpired ? (
        <div
          style={{
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "12px",
            padding: "16px 20px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            color: "#991b1b",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              backgroundColor: "#fee2e2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FaExclamationTriangle style={{ fontSize: "20px", color: "#dc2626" }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "2px" }}>
              Subscription Has Expired
            </div>
            <div style={{ fontSize: "13px", color: "#b91c1c", lineHeight: 1.5 }}>
              Your workspace plan reached its expiration date on <strong>{formatDate(subscriptionInfo?.expiryDate)}</strong>. Operational features and staff logins are currently suspended. Please contact the Supreme Administrator immediately to renew your subscription.
            </div>
          </div>
        </div>
      ) : remainingDays <= 3 ? (
        <div
          style={{
            backgroundColor: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "12px",
            padding: "16px 20px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            color: "#92400e",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              backgroundColor: "#fef3c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FaClock style={{ fontSize: "20px", color: "#d97706" }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "2px" }}>
              ⚠️ Renewal Due: Expiring in {remainingDays} {remainingDays === 1 ? "day" : "days"}!
            </div>
            <div style={{ fontSize: "13px", color: "#b45309", lineHeight: 1.5 }}>
              Your {isTrial ? "Trial period" : "Subscription"} expires on <strong>{formatDate(subscriptionInfo?.expiryDate)}</strong>. To avoid disruption to your administrative operations, please initiate renewal with the Platform Owner.
            </div>
          </div>
        </div>
      ) : null}

      {/* Main Grid: Plan Hero & Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "24px" }}>
        {/* Card 1: Active Plan Details */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            padding: "24px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b" }}>
                Active Plan
              </span>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  backgroundColor: isExpired
                    ? "#fee2e2"
                    : isTrial
                    ? "#ffedd5"
                    : "#dcfce7",
                  color: isExpired
                    ? "#dc2626"
                    : isTrial
                    ? "#c2410c"
                    : "#15803d",
                  border: `1px solid ${
                    isExpired ? "#fecaca" : isTrial ? "#fed7aa" : "#bbf7d0"
                  }`,
                }}
              >
                {isExpired ? "EXPIRED" : isTrial ? "⚡ TRIAL" : "ACTIVE"}
              </span>
            </div>

            <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>
              {planName}
            </div>

            <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px 0", lineHeight: 1.4 }}>
              {isTrial
                ? "Full-featured evaluation workspace granted for evaluation purposes."
                : "Active commercial subscription with verified quota and dedicated support."}
            </p>
          </div>

          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Billing Status</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
              {isTrial ? "Trial Evaluation" : "Paid Subscription"}
            </span>
          </div>
        </div>

        {/* Card 2: Validity & Countdown */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            padding: "24px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b" }}>
                Validity & Expiry
              </span>
              <FaCalendarAlt style={{ color: "#a63d2f", fontSize: "16px" }} />
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontSize: "32px", fontWeight: 800, color: remainingDays <= 3 ? "#dc2626" : "#0f172a" }}>
                {isExpired ? "0" : remainingDays}
              </span>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#64748b" }}>
                Days Remaining
              </span>
            </div>

            <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
              Valid until: <strong style={{ color: "#1e293b" }}>{formatDate(subscriptionInfo?.expiryDate)}</strong>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Activation Date</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
              {formatDate(subscriptionInfo?.startDate)}
            </span>
          </div>
        </div>

        {/* Card 3: Admin Staff Quota */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            padding: "24px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b" }}>
                Branch Admin Seats Quota
              </span>
              <FaUsers style={{ color: "#2563eb", fontSize: "16px" }} />
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
              <span style={{ fontSize: "32px", fontWeight: 800, color: "#0f172a" }}>
                {usedSeats}
              </span>
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "#f1f5f9",
                borderRadius: "4px",
                overflow: "hidden",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  width: `${percentUsed}%`,
                  height: "100%",
                  backgroundColor: percentUsed >= 90 ? "#ef4444" : "#a63d2f",
                  borderRadius: "4px",
                  transition: "width 0.4s ease",
                }}
              />
            </div>

            <div style={{ fontSize: "12px", color: "#64748b" }}>
              {isUnlimited(assignedSeats) ?(
                <span style={{ color: "#2563eb", fontWeight: 600 }}>{remainingSeats} seats available to create.</span>
              ) : (
                <span style={{ color: "#dc2626", fontWeight: 600 }}>Seat limit reached.</span>
              )}
            </div>
          </div>

          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Seat Allocation Mode</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
              {subscriptionInfo?.isCustomOverride ? "Custom Override" : "Plan Standard"}
            </span>
          </div>
        </div>

        {/* Card 4: Project Creation Quota */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            padding: "24px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b" }}>
                Project Creation Quota
              </span>
              <FaLayerGroup style={{ color: "#059669", fontSize: "16px" }} />
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
              <span style={{ fontSize: "32px", fontWeight: 800, color: "#0f172a" }}>
                {usedProjects}
              </span>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#64748b" }}>
                / {isUnlimitedProjects ? "∞" : maxProjects} Projects Used
              </span>
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "#f1f5f9",
                borderRadius: "4px",
                overflow: "hidden",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  width: `${percentProjectsUsed}%`,
                  height: "100%",
                  backgroundColor: percentProjectsUsed >= 90 ? "#ef4444" : "#059669",
                  borderRadius: "4px",
                  transition: "width 0.4s ease",
                }}
              />
            </div>

            <div style={{ fontSize: "12px", color: "#64748b" }}>
              {isUnlimitedProjects ? (
                <span style={{ color: "#059669", fontWeight: 600 }}>Unlimited project creation enabled.</span>
              ) : remainingProjects > 0 ? (
                <span style={{ color: "#059669", fontWeight: 600 }}>{remainingProjects} projects available to create.</span>
              ) : (
                <span style={{ color: "#dc2626", fontWeight: 600 }}>Project creation limit reached.</span>
              )}
            </div>
          </div>

          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Project Quota Policy</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
              {isUnlimitedProjects ? "Unlimited" : `${maxProjects} Projects Max`}
            </span>
          </div>
        </div>
      </div>

      {/* Workspace & Renewal Contact Box */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "20px",
        }}
      >
        {/* Workspace Information */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            padding: "24px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
            <FaBuilding style={{ color: "#a63d2f", fontSize: "18px" }} />
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
              Workspace Account Details
            </h3>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f8fafc", paddingBottom: "8px" }}>
              <span style={{ color: "#64748b" }}>Subscriber / Business Name</span>
              <strong style={{ color: "#1e293b" }}>{profile?.name || "Dreamcity Subscriber"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f8fafc", paddingBottom: "8px" }}>
              <span style={{ color: "#64748b" }}>Registered Email</span>
              <strong style={{ color: "#1e293b" }}>{profile?.email || "N/A"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f8fafc", paddingBottom: "8px" }}>
              <span style={{ color: "#64748b" }}>Contact Phone</span>
              <strong style={{ color: "#1e293b" }}>{profile?.mobile || "N/A"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "4px" }}>
              <span style={{ color: "#64748b" }}>Role Designation</span>
              <strong style={{ color: "#a63d2f" }}>Super Administrator</strong>
            </div>
          </div>
        </div>

        {/* How to Renew / Plan Management */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            borderRadius: "16px",
            padding: "24px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <FaShieldAlt style={{ color: "#2563eb", fontSize: "18px" }} />
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Subscription Renewal & Support
              </h3>
            </div>

            <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: "0 0 16px 0" }}>
              {isTrial ? (
                <>
                  Your workspace is currently operating on a <strong>Trial Period</strong>. To convert your trial account into a permanent active subscription or increase branch seats, please contact the <strong>Supreme Administrator (Platform Owner)</strong>.
                </>
              ) : isExpired ? (
                <>
                  Your subscription package has <strong>Expired</strong>. To reactivate access and restore branch operations, please contact the <strong>Supreme Administrator (Platform Owner)</strong> to renew your plan.
                </>
              ) : (
                <>
                  Your workspace is currently <strong>Active</strong> under the <strong>{planName}</strong>. To renew your plan before term expiry or change your subscription package, please contact the <strong>Supreme Administrator (Platform Owner)</strong>.
                </>
              )}
            </p>

          </div>

          <div style={{ marginTop: "18px", fontSize: "12px", color: "#64748b" }}>
            Platform Managed by <strong>Plotpro Supreme Administration</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionDetails;
