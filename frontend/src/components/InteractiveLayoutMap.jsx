import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  ArrowRight,
  X,
  Compass,
  Ruler,
  IndianRupee,
  MapPin,
  CheckCircle,
  AlertCircle,
  Trees,
} from "lucide-react";
import { getProjectRouteSlug } from "../context/ProjectContext";
import "../css/InteractiveLayoutMap.css";

/**
 * InteractiveLayoutMap Component
 * Pure Native SVG Real-Estate Site Plan Diagram with Dual-Layer Block & Availability Rendering
 *
 * Renders individual plots with deterministic block color identity, live availability overlays
 * (Available, Reserved hatch, Sold strike-through), native roads, parks, and North compass.
 * Authoritative plot availability (Available / Reserved / Sold) is derived live from Plot records.
 */
export default function InteractiveLayoutMap({ project, plots = [], allProjects = [] }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const viewportRef = useRef(null);

  // Layout configuration from project
  const layout = project?.layout || {};
  const regions = Array.isArray(layout.regions) ? layout.regions : [];
  const blocks = Array.isArray(layout.blocks) ? layout.blocks : [];
  const roads = Array.isArray(layout.roads) ? layout.roads : [];
  const commonAreas = Array.isArray(layout.commonAreas) ? layout.commonAreas : [];
  const compassAngle = Number(layout.compassOrientation) || 0;

  const hasNativeDiagram = regions.length > 0;

  const referenceImageUrl = layout.referenceImageUrl || layout.imageUrl || project?.image || "";

  const [imgOpacity, setImgOpacity] = useState(0.9);

  // Filtering states
  const [selectedBlockId, setSelectedBlockId] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Selection & Hover states
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [clickPos, setClickPos] = useState({ x: 0, y: 0 });

  // Diagram viewBox dimensions (default 1200 x 800)
  const imgDimensions = useMemo(() => ({
    width: Number(layout.width) || 1200,
    height: Number(layout.height) || 800,
  }), [layout.width, layout.height]);

  // Map blocks by stable id
  const blockMap = useMemo(() => {
    const map = new Map();
    blocks.forEach((b) => map.set(b.id, b));
    return map;
  }, [blocks]);

  // Map plots by customId / _id / plotNumber for authoritative lookup
  const plotsLookup = useMemo(() => {
    const map = new Map();
    plots.forEach((p) => {
      if (p._id) map.set(String(p._id), p);
      if (p.id) map.set(String(p.id), p);
      if (p.customId) map.set(String(p.customId), p);
      if (p.plotNumber) map.set(`num_${String(p.plotNumber)}`, p);
    });
    return map;
  }, [plots]);

  const handleMouseMove = (e) => {
    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  // Resolve authoritative plot details for a given region
  const getAuthoritativePlot = useCallback(
    (region) => {
      if (!region) return null;
      let p = plotsLookup.get(String(region.plotId));
      if (!p && region.plotNumber) {
        p = plotsLookup.get(`num_${String(region.plotNumber)}`);
      }
      return p || null;
    },
    [plotsLookup]
  );

  // Navigate to existing Plot Details route
  const handleNavigateToPlot = (plot) => {
    if (!plot) return;
    const projectSlug =
      getProjectRouteSlug(project, allProjects) || project.slug || project.id || project.customId;
    const plotSlug = plot.plotNumber ? encodeURIComponent(plot.plotNumber) : plot.id;

    if (projectSlug && plot.plotNumber) {
      navigate(`/plot-details/${projectSlug}/${plotSlug}`);
    } else {
      navigate(`/plot-details/${plot.id || plot._id}`);
    }
  };

  // Convert normalized polygon points (0 - 100%) to SVG viewBox coordinate string
  const getSvgPointsString = (points) => {
    if (!Array.isArray(points)) return "";
    return points
      .map((p) => `${(p.x * imgDimensions.width) / 100},${(p.y * imgDimensions.height) / 100}`)
      .join(" ");
  };

  // Compute centroid of polygon for label positioning
  const getPolygonCentroid = (points) => {
    if (!Array.isArray(points) || points.length === 0) return { x: 0, y: 0 };
    let sumX = 0;
    let sumY = 0;
    points.forEach((pt) => {
      sumX += (pt.x * imgDimensions.width) / 100;
      sumY += (pt.y * imgDimensions.height) / 100;
    });
    return {
      x: sumX / points.length,
      y: sumY / points.length,
    };
  };

  // Active plot details for selected region
  const activePlot = useMemo(() => {
    if (!selectedRegion) return null;
    return getAuthoritativePlot(selectedRegion);
  }, [selectedRegion, getAuthoritativePlot]);

  // Fallback empty state if no native vector diagram is configured
  if (!hasNativeDiagram) {
    return (
      <div className="layout-empty-wrapper">
        <div className="layout-empty-card">
          <MapPin size={42} className="layout-empty-icon" />
          <h3>Native Layout Diagram Not Configured</h3>
          <p>
            The vector layout plan and plot boundaries have not yet been configured for this project.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="interactive-layout-container" ref={containerRef}>
      {/* Header Toolbar */}
      <div className="layout-header-toolbar">

        <div className="layout-toolbar-actions">
          {/* Blueprint Opacity Toggle */}
          {referenceImageUrl && (
            <div className="blueprint-opacity-control">
              <span className="control-label">Blueprint:</span>
              <button
                type="button"
                className={`opacity-toggle-btn ${imgOpacity === 0 ? "inactive" : ""}`}
                onClick={() => setImgOpacity((prev) => (prev > 0 ? 0 : 0.9))}
                title="Toggle blueprint image visibility"
              >
                {imgOpacity > 0 ? "Visible" : "Hidden"}
              </button>
            </div>
          )}

          {/* Block Filter */}
          {blocks.length > 0 && (
            <select
              className="block-filter-select"
              value={selectedBlockId}
              onChange={(e) => setSelectedBlockId(e.target.value)}
              aria-label="Filter by block"
            >
              <option value="ALL">All Blocks ({blocks.length})</option>
              {blocks.map((blk) => (
                <option key={blk.id} value={blk.id}>
                  {blk.name}
                </option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <select
            className="status-filter-select"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            aria-label="Filter by plot status"
          >
            <option value="ALL">All Statuses</option>
            <option value="Available">Available (Green)</option>
            <option value="Reserved">Reserved (Yellow)</option>
            <option value="Sold">Sold (Red)</option>
          </select>
        </div>
      </div>

      {/* Main Viewport Container — Fixed Size, Zero Scroll, Clean Static Display */}
      <div
        className="layout-viewport-wrapper site-plan-viewport static-viewport"
        ref={viewportRef}
        onMouseMove={handleMouseMove}
      >
        <div
          className="layout-canvas-content fixed-aspect-frame"
          style={{
            height: "100%",
            maxHeight: "440px",
            aspectRatio: `${imgDimensions.width} / ${imgDimensions.height}`,
            maxWidth: "100%",
            position: "relative",
            margin: "0 auto",
          }}
        >
          {/* UPLOADED REFERENCE BLUEPRINT IMAGE IN THE BACKGROUND */}
          {referenceImageUrl && (
            <img
              src={referenceImageUrl}
              alt="Site Blueprint"
              className="site-plan-reference-image"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "fill",
                opacity: imgOpacity,
                zIndex: 1,
                pointerEvents: "none",
                borderRadius: "8px",
                transition: "opacity 0.2s ease-in-out",
              }}
            />
          )}

          {/* DETECTED VECTOR SVG OVERLAY DIRECTLY ON TOP */}
          <svg
            className="layout-native-svg-canvas"
            viewBox={`0 0 ${imgDimensions.width} ${imgDimensions.height}`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              zIndex: 2,
              background: referenceImageUrl && imgOpacity > 0 ? "transparent" : "#ffffff",
              borderRadius: "8px",
            }}
          >
            <defs>
              {/* Optional Subtle Grid Pattern when blueprint is hidden */}
              {(!referenceImageUrl || imgOpacity === 0) && (
                <pattern
                  id="sitePlanGrid"
                  width="40"
                  height="40"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 40 0 L 0 0 0 40"
                    fill="none"
                    stroke="#f1f5f9"
                    strokeWidth="1"
                  />
                </pattern>
              )}

              {/* Reserved Status Diagonal Hatch Pattern */}
              <pattern
                id="reservedHatch"
                width="8"
                height="8"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="8" stroke="#d97706" strokeWidth="2.5" opacity="0.6" />
              </pattern>
            </defs>

            {/* If blueprint is hidden, render crisp neutral background */}
            {(!referenceImageUrl || imgOpacity === 0) && (
              <rect
                x="0"
                y="0"
                width={imgDimensions.width}
                height={imgDimensions.height}
                fill="url(#sitePlanGrid)"
              />
            )}

            {/* Roads Layer */}
            {roads.map((road, idx) => {
              const centroid = getPolygonCentroid(road.points);
              return (
                <g key={road.id || `road_${idx}`} className="vector-road-group">
                  <polygon
                    points={getSvgPointsString(road.points)}
                    className="vector-road-polygon"
                  />
                  {road.name && (
                    <text
                      x={centroid.x}
                      y={centroid.y}
                      className="vector-road-label"
                    >
                      {road.name} {road.widthFt ? `(${road.widthFt})` : ""}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Parks and Common Areas Layer */}
            {commonAreas.map((area, idx) => {
              const centroid = getPolygonCentroid(area.points);
              return (
                <g key={area.id || `common_${idx}`} className="vector-park-group">
                  <polygon
                    points={getSvgPointsString(area.points)}
                    className="vector-park-polygon"
                  />
                  {area.name && (
                    <text
                      x={centroid.x}
                      y={centroid.y}
                      className="vector-park-label"
                    >
                      🌳 {area.name}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Plot Polygons Layer (Green Available, Yellow Reserved, Red Sold) */}
            {regions.map((region, index) => {
              const plot = getAuthoritativePlot(region);
              const status = plot?.status || "Available";

              // Resolve Block association
              const blockObj = region.blockId ? blockMap.get(region.blockId) : null;

              // Filter check
              const isBlockMatch =
                selectedBlockId === "ALL" ||
                region.blockId === selectedBlockId ||
                (!region.blockId && region.block === selectedBlockId);
              const isStatusMatch = selectedStatus === "ALL" || status === selectedStatus;
              const isFilteredOut = !isBlockMatch || !isStatusMatch;

              const isSelected = selectedRegion?.id === region.id;
              const centroid = getPolygonCentroid(region.points);

              // Status colors requested:
              // Available -> Green (#059669)
              // Reserved  -> Yellow (#d97706)
              // Sold      -> Red (#dc2626)
              const statusLower = status.toLowerCase();
              let fillStyle = "rgba(16, 185, 129, 0.45)"; // Available (Green)
              let strokeColor = "#059669";
              let strokeDash = "none";
              let strokeWidth = isSelected ? "3.5" : "2";

              if (statusLower === "reserved") {
                fillStyle = "rgba(245, 158, 11, 0.5)"; // Reserved (Yellow)
                strokeColor = "#d97706";
                strokeDash = "4 2";
              } else if (statusLower === "sold") {
                fillStyle = "rgba(239, 68, 68, 0.5)"; // Sold (Red)
                strokeColor = "#dc2626";
              }

              return (
                <g key={region.id || index} className="vector-plot-group">
                  <polygon
                    points={getSvgPointsString(region.points)}
                    fill={fillStyle}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDash}
                    className={`vector-plot-polygon status-${statusLower} ${isSelected ? "is-selected" : ""} ${
                      isFilteredOut ? "is-filtered-out" : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (viewportRef.current) {
                        const rect = viewportRef.current.getBoundingClientRect();
                        setClickPos({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top,
                        });
                      }
                      setSelectedRegion(region);
                    }}
                    onMouseEnter={() => setHoveredRegion(region)}
                    onMouseLeave={() => setHoveredRegion(null)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Plot ${region.plotNumber}, Status: ${status}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedRegion(region);
                      }
                    }}
                  />

                  {/* High Contrast Plot Number Label with Crisp White Stroke */}
                  {!isFilteredOut && (
                    <text
                      x={centroid.x}
                      y={centroid.y}
                      fill={statusLower === "sold" ? "#991b1b" : "#0f172a"}
                      fontSize="12"
                      fontWeight="800"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      pointerEvents="none"
                      style={{
                        paintOrder: "stroke fill",
                        stroke: "#ffffff",
                        strokeWidth: "3.5px",
                        strokeLinejoin: "round",
                      }}
                    >
                      {region.plotNumber}
                    </text>
                  )}
                </g>
              );
            })}

            {/* North Compass Rose Widget */}
            <g
              className="vector-compass-widget"
              transform={`translate(${imgDimensions.width - 55}, 55) rotate(${compassAngle})`}
            >
              <circle cx="0" cy="0" r="24" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" filter="drop-shadow(0 2px 5px rgba(0,0,0,0.15))" />
              <polygon points="0,-20 5,0 0,-3" fill="#dc2626" />
              <polygon points="0,20 5,0 0,3" fill="#64748b" />
              <polygon points="0,-20 -5,0 0,-3" fill="#ef4444" />
              <polygon points="0,20 -5,0 0,3" fill="#94a3b8" />
              <circle cx="0" cy="0" r="2.5" fill="#0f172a" />
              <text x="0" y="-11" textAnchor="middle" fontSize="9" fontWeight="800" fill="#dc2626">N</text>
            </g>
          </svg>
        </div>

        {/* Small Popup Modal Near Mouse Pointer when a Plot is clicked */}
        {selectedRegion && (() => {
          const vpWidth = viewportRef.current?.clientWidth || 500;
          const vpHeight = viewportRef.current?.clientHeight || 400;
          // Position cleanly: if click is in top half, render below click; otherwise render above
          const isNearTop = clickPos.y < 160;
          const leftClamped = Math.min(Math.max(clickPos.x, 115), vpWidth - 115);
          const topPos = isNearTop ? clickPos.y + 15 : clickPos.y - 15;
          const transformVal = isNearTop ? "translate(-50%, 0)" : "translate(-50%, -100%)";

          return (
            <div
              className={`plot-mouse-popover-modal ${isNearTop ? "popover-below" : "popover-above"}`}
              style={{
                left: `${leftClamped}px`,
                top: `${topPos}px`,
                transform: transformVal,
              }}
              onClick={(e) => e.stopPropagation()}
            >
            <div className="popover-header">
              <div className="popover-title-wrap">
                <span className="popover-plot-num">Plot #{selectedRegion.plotNumber}</span>
                {selectedRegion.block && (
                  <span className="popover-block-tag">{selectedRegion.block}</span>
                )}
              </div>
              <button
                type="button"
                className="popover-close-btn"
                onClick={() => setSelectedRegion(null)}
                title="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="popover-body">
              <div className="popover-status-row">
                <span className={`popover-status-pill ${(activePlot?.status || "Available").toLowerCase()}`}>
                  {activePlot?.status || "Available"}
                </span>
                {activePlot?.size && <span className="popover-spec-size">{activePlot.size}</span>}
              </div>
              {activePlot?.price && (
                <div className="popover-price">
                  ₹ {String(activePlot.price).replace(/^[₹\s]+/, "")}
                </div>
              )}
            </div>

            <button
              type="button"
              className="popover-redirect-btn"
              onClick={() =>
                handleNavigateToPlot(
                  activePlot || {
                    plotNumber: selectedRegion.plotNumber,
                    id: selectedRegion.plotId,
                  }
                )
              }
            >
              <span>View Plot Details</span>
              <ArrowRight size={14} />
            </button>
          </div>
          );
        })()}

        {/* Hover Tooltip (shown only when no modal popover is open) */}
        {hoveredRegion && !selectedRegion && (
          <div
            className="plot-map-tooltip"
            style={{
              left: `${mousePos.x}px`,
              top: `${mousePos.y}px`,
            }}
          >
            <strong>Plot #{hoveredRegion.plotNumber}</strong>
            {hoveredRegion.block && <span> • {hoveredRegion.block}</span>}
            <span> • {getAuthoritativePlot(hoveredRegion)?.status || "Available"}</span>
          </div>
        )}
      </div>

      {/* Legend & Filter Bar */}
      <div className="layout-legend-bar">
        <div className="legend-items-group">
          {/* Availability Status Indicators */}
          <div className="legend-item">
            <span className="legend-color-dot available" />
            <span className="legend-text">Available (Green)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color-dot reserved" />
            <span className="legend-text">Reserved (Yellow)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color-dot sold" />
            <span className="legend-text">Sold (Red)</span>
          </div>

          {/* Configured Blocks Swatches */}
          {blocks.length > 0 && (
            <div style={{ display: "flex", gap: "0.75rem", borderLeft: "1px solid #cbd5e1", paddingLeft: "0.75rem" }}>
              {blocks.map((b) => (
                <div key={b.id} className="legend-item">
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "3px",
                      background: b.color || "#3b82f6",
                      display: "inline-block",
                    }}
                  />
                  <span>{b.name}</span>
                </div>
              ))}
            </div>
          )}

          <div className="legend-item">
            <span className="legend-color-dot road-dot" />
            <span>Roads</span>
          </div>
          <div className="legend-item">
            <span className="legend-color-dot park-dot" />
            <span>Parks</span>
          </div>
        </div>
      </div>
    </div>
  );
}
