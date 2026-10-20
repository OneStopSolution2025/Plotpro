import "../styles/super-admin.css";
import UnassignedProjectsSection from "../components/super-admin/UnassignedProjectsSection";
import { useProjects } from "../../context/ProjectContext";
import { useAdmins } from "../context/AdminContext";
import { usePlots } from "../../context/PlotContext";

const ProjectAssignments = () => {
  const { projects, assignProject } = useProjects();
  const { admins } = useAdmins();
  const { plots } = usePlots();

  return (
    <div className="dashboard-page sa-page">
      {/* =====================================================
          HEADER
      ===================================================== */}
      <div className="sa-page-header">
        <div>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
              color: "#a63d2f",
              display: "block",
              marginBottom: "4px",
            }}
          >
            SUPER ADMIN
          </span>
          <h1 className="sa-page-title">Project Assignments & Allocation</h1>
          <p className="sa-page-subtitle">
            Assign unassigned projects to available administrators or reallocate existing workloads.
          </p>
        </div>
      </div>

      {/* =====================================================
          ASSIGNMENTS SECTION
      ===================================================== */}
      <UnassignedProjectsSection
        projects={projects}
        plots={plots}
        admins={admins}
        assignProject={assignProject}
      />
    </div>
  );
};

export default ProjectAssignments;
