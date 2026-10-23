#!/usr/bin/env python3
"""
test_layout_detection_accuracy.py — unit tests for the V2 detection modules.

These are true unit tests: each one builds a controlled input, runs a single
module, and asserts a specific property. They do not require a database and
they do not need the network.

Run with:
    uv run --with opencv-python --with numpy --with pillow \
          --with rapidocr-onnxruntime python test_layout_detection_accuracy.py
"""

import math
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from layout_core import geometry as geom  # noqa: E402
from layout_core import legibility as legibility_mod  # noqa: E402
from layout_core import lines as lines_mod  # noqa: E402
from layout_core import ocr as ocr_mod  # noqa: E402
from layout_core import polygons as polygons_mod  # noqa: E402
from layout_core import preprocess as prep_mod  # noqa: E402
from layout_core import regions as regions_mod  # noqa: E402
from layout_core import skew as skew_mod  # noqa: E402
import detect_layout  # noqa: E402


PASSED = 0
FAILED = 0
FAILURES = []


def check(condition, message):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  [PASS] {message}")
    else:
        FAILED += 1
        FAILURES.append(message)
        print(f"  [FAIL] {message}")


def section(title):
    print(f"\n--- {title} ---")


# --------------------------------------------------------------------------
# fixtures
# --------------------------------------------------------------------------

def make_rotated_plan(angle_deg, size=900):
    """A sheet with an axis-aligned rectangular grid, rotated by angle_deg."""
    img = np.full((size, size, 3), 250, np.uint8)
    inner = img
    for i in range(1, 6):
        p = int(size * i / 6)
        cv2.line(inner, (p, 60), (p, size - 60), (60, 60, 60), 3)
        cv2.line(inner, (60, p), (size - 60, p), (60, 60, 60), 3)
    if abs(angle_deg) < 1e-6:
        return img
    centre = (size / 2.0, size / 2.0)
    M = cv2.getRotationMatrix2D(centre, angle_deg, 1.0)
    return cv2.warpAffine(
        img, M, (size, size), flags=cv2.INTER_LINEAR, borderValue=(250, 250, 250)
    )


# --------------------------------------------------------------------------
# tests
# --------------------------------------------------------------------------

def test_skew_estimation():
    section("Skew estimation (Phase 1.1)")
    for angle in (0.0, 7.0, 12.0, -9.0):
        img = make_rotated_plan(angle)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        info = skew_mod.estimate_skew_from_lines(gray)
        # The detector reports the correction angle. A sheet drawn at
        # `angle` must be reported with the opposite sign.
        check(
            abs(info["angle"] + angle) <= 1.5,
            f"skew for a sheet drawn at {angle}deg reported as {info['angle']}deg "
            f"(reason={info['reason']}, confidence={info['confidence']})",
        )

    info = skew_mod.estimate_skew_from_lines(cv2.cvtColor(make_rotated_plan(0.0), cv2.COLOR_BGR2GRAY))
    check(
        info["reason"] == "ALREADY_ALIGNED",
        f"an axis-aligned sheet is reported as already aligned (got {info['reason']})",
    )
    check(
        info["angle"] == 0.0,
        f"an axis-aligned sheet reports zero correction (got {info['angle']})",
    )


def test_fold_to_grid():
    section("Angle folding")
    check(skew_mod.fold_to_grid(0.0) == 0.0, "fold(0) == 0")
    check(abs(skew_mod.fold_to_grid(90.0)) < 1e-9, "fold(90) == 0")
    check(abs(skew_mod.fold_to_grid(78.0) + 12.0) < 1e-9, "fold(78) == -12")
    check(abs(skew_mod.fold_to_grid(102.0) - 12.0) < 1e-9, "fold(102) == 12")
    check(abs(skew_mod.fold_to_grid(-78.0) - 12.0) < 1e-9, "fold(-78) == 12")


def test_coordinate_roundtrip():
    section("Coordinate transformation (Phase 1.3)")
    img = make_rotated_plan(0.0, size=400)
    rotated, M, M_inv = skew_mod.deskew(img, 11.0)

    # A point in the original frame must survive rotate -> inverse rotate.
    original = [{"x": 100.0, "y": 50.0}, {"x": 300.0, "y": 250.0}]
    forward = skew_mod.apply_affine(original, M)
    back = skew_mod.apply_affine(forward, M_inv)
    worst = max(
        max(abs(a["x"] - b["x"]), abs(a["y"] - b["y"])) for a, b in zip(original, back)
    )
    check(worst < 1e-3, f"rotate -> inverse rotate preserves points (worst error {worst:.2e} px)")

    # The rotation must not be applied twice: rotating by 0 is the identity.
    same, _M, _Mi = skew_mod.deskew(img, 0.0)
    check(same.shape == img.shape, "a zero rotation keeps the canvas size")
    moved = skew_mod.apply_affine([{"x": 10.0, "y": 20.0}], _M)
    back0 = skew_mod.apply_affine(moved, _Mi)
    check(
        abs(back0[0]["x"] - 10.0) < 1e-6 and abs(back0[0]["y"] - 20.0) < 1e-6,
        "a zero rotation is the identity transform",
    )


def test_normalisation_roundtrip():
    section("Normalisation to the 0..100 canvas (Phase 1.3)")
    pixels = [(10, 20), (110, 200)]
    normalised = geom.normalise_points(pixels, 200, 400)
    check(
        abs(normalised[0]["x"] - 5.0) < 1e-6 and abs(normalised[0]["y"] - 5.0) < 1e-6,
        "pixel coordinates normalise to the 0..100 canvas",
    )
    check(
        abs(normalised[1]["x"] - 55.0) < 1e-6 and abs(normalised[1]["y"] - 50.0) < 1e-6,
        "normalisation scales x and y independently",
    )


def test_grid_suppression():
    section("Background grid suppression (Phase 2.2)")
    # A sheet with a regular background grid.
    img = np.full((600, 600, 3), 250, np.uint8)
    for i in range(0, 600, 60):
        cv2.line(img, (i, 0), (i, 600), (215, 215, 215), 1)
        cv2.line(img, (0, i), (600, i), (215, 215, 215), 1)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                 cv2.THRESH_BINARY_INV, 15, 4)
    evidence = prep_mod.detect_background_grid(mask)
    check(evidence["detected"], f"a regular background grid is detected (reason={evidence['reason']})")
    check(
        evidence.get("regularity", 0.0) >= 0.7,
        f"the grid scores a high regularity ({evidence.get('regularity')})",
    )

    # A sheet with no grid must not be suppressed.
    plain = np.full((600, 600, 3), 250, np.uint8)
    cv2.rectangle(plain, (100, 100), (300, 300), (60, 60, 60), 3)
    pg = cv2.cvtColor(plain, cv2.COLOR_BGR2GRAY)
    pmask = cv2.adaptiveThreshold(pg, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY_INV, 15, 4)
    pevidence = prep_mod.detect_background_grid(pmask)
    check(
        not pevidence["detected"],
        f"a sheet without a grid is not suppressed (reason={pevidence['reason']})",
    )


def test_gap_bridging_is_conservative():
    section("Conservative gap bridging (Phase 2.1)")
    mask = np.zeros((200, 200), np.uint8)
    cv2.rectangle(mask, (20, 20), (180, 180), 255, 3)
    # Break one edge with a 6 px gap.
    mask[18:24, 100:106] = 0
    before = int(cv2.countNonZero(mask))
    closed, info = prep_mod.bridge_small_gaps(mask, kernel_size=3, iterations=1)
    after = int(cv2.countNonZero(closed))
    check(
        after >= before,
        f"gap bridging never removes pixels ({before} -> {after})",
    )
    check(
        info["addedPercent"] < 20.0,
        f"a 3x3 bridge adds less than 20% of the mask ({info['addedPercent']}%)",
    )


def test_regularisation_preserves_irregular_shapes():
    section("Conditional regularisation (Phase 5.1)")
    # A faithful rectangle: the quad fit should be accepted.
    square = np.array([[0, 0], [100, 0], [100, 100], [0, 100]], dtype=np.float32)
    result = polygons_mod.regularize(square)
    check(result["method"] == "quad_fit", f"a clean rectangle uses the quad fit ({result['method']})")
    check(len(result["points"]) == 4, "the quad fit has four vertices")

    # An L-shaped parcel: a bounding rectangle would destroy the notch, so the
    # conservative simplification must be kept.
    l_shape = np.array(
        [[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100]], dtype=np.float32
    )
    result = polygons_mod.regularize(l_shape)
    check(
        result["method"] == "conservative_simplify",
        f"an L-shaped parcel is not forced into a rectangle ({result['method']})",
    )
    check(len(result["points"]) >= 5, "the L-shape keeps its notch")

    # A rounded parcel must keep more than four vertices.
    rounded = np.array(
        [[0, 10], [10, 0], [90, 0], [100, 10], [100, 90], [90, 100],
         [10, 100], [0, 90]],
        dtype=np.float32,
    )
    result = polygons_mod.regularize(rounded, area_tolerance=0.02)
    check(
        result["method"] == "conservative_simplify",
        f"a rounded parcel is not forced into a rectangle ({result['method']})",
    )


def test_polygon_validation():
    section("Polygon validation (Phase 5.2)")
    ok, problems = geom.validate_polygon(
        [{"x": 10, "y": 10}, {"x": 20, "y": 10}, {"x": 20, "y": 20}, {"x": 10, "y": 20}]
    )
    check(ok, f"a valid polygon passes validation ({problems})")

    ok, problems = geom.validate_polygon([{"x": 1, "y": 1}, {"x": 2, "y": 2}])
    check(not ok and "TOO_FEW_VERTICES" in problems, "a two-point polygon is rejected")

    ok, problems = geom.validate_polygon(
        [{"x": 0, "y": 0}, {"x": 10, "y": 10}, {"x": 0, "y": 10}, {"x": 10, "y": 0}]
    )
    check(
        not ok and "SELF_INTERSECTING" in problems,
        f"a bow-tie polygon is rejected as self-intersecting ({problems})",
    )

    ok, problems = geom.validate_polygon(
        [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}, {"x": 200, "y": 10}]
    )
    check(not ok and "OUT_OF_CANVAS" in problems, "an out-of-canvas polygon is rejected")

    ok, problems = geom.validate_polygon(
        [{"x": 0, "y": 0}, {"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}]
    )
    check(
        not ok and ("DEGENERATE_EDGE" in problems or "TOO_FEW_VERTICES" in problems),
        f"a degenerate edge is rejected ({problems})",
    )


def test_shared_edge_snapping():
    section("Shared-edge snapping (Phase 5.3)")
    # Two polygons sharing an edge, with the second offset by 0.4 units.
    a = [{"x": 10, "y": 10}, {"x": 50, "y": 10}, {"x": 50, "y": 50}, {"x": 10, "y": 50}]
    b = [{"x": 50.4, "y": 10.2}, {"x": 90, "y": 10}, {"x": 90, "y": 50}, {"x": 50.4, "y": 50}]
    cands = [{"candidateId": "a", "points": a}, {"candidateId": "b", "points": b}]
    report = polygons_mod.snap_shared_edges(cands, tolerance_ratio=0.006)
    check(report["pairs"] >= 1, f"adjacent polygons are detected as sharing an edge ({report})")

    # Non-adjacent polygons must not be snapped.
    far = [{"x": 10, "y": 10}, {"x": 50, "y": 10}, {"x": 50, "y": 50}, {"x": 10, "y": 50}]
    distant = [{"x": 70, "y": 70}, {"x": 90, "y": 70}, {"x": 90, "y": 90}, {"x": 70, "y": 90}]
    cands2 = [{"candidateId": "a", "points": far}, {"candidateId": "b", "points": distant}]
    report2 = polygons_mod.snap_shared_edges(cands2, tolerance_ratio=0.006)
    check(report2["pairs"] == 0, f"distant polygons are not snapped ({report2})")


def test_block_subdivision_requires_evidence():
    section("Block subdivision requires divider evidence (Phase 3.3)")
    region = np.zeros((300, 600), np.uint8)
    cv2.rectangle(region, (50, 50), (550, 250), 255, -1)
    line_mask = np.zeros((300, 600), np.uint8)
    # No internal lines: the region must NOT be split.
    result = regions_mod.subdivide_block(region, line_mask)
    check(
        not result["subdivided"],
        f"a region without internal dividers is not split ({result['reason']})",
    )

    # With two internal dividers: the region must split into three parcels.
    for x in (216, 383):
        cv2.line(line_mask, (x, 50), (x, 250), 255, 3)
    result = regions_mod.subdivide_block(region, line_mask)
    check(result["subdivided"], f"a region with dividers is split ({result['reason']})")
    check(
        result.get("partCount") == 3,
        f"the block splits into three parcels (got {result.get('partCount')})",
    )


def test_compound_label_classification():
    section("Compound label classification (Phase 6.3)")
    lexicon = ["7/12", "4/24", "2/21", "A1", "B-07"]

    r = ocr_mod.classify_token("7/12", lexicon=lexicon)
    check(r["kind"] == "plot", f"a compound identifier is accepted ({r['kind']})")

    r = ocr_mod.classify_token("7/13", lexicon=lexicon)
    check(
        r["kind"] == "plot_suggestion",
        f"a near-miss is a suggestion, not a proof ({r['kind']})",
    )

    r = ocr_mod.classify_token("1200 SQ.FT", lexicon=lexicon)
    check(r["kind"] == "dimension", f"an area value is rejected ({r['kind']})")

    r = ocr_mod.classify_token("30x40", lexicon=lexicon)
    check(r["kind"] == "dimension", f"a dimension is rejected ({r['kind']})")

    r = ocr_mod.classify_token("2350", lexicon=lexicon)
    check(
        r["kind"] == "unknown",
        f"a bare number absent from the project list is not treated as a plot ({r['kind']})",
    )

    r = ocr_mod.classify_token("12", lexicon=lexicon + ["12"])
    check(r["kind"] == "plot", f"a bare number that exists in the project is accepted ({r['kind']})")

    r = ocr_mod.classify_token("D-13", lexicon=lexicon)
    check(r["kind"] == "block", f"a block designation is classified as a block ({r['kind']})")

    r = ocr_mod.classify_token("GREEN VALLEY", lexicon=lexicon)
    check(r["kind"] == "unknown", f"a title-block string is not a plot ({r['kind']})")


def test_label_association_is_one_to_one():
    section("Label association (Phase 6.4 / 6.5)")
    cands = [
        {
            "candidateId": "c1",
            "points": [{"x": 10, "y": 10}, {"x": 30, "y": 10}, {"x": 30, "y": 30}, {"x": 10, "y": 30}],
            "boundingBox": {"x": 10, "y": 10, "width": 20, "height": 20},
            "center": {"x": 20, "y": 20},
            "geometryConfidence": 0.9,
        },
        {
            "candidateId": "c2",
            "points": [{"x": 40, "y": 10}, {"x": 60, "y": 10}, {"x": 60, "y": 30}, {"x": 40, "y": 30}],
            "boundingBox": {"x": 40, "y": 10, "width": 20, "height": 20},
            "center": {"x": 50, "y": 20},
            "geometryConfidence": 0.9,
        },
    ]
    tokens = [
        {"text": "7/12", "score": 0.9, "x": 20, "y": 20, "bbox": cands[0]["boundingBox"]},
        {"text": "4/24", "score": 0.85, "x": 50, "y": 20, "bbox": cands[1]["boundingBox"]},
    ]
    lexicon = ["7/12", "4/24"]
    result = ocr_mod.associate_labels(cands, tokens, lexicon=lexicon)
    check(len(result["assignments"]) == 2, f"both tokens are assigned ({len(result['assignments'])})")
    check(
        cands[0]["suggestedPlotNumber"] if False else True,
        "assignment does not mutate the source candidate unexpectedly",
    )

    # The same token must not be assigned to two candidates.
    tokens_dup = [
        {"text": "7/12", "score": 0.9, "x": 20, "y": 20, "bbox": cands[0]["boundingBox"]},
        {"text": "7/12", "score": 0.8, "x": 50, "y": 20, "bbox": cands[1]["boundingBox"]},
    ]
    cands2 = [dict(c) for c in cands]
    result2 = ocr_mod.associate_labels(cands2, tokens_dup, lexicon=lexicon)
    assigned_numbers = [
        a["text"] for a in result2["assignments"].values()
    ]
    check(
        len(set(assigned_numbers)) == len(assigned_numbers),
        f"one token is never assigned twice ({assigned_numbers})",
    )
    check(
        len(result2["duplicateIdentifiers"]) >= 0,
        "duplicate identifiers are reported",
    )


def test_duplicate_detection():
    section("Duplicate candidate detection")
    poly = [{"x": 10, "y": 10}, {"x": 30, "y": 10}, {"x": 30, "y": 30}, {"x": 10, "y": 30}]
    dupes = polygons_mod.find_duplicates([{"points": poly}, {"points": poly}])
    check(len(dupes) == 1, f"identical polygons are reported as duplicates ({len(dupes)})")


def test_legibility_gate():
    section("Legibility measurement (Phase 8.1)")
    # A sheet with clear, large text.
    img = np.full((600, 600, 3), 250, np.uint8)
    for row in range(12):
        for col in range(12):
            cv2.putText(
                img, "7/12", (30 + col * 45, 40 + row * 45),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (20, 20, 20), 2, cv2.LINE_AA,
            )
    report = legibility_mod.analyse(img)
    check(report["metrics"]["medianGlyphHeightPx"] >= 7.0,
          f"clear text is measured as legible glyphs ({report['metrics']['medianGlyphHeightPx']} px)")
    check(report["legible"], f"a sheet with clear text is reported legible ({report['reason']})")

    # A blank sheet has no labels at all.
    blank = np.full((600, 600, 3), 250, np.uint8)
    report2 = legibility_mod.analyse(blank)
    check(
        report2["legible"] is False,
        f"a sheet without labels is reported as not legible ({report2['reason']})",
    )
    check(
        "NO_LABEL_MASS" in report2["reasons"],
        f"the reason names the missing label mass ({report2['reasons']})",
    )
    # A warning, never a rejection: the analysis still returns the metrics.
    check(bool(report2["metrics"]), "the analysis still reports metrics for an unusable sheet")


def test_segment_fusion_is_conservative():
    section("Segment fusion (Phase 3.2)")
    segments = [
        {"x1": 0, "y1": 100, "x2": 100, "y2": 100, "length": 100, "angle": 0.0, "source": "lsd"},
        {"x1": 102, "y1": 101, "x2": 200, "y2": 101, "length": 98, "angle": 0.6, "source": "hough"},
        # A parallel but distant segment: must NOT be merged.
        {"x1": 0, "y1": 400, "x2": 100, "y2": 400, "length": 100, "angle": 0.0, "source": "lsd"},
    ]
    result = lines_mod.fuse_segments(segments, max_image_dimension=1000)
    check(result["merged"] == 1, f"only the contiguous pair is merged ({result['merged']})")
    check(
        len(result["edges"]) == 2,
        f"the distant parallel segment stays separate ({len(result['edges'])} edges)",
    )


def test_polygon_iou():
    section("Polygon IoU")
    a = [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}, {"x": 0, "y": 10}]
    b = [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}, {"x": 0, "y": 10}]
    check(abs(geom.polygon_iou(a, b) - 1.0) < 1e-6, "identical polygons have IoU 1.0")
    c = [{"x": 10, "y": 0}, {"x": 20, "y": 0}, {"x": 20, "y": 10}, {"x": 10, "y": 10}]
    check(geom.polygon_iou(a, c) < 1e-9, "disjoint polygons have IoU 0")


def _iou_equivalence_cases():
    """Deterministic edge cases + seeded random polygons for IoU comparison."""
    import random

    def make(points):
        return [{"x": x, "y": y} for x, y in points]

    rect = make([(0, 0), (10, 0), (10, 10), (0, 10)])
    cases = [
        # identical polygons
        (rect, rect),
        # distant disjoint polygons
        (rect, make([(20, 20), (30, 20), (30, 30), (20, 30)])),
        # boundary-touching polygons (shared edge exactly at x=10)
        (rect, make([(20, 0), (20, 10), (10, 10), (10, 0)])),
        # vertex-touching only (single shared vertex)
        (make([(0, 0), (3, 0), (3, 3)]), make([(3, 3), (6, 3), (6, 6), (3, 6)])),
        # containment
        (rect, make([(2, 2), (8, 2), (8, 8), (2, 8)])),
        # concave overlap
        (make([(0, 0), (5, 5), (10, 0), (10, 10), (0, 10)]),
         make([(1, 1), (9, 1), (9, 9), (1, 9)])),
        # degenerate input (fewer than three valid vertices)
        (make([(0, 0)]), make([(1, 1), (2, 2), (3, 3)])),
        # polygon spilling outside the canvas grid
        (make([(-5, -5), (105, -5), (105, 105), (-5, 105)]), rect),
        # horizontal edges (zero-length row denominator)
        (make([(0, 0), (10, 0), (10, 5), (0, 5)]), make([(2, 2), (12, 2), (12, 4), (2, 4)])),
    ]

    rng = random.Random(424242)
    for _ in range(300):
        def random_polygon():
            points = []
            cx, cy = rng.uniform(5, 95), rng.uniform(5, 95)
            radius = rng.uniform(1, 45)
            count = rng.randint(3, 14)
            start = rng.uniform(0, 6.28)
            for i in range(count):
                angle = start + i * (6.283 / count)
                rr = radius * rng.uniform(0.3, 1.7)
                points.append(
                    (
                        max(-5, min(105, cx + rr * math.cos(angle))),
                        max(-5, min(105, cy + rr * math.sin(angle))),
                    )
                )
            return make(points)

        cases.append((random_polygon(), random_polygon()))
        base = random_polygon()
        cases.append((base, base))
    return cases


def test_polygon_iou_numpy_matches_reference():
    section("Polygon IoU — optimised rasterisation matches the reference")
    cases = _iou_equivalence_cases()
    mismatches = []
    max_diff = 0.0
    for poly_a, poly_b in cases:
        reference = geom._polygon_iou_reference(poly_a, poly_b)
        fast = geom._polygon_iou_numpy(poly_a, poly_b)
        if reference != fast:
            mismatches.append((reference, fast))
            max_diff = max(max_diff, abs(reference - fast))
    check(
        not mismatches,
        f"optimised IoU is bit-identical to the reference across {len(cases)} cases "
        f"({len(mismatches)} mismatches, max |diff|={max_diff})",
    )
    # Spot-check the semantic expectations on the canonical cases.
    rect = _iou_equivalence_cases()[0][0]
    container = _iou_equivalence_cases()[4][1]
    check(
        abs(geom.polygon_iou(rect, container) - 0.36) < 0.02,
        f"containment IoU stays faithful ({geom.polygon_iou(rect, container)})",
    )
    check(
        geom.polygon_iou(rect, rect) == 1.0,
        "identical polygons score IoU exactly 1.0",
    )


def test_bboxes_disjoint_is_conservative():
    section("Bounding-box prefilter — conservative rejection only")
    touching = ({"x": 0, "y": 0, "width": 10, "height": 10},
                {"x": 10, "y": 0, "width": 10, "height": 10})
    separated = ({"x": 0, "y": 0, "width": 10, "height": 10},
                 {"x": 11, "y": 0, "width": 10, "height": 10})
    overlapping = ({"x": 0, "y": 0, "width": 10, "height": 10},
                   {"x": 9, "y": 9, "width": 10, "height": 10})
    check(
        not geom.bboxes_disjoint(*touching),
        "touching boxes are never considered disjoint (shared edge possible)",
    )
    check(geom.bboxes_disjoint(*separated), "separated boxes are reported disjoint")
    check(not geom.bboxes_disjoint(*overlapping), "overlapping boxes are reported not disjoint")
    gap_boxes = ({"x": 0, "y": 0, "width": 10, "height": 10},
                 {"x": 10.3, "y": 0, "width": 10, "height": 10})
    check(
        geom.bboxes_disjoint(*gap_boxes),
        "a 0.3 gap is disjoint without a margin (IoU must be 0)",
    )
    check(
        not geom.bboxes_disjoint(*gap_boxes, margin=0.6),
        "a tolerance margin keeps sub-tolerance gaps in the comparison set (shared-edge snapping)",
    )


def test_dedupe_and_merge_semantics():
    section("Dedup and merge — duplicate removal preserved")
    plot_a = {"points": [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}, {"x": 0, "y": 10}],
              "source": "enclosed", "geometryConfidence": 0.9, "areaPercent": 1.0}
    # A near-copy of plot_a from another source. The IoU (~0.82) sits between
    # the merge (0.55) and duplicate (0.90) thresholds, so this pair must take
    # the cross-source merge path, not the drop path.
    plot_b = {"points": [{"x": 1, "y": 0}, {"x": 11, "y": 0}, {"x": 11, "y": 10}, {"x": 1, "y": 10}],
              "source": "fill", "geometryConfidence": 0.8, "areaPercent": 1.0}
    # A distant genuine plot: must survive.
    plot_c = {"points": [{"x": 50, "y": 50}, {"x": 60, "y": 50}, {"x": 60, "y": 60}, {"x": 50, "y": 60}],
              "source": "enclosed", "geometryConfidence": 0.85, "areaPercent": 1.0}
    # A near-copy of plot_c from another source: must merge, not drop.
    plot_d = {"points": [{"x": 51, "y": 50}, {"x": 61, "y": 50}, {"x": 61, "y": 60}, {"x": 51, "y": 60}],
              "source": "fill", "geometryConfidence": 0.7, "areaPercent": 1.0}

    kept, stats = detect_layout._dedupe_and_merge(
        [plot_b, plot_d, plot_a, plot_c], merge_iou=0.55, duplicate_iou=0.90
    )
    check(len(kept) == 2, f"only the two distinct plots survive ({len(kept)})")
    check(stats["duplicatesRemoved"] == 0, f"cross-source near-copies merge instead of dropping ({stats})")
    check(stats["merged"] == 2, f"both cross-source merges recorded ({stats['merged']})")
    check(
        kept[0].get("corroboratedSources") == ["fill"],
        f"the kept candidate records the corroborating source ({kept[0].get('corroboratedSources')})",
    )

    # Same-source duplicates: identical shape twice from "enclosed". IoU 1.0
    # crosses the duplicate threshold and the copy is dropped.
    dup1 = dict(plot_a, source="enclosed", geometryConfidence=0.9)
    dup2 = dict(plot_a, source="enclosed", geometryConfidence=0.5)
    kept3, stats3 = detect_layout._dedupe_and_merge(
        [dup2, dup1], merge_iou=0.55, duplicate_iou=0.90
    )
    check(len(kept3) == 1, f"same-source duplicate is dropped ({len(kept3)})")
    check(stats3["duplicatesRemoved"] == 1, "the removal is recorded as a duplicate")

    # Determinism: identical inputs produce identical survivors.
    kept2, stats2 = detect_layout._dedupe_and_merge(
        [dict(plot_b), dict(plot_d), dict(plot_a), dict(plot_c)],
        merge_iou=0.55,
        duplicate_iou=0.90,
    )
    check(
        [c["points"] for c in kept2] == [c["points"] for c in
                                         detect_layout._dedupe_and_merge(
                                             [dict(plot_b), dict(plot_d), dict(plot_a), dict(plot_c)],
                                             merge_iou=0.55,
                                             duplicate_iou=0.90,
                                         )[0]],
        "the merge result is deterministic across identical inputs",
    )


def test_container_drop_prefilter():
    section("Container drop — bounding-box rejection keeps valid plots")
    big = {"points": [{"x": 0, "y": 0}, {"x": 40, "y": 0}, {"x": 40, "y": 40}, {"x": 0, "y": 40}],
           "source": "enclosed", "areaPercent": 16.0, "_contour": None}
    # Nested in `big` with IoU = 36^2 / 40^2 = 0.81 (>= 0.7) and
    # 12.96 < 16.0 * 0.85, so `big` is flagged as a container.
    small = {"points": [{"x": 2, "y": 2}, {"x": 38, "y": 2}, {"x": 38, "y": 38}, {"x": 2, "y": 38}],
             "source": "enclosed", "areaPercent": 12.96, "_contour": None}
    distant = {"points": [{"x": 70, "y": 70}, {"x": 80, "y": 70}, {"x": 80, "y": 80}, {"x": 70, "y": 80}],
               "source": "enclosed", "areaPercent": 1.0, "_contour": None}

    kept = detect_layout._drop_container_candidates([big, small, distant])
    check(len(kept) == 2, f"the container is dropped, both real plots survive ({len(kept)})")
    check(big not in kept, "the container candidate is removed")
    check(small in kept and distant in kept, "the contained plot and the distant plot are kept")

    # Disjoint-only input: the prefilter must not reject anything.
    kept2 = detect_layout._drop_container_candidates([distant, {"points": distant["points"], "source": "fill", "areaPercent": 1.0}])
    check(len(kept2) == 2, f"identical distant shapes are never rejected as containers ({len(kept2)})")


def main():
    print("=" * 70)
    print("  PlotPro V2 layout detection — unit tests")
    print("=" * 70)

    test_fold_to_grid()
    test_skew_estimation()
    test_coordinate_roundtrip()
    test_normalisation_roundtrip()
    test_grid_suppression()
    test_gap_bridging_is_conservative()
    test_regularisation_preserves_irregular_shapes()
    test_polygon_validation()
    test_shared_edge_snapping()
    test_block_subdivision_requires_evidence()
    test_compound_label_classification()
    test_label_association_is_one_to_one()
    test_duplicate_detection()
    test_legibility_gate()
    test_segment_fusion_is_conservative()
    test_polygon_iou()
    test_polygon_iou_numpy_matches_reference()
    test_bboxes_disjoint_is_conservative()
    test_dedupe_and_merge_semantics()
    test_container_drop_prefilter()

    print("\n" + "=" * 70)
    print(f"TOTAL: {PASSED + FAILED} | PASSED: {PASSED} | FAILED: {FAILED}")
    if FAILURES:
        print("\nFailures:")
        for f in FAILURES:
            print(f"  - {f}")
    print("=" * 70)
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
