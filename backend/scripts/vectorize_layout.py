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
import math
import argparse
from typing import List, Dict, Any, Tuple

# Configuration defaults (Configurable heuristics)
DEFAULT_CONFIG = {
    "clahe_clip_limit": 2.5,
    "clahe_grid_size": 8,
    "bilateral_d": 7,
    "bilateral_sigma_color": 50,
    "bilateral_sigma_space": 50,
    "min_area_percent": 0.012,      # Capture small corner & annex plots
    "max_area_percent": 35.0,       # 35.0% (permits open spaces, blocks)
    "min_aspect_ratio": 0.12,       # Preserves narrow strip and road frontage plots
    "max_aspect_ratio": 7.5,
    "min_solidity": 0.35,           # Filter non-polygon slivers
    "max_iou": 0.35,                # Stricter NMS to stop collisions & overlapping duplicate outlines
    "max_containment": 0.70,        # Threshold for internal decorative nested shapes
    "approx_epsilon_factor": 0.022, # Ideal ~4-vertex simplification for rectangular/quad plots
    "min_vertices": 3,
    "max_vertices": 12,             # Plots typically 4 vertices, curve plots up to 8-12
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

    # Orientation Estimation via Hough Line Transform
    edges_for_hough = cv2.Canny(filtered, 40, 120)
    lines = cv2.HoughLinesP(edges_for_hough, 1, np.pi / 180, threshold=80, minLineLength=40, maxLineGap=10)
    dominant_angle = 0.0
    if lines is not None and len(lines) > 0:
        angles = []
        for line in lines:
            pts = line[0] if len(line.shape) > 1 else line
            if len(pts) == 4:
                x1, y1, x2, y2 = int(pts[0]), int(pts[1]), int(pts[2]), int(pts[3])
                dx = x2 - x1
                dy = y2 - y1
                deg = math.degrees(math.atan2(dy, dx)) % 180.0
                if deg > 90:
                    deg -= 180
                angles.append(deg)
        if len(angles) > 0:
            hist, bin_edges = np.histogram(angles, bins=36, range=(-90, 90))
            dominant_angle = float(bin_edges[np.argmax(hist)])

    # Detect if image is a high-key digital drawing/site plan (white background > 35%)
    white_pixel_ratio = float((gray > 240).mean())
    is_drawing = white_pixel_ratio > 0.35

    # Dual-pass edge and binary line detection:
    kernel_line = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel_line)

    thresh_adaptive = cv2.adaptiveThreshold(
        filtered,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        15,
        4
    )
    canny_edges = cv2.Canny(filtered, 25 if is_drawing else 40, 75 if is_drawing else 120)

    # Combine line features
    combined_binary = cv2.bitwise_or(thresh_adaptive, canny_edges)
    combined_binary = cv2.bitwise_or(combined_binary, blackhat)

    # Site content boundary masking:
    # On digital drawings, canvas background and grid lines have R,G,B all >= 244.
    # Exclude the canvas border so external CAD grid lines do not form false plots.
    site_mask = np.ones((proc_h, proc_w), dtype=np.uint8) * 255
    if is_drawing:
        b_ch, g_ch, r_ch = proc_img[:, :, 0], proc_img[:, :, 1], proc_img[:, :, 2]
        content_active = ((r_ch < 244) | (g_ch < 244) | (b_ch < 240)).astype(np.uint8) * 255
        k_site = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
        content_closed = cv2.morphologyEx(content_active, cv2.MORPH_CLOSE, k_site)
        site_cnts, _ = cv2.findContours(content_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if site_cnts:
            max_site = max(site_cnts, key=cv2.contourArea)
            if cv2.contourArea(max_site) > 0.10 * (proc_w * proc_h):
                site_mask = np.zeros((proc_h, proc_w), dtype=np.uint8)
                cv2.drawContours(site_mask, [max_site], -1, 255, -1)
                combined_binary = cv2.bitwise_and(combined_binary, site_mask)

    # Conservative gap recovery: Avoid stacked aggressive closing that destroys internal dividers
    if abs(dominant_angle) > 5.0 and abs(dominant_angle) < 85.0:
        rad = math.radians(dominant_angle)
        cos_a = abs(math.cos(rad))
        sin_a = abs(math.sin(rad))
        kw = max(2, int(round(3 * cos_a)))
        kh = max(2, int(round(3 * sin_a)))
        kernel_oriented = cv2.getStructuringElement(cv2.MORPH_RECT, (kw, kh))
        morphed = cv2.morphologyEx(combined_binary, cv2.MORPH_CLOSE, kernel_oriented, iterations=1)
    else:
        morphed = cv2.morphologyEx(combined_binary, cv2.MORPH_CLOSE, kernel_line, iterations=1)

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
    proc_area = float(proc_w * proc_h)

    # Helper function to evaluate and register candidate polygon
    def evaluate_and_register_polygon(approx_pts, parent_idx, is_subdivided=False):
        vert_count = len(approx_pts)
        if vert_count < config["min_vertices"] or vert_count > config["max_vertices"]:
            return

        cnt_pts = np.array(approx_pts).reshape((-1, 1, 2)).astype(np.int32)
        c_area = cv2.contourArea(cnt_pts)
        if c_area <= 0:
            return
        c_area_pct = (c_area / proc_area) * 100.0
        if c_area_pct < config["min_area_percent"] or c_area_pct > config["max_area_percent"]:
            return

        bx, by, bw, bh = cv2.boundingRect(cnt_pts)
        if bw == 0 or bh == 0:
            return

        # Border suppression
        if bx <= margin_x or by <= margin_y or (bx + bw) >= (proc_w - margin_x) or (by + bh) >= (proc_h - margin_y):
            return

        # Aspect ratio check
        c_aspect = float(bw) / float(bh)
        warnings = []
        if c_aspect < config["min_aspect_ratio"] or c_aspect > config["max_aspect_ratio"]:
            warnings.append("HIGH_ASPECT_RATIO")

        # Solidity check: reject slivers and winding lines
        c_hull = cv2.convexHull(cnt_pts)
        c_hull_area = cv2.contourArea(c_hull)
        c_solidity = c_area / c_hull_area if c_hull_area > 0 else 0.0
        if c_solidity < config["min_solidity"]:
            return

        # Isoperimetric quotient Q = 4 * pi * Area / Perimeter^2
        # Discards extremely thin meandering road strips and decorative lines
        c_peri = cv2.arcLength(cnt_pts, True)
        if c_peri > 0:
            c_iso_q = (4.0 * math.pi * c_area) / (c_peri * c_peri)
            if c_iso_q < 0.10 and c_aspect > 4.0:
                warnings.append("POSSIBLE_ROAD_FALSE_POSITIVE")

        norm_points = []
        for pt in approx_pts:
            px = (float(pt[0]) / float(proc_w)) * 100.0
            py = (float(pt[1]) / float(proc_h)) * 100.0
            norm_points.append({"x": round(px, 3), "y": round(py, 3)})

        norm_box = {
            "x": round((float(bx) / float(proc_w)) * 100.0, 3),
            "y": round((float(by) / float(proc_h)) * 100.0, 3),
            "width": round((float(bw) / float(proc_w)) * 100.0, 3),
            "height": round((float(bh) / float(proc_h)) * 100.0, 3),
        }

        raw_candidates.append({
            "candidateId": f"cand_{parent_idx}_{len(raw_candidates)}",
            "shapeType": "polygon",
            "points": norm_points,
            "boundingBox": norm_box,
            "rawBox": (bx, by, bw, bh),
            "area": c_area,
            "solidity": round(c_solidity, 3),
            "center": {
                "x": round(norm_box["x"] + norm_box["width"] / 2.0, 3),
                "y": round(norm_box["y"] + norm_box["height"] / 2.0, 3),
            },
            "suggestedPlotNumber": "",
            "ocrConfidence": 0.0,
            "geometryConfidence": 0.90 if is_subdivided else 0.80,
            "warnings": warnings,
        })

    # If drawing plan, extract clean land plot blocks via road-network segmentation
    if is_drawing:
        road_mask = ((gray >= 185) & (gray <= 232) & (site_mask > 0)).astype(np.uint8) * 255
        k_road = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        road_closed = cv2.morphologyEx(road_mask, cv2.MORPH_CLOSE, k_road)
        block_regions = cv2.bitwise_and(cv2.bitwise_not(road_closed), site_mask)
        num_lbls, lbls, stats, _ = cv2.connectedComponentsWithStats(block_regions, connectivity=8)
        for b_i in range(1, num_lbls):
            b_area = stats[b_i, cv2.CC_STAT_AREA]
            b_pct = (b_area / proc_area) * 100.0
            bx, by, bw, bh = stats[b_i, cv2.CC_STAT_LEFT], stats[b_i, cv2.CC_STAT_TOP], stats[b_i, cv2.CC_STAT_WIDTH], stats[b_i, cv2.CC_STAT_HEIGHT]
            if 0.20 <= b_pct <= 15.0 and bx > margin_x and by > margin_y and (bx+bw) < (proc_w-margin_x) and (by+bh) < (proc_h-margin_y):
                comp_m = (lbls == b_i).astype(np.uint8) * 255
                comp_cnts, _ = cv2.findContours(comp_m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if comp_cnts:
                    bc = max(comp_cnts, key=cv2.contourArea)
                    hull = cv2.convexHull(bc)
                    ha = cv2.contourArea(hull)
                    sol = b_area / ha if ha > 0 else 0
                    if sol >= 0.70:
                        peri = cv2.arcLength(bc, True)
                        approx_b = cv2.approxPolyDP(bc, 0.015 * peri, True)
                        if 4 <= len(approx_b) <= 12:
                            evaluate_and_register_polygon([[pt[0][0], pt[0][1]] for pt in approx_b], f"block_{b_i}")

    # Process extracted contours
    for idx, cnt in enumerate(contours):
        area = cv2.contourArea(cnt)
        if area <= 0:
            continue

        area_pct = (area / proc_area) * 100.0
        if area_pct < config["min_area_percent"] or area_pct > config["max_area_percent"]:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        if w == 0 or h == 0:
            continue

        # Border suppression
        if x <= margin_x or y <= margin_y or (x + w) >= (proc_w - margin_x) or (y + h) >= (proc_h - margin_y):
            continue

        # Title/legend suppression
        if y < title_height_cutoff and (float(w) / float(h) > 3.0 or area_pct < 0.25):
            continue
        if (x + w) > compass_x_cutoff and y < compass_y_cutoff:
            continue

        # Check for potential block subdivision if area > 1.2% of image and contains internal edges
        did_subdivide = False
        if area_pct > 1.20 and w > 40 and h > 40:
            mask = np.zeros((proc_h, proc_w), dtype=np.uint8)
            cv2.drawContours(mask, [cnt], -1, 255, thickness=-1)

            # Crop internal line features
            sub_combined = cv2.bitwise_and(combined_binary, combined_binary, mask=mask)
            # Find interior contours
            sub_cnts, _ = cv2.findContours(cv2.bitwise_not(sub_combined), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            valid_sub_parcels = []
            for scnt in sub_cnts:
                sa = cv2.contourArea(scnt)
                sa_pct = (sa / proc_area) * 100.0
                if 0.015 <= sa_pct <= 1.0:
                    sp = cv2.arcLength(scnt, True)
                    s_approx = cv2.approxPolyDP(scnt, 0.025 * sp, True)
                    if 3 <= len(s_approx) <= 8 and cv2.isContourConvex(s_approx):
                        valid_sub_parcels.append(s_approx)

            # If internal lines formed valid parcels, register subdivided parcels
            if len(valid_sub_parcels) >= 2:
                for s_approx in valid_sub_parcels:
                    evaluate_and_register_polygon(
                        [[pt[0][0], pt[0][1]] for pt in s_approx],
                        idx,
                        is_subdivided=True
                    )
                did_subdivide = True

        if not did_subdivide:
            peri = cv2.arcLength(cnt, True)
            epsilon = config["approx_epsilon_factor"] * peri
            approx = cv2.approxPolyDP(cnt, epsilon, True)

            if len(approx) > 4 and len(approx) <= 7:
                approx_4 = cv2.approxPolyDP(cnt, 0.035 * peri, True)
                if len(approx_4) == 4 and cv2.isContourConvex(approx_4):
                    approx = approx_4

            evaluate_and_register_polygon([[pt[0][0], pt[0][1]] for pt in approx], idx)

    # 4. Non-Maximum Suppression (NMS) & Hierarchical Nesting Deduplication
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
            if calculate_iou(b, ab) > config["max_iou"]:
                skip = True
                break
            if cand["area"] > 2.2 * accepted["area"] and calculate_containment(ab, b) > 0.85:
                skip = True
                break
        if not skip:
            candidates.append(cand)

    for cand in candidates:
        cand.pop("rawBox", None)

    # 5. RapidOCR with Targeted Crop Pass & Dimension Filter
    ocr_entries = []
    dimension_regex = re.compile(r"(\d+\s*x\s*\d+|sq\.?\s*ft|sqm|sq\.?\s*m|road|street|park|feet|ft|m²)", re.IGNORECASE)

    try:
        from rapidocr_onnxruntime import RapidOCR
        engine = RapidOCR()

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
                    # Exclude area measurements and street annotations
                    if dimension_regex.search(clean_text):
                        continue
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
        sys.stderr.write(f"[vectorize_layout.py] OCR Notice: {str(ocr_err)}\n")

    # 6. Spatial OCR Matching with Centroid-Distance Weighting & Ambiguity Checks
    for ocr in ocr_entries:
        matching_cands = []
        for cand in candidates:
            if point_in_polygon(ocr["x"], ocr["y"], cand["points"]):
                # Calculate normalized distance to polygon centroid
                dist = math.hypot(ocr["x"] - cand["center"]["x"], ocr["y"] - cand["center"]["y"])
                match_score = ocr["score"] * (1.0 / (1.0 + dist * 0.15))
                matching_cands.append((cand, match_score))

        if matching_cands:
            # Sort by match score descending
            matching_cands.sort(key=lambda item: item[1], reverse=True)
            best_cand, best_score = matching_cands[0]

            # If two candidates compete closely for the same label, flag AMBIGUOUS_LABEL
            if len(matching_cands) > 1 and matching_cands[1][1] > 0.85 * best_score:
                if "AMBIGUOUS_LABEL" not in best_cand["warnings"]:
                    best_cand["warnings"].append("AMBIGUOUS_LABEL")
                if "AMBIGUOUS_LABEL" not in matching_cands[1][0]["warnings"]:
                    matching_cands[1][0]["warnings"].append("AMBIGUOUS_LABEL")

            if not best_cand["suggestedPlotNumber"] or ocr["score"] > best_cand["ocrConfidence"]:
                best_cand["suggestedPlotNumber"] = ocr["text"]
                best_cand["ocrConfidence"] = ocr["score"]

    return {
        "success": True,
        "referenceWidth": orig_width,
        "referenceHeight": orig_height,
        "dominantAngle": round(dominant_angle, 2),
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
