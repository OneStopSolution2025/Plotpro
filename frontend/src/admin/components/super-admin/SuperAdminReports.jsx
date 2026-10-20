import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import { FaCalendarAlt, FaChartPie, FaBuilding, FaFilter } from "react-icons/fa";
import CustomDropdown from "../CustomDropdown";


const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const SuperAdminReports = ({ projects, plots, admins }) => {
  // UI States
  const [timeframe, setTimeframe] = useState("monthly"); // "monthly" | "yearly"
  const [selectedAdmin, setSelectedAdmin] = useState("all"); // "all" | admin.id | "unassigned"
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Check if unassigned projects exist in catalog
  const unassignedCount = useMemo(
    () => projects.filter((p) => p.adminId === null).length,
    [projects]
  );

  // 1. Filter projects based on selected administrator
  const filteredProjects = useMemo(() => {
    if (selectedAdmin === "all") return projects;
    if (selectedAdmin === "unassigned") {
      return projects.filter((p) => !p.adminId || p.adminId === null);
    }
    return projects.filter((p) => {
      const pAdminId = String(p.adminId?._id || p.adminId || "");
      return pAdminId === String(selectedAdmin);
    });
  }, [projects, selectedAdmin]);

  // Project IDs belonging to the filtered set
  const filteredProjectIds = useMemo(() => {
    const ids = new Set();
    filteredProjects.forEach((p) => {
      if (p.id != null) ids.add(String(p.id));
      if (p.customId != null) ids.add(String(p.customId));
      if (p._id != null) ids.add(String(p._id));
    });
    return ids;
  }, [filteredProjects]);

  // 2. Filter plots: Plot -> plot.projectId -> Project -> project.adminId -> Admin
  const filteredPlots = useMemo(() => {
    if (selectedAdmin === "all") return plots;
    return plots.filter((plot) => {
      const pId = String(plot.projectId?._id || plot.projectId || "");
      const pCustomId = plot.projectCustomId != null ? String(plot.projectCustomId) : "";
      const pMongoId = plot.projectMongoId != null ? String(plot.projectMongoId) : "";
      return filteredProjectIds.has(pId) || filteredProjectIds.has(pCustomId) || filteredProjectIds.has(pMongoId);
    });
  }, [plots, selectedAdmin, filteredProjectIds]);

  // ---------------------------------------------------------
  // REPORT 1: PROJECT LAUNCH TREND (Real project.launchDate)
  // ---------------------------------------------------------
  const timelineData = useMemo(() => {
    // Map to group projects by month or year
    const countsMap = new Map();

    filteredProjects.forEach((proj) => {
      if (!proj.launchDate) return;
      const parsedDate = new Date(proj.launchDate);
      if (isNaN(parsedDate.getTime())) return;

      const year = parsedDate.getFullYear();
      const monthIdx = parsedDate.getMonth();

      if (timeframe === "monthly") {
        const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
        const label = `${MONTH_NAMES[monthIdx]} ${year}`;
        const current = countsMap.get(key) || { key, label, count: 0, year, monthIdx };
        countsMap.set(key, { ...current, count: current.count + 1 });
      } else {
        const key = `${year}`;
        const label = `${year}`;
        const current = countsMap.get(key) || { key, label, count: 0, year };
        countsMap.set(key, { ...current, count: current.count + 1 });
      }
    });

    const items = Array.from(countsMap.values());

    // Sort chronologically
    if (timeframe === "monthly") {
      items.sort((a, b) => a.year - b.year || a.monthIdx - b.monthIdx);
    } else {
      items.sort((a, b) => a.year - b.year);
    }

    return items;
  }, [filteredProjects, timeframe]);

  // SVG Line Chart geometry calculation
  const chartWidth = 520;
  const chartHeight = 180;
  const paddingX = 40;
  const paddingY = 30;

  const maxTimelineCount = useMemo(() => {
    if (timelineData.length === 0) return 5;
    const maxVal = Math.max(...timelineData.map((d) => d.count));
    return maxVal > 0 ? Math.ceil(maxVal * 1.25) : 5;
  }, [timelineData]);

  const labelInterval = useMemo(() => {
    if (timelineData.length <= 6) return 1;
    if (timelineData.length <= 12) return 2;
    return Math.ceil(timelineData.length / 6);
  }, [timelineData.length]);

  const linePoints = useMemo(() => {
    if (timelineData.length === 0) return [];
    if (timelineData.length === 1) {
      const d = timelineData[0];
      const x = chartWidth / 2;
      const y =
        chartHeight -
        paddingY -
        (d.count / maxTimelineCount) * (chartHeight - paddingY * 2);
      return [{ ...d, x, y }];
    }

    const usableWidth = chartWidth - paddingX * 2;
    const stepX = usableWidth / (timelineData.length - 1);

    return timelineData.map((d, i) => {
      const x = paddingX + i * stepX;
      const y =
        chartHeight -
        paddingY -
        (d.count / maxTimelineCount) * (chartHeight - paddingY * 2);
      return { ...d, x, y };
    });
  }, [timelineData, maxTimelineCount, chartWidth, chartHeight, paddingX, paddingY]);

  const linePathD = useMemo(() => {
    if (linePoints.length === 0) return "";
    return linePoints.reduce(
      (path, pt, idx) => `${path} ${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`,
      ""
    );
  }, [linePoints]);

  const areaPathD = useMemo(() => {
    if (linePoints.length === 0) return "";
    const first = linePoints[0];
    const last = linePoints[linePoints.length - 1];
    const baseline = chartHeight - paddingY;
    return `${linePathD} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
  }, [linePoints, linePathD, chartHeight, paddingY]);

  // ---------------------------------------------------------
  // REPORT 2: CURRENT PLOT STATUS DISTRIBUTION (CURRENT SNAPSHOT)
  // ---------------------------------------------------------
  const plotDistribution = useMemo(() => {
    const available = filteredPlots.filter((p) => p.status === "Available").length;
    const reserved = filteredPlots.filter((p) => p.status === "Reserved").length;
    const sold = filteredPlots.filter((p) => p.status === "Sold").length;
    const total = filteredPlots.length;

    const availablePct = total > 0 ? Math.round((available / total) * 100) : 0;
    const reservedPct = total > 0 ? Math.round((reserved / total) * 100) : 0;
    const soldPct = total > 0 ? Math.round((sold / total) * 100) : 0;

    return {
      available,
      reserved,
      sold,
      total,
      availablePct,
      reservedPct,
      soldPct,
    };
  }, [filteredPlots]);

  // SVG Donut calculation
  // Radius = 42, Circumference = 2 * PI * 42 ~= 263.89
  const donutRadius = 42;
  const donutCircumference = 2 * Math.PI * donutRadius;

  const donutSegments = useMemo(() => {
    const { available, reserved, sold, total } = plotDistribution;
    if (total === 0) return [];

    const availableLen = (available / total) * donutCircumference;
    const reservedLen = (reserved / total) * donutCircumference;
    const soldLen = (sold / total) * donutCircumference;

    return [
      {
        id: "available",
        label: "Available",
        count: available,
        color: "#10b981",
        dashArray: `${availableLen} ${donutCircumference}`,
        dashOffset: 0,
      },
      {
        id: "reserved",
        label: "Reserved",
        count: reserved,
        color: "#f59e0b",
        dashArray: `${reservedLen} ${donutCircumference}`,
        dashOffset: -availableLen,
      },
      {
        id: "sold",
        label: "Sold",
        count: sold,
        color: "#475569",
        dashArray: `${soldLen} ${donutCircumference}`,
        dashOffset: -(availableLen + reservedLen),
      },
    ];
  }, [plotDistribution, donutCircumference]);

  // ---------------------------------------------------------
  // REPORT 3: PROJECTS BY ADMINISTRATOR (Consistent Semantic)
  // ---------------------------------------------------------
  const adminProjectRows = useMemo(() => {
    const totalCatalog = projects.length;

    if (selectedAdmin === "all") {
      const rows = admins.map((admin) => {
        const count = projects.filter((p) => p.adminId === admin.id).length;
        const pct = totalCatalog > 0 ? Math.round((count / totalCatalog) * 100) : 0;
        return {
          id: admin.id,
          name: admin.name,
          count,
          pct,
          isUnassigned: false,
        };
      });

      if (unassignedCount > 0) {
        rows.push({
          id: "unassigned",
          name: "Unassigned",
          count: unassignedCount,
          pct: totalCatalog > 0 ? Math.round((unassignedCount / totalCatalog) * 100) : 0,
          isUnassigned: true,
        });
      }

      return rows;
    }

    if (selectedAdmin === "unassigned") {
      const pct = totalCatalog > 0 ? Math.round((unassignedCount / totalCatalog) * 100) : 0;
      return [
        {
          id: "unassigned",
          name: "Unassigned",
          count: unassignedCount,
          pct,
          isUnassigned: true,
        },
      ];
    }

    // Specific admin selected
    const targetAdmin = admins.find((a) => a.id === selectedAdmin);
    const count = projects.filter((p) => p.adminId === selectedAdmin).length;
    const pct = totalCatalog > 0 ? Math.round((count / totalCatalog) * 100) : 0;

    return [
      {
        id: selectedAdmin,
        name: targetAdmin ? targetAdmin.name : selectedAdmin,
        count,
        pct,
        isUnassigned: false,
      },
    ];
  }, [admins, projects, selectedAdmin, unassignedCount]);

  return (
    <section className="sa-section sa-reports-section" aria-labelledby="sa-reports-title">
      {/* SECTION HEADER & CONTROLS */}
      <div className="sa-reports-header">
        <div className="sa-reports-title-area">
          <span className="sa-reports-kicker">EXECUTIVE REPORTING</span>
          <h2 id="sa-reports-title" className="sa-reports-title">
            Admin Reports &amp; Analytics
          </h2>
        </div>

        <div className="sa-reports-controls">
          {/* TIMEFRAME TOGGLE */}
          <div className="sa-timeframe-toggle" role="group" aria-label="Timeframe aggregation">
            <button
              type="button"
              className={`sa-timeframe-btn ${timeframe === "monthly" ? "active" : ""}`}
              onClick={() => setTimeframe("monthly")}
            >
              <FaCalendarAlt /> Monthly
            </button>
            <button
              type="button"
              className={`sa-timeframe-btn ${timeframe === "yearly" ? "active" : ""}`}
              onClick={() => setTimeframe("yearly")}
            >
              Yearly
            </button>
          </div>

          {/* ADMIN SELECTOR */}
          <div className="sa-admin-select-wrapper">
            <FaFilter className="sa-filter-icon" />
            <CustomDropdown
              className="sa-admin-select"
              value={selectedAdmin}
              onChange={(e) => setSelectedAdmin(e.target.value)}
              placeholder="All Admins"
            >
              <option value="all">All Admins</option>
              {admins.map((adm) => (
                <option key={adm.id} value={adm.id}>
                  {adm.name}
                </option>
              ))}
              {unassignedCount > 0 && <option value="unassigned">Unassigned Projects</option>}
            </CustomDropdown>
          </div>
        </div>
      </div>

      {/* 3-CARD REPORTS GRID */}
      <div className="sa-reports-grid">
        {/* REPORT 1: PROJECT LAUNCH TREND */}
        <div className="sa-report-card">
          <div className="sa-report-card-head">
            <div>
              <h3>Project Launch Trend</h3>
              <p>Project launches over time ({timeframe === "monthly" ? "Monthly" : "Yearly"})</p>
            </div>
            <span className="sa-report-tag">
              {filteredProjects.length} {filteredProjects.length === 1 ? "Project" : "Projects"}
            </span>
          </div>

          <div className="sa-report-chart-container">
            {timelineData.length === 0 ? (
              <div className="sa-reports-empty">
                No project launch records found for this selection.
              </div>
            ) : (
              <div className="sa-line-chart-wrapper">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="sa-line-chart-svg"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id="saLaunchGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a63d2f" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#a63d2f" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Grid Lines */}
                  {[0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = chartHeight - paddingY - ratio * (chartHeight - paddingY * 2);
                    return (
                      <line
                        key={ratio}
                        x1={paddingX}
                        y1={y}
                        x2={chartWidth - paddingX}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeDasharray="4 4"
                      />
                    );
                  })}

                  {/* Area Fill */}
                  <path d={areaPathD} fill="url(#saLaunchGradient)" />

                  {/* Main Line */}
                  <path
                    d={linePathD}
                    fill="none"
                    stroke="#a63d2f"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Data Points */}
                  {linePoints.map((pt, idx) => {
                    const isVisible =
                      idx === 0 ||
                      idx === linePoints.length - 1 ||
                      idx % labelInterval === 0;

                    return (
                      <g key={pt.key}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredPoint?.key === pt.key ? "6" : "4"}
                          fill="#ffffff"
                          stroke="#a63d2f"
                          strokeWidth={hoveredPoint?.key === pt.key ? "3" : "2"}
                          className="sa-line-point"
                          onMouseEnter={() => setHoveredPoint(pt)}
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                        {/* Label on X-axis (thinned for readability) */}
                        {isVisible && (
                          <text
                            x={pt.x}
                            y={chartHeight - 8}
                            textAnchor="middle"
                            fontSize="9"
                            fill="#64748b"
                            fontWeight="600"
                          >
                            {pt.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Micro Tooltip */}
                {hoveredPoint && (
                  <div
                    className="sa-chart-tooltip"
                    style={{
                      left: `${(hoveredPoint.x / chartWidth) * 100}%`,
                      top: `${(hoveredPoint.y / chartHeight) * 100}%`,
                    }}
                  >
                    <strong>{hoveredPoint.label}</strong>
                    <span>
                      {hoveredPoint.count}{" "}
                      {hoveredPoint.count === 1 ? "project launched" : "projects launched"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* REPORT 2: CURRENT PLOT STATUS DISTRIBUTION */}
        <div className="sa-report-card">
          <div className="sa-report-card-head">
            <div>
              <h3>Plot Status Distribution</h3>
            </div>
            <span className="sa-report-tag sa-report-snapshot-tag">
              <FaChartPie /> CURRENT SNAPSHOT
            </span>
          </div>

          <div className="sa-report-chart-container">
            {plotDistribution.total === 0 ? (
              <div className="sa-reports-empty">No plots found for this selection.</div>
            ) : (
              <div className="sa-donut-layout">
                <div className="sa-donut-wrapper">
                  <svg
                    viewBox="0 0 120 120"
                    className="sa-donut-svg"
                    aria-label={`Donut chart showing ${plotDistribution.total} total plots`}
                  >
                    {/* Background Track */}
                    <circle
                      cx="60"
                      cy="60"
                      r={donutRadius}
                      fill="transparent"
                      stroke="#f1f5f9"
                      strokeWidth="16"
                    />

                    {/* Donut Segments */}
                    {donutSegments.map((seg) => (
                      <circle
                        key={seg.id}
                        cx="60"
                        cy="60"
                        r={donutRadius}
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth="16"
                        strokeDasharray={seg.dashArray}
                        strokeDashoffset={seg.dashOffset}
                        transform="rotate(-90 60 60)"
                        className="sa-donut-segment"
                      />
                    ))}
                  </svg>

                  {/* Center Metric */}
                  <div className="sa-donut-center">
                    <span className="sa-donut-center-val">{plotDistribution.total}</span>
                    <span className="sa-donut-center-lbl">Total Plots</span>
                  </div>
                </div>

                {/* Donut Legend */}
                <div className="sa-donut-legend">
                  <div className="sa-donut-legend-item">
                    <span className="sa-legend-dot available" />
                    <div className="sa-legend-info">
                      <span className="sa-legend-label">Available</span>
                      <span className="sa-legend-val">
                        <b>{plotDistribution.available}</b> ({plotDistribution.availablePct}%)
                      </span>
                    </div>
                  </div>

                  <div className="sa-donut-legend-item">
                    <span className="sa-legend-dot reserved" />
                    <div className="sa-legend-info">
                      <span className="sa-legend-label">Reserved</span>
                      <span className="sa-legend-val">
                        <b>{plotDistribution.reserved}</b> ({plotDistribution.reservedPct}%)
                      </span>
                    </div>
                  </div>

                  <div className="sa-donut-legend-item">
                    <span className="sa-legend-dot sold" />
                    <div className="sa-legend-info">
                      <span className="sa-legend-label">Sold</span>
                      <span className="sa-legend-val">
                        <b>{plotDistribution.sold}</b> ({plotDistribution.soldPct}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* REPORT 3: PROJECTS BY ADMINISTRATOR */}
        <div className="sa-report-card">
          <div className="sa-report-card-head">
            <div>
              <h3>Projects by Administrator</h3>
            </div>
            <span className="sa-report-tag">
              <FaBuilding /> {adminProjectRows.length}{" "}
              {adminProjectRows.length === 1 ? "Entity" : "Entities"}
            </span>
          </div>

          <div className="sa-report-chart-container">
            {adminProjectRows.length === 0 ? (
              <div className="sa-reports-empty">No administrator project records.</div>
            ) : (
              <div className="sa-admin-bars-list">
                {adminProjectRows.map((row) => (
                  <div key={row.id} className="sa-admin-bar-item">
                    <div className="sa-admin-bar-meta">
                      <span
                        className={`sa-admin-bar-name ${row.isUnassigned ? "unassigned" : ""}`}
                      >
                        {row.name}
                      </span>
                      <div className="sa-admin-bar-stats">
                        <span className="sa-admin-bar-count">
                          {row.count} {row.count === 1 ? "project" : "projects"}
                        </span>
                        <span className="sa-admin-bar-pct">{row.pct}%</span>
                      </div>
                    </div>

                    <div className="sa-admin-bar-track">
                      <div
                        className={`sa-admin-bar-fill ${row.isUnassigned ? "unassigned" : ""}`}
                        style={{ width: `${Math.max(row.pct, row.count > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

SuperAdminReports.propTypes = {
  projects: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string,
      adminId: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
      launchDate: PropTypes.string,
    })
  ).isRequired,
  plots: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      status: PropTypes.string.isRequired,
    })
  ).isRequired,
  admins: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    })
  ).isRequired,
};

export default SuperAdminReports;
