#!/usr/bin/env python3
"""
refine_geometry.py
Contour-Guided Polygon Refinement, Adjacency/Overlap Analysis, and OCR Cross-Check Worker.

Accepts:
- Reference site-plan image file path.
- Input candidates JSON file path (e.g. initial polygon proposals from Gemini or initial contour detection).
- Config parameters (optional JSON string).

Outputs strictly valid JSON to stdout:
{
  "success": True,
  "referenceWidth": int,
  "referenceHeight": int,
  "candidates": [
    {
      "candidateId": str,
      "shapeType": "polygon",
      "points": [{"x": float, "y": float}, ...], # Normalized 0-100%
      "boundingBox": {"x": float, "y": float, "width": float, "height": float},
      "center": {"x": float, "y": float},
      "suggestedPlotNumber": str,
      "ocrConfidence": float,
      "alignmentScore": float, # 0.0 to 100.0%
      "warnings": [str, ...]
    }
  ]
}
"""

import sys
import os
import json
import math
import argparse
from typing import List, Dict, Any, Tuple

DEFAULT_CONFIG = {
    "snap_search_radius_px": 14,      # Local search window radius for edge snapping
    "min_edge_gradient": 35,          # Gradient magnitude threshold for edge consideration
    "max_overlap_percent": 5.0,       # IoU / area overlap threshold to flag OVERLAPS_NEIGHBOUR
    "min_alignment_score": 45.0,      # Score below which BOUNDARY_ALIGNMENT_LOW is flagged
    "max_dimension": 2500,            # Downscale cap for memory protection if needed
    "ocr_crosscheck": True,           # Whether to run RapidOCR cross-check on bounding boxes
    "ocr_score_threshold": 0.40,
}

def point_in_polygon(x: float, y: float, poly: List[Dict[str, float]]) -> bool:
    """Ray casting point-in-polygon test with normalized coordinates."""
    inside = False
    n = len(poly)
    if n < 3:
        return False
    p1 = poly[0]
    for i in range(1, n + 1):
        p2 = poly[i % n]
        if y > min(p1["y"], p2["y"]):
            if y <= max(p1["y"], p2["y"]):
                if x <= max(p1["x"], p2["x"]):
                    if p1["y"] != p2["y"]:
                        xinters = (y - p1["y"]) * (p2["x"] - p1["x"]) / (p2["y"] - p1["y"]) + p1["x"]
                    if p1["x"] == p2["x"] or x <= xinters:
                        inside = not inside
        p1 = p2
    return inside

def polygon_area(points: List[Dict[str, float]]) -> float:
    """Shoelace formula for polygon area."""
    n = len(points)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += points[i]["x"] * points[j]["y"]
        area -= points[j]["x"] * points[i]["y"]
    return abs(area) / 2.0

def bounding_box_overlap(b1: Dict[str, float], b2: Dict[str, float]) -> float:
    """Computes Intersection-over-Union (IoU) of two 2D axis-aligned bounding boxes (0-100%)."""
    x1 = max(b1["x"], b2["x"])
    y1 = max(b1["y"], b2["y"])
    x2 = min(b1["x"] + b1["width"], b2["x"] + b2["width"])
    y2 = min(b1["y"] + b1["height"], b2["y"] + b2["height"])

    if x2 <= x1 or y2 <= y1:
        return 0.0

    intersection = (x2 - x1) * (y2 - y1)
    area1 = b1["width"] * b1["height"]
    area2 = b2["width"] * b2["height"]
    union = area1 + area2 - intersection

    if union <= 0:
        return 0.0
    return (intersection / union) * 100.0

def snap_vertex_to_nearest_edge(
    px: float,
    py: float,
    edge_map,
    corners_map,
    search_r: int,
    w: int,
    h: int
) -> Tuple[float, float, bool]:
    """
    Finds the nearest strong edge or corner in a local pixel window.
    Only snaps if edge/corner evidence is clear and within search_r.
    """
    ix = int(round(px))
    iy = int(round(py))

    min_x = max(0, ix - search_r)
    max_x = min(w - 1, ix + search_r)
    min_y = max(0, iy - search_r)
    max_y = min(h - 1, iy + search_r)

    best_dist = float("inf")
    best_pt = (px, py)
    found_corner = False

    # Check corners first if available
    if corners_map is not None:
        sub_corners = corners_map[min_y:max_y + 1, min_x:max_x + 1]
        c_pts = []
        for dy in range(sub_corners.shape[0]):
            for dx in range(sub_corners.shape[1]):
                if sub_corners[dy, dx] > 0:
                    c_pts.append((min_x + dx, min_y + dy))

        for cx, cy in c_pts:
            dist = math.hypot(cx - ix, cy - iy)
            if dist < best_dist and dist <= search_r:
                best_dist = dist
                best_pt = (float(cx), float(cy))
                found_corner = True

    if found_corner:
        return best_pt[0], best_pt[1], True

    # Fallback: search nearest edge pixel
    sub_edges = edge_map[min_y:max_y + 1, min_x:max_x + 1]
    e_pts = []
    for dy in range(sub_edges.shape[0]):
        for dx in range(sub_edges.shape[1]):
            if sub_edges[dy, dx] > 0:
                e_pts.append((min_x + dx, min_y + dy))

    for ex, ey in e_pts:
        dist = math.hypot(ex - ix, ey - iy)
        if dist < best_dist and dist <= search_r:
            best_dist = dist
            best_pt = (float(ex), float(ey))

    if best_dist <= search_r:
        return best_pt[0], best_pt[1], True

    return px, py, False

def calculate_boundary_alignment_score(points_px: List[Tuple[float, float]], edge_map, w: int, h: int) -> float:
    """
    Calculates what fraction of the polygon perimeter directly traces high-contrast edges.
    Returns 0.0 to 100.0%.
    """
    n = len(points_px)
    if n < 3:
        return 0.0

    total_samples = 0
    supported_samples = 0

    for i in range(n):
        p1 = points_px[i]
        p2 = points_px[(i + 1) % n]
        seg_len = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        steps = max(2, int(round(seg_len / 3.0))) # sample every ~3 pixels

        for s in range(steps):
            t = s / float(steps)
            sx = int(round(p1[0] + t * (p2[0] - p1[0])))
            sy = int(round(p1[1] + t * (p2[1] - p1[1])))

            if 0 <= sx < w and 0 <= sy < h:
                total_samples += 1
                # Check 3x3 local neighborhood
                y_low = max(0, sy - 1)
                y_high = min(h - 1, sy + 1)
                x_low = max(0, sx - 1)
                x_high = min(w - 1, sx + 1)

                if edge_map[y_low:y_high + 1, x_low:x_high + 1].max() > 0:
                    supported_samples += 1

    if total_samples == 0:
        return 0.0
    return round((supported_samples / total_samples) * 100.0, 1)

def run_refinement(image_path: str, candidates_input: List[Dict[str, Any]], user_config: Dict[str, Any] = None) -> Dict[str, Any]:
    if user_config is None:
        user_config = {}
    config = {**DEFAULT_CONFIG, **user_config}

    if not os.path.exists(image_path):
        return {"success": False, "error": f"Image file not found: {image_path}"}

    try:
        import cv2
        import numpy as np
        from PIL import Image
    except ImportError as e:
        return {
            "success": False,
            "error": "OPENCV_UNAVAILABLE",
            "message": f"Required computer vision dependencies not available: {str(e)}",
            "candidates": candidates_input,
        }

    # Load image safely
    try:
        with Image.open(image_path) as pil_img:
            orig_w, orig_h = pil_img.size
            img_cv = cv2.imread(image_path)
    except Exception as read_err:
        return {"success": False, "error": f"Failed reading image: {str(read_err)}"}

    if img_cv is None:
        return {"success": False, "error": "Unable to decode image via OpenCV"}

    h_img, w_img = img_cv.shape[:2]

    # Preprocess image for edge and corner detection
    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    denoised = cv2.bilateralFilter(enhanced, d=7, sigmaColor=50, sigmaSpace=50)

    # Edge map using Canny
    edges = cv2.Canny(denoised, 30, 100)

    # Corner map using Harris corner detector
    corners_map = None
    try:
        harris = cv2.cornerHarris(np.float32(denoised), blockSize=3, ksize=3, k=0.04)
        harris_norm = cv2.normalize(harris, None, 0, 255, cv2.NORM_MINMAX)
        corners_map = (harris_norm > 160).astype(np.uint8) * 255
    except Exception:
        corners_map = None

    search_radius_px = int(config.get("snap_search_radius_px", 14))

    refined_candidates = []

    # 1. Vertex Refinement & Alignment Scoring
    for cand in candidates_input:
        raw_points = cand.get("points", [])
        if not raw_points or len(raw_points) < 3:
            continue

        warnings = list(cand.get("warnings") or [])
        snapped_px_pts = []
        snapped_count = 0

        for pt in raw_points:
            # Convert 0-100% normalized to pixel coords
            px = (float(pt["x"]) / 100.0) * w_img
            py = (float(pt["y"]) / 100.0) * h_img

            nx, ny, did_snap = snap_vertex_to_nearest_edge(
                px, py, edges, corners_map, search_radius_px, w_img, h_img
            )
            if did_snap:
                snapped_count += 1

            snapped_px_pts.append((nx, ny))

        # Check alignment score with the snapped points
        alignment_score = calculate_boundary_alignment_score(snapped_px_pts, edges, w_img, h_img)

        # Convert back to normalized 0-100%
        norm_points = []
        min_x, max_x = 100.0, 0.0
        min_y, max_y = 100.0, 0.0

        for (sx, sy) in snapped_px_pts:
            nx = round(max(0.0, min(100.0, (sx / w_img) * 100.0)), 2)
            ny = round(max(0.0, min(100.0, (sy / h_img) * 100.0)), 2)
            min_x = min(min_x, nx)
            max_x = max(max_x, nx)
            min_y = min(min_y, ny)
            max_y = max(max_y, ny)
            norm_points.append({"x": nx, "y": ny})

        bw = round(max_x - min_x, 2)
        bh = round(max_y - min_y, 2)

        if alignment_score < float(config.get("min_alignment_score", 45.0)):
            if "BOUNDARY_ALIGNMENT_LOW" not in warnings:
                warnings.append("BOUNDARY_ALIGNMENT_LOW")

        refined_candidates.append({
            "candidateId": cand.get("candidateId", f"cand_{len(refined_candidates) + 1}"),
            "shapeType": "polygon",
            "points": norm_points,
            "boundingBox": {
                "x": round(min_x, 2),
                "y": round(min_y, 2),
                "width": bw,
                "height": bh,
            },
            "center": {
                "x": round(min_x + bw / 2.0, 2),
                "y": round(min_y + bh / 2.0, 2),
            },
            "suggestedPlotNumber": cand.get("suggestedPlotNumber", ""),
            "ocrConfidence": cand.get("ocrConfidence", 0.0),
            "alignmentScore": alignment_score,
            "sourceProvider": cand.get("sourceProvider", "gemini"),
            "warnings": warnings,
        })

    # 2. Overlap & Adjacency Detection
    max_overlap_pct = float(config.get("max_overlap_percent", 5.0))
    n_cands = len(refined_candidates)
    for i in range(n_cands):
        c1 = refined_candidates[i]
        b1 = c1["boundingBox"]
        for j in range(i + 1, n_cands):
            c2 = refined_candidates[j]
            b2 = c2["boundingBox"]

            overlap_pct = bounding_box_overlap(b1, b2)
            if overlap_pct > max_overlap_pct:
                if "OVERLAPS_NEIGHBOUR" not in c1["warnings"]:
                    c1["warnings"].append("OVERLAPS_NEIGHBOUR")
                if "OVERLAPS_NEIGHBOUR" not in c2["warnings"]:
                    c2["warnings"].append("OVERLAPS_NEIGHBOUR")

    # 3. Optional RapidOCR Cross-Check
    if config.get("ocr_crosscheck", True):
        try:
            from rapidocr_onnxruntime import RapidOCR
            ocr_engine = RapidOCR()
            ocr_res, _ = ocr_engine(img_cv)
            if ocr_res:
                for text_box, raw_text, conf in ocr_res:
                    if float(conf) < float(config.get("ocr_score_threshold", 0.40)):
                        continue
                    clean_text = str(raw_text).strip()
                    # Calculate center of OCR bounding box
                    box_np = np.array(text_box)
                    center_px_x = float(np.mean(box_np[:, 0]))
                    center_px_y = float(np.mean(box_np[:, 1]))
                    norm_cx = (center_px_x / w_img) * 100.0
                    norm_cy = (center_px_y / h_img) * 100.0

                    # Find candidate containing this text
                    for c in refined_candidates:
                        if point_in_polygon(norm_cx, norm_cy, c["points"]):
                            gemini_lbl = str(c.get("suggestedPlotNumber") or "").strip().lower()
                            ocr_lbl = clean_text.lower()
                            # If Gemini had no label, adopt OCR label
                            if not gemini_lbl:
                                c["suggestedPlotNumber"] = clean_text
                                c["ocrConfidence"] = round(float(conf), 2)
                            elif gemini_lbl != ocr_lbl:
                                # Conflicting labels! Flag LABEL_UNCERTAIN
                                if "LABEL_UNCERTAIN" not in c["warnings"]:
                                    c["warnings"].append("LABEL_UNCERTAIN")
                                c["altOcrLabel"] = clean_text
                                c["altOcrConfidence"] = round(float(conf), 2)
        except Exception as ocr_err:
            # OCR degradation fallback
            pass

    return {
        "success": True,
        "referenceWidth": orig_w,
        "referenceHeight": orig_h,
        "candidates": refined_candidates,
    }

def main():
    parser = argparse.ArgumentParser(description="Refine layout candidate geometry using OpenCV edge/corner detection")
    parser.add_argument("image_path", help="Path to reference site plan image")
    parser.add_argument("candidates_json", help="Path to input candidates JSON file or raw JSON string")
    parser.add_argument("--config", default="{}", help="Custom JSON configuration overrides")

    args = parser.parse_args()

    try:
        user_config = json.loads(args.config) if args.config else {}
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid config JSON: {str(e)}"}))
        sys.exit(1)

    try:
        if os.path.exists(args.candidates_json):
            with open(args.candidates_json, "r", encoding="utf-8") as f:
                candidates_data = json.load(f)
        else:
            candidates_data = json.loads(args.candidates_json)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid candidates JSON input: {str(e)}"}))
        sys.exit(1)

    input_list = candidates_data if isinstance(candidates_data, list) else candidates_data.get("candidates", [])

    result = run_refinement(args.image_path, input_list, user_config)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
