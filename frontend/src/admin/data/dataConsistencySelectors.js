/* =========================================================
   DREAMCITY — DATA CONSISTENCY AUDIT SELECTORS
   ---------------------------------------------------------
   Audits the relational integrity of:
   Plot -> Project -> Admin
   Identifies:
   - Total, Available, Reserved, Sold plots
   - Assigned plots vs Unassigned plots vs Orphan plots
   - Duplicate plot IDs
   - Invalid plot statuses
   - Admin-wise reconciled totals
   Ensures:
   Global Plots = Assigned Admin Plots + Unassigned Project Plots + Orphan Plots
   Available + Reserved + Sold = Total Plots
   ========================================================= */

/**
 * Performs a comprehensive data consistency check across plots, projects, and admins.
 * Returns diagnostic metrics without mutating or hiding any invalid records.
 */
export const validatePlotDataConsistency = (plots = [], projects = [], admins = []) => {
  const totalPlots = plots.length;

  let availablePlots = 0;
  let reservedPlots = 0;
  let soldPlots = 0;
  let invalidStatusCount = 0;

  const projectMap = new Map();
  projects.forEach((proj) => {
    projectMap.set(String(proj.id), proj);
  });

  const adminMap = new Map();
  admins.forEach((admin) => {
    adminMap.set(String(admin.id), admin);
  });

  // Track plot IDs to detect duplicates
  const seenPlotIds = new Set();
  const duplicatePlotIds = [];

  let assignedPlotsCount = 0;
  let unassignedPlotsCount = 0;
  let orphanPlotsCount = 0;

  // Admin-wise tallies
  const adminTotals = {};
  admins.forEach((admin) => {
    adminTotals[admin.id] = {
      name: admin.name,
      total: 0,
      available: 0,
      reserved: 0,
      sold: 0,
    };
  });

  plots.forEach((plot) => {
    // 1. Status Validation
    if (plot.status === "Available") {
      availablePlots++;
    } else if (plot.status === "Reserved") {
      reservedPlots++;
    } else if (plot.status === "Sold") {
      soldPlots++;
    } else {
      invalidStatusCount++;
    }

    // 2. Duplicate Detection
    const plotIdStr = String(plot.id);
    if (seenPlotIds.has(plotIdStr)) {
      duplicatePlotIds.push(plotIdStr);
    } else {
      seenPlotIds.add(plotIdStr);
    }

    // 3. Project & Admin Traversal
    const project = projectMap.get(String(plot.projectId));
    if (!project) {
      // Orphan plot: projectId does not match any known project
      orphanPlotsCount++;
    } else if (project.adminId === null) {
      // Project is unassigned
      unassignedPlotsCount++;
    } else {
      // Project is assigned to an administrator
      const admin = adminMap.get(String(project.adminId));
      if (admin && adminTotals[admin.id]) {
        assignedPlotsCount++;
        adminTotals[admin.id].total++;
        if (plot.status === "Available") adminTotals[admin.id].available++;
        if (plot.status === "Reserved") adminTotals[admin.id].reserved++;
        if (plot.status === "Sold") adminTotals[admin.id].sold++;
      } else {
        // Project has an adminId that does not exist in AdminContext
        orphanPlotsCount++;
      }
    }
  });

  // Mathematical Reconciliation Checks
  const statusSum = availablePlots + reservedPlots + soldPlots;
  const relationshipSum = assignedPlotsCount + unassignedPlotsCount + orphanPlotsCount;

  const isStatusReconciled = statusSum === totalPlots && invalidStatusCount === 0;
  const isRelationshipReconciled = relationshipSum === totalPlots;

  // Check each admin's status sum
  const areAdminsReconciled = Object.values(adminTotals).every(
    (a) => a.available + a.reserved + a.sold === a.total
  );

  const isConsistent =
    isStatusReconciled &&
    isRelationshipReconciled &&
    areAdminsReconciled &&
    duplicatePlotIds.length === 0 &&
    orphanPlotsCount === 0;

  return {
    totalPlots,
    availablePlots,
    reservedPlots,
    soldPlots,
    invalidStatusCount,
    assignedPlotsCount,
    unassignedPlotsCount,
    orphanPlotsCount,
    duplicatePlotIds,
    adminTotals,
    isStatusReconciled,
    isRelationshipReconciled,
    areAdminsReconciled,
    isConsistent,
  };
};
