import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Route guard component for role-based route protection
 * @param {string[]} allowedRoles - List of roles permitted to access this route
 */
const ProtectedRoute = ({ allowedRoles = [], children }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
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

  if (!isAuthenticated) {
    // Redirect unauthenticated visitors to login, preserving intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Role-specific bounce if unauthorized
    if (user.role === "SUPREME_ADMIN" && !allowedRoles.includes("SUPREME_ADMIN")) {
      return <Navigate to="/supreme-admin" replace />;
    }
    if (user.role === "SUPER_ADMIN" && !allowedRoles.includes("SUPER_ADMIN")) {
      return <Navigate to="/super-admin" replace />;
    }
    if (user.role === "ADMIN" && !allowedRoles.includes("ADMIN")) {
      return <Navigate to="/admin" replace />;
    }
    // Default fallback
    return <Navigate to="/" replace />;
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
