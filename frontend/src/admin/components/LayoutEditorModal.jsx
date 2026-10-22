import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  X,
  Plus,
  Trash2,
  Save,
  Check,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Hand,
  PenTool,
  UploadCloud,
  Layers,
  Search,
  Eye,
  EyeOff,
  Compass,
  MapPin,
  Trees,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  FolderPlus,
  RefreshCw,
  Crosshair,
} from "lucide-react";
import { superAdminApi } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import "../../css/LayoutEditorModal.css";

// 10-Color Deterministic Palette
export const BLOCK_PALETTE = [
  "#2563eb", // Block A - Blue
  "#7c3aed", // Block B - Purple
  "#059669", // Block C - Teal
  "#d97706", // Block D - Amber
  "#e11d48", // Block E - Rose
  "#4f46e5", // Block F - Indigo
  "#0891b2", // Block G - Cyan
  "#65a30d", // Block H - Lime
  "#ea580c", // Block I - Orange
  "#475569", // Block J - Slate
];

/**
 * Super Admin Layout Editor Modal
 * Native Site-Plan Studio with Semi-Automatic Vectorization & Block Management.
 */
export default function LayoutEditorModal({ project, plots = [], onClose, onSaveSuccess }) {
  const { showToast } = useToast();
  const workspaceRef = useRef(null);

  // Layout image & dimensions
  const [imageUrl, setImageUrl] = useState(
    project?.layout?.referenceImageUrl || project?.layout?.imageUrl || ""
  );
  const [publicId, setPublicId] = useState(project?.layout?.publicId || "");
  const [imgDimensions, setImgDimensions] = useState({
    width: project?.layout?.width || 1200,
    height: project?.layout?.height || 800,
  });
  const [currentVersion, setCurrentVersion] = useState(project?.layout?.version || 0);

  // Tracing Reference Image controls
  const [showReferenceImage, setShowReferenceImage] = useState(true);
  const [referenceOpacity, setReferenceOpacity] = useState(0.5);

  // Compass Orientation (degrees, 0 = North up)
  const [compassOrientation, setCompassOrientation] = useState(
    Number(project?.layout?.compassOrientation) || 0
  );

  // Sidebar Tab: "BLOCKS" | "PLOTS" | "CANDIDATES" | "ROADS" | "PARKS" | "SETTINGS"
  const [activeTab, setActiveTab] = useState("BLOCKS");

  // Elements data
  const [blocks, setBlocks] = useState(
    Array.isArray(project?.layout?.blocks) ? project.layout.blocks : []
  );
  const [regions, setRegions] = useState(
    Array.isArray(project?.layout?.regions)
      ? JSON.parse(JSON.stringify(project.layout.regions))
      : []
  );
  const [roads, setRoads] = useState(
    Array.isArray(project?.layout?.roads)
      ? JSON.parse(JSON.stringify(project.layout.roads))
      : []
  );
  const [commonAreas, setCommonAreas] = useState(
    Array.isArray(project?.layout?.commonAreas)
      ? JSON.parse(JSON.stringify(project.layout.commonAreas))
      : []
  );

  // Semi-Automatic Detection Candidates Layer
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [detectionProvider, setDetectionProvider] = useState("opencv");
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionNotice, setDetectionNotice] = useState("");
  const [draggingCandidateVertexIndex, setDraggingCandidateVertexIndex] = useState(null);
  const [draggingRegionVertex, setDraggingRegionVertex] = useState(null); // { regionId, vertexIndex }

  // Editor interaction mode: "DRAW_PLOT" | "DRAW_ROAD" | "DRAW_PARK" | "PAN"
  const [editorMode, setEditorMode] = useState("DRAW_PLOT");

  // Selection & Active Drawing states
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [selectedPlotId, setSelectedPlotId] = useState(null);
  const [activeRegionId, setActiveRegionId] = useState(null);
  const [currentPoints, setCurrentPoints] = useState([]); // In-progress polygon points: [{x, y}] in %
  const [plotSearchTerm, setPlotSearchTerm] = useState("");

  // New Block input state
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockColor, setNewBlockColor] = useState(BLOCK_PALETTE[0]);

  // Road inputs
  const [roadName, setRoadName] = useState("Main Road");
  const [roadWidth, setRoadWidth] = useState("30 Ft");

  // Park inputs
  const [parkName, setParkName] = useState("Community Park");

  // Zoom & Pan viewport
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const wasDraggingRef = useRef(false);

  // Uploading & Saving states
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");

  // Load existing layout details
  useEffect(() => {
    if (project?._id || project?.id) {
      superAdminApi
        .getProjectLayout(project._id || project.id)
        .then((res) => {
          if (res?.success) {
            if (!res.data?.storageConfigured) {
              setStorageWarning(
                "Cloudinary persistent storage is not configured in backend environment variables. Image uploads require CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
              );
            }
            const l = res.data?.layout;
            if (l) {
              const refImg = l.referenceImageUrl || l.imageUrl;
              if (refImg && !imageUrl) {
                setImageUrl(refImg);
                setPublicId(l.publicId || "");
              }
              if (l.width && l.height) {
                setImgDimensions({ width: l.width, height: l.height });
              }
              if (l.version !== undefined) {
                setCurrentVersion(l.version);
              }
              if (Array.isArray(l.blocks) && l.blocks.length > 0 && blocks.length === 0) {
                setBlocks(l.blocks);
                if (!selectedBlockId && l.blocks[0]) setSelectedBlockId(l.blocks[0].id);
              }
              if (Array.isArray(l.roads) && l.roads.length > 0 && roads.length === 0) {
                setRoads(l.roads);
              }
              if (Array.isArray(l.commonAreas) && l.commonAreas.length > 0 && commonAreas.length === 0) {
                setCommonAreas(l.commonAreas);
              }
              if (l.compassOrientation !== undefined) {
                setCompassOrientation(Number(l.compassOrientation) || 0);
              }
            }
          }
        })
        .catch(() => {});
    }
  }, [project]);

  // Set default block if none selected
  useEffect(() => {
    if (!selectedBlockId && blocks.length > 0) {
      setSelectedBlockId(blocks[0].id);
    }
  }, [blocks, selectedBlockId]);

  // Image load event to calibrate intrinsic aspect ratio
  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    if (naturalWidth && naturalHeight) {
      setImgDimensions({ width: naturalWidth, height: naturalHeight });
    }
  };

  // Mapped Plot IDs set for fast lookup
  const mappedPlotIds = useMemo(() => {
    const set = new Set();
    regions.forEach((r) => {
      if (r.plotId) set.add(String(r.plotId));
    });
    return set;
  }, [regions]);

  // Blocks map lookup
  const blockMap = useMemo(() => {
    const map = new Map();
    blocks.forEach((b) => map.set(b.id, b));
    return map;
  }, [blocks]);

  // Canvas Click Handler (Adding vertices)
  const handleCanvasClick = (e) => {
    if (editorMode === "PAN" || isDragging || wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }
    if (e.button !== 0) return; // Only primary left-clicks add points
    if (e.target.closest(".editor-vertex-handle") || e.target.closest(".remove-boundary-btn") || e.target.closest(".candidate-click-popover")) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const unscaledX = (clientX - pan.x) / zoom;
    const unscaledY = (clientY - pan.y) / zoom;

    const normX = Math.max(0, Math.min(100, (unscaledX / imgDimensions.width) * 100));
    const normY = Math.max(0, Math.min(100, (unscaledY / imgDimensions.height) * 100));

    setCurrentPoints((prev) => [
      ...prev,
      { x: Number(normX.toFixed(3)), y: Number(normY.toFixed(3)) },
    ]);
  };

  // Finish current polygon drawing
  const handleFinishCurrentDrawing = () => {
    if (currentPoints.length < 3) {
      showToast("A boundary polygon must have at least 3 points.", "error");
      return;
    }

    if (editorMode === "DRAW_PLOT") {
      if (!selectedPlotId) {
        showToast("Select a plot from the inventory list to assign this boundary.", "error");
        return;
      }

      const matchedPlot = plots.find((p) => String(p._id || p.id) === String(selectedPlotId));
      if (!matchedPlot) {
        showToast("Selected plot could not be found.", "error");
        return;
      }

      const activeBlockObj = blockMap.get(selectedBlockId);
      const newRegion = {
        id: `reg_${Date.now()}`,
        plotId: matchedPlot._id || matchedPlot.id,
        plotNumber: matchedPlot.plotNumber,
        blockId: selectedBlockId || "",
        block: activeBlockObj ? activeBlockObj.name : "",
        shapeType: "polygon",
        points: currentPoints,
      };

      setRegions((prev) => [...prev.filter((r) => String(r.plotId) !== String(matchedPlot._id || matchedPlot.id)), newRegion]);
      showToast(`Plot ${matchedPlot.plotNumber} boundary configured!`, "success");
      setSelectedPlotId(null);
      setActiveRegionId(newRegion.id);
    } else if (editorMode === "DRAW_ROAD") {
      const newRoad = {
        id: `road_${Date.now()}`,
        name: roadName.trim() || `Road ${roads.length + 1}`,
        widthFt: roadWidth.trim() || "30 Ft",
        points: currentPoints,
      };
      setRoads((prev) => [...prev, newRoad]);
      showToast(`Added road "${newRoad.name}"`, "success");
    } else if (editorMode === "DRAW_PARK") {
      const newArea = {
        id: `park_${Date.now()}`,
        name: parkName.trim() || `Park ${commonAreas.length + 1}`,
        type: "park",
        points: currentPoints,
      };
      setCommonAreas((prev) => [...prev, newArea]);
      showToast(`Added park "${newArea.name}"`, "success");
    }

    setCurrentPoints([]);
  };

  // Block Management Handlers
  const handleCreateBlock = () => {
    const name = newBlockName.trim();
    if (!name) {
      showToast("Please enter a block name.", "error");
      return;
    }
    const newId = `blk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nextColor = newBlockColor || BLOCK_PALETTE[blocks.length % BLOCK_PALETTE.length];
    const newBlock = { id: newId, name, color: nextColor, description: "" };
    setBlocks((prev) => [...prev, newBlock]);
    setSelectedBlockId(newId);
    setNewBlockName("");
    setNewBlockColor(BLOCK_PALETTE[(blocks.length + 1) % BLOCK_PALETTE.length]);
    showToast(`Created ${name}`, "success");
  };

  const handleDeleteBlock = (blockId) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    // Clear block association from regions safely without deleting plot records
    setRegions((prev) =>
      prev.map((r) => (r.blockId === blockId ? { ...r, blockId: "", block: "" } : r))
    );
    if (selectedBlockId === blockId) {
      const remaining = blocks.filter((b) => b.id !== blockId);
      setSelectedBlockId(remaining[0]?.id || "");
    }
    showToast("Block removed. Associated plots preserved as unassigned.", "info");
  };

  // Semi-Automatic Detection (OpenCV or Google Gemini AI)
  const handleAutoDetect = async () => {
    if (!imageUrl) {
      showToast("Please upload a reference site-plan image first.", "error");
      return;
    }

    const targetProjectId = project?._id || project?.id || "new";

    setIsDetecting(true);
    setDetectionNotice("");
    try {
      const res = await superAdminApi.detectLayoutCandidates(targetProjectId, {
        imageUrl,
        provider: detectionProvider,
      });
      if (res?.success && res.data) {
        if (res.data.degraded) {
          setDetectionNotice(res.data.message || "Detection engine is degraded. Manual tracing is ready.");
          showToast(res.data.message, "warning");
        } else if (Array.isArray(res.data.candidates)) {
          setCandidates(res.data.candidates);
          setActiveTab("CANDIDATES");
          const providerLabel = detectionProvider === "gemini" ? "Google Gemini AI" : "OpenCV + RapidOCR";
          showToast(`${providerLabel}: Detected ${res.data.candidates.length} visual plot candidates!`, "success");

          // If Gemini returned compass orientation, prompt or apply
          if (typeof res.data.compassOrientation === "number" && res.data.compassOrientation >= 0) {
            setCompassOrientation(Math.round(res.data.compassOrientation));
          }

          // If Gemini suggested new block designations, auto-populate blocks if empty
          if (Array.isArray(res.data.detectedBlocks) && res.data.detectedBlocks.length > 0 && blocks.length === 0) {
            const newBlocks = res.data.detectedBlocks.map((blkName, idx) => ({
              id: `blk_${Date.now()}_${idx}`,
              name: String(blkName).trim(),
              color: BLOCK_PALETTE[idx % BLOCK_PALETTE.length],
            }));
            setBlocks(newBlocks);
            if (newBlocks[0]) setSelectedBlockId(newBlocks[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Layout auto-detection error:", err);
      const msg = err.data?.message || err.message || "Failed to run detection.";
      setDetectionNotice(msg);
      showToast(msg, "error");
    } finally {
      setIsDetecting(false);
    }
  };

  // Accept Candidate and convert to Region
  const handleAcceptCandidate = (cand, targetPlotId) => {
    if (!targetPlotId) {
      showToast("Select a plot record to link with this detected boundary.", "error");
      return;
    }

    const matchedPlot = plots.find((p) => String(p._id || p.id) === String(targetPlotId));
    if (!matchedPlot) {
      showToast("Plot record not found.", "error");
      return;
    }

    const activeBlockObj = blockMap.get(selectedBlockId);
    const newRegion = {
      id: `reg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      plotId: matchedPlot._id || matchedPlot.id,
      plotNumber: matchedPlot.plotNumber,
      blockId: selectedBlockId || "",
      block: activeBlockObj ? activeBlockObj.name : "",
      shapeType: "polygon",
      points: cand.points,
    };

    setRegions((prev) => [
      ...prev.filter((r) => String(r.plotId) !== String(matchedPlot._id || matchedPlot.id)),
      newRegion,
    ]);
    setCandidates((prev) => prev.filter((c) => c.candidateId !== cand.candidateId));
    showToast(`Confirmed Plot ${matchedPlot.plotNumber}`, "success");
  };

  // Dismiss Candidate
  const handleDismissCandidate = (candidateId) => {
    setCandidates((prev) => prev.filter((c) => c.candidateId !== candidateId));
  };

  // Remove region
  const handleRemoveRegion = (regionId) => {
    setRegions((prev) => prev.filter((r) => r.id !== regionId));
    if (activeRegionId === regionId) setActiveRegionId(null);
    showToast("Plot boundary removed", "info");
  };

  // Remove road
  const handleRemoveRoad = (roadId) => {
    setRoads((prev) => prev.filter((r) => r.id !== roadId));
    showToast("Road removed", "info");
  };

  // Remove park
  const handleRemoveCommonArea = (areaId) => {
    setCommonAreas((prev) => prev.filter((a) => a.id !== areaId));
    showToast("Common area removed", "info");
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Wheel Handler: Scroll to Pan image, or Ctrl + Scroll to Zoom In/Out
  const handleWheel = (e) => {
    // If Ctrl (or Meta) is pressed, perform Zoom at cursor position
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoom((prevZoom) => {
        const nextZoom = Math.min(Math.max(prevZoom * zoomFactor, 0.2), 5);
        if (workspaceRef.current) {
          const rect = workspaceRef.current.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          setPan((prevPan) => ({
            x: mouseX - (mouseX - prevPan.x) * (nextZoom / prevZoom),
            y: mouseY - (mouseY - prevPan.y) * (nextZoom / prevZoom),
          }));
        }
        return Number(nextZoom.toFixed(2));
      });
    } else {
      // Normal mouse wheel: Scroll image vertically / horizontally
      e.preventDefault();
      const deltaX = e.shiftKey ? e.deltaY : e.deltaX;
      const deltaY = e.shiftKey ? 0 : e.deltaY;
      setPan((prev) => ({
        x: prev.x - deltaX,
        y: prev.y - deltaY,
      }));
    }
  };

  // Center and focus viewport on a specific candidate
  const handleFocusCandidate = (cand) => {
    if (!cand || !cand.center || !workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
    const centerX_px = (cand.center.x * imgDimensions.width) / 100;
    const centerY_px = (cand.center.y * imgDimensions.height) / 100;
    const targetZoom = 1.8;
    setZoom(targetZoom);
    setPan({
      x: rect.width / 2 - centerX_px * targetZoom,
      y: rect.height / 2 - centerY_px * targetZoom,
    });
  };

  // Update a vertex of the currently selected candidate
  const handleCandidateVertexMove = (index, normX, normY) => {
    if (!selectedCandidate || index === null) return;
    const updatedPoints = selectedCandidate.points.map((pt, i) =>
      i === index ? { x: Number(normX.toFixed(2)), y: Number(normY.toFixed(2)) } : pt
    );
    const updatedCandidate = { ...selectedCandidate, points: updatedPoints };
    setSelectedCandidate(updatedCandidate);
    setCandidates((prev) =>
      prev.map((c) => (c.candidateId === updatedCandidate.candidateId ? updatedCandidate : c))
    );
  };

  // Insert a new vertex into selected candidate
  const handleInsertCandidateVertex = (index) => {
    if (!selectedCandidate) return;
    const pts = selectedCandidate.points;
    const p1 = pts[index];
    const p2 = pts[(index + 1) % pts.length];
    const midX = Number(((p1.x + p2.x) / 2).toFixed(2));
    const midY = Number(((p1.y + p2.y) / 2).toFixed(2));
    const updatedPoints = [...pts.slice(0, index + 1), { x: midX, y: midY }, ...pts.slice(index + 1)];
    const updated = { ...selectedCandidate, points: updatedPoints };
    setSelectedCandidate(updated);
    setCandidates((prev) => prev.map((c) => (c.candidateId === updated.candidateId ? updated : c)));
    showToast("Vertex added to candidate", "info");
  };

  // Delete a vertex from selected candidate
  const handleDeleteCandidateVertex = (index) => {
    if (!selectedCandidate || selectedCandidate.points.length <= 3) {
      showToast("A candidate polygon must retain at least 3 vertices.", "warning");
      return;
    }
    const updatedPoints = selectedCandidate.points.filter((_, i) => i !== index);
    const updated = { ...selectedCandidate, points: updatedPoints };
    setSelectedCandidate(updated);
    setCandidates((prev) => prev.map((c) => (c.candidateId === updated.candidateId ? updated : c)));
    showToast("Vertex removed from candidate", "info");
  };

  // Update a vertex of the currently active confirmed region
  const handleRegionVertexMove = (regionId, vertexIndex, normX, normY) => {
    setRegions((prev) =>
      prev.map((reg) => {
        if (reg.id !== regionId) return reg;
        const newPoints = reg.points.map((pt, i) =>
          i === vertexIndex ? { x: Number(normX.toFixed(2)), y: Number(normY.toFixed(2)) } : pt
        );
        return { ...reg, points: newPoints };
      })
    );
  };

  // Insert a new vertex into confirmed region
  const handleInsertRegionVertex = (regionId, index) => {
    setRegions((prev) =>
      prev.map((reg) => {
        if (reg.id !== regionId) return reg;
        const pts = reg.points;
        const p1 = pts[index];
        const p2 = pts[(index + 1) % pts.length];
        const midX = Number(((p1.x + p2.x) / 2).toFixed(2));
        const midY = Number(((p1.y + p2.y) / 2).toFixed(2));
        const updatedPoints = [...pts.slice(0, index + 1), { x: midX, y: midY }, ...pts.slice(index + 1)];
        return { ...reg, points: updatedPoints };
      })
    );
    showToast("Vertex added to plot boundary", "info");
  };

  // Delete a vertex from confirmed region
  const handleDeleteRegionVertex = (regionId, index) => {
    setRegions((prev) =>
      prev.map((reg) => {
        if (reg.id !== regionId) return reg;
        if (reg.points.length <= 3) {
          showToast("A plot boundary must retain at least 3 vertices.", "warning");
          return reg;
        }
        const updatedPoints = reg.points.filter((_, i) => i !== index);
        showToast("Vertex removed from plot boundary", "info");
        return { ...reg, points: updatedPoints };
      })
    );
  };

  // Mouse pan handlers: supports PAN mode, middle click, or right click
  const handleMouseDown = (e) => {
    // If clicking a candidate or region vertex handle, do not pan
    if (e.target.closest(".candidate-vertex-handle") || e.target.closest(".editor-vertex-handle")) return;

    // Middle-click (1), Right-click (2), Shift+Click, or PAN mode initiates drag pan
    if (editorMode === "PAN" || e.button === 1 || e.button === 2 || e.shiftKey) {
      if (e.button === 2) {
        // Prevent context menu on right-click pan
        e.preventDefault();
      }
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y, originX: e.clientX, originY: e.clientY });
    }
  };

  const handleMouseMove = (e) => {
    if (draggingCandidateVertexIndex !== null && selectedCandidate && workspaceRef.current) {
      const rect = workspaceRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      const unscaledX = (clientX - pan.x) / zoom;
      const unscaledY = (clientY - pan.y) / zoom;
      const normX = Math.max(0, Math.min(100, (unscaledX / imgDimensions.width) * 100));
      const normY = Math.max(0, Math.min(100, (unscaledY / imgDimensions.height) * 100));
      handleCandidateVertexMove(draggingCandidateVertexIndex, normX, normY);
      return;
    }

    if (draggingRegionVertex !== null && workspaceRef.current) {
      const rect = workspaceRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      const unscaledX = (clientX - pan.x) / zoom;
      const unscaledY = (clientY - pan.y) / zoom;
      const normX = Math.max(0, Math.min(100, (unscaledX / imgDimensions.width) * 100));
      const normY = Math.max(0, Math.min(100, (unscaledY / imgDimensions.height) * 100));
      handleRegionVertexMove(draggingRegionVertex.regionId, draggingRegionVertex.vertexIndex, normX, normY);
      return;
    }

    if (isDragging) {
      const movedX = Math.abs(e.clientX - (dragStart.originX || e.clientX));
      const movedY = Math.abs(e.clientY - (dragStart.originY || e.clientY));
      if (movedX > 4 || movedY > 4) {
        wasDraggingRef.current = true;
      }
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    if (draggingCandidateVertexIndex !== null) {
      setDraggingCandidateVertexIndex(null);
    }
    if (draggingRegionVertex !== null) {
      setDraggingRegionVertex(null);
    }
    if (isDragging) {
      setIsDragging(false);
      // Reset wasDragging after brief microtask so onClick can check it
      setTimeout(() => {
        wasDraggingRef.current = false;
      }, 50);
    }
  };

  // File upload to Cloudinary handler
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast("File is too large. Layout images must be less than 10MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (uploadEvent) => {
      const base64Data = uploadEvent.target.result;
      setIsUploading(true);
      try {
        const targetProjectId = project?._id || project?.id || "new";
        const res = await superAdminApi.uploadLayoutImage(targetProjectId, {
          fileData: base64Data,
          mimeType: file.type || "image/png",
        });

        if (res?.success && res.data?.imageUrl) {
          setImageUrl(res.data.imageUrl);
          setPublicId(res.data.publicId || "");
          if (res.data.width && res.data.height) {
            setImgDimensions({ width: res.data.width, height: res.data.height });
          }
          setShowReferenceImage(true);
          showToast("Reference diagram uploaded successfully! You can trace over it or run auto-detect.", "success");
        }
      } catch (err) {
        console.error("Layout upload error:", err);
        showToast(
          err.data?.message || err.message || "Failed to upload reference diagram.",
          "error"
        );
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Save layout configuration to backend with optimistic concurrency
  const handleSaveLayout = async () => {
    if (regions.length === 0) {
      showToast("Please configure at least one plot boundary region before saving.", "error");
      return;
    }

    const payload = {
      referenceImageUrl: imageUrl,
      imageUrl,
      publicId,
      provider: "cloudinary",
      width: imgDimensions.width,
      height: imgDimensions.height,
      compassOrientation,
      expectedVersion: currentVersion,
      blocks,
      roads,
      commonAreas,
      regions,
    };

    const targetProjectId = project?._id || project?.id;

    if (!targetProjectId) {
      if (onSaveSuccess) onSaveSuccess(payload);
      showToast("Native layout boundaries configured for this new project!", "success");
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const res = await superAdminApi.saveProjectLayout(targetProjectId, payload);
      if (res?.success) {
        if (res.staged) {
          showToast("Project layout changes staged in pending approval queue.", "info");
        } else {
          showToast("Native real-estate diagram saved and published successfully!", "success");
        }
        if (onSaveSuccess) onSaveSuccess(res.data);
        onClose();
      }
    } catch (err) {
      console.error("Save layout error:", err);
      if (err.status === 409 || err.data?.conflict) {
        showToast(
          err.data?.message || "Conflict: Newer revision exists on server. Please refresh.",
          "error"
        );
      } else {
        showToast(err.data?.message || err.message || "Failed to save layout.", "error");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Convert points to SVG points string
  const getPointsString = (pts) => {
    return pts
      .map((p) => `${(p.x * imgDimensions.width) / 100},${(p.y * imgDimensions.height) / 100}`)
      .join(" ");
  };

  // Polygon centroid for label positioning
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

  // Filtered plot inventory list
  const filteredPlots = useMemo(() => {
    return plots.filter((p) => {
      const q = plotSearchTerm.toLowerCase();
      return (
        String(p.plotNumber).toLowerCase().includes(q) ||
        (p.status && p.status.toLowerCase().includes(q))
      );
    });
  }, [plots, plotSearchTerm]);

  return (
    <div className="layout-editor-modal-backdrop">
      <div className="layout-editor-modal-card">
        {/* Header Bar */}
        <div className="editor-header-bar">
          <div className="editor-header-title">
            <Layers size={22} className="editor-brand-icon" />
            <div className="editor-title-texts">
              <h2>Layout Studio</h2>
              <span className="editor-project-badge">{project?.title || "New Project"}</span>
              <span className="editor-rev-badge">Rev #{currentVersion}</span>
            </div>
          </div>

          <div className="editor-header-actions">
            {/* Provider Selector & Semi-Automatic Detection Action */}
            <div className="editor-provider-group">
              <select
                value={detectionProvider}
                onChange={(e) => setDetectionProvider(e.target.value)}
                disabled={isDetecting}
                className="editor-provider-select"
                title="Choose detection engine"
              >
                <option value="opencv">OpenCV (Local)</option>
                <option value="gemini">Gemini AI (Cloud)</option>
              </select>
              <button
                type="button"
                className="editor-btn-secondary"
                onClick={handleAutoDetect}
                disabled={isDetecting || !imageUrl}
                title={
                  detectionProvider === "gemini"
                    ? "Detect using Google Gemini Multimodal Vision AI"
                    : "Detect using local OpenCV contour & RapidOCR"
                }
              >
                <Sparkles size={15} className="text-amber-400" />
                <span>
                  {isDetecting
                    ? detectionProvider === "gemini"
                      ? "Gemini Analyzing..."
                      : "OpenCV Detecting..."
                    : "Auto-Detect"}
                </span>
              </button>
            </div>

            {/* Tracing Image Visibility Toggle */}
            <button
              type="button"
              className="editor-btn-secondary"
              onClick={() => setShowReferenceImage((prev) => !prev)}
              title={showReferenceImage ? "Hide tracing reference" : "Show tracing reference"}
            >
              {showReferenceImage ? <Eye size={15} /> : <EyeOff size={15} />}
              <span>{showReferenceImage ? "Hide Tracing" : "Show Tracing"}</span>
            </button>

            {/* Reference Image Opacity Slider */}
            {showReferenceImage && (
              <div className="editor-opacity-control">
                <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Opacity</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={referenceOpacity}
                  onChange={(e) => setReferenceOpacity(parseFloat(e.target.value))}
                  style={{ width: "70px", cursor: "pointer" }}
                />
              </div>
            )}

            {/* Viewport Zoom Controls */}
            <div className="editor-zoom-group">
              <button type="button" onClick={handleZoomOut} title="Zoom Out">
                <ZoomOut size={14} />
              </button>
              <span className="editor-zoom-indicator">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={handleZoomIn} title="Zoom In">
                <ZoomIn size={14} />
              </button>
              <button type="button" onClick={handleResetZoom} title="Reset View">
                <RotateCcw size={14} />
              </button>
            </div>

            {/* Reference Image File Upload */}
            <label className="editor-btn-secondary" style={{ cursor: "pointer", margin: 0 }}>
              <UploadCloud size={15} />
              <span>{isUploading ? "Uploading..." : "Upload Reference"}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </label>

            {/* Save Button */}
            <button
              type="button"
              className="editor-btn-primary"
              onClick={handleSaveLayout}
              disabled={isSaving}
            >
              <Save size={16} />
              <span>{isSaving ? "Saving..." : "Save Native Diagram"}</span>
            </button>

            <button
              type="button"
              className="editor-close-icon-btn"
              onClick={onClose}
              aria-label="Close editor"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Notices & Warnings */}
        {storageWarning && (
          <div className="editor-alert-warning">
            <AlertTriangle size={15} />
            <span>{storageWarning}</span>
          </div>
        )}
        {detectionNotice && (
          <div className="editor-alert-info">
            <HelpCircle size={15} />
            <span>{detectionNotice}</span>
          </div>
        )}

        {/* Editor Body Split */}
        <div className="editor-body-split">
          {/* Left Panel: Studio Sidebar */}
          <div className="editor-sidebar-panel">
            {/* Sidebar Tabs */}
            <div className="studio-tabs-row">
              <button
                type="button"
                className={`studio-tab-btn ${activeTab === "BLOCKS" ? "active" : ""}`}
                onClick={() => setActiveTab("BLOCKS")}
              >
                Blocks ({blocks.length})
              </button>
              <button
                type="button"
                className={`studio-tab-btn ${activeTab === "PLOTS" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("PLOTS");
                  setEditorMode("DRAW_PLOT");
                }}
              >
                Plots ({regions.length})
              </button>
              {candidates.length > 0 && (
                <button
                  type="button"
                  className={`studio-tab-btn ${activeTab === "CANDIDATES" ? "active" : ""}`}
                  onClick={() => setActiveTab("CANDIDATES")}
                  style={{ color: "#38bdf8" }}
                >
                  Candidates ({candidates.length})
                </button>
              )}
              <button
                type="button"
                className={`studio-tab-btn ${activeTab === "ROADS" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("ROADS");
                  setEditorMode("DRAW_ROAD");
                }}
              >
                Roads ({roads.length})
              </button>
              <button
                type="button"
                className={`studio-tab-btn ${activeTab === "PARKS" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("PARKS");
                  setEditorMode("DRAW_PARK");
                }}
              >
                Parks ({commonAreas.length})
              </button>
              <button
                type="button"
                className={`studio-tab-btn ${activeTab === "SETTINGS" ? "active" : ""}`}
                onClick={() => setActiveTab("SETTINGS")}
              >
                Compass
              </button>
            </div>

            {/* Mode Tab Indicator */}
            <div className="editor-sidebar-section" style={{ paddingBottom: "0.5rem" }}>
              <div className="editor-mode-selector">
                <button
                  type="button"
                  className={`mode-tab-btn ${
                    editorMode === "DRAW_PLOT" || editorMode === "DRAW_ROAD" || editorMode === "DRAW_PARK"
                      ? "is-active"
                      : ""
                  }`}
                  onClick={() => {
                    if (activeTab === "ROADS") setEditorMode("DRAW_ROAD");
                    else if (activeTab === "PARKS") setEditorMode("DRAW_PARK");
                    else setEditorMode("DRAW_PLOT");
                  }}
                >
                  <PenTool size={14} />
                  <span>
                    {editorMode === "DRAW_ROAD"
                      ? "Draw Road"
                      : editorMode === "DRAW_PARK"
                      ? "Draw Park"
                      : "Draw Plots"}
                  </span>
                </button>
                <button
                  type="button"
                  className={`mode-tab-btn ${editorMode === "PAN" ? "is-active" : ""}`}
                  onClick={() => setEditorMode("PAN")}
                >
                  <Hand size={14} />
                  <span>Pan View</span>
                </button>
              </div>
            </div>

            {/* In-Progress Drawing Action Bar */}
            {currentPoints.length > 0 && (
              <div className="editor-sidebar-section drawing-active-box">
                <div className="editor-section-title">
                  <span>In-Progress Polygon</span>
                  <span style={{ color: "#38bdf8" }}>{currentPoints.length} vertices</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="editor-btn-primary"
                    style={{ flex: 1, padding: "0.4rem" }}
                    onClick={handleFinishCurrentDrawing}
                  >
                    <Check size={14} />
                    <span>
                      {editorMode === "DRAW_ROAD"
                        ? "Save Road"
                        : editorMode === "DRAW_PARK"
                        ? "Save Park"
                        : "Assign to Plot"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="editor-btn-secondary"
                    style={{ padding: "0.4rem 0.6rem" }}
                    onClick={() => setCurrentPoints([])}
                    title="Cancel active drawing"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* TAB: BLOCKS MANAGEMENT */}
            {activeTab === "BLOCKS" && (
              <div className="editor-sidebar-section">
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginBottom: "0.3rem" }}>
                    Create New Block
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <input
                      type="text"
                      placeholder="e.g. Block A"
                      value={newBlockName}
                      onChange={(e) => setNewBlockName(e.target.value)}
                      className="plot-search-input"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="editor-btn-primary"
                      onClick={handleCreateBlock}
                      style={{ padding: "0.4rem 0.8rem" }}
                    >
                      <Plus size={14} />
                      <span>Add</span>
                    </button>
                  </div>

                  {/* Palette Selector */}
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
                    {BLOCK_PALETTE.map((c) => (
                      <div
                        key={c}
                        onClick={() => setNewBlockColor(c)}
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "4px",
                          background: c,
                          cursor: "pointer",
                          border: newBlockColor === c ? "2px solid #fff" : "1px solid rgba(0,0,0,0.3)",
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="elements-list-container">
                  <h4>Configured Blocks ({blocks.length})</h4>
                  {blocks.length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      No blocks defined yet. Create Block A, Block B, etc.
                    </p>
                  ) : (
                    blocks.map((b) => {
                      const count = regions.filter((r) => r.blockId === b.id).length;
                      const isSelected = selectedBlockId === b.id;
                      return (
                        <div
                          key={b.id}
                          className={`element-list-item ${isSelected ? "selected-block" : ""}`}
                          onClick={() => setSelectedBlockId(b.id)}
                          style={{ borderLeft: `4px solid ${b.color || "#3b82f6"}` }}
                        >
                          <div>
                            <strong>{b.name}</strong>
                            <span style={{ fontSize: "0.75rem", color: "#94a3b8", marginLeft: "0.5rem" }}>
                              ({count} plots)
                            </span>
                          </div>
                          <button
                            type="button"
                            className="remove-boundary-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBlock(b.id);
                            }}
                            title="Delete block"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB: CANDIDATES REVIEW LAYER */}
            {activeTab === "CANDIDATES" && (
              <div className="editor-sidebar-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#38bdf8" }}>
                    Detected Candidates ({candidates.length})
                  </span>
                  <button
                    type="button"
                    className="editor-btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                    onClick={() => setCandidates([])}
                  >
                    Clear All
                  </button>
                </div>
                <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: "0.75rem" }}>
                  Review detected boundaries below. Select the matching plot record to accept.
                </p>

                <div className="candidates-list-scroll">
                  {candidates.map((cand) => {
                    // Try to auto-suggest unmapped plot
                    const matchingPlot = plots.find(
                      (p) =>
                        cand.suggestedPlotNumber &&
                        String(p.plotNumber).toLowerCase() === String(cand.suggestedPlotNumber).toLowerCase()
                    );
                    const suggestedPlotId = matchingPlot ? String(matchingPlot._id || matchingPlot.id) : "";

                    const isCardSelected = selectedCandidate?.candidateId === cand.candidateId;

                    return (
                      <div
                        key={cand.candidateId}
                        className={`candidate-review-card ${isCardSelected ? "selected-candidate-card" : ""}`}
                        onClick={() => setSelectedCandidate(cand)}
                        style={{ cursor: "pointer" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <span style={{ fontWeight: "700", color: isCardSelected ? "#a63d2f" : "#0f172a", fontSize: "0.85rem" }}>
                              {cand.suggestedPlotNumber ? `Plot #${cand.suggestedPlotNumber}` : "Unlabeled Boundary"}
                            </span>
                            {cand.sourceProvider === "gemini" ? (
                              <span className="candidate-provider-badge gemini">Gemini AI</span>
                            ) : (
                              <span className="candidate-provider-badge opencv">OpenCV</span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            {cand.alignmentScore !== undefined && (
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  background: cand.alignmentScore >= 60 ? "#dcfce7" : "#fef3c7",
                                  color: cand.alignmentScore >= 60 ? "#15803d" : "#b45309",
                                  padding: "0.1rem 0.4rem",
                                  borderRadius: "4px",
                                  fontWeight: "700",
                                }}
                                title="Edge & corner alignment quality score"
                              >
                                {Math.round(cand.alignmentScore)}% fit
                              </span>
                            )}
                            {(cand.ocrConfidence > 0 || cand.confidenceEstimate > 0) && (
                              <span style={{ fontSize: "0.72rem", background: "#f1f5f9", color: "#475569", padding: "0.1rem 0.4rem", borderRadius: "4px", fontWeight: "600" }}>
                                {Math.round((cand.ocrConfidence || cand.confidenceEstimate || 0) * 100)}% est
                              </span>
                            )}
                          </div>
                        </div>

                        {cand.suggestedBlock && (
                          <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "0.15rem" }}>
                            Suggested Block: <strong style={{ color: "#334155" }}>{cand.suggestedBlock}</strong>
                          </div>
                        )}

                        {cand.warnings && cand.warnings.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.25rem" }}>
                            {cand.warnings.map((w, wIdx) => {
                              const isOverlap = w === "OVERLAPS_NEIGHBOUR";
                              const isLabelUncertain = w === "LABEL_UNCERTAIN";
                              const isLowAlign = w === "BOUNDARY_ALIGNMENT_LOW";
                              return (
                                <span
                                  key={wIdx}
                                  style={{
                                    fontSize: "0.68rem",
                                    padding: "0.1rem 0.35rem",
                                    borderRadius: "3px",
                                    fontWeight: "600",
                                    background: isOverlap ? "#fee2e2" : isLabelUncertain ? "#fef3c7" : "#f3f4f6",
                                    color: isOverlap ? "#b91c1c" : isLabelUncertain ? "#b45309" : "#4b5563",
                                  }}
                                >
                                  {isOverlap ? "⚠️ Overlaps Neighbour" : isLabelUncertain ? "⚠️ Label Uncertain" : isLowAlign ? "📐 Low Alignment" : w}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", alignItems: "center" }}>
                          <button
                            type="button"
                            className="candidate-focus-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCandidate(cand);
                              handleFocusCandidate(cand);
                            }}
                            title="Focus & Zoom into this plot on canvas"
                          >
                            <Crosshair size={13} />
                          </button>
                          <select
                            id={`sel_${cand.candidateId}`}
                            defaultValue={suggestedPlotId}
                            className="candidate-plot-select"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="">-- Link Plot Record --</option>
                            {plots.map((p) => {
                              const isMapped = mappedPlotIds.has(String(p._id || p.id));
                              return (
                                <option key={p._id || p.id} value={p._id || p.id}>
                                  Plot #{p.plotNumber} {isMapped ? "(Reassign)" : ""}
                                </option>
                              );
                            })}
                          </select>
                          <button
                            type="button"
                            className="candidate-accept-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const sel = document.getElementById(`sel_${cand.candidateId}`);
                              handleAcceptCandidate(cand, sel?.value);
                            }}
                            title="Accept candidate"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            className="candidate-dismiss-btn"
                            onClick={() => handleDismissCandidate(cand.candidateId)}
                            title="Dismiss candidate"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: PLOTS INVENTORY */}
            {activeTab === "PLOTS" && (
              <>
                <div className="editor-sidebar-section">
                  <div className="plot-search-wrapper">
                    <Search size={14} className="plot-search-icon" />
                    <input
                      type="text"
                      placeholder="Search plots..."
                      value={plotSearchTerm}
                      onChange={(e) => setPlotSearchTerm(e.target.value)}
                      className="plot-search-input"
                    />
                  </div>
                </div>

                <div className="plots-inventory-list">
                  {filteredPlots.map((plot) => {
                    const plotIdStr = String(plot._id || plot.id);
                    const isMapped = mappedPlotIds.has(plotIdStr);
                    const isSelected = selectedPlotId === plotIdStr;
                    const region = regions.find((r) => String(r.plotId) === plotIdStr);
                    const assignedBlock = region?.blockId ? blockMap.get(region.blockId) : null;

                    return (
                      <div
                        key={plotIdStr}
                        className={`plot-inventory-item ${isSelected ? "selected-for-drawing" : ""} ${
                          isMapped ? "is-mapped" : ""
                        }`}
                        onClick={() => {
                          setSelectedPlotId(plotIdStr);
                          if (region) setActiveRegionId(region.id);
                          setEditorMode("DRAW_PLOT");
                        }}
                      >
                        <div className="plot-item-top">
                          <span className="plot-num-tag">Plot #{plot.plotNumber}</span>
                          <span className={`plot-status-badge ${(plot.status || "available").toLowerCase()}`}>
                            {plot.status || "Available"}
                          </span>
                        </div>

                        <div className="plot-item-bottom">
                          <span>
                            {assignedBlock ? (
                              <span style={{ color: assignedBlock.color, fontWeight: "600", marginRight: "0.4rem" }}>
                                [{assignedBlock.name}]
                              </span>
                            ) : null}
                            {plot.size || "Standard"} • {plot.facing || "East"}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {isMapped ? (
                              <span className="plot-mapped-indicator mapped">Mapped</span>
                            ) : (
                              <span className="plot-mapped-indicator unmapped">Unmapped</span>
                            )}
                            {isMapped && region && (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                <button
                                  type="button"
                                  className="candidate-focus-btn"
                                  style={{ width: "22px", height: "22px" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveRegionId(region.id);
                                    handleFocusCandidate(region);
                                  }}
                                  title="Focus on plot boundary (drag vertices to adjust)"
                                >
                                  <Crosshair size={11} />
                                </button>
                                <button
                                  type="button"
                                  className="remove-boundary-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveRegion(region.id);
                                  }}
                                  title="Remove boundary"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* TAB: ROADS CONFIGURATION */}
            {activeTab === "ROADS" && (
              <div className="editor-sidebar-section">
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginBottom: "0.3rem" }}>
                    Road Name / Description
                  </label>
                  <input
                    type="text"
                    value={roadName}
                    onChange={(e) => setRoadName(e.target.value)}
                    placeholder="e.g. 30 Feet Main Road"
                    className="plot-search-input"
                  />
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginBottom: "0.3rem" }}>
                    Road Width
                  </label>
                  <input
                    type="text"
                    value={roadWidth}
                    onChange={(e) => setRoadWidth(e.target.value)}
                    placeholder="e.g. 30 Ft"
                    className="plot-search-input"
                  />
                </div>

                <p style={{ fontSize: "0.8rem", color: "#94a3b8", lineHeight: "1.4" }}>
                  Click points on the canvas to outline the road corridor, then click "Save Road".
                </p>

                <div className="elements-list-container">
                  <h4>Configured Roads ({roads.length})</h4>
                  {roads.length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "#64748b" }}>No roads configured yet.</p>
                  ) : (
                    roads.map((road, idx) => (
                      <div key={road.id || idx} className="element-list-item">
                        <div>
                          <strong>{road.name}</strong>
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8", marginLeft: "0.4rem" }}>
                            ({road.widthFt})
                          </span>
                        </div>
                        <button
                          type="button"
                          className="remove-boundary-btn"
                          onClick={() => handleRemoveRoad(road.id)}
                          title="Delete road"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB: PARKS & COMMON AREAS */}
            {activeTab === "PARKS" && (
              <div className="editor-sidebar-section">
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginBottom: "0.3rem" }}>
                    Park / Area Name
                  </label>
                  <input
                    type="text"
                    value={parkName}
                    onChange={(e) => setParkName(e.target.value)}
                    placeholder="e.g. Central Botanical Park"
                    className="plot-search-input"
                  />
                </div>

                <p style={{ fontSize: "0.8rem", color: "#94a3b8", lineHeight: "1.4" }}>
                  Click polygon vertices around the park / green belt, then click "Save Park".
                </p>

                <div className="elements-list-container">
                  <h4>Configured Parks ({commonAreas.length})</h4>
                  {commonAreas.length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "#64748b" }}>No parks configured yet.</p>
                  ) : (
                    commonAreas.map((area, idx) => (
                      <div key={area.id || idx} className="element-list-item">
                        <div>
                          <strong style={{ color: "#86efac" }}>🌳 {area.name}</strong>
                        </div>
                        <button
                          type="button"
                          className="remove-boundary-btn"
                          onClick={() => handleRemoveCommonArea(area.id)}
                          title="Delete park"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB: COMPASS & SETTINGS */}
            {activeTab === "SETTINGS" && (
              <div className="editor-sidebar-section">
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={{ fontSize: "0.85rem", color: "#e2e8f0", display: "block", marginBottom: "0.5rem" }}>
                    <Compass size={16} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
                    North Compass Orientation
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="5"
                      value={compassOrientation}
                      onChange={(e) => setCompassOrientation(parseInt(e.target.value, 10))}
                      style={{ flex: 1, cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "0.85rem", color: "#38bdf8", minWidth: "40px", fontWeight: "700" }}>
                      {compassOrientation}°
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #334155", paddingTop: "1rem" }}>
                  <label style={{ fontSize: "0.85rem", color: "#e2e8f0", display: "block", marginBottom: "0.5rem" }}>
                    Diagram Canvas Dimensions
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div>
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Width (px)</span>
                      <input
                        type="number"
                        value={imgDimensions.width}
                        onChange={(e) => setImgDimensions((prev) => ({ ...prev, width: Number(e.target.value) }))}
                        className="plot-search-input"
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Height (px)</span>
                      <input
                        type="number"
                        value={imgDimensions.height}
                        onChange={(e) => setImgDimensions((prev) => ({ ...prev, height: Number(e.target.value) }))}
                        className="plot-search-input"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Canvas Studio Workspace */}
          <div
            className={`editor-canvas-workspace ${
              editorMode === "PAN" ? "pan-mode" : ""
            } ${isDragging ? "is-dragging" : ""}`}
            ref={workspaceRef}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={(e) => {
              // Prevent context menu if right click was used to pan
              if (dragStart.originX !== undefined) {
                e.preventDefault();
              }
            }}
          >
            <div
              className="editor-canvas-content"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                width: `${imgDimensions.width}px`,
                height: `${imgDimensions.height}px`,
              }}
            >
              {/* Reference Tracing Image Layer (Hidden when tracing is toggled off) */}
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="Project Reference Diagram"
                  className="editor-base-image"
                  onLoad={handleImageLoad}
                  style={{
                    width: `${imgDimensions.width}px`,
                    height: `${imgDimensions.height}px`,
                    opacity: showReferenceImage ? referenceOpacity : 0,
                    position: "absolute",
                    top: 0,
                    left: 0,
                    zIndex: 1,
                    transition: "opacity 0.2s ease",
                  }}
                />
              )}

              {/* Native Vector SVG Site Plan Layer */}
              <svg
                className="editor-svg-layer"
                viewBox={`0 0 ${imgDimensions.width} ${imgDimensions.height}`}
                width={imgDimensions.width}
                height={imgDimensions.height}
                style={{ position: "relative", zIndex: 2 }}
              >
                <defs>
                  <pattern
                    id="editorGrid"
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
                </defs>

                {/* Base Canvas Rect */}
                <rect
                  x="0"
                  y="0"
                  width={imgDimensions.width}
                  height={imgDimensions.height}
                  fill="#ffffff"
                  fillOpacity={showReferenceImage ? 0.35 : 1}
                  stroke="#cbd5e1"
                  strokeWidth="2"
                />
                <rect
                  x="0"
                  y="0"
                  width={imgDimensions.width}
                  height={imgDimensions.height}
                  fill="url(#editorGrid)"
                  pointerEvents="none"
                />

                {/* Saved Roads Layer */}
                {roads.map((road, idx) => {
                  const centroid = getPolygonCentroid(road.points);
                  return (
                    <g key={road.id || idx}>
                      <polygon
                        points={getPointsString(road.points)}
                        fill="#e2e8f0"
                        stroke="#94a3b8"
                        strokeWidth="1.5"
                      />
                      <text
                        x={centroid.x}
                        y={centroid.y}
                        fill="#475569"
                        fontSize="11"
                        fontWeight="700"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {road.name} ({road.widthFt})
                      </text>
                    </g>
                  );
                })}

                {/* Saved Common Areas / Parks Layer */}
                {commonAreas.map((area, idx) => {
                  const centroid = getPolygonCentroid(area.points);
                  return (
                    <g key={area.id || idx}>
                      <polygon
                        points={getPointsString(area.points)}
                        fill="#dcfce7"
                        stroke="#86efac"
                        strokeWidth="2"
                      />
                      <text
                        x={centroid.x}
                        y={centroid.y}
                        fill="#15803d"
                        fontSize="11"
                        fontWeight="700"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        🌳 {area.name}
                      </text>
                    </g>
                  );
                })}

                {/* Confirmed Plot Regions */}
                {regions.map((reg) => {
                  const isActive = activeRegionId === reg.id;
                  const centroid = getPolygonCentroid(reg.points);
                  const blockObj = reg.blockId ? blockMap.get(reg.blockId) : null;
                  const blockColor = blockObj?.color || "#3b82f6";

                  return (
                    <g key={reg.id}>
                      <polygon
                        points={getPointsString(reg.points)}
                        className={`editor-polygon ${isActive ? "active-region" : ""}`}
                        style={{
                          fill: `${blockColor}33`,
                          stroke: blockColor,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveRegionId(reg.id);
                          setSelectedPlotId(String(reg.plotId));
                        }}
                      />

                      {/* Plot Number Label */}
                      <text
                        x={centroid.x}
                        y={centroid.y}
                        fill="#0f172a"
                        fontSize="11"
                        fontWeight="800"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        pointerEvents="none"
                      >
                        {reg.plotNumber}
                      </text>

                      {/* Vertex Handles if Active */}
                      {isActive &&
                        reg.points.map((pt, idx) => {
                          const isDraggingThis = draggingRegionVertex?.regionId === reg.id && draggingRegionVertex?.vertexIndex === idx;
                          return (
                            <circle
                              key={`rv_${reg.id}_${idx}`}
                              cx={(pt.x * imgDimensions.width) / 100}
                              cy={(pt.y * imgDimensions.height) / 100}
                              r={6 / zoom}
                              className="editor-vertex-handle"
                              style={{
                                fill: isDraggingThis ? "#ef4444" : blockColor,
                                stroke: "#ffffff",
                                strokeWidth: 2 / zoom,
                                cursor: "grab",
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setDraggingRegionVertex({ regionId: reg.id, vertexIndex: idx });
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteRegionVertex(reg.id, idx);
                              }}
                              title="Drag to adjust plot boundary vertex. Right-click to delete vertex."
                            />
                          );
                        })}
                    </g>
                  );
                })}

                {/* Unconfirmed Candidates Layer (Dashed outlines) */}
                {candidates.map((cand) => {
                  const centroid = getPolygonCentroid(cand.points);
                  const isSelectedCand = selectedCandidate?.candidateId === cand.candidateId;
                  return (
                    <g key={cand.candidateId} className="editor-candidate-group">
                      <polygon
                        points={getPointsString(cand.points)}
                        fill={isSelectedCand ? "rgba(245, 158, 11, 0.35)" : "rgba(6, 182, 212, 0.18)"}
                        stroke={isSelectedCand ? "#f59e0b" : "#06b6d4"}
                        strokeWidth={isSelectedCand ? "3" : "2"}
                        strokeDasharray={isSelectedCand ? "none" : "6 3"}
                        style={{ cursor: "pointer", transition: "all 0.15s ease" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCandidate(cand);
                          setActiveTab("CANDIDATES");
                        }}
                      />
                      {cand.suggestedPlotNumber && (
                        <text
                          x={centroid.x}
                          y={centroid.y}
                          fill={isSelectedCand ? "#b45309" : "#0891b2"}
                          fontSize={isSelectedCand ? "11" : "10"}
                          fontWeight="800"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          pointerEvents="none"
                        >
                          {cand.suggestedPlotNumber}?
                        </text>
                      )}

                      {/* Interactive Vertex Handles for Selected Candidate */}
                      {isSelectedCand &&
                        cand.points.map((pt, vIdx) => {
                          const px = (pt.x * imgDimensions.width) / 100;
                          const py = (pt.y * imgDimensions.height) / 100;
                          return (
                            <circle
                              key={`cv_${cand.candidateId}_${vIdx}`}
                              cx={px}
                              cy={py}
                              r={6 / zoom}
                              className="candidate-vertex-handle"
                              style={{
                                fill: draggingCandidateVertexIndex === vIdx ? "#ef4444" : "#f59e0b",
                                stroke: "#ffffff",
                                strokeWidth: 2 / zoom,
                                cursor: "grab",
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setDraggingCandidateVertexIndex(vIdx);
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteCandidateVertex(vIdx);
                              }}
                              title="Drag to snap/align boundary. Right-click to remove vertex."
                            />
                          );
                        })}
                    </g>
                  );
                })}

                {/* In-Progress Drawing Line */}
                {currentPoints.length > 0 && (
                  <g>
                    <polyline
                      points={getPointsString(currentPoints)}
                      fill="none"
                      className="drawing-in-progress-line"
                    />
                    {currentPoints.map((pt, idx) => (
                      <circle
                        key={idx}
                        cx={(pt.x * imgDimensions.width) / 100}
                        cy={(pt.y * imgDimensions.height) / 100}
                        r={4 / zoom}
                        fill="#fbbf24"
                        stroke="#000"
                        strokeWidth={1}
                      />
                    ))}
                  </g>
                )}

                {/* North Compass Indicator Widget */}
                <g
                  className="editor-compass-indicator"
                  transform={`translate(${imgDimensions.width - 55}, 55) rotate(${compassOrientation})`}
                  pointerEvents="none"
                >
                  <circle cx="0" cy="0" r="22" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                  <polygon points="0,-18 5,0 0,-3" fill="#dc2626" />
                  <polygon points="0,18 5,0 0,3" fill="#64748b" />
                  <polygon points="0,-18 -5,0 0,-3" fill="#ef4444" />
                  <polygon points="0,18 -5,0 0,3" fill="#94a3b8" />
                  <circle cx="0" cy="0" r="2.5" fill="#0f172a" />
                  <text x="0" y="-10" textAnchor="middle" fontSize="9" fontWeight="800" fill="#dc2626">N</text>
                </g>
              </svg>
            </div>

            {/* Floating Candidate Quick-Assignment Popover on Canvas */}
            {selectedCandidate && (
              <div className="candidate-canvas-popover">
                <div className="candidate-popover-header">
                  <div className="candidate-popover-title">
                    <span className="candidate-popover-dot" />
                    <strong>
                      {selectedCandidate.suggestedPlotNumber
                        ? `Assign Plot #${selectedCandidate.suggestedPlotNumber}`
                        : "Assign Clicked Boundary"}
                    </strong>
                    {selectedCandidate.sourceProvider === "gemini" ? (
                      <span className="candidate-provider-badge gemini">Gemini AI</span>
                    ) : (
                      <span className="candidate-provider-badge opencv">OpenCV</span>
                    )}
                    {(selectedCandidate.ocrConfidence > 0 || selectedCandidate.confidenceEstimate > 0) && (
                      <span className="candidate-popover-conf">
                        {Math.round((selectedCandidate.ocrConfidence || selectedCandidate.confidenceEstimate || 0) * 100)}% Match
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="candidate-popover-close"
                    onClick={() => setSelectedCandidate(null)}
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="candidate-popover-body">
                  <div className="candidate-popover-field">
                    <label>Block / Sector:</label>
                    <select
                      value={selectedBlockId}
                      onChange={(e) => setSelectedBlockId(e.target.value)}
                      className="candidate-popover-select"
                    >
                      {blocks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="candidate-popover-field">
                    <label>Link Real Plot Record:</label>
                    <select
                      id="canvas_cand_select"
                      defaultValue={
                        plots.find(
                          (p) =>
                            selectedCandidate.suggestedPlotNumber &&
                            String(p.plotNumber).toLowerCase() ===
                              String(selectedCandidate.suggestedPlotNumber).toLowerCase()
                        )?._id ||
                        plots.find(
                          (p) =>
                            selectedCandidate.suggestedPlotNumber &&
                            String(p.plotNumber).toLowerCase() ===
                              String(selectedCandidate.suggestedPlotNumber).toLowerCase()
                        )?.id ||
                        ""
                      }
                      className="candidate-popover-select"
                    >
                      <option value="">-- Choose Plot Record --</option>
                      {plots.map((p) => {
                        const isMapped = mappedPlotIds.has(String(p._id || p.id));
                        return (
                          <option key={p._id || p.id} value={p._id || p.id}>
                            Plot #{p.plotNumber} ({p.size || "Standard"}, {p.status || "Available"}){" "}
                            {isMapped ? "• [Reassign]" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="candidate-popover-actions">
                  <button
                    type="button"
                    className="candidate-popover-btn-confirm"
                    onClick={() => {
                      const sel = document.getElementById("canvas_cand_select");
                      if (!sel?.value) {
                        showToast("Please select a plot record to link.", "error");
                        return;
                      }
                      handleAcceptCandidate(selectedCandidate, sel.value);
                      setSelectedCandidate(null);
                    }}
                  >
                    <Check size={14} />
                    <span>Confirm & Map Plot</span>
                  </button>

                  <button
                    type="button"
                    className="candidate-popover-btn-discard"
                    onClick={() => {
                      handleDismissCandidate(selectedCandidate.candidateId);
                      setSelectedCandidate(null);
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Discard Boundary</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Studio Footer Status */}
        <div className="editor-footer-status-bar">
          <div className="status-item">
            <span className="status-dot green" />
            <span>{regions.length} Plots Mapped</span>
          </div>
          <div className="status-item">
            <span className="status-dot blue" />
            <span>{blocks.length} Blocks</span>
          </div>
          {candidates.length > 0 && (
            <div className="status-item">
              <span className="status-dot yellow" />
              <span>{candidates.length} Detected Candidates Pending</span>
            </div>
          )}
          <div className="status-item">
            <span>{roads.length} Roads • {commonAreas.length} Parks</span>
          </div>
          <div className="status-item right">
            <span>Pure Native SVG Architecture</span>
          </div>
        </div>
      </div>
    </div>
  );
}
