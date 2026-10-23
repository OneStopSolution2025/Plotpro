"""
preprocess.py — boundary-mask construction and conditional grid suppression.

The previous implementation built a single binary mask by OR-ing an adaptive
threshold, a Canny edge map and a black-hat response, then applied a 3x3
closing. On a faint site plan that produced two failure modes:

* the faint **background sheet grid** was promoted to a "boundary", so every
  grid cell became a candidate plot (measured: 373 candidates for ~40 real
  plots);
* the closing merged neighbouring parcels, so individual plots disappeared
  inside a single blob.

This module therefore:

* keeps the raw boundary evidence intact and works on *variants* of it, so a
  consumer can compare them instead of trusting a single magic mask;
* performs gap bridging with the smallest possible kernel and measures the
  effect;
* treats grid suppression as a **conditional** operation backed by explicit
  evidence (regular spacing + orientation consistency + sheet-wide extent),
  and reports whether suppression was applied or skipped.
"""

from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np


# --------------------------------------------------------------------------
# base preprocessing
# --------------------------------------------------------------------------

def to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image


def enhance(gray: np.ndarray) -> np.ndarray:
    """CLAHE + bilateral: boosts faint strokes without smearing edges."""
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(gray)
    return cv2.bilateralFilter(clahe, d=7, sigmaColor=50, sigmaSpace=50)


def build_boundary_variants(
    image: np.ndarray,
    *,
    max_dimension: int = 2500,
) -> Dict[str, Any]:
    """
    Build the family of boundary masks the detector can choose from.

    Returns a dict with the source image, the enhanced grayscale, the raw
    combined boundary evidence (never mutated afterwards) and the individual
    variants plus the colour-fill mask.
    """
    gray_full = to_gray(image)
    h, w = gray_full.shape[:2]
    scale = 1.0
    work = gray_full
    if max(h, w) > max_dimension:
        scale = max_dimension / float(max(h, w))
        work = cv2.resize(
            gray_full,
            (int(w * scale), int(h * scale)),
            interpolation=cv2.INTER_AREA,
        )

    raw_work = work  # unenhanced gray at work size — tone bands must be measured here
    enhanced = enhance(work)

    # Variant A — adaptive threshold. Good for filled / shaded parcels.
    thresh_adaptive = cv2.adaptiveThreshold(
        enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 4
    )

    # Variant B — Canny. Good for crisp vector-like parcel lines.
    canny = cv2.Canny(enhanced, 40, 120)

    # Variant C — black-hat. Isolates thin dark strokes on a light sheet.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, kernel)

    combined = cv2.bitwise_or(thresh_adaptive, canny)
    combined = cv2.bitwise_or(combined, blackhat)

    return {
        "gray": gray_full,
        "workRawGray": raw_work,
        "workGray": enhanced,
        "workImage": image if scale == 1.0 else cv2.resize(
            image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA
        ),
        "scale": scale,
        "variants": {
            "adaptive": thresh_adaptive,
            "canny": canny,
            "blackhat": blackhat,
            "combined": combined,
        },
        "combined": combined,
        "size": (w, h),
        "workSize": (work.shape[1], work.shape[0]),
    }


def bridge_small_gaps(
    mask: np.ndarray, *, kernel_size: int = 3, iterations: int = 1
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Conservatively bridge tiny breaks in boundary lines.

    The kernel is intentionally small (3x3 by default) and a single pass:
    the previous 3x3 + 3x1 + 1x3 closing stack was enough to weld adjacent
    parcels into one blob on low-contrast sheets.
    """
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=iterations)

    before = int(cv2.countNonZero(mask))
    after = int(cv2.countNonZero(closed))
    added = after - before
    added_pct = (added / before * 100.0) if before else 0.0
    return closed, {
        "kernelSize": kernel_size,
        "iterations": iterations,
        "pixelsBefore": before,
        "pixelsAfter": after,
        "pixelsAdded": added,
        "addedPercent": round(added_pct, 3),
    }


def close_directional(
    mask: np.ndarray, angle_deg: float, *, length: int = 5
) -> np.ndarray:
    """
    Close gaps along a single dominant direction.

    Used only when the drawing has a clear orientation, so that continuity is
    improved *along* parcel lines without joining unrelated structures
    across a road.
    """
    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT, (length, 1) if abs(angle_deg) < 45 or abs(angle_deg) > 135 else (1, length)
    )
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)


# --------------------------------------------------------------------------
# background grid detection
# --------------------------------------------------------------------------

def _long_line_mask(mask: np.ndarray, angle_deg: float, length: int) -> np.ndarray:
    """Opening with a long linear kernel keeps only lines of that orientation."""
    if abs(angle_deg - 0.0) < 1e-6 or abs(angle_deg - 180.0) < 1e-6:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (length, 1))
    elif abs(angle_deg - 90.0) < 1e-6:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, length))
    else:
        kernel = _rotated_rect_kernel(angle_deg, (length, 1))
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)


def _rotated_rect_kernel(angle_deg: float, size: Tuple[int, int]) -> np.ndarray:
    """Build a rotated rectangular structuring element."""
    w, h = size
    rect = ((0, 0), (w, h), angle_deg)
    pts = cv2.boxPoints(rect).astype(np.int32)
    kernel = np.zeros((h * 2 + w * 2 + 1, h * 2 + w * 2 + 1), np.uint8)
    cv2.fillConvexPoly(kernel, pts, 255)
    return kernel


def detect_background_grid(
    mask: np.ndarray,
    *,
    gray: Optional[np.ndarray] = None,
    angles: Tuple[float, ...] = (0.0, 90.0),
    min_line_length_ratio: float = 0.18,
) -> Dict[str, Any]:
    """
    Look for a regular, sheet-wide background grid.

    Evidence used (all must agree before suppression is considered):

    * **repeated spacing** — the perpendicular offsets of parallel lines
      cluster around one modal spacing, with most of the family aligned to
      that lattice (interrupted and partly hidden grid lines allowed);
    * **consistent orientation** — lines cluster tightly around one angle;
    * **sheet-wide extent** — the lines span most of the drawing area;
    * **thinness** — the caller supplies a mask in which only thin, faint
      strokes survive, so solid fills and dark parcel lines cannot form
      the family.

    Returns the evidence plus the pixel mask of the detected grid.
    """
    h, w = mask.shape[:2]
    min_len = max(24, int(min_line_length_ratio * max(h, w)))

    families: List[Dict[str, Any]] = []
    all_evidence: List[Dict[str, Any]] = []

    for angle in angles:
        long_mask = _long_line_mask(mask, angle, min_len)
        pixels = long_mask > 0
        if not pixels.any():
            continue

        ys, xs = np.nonzero(pixels)
        rad = np.radians(angle)
        # Perpendicular offset of every grid pixel from the image centre.
        t = -(xs - w / 2.0) * np.sin(rad) + (ys - h / 2.0) * np.cos(rad)

        span = float(t.max() - t.min()) if t.size else 0.0
        coverage = float(pixels.sum()) / float(h * w)

        # Projection profile with 1px bins. Peaks are LOCAL accumulations,
        # never a global half-max threshold: the sheet grid is interrupted
        # wherever blocks sit on it, so a visible line fragment can carry
        # only a fraction of the longest line's pixel mass. Measured on
        # faint_grid.png: the half-max rule kept just 3 of 16 horizontal
        # lines, and even the previous smoothed-profile rule destroyed the
        # 1px-wide peaks (a 3-bin average divides an isolated peak by 3).
        # The profile here is raw; lines are separated by >= 6px of empty
        # bins into clusters, then scored by MODAL SPACING + PHASE
        # ALIGNMENT, which tolerates missing/outlier lines gracefully.
        if t.size < 2:
            continue
        lo = float(t.min())
        prof = np.bincount(
            np.round(t - lo).astype(np.int64), minlength=int(span) + 2
        ).astype(np.float64)
        strong = np.where(prof > 0.30 * float(prof.max()))[0]
        if strong.size < 5:
            continue

        # Cluster consecutive bins (gap <= 6px is one line) into peaks.
        groups: List[Tuple[int, int]] = []
        run_start = int(strong[0])
        run_prev = int(strong[0])
        for bin_idx in strong[1:]:
            if int(bin_idx) - run_prev > 6:
                groups.append((run_start, run_prev))
                run_start = int(bin_idx)
            run_prev = int(bin_idx)
        groups.append((run_start, run_prev))

        peak_positions = []
        for g_start, g_end in groups:
            weights = prof[g_start : g_end + 1]
            offsets = np.arange(g_start, g_end + 1, dtype=np.float64)
            total = float(weights.sum())
            if total <= 0:
                continue
            peak_positions.append(lo + float((offsets * weights).sum() / total))
        peak_positions = np.sort(np.array(peak_positions))
        if peak_positions.size < 5:
            continue

        # Modal spacing: the most common gap between consecutive peaks
        # dominates a real grid, while text strokes and stray fragments
        # produce irregular gaps. The grid statistic is then computed ONLY
        # over the peaks that sit on the modal-spacing lattice (phase
        # alignment), so missing lines and outliers do not corrupt it.
        diffs = np.round(np.diff(peak_positions)).astype(np.int64)
        diffs = diffs[diffs > 0]
        if diffs.size < 2:
            continue
        diff_vals, diff_counts = np.unique(diffs, return_counts=True)
        modal = int(diff_vals[np.argmax(diff_counts)])
        if modal < 12:
            continue

        aligned = [float(peak_positions[0])]
        steps: List[int] = []
        prev = aligned[0]
        for pos in peak_positions[1:]:
            step = int(round((float(pos) - prev) / modal))
            if step >= 1 and abs((float(pos) - prev) - step * modal) <= 3.0:
                aligned.append(float(pos))
                steps.append(step)
                prev = float(pos)
            elif abs(float(pos) - prev) <= 3.0:
                # Same line seen twice (anti-aliased double bin): merge.
                aligned[-1] = (aligned[-1] + float(pos)) / 2.0
        aligned_arr = np.array(aligned)
        if aligned_arr.size < 5 or len(steps) < 2:
            continue

        # Unit spacings: each aligned gap divided by the number of lattice
        # steps it spans. A 240px gap over a missing line is exactly three
        # 80px steps — penalising raw gaps would punish a merely
        # interrupted grid as an irregular one (measured on complex.png:
        # 17/17 peaks aligned, yet raw-gap regularity was 0.377).
        unit = np.array(
            [
                (aligned_arr[i + 1] - aligned_arr[i]) / steps[i]
                for i in range(len(steps))
            ],
            dtype=np.float64,
        )
        mean_spacing = float(unit.mean())
        std_spacing = float(unit.std())
        lattice_regularity = (
            1.0 - min(1.0, std_spacing / mean_spacing) if mean_spacing > 0 else 0.0
        )
        # Overall trustworthiness: how much of the family actually obeys the
        # lattice. One irregular intruder must not sink the score, but a
        # family that is majority-noise must not pass either.
        alignment_ratio = aligned_arr.size / float(peak_positions.size)
        regularity = lattice_regularity * alignment_ratio

        # Orientation consistency of the pixels that survived the opening.
        cand_best = {
            "angle": angle,
            "regularity": round(regularity, 3),
            "meanSpacingPx": round(mean_spacing, 1),
            "spanRatio": round(span / max(h, w), 3),
            "coverage": round(coverage, 5),
            "lineCount": int(aligned_arr.size),
        }
        score = regularity * min(1.0, cand_best["spanRatio"] / 0.6)
        cand_best["score"] = round(score, 3)
        all_evidence.append({k: v for k, v in cand_best.items()})

        # An orientation that passes the gates is a grid family in its own
        # right and its pixels are suppressed. Restricting suppression to
        # only the best family left the other one intact: on the fixtures
        # the horizontal family won and the vertical grid lines remained,
        # so the sheet kept being sliced into 80px vertical strips that the
        # detector offered as (many) plot candidates. Measured: 133
        # candidates on complex.png with only one family suppressed.
        detected_family = (
            cand_best["regularity"] >= 0.72
            and cand_best["spanRatio"] >= 0.55
            and 5 <= cand_best["lineCount"] <= 60
            and cand_best["meanSpacingPx"] >= 12.0
            and cand_best["coverage"] <= 0.18
        )
        if detected_family:
            families.append({"angle": angle, "mask": long_mask, **cand_best})

    if not families:
        reason = all_evidence[0].get("reason", "NO_REGULAR_LINE_FAMILY") if all_evidence else "NO_REGULAR_LINE_FAMILY"
        if all_evidence:
            reason = "INSUFFICIENT_EVIDENCE" if any(e["score"] > 0 for e in all_evidence) else "NO_REGULAR_LINE_FAMILY"
        return {
            "detected": False,
            "reason": reason,
            "gridMask": None,
            "families": all_evidence,
        }

    # Merged result: every passing orientation family is part of the grid.
    merged_mask = families[0]["mask"].copy()
    for fam in families[1:]:
        merged_mask = cv2.bitwise_or(merged_mask, fam["mask"])
    best_fam = max(families, key=lambda f: f["score"])
    total_lines = sum(f["lineCount"] for f in families)

    detected = True
    return {
        "detected": True,
        "reason": "REGULAR_GRID",
        "gridMask": merged_mask,
        "angle": [f["angle"] for f in families],
        "regularity": best_fam["regularity"],
        "meanSpacingPx": best_fam["meanSpacingPx"],
        "spanRatio": best_fam["spanRatio"],
        "coverage": round(sum(f["coverage"] for f in families), 5),
        "lineCount": int(total_lines),
        "score": best_fam["score"],
        "families": all_evidence,
    }


def suppress_grid(
    mask: np.ndarray, grid_evidence: Dict[str, Any]
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Remove detected grid pixels from a boundary mask.

    Only pixels belonging to the detected grid family are removed, so parcel
    lines that happen to share an orientation survive.
    """
    grid_mask = grid_evidence.get("gridMask")
    if not grid_evidence.get("detected") or grid_mask is None:
        return mask, {
            "applied": False,
            "reason": grid_evidence.get("reason", "NOT_DETECTED"),
            "pixelsRemoved": 0,
        }

    # Keep only grid pixels that are NOT part of a stronger, longer line.
    cleaned = cv2.bitwise_and(mask, cv2.bitwise_not(grid_mask))
    removed = int(cv2.countNonZero(mask) - cv2.countNonZero(cleaned))
    return cleaned, {
        "applied": True,
        "reason": grid_evidence.get("reason"),
        "pixelsRemoved": removed,
        "removedPercent": round(
            (removed / cv2.countNonZero(mask) * 100.0) if cv2.countNonZero(mask) else 0.0, 3
        ),
        "angle": grid_evidence.get("angle"),
    }


def colour_fill_mask(image: np.ndarray) -> Dict[str, Any]:
    """
    Segment filled parcel shapes by colour.

    On a typical site plan the parcels are *filled* (pale cream / pink)
    while the surrounding sheet and roads are a different, cooler tone.
    Segmenting the fill is far more robust than tracing edges through a
    faint multi-coloured drawing.

    Returns the binary fill mask plus the cluster information used.
    """
    if image.ndim != 3:
        return {"mask": None, "reason": "NOT_COLOR", "clusters": []}

    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    # Down-sample for clustering, then up-sample the labels.
    small = cv2.resize(lab, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    flat = small.reshape(-1, 3).astype(np.float32)

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    # The worker that runs cv2.kmeans is normally a fresh process, where
    # the default RNG state is deterministic. Seed it explicitly so colour
    # clustering stays reproducible even when the pipeline later runs
    # several detections inside one process (tests, batch jobs).
    cv2.setRNGSeed(0)
    _compactness, labels, centers = cv2.kmeans(
        flat, 5, None, criteria, 3, cv2.KMEANS_PP_CENTERS
    )
    labels = labels.reshape(small.shape[:2])
    centers_lab = centers.astype(np.int32)

    clusters = []
    for i, center in enumerate(centers_lab):
        mask_i = (labels == i).astype(np.uint8) * 255
        coverage = float((labels == i).sum()) / float(labels.size)
        clusters.append(
            {
                "index": i,
                "lab": center.tolist(),
                "coverage": round(coverage, 4),
                "mask": mask_i,
            }
        )

    # Pick the cluster that behaves most like "parcel fill": substantial
    # coverage, made of compact blobs (many small connected components) and
    # not the dominant background tone.
    h, w = labels.shape[:2]
    best_cluster = None
    best_score = -1.0
    for c in clusters:
        m = c["mask"]
        count, _labels, _stats, _centroids = cv2.connectedComponentsWithStats(m, 8)
        blobs = count - 1
        if blobs < 3:
            continue
        blob_pixels = _stats[1:, cv2.CC_STAT_AREA] if blobs else np.array([])
        if blob_pixels.size == 0:
            continue
        median_area = float(np.median(blob_pixels))
        if median_area < 0.0005 * h * w:
            continue
        # The paper is a single huge blob that surrounds everything else; it
        # is never the parcel fill. Reject it explicitly, otherwise the
        # segmentation returns the whole sheet (measured: 95% coverage, one
        # blob covering everything).
        largest_ratio = float(blob_pixels.max()) / float(blob_pixels.sum())
        if largest_ratio > 0.60:
            continue
        # Compactness: fill ratio of the median blob.
        areas = _stats[1:, cv2.CC_STAT_AREA]
        widths = _stats[1:, cv2.CC_STAT_WIDTH]
        heights = _stats[1:, cv2.CC_STAT_HEIGHT]
        with np.errstate(divide="ignore", invalid="ignore"):
            fill_ratio = np.median(areas / np.maximum(1, widths * heights))
        if not np.isfinite(fill_ratio):
            fill_ratio = 0.0
        score = float(np.log1p(blobs)) * float(fill_ratio) * min(1.0, c["coverage"] * 4.0)
        c["blobCount"] = int(blobs)
        c["medianBlobArea"] = round(median_area, 1)
        c["fillRatio"] = round(float(fill_ratio), 3)
        c["largestBlobRatio"] = round(largest_ratio, 3)
        c["score"] = round(score, 4)
        if score > best_score:
            best_score = score
            best_cluster = c

    if best_cluster is None:
        return {"mask": None, "reason": "NO_FILL_CLUSTER", "clusters": []}

    # Upsample the winning cluster mask to the full image size.
    full_mask = cv2.resize(
        best_cluster["mask"], (image.shape[1], image.shape[0]), interpolation=cv2.INTER_NEAREST
    )
    # Close small holes so a parcel fill becomes one solid region.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    full_mask = cv2.morphologyEx(full_mask, cv2.MORPH_CLOSE, kernel, iterations=1)

    public_clusters = [
        {k: v for k, v in c.items() if k != "mask"} for c in clusters
    ]
    return {
        "mask": full_mask,
        "reason": "OK",
        "score": best_score,
        "clusters": public_clusters,
        "chosenCluster": {k: v for k, v in best_cluster.items() if k != "mask"},
    }
