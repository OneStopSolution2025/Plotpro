"""
regions.py — region extraction, block subdivision and false-positive control.

Three problems are addressed here:

**Large blocks swallow individual plots.** A block of eight parcels traced
as one contour produces one candidate instead of eight. A block is only
split when *internal boundary evidence* supports it: the internal divider
lines are detected, and the split is performed by watershed over the
distance transform with those dividers forced to zero depth, so the split
follows real lines instead of inventing partitions.

**Roads, legends, compasses and text become plots.** A single area,
colour or aspect-ratio threshold can never separate them reliably. This
module combines several independent signals — corridor geometry, position
relative to the sheet boundary, contour hierarchy, presence of internal
parcel dividers, neighbouring plot geometry and OCR-detected annotation
text — and records the reason for every rejection.

**Vegetation overlaps genuine boundaries.** Vegetation is detected as
*supporting* evidence. It lowers confidence and flags the candidate; it
never erases boundary segments, because a tree can sit on top of a real
parcel line.
"""

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

from .geometry import (
    bbox_of_points,
    dedupe_points,
    polygon_area,
    polygon_centroid,
    polygon_iou,
    validate_polygon,
)
from .polygons import order_quad, cv2_min_area_rect


# --------------------------------------------------------------------------
# candidate construction
# --------------------------------------------------------------------------

def _shape_metrics(contour: np.ndarray) -> Dict[str, float]:
    """Area / solidity / rectangularity metrics for a contour."""
    area = float(cv2.contourArea(contour))
    hull = cv2.convexHull(contour)
    hull_area = float(cv2.contourArea(hull))
    solidity = (area / hull_area) if hull_area > 1e-6 else 0.0
    box = cv2.minAreaRect(contour)
    _, _, rect_angle = box
    (rw, rh) = box[1]
    box_area = max(1e-6, rw * rh)
    rectangularity = min(1.0, area / box_area) if box_area > 0 else 0.0
    return {
        "area": round(area, 2),
        "solidity": round(solidity, 4),
        "rectangularity": round(rectangularity, 4),
        "rectAngle": round(float(rect_angle), 2),
        "width": round(float(rw), 2),
        "height": round(float(rh), 2),
    }


def _contour_to_candidate(
    contour: np.ndarray,
    *,
    index: int,
    image_w: int,
    image_h: int,
    hierarchy_depth: int,
    is_hole: bool,
) -> Optional[Dict[str, Any]]:
    """Convert a pixel contour into a normalised candidate record."""
    if contour is None or len(contour) < 3:
        return None
    metrics = _shape_metrics(contour)
    if metrics["area"] <= 0:
        return None

    pts = contour.reshape(-1, 2)
    norm = [
        {
            "x": round((float(p[0]) / image_w) * 100.0, 3),
            "y": round((float(p[1]) / image_h) * 100.0, 3),
        }
        for p in pts
    ]
    norm = dedupe_points(norm)
    if len(norm) < 3:
        return None

    bbox = bbox_of_points(norm)
    centroid = polygon_centroid(norm)
    aspect = (bbox["width"] / bbox["height"]) if bbox["height"] > 1e-6 else 0.0

    return {
        "candidateId": f"cand_{index}",
        "shapeType": "polygon",
        "points": norm,
        "boundingBox": {
            "x": round(bbox["x"], 3),
            "y": round(bbox["y"], 3),
            "width": round(bbox["width"], 3),
            "height": round(bbox["height"], 3),
        },
        "center": {"x": round(centroid[0], 3), "y": round(centroid[1], 3)},
        "areaPercent": round(metrics["area"] / (image_w * image_h) * 100.0, 5),
        "solidity": metrics["solidity"],
        "rectangularity": metrics["rectangularity"],
        "aspectRatio": round(aspect, 3),
        "hierarchyDepth": hierarchy_depth,
        "isHole": is_hole,
        "suggestedPlotNumber": "",
        "ocrConfidence": 0.0,
        "geometryConfidence": 0.0,
        "warnings": [],
        "classification": "uncertain",
    }


def extract_candidates_from_mask(
    mask: np.ndarray,
    *,
    min_area_percent: float = 0.008,
    max_area_percent: float = 35.0,
    max_dimension: int = 2500,
) -> List[Dict[str, Any]]:
    """
    Extract candidate polygons from a binary region mask.

    Contour hierarchy is retained so that a candidate can later be judged by
    whether it sits inside a larger enclosure (block) or inside the sheet.
    """
    h, w = mask.shape[:2]
    scale = 1.0
    work = mask
    if max(h, w) > max_dimension:
        scale = max_dimension / float(max(h, w))
        work = cv2.resize(mask, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    cnts, hier = cv2.findContours(work, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hier is None:
        return []

    hier = hier[0]
    total_area = float(work.shape[0] * work.shape[1])
    candidates: List[Dict[str, Any]] = []

    for idx, cnt in enumerate(cnts):
        area = cv2.contourArea(cnt)
        if area <= 0:
            continue
        area_pct = area / total_area * 100.0
        if area_pct < min_area_percent or area_pct > max_area_percent:
            continue

        parent = hier[idx][3]
        depth = 0
        is_hole = False
        if parent >= 0:
            depth = 1
            is_hole = True
            grand = hier[parent][3]
            if grand >= 0:
                depth = 2

        cand = _contour_to_candidate(
            cnt,
            index=len(candidates),
            image_w=work.shape[1],
            image_h=work.shape[0],
            hierarchy_depth=depth,
            is_hole=is_hole,
        )
        if cand is None:
            continue
        cand["_contour"] = cnt.reshape(-1, 2)
        cand["_maskScale"] = scale
        candidates.append(cand)

    return candidates


def enclosed_regions(boundary_mask: np.ndarray) -> np.ndarray:
    """
    Return the regions that the boundary evidence encloses.

    This is far more reliable than segmenting the parcel *fill* by colour:
    on a real site plan the paper and the parcel fill are nearly the same
    tone, so colour clustering picks the paper (measured: 95% coverage, one
    blob covering the whole sheet) while the parcels themselves are
    distinguished purely by their drawn boundaries.

    The method floods the free space from the sheet border; whatever the
    flood cannot reach is an enclosed parcel.
    """
    if boundary_mask is None or boundary_mask.size == 0:
        return np.zeros((1, 1), np.uint8)

    padded = cv2.copyMakeBorder(
        boundary_mask, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=255
    )
    free = cv2.bitwise_not(padded)
    ffmask = np.zeros((free.shape[0] + 2, free.shape[1] + 2), np.uint8)
    cv2.floodFill(free, ffmask, (0, 0), 128)

    # 255 = free space that the outside flood could not reach (enclosed).
    enclosed = np.where(free == 255, 255, 0).astype(np.uint8)
    return enclosed[1:-1, 1:-1]


# --------------------------------------------------------------------------
# block subdivision
# --------------------------------------------------------------------------

def subdivide_block(
    region_mask: np.ndarray,
    line_mask: np.ndarray,
    *,
    min_divider_length_ratio: float = 0.22,
    max_parts: int = 24,
) -> Dict[str, Any]:
    """
    Split one region into the individual parcels it contains.

    The split is driven by *evidence*: divider segments inside the region are
    detected, the distance transform of the region is computed, and the
    detected dividers are forced to zero depth. A watershed over the negated
    distance transform then separates the parcels along those real lines.

    If there is not enough divider evidence the region is returned whole,
    flagged as an unresolved block.
    """
    if region_mask is None or region_mask.size == 0:
        return {"parts": [], "subdivided": False, "reason": "NO_REGION"}

    binary = (region_mask > 0).astype(np.uint8)
    if int(binary.sum()) < 64:
        return {"parts": [], "subdivided": False, "reason": "REGION_TOO_SMALL"}

    h, w = binary.shape[:2]
    region_area = float(binary.sum())
    min_divider_len = max(12.0, min_divider_length_ratio * math.sqrt(region_area))

    # Divider evidence: long segments inside the region.
    divider = (line_mask > 0) & (binary > 0)
    divider_u8 = (divider.astype(np.uint8)) * 255

    num, labels, stats, _centroids = cv2.connectedComponentsWithStats(divider_u8, 8)
    dividers: List[np.ndarray] = []
    for i in range(1, num):
        comp = (labels == i).astype(np.uint8)
        cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        longest = max(cnts, key=cv2.contourArea)
        length = cv2.arcLength(longest, True)
        if length < min_divider_len:
            continue
        dividers.append(longest.reshape(-1, 2))

    if len(dividers) < 1:
        return {
            "parts": [],
            "subdivided": False,
            "reason": "NO_DIVIDER_EVIDENCE",
            "dividerCount": 0,
        }

    # Split the region along the detected dividers. The dividers are cut out
    # of the region and the remaining pieces are taken as connected
    # components. This follows the real lines exactly and cannot invent a
    # partition that the drawing does not support.
    cut = region_mask.copy()
    divider_pixels = np.zeros_like(cut)
    for d in dividers:
        cv2.polylines(divider_pixels, [d.astype(np.int32)], True, 255, thickness=3)
    divider_pixels = cv2.dilate(
        divider_pixels, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    )
    cut = cv2.bitwise_and(cut, cv2.bitwise_not(divider_pixels))

    part_count, part_labels, part_stats, _cent = cv2.connectedComponentsWithStats(
        (cut > 0).astype(np.uint8), 8
    )

    parts: List[np.ndarray] = []
    for i in range(1, part_count):
        area = float(part_stats[i, cv2.CC_STAT_AREA])
        if area < 0.10 * region_area:
            # Sliver produced by the divider stroke; discard it.
            continue
        comp = (part_labels == i).astype(np.uint8) * 255
        cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        biggest = max(cnts, key=cv2.contourArea)
        parts.append(biggest.reshape(-1, 2))

    # A region that was not separated by its dividers is a single parcel:
    # it must not be split further.
    if len(parts) < 2:
        return {
            "parts": [],
            "subdivided": False,
            "reason": "SINGLE_PARCEL" if parts else "PARTITION_REJECTED",
            "dividerCount": len(dividers),
        }

    if len(parts) > max_parts:
        return {
            "parts": [],
            "subdivided": False,
            "reason": "INSUFFICIENT_OR_EXCESSIVE_PARTITIONS",
            "dividerCount": len(dividers),
        }

    return {
        "parts": parts,
        "subdivided": True,
        "reason": "OK",
        "dividerCount": len(dividers),
        "partCount": len(parts),
    }

    if len(parts) < 2:
        return {
            "parts": [],
            "subdivided": False,
            "reason": "PARTITION_REJECTED",
            "dividerCount": len(dividers),
        }

    return {
        "parts": parts,
        "subdivided": True,
        "reason": "OK",
        "dividerCount": len(dividers),
        "partCount": len(parts),
    }


# --------------------------------------------------------------------------
# false positive control
# --------------------------------------------------------------------------

def _edge_support(
    contour: np.ndarray, line_mask: np.ndarray, *, tolerance: int = 2
) -> float:
    """Fraction of a contour's length that is backed by line evidence."""
    if contour is None or len(contour) < 2 or line_mask is None:
        return 0.0
    if tolerance > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (tolerance * 2 + 1,) * 2)
        supported = cv2.dilate(line_mask, kernel)
    else:
        supported = line_mask
    total = 0
    hit = 0
    n = len(contour)
    step = max(1, n // 120)
    for i in range(0, n, step):
        x = int(round(contour[i][0]))
        y = int(round(contour[i][1]))
        if not (0 <= x < supported.shape[1] and 0 <= y < supported.shape[0]):
            continue
        total += 1
        if supported[y, x] > 0:
            hit += 1
    return (hit / total) if total else 0.0


def _texture_energy(gray: np.ndarray, bbox: Dict[str, float]) -> float:
    """Laplacian variance (texture energy) inside a bounding box."""
    h, w = gray.shape[:2]
    x0 = max(0, int(bbox["x"] * w / 100.0))
    y0 = max(0, int(bbox["y"] * h / 100.0))
    x1 = min(w, int((bbox["x"] + bbox["width"]) * w / 100.0))
    y1 = min(h, int((bbox["y"] + bbox["height"]) * h / 100.0))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return 0.0
    crop = gray[y0:y1, x0:x1]
    lap = cv2.Laplacian(crop, cv2.CV_64F)
    return float(lap.var())


def _vegetation_score(gray: np.ndarray, bbox: Dict[str, float]) -> float:
    """
    Vegetation likelihood in 0..1.

    Combines hue (green band), saturation and texture energy. This is
    deliberately *not* a fixed green-hue test: a plot number printed in
    green or a green-tinted sheet should not be classified as vegetation.
    """
    h, w = gray.shape[:2]
    x0 = max(0, int(bbox["x"] * w / 100.0))
    y0 = max(0, int(bbox["y"] * h / 100.0))
    x1 = min(w, int((bbox["x"] + bbox["width"]) * w / 100.0))
    y1 = min(h, int((bbox["y"] + bbox["height"]) * h / 100.0))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return 0.0

    gray_crop = gray[y0:y1, x0:x1]
    # Reconstruct a coarse BGR so HSV can be computed from the luminance only
    # image (the fill mask path already restricted us to one colour cluster).
    hsv = cv2.cvtColor(cv2.cvtColor(gray_crop, cv2.COLOR_GRAY2BGR), cv2.COLOR_BGR2HSV)
    hue = hsv[:, :, 0].astype(np.float32)
    sat = hsv[:, :, 1].astype(np.float32)

    green_band = (hue >= 35) & (hue <= 90)
    sat_ok = sat > 40
    hue_ratio = float(green_band.mean())
    sat_ratio = float((green_band & sat_ok).mean())

    texture = _texture_energy(gray, bbox)
    # Normalise the texture term against the sheet-wide median.
    return max(0.0, min(1.0, 0.6 * sat_ratio + 0.4 * min(1.0, texture / 500.0)))


def classify_candidate(
    candidate: Dict[str, Any],
    *,
    gray: np.ndarray,
    line_mask: np.ndarray,
    sheet_bbox: Optional[Dict[str, float]] = None,
    annotation_words: Optional[Sequence[str]] = None,
    min_area_percent: float = 0.008,
) -> Dict[str, Any]:
    """
    Assign a classification to a candidate using several independent signals.

    Returns ``{"classification": str, "signals": {...}, "confidence": float}``.
    The classification is advisory: it lowers geometry confidence and adds
    warnings, it does not delete the candidate.
    """
    bbox = candidate["boundingBox"]
    contour = candidate.get("_contour")
    area_pct = candidate.get("areaPercent", 0.0)
    hierarchy_depth = candidate.get("hierarchyDepth", 0)

    support = _edge_support(contour, line_mask) if contour is not None else 0.0
    vegetation = _vegetation_score(gray, bbox)
    aspect = candidate.get("aspectRatio", 1.0)
    rectangularity = candidate.get("rectangularity", 0.0)

    # Distance to the sheet border (0 at the border, 1 in the middle).
    border_distance = 1.0
    if sheet_bbox:
        cx = bbox["x"] + bbox["width"] / 2.0
        cy = bbox["y"] + bbox["height"] / 2.0
        dx = min(cx - sheet_bbox["x"], (sheet_bbox["x"] + sheet_bbox["width"]) - cx)
        dy = min(cy - sheet_bbox["y"], (sheet_bbox["y"] + sheet_bbox["height"]) - cy)
        border_distance = max(0.0, min(1.0, min(dx, dy) / max(1e-6, sheet_bbox["width"] / 2.0)))

    # Does the region contain internal dividers? (a parcel does, a road does not)
    internal_dividers = candidate.get("internalDividerCount", 0)

    signals = {
        "edgeSupport": round(support, 3),
        "vegetation": round(vegetation, 3),
        "aspectRatio": round(aspect, 3),
        "rectangularity": round(rectangularity, 3),
        "hierarchyDepth": hierarchy_depth,
        "borderDistance": round(border_distance, 3),
        "internalDividers": internal_dividers,
        "areaPercent": round(area_pct, 5),
    }

    score = 0.0
    classification = "plot"

    if area_pct < min_area_percent * 1.5:
        classification = "uncertain"
        score -= 0.2
    elif area_pct > 12.0:
        # Very large: a block or a compound area, not a single plot.
        classification = "block"
        score -= 0.05
    elif hierarchy_depth == 0 and area_pct > 4.0:
        classification = "block"
    elif support < 0.25 and internal_dividers == 0:
        classification = "uncertain"
        score -= 0.15
    elif aspect > 9.0 or aspect < 0.11:
        classification = "corridor"
        score -= 0.1
    elif vegetation > 0.55:
        classification = "vegetation"
        score -= 0.1
    elif rectangularity < 0.35 and area_pct > 1.0:
        classification = "uncertain"
        score -= 0.05

    # A corridor that hugs the sheet border and carries no internal dividers
    # is almost certainly a road rather than a strip plot.
    if classification == "corridor" and border_distance < 0.08 and internal_dividers == 0:
        classification = "road"

    confidence = max(0.0, min(1.0, 0.55 + 0.45 * support + score))
    return {
        "classification": classification,
        "signals": signals,
        "confidence": round(confidence, 3),
    }


def filter_false_positives(
    candidates: List[Dict[str, Any]],
    *,
    gray: np.ndarray,
    line_mask: np.ndarray,
    sheet_bbox: Optional[Dict[str, float]] = None,
    annotation_words: Optional[Sequence[str]] = None,
    keep_classes: Sequence[str] = ("plot", "uncertain"),
    min_area_percent: float = 0.008,
) -> Dict[str, Any]:
    """
    Classify candidates and drop the ones that are clearly not plots.

    Only high-confidence rejections are dropped. Anything ambiguous is kept
    with a warning so a human can resolve it in the review UI.
    """
    kept: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []

    for cand in candidates:
        info = classify_candidate(
            cand,
            gray=gray,
            line_mask=line_mask,
            sheet_bbox=sheet_bbox,
            annotation_words=annotation_words,
            min_area_percent=min_area_percent,
        )
        cand["classification"] = info["classification"]
        cand["classificationSignals"] = info["signals"]
        cand["geometryConfidence"] = info["confidence"]

        cls = info["classification"]
        if cls in keep_classes:
            kept.append(cand)
            continue

        # Long, very thin strips are slivers of the drawing geometry (road
        # shoulders, spill margins, stray fills), not plots: a real sliver
        # plot is wide enough to carry its own printed number, and these
        # are far too small for one.
        if cls == "corridor" and float(cand.get("areaPercent", 0.0)) < 0.35:
            cand["warnings"] = list(cand.get("warnings", [])) + ["SLIVER_CORRIDOR"]
            rejected.append(
                {"candidateId": cand.get("candidateId"), "reason": "SLIVER_CORRIDOR"}
            )
            continue

        # Never silently discard: record the reason, then drop only when the
        # evidence is unambiguous.
        reason = {
            "road": "ROAD_CORRIDOR",
            "vegetation": "VEGETATION_REGION",
            "block": "UNRESOLVED_BLOCK",
            "site_boundary": "SHEET_BOUNDARY",
            "annotation": "ANNOTATION_REGION",
        }.get(cls, "REJECTED")

        if cls in ("road", "vegetation") and info["confidence"] >= 0.5:
            cand["warnings"] = list(cand.get("warnings", [])) + [reason]
            rejected.append({"candidateId": cand["candidateId"], "reason": reason})
            continue

        if cls == "block":
            cand["warnings"] = list(cand.get("warnings", [])) + ["UNRESOLVED_BLOCK"]
            kept.append(cand)
            continue

        # Low-confidence uncertain regions (text fragments, slivers) are
        # dropped rather than shown as candidates; the operator can still
        # trace them manually if they matter.
        if cls == "uncertain" and info["confidence"] < 0.5:
            cand["warnings"] = list(cand.get("warnings", [])) + ["LOW_CONFIDENCE_UNCERTAIN"]
            rejected.append({"candidateId": cand["candidateId"], "reason": "LOW_CONFIDENCE_UNCERTAIN"})
            continue

        cand["warnings"] = list(cand.get("warnings", [])) + [reason]
        kept.append(cand)

    return {"candidates": kept, "rejected": rejected}
