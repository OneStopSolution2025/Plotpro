"""
lines.py — line-segment detection and conservative fusion.

Boundary evidence is the backbone of plot recovery: a plot boundary in a
site plan is a *line*, and the fill of a parcel may be absent or ambiguous.

Two detectors are used as complementary sources:

* ``cv2.createLineSegmentDetector`` (LSD) — precise, sub-pixel, good on the
  crisp vector-like strokes of an exported plan;
* ``cv2.HoughLinesP`` — more tolerant of gaps, good on scanned or noisy
  sheets.

Fusion is deliberately conservative. Segments are merged only when they are
*collinear* (small perpendicular offset), *similarly oriented* and *locally
continuous* (nearby endpoints). Two segments that merely happen to share an
angle are never joined, because that would happily bridge a road.
"""

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np


def detect_segments(
    mask: np.ndarray,
    *,
    min_length_ratio: float = 0.012,
    max_dimension: int = 2500,
) -> List[Dict[str, Any]]:
    """
    Detect line segments in a binary boundary mask.

    Each segment records endpoints, length, orientation and the detector that
    produced it, so downstream fusion can weight the sources differently.
    """
    h, w = mask.shape[:2]
    scale = 1.0
    work = mask
    if max(h, w) > max_dimension:
        scale = max_dimension / float(max(h, w))
        work = cv2.resize(mask, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    min_len = max(10.0, min_length_ratio * max(work.shape[:2]))
    segments: List[Dict[str, Any]] = []
    seen = set()

    def _add(p1, p2, source):
        x1, y1 = float(p1[0]), float(p1[1])
        x2, y2 = float(p2[0]), float(p2[1])
        length = math.hypot(x2 - x1, y2 - y1)
        if length < min_len:
            return
        angle = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180.0
        key = (round(x1 / 5.0), round(y1 / 5.0), round(x2 / 5.0), round(y2 / 5.0))
        if key in seen:
            return
        seen.add(key)
        segments.append(
            {
                "x1": x1 / scale,
                "y1": y1 / scale,
                "x2": x2 / scale,
                "y2": y2 / scale,
                "length": length / scale,
                "angle": angle,
                "source": source,
            }
        )

    try:
        lsd = cv2.createLineSegmentDetector()
        lines = lsd.detect(work)[0]
        if lines is not None:
            for line in lines:
                lx1, ly1, lx2, ly2 = line[0]
                _add((lx1, ly1), (lx2, ly2), "lsd")
    except Exception:
        pass

    hough = cv2.HoughLinesP(
        work,
        1,
        np.pi / 1800.0,
        threshold=int(max(30, 0.015 * max(work.shape[:2]))),
        minLineLength=int(min_len),
        maxLineGap=int(max(3, 0.006 * max(work.shape[:2]))),
    )
    if hough is not None:
        # OpenCV returns (N, 1, 4); some builds return (N, 4).
        for line in hough.reshape(-1, 4):
            _add((line[0], line[1]), (line[2], line[3]), "hough")

    return segments


def _segment_distance_to_point(
    seg: Dict[str, Any], px: float, py: float
) -> Tuple[float, float]:
    """Perpendicular distance from a point to a segment, and the projection t."""
    x1, y1 = seg["x1"], seg["y1"]
    x2, y2 = seg["x2"], seg["y2"]
    dx, dy = x2 - x1, y2 - y1
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq < 1e-9:
        return math.hypot(px - x1, py - y1), 0.0
    t = ((px - x1) * dx + (py - y1) * dy) / seg_len_sq
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y), t


def fuse_segments(
    segments: Sequence[Dict[str, Any]],
    *,
    angle_tolerance_deg: float = 4.0,
    distance_tolerance_ratio: float = 0.006,
    max_image_dimension: int = 2500,
    gap_tolerance_ratio: float = 0.012,
) -> Dict[str, Any]:
    """
    Merge collinear, locally continuous segments into longer edges.

    Tolerances are expressed relative to the image size so they behave the
    same on a 900 px preview and a 6000 px scan.

    Returns the fused edges plus diagnostics about how many merges happened.
    """
    if not segments:
        return {"edges": [], "merged": 0, "sourceCount": len(segments)}

    dist_tol = max(2.0, distance_tolerance_ratio * max_image_dimension)
    gap_tol = max(4.0, gap_tolerance_ratio * max_image_dimension)

    edges: List[Dict[str, Any]] = []
    for seg in segments:
        edges.append(
            {
                "x1": seg["x1"],
                "y1": seg["y1"],
                "x2": seg["x2"],
                "y2": seg["y2"],
                "angle": seg["angle"],
                "length": seg["length"],
                "sources": [seg["source"]],
                "support": 1,
            }
        )

    merged = 0
    changed = True
    iterations = 0
    while changed and iterations < 12:
        changed = False
        iterations += 1
        out: List[Dict[str, Any]] = []
        for edge in edges:
            absorbed = False
            for other in out:
                angle_delta = abs((edge["angle"] - other["angle"] + 90.0) % 180.0 - 90.0)
                if angle_delta > angle_tolerance_deg:
                    continue

                # Perpendicular distance between the two *lines* (not the
                # endpoints): two segments can be parallel and close together
                # while their endpoints are far apart, which is exactly the
                # case for two collinear-looking pieces of one long line.
                rad = math.radians(other["angle"])
                ux, uy = math.cos(rad), math.sin(rad)
                perp_distance = abs(
                    uy * (edge["x1"] - other["x1"]) - ux * (edge["y1"] - other["y1"])
                )
                if perp_distance > dist_tol:
                    continue

                # Local continuity: at least one endpoint must be close to the
                # other segment's span (not merely parallel but far away).
                gap = min(
                    math.hypot(edge["x1"] - other["x1"], edge["y1"] - other["y1"]),
                    math.hypot(edge["x1"] - other["x2"], edge["y1"] - other["y2"]),
                    math.hypot(edge["x2"] - other["x1"], edge["y2"] - other["y1"]),
                    math.hypot(edge["x2"] - other["x2"], edge["y2"] - other["y2"]),
                )
                if gap > gap_tol:
                    continue

                pts = [
                    (other["x1"], other["y1"]),
                    (other["x2"], other["y2"]),
                    (edge["x1"], edge["y1"]),
                    (edge["x2"], edge["y2"]),
                ]
                # Order the four points along the dominant direction.
                ang = other["angle"]
                rad = math.radians(ang)
                ux, uy = math.cos(rad), math.sin(rad)
                pts.sort(key=lambda p: p[0] * ux + p[1] * uy)

                new_len = math.hypot(pts[-1][0] - pts[0][0], pts[-1][1] - pts[0][1])
                if new_len < other["length"]:
                    new_len = other["length"]

                other["x1"], other["y1"] = pts[0]
                other["x2"], other["y2"] = pts[-1]
                other["length"] = new_len
                other["angle"] = math.degrees(math.atan2(pts[-1][1] - pts[0][1], pts[-1][0] - pts[0][0])) % 180.0
                other["support"] += edge["support"]
                other["sources"] = sorted(set(other["sources"] + edge["sources"]))
                absorbed = True
                merged += 1
                changed = True
                break
            if not absorbed:
                out.append(edge)
        edges = out

    return {
        "edges": edges,
        "merged": merged,
        "sourceCount": len(segments),
        "angleToleranceDeg": angle_tolerance_deg,
        "distanceTolerancePx": round(dist_tol, 2),
        "gapTolerancePx": round(gap_tol, 2),
    }


def segments_intersecting(
    mask: np.ndarray, segments: Sequence[Dict[str, Any]]
) -> np.ndarray:
    """
    Render the given segments into a binary mask.

    Used to check whether a region's boundary is actually supported by line
    evidence before it is accepted.
    """
    out = np.zeros(mask.shape[:2], np.uint8)
    h, w = mask.shape[:2]
    for seg in segments:
        p1 = (int(round(seg["x1"])), int(round(seg["y1"])))
        p2 = (int(round(seg["x2"])), int(round(seg["y2"])))
        if not (0 <= p1[0] < w and 0 <= p1[1] < h):
            continue
        if not (0 <= p2[0] < w and 0 <= p2[1] < h):
            continue
        cv2.line(out, p1, p2, 255, 1)
    return out
