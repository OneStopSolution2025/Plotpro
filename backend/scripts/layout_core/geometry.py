"""
geometry.py — polygon maths shared by the detection pipeline.

Conventions
-----------
* A "polygon" is a list of ``{"x": float, "y": float}`` dicts in 0..100 space.
* Polygon areas are computed with the shoelace formula on the normalised
  coordinates, so they are expressed in "percent squared" units.
* Every helper is tolerant of malformed input and returns a safe value
  (``0.0``, ``False``, ``None``) rather than raising, because these run
  over hundreds of machine-generated candidates.
"""

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:
    import numpy as _np  # optional — the pure-Python reference path stays available
except ImportError:  # pragma: no cover - minimal environments
    _np = None

Point = Dict[str, float]
Polygon = List[Point]


# --------------------------------------------------------------------------
# Basic helpers
# --------------------------------------------------------------------------

def _as_xy(pt: Any) -> Optional[Tuple[float, float]]:
    """Extract a finite (x, y) pair from a point-like object, else None.

    Accepts a dict with ``x``/``y`` keys or a two element sequence.
    """
    if isinstance(pt, dict):
        try:
            x = float(pt.get("x"))
            y = float(pt.get("y"))
        except (TypeError, ValueError):
            return None
    elif isinstance(pt, (tuple, list)) and len(pt) >= 2:
        try:
            x = float(pt[0])
            y = float(pt[1])
        except (TypeError, ValueError):
            return None
    else:
        return None
    if not (math.isfinite(x) and math.isfinite(y)):
        return None
    return (x, y)


def dedupe_points(points: Sequence[Any], epsilon: float = 1e-6) -> Polygon:
    """Remove consecutive duplicate points (and a duplicated closing point)."""
    out: Polygon = []
    for pt in points:
        xy = _as_xy(pt)
        if xy is None:
            continue
        if out:
            px, py = out[-1]["x"], out[-1]["y"]
            if abs(px - xy[0]) <= epsilon and abs(py - xy[1]) <= epsilon:
                continue
        out.append({"x": xy[0], "y": xy[1]})
    # Drop the closing point if it repeats the first.
    while len(out) >= 2:
        if (
            abs(out[0]["x"] - out[-1]["x"]) <= epsilon
            and abs(out[0]["y"] - out[-1]["y"]) <= epsilon
        ):
            out.pop()
        else:
            break
    return out


def polygon_area(points: Sequence[Any]) -> float:
    """Absolute shoelace area of a polygon."""
    pts = [_as_xy(p) for p in points]
    pts = [p for p in pts if p is not None]
    n = len(pts)
    if n < 3:
        return 0.0
    acc = 0.0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        acc += x1 * y2 - x2 * y1
    return abs(acc) / 2.0


def polygon_centroid(points: Sequence[Any]) -> Tuple[float, float]:
    """Area-weighted centroid; falls back to the vertex mean for degenerate input."""
    pts = [_as_xy(p) for p in points]
    pts = [p for p in pts if p is not None]
    if not pts:
        return (0.0, 0.0)
    n = len(pts)
    if n < 3:
        return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)

    cx = cy = 0.0
    signed = 0.0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        cross = x1 * y2 - x2 * y1
        signed += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(signed) < 1e-12:
        return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)
    signed *= 0.5
    return (cx / (6.0 * signed), cy / (6.0 * signed))


def polygon_is_simple(points: Sequence[Any]) -> bool:
    """True when no two non-adjacent edges of the polygon intersect."""
    pts = [_as_xy(p) for p in points]
    pts = [p for p in pts if p is not None]
    n = len(pts)
    if n < 3:
        return False

    def _orient(a, b, c):
        v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if v > 1e-12:
            return 1
        if v < -1e-12:
            return -1
        return 0

    def _on_seg(a, b, c):
        return (
            min(a[0], b[0]) - 1e-12 <= c[0] <= max(a[0], b[0]) + 1e-12
            and min(a[1], b[1]) - 1e-12 <= c[1] <= max(a[1], b[1]) + 1e-12
        )

    def _seg_intersect(p1, p2, p3, p4):
        o1 = _orient(p1, p2, p3)
        o2 = _orient(p1, p2, p4)
        o3 = _orient(p3, p4, p1)
        o4 = _orient(p3, p4, p2)
        if o1 != o2 and o3 != o4:
            return True
        if o1 == 0 and _on_seg(p1, p2, p3):
            return True
        if o2 == 0 and _on_seg(p1, p2, p4):
            return True
        if o3 == 0 and _on_seg(p3, p4, p1):
            return True
        if o4 == 0 and _on_seg(p3, p4, p2):
            return True
        return False

    for i in range(n):
        a1, a2 = pts[i], pts[(i + 1) % n]
        for j in range(i + 1, n):
            # Skip adjacent edges (they legitimately share a vertex).
            if j == i or (j + 1) % n == i or (i + 1) % n == j:
                continue
            b1, b2 = pts[j], pts[(j + 1) % n]
            if _seg_intersect(a1, a2, b1, b2):
                return False
    return True


def bbox_of_points(points: Sequence[Any]) -> Dict[str, float]:
    """Axis-aligned bounding box in 0..100 space."""
    pts = [_as_xy(p) for p in points]
    pts = [p for p in pts if p is not None]
    if not pts:
        return {"x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0}
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return {
        "x": min(xs),
        "y": min(ys),
        "width": max(xs) - min(xs),
        "height": max(ys) - min(ys),
    }


def normalise_points(points: Sequence[Any], width: float, height: float) -> Polygon:
    """Convert pixel-space points into 0..100 normalised space."""
    if width <= 0 or height <= 0:
        return []
    out: Polygon = []
    for p in points:
        xy = _as_xy(p)
        if xy is None:
            continue
        out.append(
            {
                "x": round((xy[0] / width) * 100.0, 3),
                "y": round((xy[1] / height) * 100.0, 3),
            }
        )
    return out


# --------------------------------------------------------------------------
# Overlap measures
# --------------------------------------------------------------------------

def bbox_iou(b1: Dict[str, float], b2: Dict[str, float]) -> float:
    """Intersection-over-Union of two axis-aligned boxes (0..1)."""
    x1 = max(b1["x"], b2["x"])
    y1 = max(b1["y"], b2["y"])
    x2 = min(b1["x"] + b1["width"], b2["x"] + b2["width"])
    y2 = min(b1["y"] + b1["height"], b2["y"] + b2["height"])
    if x2 <= x1 or y2 <= y1:
        return 0.0
    inter = (x2 - x1) * (y2 - y1)
    a1 = b1["width"] * b1["height"]
    a2 = b2["width"] * b2["height"]
    union = a1 + a2 - inter
    return (inter / union) if union > 0 else 0.0


def _signed_area(points: Sequence[Any]) -> float:
    """Signed shoelace area (positive for one orientation, negative for the other)."""
    pts = [_as_xy(p) for p in points]
    pts = [p for p in pts if p is not None]
    n = len(pts)
    if n < 3:
        return 0.0
    acc = 0.0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        acc += x1 * y2 - x2 * y1
    return acc / 2.0


def _as_ccw(points: Sequence[Any]) -> List[Tuple[float, float]]:
    """
    Return the points in counter-clockwise (positive signed area) order.

    The Sutherland-Hodgman clipping below uses a left-side test, which is
    only valid for a consistent orientation. Contours coming out of OpenCV
    and polygons built by hand do not agree on their winding order, so the
    clip polygon is normalised here. Without this the intersection area is
    meaningless (measured: IoU of 5.3 for two overlapping plots).
    """
    pts = [_as_xy(p) for p in points]
    pts = [p for p in pts if p is not None]
    # Image coordinates have y pointing down, so the sign of the signed area
    # is the opposite of the math convention. A polygon is CCW in math
    # coordinates when its image signed area is *negative*; normalise to
    # that so the left-side inside test below is correct.
    if _signed_area([{"x": p[0], "y": p[1]} for p in pts]) > 0:
        pts = list(reversed(pts))
    return pts


def _rasterise_numpy(poly: List[Point]):
    """
    Rasterise a normalised polygon onto the 128x128 reference grid.

    This mirrors ``_raster`` from ``_polygon_iou_reference`` exactly:
    * grid of 128, scale = (grid-1)/100
    * a row contributes a crossing when ``y1 <= y < y2`` or ``y2 <= y < y1``
      (equivalently: every integer y in ``[min(y1,y2), max(y1,y2))``)
    * the crossing x is ``x1 + (y - y1) * (x2 - x1) / (y2 - y1)`` — evaluated
      in the same multiply-then-divide order with the edge's own orientation,
      so results are bit-identical to the pure-Python version
    * rows are filled on the ``[ceil(x_start), floor(x_end)]`` inclusive span
    * rows outside ``range(grid)`` never contribute, matching the reference
      loop which only visits rows 0..grid-1

    Implementation note: crossings are generated as (row, x) events per edge,
    sorted once by (row, x), then paired consecutive within each row group —
    the same pairing the reference obtains by sorting each row's crossings.
    """
    grid = 128
    scale = (grid - 1) / 100.0
    n = len(poly)
    xs = _np.array([p["x"] * scale for p in poly], dtype=_np.float64)
    ys = _np.array([p["y"] * scale for p in poly], dtype=_np.float64)

    x1 = xs
    y1 = ys
    x2 = _np.roll(xs, -1)
    y2 = _np.roll(ys, -1)
    denom = y2 - y1

    lower = _np.minimum(y1, y2)
    upper = _np.maximum(y1, y2)
    # Integer rows y with lower <= y < upper, clipped to the reference's
    # row domain [0, grid-1].
    row_lo = _np.maximum(0.0, _np.ceil(lower))
    row_hi = _np.minimum(grid - 1.0, _np.ceil(upper) - 1.0)
    counts = _np.floor(row_hi - row_lo + 1.0).astype(_np.int64)
    counts = _np.where((counts > 0) & _np.isfinite(counts), counts, 0)

    keep = counts > 0
    if not _np.any(keep):
        return _np.zeros((grid, grid), dtype=bool)
    c = counts[keep]
    kept_edges = _np.flatnonzero(keep)
    # edge_pos addresses the *compressed* (kept-only) arrays below.
    edge_pos = _np.repeat(_np.arange(c.size), c)
    start_offsets = _np.concatenate(([0], _np.cumsum(c)[:-1]))
    pos_in_edge = _np.arange(edge_pos.size) - start_offsets[edge_pos]

    kept_lo = row_lo[keep]
    rows = kept_lo[edge_pos] + pos_in_edge.astype(_np.float64)

    # Preserve the reference expression order: numerator first, then divide.
    e_x1 = x1[kept_edges][edge_pos]
    e_y1 = y1[kept_edges][edge_pos]
    e_dx = (x2 - x1)[kept_edges][edge_pos]
    e_den = denom[kept_edges][edge_pos]
    t = (rows - e_y1) * e_dx
    cross_x = e_x1 + t / e_den

    order = _np.lexsort((cross_x, rows))
    rows_s = rows[order].astype(_np.int64)
    xs_s = cross_x[order]

    uniq_rows, group_start = _np.unique(rows_s, return_index=True)
    group_size = _np.diff(_np.append(group_start, rows_s.size))
    pos_in_group = _np.arange(rows_s.size) - _np.repeat(group_start, group_size)

    # The reference pairs (0,1), (2,3), ... and, when a row has an odd
    # crossing count, silently drops the final unpaired crossing.
    odd = (group_size % 2) == 1
    drop = _np.zeros(rows_s.size, dtype=bool)
    if _np.any(odd):
        drop[group_start[odd] + group_size[odd] - 1] = True
    valid = ~drop

    is_start = valid & ((pos_in_group % 2) == 0)
    is_end = valid & ((pos_in_group % 2) == 1)

    if not _np.any(is_start):
        return _np.zeros((grid, grid), dtype=bool)

    mask = _np.zeros((grid, grid), dtype=bool)
    fill_rows = rows_s[is_start]
    x_start = _np.maximum(0, _np.ceil(xs_s[is_start]).astype(_np.int64))
    x_end = _np.minimum(grid - 1, _np.floor(xs_s[is_end]).astype(_np.int64))
    fillable = x_start <= x_end
    if not _np.any(fillable):
        return mask
    fill_rows = fill_rows[fillable]
    x_start = x_start[fillable]
    x_end = x_end[fillable]
    for r, s, e in zip(fill_rows, x_start, x_end):
        mask[r, s : e + 1] = True
    return mask


def _polygon_iou_numpy(poly_a: Sequence[Any], poly_b: Sequence[Any]) -> float:
    """NumPy-vectorised rasterisation of the reference IoU (same semantics)."""
    a = dedupe_points(poly_a)
    b = dedupe_points(poly_b)
    if len(a) < 3 or len(b) < 3:
        return 0.0

    ma = _rasterise_numpy(a)
    mb = _rasterise_numpy(b)
    inter = int(_np.logical_and(ma, mb).sum())
    union = int(_np.logical_or(ma, mb).sum())
    return (inter / union) if union > 0 else 0.0


def _polygon_iou_reference(poly_a: Sequence[Any], poly_b: Sequence[Any]) -> float:
    """
    Original pure-Python IoU. Kept untouched as the regression reference;
    the optimised entry point below must agree with this function bit for
    bit on the same rasterisation resolution and fill rules.
    """
    a = dedupe_points(poly_a)
    b = dedupe_points(poly_b)
    if len(a) < 3 or len(b) < 3:
        return 0.0

    grid = 128
    scale = (grid - 1) / 100.0

    def _raster(poly):
        n = len(poly)
        xs = [float(p["x"]) * scale for p in poly]
        ys = [float(p["y"]) * scale for p in poly]
        mask = [bytearray(grid) for _ in range(grid)]
        for y in range(grid):
            crossings = []
            for i in range(n):
                y1, y2 = ys[i], ys[(i + 1) % n]
                x1, x2 = xs[i], xs[(i + 1) % n]
                if (y1 <= y < y2) or (y2 <= y < y1):
                    x = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
                    crossings.append(x)
            crossings.sort()
            for k in range(0, len(crossings) - 1, 2):
                x_start = max(0, int(math.ceil(crossings[k])))
                x_end = min(grid - 1, int(math.floor(crossings[k + 1])))
                if x_start <= x_end:
                    row = mask[y]
                    for x in range(x_start, x_end + 1):
                        row[x] = 1
        return mask

    ma = _raster(a)
    mb = _raster(b)
    inter = 0
    union = 0
    for y in range(grid):
        ra = ma[y]
        rb = mb[y]
        for x in range(grid):
            if ra[x] or rb[x]:
                union += 1
                if ra[x] and rb[x]:
                    inter += 1
    return (inter / union) if union > 0 else 0.0


def polygon_iou(poly_a: Sequence[Any], poly_b: Sequence[Any]) -> float:
    """
    Polygon IoU via rasterisation (dispatches to the optimised implementation).

    Sutherland-Hodgman clipping is numerically fragile when the two polygons
    share edges or vertices (which is exactly the case here: adjacent plots
    share a divider). Rasterising both polygons to a fixed grid and counting
    pixels is O(grid^2) but completely robust for the 4-12 vertex polygons
    we deal with, and it uses only numpy (no OpenCV, so it also works in
    the scorer which runs in a minimal Python environment).

    The rasterisation resolution and fill rules are identical to
    ``_polygon_iou_reference``; that implementation is retained for
    regression testing and as a fallback for numpy-free environments.
    """
    if _np is not None:
        return _polygon_iou_numpy(poly_a, poly_b)
    return _polygon_iou_reference(poly_a, poly_b)


def polygon_containment(inner: Sequence[Any], outer: Sequence[Any]) -> float:
    """
    Fraction of ``inner``'s rasterised area that lies inside ``outer``.

    Unlike IoU, containment stays at 1.0 when a small polygon sits completely
    inside a big one. IoU degenerates to ``inner_area / outer_area`` for that
    pair (0.27 for a plot inside its block), which is why any IoU-based
    containment test never fires. Containment is the right measure for
    "is X inside Y" questions such as container detection.

    Requires numpy (rasterisation); returns 0.0 without it — a conservative
    outcome for the caller, which then keeps the candidate.
    """
    if _np is None:
        return 0.0
    a = dedupe_points(inner)
    b = dedupe_points(outer)
    if len(a) < 3 or len(b) < 3:
        return 0.0
    ma = _rasterise_numpy(a)
    mb = _rasterise_numpy(b)
    # ``inner``'s own raster forms the denominator, so the outer polygon can
    # never inflate it.
    inner_count = int(ma.sum())
    if inner_count == 0:
        return 0.0
    inter = int(_np.logical_and(ma, mb).sum())
    return inter / inner_count


def bboxes_disjoint(
    box_a: Dict[str, float], box_b: Dict[str, float], margin: float = 0.0
) -> bool:
    """
    True when two ``{x, y, width, height}`` boxes are separated by more than
    ``margin`` units. Boxes that only touch at an edge are NOT considered
    disjoint, so this predicate is always a conservative rejection: it may
    keep a comparison that could have been skipped, but it never skips a
    comparison whose result could depend on polygon overlap.

    Guard rails workers must respect:
    * For area-based checks (duplicate / merge / containment thresholds)
      the caller may use ``margin=0``: a positive-area intersection is
      impossible when closed boxes are separated by any gap.
    * For tolerance-based checks (shared-edge snapping) the caller passes
      the comparison tolerance as ``margin``.
    """
    ax1 = box_a.get("x", 0.0)
    ay1 = box_a.get("y", 0.0)
    ax2 = ax1 + box_a.get("width", 0.0)
    ay2 = ay1 + box_a.get("height", 0.0)

    bx1 = box_b.get("x", 0.0)
    by1 = box_b.get("y", 0.0)
    bx2 = bx1 + box_b.get("width", 0.0)
    by2 = by1 + box_b.get("height", 0.0)

    return (
        ax2 < bx1 - margin
        or bx2 < ax1 - margin
        or ay2 < by1 - margin
        or by2 < ay1 - margin
    )


def bbox_containment_ratio(inner: Sequence[Any], outer: Sequence[Any]) -> float:
    """
    Fraction of ``inner``'s bounding box covered by ``outer``'s bounding box.

    Companion to :func:`polygon_containment`: rasterised polygon containment
    fails when a contour is malformed (a self-intersecting ring produced by
    findContours on a frame-shaped enclosure rasterises to almost nothing
    even though its bounding box faithfully represents the block), while a
    bounding-box ratio sees it. The two are meant to be combined by taking
    the maximum.
    """
    bi = bbox_of_points(inner)
    bo = bbox_of_points(outer)
    x1 = max(bi["x"], bo["x"])
    y1 = max(bi["y"], bo["y"])
    x2 = min(bi["x"] + bi["width"], bo["x"] + bo["width"])
    y2 = min(bi["y"] + bi["height"], bo["y"] + bo["height"])
    inner_area = bi["width"] * bi["height"]
    if inner_area <= 0:
        return 0.0
    if x2 <= x1 or y2 <= y1:
        return 0.0
    return ((x2 - x1) * (y2 - y1)) / inner_area


def containment_ratio(inner: Sequence[Any], outer: Sequence[Any]) -> float:
    """Fraction of ``inner`` that lies inside ``outer`` (0..1)."""
    area_inner = polygon_area(inner)
    if area_inner <= 0:
        return 0.0
    inter = polygon_area(
        [{"x": p["x"], "y": p["y"]} for p in _clip_points(inner, outer)]
    )
    return min(1.0, inter / area_inner)


def _clip_points(subject: Sequence[Any], clip: Sequence[Any]) -> List[Point]:
    """Clip a polygon by another polygon (Sutherland-Hodgman)."""
    a = dedupe_points(subject)
    b = dedupe_points(clip)
    if len(a) < 3 or len(b) < 3:
        return []
    subject_pts = _as_ccw(a)
    clip_pts = _as_ccw(b)
    out = list(subject_pts)
    n = len(clip_pts)

    def _inside(pt, ea, eb):
        return (eb[0] - ea[0]) * (pt[1] - ea[1]) - (eb[1] - ea[1]) * (pt[0] - ea[0]) >= -1e-12

    def _intersect(p1, p2, p3, p4):
        x1, y1 = p1
        x2, y2 = p2
        x3, y3 = p3
        x4, y4 = p4
        den = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1)
        if abs(den) < 1e-12:
            return p2
        t = ((y4 - y3) * (x1 - x3) - (x4 - x3) * (y1 - y3)) / den
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))

    for i in range(n):
        if not out:
            return []
        ea = clip_pts[i]
        eb = clip_pts[(i + 1) % n]
        inp = out
        out = []
        s = inp[-1]
        for e in inp:
            if _inside(e, ea, eb):
                if not _inside(s, ea, eb):
                    out.append(_intersect(s, e, ea, eb))
                out.append(e)
            elif _inside(s, ea, eb):
                out.append(_intersect(s, e, ea, eb))
            s = e
    return [{"x": p[0], "y": p[1]} for p in out]


def point_in_polygon(x: float, y: float, poly: Sequence[Any]) -> bool:
    """Ray-casting point-in-polygon test."""
    pts = [_as_xy(p) for p in poly]
    pts = [p for p in pts if p is not None]
    n = len(pts)
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y):
            x_at = (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi
            if x < x_at:
                inside = not inside
        j = i
    return inside


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------

def validate_polygon(
    points: Sequence[Any],
    *,
    min_area: float = 0.0,
    require_simple: bool = True,
) -> Tuple[bool, List[str]]:
    """
    Validate a candidate polygon.

    Returns ``(ok, problems)``. Problems are machine-readable codes so the
    frontend can explain *why* a candidate was flagged.
    """
    problems: List[str] = []

    raw = [_as_xy(p) for p in points]
    raw = [p for p in raw if p is not None]

    # Degenerate edges are checked on the raw input, before deduplication:
    # the point (0, 0) appearing twice is malformed even if the deduplicated
    # shape would be a valid triangle.
    for i in range(len(raw)):
        a = raw[i]
        b = raw[(i + 1) % len(raw)] if i + 1 < len(raw) else raw[0]
        # Only flag when the duplicate is *consecutive* in the input order.
        if i + 1 < len(raw) and abs(a[0] - b[0]) < 1e-9 and abs(a[1] - b[1]) < 1e-9:
            problems.append("DEGENERATE_EDGE")
            break

    pts = dedupe_points(points)
    if len(pts) < 3:
        return False, ["TOO_FEW_VERTICES"] + [p for p in problems if p not in ("TOO_FEW_VERTICES",)]

    for p in pts:
        if not (0.0 <= p["x"] <= 100.0 and 0.0 <= p["y"] <= 100.0):
            problems.append("OUT_OF_CANVAS")

    area = polygon_area(pts)
    if area <= 1e-9:
        problems.append("ZERO_AREA")
    elif min_area > 0 and area < min_area:
        problems.append("AREA_TOO_SMALL")

    if require_simple and not polygon_is_simple(pts):
        problems.append("SELF_INTERSECTING")

    return (len(problems) == 0), problems
