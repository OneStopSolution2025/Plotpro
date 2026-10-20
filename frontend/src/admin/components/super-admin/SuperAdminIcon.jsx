import {
  FaArrowRight,
  FaBuilding,
  FaCalendarCheck,
  FaChartLine,
  FaCheckCircle,
  FaClock,
  FaCog,
  FaEdit,
  FaEnvelope,
  FaIdCard,
  FaPlus,
  FaThLarge,
  FaUserPlus,
  FaUsers,
  FaUserCheck,
} from "react-icons/fa";

/* =========================================================
   SUPER ADMIN ICON
   ---------------------------------------------------------
   Single component so the mock data can reference icons by
   string key and stay free of JSX. Exported as one component
   only, which keeps react-refresh/only-export-components happy.
   ========================================================= */

const ICONS = {
  users: FaUsers,
  userPlus: FaUserPlus,
  building: FaBuilding,
  envelope: FaEnvelope,
  idCard: FaIdCard,
  chart: FaChartLine,
  clock: FaClock,
  cog: FaCog,
  calendar: FaCalendarCheck,
  grid: FaThLarge,
  edit: FaEdit,
  plus: FaPlus,
  arrow: FaArrowRight,
  userCheck: FaUserCheck,
  checkCircle: FaCheckCircle,
};

const SuperAdminIcon = ({ name, className }) => {
  const Icon = ICONS[name] ?? FaBuilding;
  return <Icon className={className} aria-hidden="true" />;
};

export default SuperAdminIcon;
