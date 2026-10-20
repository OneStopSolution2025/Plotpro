import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaBars,
  FaBell,
  FaChevronDown,
  FaUser,
  FaBan,
  FaUserCheck,
  FaBuilding,
  FaUserEdit,
  FaInfoCircle,
  FaTrashAlt,
  FaCheckCircle,
  FaPlusCircle,
  FaEdit,
  FaThLarge,
  FaBolt,
} from "react-icons/fa";

import { useAdminProfile } from "../context/AdminProfileContext";
import { useNotifications } from "../context/NotificationContext";
import { useAuth } from "../../context/AuthContext";
import { useAdmins } from "../context/AdminContext";

import "../styles/Adminsidebar.css";

const AdminHeader = ({ onMenuClick, user, profilePath = "/admin/profile" }) => {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { subscriptionInfo } = useAdmins();

  // Single source of truth for the signed-in admin.
  const { profile: contextProfile } = useAdminProfile();
  const rawProfile = user || authUser || contextProfile;

  const profile = useMemo(() => {
    if (!rawProfile) return { name: "Admin", role: "Administrator", avatar: "" };

    let displayRole = "Administrator";
    if (
      rawProfile.role === "SUPREME_ADMIN" ||
      rawProfile.role === "Supreme Administrator" ||
      profilePath?.startsWith("/supreme-admin")
    ) {
      displayRole = "Supreme Administrator";
    } else if (
      rawProfile.role === "SUPER_ADMIN" ||
      rawProfile.role === "Super Administrator" ||
      profilePath?.startsWith("/super-admin")
    ) {
      displayRole = "Super Administrator";
    }

    return {
      ...rawProfile,
      id: rawProfile._id || rawProfile.id,
      name: rawProfile.name || "Admin",
      email: rawProfile.email || "",
      role: displayRole,
      avatar: rawProfile.avatar || "",
    };
  }, [rawProfile, profilePath]);

  const isSupremeAdmin =
    profile?.role === "Supreme Administrator" ||
    profilePath?.startsWith("/supreme-admin");

  const isSuperAdmin =
    !isSupremeAdmin &&
    (profile?.role === "Super Administrator" ||
      profilePath?.startsWith("/super-admin"));

  // Notifications context
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications } =
    useNotifications();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const openProfile = () => {
    navigate(profilePath);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  // Actual unread count for the logged-in user
  const effectiveUnreadCount =
    typeof unreadCount === "number"
      ? unreadCount
      : notifications.filter((n) => !n.read).length;

  const handleNotificationClick = (notif) => {
    // 1. Mark as read
    if (!notif.read) {
      markAsRead(notif.id);
    }

    // 2. Close the notification dropdown
    setDropdownOpen(false);

    // 3. Navigate to relevant action/page based on notification type and recipient role
    const type = notif.type;
    const projectId = notif.projectId || notif.metadata?.projectId;

    if (isSuperAdmin) {
      switch (type) {
        case "PROJECT_CREATED":
        case "PROJECT_DELETE_REQUESTED":
          navigate("/super-admin/approvals");
          break;
        case "PROJECT_APPROVED":
        case "PROJECT_REJECTED":
        case "PROJECT_DELETED":
        case "PROJECT_ASSIGNED":
        case "PROJECT_UNASSIGNED":
          navigate("/super-admin/assignments");
          break;
        case "PLOT_SOLD":
        case "PLOT_UPDATED":
          if (projectId) {
            navigate(`/admin/projects/${projectId}/plots`);
          } else {
            navigate("/super-admin");
          }
          break;
        case "ADMIN_STATUS_CHANGED":
        case "ADMIN_UPDATED":
        case "ADMIN_WELCOME":
          navigate("/super-admin/admins");
          break;
        default:
          navigate("/super-admin/approvals");
          break;
      }
    } else {
      // Normal Admin
      switch (type) {
        case "PROJECT_CREATED":
        case "PROJECT_APPROVED":
        case "PROJECT_REJECTED":
        case "PROJECT_DELETE_REQUESTED":
        case "PROJECT_DELETED":
          navigate("/admin/projects");
          break;
        case "PROJECT_ASSIGNED":
        case "PROJECT_UNASSIGNED":
        case "PLOT_SOLD":
        case "PLOT_UPDATED":
          if (projectId) {
            navigate(`/admin/projects/${projectId}/plots`);
          } else {
            navigate("/admin/projects");
          }
          break;
        case "ADMIN_STATUS_CHANGED":
        case "ADMIN_UPDATED":
        case "ADMIN_WELCOME":
        case "PROFILE_UPDATED":
        case "DEACTIVATED":
        case "ACTIVATED":
          navigate("/admin/profile");
          break;
        default:
          navigate("/admin/projects");
          break;
      }
    }
  };

  const myNotifications = notifications;
  const displayedNotifications = notifications;

  const formatNotificationDate = (isoString) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "DEACTIVATED":
        return <FaBan />;
      case "ACTIVATED":
        return <FaUserCheck />;
      case "PROJECT_ASSIGNED":
      case "PROJECT_UNASSIGNED":
        return <FaBuilding />;
      case "PROFILE_UPDATED":
        return <FaUserEdit />;
      case "PROJECT_CREATED":
        return <FaPlusCircle />;
      case "PROJECT_UPDATED":
        return <FaEdit />;
      case "PROJECT_DELETED":
        return <FaTrashAlt />;
      case "PLOT_UPDATED":
        return <FaThLarge />;
      default:
        return <FaInfoCircle />;
    }
  };

  const getNotificationIconClass = (type) => {
    switch (type) {
      case "DEACTIVATED":
        return "deactivated";
      case "ACTIVATED":
        return "activated";
      case "PROJECT_ASSIGNED":
        return "project_assigned";
      case "PROJECT_UNASSIGNED":
        return "project_unassigned";
      case "PROFILE_UPDATED":
        return "profile_updated";
      case "PROJECT_CREATED":
        return "project_created";
      case "PROJECT_UPDATED":
        return "project_updated";
      case "PROJECT_DELETED":
        return "project_deleted";
      case "PLOT_UPDATED":
        return "plot_updated";
      default:
        return "info";
    }
  };

  return (
    <header className="admin-header">
      {/* Mobile Menu */}
      <button
        type="button"
        className="admin-mobile-menu"
        onClick={onMenuClick}
        aria-label="Open admin menu"
      >
        <FaBars />
      </button>

      <div className="admin-header-right">
        {isSuperAdmin && (subscriptionInfo?.status === "TRIAL" || subscriptionInfo?.isTrial) && (
          <div
            onClick={() => navigate("/super-admin/subscription")}
            title="Your workspace is currently operating on a Trial Plan. Click to view subscription details."
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
              border: "1px solid #fed7aa",
              color: "#c2410c",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(194, 65, 12, 0.12)",
              transition: "all 0.2s ease",
              userSelect: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 3px 6px rgba(194, 65, 12, 0.18)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 1px 3px rgba(194, 65, 12, 0.12)";
            }}
          >
            <FaBolt style={{ color: "#ea580c", fontSize: "11px" }} />
            <span>Trial Version</span>
            {typeof subscriptionInfo?.remainingDays === "number" && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#9a3412",
                  backgroundColor: "rgba(255, 255, 255, 0.7)",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  marginLeft: "2px",
                }}
              >
                {subscriptionInfo.remainingDays}d left
              </span>
            )}
          </div>
        )}

        {/* Notification Bell with Dropdown */}
        <div className="admin-header-notification-wrapper" ref={dropdownRef}>
          <button
            type="button"
            className={`admin-header-icon ${dropdownOpen ? "active" : ""}`}
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-label={`Notifications (${effectiveUnreadCount} unread)`}
            title={
              effectiveUnreadCount > 0
                ? isSuperAdmin
                  ? `${effectiveUnreadCount} new alert(s)`
                  : `${effectiveUnreadCount} new notification(s)`
                : "Notifications"
            }
          >
            <FaBell />
            {effectiveUnreadCount > 0 && (
              <span
                className="notification-dot active"
                title={`${effectiveUnreadCount} unread notification(s)`}
              >
                {effectiveUnreadCount > 9 ? "9+" : effectiveUnreadCount}
              </span>
            )}
          </button>

          {/* Dropdown Panel */}
          {dropdownOpen && (
            <div
              className="admin-notification-dropdown"
              role="region"
              aria-label="Admin Notifications"
            >
              <div className="admin-notif-header">
                <div className="admin-notif-title-row">
                  <h4>Notifications</h4>
                  {effectiveUnreadCount > 0 && (
                    <span className="admin-notif-badge">
                      {effectiveUnreadCount} New
                    </span>
                  )}
                </div>

                {displayedNotifications.some((n) => !n.read) && (
                  <button
                    type="button"
                    className="admin-notif-mark-read-btn"
                    onClick={() => markAllAsRead()}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* Context Bar */}
              <div className="admin-notif-context-bar">
                <span>
                  {isSuperAdmin ? "Role: " : "Admin: "}
                  <strong>{profile?.name || (isSuperAdmin ? "Super Admin" : "Admin")}</strong>
                </span>
                <span style={{ fontSize: "11px", color: "#64748b" }}>
                  {effectiveUnreadCount > 0
                    ? `${effectiveUnreadCount} unread`
                    : "All caught up"}
                </span>
              </div>

              {/* Notification List */}
              <ul className="admin-notif-list">
                {displayedNotifications.length === 0 ? (
                  <li className="admin-notif-empty">
                    <FaCheckCircle />
                    <h5>No notifications</h5>
                    <p>
                      {isSuperAdmin
                        ? "Projects created or plot changes made by normal admins will appear here."
                        : "Changes made by Super Admin to your account or projects will appear here."}
                    </p>
                  </li>
                ) : (
                  displayedNotifications.map((notif) => (
                    <li
                      key={notif.id}
                      className={`admin-notif-item ${!notif.read ? "unread" : ""}`}
                      onClick={() => handleNotificationClick(notif)}
                    >
                      <div
                        className={`admin-notif-icon ${getNotificationIconClass(
                          notif.type
                        )}`}
                      >
                        {getNotificationIcon(notif.type)}
                      </div>

                      <div className="admin-notif-content">
                        <div className="admin-notif-top">
                          <strong>{notif.title}</strong>
                          <span className="admin-notif-time">
                            {formatNotificationDate(notif.timestamp)}
                          </span>
                        </div>

                        <p className="admin-notif-msg">{notif.message}</p>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span className="admin-notif-tag">
                            {notif.recipient === "super_admin"
                              ? `By: ${notif.actorName || notif.adminName || "Normal Admin"}`
                              : `For: ${notif.adminName || "Admin"}`}
                          </span>
                          {!notif.read && (
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#a63d2f",
                                fontWeight: 700,
                              }}
                            >
                              • Unread
                            </span>
                          )}
                        </div>
                      </div>

                      {!notif.read && (
                        <div
                          className="admin-notif-unread-dot"
                          title="Unread"
                        />
                      )}
                    </li>
                  ))
                )}
              </ul>

              {/* Footer */}
              {displayedNotifications.length > 0 && (
                <div className="admin-notif-footer">
                  <button
                    type="button"
                    className="admin-notif-clear-btn"
                    onClick={() => clearNotifications()}
                  >
                    <FaTrashAlt />
                    Clear notifications
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="admin-header-divider" />

        {/* Profile */}
        <button
          type="button"
          className="admin-profile"
          onClick={openProfile}
          aria-label="Open admin profile"
          title="View profile"
        >
          <div className="admin-profile-avatar">
            {profile.avatar ? (
              <img
                src={profile.avatar}
                alt=""
                className="admin-profile-avatar-img"
              />
            ) : (
              <FaUser />
            )}
          </div>

          <div className="admin-profile-info">
            <strong>{profile.name}</strong>
            <span>{profile.role}</span>
          </div>

          <FaChevronDown className="admin-profile-arrow" />
        </button>
      </div>
    </header>
  );
};

export default AdminHeader;
