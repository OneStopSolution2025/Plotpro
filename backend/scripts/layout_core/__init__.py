"""
layout_core — shared geometry / polygon utilities for PlotPro layout detection.

All coordinates are normalised to the 0..100 canvas space used by the
PlotPro frontend (0 = left/top of the source image, 100 = right/bottom).

Nothing in this package mutates database state; it is pure image analysis.
"""

from .geometry import (
    polygon_area,
    polygon_centroid,
    polygon_is_simple,
    bbox_of_points,
    bbox_iou,
    polygon_iou,
    containment_ratio,
    normalise_points,
    validate_polygon,
    dedupe_points,
)

__all__ = [
    "polygon_area",
    "polygon_centroid",
    "polygon_is_simple",
    "bbox_of_points",
    "bbox_iou",
    "polygon_iou",
    "containment_ratio",
    "normalise_points",
    "validate_polygon",
    "dedupe_points",
]
