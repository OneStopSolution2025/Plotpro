"""
legibility.py — image quality assessment for label reading.

This module produces **warnings**, never rejections. A site plan whose
labels are unreadable is still a usable site plan: the geometry can be
detected and reviewed, and the operator can type the plot numbers in.

The measurements are deliberately evidence based:

* **glyph height** — the median height of small, text-like connected
  components. A plot number has to be several pixels tall before a
  recognition model has anything to work with.
* **stroke/paper contrast** — the difference between the dark tail and the
  paper of the label regions, expressed as a ratio.
* **blur** — Laplacian variance over the whole sheet, which drops sharply
  when a plan is photographed out of focus.
* **label mass** — how much small text-like material exists at all. A plan
  with no text-like components probably has no plot numbers printed on it.

Image width on its own is *not* treated as a guarantee of OCR success; the
width only informs the recommended minimum for the operator.
"""

from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np


def _text_like_components(
    gray: np.ndarray, *, max_frac: float = 0.08, min_frac: float = 0.00005
) -> Tuple[List[np.ndarray], Dict[str, float]]:
    """
    Find small connected components that plausibly are glyphs.

    Returns the list of component bounding boxes and some statistics.
    """
    h, w = gray.shape[:2]
    area_total = float(h * w)

    # Local contrast normalisation so faint text on a light sheet survives.
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(gray)
    binary = cv2.adaptiveThreshold(
        clahe, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 5
    )
    # Remove only genuinely long structures (sheet borders, background grid)
    # before component analysis. The kernel is deliberately large so that
    # normal text strokes survive: a 15 px kernel would erase a label like
    # "7/12" entirely, which is what made the detector report zero glyphs.
    horiz = cv2.getStructuringElement(cv2.MORPH_RECT, (max(40, w // 8), 1))
    vert = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(40, h // 8)))
    lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horiz)
    lines = cv2.bitwise_or(lines, cv2.morphologyEx(binary, cv2.MORPH_OPEN, vert))
    glyph_mask = cv2.bitwise_and(binary, cv2.bitwise_not(lines))

    count, _labels, stats, _cent = cv2.connectedComponentsWithStats(glyph_mask, 8)
    boxes: List[np.ndarray] = []
    heights: List[float] = []

    for i in range(1, count):
        area = float(stats[i, cv2.CC_STAT_AREA])
        bw = float(stats[i, cv2.CC_STAT_WIDTH])
        bh = float(stats[i, cv2.CC_STAT_HEIGHT])
        if area <= 0:
            continue
        if area > max_frac * area_total:
            continue
        if area < min_frac * area_total:
            continue
        if bw < 1 or bh < 2:
            continue
        # Text-like: taller than wide, or roughly square but small.
        ratio = bw / max(1.0, bh)
        if ratio > 3.0:
            continue
        boxes.append(
            np.array(
                [
                    [stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP]],
                    [
                        stats[i, cv2.CC_STAT_LEFT] + bw,
                        stats[i, cv2.CC_STAT_TOP] + bh,
                    ],
                ],
                dtype=np.int32,
            )
        )
        heights.append(bh)

    stats_out = {
        "componentCount": len(boxes),
        "medianHeightPx": float(np.median(heights)) if heights else 0.0,
        "minHeightPx": float(np.min(heights)) if heights else 0.0,
        "maxHeightPx": float(np.max(heights)) if heights else 0.0,
    }
    return boxes, stats_out


def _contrast_estimate(
    gray: np.ndarray, boxes: List[np.ndarray], *, sample_limit: int = 240
) -> Dict[str, float]:
    """Median stroke-vs-paper contrast over the sampled glyph regions."""
    if not boxes:
        return {"medianContrast": 0.0, "minContrast": 0.0, "samples": 0}

    ratios: List[float] = []
    step = max(1, len(boxes) // sample_limit)
    for box in boxes[::step]:
        x0 = int(box[0][0])
        y0 = int(box[0][1])
        x1 = int(box[1][0])
        y1 = int(box[1][1])
        if x1 - x0 < 2 or y1 - y0 < 2:
            continue
        crop = gray[y0:y1, x0:x1]
        if crop.size == 0:
            continue
        dark = float(np.percentile(crop, 5))
        light = float(np.percentile(crop, 95))
        if light - dark < 1e-6:
            continue
        # Contrast ratio between the light and dark populations.
        ratio = (light + 5.0) / (dark + 5.0)
        ratios.append(ratio)

    if not ratios:
        return {"medianContrast": 0.0, "minContrast": 0.0, "samples": 0}

    return {
        "medianContrast": round(float(np.median(ratios)), 3),
        "minContrast": round(float(np.percentile(ratios, 10)), 3),
        "samples": len(ratios),
    }


def analyse(image: np.ndarray) -> Dict[str, Any]:
    """
    Assess how readable the printed labels on a sheet are likely to be.

    The result is advisory. ``legible`` false means "labels will probably
    not be read", never "this image cannot be used".
    """
    if image is None or image.size == 0:
        return {
            "legible": False,
            "reason": "NO_IMAGE",
            "metrics": {},
            "recommendedMinWidth": 3000,
        }

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    h, w = gray.shape[:2]

    boxes, comp_stats = _text_like_components(gray)
    contrast = _contrast_estimate(gray, boxes)

    lap = cv2.Laplacian(gray, cv2.CV_64F)
    blur_var = float(lap.var())

    median_height = comp_stats.get("medianHeightPx", 0.0)
    median_contrast = contrast.get("medianContrast", 0.0)

    reasons: List[str] = []
    if comp_stats.get("componentCount", 0) < 12:
        reasons.append("NO_LABEL_MASS")
    if median_height and median_height < 7.0:
        reasons.append("GLYPHS_TOO_SMALL")
    if median_contrast and median_contrast < 2.2:
        reasons.append("CONTRAST_TOO_LOW")
    if blur_var < 12.0:
        reasons.append("IMAGE_BLURRY")

    # A recommended width, derived from the observed glyph height. This is a
    # recommendation for the operator, never a promise of OCR success.
    if median_height > 0:
        scale_needed = 18.0 / median_height
        recommended = int(min(12000, max(1200, round(w * scale_needed))))
    else:
        recommended = 3000

    legible = len(reasons) == 0
    return {
        "legible": legible,
        "reason": "OK" if legible else ";".join(reasons),
        "reasons": reasons,
        "recommendedMinWidth": recommended,
        "metrics": {
            "imageWidth": int(w),
            "imageHeight": int(h),
            "medianGlyphHeightPx": round(median_height, 2),
            "medianContrast": median_contrast,
            "minContrast": contrast.get("minContrast", 0.0),
            "labelComponentCount": comp_stats.get("componentCount", 0),
            "blurVariance": round(blur_var, 2),
            "contrastSamples": contrast.get("samples", 0),
        },
    }
