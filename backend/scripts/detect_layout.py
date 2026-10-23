#!/usr/bin/env python3
"""
detect_layout.py
PlotPro V2 site-plan detection worker (OpenCV + RapidOCR, no Gemini required).

Pipeline
--------
  1. legibility analysis        -> warnings only, never a rejection
  2. preprocessing variants      -> boundary evidence, several ways
  3. skew estimation + deskew    -> only when the evidence justifies it
  4. colour-fill segmentation     -> filled parcel shapes
  5. background-grid detection    -> conditional, evidence based
  6. region extraction            -> candidates from several sources
  7. block subdivision            -> only with internal divider evidence
  8. merge + deduplicate          -> polygon IoU, not bounding-box IoU
  9. conditional regularisation   -> quad fit only when it is faithful
 10. shared-edge snapping         -> only for genuinely adjacent polygons
 11. false-positive control       -> multiple signals, reasons recorded
 12. OCR + label association      -> per-candidate crops, lexicon guarded
 12b. text-fragment removal       -> glyph enclosures flagged by the OCR pass
 13. compass estimate

Emits strictly structured JSON on stdout:

{
  "success": true,
  "engine": "opencv-v2",
  "referenceWidth": int,
  "referenceHeight": int,
  "rotationAngle": float,
  "skewConfidence": float,
  "legibility": { ... },
  "candidates": [
    {
      "candidateId": str,
      "shapeType": "polygon",
      "points": [{"x": float, "y": float}, ...],
      "boundingBox": {...},
      "center": {...},
      "suggestedPlotNumber": str,
      "ocrConfidence": float,
      "labelConfidence": float,
      "geometryConfidence": float,
      "classification": str,
      "warnings": [str, ...]
    }
  ],
  "detectedBlocks": [str, ...],
  "stats": { ... }
}

Coordinates are always expressed in the **original image** frame (0..100),
regardless of any deskew that was applied internally.
"""

import argparse
import json
import math
import os
import sys
from typing import Any, Dict, List, Optional, Sequence, Tuple

# Allow the worker to be executed directly from backend/scripts.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import cv2
    import numpy as np
except ImportError as exc:  # pragma: no cover - environment guard
    print(json.dumps({
        "success": False,
        "error": "OPENCV_UNAVAILABLE",
        "message": f"Required computer vision dependencies not available: {exc}",
        "candidates": [],
    }))
    sys.exit(0)

from layout_core import legibility as legibility_mod
from layout_core import lines as lines_mod
from layout_core import ocr as ocr_mod
from layout_core import polygons as polygons_mod
from layout_core import preprocess as prep_mod
from layout_core import regions as regions_mod
from layout_core import skew as skew_mod
from layout_core.geometry import (
    bboxes_disjoint,
    bbox_of_points,
    bbox_containment_ratio,
    polygon_containment,
    polygon_iou,
)


DEFAULT_CONFIG: Dict[str, Any] = {
    # --- geometry -------------------------------------------------------
    "max_dimension": 2500,
    "min_area_percent": 0.012,
    "max_area_percent": 32.0,
    "max_vertices": 12,
    "quad_area_tolerance": 0.08,
    "prefer_quad": True,
    "duplicate_iou_threshold": 0.90,
    "merge_iou_threshold": 0.55,
    "snap_tolerance_ratio": 0.006,
    # --- skew ------------------------------------------------------------
    "apply_deskew": True,
    "deskew_min_confidence": 0.32,
    # --- grid ------------------------------------------------------------
    "suppress_grid": True,
    "grid_regularity_threshold": 0.72,
    # --- subdivision -----------------------------------------------------
    "subdivide_blocks": True,
    "min_divider_length_ratio": 0.22,
    # --- OCR --------------------------------------------------------------
    "read_labels": True,
    "ocr_min_score": 0.30,
    "ocr_max_candidates": 400,
    # --- compass ----------------------------------------------------------
    "estimate_compass": True,
}


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _log(msg: str) -> None:
    sys.stderr.write(f"[detect_layout.py] {msg}\n")


def _to_gray(image):
    if image.ndim == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image


def _rotate_mask(mask, M):
    """Rotate a binary mask with nearest-neighbour interpolation."""
    if mask is None:
        return None
    h, w = mask.shape[:2]
    cos = abs(M[0, 0])
    sin = abs(M[0, 1])
    new_w = int(h * sin + w * cos)
    new_h = int(h * cos + w * sin)
    return cv2.warpAffine(
        mask,
        M,
        (new_w, new_h),
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )


def _sheet_bbox(candidates: Sequence[Dict[str, Any]]) -> Optional[Dict[str, float]]:
    """Bounding box of the overall drawing, used for border-relative tests."""
    if not candidates:
        return None
    x0 = min(c["boundingBox"]["x"] for c in candidates)
    y0 = min(c["boundingBox"]["y"] for c in candidates)
    x1 = max(c["boundingBox"]["x"] + c["boundingBox"]["width"] for c in candidates)
    y1 = max(c["boundingBox"]["y"] + c["boundingBox"]["height"] for c in candidates)
    return {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}


def _drop_container_candidates(
    raw_candidates: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Drop candidates that contain a smaller candidate.

    A large candidate (a whole block) holding a smaller parcel is a
    container, not a parcel. The test is *containment*: the fraction of the
    smaller candidate's area that lies inside the bigger one. An IoU test
    cannot do this job — a plot fully inside its block has
    IoU = plot_area / block_area (typically ≈ 0.3), far below any reasonable
    threshold, which is why block outlines used to survive as plots.

    Each candidate's box is computed once; pairs where the other candidate
    is not meaningfully smaller are skipped without any rasterisation, and
    pairs whose closed bounding boxes are separated are skipped because a
    positive-area intersection is impossible for them.
    """
    if len(raw_candidates) < 2:
        return list(raw_candidates)

    raw_boxes = [bbox_of_points(c.get("points", [])) for c in raw_candidates]
    kept = []
    for cand_index, cand in enumerate(raw_candidates):
        is_container = False
        cand_box = raw_boxes[cand_index]
        cand_area = cand.get("areaPercent", 0.0)
        cand_pts = cand.get("points", [])
        for other_index, other in enumerate(raw_candidates):
            if other_index == cand_index:
                continue
            # Only a genuinely comparable-size other candidate can mark cand
            # as a container: the plot-in-block relationship sits around
            # 0.2-0.85 of the container's area. Below 0.2 the "other" is
            # something tiny (a text-glyph enclosure inside a plot, a grid
            # cell) — dropping cand for holding one of those would delete
            # real parcels, so such pairs are ignored here. (The old IoU>=0.7
            # test was wrong in the other direction: a plot fully inside its
            # block has IoU = plot/block ≈ 0.27, so containers never were
            # detected with it.)
            other_area = other.get("areaPercent", 0.0)
            proportion = other_area / cand_area if cand_area > 0 else 0.0
            if proportion < 0.20 or proportion >= 0.85:
                continue
            other_box = raw_boxes[other_index]
            if bboxes_disjoint(cand_box, other_box):
                # Separated closed boxes => no positive-area intersection:
                # the comparison is provably unable to flag a containment
                # pair.
                continue
            # Containment (fraction of the smaller shape covered by the
            # bigger one) — IoU cannot do this: a plot fully inside its
            # block has IoU = plot/block ≈ 0.3. The rasterised polygon
            # containment is combined with the bounding-box ratio because
            # enclosure contours can come out malformed: a self-intersecting
            # ring rasterises to nearly nothing although its bounding box is
            # the faithful block footprint (measured: containment 0.0 but
            # bbox ratio 1.0 for a block outline that held three plots).
            other_pts = other.get("points", [])
            containment = max(
                polygon_containment(other_pts, cand_pts),
                bbox_containment_ratio(other_pts, cand_pts),
            )
            if containment >= 0.8:
                # `other` lies (almost) completely inside cand.
                is_container = True
                break
        if not is_container:
            kept.append(cand)
    return kept


def _dedupe_and_merge(
    candidates: List[Dict[str, Any]], *, merge_iou: float, duplicate_iou: float
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """
    Merge candidates coming from different detection sources.

    Two candidates from *different* sources that describe the same shape are
    merged (keeping the one with the better geometry). Candidates from the
    same source that are duplicates are dropped.
    """
    stats = {"merged": 0, "duplicatesRemoved": 0}
    ordered = sorted(
        candidates,
        key=lambda c: -float(c.get("geometryConfidence", 0.0))
        - 0.001 * len(c.get("points", [])),
    )

    kept: List[Dict[str, Any]] = []
    kept_boxes: List[Dict[str, float]] = []
    for cand in ordered:
        pts = cand.get("points", [])
        if not pts:
            continue
        cand_box = bbox_of_points(pts)
        duplicate = False
        merged = False
        for existing, existing_box in zip(kept, kept_boxes):
            if bboxes_disjoint(cand_box, existing_box):
                # Closed, separated boxes cannot have a positive-area
                # intersection, so the IoU here must be 0 — below both the
                # duplicate (0.90) and merge (0.55) thresholds. Skipping the
                # expensive rasterisation preserves the original decision.
                continue
            iou = polygon_iou(pts, existing.get("points", []))
            if iou >= duplicate_iou:
                duplicate = True
                break
            if (
                cand.get("source") != existing.get("source")
                and iou >= merge_iou
            ):
                # Same shape seen by another detector: keep the better one and
                # remember that the other source agreed.
                existing["corroboratedSources"] = sorted(
                    set(existing.get("corroboratedSources", [])) | {cand.get("source")}
                )
                existing["geometryConfidence"] = min(
                    1.0, float(existing.get("geometryConfidence", 0.0)) + 0.05
                )
                stats["merged"] += 1
                merged = True
                break
        if duplicate:
            stats["duplicatesRemoved"] += 1
            continue
        if merged:
            continue
        kept.append(cand)
        kept_boxes.append(cand_box)

    return kept, stats


def _estimate_compass(image) -> Optional[Dict[str, Any]]:
    """
    Estimate the north bearing of a site plan.

    A compass rose is a circle with a filled pointer. We look for circles in
    the sheet margins, then measure the dominant pointer direction inside.
    """
    gray = _to_gray(image)
    h, w = gray.shape[:2]
    circles = cv2.HoughCircles(
        gray,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=int(0.08 * max(h, w)),
        param1=120,
        param2=40,
        minRadius=int(0.015 * max(h, w)),
        maxRadius=int(0.08 * max(h, w)),
    )
    if circles is None:
        return None

    best = None
    for x, y, r in np.round(circles[0]).astype(int):
        if r < 6:
            continue
        patch = gray[max(0, y - r): y + r, max(0, x - r): x + r]
        if patch.size == 0:
            continue
        # The pointer is the darkest structure inside the rose.
        _thr, binary = cv2.threshold(patch, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        ys, xs = np.nonzero(binary)
        if len(xs) < 4:
            continue
        cx = xs.mean() - patch.shape[1] / 2.0
        cy = ys.mean() - patch.shape[0] / 2.0
        if math.hypot(cx, cy) < 1e-3:
            continue
        # Screen angle: 0 = up (north), increasing clockwise.
        bearing = (math.degrees(math.atan2(cx, -cy))) % 360.0
        if best is None or r > best["radius"]:
            best = {"bearing": round(bearing, 1), "radius": int(r)}

    return best


# --------------------------------------------------------------------------
# main detection
# --------------------------------------------------------------------------

def detect(
    image_path: str,
    user_config: Optional[Dict[str, Any]] = None,
    lexicon: Optional[Sequence[str]] = None,
    known_blocks: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    config = {**DEFAULT_CONFIG, **(user_config or {})}
    lexicon = list(lexicon or [])
    known_blocks = list(known_blocks or [])

    if not os.path.exists(image_path):
        return {"success": False, "error": "IMAGE_NOT_FOUND", "message": image_path, "candidates": []}

    image = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if image is None:
        return {
            "success": False,
            "error": "DECODE_ERROR",
            "message": "Unable to decode the reference image.",
            "candidates": [],
        }

    orig_h, orig_w = image.shape[:2]
    warnings: List[str] = []

    # ── 1. Legibility (warning only) ───────────────────────────────────
    legibility = legibility_mod.analyse(image)
    if not legibility.get("legible"):
        warnings.append("LABELS_MAY_BE_UNREADABLE")
        _log(f"legibility: {legibility.get('reason')}")

    # ── 2. Preprocessing variants ──────────────────────────────────────
    built = prep_mod.build_boundary_variants(
        image, max_dimension=int(config["max_dimension"])
    )
    work_image = built["workImage"]
    work_gray = built["workGray"]
    work_size = built["workSize"]
    original_work_size = work_size  # kept for the final coordinate normalisation
    original_work_image = work_image  # kept for OCR crops (points live in this frame)

    # ── 3. Colour fill segmentation ────────────────────────────────────
    # Segmentation is rotation invariant, so it is measured on the original
    # pixels, before any resampling by the deskew.
    fill_info = prep_mod.colour_fill_mask(work_image)

    # ── 4. Skew estimation + deskew ────────────────────────────────────
    skew_info = skew_mod.estimate_skew_from_lines(work_gray)
    skew_region_info = None
    if fill_info.get("mask") is not None:
        skew_region_info = skew_mod.estimate_skew_from_regions(fill_info["mask"])
        # Prefer the region estimate when it is at least as confident: it
        # measures the orientation of the parcel shapes themselves and is
        # therefore immune to the background sheet grid, to text and to road
        # centrelines.
        if (
            skew_region_info.get("reason") == "OK"
            and skew_region_info.get("confidence", 0.0)
            >= skew_info.get("confidence", 0.0)
        ):
            skew_info = skew_region_info

    rotation_angle = 0.0
    deskew_applied = False
    M = None
    M_inv = None

    if config["apply_deskew"] and skew_info["reason"] == "OK":
        rotation_angle = float(skew_info["angle"])
        rotated, M, M_inv = skew_mod.deskew(work_image, rotation_angle)
        work_image = rotated
        work_gray = _to_gray(rotated)
        work_size = (rotated.shape[1], rotated.shape[0])
        deskew_applied = True
        _log(f"deskew applied by {rotation_angle} deg (confidence {skew_info['confidence']})")
    else:
        rotation_angle = 0.0
        if skew_info["reason"] != "OK":
            warnings.append("SKEW_NOT_CORRECTED")

    # Re-derive the boundary evidence in the (possibly rotated) frame.
    if deskew_applied:
        built = prep_mod.build_boundary_variants(
            work_image, max_dimension=int(config["max_dimension"])
        )
        work_gray = built["workGray"]
        combined = built["combined"]
        variants = built["variants"]
    else:
        combined = built["combined"]
        variants = built["variants"]

    # Colour fill mask follows the same transform as the image.
    fill_mask = fill_info.get("mask")
    if fill_mask is not None and deskew_applied and M is not None:
        fill_mask = _rotate_mask(fill_mask, M)

    # ── 4. Background grid detection (conditional) ──────────────────────
    grid_evidence = {"detected": False, "reason": "DISABLED"}
    grid_report: Dict[str, Any] = {"applied": False, "reason": "DISABLED"}
    if config["suppress_grid"]:
        # Background grids are drawn in a faint tone (light grey) while
        # parcel boundaries are dark. The tone band MUST be measured on the
        # raw grayscale: ``work_gray`` is CLAHE-enhanced, and the enhancement
        # pushes faint strokes far outside any fixed tone band. Measured on
        # faint_grid.png: only 431 pixels remained in the band on the
        # enhanced image, so the sheet grid was never detected and 300+
        # grid cells became candidates. A black-hat test keeps only THIN
        # strokes so the solid road fill and block fills cannot dominate
        # the offset histogram (their interiors produce no black-hat
        # response, while a thin line does).
        grid_search = None
        faint_thin_mask = None
        raw_gray = built.get("workRawGray")
        if raw_gray is not None:
            paper = float(np.median(raw_gray))
            band = ((raw_gray >= paper - 45) & (raw_gray <= paper - 6)).astype(
                np.uint8
            ) * 255
            hat_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            thin_response = cv2.morphologyEx(raw_gray, cv2.MORPH_BLACKHAT, hat_kernel)
            faint_thin_mask = cv2.bitwise_and(
                band, band, mask=(thin_response > 12).astype(np.uint8) * 255
            )
            grid_search = faint_thin_mask
        if grid_search is None:
            grid_search = combined
        grid_evidence = prep_mod.detect_background_grid(grid_search)

        if grid_evidence.get("detected"):
            # Remove ALL faint-thin pixels from the boundary mask, not only
            # the ones that survived the long-line opening. The opening
            # keeps full-length lines, but a grid line interrupted by blocks
            # leaves fragments in the gaps — those fragments together with
            # block outlines still close phantom "cells" between the blocks
            # (measured: 7 unlabelled one-row strips per grid fixture even
            # after opening-based suppression). The band is tone-selective
            # (faint relative to the sheet) and thinness-selective
            # (black-hat), so dark parcel boundaries, text, road fill and
            # compass strokes are outside it and are never touched.
            removal_mask = faint_thin_mask
            if removal_mask is None:
                removal_mask = grid_evidence.get("gridMask")
            cleaned, grid_report = prep_mod.suppress_grid(
                combined, {**grid_evidence, "gridMask": removal_mask}
            )
            combined = cleaned
        else:
            grid_report = {
                "applied": False,
                "reason": grid_evidence.get("reason", "NOT_DETECTED"),
            }

    # ── 5. Line evidence ───────────────────────────────────────────────
    segments = lines_mod.detect_segments(combined)
    fused = lines_mod.fuse_segments(segments, max_image_dimension=max(work_size))
    line_mask = lines_mod.segments_intersecting(combined, fused["edges"])

    # ── 6. Region extraction from several sources ──────────────────────
    raw_candidates: List[Dict[str, Any]] = []

    # Primary source: the regions the boundary evidence *encloses*. On a
    # real site plan the paper and the parcel fill are almost the same
    # tone, so colour clustering picks the paper; the drawn boundary is what
    # actually separates the parcels.
    closed, close_info = prep_mod.bridge_small_gaps(combined, kernel_size=3, iterations=1)
    enclosed = regions_mod.enclosed_regions(closed)

    sources: List[Tuple[str, Any]] = []
    if enclosed is not None and np.any(enclosed):
        sources.append(("enclosed", enclosed))
    if fill_mask is not None and np.any(fill_mask):
        sources.append(("fill", fill_mask))

    for source_name, mask in sources:
        if mask is None or not np.any(mask):
            continue
        found = regions_mod.extract_candidates_from_mask(
            mask,
            min_area_percent=float(config["min_area_percent"]),
            max_area_percent=float(config["max_area_percent"]),
            max_dimension=int(config["max_dimension"]),
        )
        for cand in found:
            cand["source"] = source_name
            raw_candidates.append(cand)

    # Make candidate identifiers globally unique. The per-source extraction
    # restarts its own counter, so two sources can otherwise produce the same
    # id for different geometry.
    for i, cand in enumerate(raw_candidates):
        cand["candidateId"] = f"cand_{i:04d}_{cand.get('source', 'x')}"

    # ── 7. Block subdivision (only with internal divider evidence) ─────
    subdivision_report = {"attempted": 0, "subdivided": 0, "reason": "DISABLED"}
    if config["subdivide_blocks"] and raw_candidates:
        subdivision_report = {"attempted": 0, "subdivided": 0, "reason": "OK"}
        expanded: List[Dict[str, Any]] = []
        for cand in raw_candidates:
            area_pct = cand.get("areaPercent", 0.0)
            if area_pct < 0.6:
                expanded.append(cand)
                continue
            subdivision_report["attempted"] += 1
            contour = cand.get("_contour")
            if contour is None:
                expanded.append(cand)
                continue
            region_mask = np.zeros(work_gray.shape[:2], np.uint8)
            cv2.drawContours(region_mask, [contour.astype(np.int32)], -1, 255, thickness=-1)
            result = regions_mod.subdivide_block(
                region_mask,
                combined,
                min_divider_length_ratio=float(config["min_divider_length_ratio"]),
            )
            if not result.get("subdivided"):
                expanded.append(cand)
                continue
            subdivision_report["subdivided"] += 1
            for part in result["parts"]:
                child = regions_mod._contour_to_candidate(
                    part,
                    index=len(expanded),
                    image_w=work_size[0],
                    image_h=work_size[1],
                    hierarchy_depth=cand.get("hierarchyDepth", 0) + 1,
                    is_hole=cand.get("isHole", False),
                )
                if child is None:
                    continue
                child["source"] = cand.get("source", "fill") + "+subdivided"
                child["_contour"] = part
                child["warnings"] = list(child.get("warnings", [])) + ["SUBDIVIDED_BLOCK"]
                expanded.append(child)
        raw_candidates = expanded

    for i, cand in enumerate(raw_candidates):
        cand["candidateId"] = f"cand_{i:04d}_{cand.get('source', 'x')}"

    # ── 7b. Drop containers that hold smaller candidates ───────────────
    # A large candidate (a block) that contains a smaller one at IoU >= 0.7
    # is a container, not a parcel, and is removed regardless of whether the
    # subdivision succeeded. This keeps the block outline from being
    # reported as a plot.
    raw_candidates = _drop_container_candidates(raw_candidates)

    # ── 8. Merge and deduplicate ───────────────────────────────────────
    merged, merge_stats = _dedupe_and_merge(
        raw_candidates,
        merge_iou=float(config["merge_iou_threshold"]),
        duplicate_iou=float(config["duplicate_iou_threshold"]),
    )

    # ── 9. Conditional regularisation ───────────────────────────────────
    for cand in merged:
        contour = cand.get("_contour")
        if contour is None:
            continue
        regular = polygons_mod.regularize(
            contour,
            max_vertices=int(config["max_vertices"]),
            prefer_quad=bool(config["prefer_quad"]),
            area_tolerance=float(config["quad_area_tolerance"]),
        )
        if regular.get("points") is not None and len(regular["points"]) >= 3:
            # Keep the regularised geometry in pixel space; it is normalised
            # (and, if needed, deskewed) further down.
            cand["_pointsPx"] = regular["points"]
            cand["regularizationMethod"] = regular["method"]
            cand["regularizationMetrics"] = regular["metrics"]

    # Map back to the original image frame when a deskew was applied, then
    # normalise every candidate to the 0..100 canvas of the ORIGINAL image.
    for cand in merged:
        points_px = cand.get("_pointsPx")
        if points_px is None:
            contour = cand.get("_contour")
            points_px = contour.astype(np.float32).reshape(-1, 2) if contour is not None else None
        if points_px is None or len(points_px) < 3:
            continue

        if deskew_applied and M_inv is not None:
            points_px = np.array(
                [
                    [
                        float(p[0]) * M_inv[0, 0] + float(p[1]) * M_inv[0, 1] + M_inv[0, 2],
                        float(p[0]) * M_inv[1, 0] + float(p[1]) * M_inv[1, 1] + M_inv[1, 2],
                    ]
                    for p in points_px
                ],
                dtype=np.float32,
            )

        cand["points"] = [
            {
                "x": round((float(p[0]) / original_work_size[0]) * 100.0, 3),
                "y": round((float(p[1]) / original_work_size[1]) * 100.0, 3),
            }
            for p in points_px
        ]

    # Recompute derived geometry after the coordinate change.
    for cand in merged:
        pts = cand.get("points", [])
        if len(pts) < 3:
            continue
        bbox = polygons_mod.bbox_of_points(pts)
        cand["boundingBox"] = {
            "x": round(bbox["x"], 3),
            "y": round(bbox["y"], 3),
            "width": round(bbox["width"], 3),
            "height": round(bbox["height"], 3),
        }
        centre = polygons_mod.polygon_centroid(pts)
        cand["center"] = {"x": round(centre[0], 3), "y": round(centre[1], 3)}
        cand["areaPercent"] = round(
            polygons_mod.polygon_area(pts) / (100.0 * 100.0) * 100.0, 5
        )

    # ── 10. Shared-edge snapping ───────────────────────────────────────
    snap_report = polygons_mod.snap_shared_edges(
        merged,
        tolerance_ratio=float(config["snap_tolerance_ratio"]),
        max_dimension=max(work_size),
    )

    # ── 11. False-positive control ─────────────────────────────────────
    sheet_bbox = _sheet_bbox(merged)
    filtered = regions_mod.filter_false_positives(
        merged,
        gray=work_gray,
        line_mask=line_mask,
        sheet_bbox=sheet_bbox,
        min_area_percent=float(config["min_area_percent"]),
    )
    final_candidates = filtered["candidates"]

    # Relative size filter: grid cells and text fragments are typically
    # several times smaller than the median parcel. Drop the small, very
    # rectangular ones (the signature of a background grid cell) so they do
    # not pollute the candidate list. This is a heuristic, never a hard
    # rejection of genuinely small plots: a candidate is only dropped when
    # it is small AND highly rectangular AND well supported by edges.
    if final_candidates:
        areas = sorted(c.get("areaPercent", 0.0) for c in final_candidates if c.get("areaPercent", 0.0) > 0)
        if areas:
            median_area = areas[len(areas) // 2]
            threshold = max(0.05 * median_area, 1e-6)
            kept = []
            extra_rejected = []
            for cand in final_candidates:
                area = float(cand.get("areaPercent", 0.0))
                rect = float(cand.get("rectangularity", 0.0))
                support = float((cand.get("classificationSignals") or {}).get("edgeSupport", 0.0))
                if (
                    area > 0
                    and area < threshold
                    and rect >= 0.85
                    and support >= 0.5
                ):
                    extra_rejected.append({"candidateId": cand.get("candidateId"), "reason": "GRID_CELL"})
                    continue
                kept.append(cand)
            final_candidates = kept
            filtered["rejected"].extend(extra_rejected)

    # ── 12. OCR + label association ────────────────────────────────────
    ocr_report: Dict[str, Any] = {"read": False}
    detected_blocks: List[str] = []
    engine = ocr_mod.OcrEngine.get()

    if config["read_labels"] and engine.available and final_candidates:
        ocr_report = _run_ocr(
            final_candidates,
            work_image,
            engine=engine,
            lexicon=lexicon,
            known_blocks=known_blocks,
            max_candidates=int(config["ocr_max_candidates"]),
            rotation_angle=0.0,
            inv_transform=M_inv,
            forward_transform=M,
            orig_size=original_work_size,
        )
        detected_blocks = ocr_report.get("blocks", [])

    # ── 12b. Drop text-fragment candidates flagged by the OCR pass ──────
    ocr_dropped: List[Dict[str, Any]] = []
    kept_after_ocr: List[Dict[str, Any]] = []
    for cand in final_candidates:
        reason = cand.pop("__dropReason", None)
        if reason:
            ocr_dropped.append({"candidateId": cand.get("candidateId"), "reason": reason})
            continue
        kept_after_ocr.append(cand)
    final_candidates = kept_after_ocr

    # ── 13. Compass ────────────────────────────────────────────────────
    compass = None
    if config["estimate_compass"]:
        compass = _estimate_compass(work_image)

    # ── Emit ───────────────────────────────────────────────────────────
    public_candidates = []
    for cand in final_candidates:
        public_candidates.append(
            {
                "candidateId": cand.get("candidateId"),
                "shapeType": "polygon",
                "points": [
                    {"x": round(float(p["x"]), 3), "y": round(float(p["y"]), 3)}
                    for p in cand.get("points", [])
                ],
                "boundingBox": cand.get("boundingBox", {}),
                "center": cand.get("center", {}),
                "suggestedPlotNumber": cand.get("suggestedPlotNumber", ""),
                "suggestedBlock": cand.get("suggestedBlock", ""),
                "ocrConfidence": round(float(cand.get("ocrConfidence", 0.0)), 4),
                "labelConfidence": round(float(cand.get("labelConfidence", 0.0)), 4),
                "geometryConfidence": round(float(cand.get("geometryConfidence", 0.0)), 4),
                "classification": cand.get("classification", "uncertain"),
                "classificationSignals": cand.get("classificationSignals", {}),
                "regularizationMethod": cand.get("regularizationMethod", ""),
                "source": cand.get("source", ""),
                "warnings": cand.get("warnings", []),
                "sourceProvider": "opencv",
            }
        )

    stats = {
        "rawCandidates": len(raw_candidates),
        "mergedCandidates": len(merged),
        "finalCandidates": len(final_candidates),
        "rejected": filtered["rejected"],
        "rejectedCount": len(filtered["rejected"]),
        "mergeStats": merge_stats,
        "subdivision": subdivision_report,
        "gridSuppression": grid_report,
        "fillSegmentation": {
            "reason": fill_info.get("reason"),
            "score": fill_info.get("score"),
            "chosenCluster": fill_info.get("chosenCluster"),
            "clusters": fill_info.get("clusters"),
        },
        "segmentCount": len(segments),
        "fusedEdgeCount": len(fused["edges"]),
        "closeInfo": close_info,
        "snap": snap_report,
        "ocr": ocr_report,
        "ocrDropped": ocr_dropped,
    }

    return {
        "success": True,
        "engine": "opencv-v2",
        "referenceWidth": int(orig_w),
        "referenceHeight": int(orig_h),
        "rotationAngle": round(float(rotation_angle), 3),
        "skewConfidence": round(float(skew_info.get("confidence", 0.0)), 3),
        "skewMethod": skew_info.get("method", "lines"),
        "skewReason": skew_info.get("reason", ""),
        "deskewApplied": deskew_applied,
        "legibility": legibility,
        "compassOrientation": compass.get("bearing") if compass else None,
        "detectedBlocks": detected_blocks,
        "candidateCount": len(public_candidates),
        "candidates": public_candidates,
        "warnings": warnings,
        "stats": stats,
    }


def _run_ocr(
    candidates: List[Dict[str, Any]],
    work_image,
    *,
    engine: ocr_mod.OcrEngine,
    lexicon: Sequence[str],
    known_blocks: Sequence[str],
    max_candidates: int,
    rotation_angle: float = 0.0,
    time_budget_sec: float = 20.0,
    inv_transform=None,
    forward_transform=None,
    orig_size=None,
) -> Dict[str, Any]:
    """
    Read plot numbers and associate with candidates efficiently.

    Step 1: Global sheet detection (fast: ~2-5s for the entire drawing).
    Step 2: Targeted fallback for unassigned high-confidence candidates
            bounded by an explicit time budget to prevent timeouts.

    When the sheet was deskewed, ``work_image`` is the upright, rotated
    image OCR reads best, while the candidates live in the ORIGINAL
    (pre-deskew) frame. ``inv_transform`` maps a point from the deskewed
    frame back to the original frame and ``forward_transform`` maps the
    other way; ``orig_size`` is the original (pre-deskew) work size used
    for the coordinate normalisation, so all association math happens in
    a single consistent frame.
    """
    import time
    start_time = time.time()
    h, w = work_image.shape[:2]
    if orig_size is not None:
        orig_w, orig_h = float(orig_size[0]), float(orig_size[1])
    else:
        orig_w, orig_h = float(w), float(h)
    tokens: List[Dict[str, Any]] = []
    blocks_found: List[str] = []

    # 1. Global sheet OCR pass (finds all visible numbers in 1 pass)
    try:
        raw_sheet_tokens = engine.read(work_image)
    except Exception as exc:
        _log(f"Global OCR pass failed: {exc}")
        raw_sheet_tokens = []

    for tok in raw_sheet_tokens:
        text = (tok.get("text") or "").strip()
        score = float(tok.get("score", 0.0))
        box = tok.get("box")
        if not text or not box:
            continue

        if inv_transform is not None:
            mapped = [
                (
                    float(x) * float(inv_transform[0, 0])
                    + float(y) * float(inv_transform[0, 1])
                    + float(inv_transform[0, 2]),
                    float(x) * float(inv_transform[1, 0])
                    + float(y) * float(inv_transform[1, 1])
                    + float(inv_transform[1, 2]),
                )
                for x, y in box
            ]
        else:
            mapped = [(float(x), float(y)) for x, y in box]

        xs = [p[0] for p in mapped]
        ys = [p[1] for p in mapped]
        cx_norm = (sum(xs) / len(xs) / orig_w) * 100.0
        cy_norm = (sum(ys) / len(ys) / orig_h) * 100.0
        bw_norm = (max(xs) - min(xs)) / orig_w * 100.0
        bh_norm = (max(ys) - min(ys)) / orig_h * 100.0

        classified = ocr_mod.classify_token(
            text, lexicon=lexicon, known_blocks=known_blocks
        )
        if classified.get("kind") in ("dimension", "road_text", "unknown"):
            continue
        if classified.get("kind") == "block":
            name = (classified.get("text") or "").strip()
            if name and name not in blocks_found:
                blocks_found.append(name)
            continue

        tokens.append(
            {
                "text": text,
                "score": score,
                "x": cx_norm,
                "y": cy_norm,
                "bbox": {
                    "x": min(xs) / float(w) * 100.0,
                    "y": min(ys) / float(h) * 100.0,
                    "width": bw_norm,
                    "height": bh_norm,
                },
                "kind": classified.get("kind"),
                "candidates": classified.get("candidates", []),
            }
        )

    # Associate tokens from the global pass
    association = ocr_mod.associate_labels(candidates, tokens, lexicon=lexicon)
    suggestions_applied = 0

    used_identifiers = {
        ocr_mod.normalise_identifier(a["text"])
        for a in association["assignments"].values()
        if a.get("text")
    }

    dropped_fragments: set = set()
    for idx, assignment in association["assignments"].items():
        cand = candidates[idx]

        # A candidate whose bounding box is barely bigger than the OCR token
        # that named it is the enclosure around the glyph strokes themselves
        # (a text fragment), not a parcel. Dropping it keeps plot numbers
        # from appearing on stray blobs AND removes a false positive from
        # the candidate list.
        token_index = assignment.get("tokenIndex")
        token = tokens[token_index] if isinstance(token_index, int) and 0 <= token_index < len(tokens) else None
        if token is not None:
            tb = token.get("bbox") or {}
            token_area = float(tb.get("width", 0.0)) * float(tb.get("height", 0.0))
            bb = cand.get("boundingBox") or {}
            cand_area = float(bb.get("width", 0.0)) * float(bb.get("height", 0.0))
            if token_area > 0 and cand_area < 4.0 * token_area:
                dropped_fragments.add(idx)

    for idx, assignment in association["assignments"].items():
        cand = candidates[idx]
        if idx in dropped_fragments:
            cand["suggestedPlotNumber"] = ""
            cand["ocrConfidence"] = 0.0
            cand["labelConfidence"] = 0.0
            cand["__dropReason"] = "TEXT_FRAGMENT"
            continue
        cand["suggestedPlotNumber"] = assignment["text"]
        cand["ocrConfidence"] = assignment["ocrConfidence"]
        cand["labelConfidence"] = assignment["associationConfidence"]
        if assignment.get("candidates"):
            cand["suggestedDatabaseNumber"] = assignment["candidates"][0]

        # A fuzzy read backed by a single, clearly-better lexicon match is
        # promoted to the suggested plot number (it is never a hard label):
        # the raw token is often a misread ("5/16" instead of "5/10") and
        # the lexicon is the ground truth the project registered.
        suggestions = assignment.get("candidates") or []
        if (
            assignment.get("kind") == "plot_suggestion"
            and not assignment.get("ambiguousToken")
            and len(suggestions) == 1
        ):
            cand["suggestedPlotNumber"] = suggestions[0]
            cand["labelConfidence"] = min(1.0, 0.6 * float(assignment.get("associationConfidence", 0.0)))
            if "OCR_FUZZY_SUGGESTION" not in cand.get("warnings", []):
                cand["warnings"] = list(cand.get("warnings", [])) + ["OCR_FUZZY_SUGGESTION"]
            suggestions_applied += 1

        for flag in association["flags"]:
            if flag["candidateId"] == cand.get("candidateId"):
                if flag["code"] not in cand.get("warnings", []):
                    cand["warnings"] = list(cand.get("warnings", [])) + [flag["code"]]

    # 2. Targeted fallback: inspect unassigned candidates under time budget.
    # Blocks are excluded — a block crop covers several plots, so whatever
    # it reads belongs to an inner parcel and produces a duplicate label.
    # Very small candidates are excluded too: their tokens were already
    # seen in the global sheet pass, and a re-read just re-assigns the
    # neighbour's number.
    assigned_indices = set(association["assignments"].keys())
    unassigned = [
        (idx, cand)
        for idx, cand in enumerate(candidates)
        if idx not in assigned_indices
        and float(cand.get("geometryConfidence", 0.0)) >= 0.5
        and cand.get("classification") != "block"
        and float(cand.get("areaPercent", 0.0)) >= 0.05
    ]
    unassigned.sort(key=lambda item: -float(item[1].get("geometryConfidence", 0.0)))
    target_fallback = unassigned[: min(25, max_candidates)]

    for idx, cand in target_fallback:
        if (time.time() - start_time) >= time_budget_sec:
            break

        # The crop must come from the same frame ``work_image`` lives in.
        # ``_pointsPx`` is that frame's pixel polygon when regularisation
        # produced it; otherwise map the normalised points back into the
        # deskewed frame via the forward rotation.
        raw_px = cand.get("_pointsPx")
        if raw_px is not None and len(raw_px) >= 3:
            poly_px = np.array([[float(p[0]), float(p[1])] for p in raw_px], dtype=np.float32)
        else:
            pts = cand.get("points", [])
            if len(pts) < 3:
                continue
            poly_px = np.array(
                [
                    [float(p["x"]) / 100.0 * orig_w, float(p["y"]) / 100.0 * orig_h]
                    for p in pts
                ],
                dtype=np.float32,
            )
            if forward_transform is not None:
                poly_px = np.array(
                    [
                        [
                            float(p[0]) * float(forward_transform[0, 0])
                            + float(p[1]) * float(forward_transform[0, 1])
                            + float(forward_transform[0, 2]),
                            float(p[0]) * float(forward_transform[1, 0])
                            + float(p[1]) * float(forward_transform[1, 1])
                            + float(forward_transform[1, 2]),
                        ]
                        for p in poly_px
                    ],
                    dtype=np.float32,
                )
        try:
            result = ocr_mod.read_label_for_candidate(
                poly_px,
                work_image,
                engine=engine,
                lexicon=lexicon,
                known_blocks=known_blocks,
                # The OCR image is already upright when a deskew was
                # applied, so no extra in-crop rotation is needed.
                rotation_angle=0.0 if inv_transform is not None else rotation_angle,
            )
        except Exception:
            continue

        if result.get("kind") in ("none", "unknown", "dimension", "road_text"):
            continue
        if result.get("kind") == "block":
            name = (result.get("text") or "").strip()
            if name and name not in blocks_found:
                blocks_found.append(name)
            continue

        identifier = ocr_mod.normalise_identifier(result.get("text", ""))
        if identifier and identifier in used_identifiers:
            # The identifier is already carried by another candidate; do not
            # duplicate it onto this one (it would read a neighbour's or
            # inner plot's number).
            continue

        cand["suggestedPlotNumber"] = result.get("text", "")
        cand["ocrConfidence"] = result.get("confidence", 0.0)
        cand["labelConfidence"] = 0.8
        if identifier:
            used_identifiers.add(identifier)
        if result.get("candidates"):
            cand["suggestedDatabaseNumber"] = result["candidates"][0]

    return {
        "read": True,
        "tokenCount": len(tokens),
        "assignmentCount": len(association["assignments"]),
        "fragmentCount": len(dropped_fragments),
        "suggestionsApplied": suggestions_applied,
        "flags": association["flags"],
        "duplicateIdentifiers": association["duplicateIdentifiers"],
        "blocks": blocks_found,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Detect plot polygons and labels in a site-plan image (OpenCV + RapidOCR)."
    )
    parser.add_argument("image_path", help="Path to the input image")
    parser.add_argument("--config", default="{}", help="JSON configuration overrides")
    parser.add_argument(
        "--lexicon-file",
        default=None,
        help="JSON file containing the project's plot numbers (OCR lexicon)",
    )
    parser.add_argument(
        "--blocks-file",
        default=None,
        help="JSON file containing the project's block labels",
    )
    args = parser.parse_args()

    user_cfg: Dict[str, Any] = {}
    if args.config:
        try:
            user_cfg = json.loads(args.config)
        except Exception:
            user_cfg = {}

    lexicon: List[str] = []
    if args.lexicon_file and os.path.exists(args.lexicon_file):
        try:
            with open(args.lexicon_file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            lexicon = [str(x) for x in (data if isinstance(data, list) else data.get("plotNumbers", []))]
        except Exception as exc:
            _log(f"lexicon load failed: {exc}")

    blocks: List[str] = []
    if args.blocks_file and os.path.exists(args.blocks_file):
        try:
            with open(args.blocks_file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            blocks = [str(x) for x in (data if isinstance(data, list) else data.get("blocks", []))]
        except Exception as exc:
            _log(f"blocks load failed: {exc}")

    result = detect(args.image_path, user_cfg, lexicon=lexicon, known_blocks=blocks)
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
