"""
polygons.py — conditional regularisation, validation and shared-edge alignment.

Regularisation policy
---------------------
A minimum-area rectangle is *an approximation* of a parcel. Forcing every
candidate into four vertices silently distorts irregular plots, removes
notches and shifts genuine corners. The previous implementation produced
8-12 vertex polygons from rounded-rectangle plots and, separately, a
`minAreaRect` path that was never validated against the original contour.

This module therefore:

1. always keeps the original contour;
2. simplifies it conservatively with an adaptive epsilon;
3. generates a quadrilateral fit **only** as a proposal;
4. validates the proposal against the original contour using area ratio,
   mean boundary distance, corner displacement and IoU;
5. falls back to the simplified polygon whenever the fit is not faithful.

Validation is explicit and returns machine-readable problem codes so the
frontend can explain a candidate instead of silently dropping it.
"""

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from .geometry import (
    bboxes_disjoint,
    bbox_of_points,
    dedupe_points,
    polygon_area,
    polygon_centroid,
    polygon_iou,
    validate_polygon,
)


# --------------------------------------------------------------------------
# simplification
# --------------------------------------------------------------------------

def simplify_conservative(
    contour: np.ndarray,
    *,
    max_vertices: int = 12,
    epsilon_ratio: float = 0.012,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Simplify a contour with the largest epsilon that still respects
    ``max_vertices``.

    Growing epsilon from small to large and stopping at the first value
    that satisfies the vertex budget keeps the shape faithful; a single
    fixed epsilon either leaves 40 vertices or destroys the outline.
    """
    contour = np.asarray(contour, dtype=np.float32).reshape(-1, 2)
    if contour.shape[0] < 3:
        return contour, {"method": "unchanged", "epsilon": 0.0}

    peri = cv2_arc_length(contour)
    chosen = contour
    used_eps = 0.0
    method = "unchanged"

    for step in range(1, 13):
        eps = epsilon_ratio * peri * (step / 4.0)
        approx = cv2_approx_poly_dp(contour, eps)
        if len(approx) <= max_vertices:
            chosen = approx
            used_eps = eps
            method = "approxPolyDP"
            if len(approx) <= 4:
                break

    if len(chosen) == contour.shape[0]:
        method = "unchanged"

    return chosen, {
        "method": method,
        "epsilon": round(float(used_eps), 3),
        "vertexCount": int(len(chosen)),
        "originalVertexCount": int(contour.shape[0]),
    }


def cv2_arc_length(contour: np.ndarray) -> float:
    """Perimeter of an (N, 2) float contour."""
    import cv2

    return float(cv2.arcLength(np.asarray(contour, dtype=np.float32).reshape(-1, 1, 2), True))


def cv2_approx_poly_dp(contour: np.ndarray, epsilon: float) -> np.ndarray:
    """cv2.approxPolyDP wrapper that always returns an (N, 2) float array."""
    import cv2

    out = cv2.approxPolyDP(np.asarray(contour, dtype=np.float32).reshape(-1, 1, 2), epsilon, True)
    return np.asarray(out, dtype=np.float32).reshape(-1, 2)


def cv2_min_area_rect(contour: np.ndarray) -> np.ndarray:
    """cv2.minAreaRect wrapper returning four ordered corner points."""
    import cv2

    box = cv2.minAreaRect(np.asarray(contour, dtype=np.float32).reshape(-1, 1, 2))
    return np.asarray(cv2.boxPoints(box), dtype=np.float32).reshape(-1, 2)


def order_quad(points: np.ndarray) -> np.ndarray:
    """Order four points counter-clockwise starting from the top-left."""
    pts = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    centre = pts.mean(axis=0)
    angles = np.arctan2(pts[:, 1] - centre[1], pts[:, 0] - centre[0])
    idx = np.argsort(angles)
    pts = pts[idx]
    start = int(np.argmin(pts[:, 0] + pts[:, 1]))
    return np.roll(pts, -start, axis=0)


# --------------------------------------------------------------------------
# fit validation
# --------------------------------------------------------------------------

def _mean_boundary_distance(a: np.ndarray, b: np.ndarray) -> float:
    """Mean distance from points of ``a`` to the nearest point of ``b``."""
    if len(a) == 0 or len(b) == 0:
        return float("inf")
    # Sample both outlines so the metric is O(n*m) but with small n.
    a_pts = a if len(a) <= 64 else a[np.linspace(0, len(a) - 1, 64).astype(int)]
    b_pts = b if len(b) <= 64 else b[np.linspace(0, len(b) - 1, 64).astype(int)]
    diff = a_pts[:, None, :] - b_pts[None, :, :]
    d = np.sqrt((diff ** 2).sum(axis=2)).min(axis=1)
    return float(d.mean())


def evaluate_quad_fit(
    original: np.ndarray, quad: np.ndarray, *, area_tolerance: float = 0.08
) -> Dict[str, Any]:
    """
    Compare a proposed quadrilateral against the original contour.

    A fit is only acceptable when it stays close to the real outline:
    the area must not change by more than ``area_tolerance`` (relative),
    the mean boundary distance must be small relative to the shape size, and
    the IoU with the original must stay high.
    """
    orig_area = polygon_area([{"x": float(p[0]), "y": float(p[1])} for p in original])
    quad_area = polygon_area([{"x": float(p[0]), "y": float(p[1])} for p in quad])

    if orig_area <= 1e-9:
        return {
            "accepted": False,
            "reason": "ZERO_ORIGINAL_AREA",
            "areaRatio": 0.0,
            "meanBoundaryDistance": float("inf"),
            "iou": 0.0,
        }

    area_ratio = quad_area / orig_area
    mean_dist = _mean_boundary_distance(quad, original)

    # Scale-relative distance: mean distance over the shape's own radius.
    centre = original.mean(axis=0)
    radius = float(np.sqrt(((original - centre) ** 2).sum(axis=1)).mean())
    rel_dist = (mean_dist / radius) if radius > 1e-6 else float("inf")

    iou = polygon_iou(
        [{"x": float(p[0]), "y": float(p[1])} for p in quad],
        [{"x": float(p[0]), "y": float(p[1])} for p in original],
    )

    reasons = []
    if abs(1.0 - area_ratio) > area_tolerance:
        reasons.append("AREA_DIVERGENCE")
    if rel_dist > 0.10:
        reasons.append("BOUNDARY_DRIFT")
    if iou < 0.90:
        reasons.append("LOW_FIT_IOU")

    return {
        "accepted": len(reasons) == 0,
        "reason": ";".join(reasons) if reasons else "OK",
        "areaRatio": round(float(area_ratio), 4),
        "meanBoundaryDistance": round(float(mean_dist), 3),
        "relativeBoundaryDistance": round(float(rel_dist), 4),
        "iou": round(float(iou), 4),
    }


def regularize(
    contour: np.ndarray,
    *,
    max_vertices: int = 12,
    prefer_quad: bool = True,
    area_tolerance: float = 0.08,
) -> Dict[str, Any]:
    """
    Regularise a contour into a candidate polygon.

    Returns the chosen points plus the method used and the validation
    evidence, so the caller can report *why* a candidate looks the way it
    does.
    """
    contour = np.asarray(contour, dtype=np.float32).reshape(-1, 2)
    if contour.shape[0] < 3:
        return {
            "points": None,
            "method": "invalid",
            "metrics": {},
        }

    simplified, simp_info = simplify_conservative(
        contour, max_vertices=max_vertices
    )

    quad_info: Optional[Dict[str, Any]] = None
    chosen = simplified
    method = "conservative_simplify"

    if prefer_quad and len(simplified) >= 4:
        quad = order_quad(cv2_min_area_rect(contour))
        evaluation = evaluate_quad_fit(
            contour, quad, area_tolerance=area_tolerance
        )
        quad_info = evaluation
        if evaluation["accepted"]:
            chosen = quad
            method = "quad_fit"
        else:
            method = "conservative_simplify"

    return {
        "points": chosen,
        "method": method,
        "metrics": {
            "simplify": simp_info,
            "quadFit": quad_info,
            "vertexCount": int(len(chosen)),
        },
    }


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------

def validate_candidate(
    points: Sequence[Any],
    *,
    min_area: float = 0.0,
    require_simple: bool = True,
) -> Tuple[bool, List[str]]:
    """Validate a candidate polygon; returns ``(ok, problem_codes)``."""
    return validate_polygon(
        points, min_area=min_area, require_simple=require_simple
    )


def find_duplicates(
    candidates: Sequence[Dict[str, Any]], *, iou_threshold: float = 0.92
) -> List[Tuple[int, int, float]]:
    """Return pairs of candidates that are geometrically the same polygon."""
    duplicates: List[Tuple[int, int, float]] = []
    for i in range(len(candidates)):
        for j in range(i + 1, len(candidates)):
            iou = polygon_iou(
                candidates[i].get("points", []), candidates[j].get("points", [])
            )
            if iou >= iou_threshold:
                duplicates.append((i, j, round(float(iou), 4)))
    return duplicates


# --------------------------------------------------------------------------
# shared-edge alignment
# --------------------------------------------------------------------------

def _point_to_polygon_distance(x: float, y: float, poly: Sequence[Any]) -> float:
    """Shortest distance from a point to a polygon's outline."""
    pts = [(float(p["x"]), float(p["y"])) for p in poly if isinstance(p, dict)]
    if len(pts) < 2:
        return float("inf")
    best = float("inf")
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        seg_sq = dx * dx + dy * dy
        if seg_sq < 1e-12:
            d = math.hypot(x - x1, y - y1)
        else:
            t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / seg_sq))
            d = math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
        if d < best:
            best = d
    return best


def _project_point_to_polygon(x: float, y: float, poly: Sequence[Any]) -> Optional[Tuple[float, float]]:
    """Project a point onto the closest point of a polygon's outline."""
    pts = [(float(p["x"]), float(p["y"])) for p in poly if isinstance(p, dict)]
    if len(pts) < 2:
        return None
    best = None
    best_d = float("inf")
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        seg_sq = dx * dx + dy * dy
        if seg_sq < 1e-12:
            t = 0.0
        else:
            t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / seg_sq))
        px, py = x1 + t * dx, y1 + t * dy
        d = math.hypot(x - px, y - py)
        if d < best_d:
            best_d = d
            best = (px, py)
    return best


def _shared_edge_fraction(
    a: Sequence[Any], b: Sequence[Any], *, tolerance: float = 1.0
) -> float:
    """Fraction of ``a``'s vertices that lie within ``tolerance`` of ``b``'s outline."""
    if not a:
        return 0.0
    hits = 0
    for p in a:
        if not isinstance(p, dict):
            continue
        if _point_to_polygon_distance(float(p["x"]), float(p["y"]), b) <= tolerance:
            hits += 1
    return hits / float(len(a))


def snap_shared_edges(
    candidates: List[Dict[str, Any]],
    *,
    tolerance_ratio: float = 0.006,
    max_dimension: int = 2500,
    min_shared_fraction: float = 0.34,
) -> Dict[str, Any]:
    """
    Align vertices of genuinely adjacent polygons onto a shared edge.

    Adjacency is *established* before snapping: two polygons are adjacent
    only when a substantial part of each outline lies on the other. The
    tolerance is relative to the image resolution, never a fixed percentage
    of the whole canvas.

    Geometry is validated before and after; a snap that would merge two
    polygons (IoU above the duplicate threshold) is rejected.
    """
    if len(candidates) < 2:
        return {"snapped": 0, "pairs": 0, "rejected": 0}

    tol = max(0.35, tolerance_ratio * 100.0)
    moved = 0
    pairs = 0
    rejected = 0

    # Work on copies so the operation is inspectable.
    for cand in candidates:
        cand["_snapPoints"] = list(cand.get("points", []))

    # Shared edges keep both polygons' bounding boxes within the tolerance
    # distance: a point on the shared outline lies inside both boxes, so a
    # pair whose boxes are separated by more than `tol` cannot share an edge
    # (nor have a vertex project within tol). The comparison is skipped
    # conservatively: touching boxes are never skipped (margin == tol).
    candidate_boxes = [bbox_of_points(cand.get("points", [])) for cand in candidates]

    for i in range(len(candidates)):
        for j in range(len(candidates)):
            if i == j:
                continue
            a = candidates[i].get("points", [])
            b = candidates[j].get("points", [])
            if len(a) < 3 or len(b) < 3:
                continue
            if bboxes_disjoint(candidate_boxes[i], candidate_boxes[j], margin=tol):
                continue

            # Only consider genuinely adjacent pairs.
            frac_ab = _shared_edge_fraction(a, b, tolerance=tol)
            frac_ba = _shared_edge_fraction(b, a, tolerance=tol)
            if frac_ab < min_shared_fraction or frac_ba < min_shared_fraction:
                continue

            # Snap a's vertices that sit on b towards b's outline.
            new_a = []
            changed = False
            for p in a:
                if not isinstance(p, dict):
                    continue
                x, y = float(p["x"]), float(p["y"])
                d = _point_to_polygon_distance(x, y, b)
                if d <= tol:
                    projected = _project_point_to_polygon(x, y, b)
                    if projected is not None:
                        new_a.append({"x": projected[0], "y": projected[1]})
                        changed = True
                        continue
                new_a.append({"x": x, "y": y})
            if not changed:
                continue

            # Guard: snapping must not merge the two polygons.
            if polygon_iou(new_a, b) > 0.92:
                rejected += 1
                continue

            candidates[i]["_snapPoints"] = new_a
            moved += sum(
                1
                for old, new in zip(a, new_a)
                if abs(old["x"] - new["x"]) > 1e-9 or abs(old["y"] - new["y"]) > 1e-9
            )
            pairs += 1

    applied = 0
    for cand in candidates:
        snapped = cand.pop("_snapPoints", None)
        if snapped:
            cand["points"] = snapped
            cand["sharedEdgeSnapped"] = True
            applied += 1

    return {
        "snappedVertices": moved,
        "pairs": pairs,
        "rejected": rejected,
        "tolerance": round(tol, 3),
        "candidatesUpdated": applied,
    }
