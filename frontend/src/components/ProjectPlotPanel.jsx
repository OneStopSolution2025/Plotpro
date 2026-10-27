import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Search,
  RefreshCw,
  LandPlot,
  Ruler,
  Compass,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Ban,
  Layers,
} from "lucide-react";
import { getProjectRouteSlug } from "../context/ProjectContext";
import "../css/ProjectPlotPanel.css";

/**
 * ProjectPlotPanel — Responsive Slide-Over Plot Selection Drawer
 *
 * Displays authoritative, database-driven plot records for a project with:
 * - Unified status metrics filter strip (No duplicate count rows)
 * - Strict plot deduplication (no repeated plot items)
 * - PlotPro brand terracotta theme styling
 * - Status filter and live plot search
 * - Plot cards with dimensions, facing, formatted pricing, status badge
 * - Direct navigation to Plot Details
 */
export default function ProjectPlotPanel({
  isOpen,
  onClose,
  project,
  allProjects = [],
  plots = [],
  isLoading = false,
  error = null,
  onRefresh,
}) {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Defensive deduplication to ensure no plot is ever rendered twice
  const uniquePlots = useMemo(() => {
    const seenIds = new Set();
    const seenNumbers = new Set();
    const result = [];

    (plots || []).forEach((p) => {
      const idKey = String(p._id || p.id || "");
      const numKey = String(p.plotNumber || "").trim().toLowerCase();

      if (idKey && seenIds.has(idKey)) return;
      if (numKey && seenNumbers.has(numKey)) return;

      if (idKey) seenIds.add(idKey);
      if (numKey) seenNumbers.add(numKey);
      result.push(p);
    });

    result.sort((a, b) => {
      const numA = String(a.plotNumber || "").trim();
      const numB = String(b.plotNumber || "").trim();
      return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: "base" });
    });

    return result;
  }, [plots]);

  // Grouped counts based on unique database plot records
  const counts = useMemo(() => {
    const total = uniquePlots.length;
    let available = 0;
    let reserved = 0;
    let sold = 0;

    uniquePlots.forEach((p) => {
      const status = (p.status || "").toLowerCase().trim();
      if (status === "available") available++;
      else if (status === "reserved") reserved++;
      else if (status === "sold") sold++;
    });

    return { total, available, reserved, sold };
  }, [uniquePlots]);

  // Filtered and searched plot list
  const filteredPlots = useMemo(() => {
    return uniquePlots.filter((plot) => {
      const status = (plot.status || "Available").trim();

      // Status Filter
      if (activeFilter !== "All" && status.toLowerCase() !== activeFilter.toLowerCase()) {
        return false;
      }

      // Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const num = String(plot.plotNumber || "").toLowerCase();
        const size = String(plot.size || "").toLowerCase();
        const facing = String(plot.facing || "").toLowerCase();
        const price = String(plot.price || "").toLowerCase();
        if (
          !num.includes(query) &&
          !size.includes(query) &&
          !facing.includes(query) &&
          !price.includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [uniquePlots, activeFilter, searchQuery]);

  // Navigate to plot details using standard PlotPro routing
  const handlePlotClick = (plot) => {
    onClose();
    const projectSlug =
      getProjectRouteSlug(project, allProjects) || project?.slug || project?.customId || project?._id || project?.id;
    const plotSlug = plot.plotNumber
      ? encodeURIComponent(plot.plotNumber)
      : plot.customId || plot.id || plot._id;

    const url = projectSlug
      ? `/plot-details/${projectSlug}/${plotSlug}`
      : `/plot-details/${plot.customId || plot.id || plot._id}`;

    navigate(url);
  };

  const projectTitle = project?.title || "Project Plots";

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`plot-panel-backdrop ${isOpen ? "open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer */}
      <aside
        className={`plot-panel-drawer ${isOpen ? "open" : ""}`}
        aria-label="Project Plot Selection Panel"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <header className="plot-panel-header">
          <div className="plot-panel-title-group">
            <div className="plot-panel-icon">
              <LandPlot size={20} />
            </div>
            <div>
              <h2 className="plot-panel-heading">{projectTitle}</h2>
              <p className="plot-panel-subheading">Select a plot to view details and availability</p>
            </div>
          </div>
          <div className="plot-panel-actions">
            {onRefresh && (
              <button
                type="button"
                className="plot-panel-btn-icon"
                onClick={onRefresh}
                title="Refresh plot inventory"
                aria-label="Refresh plot list"
                disabled={isLoading}
              >
                <RefreshCw size={16} className={isLoading ? "spin" : ""} />
              </button>
            )}
            <button
              type="button"
              className="plot-panel-btn-icon"
              onClick={onClose}
              title="Close panel (Esc)"
              aria-label="Close plot panel"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Unified Interactive Status Filter Strip (Single Source of Counts) */}
        <section className="plot-panel-metrics" role="tablist" aria-label="Filter plots by status">
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "All"}
            className={`metric-pill ${activeFilter === "All" ? "is-active" : ""}`}
            onClick={() => setActiveFilter("All")}
            title="Show all plots"
          >
            <span className="metric-val">{counts.total}</span>
            <span className="metric-lbl">All Plots</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "Available"}
            className={`metric-pill available ${activeFilter === "Available" ? "is-active" : ""}`}
            onClick={() => setActiveFilter("Available")}
            title="Filter by available plots"
          >
            <span className="metric-val">{counts.available}</span>
            <span className="metric-lbl">Available</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "Reserved"}
            className={`metric-pill reserved ${activeFilter === "Reserved" ? "is-active" : ""}`}
            onClick={() => setActiveFilter("Reserved")}
            title="Filter by reserved plots"
          >
            <span className="metric-val">{counts.reserved}</span>
            <span className="metric-lbl">Reserved</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "Sold"}
            className={`metric-pill sold ${activeFilter === "Sold" ? "is-active" : ""}`}
            onClick={() => setActiveFilter("Sold")}
            title="Filter by sold plots"
          >
            <span className="metric-val">{counts.sold}</span>
            <span className="metric-lbl">Sold</span>
          </button>
        </section>

        {/* Search Bar */}
        <section className="plot-panel-controls">
          <div className="plot-panel-search">
            <Search size={16} className="plot-panel-search-icon" />
            <input
              type="text"
              className="plot-panel-search-input"
              placeholder={`Search in ${activeFilter === "All" ? "all plots" : `${activeFilter.toLowerCase()} plots`} (number, size, facing)...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search plots"
            />
            {searchQuery && (
              <button
                type="button"
                className="plot-panel-search-clear"
                onClick={() => setSearchQuery("")}
                title="Clear search"
                aria-label="Clear search query"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </section>

        {/* Scrollable Body List */}
        <div className="plot-panel-body">
          {isLoading && uniquePlots.length === 0 ? (
            <div className="plot-panel-state">
              <div className="plot-panel-spinner" />
              <h4>Loading Plots...</h4>
              <p>Fetching authoritative plot records from the database.</p>
            </div>
          ) : error ? (
            <div className="plot-panel-state">
              <div className="plot-panel-state-icon">
                <AlertCircle size={24} />
              </div>
              <h4>Failed to Load Plots</h4>
              <p>{error.message || "An unexpected error occurred while loading plot records."}</p>
              {onRefresh && (
                <button
                  type="button"
                  className="plot-panel-retry-btn"
                  onClick={onRefresh}
                >
                  Retry Loading
                </button>
              )}
            </div>
          ) : filteredPlots.length === 0 ? (
            <div className="plot-panel-state">
              <div className="plot-panel-state-icon">
                {activeFilter === "Sold" ? (
                  <Ban size={24} />
                ) : activeFilter === "Reserved" ? (
                  <Clock size={24} />
                ) : (
                  <Layers size={24} />
                )}
              </div>
              <h4>No Plots Found</h4>
              <p>
                {searchQuery
                  ? `No plots match "${searchQuery}".`
                  : activeFilter !== "All"
                  ? `There are currently no ${activeFilter.toLowerCase()} plots in this project.`
                  : "No plot records have been added to this project yet."}
              </p>
              {(searchQuery || activeFilter !== "All") && (
                <button
                  type="button"
                  className="plot-panel-reset-btn"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveFilter("All");
                  }}
                >
                  Show All Plots
                </button>
              )}
            </div>
          ) : (
            filteredPlots.map((plot) => {
              const status = (plot.status || "Available").trim();
              const statusClass = status.toLowerCase();

              return (
                <div
                  key={plot.id || plot._id || plot.plotNumber}
                  className="plot-list-item"
                  onClick={() => handlePlotClick(plot)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handlePlotClick(plot);
                    }
                  }}
                  aria-label={`Plot ${plot.plotNumber}, Status: ${status}`}
                >
                  <div className="plot-item-left">
                    <div className="plot-item-header">
                      <span className="plot-item-number">Plot {plot.plotNumber}</span>
                      <span className={`plot-status-tag ${statusClass}`}>
                        {statusClass === "available" && <CheckCircle2 size={12} />}
                        {statusClass === "reserved" && <Clock size={12} />}
                        {statusClass === "sold" && <Ban size={12} />}
                        {status}
                      </span>
                    </div>

                    <div className="plot-item-specs">
                      {plot.size && (
                        <span className="spec-badge">
                          <Ruler size={13} />
                          {plot.size}
                        </span>
                      )}
                      {plot.facing && (
                        <span className="spec-badge">
                          <Compass size={13} />
                          {plot.facing} Facing
                        </span>
                      )}
                    </div>

                    {plot.price && (
                      <div className="plot-item-price">{plot.price}</div>
                    )}
                  </div>

                  <div className="plot-item-action" title="View Plot Details">
                    <ArrowRight size={16} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
