#!/usr/bin/env python3
"""
score_detection.py — scores a detection run against annotated ground truth.

Matching rule
-------------
Candidates are matched to ground-truth polygons **one-to-one** using polygon
Intersection-over-Union. Matching is greedy over candidate pairs sorted by
descending IoU: the highest-IoU pair is accepted first and both members are
removed from further consideration. A candidate can therefore never be
counted as a match for more than one ground-truth polygon, and a
ground-truth polygon can never be matched by more than one candidate.

The IoU threshold is configurable (default 0.50).

Reported metrics
----------------
* ground-truth plot count
* predicted candidate count
* true positives (matched pairs)
* false positives (unmatched candidates)
* missed plots (unmatched ground truth)
* polygon precision / recall / F1
* mean IoU over matched pairs
* plot-label exact-match accuracy over matched pairs
* unmatched labels (matched pair whose label differs from the truth)
* duplicate label assignments (the same identifier on several candidates)
* processing time

Usage:
    python score_detection.py --truth truth.json --detection detection.json \
        [--iou-threshold 0.5] [--out report.json]
"""

import argparse
import json
import math
import os
import sys
from typing import Any, Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from layout_core.geometry import polygon_iou  # noqa: E402


def normalise_identifier(text: str) -> str:
    if not text:
        return ""
    out = str(text).strip().upper()
    out = out.replace("–", "-").replace("—", "-")
    out = out.replace("⁄", "/").replace("∕", "/")
    out = "".join(ch for ch in out if ch.isalnum() or ch in "/-")
    return out


def match_one_to_one(
    truth_polys: Sequence[Sequence[Dict[str, float]]],
    candidate_polys: Sequence[Sequence[Dict[str, float]]],
    *,
    iou_threshold: float = 0.5,
) -> List[Tuple[int, int, float]]:
    """
    Greedy one-to-one matching by descending polygon IoU.

    Returns a list of ``(truth_index, candidate_index, iou)`` triples.
    """
    pairs: List[Tuple[float, int, int]] = []
    for ti, tp in enumerate(truth_polys):
        for ci, cp in enumerate(candidate_polys):
            if not tp or not cp:
                continue
            iou = polygon_iou(tp, cp)
            if iou >= iou_threshold:
                pairs.append((iou, ti, ci))

    pairs.sort(key=lambda p: -p[0])
    used_truth = set()
    used_cand = set()
    matches: List[Tuple[int, int, float]] = []
    for iou, ti, ci in pairs:
        if ti in used_truth or ci in used_cand:
            continue
        used_truth.add(ti)
        used_cand.add(ci)
        matches.append((ti, ci, iou))
    return matches


def score(
    truth: Dict[str, Any],
    detection: Dict[str, Any],
    *,
    iou_threshold: float = 0.5,
) -> Dict[str, Any]:
    """Produce the full metric report."""
    truth_plots = truth.get("plots", []) or []
    candidates = detection.get("candidates", []) or []

    truth_polys = [p.get("points", []) for p in truth_plots]
    cand_polys = [c.get("points", []) for c in candidates]

    matches = match_one_to_one(
        truth_polys, cand_polys, iou_threshold=iou_threshold
    )

    matched_truth = {t for t, _c, _i in matches}
    matched_cand = {c for _t, c, _i in matches}

    true_positives = len(matches)
    false_positives = len(candidates) - len(matched_cand)
    false_negatives = len(truth_plots) - len(matched_truth)

    precision = true_positives / len(candidates) if candidates else 0.0
    recall = true_positives / len(truth_plots) if truth_plots else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )
    mean_iou = (
        sum(i for _t, _c, i in matches) / len(matches) if matches else 0.0
    )

    # Label accuracy is measured over matched pairs only.
    label_exact = 0
    label_mismatched: List[Dict[str, Any]] = []
    for ti, ci, _iou in matches:
        expected = normalise_identifier(truth_plots[ti].get("plotNumber", ""))
        actual = normalise_identifier(candidates[ci].get("suggestedPlotNumber", ""))
        if expected and expected == actual:
            label_exact += 1
        else:
            label_mismatched.append(
                {
                    "truthPlotNumber": truth_plots[ti].get("plotNumber", ""),
                    "candidateId": candidates[ci].get("candidateId"),
                    "suggestedPlotNumber": candidates[ci].get("suggestedPlotNumber", ""),
                    "iou": round(_iou, 4),
                }
            )
    label_accuracy = label_exact / true_positives if true_positives else 0.0

    # Duplicate label assignments across all candidates.
    seen: Dict[str, List[str]] = {}
    for cand in candidates:
        key = normalise_identifier(cand.get("suggestedPlotNumber", ""))
        if key:
            seen.setdefault(key, []).append(cand.get("candidateId"))
    duplicates = {k: v for k, v in seen.items() if len(v) > 1}

    # Candidates that produced no label at all.
    unlabelled = sum(
        1 for c in candidates if not str(c.get("suggestedPlotNumber", "")).strip()
    )

    vertex_hist: Dict[str, int] = {}
    for cand in candidates:
        key = str(len(cand.get("points", [])))
        vertex_hist[key] = vertex_hist.get(key, 0) + 1

    return {
        "fixture": truth.get("image", ""),
        "engine": detection.get("engine", ""),
        "iouThreshold": iou_threshold,
        "groundTruthCount": len(truth_plots),
        "predictedCount": len(candidates),
        "truePositives": true_positives,
        "falsePositives": false_positives,
        "missedPlots": false_negatives,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "meanIoU": round(mean_iou, 4),
        "labelAccuracy": round(label_accuracy, 4),
        "labelExactMatches": label_exact,
        "labelMismatches": label_mismatched,
        "duplicateLabels": duplicates,
        "unlabelledCandidates": unlabelled,
        "vertexHistogram": vertex_hist,
        "rotationAngle": detection.get("rotationAngle", 0.0),
        "skewConfidence": detection.get("skewConfidence", 0.0),
        "legibility": detection.get("legibility", {}),
        "processingTimeMs": detection.get("processingTimeMs"),
        "detectorWarnings": detection.get("warnings", []),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Score a layout detection run.")
    parser.add_argument("--truth", required=True, help="Ground truth JSON file")
    parser.add_argument("--detection", required=True, help="Detection result JSON file")
    parser.add_argument("--iou-threshold", type=float, default=0.5)
    parser.add_argument("--out", default=None, help="Optional path to write the report")
    args = parser.parse_args()

    with open(args.truth, "r", encoding="utf-8-sig") as fh:
        truth = json.load(fh)
    with open(args.detection, "r", encoding="utf-8-sig") as fh:
        detection = json.load(fh)

    report = score(truth, detection, iou_threshold=args.iou_threshold)
    text = json.dumps(report, indent=2)
    print(text)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)


if __name__ == "__main__":
    main()
