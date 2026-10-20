import { useState } from "react";
import { useNavigate } from "react-router-dom";

/* =========================================================
   SUPER ADMIN ANALYTICS
   ---------------------------------------------------------
   Management-focused visual analytics.
   Consumes the exact same `adminPerformance` array as the
   performance table.
   ========================================================= */

const SuperAdminAnalytics = ({ rows = [] }) => {
  const navigate = useNavigate();
  const [activeTooltip, setActiveTooltip] = useState(null);

  const maxProjects = Math.max(...rows.map((r) => r.projectsCount), 1);

  return (
    <section className="dashboard-section sa-section sa-analytics-section">
      <div className="dashboard-section-header">
        <div>
          <h2>Workload &amp; Inventory Analytics</h2>
        </div>
      </div>

      <div className="sa-analytics-grid">
        {/* =====================================================
            CHART 1: PLOT INVENTORY BY ADMIN (STACKED BARS)
        ===================================================== */}
        <div className="sa-chart-card">
          <div className="sa-chart-header">
            <div>
              <h3>Plot Inventory by Administrator</h3>
            </div>

            {/* Subtle Legend */}
            <div className="sa-chart-legend">
              <span className="sa-legend-item">
                <span className="sa-legend-dot available" />
                Available
              </span>
              <span className="sa-legend-item">
                <span className="sa-legend-dot reserved" />
                Reserved
              </span>
              <span className="sa-legend-item">
                <span className="sa-legend-dot sold" />
                Sold
              </span>
            </div>
          </div>

          <div className="sa-stacked-bar-list">
            {rows.map((admin) => {
              const total = admin.totalPlots || 0;
              const availPct = total > 0 ? (admin.availablePlots / total) * 100 : 0;
              const resPct = total > 0 ? (admin.reservedPlots / total) * 100 : 0;
              const soldPct = total > 0 ? (admin.soldPlots / total) * 100 : 0;

              return (
                <div
                  key={admin.id}
                  className="sa-bar-row"
                  onClick={() => navigate(`/super-admin/admins/${admin.id}`)}
                  onMouseEnter={() => setActiveTooltip(admin.id)}
                  onMouseLeave={() => setActiveTooltip(null)}
                  title={`View details for ${admin.name}`}
                >
                  <div className="sa-bar-info">
                    <span className="sa-bar-label">{admin.name}</span>
                    <span className="sa-bar-total">{total} plots</span>
                  </div>

                  <div className="sa-stacked-track">
                    {total === 0 ? (
                      <div className="sa-empty-bar">No assigned plots</div>
                    ) : (
                      <>
                        <div
                          className="sa-segment available"
                          style={{ width: `${availPct}%` }}
                        />
                        <div
                          className="sa-segment reserved"
                          style={{ width: `${resPct}%` }}
                        />
                        <div
                          className="sa-segment sold"
                          style={{ width: `${soldPct}%` }}
                        />
                      </>
                    )}
                  </div>

                  {/* Micro Tooltip */}
                  {activeTooltip === admin.id && total > 0 && (
                    <div className="sa-tooltip" role="tooltip">
                      <strong>{admin.name}</strong>
                      <div className="sa-tooltip-row">
                        <span>Available:</span>
                        <b>{admin.availablePlots} ({availPct.toFixed(1)}%)</b>
                      </div>
                      <div className="sa-tooltip-row">
                        <span>Reserved:</span>
                        <b>{admin.reservedPlots} ({resPct.toFixed(1)}%)</b>
                      </div>
                      <div className="sa-tooltip-row">
                        <span>Sold:</span>
                        <b>{admin.soldPlots} ({soldPct.toFixed(1)}%)</b>
                      </div>
                      <div className="sa-tooltip-total">
                        <span>Total:</span>
                        <b>{total} plots</b>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* =====================================================
            CHART 2: PROJECTS HANDLED BY ADMIN
        ===================================================== */}
        <div className="sa-chart-card">
          <div className="sa-chart-header">
            <div>
              <h3>Projects Handled by Administrator</h3>
            </div>
          </div>

          <div className="sa-single-bar-list">
            {rows.map((admin) => {
              const widthPct = (admin.projectsCount / maxProjects) * 100;

              return (
                <div
                  key={admin.id}
                  className="sa-bar-row"
                  onClick={() => navigate(`/super-admin/admins/${admin.id}`)}
                  title={`View details for ${admin.name}`}
                >
                  <div className="sa-bar-info">
                    <span className="sa-bar-label">{admin.name}</span>
                    <span className="sa-bar-total">
                      {admin.projectsCount} {admin.projectsCount === 1 ? "project" : "projects"}
                    </span>
                  </div>

                  <div className="sa-single-track">
                    <div
                      className="sa-single-bar"
                      style={{ width: `${Math.max(widthPct, admin.projectsCount > 0 ? 8 : 0)}%` }}
                    >
                      {admin.projectsCount > 0 && (
                        <span className="sa-bar-badge">{admin.projectsCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SuperAdminAnalytics;
