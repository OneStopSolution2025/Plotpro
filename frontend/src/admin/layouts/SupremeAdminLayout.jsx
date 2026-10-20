import AdminLayout from "./Adminlayouts";
import { useAuth } from "../../context/AuthContext";
import { supremeAdminNavGroups } from "../data/supremeAdminNav";

const SupremeAdminLayout = () => {
  const { user } = useAuth();

  const supremeProfile = {
    name: user?.name || "Supreme Admin",
    email: user?.email || "owner@plotpro.in",
    role: "Supreme Administrator",
    avatar: user?.avatar || "",
  };

  return (
    <AdminLayout
      navGroups={supremeAdminNavGroups}
      user={supremeProfile}
      profilePath="/supreme-admin/profile"
    />
  );
};

export default SupremeAdminLayout;
