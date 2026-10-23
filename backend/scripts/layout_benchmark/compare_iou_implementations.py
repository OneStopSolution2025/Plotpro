#!/usr/bin/env python3
"""
compare_iou_implementations.py — geometry-regression harness.

For each benchmark fixture, runs the REAL detection pipeline twice in two
fresh child processes (mirroring how the backend executes the worker):
always with the optimised NumPy IoU, and never with a shared in-process
OpenCV RNG state (cv2.kmeans reseeds itself, so in-process runs were not
comparable). The pre-existing 20-second wall-clock budget of the OCR
fallback is neutralised in both children so the comparison measures the
geometry algorithms rather than machine timing.

The candidate outputs (identifiers, geometry, labels, confidences,
classifications, warnings) are compared field by field.

Usage:
  uv run --with opencv-python --with numpy --with pillow \
      --with rapidocr-onnxruntime python layout_benchmark/compare_iou_implementations.py
"""

import json
import os
import subprocess
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_IMAGES_DIR = os.path.join(_HERE, "images")
_OUT_DIR = os.path.join(_HERE, "reports")
_UV_DEPS = [
    "--with", "opencv-python",
    "--with", "numpy",
    "--with", "pillow",
    "--with", "rapidocr-onnxruntime",
]


def _run_detect(image_path: str, out_path: str, force_reference: bool = False) -> None:
    """Run detect_layout.py in a fresh process, storing canonical candidates."""
    script = r'''
import sys, os, json
sys.path.insert(0, r"__SCRIPTS_DIR__")
import detect_layout as dl

# Neutralise the pre-existing 20-second wall-clock budget of the OCR
# fallback loop. Its completion count varies with ordinary latency jitter,
# which masks geometry-level differences. The budget is not part of the
# geometry contract under test here; production keeps the 20s default.
_orig_run_ocr = dl._run_ocr
def _deterministic_run_ocr(*args, **kwargs):
    kwargs["time_budget_sec"] = float("inf")
    return _orig_run_ocr(*args, **kwargs)
dl._run_ocr = _deterministic_run_ocr

if __FORCE_REFERENCE__:
    from layout_core.geometry import _polygon_iou_reference as __ref_iou
    import layout_core.polygons as __pm
    dl.polygon_iou = __ref_iou
    __pm.polygon_iou = __ref_iou

def canon(c):
    return {
        "candidateId": c.get("candidateId"),
        "suggestedPlotNumber": c.get("suggestedPlotNumber",""),
        "suggestedBlock": c.get("suggestedBlock",""),
        "points": [(p["x"], p["y"]) for p in c.get("points", [])],
        "boundingBox": (c.get("boundingBox", {}).get("x"), c.get("boundingBox", {}).get("y"), c.get("boundingBox", {}).get("width"), c.get("boundingBox", {}).get("height")),
        "center": (c.get("center", {}).get("x"), c.get("center", {}).get("y")),
        "ocrConfidence": c.get("ocrConfidence"),
        "labelConfidence": c.get("labelConfidence"),
        "geometryConfidence": c.get("geometryConfidence"),
        "classification": c.get("classification"),
        "source": c.get("source"),
        "warnings": sorted(c.get("warnings", [])),
        "regularizationMethod": c.get("regularizationMethod"),
    }

res = dl.detect(r"__IMAGE_PATH__", {}, [], [])
data = [canon(c) for c in res["candidates"]]
with open(r"__OUT_PATH__", "w") as fh:
    json.dump({"candidateCount": res.get("candidateCount"), "candidates": data}, fh)
'''
    script = (
        script.replace("__SCRIPTS_DIR__", os.path.dirname(_HERE))
        .replace("__FORCE_REFERENCE__", "True" if force_reference else "False")
        .replace("__IMAGE_PATH__", image_path)
        .replace("__OUT_PATH__", out_path)
    )
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    subprocess.run(
        ["uv", "run", *_UV_DEPS, "python", "-c", script],
        check=True,
        env=env,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
    )


def _load(path: str):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def main() -> None:
    os.makedirs(_OUT_DIR, exist_ok=True)
    fixtures = sorted(
        f[:-4] for f in os.listdir(_IMAGES_DIR) if f.endswith(".png")
    )
    report = {}
    all_ok = True
    for name in fixtures:
        image_path = os.path.join(_IMAGES_DIR, f"{name}.png")
        fast_path = os.path.join(_OUT_DIR, f".cand_{name}_numpy.json")
        ref_path = os.path.join(_OUT_DIR, f".cand_{name}_ref.json")

        print(f"[compare] {name}: running optimised pipeline ...", flush=True)
        _run_detect(image_path, fast_path)
        print(f"[compare] {name}: running reference pipeline ...", flush=True)
        _run_detect(image_path, ref_path, force_reference=True)
        fast = _load(fast_path)
        ref = _load(ref_path)

        cands_fast = fast["candidates"]
        cands_ref = ref["candidates"]
        identical = cands_fast == cands_ref
        diff = 0
        first_diff = None
        if not identical:
            for i in range(max(len(cands_fast), len(cands_ref))):
                a = cands_fast[i] if i < len(cands_fast) else None
                b = cands_ref[i] if i < len(cands_ref) else None
                if a != b:
                    diff += 1
                    if first_diff is None:
                        first_diff = {
                            "index": i,
                            "numpy": str(a)[:500],
                            "reference": str(b)[:500],
                        }
        all_ok &= identical and diff == 0
        report[name] = {
            "identical": identical,
            "numpyCount": fast["candidateCount"],
            "referenceCount": ref["candidateCount"],
            "diffCount": diff,
            "firstDiff": first_diff,
        }
        print(
            f"[compare] {name}: identical={identical} "
            f"numpy={fast['candidateCount']} reference={ref['candidateCount']} "
            f"diffs={diff}",
            flush=True,
        )

    summary_path = os.path.join(_OUT_DIR, "iou_equivalence_report.json")
    with open(summary_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1)
    print(f"[compare] report written to {summary_path}")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
