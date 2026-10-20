export const getProjectPlotSummary = (project, plots = []) => {
  if (!project) {
    return { available: 0, reserved: 0, sold: 0, total: 0 };
  }

  const projId = project.id != null ? String(project.id) : "";
  const projCustomId = project.customId != null ? String(project.customId) : "";
  const projMongoId = project._id != null ? String(project._id) : "";

  const projectPlots = plots.filter((p) => {
    const plotProjId = String(p.projectId?._id || p.projectId || "");
    const plotCustomId = p.projectCustomId != null ? String(p.projectCustomId) : "";
    const plotMongoId = p.projectMongoId != null ? String(p.projectMongoId) : "";

    return (
      (projMongoId && (plotProjId === projMongoId || plotMongoId === projMongoId)) ||
      (projCustomId && (plotCustomId === projCustomId || plotProjId === projCustomId)) ||
      (projId && (plotProjId === projId || plotCustomId === projId))
    );
  });

  if (projectPlots.length > 0) {
    const available = projectPlots.filter((p) => p.status === "Available").length;
    const reserved = projectPlots.filter((p) => p.status === "Reserved").length;
    const sold = projectPlots.filter((p) => p.status === "Sold").length;
    const total = projectPlots.length;

    return { available, reserved, sold, total };
  }

  // Fallback to project's own plot counters if PlotContext plots are empty or still loading
  const total = Number(project.totalPlots) || 0;
  const available = Number(project.availablePlots) || 0;
  const reserved = Number(project.reservedPlots) || 0;
  const sold = Number(project.soldPlots) || 0;
  return { available, reserved, sold, total };
};

/**
 * Builds the Admin Performance / Responsibility table dataset.
 * Traverses: Admin -> Admin's Projects -> Project Plots -> Plot Status
 */
export const buildAdminPerformance = (admins = [], projects = [], plots = []) => {
  return admins.map((admin) => {
    const adminId = String(admin._id || admin.id || "");

    const adminProjects = projects.filter((p) => {
      const pAdminId = String(p.adminId?._id || p.adminId || "");
      return adminId && pAdminId === adminId;
    });

    let availablePlots = 0;
    let reservedPlots = 0;
    let soldPlots = 0;
    let totalPlots = 0;

    adminProjects.forEach((project) => {
      const summary = getProjectPlotSummary(project, plots);
      availablePlots += summary.available;
      reservedPlots += summary.reserved;
      soldPlots += summary.sold;
      totalPlots += summary.total;
    });

    // If no plots counted from individual projects but admin object has database counters, fallback
    if (totalPlots === 0 && Number(admin.totalPlots) > 0) {
      totalPlots = Number(admin.totalPlots);
      availablePlots = Number(admin.availablePlots) || 0;
      reservedPlots = Number(admin.reservedPlots) || 0;
      soldPlots = Number(admin.soldPlots) || 0;
    }

    return {
      id: admin.id || admin._id,
      _id: admin._id || admin.id,
      name: admin.name,
      email: admin.email,
      mobile: admin.phone || admin.mobile || "",
      status: admin.status === "Active" || admin.status === "ACTIVE" ? "Active" : "Inactive",
      projectsCount: adminProjects.length || Number(admin.assignedProjectsCount) || Number(admin.projectsCount) || 0,
      availablePlots,
      reservedPlots,
      soldPlots,
      totalPlots,
    };
  });
};

/**
 * Aggregates information for the Admin Detail view.
 * Returns the admin record, aggregated plot totals, and
 * the list of managed projects with their respective plot breakdowns.
 */
export const getAdminDetailSummary = (adminId, admins = [], projects = [], plots = []) => {
  const searchId = String(adminId || "");
  const admin = admins.find((a) => String(a.id) === searchId || String(a._id) === searchId) || null;

  if (!admin) return null;

  const targetAdminId = String(admin._id || admin.id || "");
  const adminProjects = projects.filter((p) => {
    const pAdminId = String(p.adminId?._id || p.adminId || "");
    return targetAdminId && pAdminId === targetAdminId;
  });

  let availablePlots = 0;
  let reservedPlots = 0;
  let soldPlots = 0;
  let totalPlots = 0;

  const managedProjects = adminProjects.map((project) => {
    const summary = getProjectPlotSummary(project, plots);
    availablePlots += summary.available;
    reservedPlots += summary.reserved;
    soldPlots += summary.sold;
    totalPlots += summary.total;

    return {
      id: project.id,
      title: project.title,
      location: project.location,
      available: summary.available,
      reserved: summary.reserved,
      sold: summary.sold,
      total: summary.total,
    };
  });

  // Fallback if projects had 0 plots but admin has summary metrics
  if (totalPlots === 0 && Number(admin.totalPlots) > 0) {
    totalPlots = Number(admin.totalPlots);
    availablePlots = Number(admin.availablePlots) || 0;
    reservedPlots = Number(admin.reservedPlots) || 0;
    soldPlots = Number(admin.soldPlots) || 0;
  }

  return {
    admin: {
      ...admin,
      status: admin.status === "Active" || admin.status === "ACTIVE" ? "Active" : "Inactive",
    },
    summary: {
      projectsCount: adminProjects.length || Number(admin.assignedProjectsCount) || Number(admin.projectsCount) || 0,
      availablePlots,
      reservedPlots,
      soldPlots,
      totalPlots,
    },
    managedProjects,
  };
};