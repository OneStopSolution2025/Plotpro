import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaBuilding,
  FaCheckCircle,
  FaEnvelope,
  FaPhone,
  FaWhatsapp,
  FaArrowRight,
  FaPlus,
  FaThLarge,
  FaCalendarCheck,
  FaUsers,
  FaEllipsisH,
  FaMapMarkerAlt as FaLocation,
} from "react-icons/fa";

import { useProjects } from "../../context/ProjectContext";
import { usePlots } from "../../context/PlotContext";
import { formatCurrentDate } from "../../utils/dateUtils";
import { useAuth } from "../../context/AuthContext";
import { adminApi, superAdminApi } from "../../services/api";

import "../styles/dashboard.css";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, role, isAuthenticated } = useAuth();
  const { projects } = useProjects();
  const { plots } = usePlots();

  // 1. Reactive Real Enquiries from Authenticated API
  const [enquiries, setEnquiries] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const fetchDashboardEnquiries = async () => {
      try {
        let res;
        if (role === "SUPER_ADMIN") {
          res = await superAdminApi.getAllEnquiries();
        } else {
          res = await adminApi.getEnquiries();
        }
        if (isMounted && res?.success && Array.isArray(res.data)) {
          const formatted = res.data.map((e) => ({
            id: e._id || e.id,
            _id: e._id || e.id,
            name: e.fullName || e.name || "Customer",
            phone: e.mobile || e.phone || "",
            email: e.email || "",
            contactMethod: e.contactMethod || "phone",
            project: e.projectId?.title || e.project || (e.projectId ? `Project #${e.projectId?.customId || ""}` : "Direct Enquiry"),
            interest: e.plot ? `Plot ${e.plot}` : e.interest || "General Enquiry",
            date: e.createdAt
              ? new Date(e.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
              : e.date || "Recent",
            status:
              e.status === "NEW"
                ? "New"
                : e.status === "CONTACTED"
                  ? "Contacted"
                  : e.status === "CLOSED"
                    ? "Closed"
                    : e.status || "New",
            message: e.message || "",
          }));
          setEnquiries(formatted);
        } else if (isMounted) {
          setEnquiries([]);
        }
      } catch {
        if (isMounted) setEnquiries([]);
      }
    };

    if (isAuthenticated) {
      fetchDashboardEnquiries();
    } else {
      setEnquiries([]);
    }

    // Auto-sync enquiries and leads every 8 seconds
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible" && isAuthenticated) {
        fetchDashboardEnquiries();
      }
    }, 8000);

    const handleEnquiriesUpdated = () => {
      if (isAuthenticated) fetchDashboardEnquiries();
    };

    window.addEventListener("dreamcity-enquiries-updated", handleEnquiriesUpdated);
    window.addEventListener("storage", handleEnquiriesUpdated);
    window.addEventListener("focus", handleEnquiriesUpdated);
    document.addEventListener("visibilitychange", handleEnquiriesUpdated);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      window.removeEventListener("dreamcity-enquiries-updated", handleEnquiriesUpdated);
      window.removeEventListener("storage", handleEnquiriesUpdated);
      window.removeEventListener("focus", handleEnquiriesUpdated);
      document.removeEventListener("visibilitychange", handleEnquiriesUpdated);
    };
  }, [role, user?._id, isAuthenticated]);

  // 2. Approved Projects Only
  const approvedProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.approvalStatus === "APPROVED" &&
          !project.isArchived
      ),
    [projects]
  );

  // 3. Plot Inventory Derived Exclusively from PlotContext
  const totalPlots = plots.length;

  const availablePlots = useMemo(
    () =>
      plots.filter(
        (plot) => plot.status === "Available"
      ).length,
    [plots]
  );
  // 3. Dynamic KPI Stats
  const stats = [
    {
      title: "Total Projects",
      value: String(approvedProjects.length),
      subtitle: "Approved developments",
      icon: <FaBuilding />,
      color: "blue",
      onClick: () => navigate("/admin/projects"),
    },
    {
      title: "Total Plots",
      value: String(totalPlots),
      subtitle: "Project inventory",
      icon: <FaThLarge />,
      color: "green",
      onClick: () => navigate("/admin/projects"),
    },
    {
      title: "Available Plots",
      value: String(availablePlots),
      subtitle: "Ready for booking",
      icon: <FaCheckCircle />,
      color: "orange",
      onClick: () => navigate("/admin/projects"),
    },
    {
      title: "Total Enquiries",
      value: String(enquiries.length),
      subtitle: "New customer leads",
      icon: <FaEnvelope />,
      color: "pink",
      onClick: () => navigate("/admin/enquiries"),
    },
  ];

  // 4. Projects Catalog (displaying first 4 in canonical catalog order, no fabricated recency)
  const displayProjects = useMemo(() => {
    return approvedProjects.slice(0, 4).map((project) => {
      const projectPlots = plots.filter((p) => String(p.projectId) === String(project.id));
      const remainingCount = projectPlots.filter((p) => p.status === "Available").length;
      const totalCount = projectPlots.length;
      const percentage = totalCount > 0 ? Math.round((remainingCount / totalCount) * 100) : 0;

      return {
        id: project.id,
        name: project.name || project.title || "Project",
        location: project.location || "Tamil Nadu",
        status: project.status || "Active",
        remaining: `${remainingCount}/${totalCount}`,
        percentage,
        image:
          project.image ||
          "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80",
      };
    });
  }, [approvedProjects, plots]);
  // 5. Recent Enquiries (latest 5 records from real enquiries state)
  const recentEnquiries = useMemo(() => {
    return enquiries.slice(0, 5);
  }, [enquiries]);

  return (
    <div className="dashboard-page">
      {/* =========================
          WELCOME HEADER
      ========================= */}
      <section className="dashboard-welcome">
        <div className="dashboard-welcome-text">
          <span className="dashboard-kicker">WELCOME BACK</span>
          <h1>
            Good Morning, <span>{user?.name || "Admin"}</span>
          </h1>
          <p>Here&apos;s what&apos;s happening with your projects today.</p>
        </div>

        <div className="dashboard-date">
          <span>Today</span>
          <strong>{formatCurrentDate({ style: "short" })}</strong>
        </div>
      </section>

      {/* =========================
          SUMMARY CARDS
      ========================= */}
      <section className="dashboard-stats">
        {stats.map((stat) => (
          <div className="dashboard-stat-card" key={stat.title}>
            <div className={`stat-icon ${stat.color}`}>{stat.icon}</div>

            <div className="stat-content">
              <span className="stat-title">{stat.title}</span>
              <h2>{stat.value}</h2>
              <p>{stat.subtitle}</p>
            </div>

            <button
              type="button"
              className="stat-arrow"
              onClick={stat.onClick}
              aria-label={`View ${stat.title}`}
            >
              <FaArrowRight />
            </button>
          </div>
        ))}
      </section>

      {/* =========================
          PROJECTS
      ========================= */}
      <section className="dashboard-section projects-section">
        <div className="dashboard-section-header">
          <div>
            <h2>Projects</h2>
          </div>

          <button
            type="button"
            className="dashboard-view-all"
            onClick={() => navigate("/admin/projects")}
          >
            View All
            <FaArrowRight />
          </button>
        </div>

        <div className="dashboard-project-grid">
          {displayProjects.map((project) => (
            <div
              className="dashboard-project-card"
              key={project.id}
              onClick={() => navigate(`/admin/projects/${project.id}/plots`)}
              style={{ cursor: "pointer" }}
            >
              <div className="project-image">
                <img src={project.image} alt={project.name} />

                <span className={`project-status ${project.status.toLowerCase()}`}>
                  <span />
                  {project.status}
                </span>

                <button
                  type="button"
                  className="project-menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/admin/projects/${project.id}/plots`);
                  }}
                  aria-label="Manage project plots"
                >
                  <FaEllipsisH />
                </button>
              </div>

              <div className="project-card-content">
                <h3>{project.name}</h3>

                <p className="project-location">
                  <FaLocation />
                  {project.location}
                </p>

                <div className="project-progress-header">
                  <span>Plots Remaining</span>
                  <strong>{project.percentage}%</strong>
                </div>

                <div className="project-progress">
                  <span
                    style={{
                      width: `${project.percentage}%`,
                    }}
                  />
                </div>

                <div className="project-progress-count">{project.remaining}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =========================
          BOTTOM SECTION
      ========================= */}
      <div className="dashboard-bottom-grid">
        {/* RECENT ENQUIRIES */}
        <section className="dashboard-section enquiries-section">
          <div className="dashboard-section-header">
            <div>
              <h2>Recent Enquiries</h2>
              <p>Latest customer enquiries across all projects</p>
            </div>

            <button
              type="button"
              className="dashboard-view-all"
              onClick={() => navigate("/admin/enquiries")}
            >
              View All
              <FaArrowRight />
            </button>
          </div>

          <div className="dashboard-enquiries-table">
            <div className="enquiry-table-header">
              <span>Customer</span>
              <span>Project</span>
              <span>Interest</span>
              <span>Status</span>
              <span>Date</span>
              <span>Action</span>
            </div>

            {recentEnquiries.length === 0 ? (
              <div className="dashboard-empty-state">No enquiries yet</div>
            ) : (
              recentEnquiries.map((enquiry) => (
                <div className="enquiry-table-row" key={enquiry.id}>
                  <div className="customer-cell">
                    <span className="customer-avatar">
                      {enquiry.name
                        ? enquiry.name
                          .split(" ")
                          .map((word) => word[0])
                          .join("")
                          .slice(0, 2)
                        : "CU"}
                    </span>
                    <div>
                      <strong>{enquiry.name}</strong>
                      <span className={`dashboard-pref-pill pref-${enquiry.contactMethod || 'phone'}`} title={`Preferred Contact: ${enquiry.contactMethod === "whatsapp" ? "WhatsApp" : enquiry.contactMethod === "email" ? "Email" : "Phone Call"}`}>
                        {enquiry.contactMethod === "whatsapp" && <FaWhatsapp />}
                        {enquiry.contactMethod === "email" && <FaEnvelope />}
                        {(!enquiry.contactMethod || enquiry.contactMethod === "phone") && <FaPhone />}
                        <span>{enquiry.contactMethod === "whatsapp" ? "WhatsApp" : enquiry.contactMethod === "email" ? "Email" : "Call"}</span>
                      </span>
                    </div>
                  </div>

                  <span>{enquiry.project}</span>
                  <span>{enquiry.interest}</span>

                  <span>
                    <small
                      className={`enquiry-status ${enquiry.status ? enquiry.status.toLowerCase().replace(" ", "-") : "new"
                        }`}
                    >
                      {enquiry.status || "New"}
                    </small>
                  </span>

                  <span>{enquiry.date}</span>

                  <button
                    type="button"
                    className="enquiry-action"
                    onClick={() => navigate("/admin/enquiries")}
                    aria-label="View enquiry details"
                  >
                    <FaEllipsisH />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* QUICK ACTIONS */}
        <section className="dashboard-section quick-actions-section">
          <div className="dashboard-section-header">
            <div>
              <h2>Quick Actions</h2>
              <p>Manage your day-to-day tasks</p>
            </div>
          </div>

          <div className="quick-actions-grid">
            <button
              type="button"
              className="quick-action blue"
              onClick={() => navigate("/admin/projects/new")}
            >
              <span>
                <FaPlus />
              </span>
              <strong>Add Project</strong>
              <small>Create new project</small>
            </button>

            <button
              type="button"
              className="quick-action green"
              onClick={() => navigate("/admin/projects")}
            >
              <span>
                <FaThLarge />
              </span>
              <strong>Manage Plots</strong>
              <small>Select project to manage plots</small>
            </button>

            <button
              type="button"
              className="quick-action orange"
              onClick={() => navigate("/admin/enquiries")}
            >
              <span>
                <FaEnvelope />
              </span>
              <strong>View Enquiries</strong>
              <small>See latest enquiries</small>
            </button>

            <button
              type="button"
              className="quick-action purple"
              onClick={() => navigate("/admin/site-visits")}
            >
              <span>
                <FaCalendarCheck />
              </span>
              <strong>Schedule Site Visit</strong>
              <small>Plan customer visits</small>
            </button>

            <button
              type="button"
              className="quick-action pink"
              onClick={() => navigate("/admin/customers")}
            >
              <span>
                <FaUsers />
              </span>
              <strong>Manage Customers</strong>
              <small>View customer list</small>
            </button>

            <button
              type="button"
              className="quick-action cyan"
              onClick={() => navigate("/admin/projects")}
            >
              <span>
                <FaBuilding />
              </span>
              <strong>Project Gallery</strong>
              <small>Select project to view gallery</small>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;