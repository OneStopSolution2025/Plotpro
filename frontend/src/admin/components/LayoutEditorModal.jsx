import { useState, useRef, useEffect } from "react";
import {
  X,
  Save,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  UploadCloud,
  Layers,
  Trash2,
  AlertTriangle,
  ImageIcon,
} from "lucide-react";
import { superAdminApi, adminApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import "../../css/LayoutEditorModal.css";

// 10-Color Palette (retained for backward compatibility)
export const BLOCK_PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#e11d48",
  "#4f46e5",
  "#0891b2",
  "#65a30d",
  "#ea580c",
  "#475569",
];

export default function LayoutEditorModal({ project, plots = [], onClose, onSaveSuccess }) {
  const { user } = useAuth();
  const layoutApi = user?.role === "SUPER_ADMIN" ? superAdminApi : adminApi;
  const { showToast } = useToast();

  // Reference & Display Image
  const [imageUrl, setImageUrl] = useState(
    project?.layout?.referenceImageUrl || project?.layout?.imageUrl || ""
  );
  const [publicId, setPublicId] = useState(project?.layout?.publicId || "");
  const [imgDimensions, setImgDimensions] = useState({
    width: Number(project?.layout?.width) || 1200,
    height: Number(project?.layout?.height) || 800,
  });
  const [currentVersion, setCurrentVersion] = useState(project?.layout?.version || 0);

  // Zoom & Pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const workspaceRef = useRef(null);

  // Loading & Warning states
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");

  // Load latest layout details if available
  useEffect(() => {
    const targetId = project?._id || project?.id;
    if (targetId && targetId !== "new") {
      layoutApi
        .getProjectLayout(targetId)
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
              if (refImg) {
                setImageUrl(refImg);
                setPublicId(l.publicId || "");
              }
              if (l.width && l.height) {
                setImgDimensions({ width: Number(l.width), height: Number(l.height) });
              }
              if (l.version !== undefined) {
                setCurrentVersion(Number(l.version));
              }
            }
          }
        })
        .catch(() => {});
    }
  }, [project]);

  // Center image when loaded
  const handleImageLoad = (e) => {
    const naturalW = e.target.naturalWidth || 1200;
    const naturalH = e.target.naturalHeight || 800;
    setImgDimensions({ width: naturalW, height: naturalH });

    if (workspaceRef.current) {
      const rect = workspaceRef.current.getBoundingClientRect();
      const scaleW = (rect.width * 0.9) / naturalW;
      const scaleH = (rect.height * 0.9) / naturalH;
      const fitZoom = Math.min(scaleW, scaleH, 1);
      setZoom(Number(fitZoom.toFixed(2)) || 1);
      setPan({
        x: Math.round((rect.width - naturalW * fitZoom) / 2),
        y: Math.round((rect.height - naturalH * fitZoom) / 2),
      });
    }
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.2));
  const handleResetZoom = () => {
    if (workspaceRef.current && imgDimensions.width) {
      const rect = workspaceRef.current.getBoundingClientRect();
      const scaleW = (rect.width * 0.9) / imgDimensions.width;
      const scaleH = (rect.height * 0.9) / imgDimensions.height;
      const fitZoom = Math.min(scaleW, scaleH, 1);
      setZoom(Number(fitZoom.toFixed(2)) || 1);
      setPan({
        x: Math.round((rect.width - imgDimensions.width * fitZoom) / 2),
        y: Math.round((rect.height - imgDimensions.height * fitZoom) / 2),
      });
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  };

  // Wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.2, Math.min(4, zoom * zoomFactor));

    if (workspaceRef.current) {
      const rect = workspaceRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      setPan((prev) => ({
        x: mouseX - (mouseX - prev.x) * (newZoom / zoom),
        y: mouseY - (mouseY - prev.y) * (newZoom / zoom),
      }));
    }
    setZoom(newZoom);
  };

  // Pan dragging handlers
  const handleMouseDown = (e) => {
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      if (e.button === 2) e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // File upload to Cloudinary handler
  const processImageFile = async (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file (PNG, JPG, WebP).", "error");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      showToast("Image file size exceeds the 20MB limit.", "error");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target.result;

      // Extract natural dimensions
      const img = new Image();
      img.onload = async () => {
        const detectedWidth = img.naturalWidth || 1200;
        const detectedHeight = img.naturalHeight || 800;
        setImgDimensions({ width: detectedWidth, height: detectedHeight });

        const targetProjectId = project?._id || project?.id || "new";

        try {
          const res = await layoutApi.uploadLayoutImage(targetProjectId, {
            fileData: dataUrl,
            mimeType: file.type,
            width: detectedWidth,
            height: detectedHeight,
          });

          if (res?.success && res.data?.imageUrl) {
            setImageUrl(res.data.imageUrl);
            setPublicId(res.data.publicId || "");
            showToast("Layout image uploaded successfully to persistent Cloudinary storage!", "success");
          } else {
            showToast(res?.message || "Failed to upload image.", "error");
          }
        } catch (err) {
          console.error("Layout upload error:", err);
          showToast(err.data?.message || err.message || "Upload failed.", "error");
        } finally {
          setIsUploading(false);
        }
      };
      img.onerror = () => {
        setIsUploading(false);
        showToast("Failed to parse image file dimensions.", "error");
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setIsUploading(false);
      showToast("Failed to read image file.", "error");
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
    e.target.value = "";
  };

  // Save layout configuration (persisting layout image URL and dimensions)
  const handleSaveLayout = async () => {
    const payload = {
      referenceImageUrl: imageUrl,
      imageUrl,
      publicId,
      provider: "cloudinary",
      width: imgDimensions.width,
      height: imgDimensions.height,
      compassOrientation: 0,
      expectedVersion: currentVersion,
      blocks: [],
      roads: [],
      commonAreas: [],
      regions: [],
    };

    const targetProjectId = project?._id || project?.id;

    if (!targetProjectId || targetProjectId === "new") {
      if (onSaveSuccess) onSaveSuccess(payload);
      showToast("Layout image saved for this project!", "success");
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const res = await layoutApi.saveProjectLayout(targetProjectId, payload);
      if (res?.success) {
        showToast("Project layout image saved and published successfully!", "success");
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

  const handleRemoveImage = () => {
    setImageUrl("");
    setPublicId("");
    showToast("Layout image removed. Click Save Layout to apply changes.", "info");
  };

  return (
    <div className="layout-editor-modal-backdrop">
      <div className="layout-editor-modal-card">
        {/* Header Bar */}
        <div className="editor-header-bar">
          <div className="editor-header-title">
            <Layers size={22} className="editor-brand-icon" />
            <div className="editor-title-texts">
              <h2>Project Layout Image</h2>
              <span className="editor-project-badge">{project?.title || "New Project"}</span>
              <span className="editor-rev-badge">Rev #{currentVersion}</span>
            </div>
          </div>

          <div className="editor-header-actions">
            {/* Viewport Zoom Controls */}
            {imageUrl && (
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
            )}

            {/* Reference Image File Upload / Replace */}
            <label className="editor-btn-secondary" style={{ cursor: "pointer", margin: 0 }}>
              <UploadCloud size={15} />
              <span>{isUploading ? "Uploading..." : imageUrl ? "Replace Image" : "Upload Image"}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileInputChange}
                disabled={isUploading}
                style={{ display: "none" }}
              />
            </label>

            {/* Remove Image Action */}
            {imageUrl && (
              <button
                type="button"
                className="editor-btn-secondary"
                onClick={handleRemoveImage}
                title="Remove layout image"
                style={{ color: "#ef4444" }}
              >
                <Trash2 size={15} />
                <span>Remove</span>
              </button>
            )}

            {/* Save Layout Action */}
            <button
              type="button"
              className="editor-btn-primary"
              onClick={handleSaveLayout}
              disabled={isSaving || isUploading}
              style={{ minWidth: "120px" }}
            >
              <Save size={15} />
              <span>{isSaving ? "Saving..." : "Save Layout"}</span>
            </button>

            {/* Close Studio */}
            <button type="button" className="editor-btn-icon-close" onClick={onClose} title="Close Studio">
              <X size={18} />
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

        {/* Workspace Canvas / Image Display */}
        <div
          ref={workspaceRef}
          className="editor-canvas-workspace pan-mode"
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            background: "#0f172a",
            cursor: isDragging ? "grabbing" : "grab",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {imageUrl ? (
            <div
              className="editor-canvas-content"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                position: "absolute",
                top: 0,
                left: 0,
              }}
            >
              <img
                src={imageUrl}
                alt="Project Layout"
                className="editor-base-image"
                onLoad={handleImageLoad}
                style={{
                  display: "block",
                  width: `${imgDimensions.width}px`,
                  height: `${imgDimensions.height}px`,
                  userSelect: "none",
                  WebkitUserDrag: "none",
                  pointerEvents: "none",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "3rem 2rem",
                maxWidth: "480px",
                color: "#94a3b8",
              }}
            >
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1.25rem",
                  color: "#cbd5e1",
                }}
              >
                <ImageIcon size={32} />
              </div>
              <h3 style={{ color: "#f8fafc", fontSize: "1.2rem", marginBottom: "0.5rem" }}>
                No Layout Image Uploaded
              </h3>
              <p style={{ fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
                Upload a site layout, master plan, or architectural schematic for this project.
                Visitors will view the layout image on the Project Details page and click it to open the real-time plot inventory.
              </p>
              <label
                className="editor-btn-primary"
                style={{
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.65rem 1.25rem",
                  fontSize: "0.92rem",
                  fontWeight: 600,
                }}
              >
                <UploadCloud size={18} />
                <span>Choose Layout Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  disabled={isUploading}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Footer Status Bar */}
        <div className="editor-footer-status-bar">
          <div className="status-item">
            <span className={`status-dot ${imageUrl ? "green" : "yellow"}`} />
            <span>{imageUrl ? "Layout Image Uploaded" : "No Layout Image"}</span>
          </div>
          {imageUrl && (
            <div className="status-item">
              <span>{imgDimensions.width} × {imgDimensions.height} px</span>
            </div>
          )}
          <div className="status-item right">
            <span>Plots are managed directly via MongoDB database records</span>
          </div>
        </div>
      </div>
    </div>
  );
}
