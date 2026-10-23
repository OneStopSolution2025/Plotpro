"""
skew.py — robust orientation estimation and explicit deskew transforms.

Design notes
------------
The previous implementation used a 36-bin Hough histogram over *all* angles
and returned the single most populated bin. On the reference site plan that
produced ``80°`` for a plan that is tilted roughly a dozen degrees, because:

* short text strokes were counted equally with long parcel boundaries;
* the background drawing grid (axis aligned) competed with the rotated
  parcel layout;
* nothing enforced that drawing lines come in perpendicular pairs.

This module therefore:

1. uses only *long* segments (short strokes are discarded);
2. weights each segment by its length;
3. clusters angles with circular statistics (no wrap-around artefact);
4. treats a perpendicular partner group as *supporting evidence* — it
   boosts a candidate angle but is never a hard requirement;
5. refuses to estimate an angle when the evidence is weak or the histogram
   is a broad smear rather than a peak.

Two estimators are provided:

``estimate_skew_from_lines``
    Line/edge based. General purpose fallback.

``estimate_skew_from_regions``
    Blob-orientation based. Preferred for site plans: it measures the
    orientation of the filled parcel shapes, which is immune to the
    background sheet grid, to text and to road centrelines.

All transforms are explicit. ``deskew`` returns the rotation matrix *and*
its inverse so pixel coordinates can always be mapped back to the original
image without guesswork.
"""

import math
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

# Minimum segment length (as a fraction of the longer image side) that may
# contribute to the angle estimate.
MIN_SEGMENT_RATIO = 0.045

# Absolute minimum segment length in pixels (for small images).
MIN_SEGMENT_PX = 18

# Confidence below this means "do not trust the estimate".
MIN_CONFIDENCE = 0.28

# An angle below this is treated as already axis aligned.
MIN_MEANINGFUL_ANGLE = 0.75


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _segment_angle(x1: float, y1: float, x2: float, y2: float) -> float:
    """Orientation of a segment in degrees, folded into [0, 180)."""
    deg = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180.0
    return deg


def _circular_mean(angles: List[float], weights: List[float]) -> Optional[float]:
    """
    Weighted circular mean of angles (degrees), in (-180, 180].

    Note the result is *not* folded into [0, 180): the callers work with
    angles that have already been folded onto the canonical drawing axis in
    (-45, 45], and re-mapping the mean into [0, 180) would turn a -7 degree
    correction into 173 degrees.
    """
    if not angles:
        return None
    rad = [math.radians(a) for a in angles]
    sin_sum = sum(w * math.sin(r) for r, w in zip(rad, weights))
    cos_sum = sum(w * math.cos(r) for r, w in zip(rad, weights))
    if abs(sin_sum) < 1e-12 and abs(cos_sum) < 1e-12:
        return None
    return math.degrees(math.atan2(sin_sum, cos_sum))


def _angle_delta(a: float, b: float) -> float:
    """Smallest absolute difference between two angles in [0, 180)."""
    d = abs(a - b) % 180.0
    return min(d, 180.0 - d)


def fold_to_grid(angle_deg: float) -> float:
    """
    Fold an orientation onto the canonical drawing axis in (-45, 45].

    A drawing contains two perpendicular line families. Folding collapses
    both onto a single axis, so a plan whose lines run at 78 degrees and
    168 degrees is reported as -12 degrees — the angle that actually has to
    be corrected.

    This is what fixes the original failure mode: an axis-aligned plan has
    equally strong horizontal and vertical families, so a plain "most
    frequent angle" search picks whichever bin happened to be populated
    first and reports ~90 degrees for a plan that needs no rotation at all.
    """
    a = angle_deg % 180.0
    if a > 90.0:
        a -= 180.0
    # a is now in (-90, 90]
    if a > 45.0:
        a -= 90.0
    elif a <= -45.0:
        a += 90.0
    return a


def _weighted_histogram(
    angles: List[float], weights: List[float], bins: int = 180
) -> Tuple[np.ndarray, np.ndarray]:
    """Weighted histogram over [0, 180) with wrap-around smoothing."""
    hist, edges = np.histogram(
        angles, bins=bins, range=(0.0, 180.0), weights=weights
    )
    # Circular smoothing so peaks straddling the 0/180 seam are not split.
    kernel = np.array([0.5, 1.0, 2.0, 3.0, 2.0, 1.0, 0.5])
    kernel = kernel / kernel.sum()
    padded = np.concatenate([hist[-3:], hist, hist[:3]])
    smoothed = np.convolve(padded, kernel, mode="same")[3:-3]
    return smoothed, edges


def _cluster_folded_angles(
    folded: List[float], weights: List[float]
) -> Tuple[Optional[float], float, float]:
    """
    Cluster folded orientations and return ``(angle, concentration, spread)``.

    The dominant cluster is found with a weighted 1-degree histogram; the
    reported angle is the weighted circular mean of that cluster, so a
    cluster straddling the +/-45 seam does not bias the result.
    """
    if not folded:
        return (None, 0.0, 0.0)

    total = float(sum(weights))
    if total <= 0:
        return (None, 0.0, 0.0)

    # Histogram over (-50, 50) in 1 degree bins.
    edges = np.arange(-50.0, 51.0, 1.0)
    hist, _ = np.histogram(folded, bins=edges, weights=weights)

    # Smooth slightly to tolerate a few degrees of measurement noise.
    kernel = np.array([0.5, 1.0, 2.0, 2.0, 1.0, 0.5])
    kernel = kernel / kernel.sum()
    smoothed = np.convolve(hist, kernel, mode="same")

    peak_idx = int(np.argmax(smoothed))
    peak_centre = float((edges[peak_idx] + edges[peak_idx + 1]) / 2.0)

    near_angles, near_weights = [], []
    for a, w in zip(folded, weights):
        if abs(a - peak_centre) <= 5.0:
            near_angles.append(a)
            near_weights.append(w)

    concentration = (sum(near_weights) / total) if total else 0.0
    refined = _circular_mean(near_angles, near_weights)
    if refined is None:
        refined = peak_centre

    spread = 0.0
    if near_weights:
        spread = math.sqrt(
            sum(w * (a - refined) ** 2 for a, w in zip(near_angles, near_weights))
            / sum(near_weights)
        )

    return (refined, concentration, spread)


# --------------------------------------------------------------------------
# public estimators
# --------------------------------------------------------------------------

def collect_segments(
    gray: np.ndarray,
    *,
    max_dim: int = 1400,
) -> List[Dict[str, Any]]:
    """
    Extract candidate line segments from a grayscale image.

    Uses both the Line Segment Detector and a probabilistic Hough transform,
    then keeps the longer of the two contributions. Each segment carries its
    endpoints, length and orientation so downstream code can fuse them.
    """
    h, w = gray.shape[:2]
    scale = 1.0
    work = gray
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        work = cv2.resize(
            gray,
            (int(w * scale), int(h * scale)),
            interpolation=cv2.INTER_AREA,
        )

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(work)
    blurred = cv2.bilateralFilter(clahe, d=7, sigmaColor=50, sigmaSpace=50)
    edges = cv2.Canny(blurred, 40, 140)

    segments: List[Dict[str, Any]] = []
    seen_keys = set()

    def _add(p1, p2, source):
        x1, y1 = float(p1[0]), float(p1[1])
        x2, y2 = float(p2[0]), float(p2[1])
        length = math.hypot(x2 - x1, y2 - y1)
        if length < MIN_SEGMENT_PX:
            return
        angle = _segment_angle(x1, y1, x2, y2)
        # Quantise the key so near-duplicate segments are not double counted.
        key = (
            source,
            round(x1 / 6.0),
            round(y1 / 6.0),
            round(x2 / 6.0),
            round(y2 / 6.0),
        )
        if key in seen_keys:
            return
        seen_keys.add(key)
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
        lines = lsd.detect(edges)[0]
        if lines is not None:
            for line in lines:
                lx1, ly1, lx2, ly2 = line[0]
                _add((lx1, ly1), (lx2, ly2), "lsd")
    except Exception:
        # LSD is unavailable in some OpenCV builds; Hough still works.
        pass

    hough = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 1800.0,
        threshold=int(max(40, 0.02 * max(work.shape[:2]))),
        minLineLength=int(max(MIN_SEGMENT_PX, MIN_SEGMENT_RATIO * max(work.shape[:2]))),
        maxLineGap=int(max(4, 0.01 * max(work.shape[:2]))),
    )
    if hough is not None:
        # OpenCV returns (N, 1, 4); some builds return (N, 4).
        flat = hough.reshape(-1, 4)
        for line in flat:
            _add((line[0], line[1]), (line[2], line[3]), "hough")

    return segments


def estimate_skew_from_lines(
    gray: np.ndarray,
    *,
    min_confidence: float = MIN_CONFIDENCE,
) -> Dict[str, Any]:
    """
    Estimate the dominant drawing orientation from line segments.

    The returned angle is the tilt of the drawing relative to the image
    axes; a value of ``0`` means "already axis aligned". A positive angle
    means the drawing is rotated counter-clockwise on screen.
    """
    segments = collect_segments(gray)
    h, w = gray.shape[:2]
    min_len = max(MIN_SEGMENT_PX, MIN_SEGMENT_RATIO * max(h, w))

    usable = [s for s in segments if s["length"] >= min_len]
    total_weight = sum(s["length"] for s in usable)
    if not usable or total_weight <= 0:
        return {
            "angle": 0.0,
            "confidence": 0.0,
            "method": "lines",
            "reason": "INSUFFICIENT_EVIDENCE",
            "segmentCount": len(segments),
        }

    # Fold every segment onto the canonical drawing axis so the two
    # perpendicular families reinforce each other instead of competing.
    folded = [fold_to_grid(s["angle"]) for s in usable]
    weights = [s["length"] for s in usable]

    refined, concentration, spread = _cluster_folded_angles(folded, weights)

    if refined is None:
        return {
            "angle": 0.0,
            "confidence": 0.0,
            "method": "lines",
            "reason": "INSUFFICIENT_EVIDENCE",
            "segmentCount": len(segments),
        }

    confidence = min(1.0, concentration)
    reason = "OK"
    if confidence < min_confidence:
        reason = "LOW_CONFIDENCE"
    elif spread > 4.0:
        reason = "DIFFUSE_ORIENTATION"
    elif abs(refined) < MIN_MEANINGFUL_ANGLE:
        reason = "ALREADY_ALIGNED"
    elif abs(abs(refined) - 45.0) < 2.0:
        # A drawing at 45 degrees is ambiguous with the folded axis.
        reason = "AMBIGUOUS_ORIENTATION"

    return {
        "angle": round(refined, 3),
        "confidence": round(confidence, 3),
        "method": "lines",
        "reason": reason,
        "concentration": round(concentration, 3),
        "spread": round(spread, 3),
        "segmentCount": len(segments),
        "usableSegmentCount": len(usable),
    }


def estimate_skew_from_regions(
    mask: np.ndarray,
    *,
    min_area_px: int = 400,
    min_confidence: float = MIN_CONFIDENCE,
) -> Dict[str, Any]:
    """
    Estimate the parcel-grid orientation from filled region blobs.

    Each connected blob is fitted with ``cv2.minAreaRect``; the fitted
    rectangle's own orientation is the parcel orientation. This is immune to
    the background sheet grid, text and road centrelines, which is exactly
    what we want for a site plan.
    """
    binary = (mask > 0).astype(np.uint8) * 255
    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(binary, 8)

    angles: List[float] = []
    weights: List[float] = []
    for i in range(1, count):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < min_area_px:
            continue
        comp = (labels == i).astype(np.uint8)
        cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        biggest = max(cnts, key=cv2.contourArea)
        (_cx, _cy), (rw, rh), rect_angle = cv2.minAreaRect(biggest)
        if rw < 1 or rh < 1:
            continue
        # minAreaRect describes the box rotated by `rect_angle`; the side of
        # length rw lies along that direction. Use the *longer* side and fold
        # it onto the canonical axis.
        long_side_angle = rect_angle if rw >= rh else rect_angle + 90.0
        angles.append(fold_to_grid(long_side_angle))
        weights.append(float(area))

    if not angles:
        return {
            "angle": 0.0,
            "confidence": 0.0,
            "method": "regions",
            "reason": "NO_REGIONS",
            "regionCount": 0,
        }

    refined, concentration, spread = _cluster_folded_angles(angles, weights)

    if refined is None:
        return {
            "angle": 0.0,
            "confidence": 0.0,
            "method": "regions",
            "reason": "INSUFFICIENT_EVIDENCE",
            "regionCount": len(angles),
        }

    confidence = min(1.0, concentration)
    reason = "OK"
    if confidence < min_confidence:
        reason = "LOW_CONFIDENCE"
    elif abs(refined) < MIN_MEANINGFUL_ANGLE:
        reason = "ALREADY_ALIGNED"
    elif abs(abs(refined) - 45.0) < 2.0:
        reason = "AMBIGUOUS_ORIENTATION"

    return {
        "angle": round(refined, 3),
        "confidence": round(confidence, 3),
        "method": "regions",
        "reason": reason,
        "concentration": round(concentration, 3),
        "spread": round(spread, 3),
        "regionCount": len(angles),
    }


# --------------------------------------------------------------------------
# transforms
# --------------------------------------------------------------------------

def deskew(
    image: np.ndarray, angle_deg: float
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Rotate an image by ``angle_deg`` around its centre.

    Returns ``(rotated, M, M_inv)`` where ``M`` maps original pixel
    coordinates into the rotated canvas and ``M_inv`` maps them back.
    Callers must use ``M_inv`` to translate detected geometry back into the
    original image frame before normalising to 0..100.
    """
    h, w = image.shape[:2]
    center = (w / 2.0, h / 2.0)
    M = cv2.getRotationMatrix2D(center, angle_deg, 1.0)

    cos = abs(M[0, 0])
    sin = abs(M[0, 1])
    new_w = int(h * sin + w * cos)
    new_h = int(h * cos + w * sin)

    M[0, 2] += new_w / 2.0 - center[0]
    M[1, 2] += new_h / 2.0 - center[1]

    border = (255, 255, 255) if image.ndim == 3 else 255
    rotated = cv2.warpAffine(
        image,
        M,
        (new_w, new_h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=border,
    )

    M_inv = cv2.invertAffineTransform(M)
    return rotated, M, M_inv


def apply_affine(points: List[Dict[str, float]], M: np.ndarray) -> List[Dict[str, float]]:
    """Map a list of ``{"x","y"}`` points through a 2x3 affine matrix."""
    out: List[Dict[str, float]] = []
    for p in points:
        x = float(p.get("x", 0.0))
        y = float(p.get("y", 0.0))
        nx = M[0, 0] * x + M[0, 1] * y + M[0, 2]
        ny = M[1, 0] * x + M[1, 1] * y + M[1, 2]
        out.append({"x": nx, "y": ny})
    return out


def estimate_perspective(image: np.ndarray) -> Dict[str, Any]:
    """
    Detect whether the source looks like a perspective-distorted photograph.

    A site plan exported from CAD has a single dominant quadrilateral whose
    corners form an axis-aligned rectangle. When the largest quadrilateral is
    markedly non-rectangular the source is a photo taken at an angle.
    """
    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 50, 150)
    cnts, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    best = None
    best_area = 0.0
    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if area < 0.25 * h * w:
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) != 4:
            continue
        if area > best_area:
            best_area = area
            best = approx.reshape(4, 2).astype(np.float32)

    if best is None:
        return {"detected": False, "reason": "NO_QUADRILATERAL", "skewRequired": 0.0}

    # Corner angles: a rectangle has all four near 90 degrees.
    angles = []
    for i in range(4):
        a = best[(i - 1) % 4]
        b = best[i]
        c = best[(i + 1) % 4]
        v1 = a - b
        v2 = c - b
        n1 = np.linalg.norm(v1)
        n2 = np.linalg.norm(v2)
        if n1 < 1e-6 or n2 < 1e-6:
            continue
        cosang = float(np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0))
        angles.append(math.degrees(math.acos(cosang)))

    deviation = 0.0
    if len(angles) == 4:
        deviation = max(abs(a - 90.0) for a in angles)

    detected = deviation > 6.0
    return {
        "detected": detected,
        "reason": "NON_RECTANGULAR_QUADRILATERAL" if detected else "RECTANGULAR",
        "maxCornerDeviationDeg": round(deviation, 2),
        "corners": best.tolist() if detected else None,
    }
