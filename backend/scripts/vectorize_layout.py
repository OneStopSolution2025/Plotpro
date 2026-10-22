#!/usr/bin/env python3
"""
vectorize_layout.py
Real-Estate Site Plan Contour Vectorization and OCR Detection Worker.

Accepts an input image path, optional JSON config parameters, and produces
normalized vector polygon candidates with associated OCR label predictions.

Emits strictly structured JSON to stdout:
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
      "suggestedPlotNumber": str,
      "ocrConfidence": float,
      "warnings": [str, ...]
    }
  ]
}
"""

import sys
import os
import json
import re
import argparse
from typing import List, Dict, Any, Tuple

# Configuration defaults (Configurable heuristics)
DEFAULT_CONFIG = {
    "clahe_clip_limit": 2.5,
    "clahe_grid_size": 8,
    "bilateral_d": 7,
    "bilateral_sigma_color": 50,
    "bilateral_sigma_space": 50,
    "min_area_percent": 0.015,      # Relaxed from 0.03% to 0.015% to capture small corner/annex plots
    "max_area_percent": 40.0,       # 40.0% (permits large open parks/plots)
    "min_aspect_ratio": 0.12,       # Preserves narrow strip and road frontage plots
    "max_aspect_ratio": 7.5,
    "min_solidity": 0.32,           # Relaxed from 0.38 to capture irregular boundary plots
    "max_iou": 0.45,                # NMS threshold for duplicate concentric outlines
    "max_containment": 0.70,        # Threshold for internal decorative nested shapes
    "approx_epsilon_factor": 0.010, # Finer approximation tolerance for crisper corners
    "min_vertices": 3,
    "max_vertices": 22,
    "max_dimension": 2500,          # Downsample threshold for memory protection
    "ocr_score_threshold": 0.35,    # Capture slightly fainter plot numbers
    "label_regex": r"^[A-Za-z]?-?\d{1,4}[A-Za-z]?$",
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

def run_vectorization(image_path: str, user_config: Dict[str, Any] = None) -> Dict[str, Any]:
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
            "message": f"Required computer vision dependencies not available: {str(e)}"
        }

    # Load image safely
    try:
        with Image.open(image_path) as pil_img:
            orig_w, orig_h = pil_img.size
            if orig_w * orig_h > 16_000_000:
                # Pixel cap
                return {
                    "success": False,
                    "error": "IMAGE_TOO_LARGE",
                    "message": f"Image resolution {orig_w}x{orig_h} exceeds 16MP limit."
                }
            # Convert to RGB numpy array
            rgb_arr = np.array(pil_img.convert("RGB"))
            bgr_img = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR)
    except Exception as e:
        return {"success": False, "error": "DECODE_ERROR", "message": f"Failed to decode image: {str(e)}"}

    orig_height, orig_width = bgr_img.shape[:2]
    total_orig_area = float(orig_width * orig_height)

    # Scale down if exceeds max_dimension
    scale = 1.0
    proc_img = bgr_img
    if max(orig_width, orig_height) > config["max_dimension"]:
        scale = config["max_dimension"] / float(max(orig_width, orig_height))
        new_w = int(orig_width * scale)
        new_h = int(orig_height * scale)
        proc_img = cv2.resize(bgr_img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    proc_h, proc_w = proc_img.shape[:2]

    # Preprocessing
    lab = cv2.cvtColor(proc_img, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)

    clahe = cv2.createCLAHE(
        clipLimit=config["clahe_clip_limit"],
        tileGridSize=(config["clahe_grid_size"], config["clahe_grid_size"])
    )
    cl = clahe.apply(l_chan)
    enhanced_bgr = cv2.cvtColor(cv2.merge((cl, a_chan, b_chan)), cv2.COLOR_LAB2BGR)
    gray = cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2GRAY)

    # Bilateral Filter to preserve edges while smoothing scan artifacts
    filtered = cv2.bilateralFilter(
        gray,
        config["bilateral_d"],
        config["bilateral_sigma_color"],
        config["bilateral_sigma_space"]
    )

    # Dual-pass edge and binary line detection to capture faint and broken parcel lines:
    # Pass 1: Morphological Black-Hat to extract dark line networks from bright background
    kernel_line = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel_line)

    # Pass 2: Adaptive Gaussian threshold
    thresh_adaptive = cv2.adaptiveThreshold(
        filtered,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        15,
        4
    )

    # Pass 3: Canny edge detector for thin boundary lines
    canny_edges = cv2.Canny(filtered, 40, 120)

    # Combine line features
    combined_binary = cv2.bitwise_or(thresh_adaptive, canny_edges)
    combined_binary = cv2.bitwise_or(combined_binary, blackhat)

    # Bridge small gaps in plot boundary lines (horizontal & vertical connections)
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 3))
    morphed = cv2.morphologyEx(combined_binary, cv2.MORPH_CLOSE, kernel_line, iterations=1)
    morphed = cv2.morphologyEx(morphed, cv2.MORPH_CLOSE, h_kernel, iterations=1)
    morphed = cv2.morphologyEx(morphed, cv2.MORPH_CLOSE, v_kernel, iterations=1)

    # Find Contours with hierarchy
    contours, hierarchy = cv2.findContours(morphed, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    # Margin guard thresholds (suppress outer frame borders and margins)
    margin_x = int(proc_w * 0.015)
    margin_y = int(proc_h * 0.015)
    title_height_cutoff = int(proc_h * 0.07)
    compass_x_cutoff = int(proc_w * 0.88)
    compass_y_cutoff = int(proc_h * 0.16)

    raw_candidates = []
    plot_regex = re.compile(config["label_regex"], re.IGNORECASE)

    for idx, cnt in enumerate(contours):
        area = cv2.contourArea(cnt)
        if area <= 0:
            continue

        # Area percentage relative to processed image
        proc_area = float(proc_w * proc_h)
        area_pct = (area / proc_area) * 100.0

        if area_pct < config["min_area_percent"] or area_pct > config["max_area_percent"]:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        if w == 0 or h == 0:
            continue

        # 1. Edge & border suppression: exclude contours attached to the image canvas border
        if x <= margin_x or y <= margin_y or (x + w) >= (proc_w - margin_x) or (y + h) >= (proc_h - margin_y):
            continue

        # 2. Metadata / Title suppression: top banner text / legends
        if y < title_height_cutoff and (float(w) / float(h) > 3.0 or area_pct < 0.25):
            continue

        # 3. Compass / corner graphic suppression
        if (x + w) > compass_x_cutoff and y < compass_y_cutoff:
            continue

        aspect_ratio = float(w) / float(h)
        warnings = []
        if aspect_ratio < config["min_aspect_ratio"] or aspect_ratio > config["max_aspect_ratio"]:
            warnings.append("HIGH_ASPECT_RATIO")

        # 4. Solidity check: true plot/block shapes have solid area; reject winding text lines and road slivers
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = area / hull_area if hull_area > 0 else 0.0
        if solidity < config["min_solidity"]:
            continue

        peri = cv2.arcLength(cnt, True)
        epsilon = config["approx_epsilon_factor"] * peri
        approx = cv2.approxPolyDP(cnt, epsilon, True)

        vert_count = len(approx)
        if vert_count < config["min_vertices"] or vert_count > config["max_vertices"]:
            continue

        # Map back to original coordinate percentage (0.0 to 100.0)
        norm_points = []
        for pt in approx:
            px = (float(pt[0][0]) / float(proc_w)) * 100.0
            py = (float(pt[0][1]) / float(proc_h)) * 100.0
            norm_points.append({"x": round(px, 3), "y": round(py, 3)})

        norm_box = {
            "x": round((float(x) / float(proc_w)) * 100.0, 3),
            "y": round((float(y) / float(proc_h)) * 100.0, 3),
            "width": round((float(w) / float(proc_w)) * 100.0, 3),
            "height": round((float(h) / float(proc_h)) * 100.0, 3),
        }

        raw_candidates.append({
            "candidateId": f"cand_{idx}_{len(raw_candidates)}",
            "shapeType": "polygon",
            "points": norm_points,
            "boundingBox": norm_box,
            "rawBox": (x, y, w, h),
            "area": area,
            "solidity": round(solidity, 3),
            "center": {
                "x": round(norm_box["x"] + norm_box["width"] / 2.0, 3),
                "y": round(norm_box["y"] + norm_box["height"] / 2.0, 3),
            },
            "suggestedPlotNumber": "",
            "ocrConfidence": 0.0,
            "warnings": warnings,
        })

    # 5. Non-Maximum Suppression (NMS) & Hierarchical Nesting Deduplication
    # We sort by area ASCENDING (smaller plots first) so distinct child plots are NEVER dropped
    # by an enclosing sector/block boundary!
    raw_candidates.sort(key=lambda c: c["area"], reverse=False)

    def calculate_iou(b1, b2) -> float:
        x1, y1 = max(b1[0], b2[0]), max(b1[1], b2[1])
        x2, y2 = min(b1[0] + b1[2], b2[0] + b2[2]), min(b1[1] + b1[3], b2[1] + b2[3])
        if x2 <= x1 or y2 <= y1:
            return 0.0
        inter = (x2 - x1) * (y2 - y1)
        union = (b1[2] * b1[3]) + (b2[2] * b2[3]) - inter
        return (inter / union) if union > 0 else 0.0

    def calculate_containment(inner_box, outer_box) -> float:
        x1, y1 = max(inner_box[0], outer_box[0]), max(inner_box[1], outer_box[1])
        x2, y2 = min(inner_box[0] + inner_box[2], outer_box[0] + outer_box[2]), min(inner_box[1] + inner_box[3], outer_box[1] + outer_box[2])
        if x2 <= x1 or y2 <= y1:
            return 0.0
        inter = (x2 - x1) * (y2 - y1)
        inner_area = float(inner_box[2] * inner_box[3])
        return (inter / inner_area) if inner_area > 0 else 0.0

    candidates = []
    for cand in raw_candidates:
        b = cand["rawBox"]
        skip = False
        for accepted in candidates:
            ab = accepted["rawBox"]
            # Deduplicate near-identical concentric outlines
            if calculate_iou(b, ab) > config["max_iou"]:
                skip = True
                break
            # If current shape nearly completely contains an already accepted smaller plot,
            # and current shape is much larger (> 2.5x), it is an outer container/block: skip outer block
            # so the individual parcel is preserved!
            if cand["area"] > 2.5 * accepted["area"] and calculate_containment(ab, b) > 0.85:
                skip = True
                break
        if not skip:
            candidates.append(cand)

    # Clean up internal rawBox helper field from candidates
    for cand in candidates:
        cand.pop("rawBox", None)

    # Optional RapidOCR Detection with multi-pass contrast enhancement
    ocr_entries = []
    try:
        from rapidocr_onnxruntime import RapidOCR
        engine = RapidOCR()

        # Multi-scale and contrast pass for OCR
        passes = [proc_img]
        if proc_w < 1500:
            upscaled = cv2.resize(proc_img, (0, 0), fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
            passes.append(upscaled)

        for p_idx, ocr_target in enumerate(passes):
            target_h, target_w = ocr_target.shape[:2]
            ocr_result, _ = engine(ocr_target)
            if ocr_result:
                for item in ocr_result:
                    box, text, score = item[0], item[1], float(item[2])
                    clean_text = str(text).strip()
                    if score >= config["ocr_score_threshold"] and plot_regex.match(clean_text):
                        xs = [p[0] for p in box]
                        ys = [p[1] for p in box]
                        cx = (sum(xs) / len(xs) / float(target_w)) * 100.0
                        cy = (sum(ys) / len(ys) / float(target_h)) * 100.0
                        ocr_entries.append({
                            "text": clean_text,
                            "score": round(score, 3),
                            "x": cx,
                            "y": cy
                        })
            if ocr_entries:
                break
    except Exception as ocr_err:
        # OCR is optional; proceed with vector geometry if OCR fails or is missing
        sys.stderr.write(f"[vectorize_layout.py] OCR Notice: {str(ocr_err)}\n")

    # Associate OCR texts to candidates using Point-In-Polygon
    for ocr in ocr_entries:
        for cand in candidates:
            if point_in_polygon(ocr["x"], ocr["y"], cand["points"]):
                if not cand["suggestedPlotNumber"] or ocr["score"] > cand["ocrConfidence"]:
                    cand["suggestedPlotNumber"] = ocr["text"]
                    cand["ocrConfidence"] = ocr["score"]

    return {
        "success": True,
        "referenceWidth": orig_width,
        "referenceHeight": orig_height,
        "candidateCount": len(candidates),
        "candidates": candidates,
    }

def main():
    parser = argparse.ArgumentParser(description="Vectorize site plan image into polygon candidates.")
    parser.add_argument("image_path", help="Path to input image file")
    parser.add_argument("--config", help="Optional JSON string with custom detection config", default="{}")
    args = parser.parse_args()

    user_cfg = {}
    if args.config:
        try:
            user_cfg = json.loads(args.config)
        except Exception:
            pass

    result = run_vectorization(args.image_path, user_cfg)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
