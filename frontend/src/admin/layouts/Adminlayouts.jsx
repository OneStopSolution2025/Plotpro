import { useState } from "react";
import { Outlet } from "react-router-dom";

import AdminSidebar from "../components/Adminsidebar";
import AdminHeader from "../components/AdminHeader";
import { useAuth } from "../../context/AuthContext";
import { useAdminProfile } from "../context/AdminProfileContext";

import "../styles/admin-layout.css";

const AdminLayout = ({ navGroups, user, profilePath }) => {
  const { user: authUser, role } = useAuth();
  const { isSubscriptionExpired } = useAdminProfile();
  const currentUser = user || authUser;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = () => {
    setSidebarOpen(true);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="admin-layout">

      {/* Sidebar */}
      <AdminSidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        navGroups={navGroups}
      />

      {/* Main */}
      <div className="admin-main">

        {/* Header */}
        <AdminHeader
          onMenuClick={openSidebar}
          user={currentUser}
          profilePath={profilePath}
        />

        {/* Workspace Subscription Expired Banner (Staff Admin restricted mode) */}
        {role === "ADMIN" && isSubscriptionExpired && (
          <div
            style={{
              backgroundColor: "#fffbeb",
              borderBottom: "1px solid #fde68a",
              color: "#92400e",
              padding: "12px 24px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "13px",
              fontWeight: 500,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <span
              style={{
                backgroundColor: "#fef3c7",
                color: "#b45309",
                padding: "3px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                border: "1px solid #fcd34d",
              }}
            >
              Subscription Expired
            </span>
            <span>
              Your organization's workspace subscription has expired. Creating/updating projects, modifying plots, and direct customer contact (Phone, Email, WhatsApp) are restricted. Please contact your Super Administrator.
            </span>
          </div>
        )}

        {/* Page Content */}
        <main className="admin-content">
          <Outlet />
        </main>

      </div>

    </div>
  );
};

export default AdminLayout;