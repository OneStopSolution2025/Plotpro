import { Routes, Route } from "react-router-dom";
import { ToastProvider } from "./context/ToastContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ProjectProvider } from "./context/ProjectContext.jsx";
import { PlotProvider } from "./context/PlotContext.jsx";
import { AdminProvider } from "./admin/context/AdminContext.jsx";
import { NotificationProvider } from "./admin/context/NotificationContext.jsx";
import { AdminProfileProvider } from "./admin/context/AdminProfileContext.jsx";
import { SuperAdminProfileProvider } from "./admin/context/SuperAdminProfileContext.jsx";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import PublicRoute from "./components/PublicRoute.jsx";

import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
import "./css/General.css";

import Home from "./Pages/Home";
import ProjectDetails from "./Pages/ProjectDetails";
import Projects from "./Pages/Projects";
import PlotDetails from "./Pages/PlotDetails";
import About from "./Pages/About";
import Signup from "./Pages/Signup";
import Login from "./Pages/Login";
import ForgotPassword from "./Pages/ForgotPassword";
import Contact from "./Pages/Contact.jsx";
import SiteVisitForm from "./Pages/SiteVisitForm";
import EnquiryForm from "./Pages/EnquiryForm";
import ProjectPlots from "./Pages/ProjectPlots.jsx";
import UserProfile from "./Pages/UserProfile.jsx";
import NotFound from "./Pages/NotFound.jsx";


import AdminLayout from "./admin/layouts/Adminlayouts.jsx";
import Dashboard from "./admin/pages/Dashboard.jsx";
import Projectsadmin from "./admin/pages/Projectsadmin.jsx";
import AdminProjectPlots from "./admin/pages/ProjectPlots.jsx";
import AdminProjectForm from "./admin/pages/AdminProjectForm.jsx";
import AdminProjectManage from "./admin/pages/AdminProjectManage.jsx";
import Enquiries from "./admin/pages/Enquiries.jsx";
import SiteVisits from "./admin/pages/SiteVisits.jsx";
import Customers from "./admin/pages/Customers.jsx";
import AdminProfile from "./admin/pages/AdminProfile.jsx";

import SuperAdminLayout from "./admin/layouts/SuperAdminLayout.jsx";
import SuperAdminDashboard from "./admin/pages/SuperAdminDashboard.jsx";
import SuperAdminProfile from "./admin/pages/SuperAdminProfile.jsx";
import ProjectApprovals from "./admin/pages/ProjectApprovals.jsx";
import SuperAdminProjectForm from "./admin/pages/SuperAdminProjectForm.jsx";
import GeneralEnquiries from "./admin/pages/GeneralEnquiries.jsx";
import SubscriptionDetails from "./admin/pages/super-admin/SubscriptionDetails.jsx";
import BranchManagement from "./admin/pages/BranchManagement.jsx";
import BranchDetail from "./admin/pages/BranchDetail.jsx";

import SupremeAdminLayout from "./admin/layouts/SupremeAdminLayout.jsx";
import SupremeOverview from "./admin/pages/supreme/SupremeOverview.jsx";
import SubscriberManagement from "./admin/pages/supreme/SubscriberManagement.jsx";
import PlanManagement from "./admin/pages/supreme/PlanManagement.jsx";
import SubscriptionManagement from "./admin/pages/supreme/SubscriptionManagement.jsx";
import SeatUsageOverview from "./admin/pages/supreme/SeatUsageOverview.jsx";
import PublishedProjects from "./admin/pages/supreme/PublishedProjects.jsx";
import PublishedProjectsTenant from "./admin/pages/supreme/PublishedProjectsTenant.jsx";
import PublishedProjectsAdmin from "./admin/pages/supreme/PublishedProjectsAdmin.jsx";
import SupremeAdminProfile from "./admin/pages/supreme/SupremeAdminProfile.jsx";
import RetailerRequests from "./admin/pages/supreme/RetailerRequests.jsx";
import TrustedDevices from "./admin/pages/supreme/TrustedDevices.jsx";
import SmoothScrollProvider from "./components/SmoothScrollProvider.jsx";


function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ProjectProvider>
          <PlotProvider>
            <NotificationProvider>
              <AdminProvider>
                <AdminProfileProvider>
                  <SmoothScrollProvider />
                  <Routes>
                  {/* Public Client Website (Guarded by Maintenance Mode) */}
                  <Route element={<PublicRoute />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/project-details/:id" element={<ProjectDetails />} />
                    <Route path="/projects/:id" element={<ProjectDetails />} />
                    <Route path="/plot-details/:projectName/:plotNumber" element={<PlotDetails />} />
                    <Route path="/plot-details/:id" element={<PlotDetails />} />
                    <Route path="/project-plots/:id" element={<ProjectPlots />} />
                    <Route path="/projects/:id/plots" element={<ProjectPlots />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/signup-customer" element={<Signup initialType="customer" />} />
                    <Route path="/signup-retailer" element={<Signup initialType="retailer" />} />
                    <Route path="/signup/:type" element={<Signup />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/site-visit/:projectId" element={<SiteVisitForm />} />
                    <Route path="/enquiry/:projectId" element={<EnquiryForm />} />

                    {/* Catch-all: custom 404 for any unknown public URL */}
                    <Route path="*" element={<NotFound />} />
                  </Route>

                  {/* Auth routes (Always reachable so admins/owners can log in during maintenance) */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute allowedRoles={["USER", "ADMIN", "SUPER_ADMIN"]}>
                        <UserProfile />
                      </ProtectedRoute>
                    }
                  />

                  {/* Normal Admin Area — Protected strictly for ADMIN */}
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute allowedRoles={["ADMIN"]}>
                        <AdminLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="projects" element={<Projectsadmin />} />
                    <Route path="projects/new" element={<AdminProjectForm />} />
                    <Route path="projects/:id/manage" element={<AdminProjectPlots />} />
                    <Route path="projects/:id/manage-details" element={<AdminProjectManage />} />
                    <Route path="projects/:id/plots" element={<AdminProjectPlots />} />
                    <Route path="enquiries" element={<Enquiries />} />
                    <Route path="site-visits" element={<SiteVisits />} />
                    <Route path="customers" element={<Customers />} />
                    <Route path="profile" element={<AdminProfile />} />
                  </Route>

                  {/* Super Admin Area — Protected strictly for SUPER_ADMIN */}
                  <Route
                    path="/super-admin"
                    element={
                      <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                        <SuperAdminProfileProvider>
                          <SuperAdminLayout />
                        </SuperAdminProfileProvider>
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<SuperAdminDashboard />} />
                    <Route path="general-enquiries" element={<GeneralEnquiries />} />
                    <Route path="general-enquiries/:branchSlug" element={<GeneralEnquiries />} />
                    <Route path="branches" element={<BranchManagement />} />
                    <Route path="branches/:id" element={<BranchDetail />} />
                    <Route path="profile" element={<SuperAdminProfile />} />
                    <Route path="approvals" element={<ProjectApprovals />} />
                    <Route path="projects/new" element={<SuperAdminProjectForm />} />
                    <Route path="subscription" element={<SubscriptionDetails />} />
                  </Route>

                  {/* Supreme Admin Platform Owner Area — Protected strictly for SUPREME_ADMIN */}
                  <Route
                    path="/supreme-admin"
                    element={
                      <ProtectedRoute allowedRoles={["SUPREME_ADMIN"]}>
                        <SupremeAdminLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<SupremeOverview />} />
                    <Route path="retailer-requests" element={<RetailerRequests />} />
                    <Route path="subscribers" element={<SubscriberManagement />} />
                    <Route path="plans" element={<PlanManagement />} />
                    <Route path="subscriptions" element={<SubscriptionManagement />} />
                    <Route path="seat-usage" element={<SeatUsageOverview />} />
                    <Route path="published-projects" element={<PublishedProjects />} />
                    <Route path="published-projects/tenant/:subscriberId" element={<PublishedProjectsTenant />} />
                    <Route
                      path="published-projects/tenant/:subscriberId/admin/:adminId"
                      element={<PublishedProjectsAdmin />}
                    />
                    <Route path="trusted-devices" element={<TrustedDevices />} />
                    <Route path="profile" element={<SupremeAdminProfile />} />
                  </Route>
                </Routes>
              </AdminProfileProvider>
            </AdminProvider>
          </NotificationProvider>
        </PlotProvider>
      </ProjectProvider>
    </AuthProvider>
  </ToastProvider>
);
}

export default App;
