#!/usr/bin/env python3
"""
make_fixtures.py — generates synthetic site-plan fixtures with exact ground truth.

Why synthetic fixtures
----------------------
Hand-annotating a real plan is error prone and its ground truth cannot be
regenerated. Synthetic plans let us state the truth exactly, and let us
produce one fixture per failure mode that matters:

* ``axis_aligned``  — clean baseline, sharp labels.
* ``rotated``       — the whole plan rotated, to exercise deskew and the
                      round-trip of the coordinate transform.
* ``faint_grid``    — low contrast plus a background sheet grid, which is
                      what produced the 9x over-detection on the real plan.
* ``large_blocks``  — blocks containing several parcels, separated by thin
                      internal dividers, to exercise block subdivision.
* ``complex``       — road corridor, vegetation patch overlapping a genuine
                      boundary, legend box, dimension annotations, compass,
                      to exercise false-positive suppression.

Ground truth is written next to each image as ``<name>.json`` in the
annotation format consumed by ``score_detection.py``.
"""

import json
import math
import os
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np


# --------------------------------------------------------------------------
# plan definition
# --------------------------------------------------------------------------

def build_plan() -> Dict[str, Any]:
    """
    Define a small but representative layout in world coordinates.

    World units are pixels in an unrotated sheet of 1600 x 1100.
    """
    plots: List[Dict[str, Any]] = []
    blocks: List[Dict[str, Any]] = []
    texts: List[Dict[str, Any]] = []

    # Block grid: 3 columns x 2 rows, separated by road corridors.
    block_w, block_h = 380, 380
    plot_gap = 12
    origins = [(150, 140), (150, 640), (700, 140), (700, 640)]

    plot_index = 1
    for block_i, (ox, oy) in enumerate(origins):
        block_id = f"D-{13 + block_i}"
        blocks.append({"id": block_id, "x": ox, "y": oy, "w": block_w, "h": block_h})

        # Each block holds 3 parcels separated by thin dividers.
        inner_x = ox + plot_gap
        inner_y = oy + plot_gap
        inner_w = block_w - 2 * plot_gap
        inner_h = block_h - 2 * plot_gap
        divider_x = [inner_x + inner_w / 3.0, inner_x + 2.0 * inner_w / 3.0]
        xs = [inner_x] + divider_x + [inner_x + inner_w]

        for p in range(3):
            x0, x1 = xs[p], xs[p + 1]
            y0, y1 = inner_y, inner_y + inner_h
            number = f"{plot_index}/{plot_index + 11}"
            plots.append(
                {
                    "plotNumber": number,
                    "block": block_id,
                    "points": [
                        {"x": x0, "y": y0},
                        {"x": x1, "y": y0},
                        {"x": x1, "y": y1},
                        {"x": x0, "y": y1},
                    ],
                    "labelPosition": {"x": (x0 + x1) / 2.0, "y": (y0 + y1) / 2.0},
                }
            )
            texts.append(
                {
                    "text": number,
                    "x": (x0 + x1) / 2.0,
                    "y": (y0 + y1) / 2.0,
                    "size": 0.42,
                    "role": "plot_label",
                }
            )
            plot_index += 1

        # Block label along the block's top edge.
        texts.append(
            {
                "text": block_id,
                "x": ox + block_w / 2.0,
                "y": oy - 14,
                "size": 0.5,
                "role": "block_label",
            }
        )

    return {
        "width": 1600,
        "height": 1100,
        "plots": plots,
        "blocks": blocks,
        "texts": texts,
    }


# --------------------------------------------------------------------------
# rendering
# --------------------------------------------------------------------------

def _rotate_point(x: float, y: float, M: np.ndarray) -> Tuple[float, float]:
    return (
        float(M[0, 0] * x + M[0, 1] * y + M[0, 2]),
        float(M[1, 0] * x + M[1, 1] * y + M[1, 2]),
    )


def render(
    plan: Dict[str, Any],
    *,
    angle_deg: float = 0.0,
    scale: float = 1.0,
    background_grid: bool = False,
    faint: bool = False,
    with_roads: bool = False,
    with_vegetation: bool = False,
    with_annotations: bool = False,
    sheet_pad: int = 90,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Render the plan and return ``(image, ground_truth)``.

    Ground truth polygons are transformed with exactly the same matrix that
    is applied to the drawing, so they are correct by construction.
    """
    W, H = plan["width"], plan["height"]
    canvas_w = int(W * scale) + 2 * sheet_pad
    canvas_h = int(H * scale) + 2 * sheet_pad

    paper = 252 if not faint else 248
    image = np.full((canvas_h, canvas_w, 3), paper, np.uint8)

    # Build the transform: scale, then rotate about the sheet centre, then
    # translate into the padded canvas.
    centre = (W * scale / 2.0, H * scale / 2.0)
    M = cv2.getRotationMatrix2D(centre, angle_deg, scale)
    M[0, 2] += sheet_pad
    M[1, 2] += sheet_pad

    line_color = (70, 70, 70) if not faint else (150, 150, 150)
    fill_color = (238, 246, 252) if not faint else (246, 249, 252)
    text_color = (40, 40, 40) if not faint else (128, 128, 128)

    # Background sheet grid.
    if background_grid:
        grid_color = (215, 215, 215) if not faint else (228, 228, 228)
        step = int(80 * scale)
        for gx in range(0, canvas_w, step):
            cv2.line(image, (gx, 0), (gx, canvas_h), grid_color, 1)
        for gy in range(0, canvas_h, step):
            cv2.line(image, (0, gy), (canvas_w, gy), grid_color, 1)

    # Road corridor on the right-hand side.
    if with_roads:
        road_x = int(1330 * scale) + sheet_pad
        road_w = int(150 * scale)
        road = np.full((canvas_h, road_w, 3), 205 if not faint else 222, np.uint8)
        image[:, road_x : road_x + road_w] = road
        cv2.line(image, (road_x, 0), (road_x, canvas_h), line_color, 2)
        cv2.line(image, (road_x + road_w, 0), (road_x + road_w, canvas_h), line_color, 2)

    # Block enclosures with a pale fill.
    for block in plan["blocks"]:
        corners = np.array(
            [
                [block["x"], block["y"]],
                [block["x"] + block["w"], block["y"]],
                [block["x"] + block["w"], block["y"] + block["h"]],
                [block["x"], block["y"] + block["h"]],
            ],
            dtype=np.float32,
        )
        transformed = cv2.transform(corners.reshape(-1, 1, 2), M).reshape(-1, 2)
        cv2.fillPoly(image, [transformed.astype(np.int32)], fill_color)
        cv2.polylines(image, [transformed.astype(np.int32)], True, line_color, 3)

    # Individual plots: fill, thin outline, thin internal dividers.
    for plot in plan["plots"]:
        corners = np.array(
            [[p["x"], p["y"]] for p in plot["points"]], dtype=np.float32
        )
        transformed = cv2.transform(corners.reshape(-1, 1, 2), M).reshape(-1, 2)
        cv2.fillPoly(image, [transformed.astype(np.int32)], fill_color)
        cv2.polylines(image, [transformed.astype(np.int32)], True, line_color, 2)

    # Vegetation patch that deliberately overlaps a genuine boundary.
    if with_vegetation:
        vx, vy = int(700 * scale) + sheet_pad, int(520 * scale) + sheet_pad
        cv2.circle(image, (vx, vy), int(52 * scale), (150, 190, 140), -1)
        cv2.circle(image, (vx + int(18 * scale), vy - int(10 * scale)),
                   int(30 * scale), (140, 185, 132), -1)

    # Labels.
    for text in plan["texts"]:
        px, py = _rotate_point(text["x"], text["y"], M)
        font_scale = text["size"] * scale
        (tw, th), _ = cv2.getTextSize(text["text"], cv2.FONT_HERSHEY_SIMPLEX, font_scale, 1)
        # The text is drawn along the plan, so rotate the glyph too.
        _draw_rotated_text(
            image, text["text"], (px, py), font_scale, text_color, angle_deg
        )

    # Annotation noise: dimensions, legend, compass.
    # These are placed in areas that do NOT overlap a plot, so the ground
    # truth stays valid.
    if with_annotations:
        _draw_rotated_text(
            image,
            "1200 SQ.FT",
            (int(1150 * scale) + sheet_pad, int(700 * scale) + sheet_pad),
            0.4 * scale,
            (120, 120, 120),
            angle_deg,
        )
        _draw_rotated_text(
            image,
            "30x40",
            (int(1150 * scale) + sheet_pad, int(730 * scale) + sheet_pad),
            0.4 * scale,
            (120, 120, 120),
            angle_deg,
        )
        # Legend box in the empty top-left corner.
        lx, ly = 40, 40
        cv2.rectangle(image, (lx, ly), (lx + 330, ly + 160), (250, 250, 250), -1)
        cv2.rectangle(image, (lx, ly), (lx + 330, ly + 160), (90, 90, 90), 2)
        for i, row in enumerate(["LEGEND", "PLOT BOUNDARY", "ROAD", "PARK"]):
            _draw_rotated_text(
                image, row, (lx + 18, ly + 34 + i * 32), 0.42, (70, 70, 70), 0
            )
        # Compass rose.
        cx, cy = int(canvas_w - 120), 120
        cv2.circle(image, (cx, cy), 46, (90, 90, 90), 2)
        cv2.arrowedLine(image, (cx, cy + 32), (cx, cy - 32), (60, 60, 60), 3)
        _draw_rotated_text(image, "N", (cx - 8, cy - 46), 0.5, (60, 60, 60), 0)

    # Ground truth in normalised coordinates of the rendered image.
    gt_plots = []
    for plot in plan["plots"]:
        pts = []
        for p in plot["points"]:
            x, y = _rotate_point(p["x"], p["y"], M)
            pts.append(
                {"x": round(x / canvas_w * 100.0, 4), "y": round(y / canvas_h * 100.0, 4)}
            )
        lx, ly = _rotate_point(plot["labelPosition"]["x"], plot["labelPosition"]["y"], M)
        gt_plots.append(
            {
                "plotNumber": plot["plotNumber"],
                "block": plot["block"],
                "points": pts,
                "labelPosition": {
                    "x": round(lx / canvas_w * 100.0, 4),
                    "y": round(ly / canvas_h * 100.0, 4),
                },
            }
        )

    gt_blocks = []
    for block in plan["blocks"]:
        corners = []
        for (bx, by) in [
            (block["x"], block["y"]),
            (block["x"] + block["w"], block["y"]),
            (block["x"] + block["w"], block["y"] + block["h"]),
            (block["x"], block["y"] + block["h"]),
        ]:
            x, y = _rotate_point(bx, by, M)
            corners.append(
                {"x": round(x / canvas_w * 100.0, 4), "y": round(y / canvas_h * 100.0, 4)}
            )
        gt_blocks.append({"name": block["id"], "points": corners})

    ground_truth = {
        "image": os.path.basename(""),
        "imageWidth": canvas_w,
        "imageHeight": canvas_h,
        "rotationAppliedDeg": angle_deg,
        "plots": gt_plots,
        "blocks": gt_blocks,
        "legend": [
            "Synthetic fixture produced by make_fixtures.py.",
            "Ground truth is exact by construction (same transform applied to the drawing).",
        ],
    }
    return image, ground_truth


def _draw_rotated_text(
    image: np.ndarray,
    text: str,
    centre: Tuple[float, float],
    font_scale: float,
    color: Tuple[int, int, int],
    angle_deg: float,
) -> None:
    """Draw text rotated with the plan, centred on ``centre``."""
    (tw, th), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 1)
    size = max(tw, th) + 12
    layer = np.zeros((size * 2, size * 2, 3), np.uint8)
    cv2.putText(
        layer,
        text,
        (size // 2 - tw // 2, size // 2 + th // 2),
        cv2.FONT_HERSHEY_SIMPLEX,
        font_scale,
        color,
        1,
        cv2.LINE_AA,
    )
    if abs(angle_deg) > 0.01:
        rot = cv2.getRotationMatrix2D((size / 2.0, size / 2.0), angle_deg, 1.0)
        layer = cv2.warpAffine(
            layer, rot, (size * 2, size * 2), flags=cv2.INTER_CUBIC, borderValue=(0, 0, 0)
        )
    x = int(centre[0] - size)
    y = int(centre[1] - size)
    region = image[y : y + size * 2, x : x + size * 2]
    if region.shape[:2] != layer.shape[:2]:
        return
    mask = cv2.cvtColor(layer, cv2.COLOR_BGR2GRAY)
    _th, mask = cv2.threshold(mask, 1, 255, cv2.THRESH_BINARY)
    image[y : y + size * 2, x : x + size * 2] = np.where(
        mask[:, :, None] > 0, layer, region
    )


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------

FIXTURES = {
    "axis_aligned": dict(angle_deg=0.0, background_grid=False, faint=False),
    "rotated_12deg": dict(angle_deg=12.0, background_grid=False, faint=False),
    "faint_grid": dict(angle_deg=0.0, background_grid=True, faint=True),
    "large_blocks": dict(angle_deg=0.0, background_grid=False, faint=False,
                         with_roads=True),
    "complex": dict(angle_deg=0.0, background_grid=True, faint=False,
                    with_roads=True, with_vegetation=True, with_annotations=True),
}


def main() -> None:
    out_dir = os.path.dirname(os.path.abspath(__file__))
    images_dir = os.path.join(out_dir, "images")
    truth_dir = os.path.join(out_dir, "ground_truth")
    os.makedirs(images_dir, exist_ok=True)
    os.makedirs(truth_dir, exist_ok=True)

    plan = build_plan()
    for name, options in FIXTURES.items():
        image, truth = render(plan, **options)
        image_path = os.path.join(images_dir, f"{name}.png")
        truth_path = os.path.join(truth_dir, f"{name}.json")
        cv2.imwrite(image_path, image)
        truth["image"] = f"{name}.png"
        with open(truth_path, "w", encoding="utf-8") as fh:
            json.dump(truth, fh, indent=2)
        print(f"wrote {image_path} ({image.shape[1]}x{image.shape[0]}) and {truth_path}")


if __name__ == "__main__":
    main()
