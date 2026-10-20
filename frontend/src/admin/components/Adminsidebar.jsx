import { NavLink, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import '../styles/Adminsidebar.css'
import '../styles/admingeneral.css'
import plotproLogo from "../../assets/Logo/plotpro-logo12.png";

import {
  FaHome,
  FaMapMarkedAlt,
  FaSignOutAlt,
  FaClipboardList,
  FaCalendarCheck,
  FaUsers,
  FaThLarge,
  FaUserShield,
  FaChartLine,
  FaHistory,
  FaCog,
  FaCheckCircle,
  FaProjectDiagram,
  FaUserCheck,
  FaCreditCard,
} from "react-icons/fa";

/* Nav items reference icons by key so the nav config can live in
   a plain .js data file without JSX. */
const ICONS = {
  home: FaHome,
  map: FaMapMarkedAlt,
  clipboard: FaClipboardList,
  calendar: FaCalendarCheck,
  users: FaUsers,
  grid: FaThLarge,
  shield: FaUserShield,
  chart: FaChartLine,
  history: FaHistory,
  cog: FaCog,
  approvals: FaCheckCircle,
  assignments: FaProjectDiagram,
  userCheck: FaUserCheck,
  creditCard: FaCreditCard,
};

/* Default keeps the original Admin menu exactly as it was. */
const DEFAULT_NAV_GROUPS = [
  {
    title: "MAIN MENU",
    items: [
      {
        label: "Dashboard",
        icon: "home",
        path: "/admin",
        end: true,
      },
      {
        label: "Projects",
        icon: "map",
        path: "/admin/projects",
      },
      {
        label: "Enquiries",
        icon: "clipboard",
        path: "/admin/enquiries",
      },
      {
        label: "Site Visits",
        icon: "calendar",
        path: "/admin/site-visits",
      },
      {
        label: "Customers",
        icon: "users",
        path: "/admin/customers",
      },
    ],
  },
];

const AdminSidebar = ({ isOpen, onClose, navGroups }) => {
  const groups = navGroups ?? DEFAULT_NAV_GROUPS;
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    if (onClose) onClose();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="admin-sidebar-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`admin-sidebar ${isOpen ? "sidebar-open" : ""
          }`}
      >

        {/* =========================
            BRAND
        ========================= */}
        <div className="admin-sidebar-logo">
          <Link to="/" className="admin-brand-link" title="DreamCity Home">
            <img
              src={plotproLogo}
              alt="PlotPro Logo"
              className="admin-sidebar-brand-img"
            />
          </Link>
        </div>


        {/* =========================
            NAVIGATION SECTIONS
        ========================= */}
        {groups.map((group) => (
          <div
            className="admin-nav-section"
            key={group.title}
          >

            <p className="admin-nav-title">
              {group.title}
            </p>

            <nav className="admin-nav">

              {group.items.map((item) => {
                const Icon = ICONS[item.icon] ?? FaHome;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    className={({ isActive }) =>
                      `admin-nav-link ${isActive ? "active" : ""
                      }`
                    }
                    onClick={onClose}
                  >
                    <span className="admin-nav-icon">
                      <Icon />
                    </span>

                    <span className="admin-nav-label">
                      {item.label}
                    </span>
                  </NavLink>
                );
              })}

            </nav>
          </div>
        ))}


        {/* =========================
            SIDEBAR BOTTOM
        ========================= */}
        <div className="admin-sidebar-bottom">


          {/* Logout */}
          <button
            type="button"
            className="admin-logout-btn"
            onClick={handleLogout}
          >
            <FaSignOutAlt />

            <span>
              Logout
            </span>
          </button>

        </div>

      </aside>
    </>
  );
};

export default AdminSidebar;