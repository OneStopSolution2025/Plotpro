import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import MaintenancePage from "../Pages/MaintenancePage";

/**
 * Route wrapper for public client pages.
 * If the platform is in maintenance mode:
 * - Visitors who are not logged in as Admin, Super Admin, or Supreme Admin see the MaintenancePage.
 * - Platform Staff and Owners can bypass maintenance mode to browse and test the site.
 */
const PublicRoute = ({ children }) => {
  const { isMaintenanceMode, user, isLoading, platformSettings } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const isStaffOrOwner = user && ["SUPREME_ADMIN", "SUPER_ADMIN", "ADMIN"].includes(user.role);

  if (isMaintenanceMode && !isStaffOrOwner) {
    return (
      <MaintenancePage
        platformName={platformSettings?.platformName || "PlotPro"}
        supportEmail={platformSettings?.supportEmail || "support@plotpro.in"}
      />
    );
  }

  return children ? children : <Outlet />;
};

export default PublicRoute;
