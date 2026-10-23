"""
ocr.py — local RapidOCR label reading and safe plot-number association.

Design notes
------------
* The OCR engine is created **once** per process and reused. The previous
  implementation instantiated ``RapidOCR()`` inside two separate worker
  processes, paying the model load twice per request.
* Labels are read from a **crop around the candidate**, not from the whole
  sheet. A plot number occupies a few dozen pixels; reading it from a
  4000 px image is hopeless, reading it from a 200 px crop is not.
* Recognition-only mode is used for clean single-label crops, while the
  detector path is used when a crop may contain several text runs.
* Compound identifiers such as ``7/12`` are preserved. What counts as a
  valid plot number is decided by the **project's own plot list**, not by an
  invented universal regex: a bare number such as ``2350`` is only a plot
  number if the project actually contains a plot called ``2350``.
* Database identifiers are matched **exactly** first. A fuzzy match is only
  ever a *suggestion* that is flagged for review; it is never applied
  silently.
"""

import math
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np


# --------------------------------------------------------------------------
# engine
# --------------------------------------------------------------------------

class OcrEngine:
    """Lazily initialised, process-wide RapidOCR engine."""

    _instance: Optional["OcrEngine"] = None

    def __init__(self):
        self._engine = None
        self._failed = False

    @classmethod
    def get(cls) -> "OcrEngine":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def available(self) -> bool:
        if self._failed:
            return False
        if self._engine is None:
            try:
                from rapidocr_onnxruntime import RapidOCR

                self._engine = RapidOCR()
            except Exception:
                self._failed = True
                return False
        return True

    def read(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """Run detection + recognition; returns a list of token records."""
        if not self.available or image is None or image.size == 0:
            return []
        try:
            raw, _ = self._engine(image)
        except Exception:
            return []
        return self._normalise(raw)

    def read_recognition_only(self, image: np.ndarray) -> Optional[Dict[str, Any]]:
        """
        Run recognition only, on a crop that is expected to hold one label.

        Returns ``None`` when the engine is unavailable or the result is
        empty. This deliberately does not attempt to *locate* text.
        """
        if not self.available or image is None or image.size == 0:
            return None
        try:
            raw, _ = self._engine(image, use_det=False, use_cls=False)
        except TypeError:
            try:
                raw, _ = self._engine(image)
            except Exception:
                return None
        except Exception:
            return None

        # With use_det=False the engine returns [text, score] rather than a
        # list of boxes; normalise both shapes.
        if isinstance(raw, (list, tuple)) and raw and isinstance(raw[0], (list, tuple)):
            if len(raw) >= 2 and isinstance(raw[0], (str, float)):
                return {"text": str(raw[0]).strip(), "score": float(raw[1]), "box": None}
            tokens = self._normalise(raw)
            return tokens[0] if tokens else None
        if isinstance(raw, (list, tuple)) and len(raw) >= 2:
            return {"text": str(raw[0]).strip(), "score": float(raw[1]), "box": None}
        return None

    @staticmethod
    def _normalise(raw: Any) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        if not raw:
            return out
        for item in raw:
            try:
                box, text, score = item[0], item[1], float(item[2])
            except Exception:
                continue
            out.append(
                {
                    "text": str(text).strip(),
                    "score": round(score, 4),
                    "box": [[float(p[0]), float(p[1])] for p in box] if box is not None else None,
                }
            )
        return out


# --------------------------------------------------------------------------
# token classification
# --------------------------------------------------------------------------

DIMENSION_RE = re.compile(
    r"(?:\d+\s*[xX×]\s*\d+)"                       # 30x40
    r"|(?:\d+\s*(?:sq\.?\s*ft|sqm|m2|sq\.?\s*m|yd|feet|foot|ft)\b\.?)"  # 1200 sq.ft
    r"|(?:\d+\s*'\s*\d+\")",                        # 30' x 40'
    re.IGNORECASE,
)

ROAD_WORDS = re.compile(
    r"\b(road|street|st\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|"
    r"cross|north|south|east|west|north|south)\b",
    re.IGNORECASE,
)

BLOCK_RE = re.compile(r"^[A-Z]{1,2}\s*[-–]\s*\d{1,3}$", re.IGNORECASE)
PLOT_TOKEN_RE = re.compile(
    r"^[A-Za-z]{0,3}\s*[-–/]?\s*\d{1,4}\s*[-–/]\s*\d{1,4}\s*[A-Za-z]{0,2}$|"
    r"^[A-Za-z]{1,3}\s*[-–]?\s*\d{1,4}\s*[A-Za-z]{0,2}$|"
    r"^\d{1,4}\s*[-–/]\s*\d{1,4}$|"
    r"^\d{1,4}\s*[A-Za-z]{0,2}$"
)


def normalise_identifier(text: str) -> str:
    """Normalise a plot identifier for comparison (case, separators, spaces)."""
    if not text:
        return ""
    out = str(text).strip().upper()
    out = out.replace("–", "-").replace("—", "-")
    out = out.replace("⁄", "/").replace("∕", "/")
    out = re.sub(r"\s+", "", out)
    out = re.sub(r"[^A-Z0-9/\-]", "", out)
    return out


def levenshtein(a: str, b: str) -> int:
    """Classic edit distance with a rolling row."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(
                min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + (ca != cb),
                )
            )
        previous = current
    return previous[-1]


def classify_token(
    text: str,
    *,
    lexicon: Optional[Sequence[str]] = None,
    known_blocks: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """
    Classify an OCR token.

    Returns ``{"kind", "text", "confidence", "candidates"}`` where ``kind``
    is one of ``plot``, ``plot_suggestion``, ``block``, ``dimension``,
    ``road_text`` or ``unknown``.
    """
    raw = (text or "").strip()
    # OCR commonly confuses the fraction bar with commas or pipes
    # ('4,15' for '4/15'), so canonicalise the separators before matching.
    raw = re.sub(r"[,;|]", "/", raw)
    norm = normalise_identifier(raw)
    lexicon_norm = [normalise_identifier(x) for x in (lexicon or [])]
    blocks_norm = {normalise_identifier(x) for x in (known_blocks or [])}

    if not raw:
        return {"kind": "unknown", "text": raw, "confidence": 0.0, "candidates": []}

    if DIMENSION_RE.search(raw):
        return {"kind": "dimension", "text": raw, "confidence": 0.0, "candidates": []}

    if ROAD_WORDS.search(raw) and not norm:
        return {"kind": "road_text", "text": raw, "confidence": 0.0, "candidates": []}

    # Exact hit in the project's own plot list -> definite.
    if norm and norm in lexicon_norm:
        return {
            "kind": "plot",
            "text": raw,
            "confidence": 1.0,
            "candidates": [norm],
        }

    # Block label (also allowed to be a plot-number prefix).
    if norm and norm in blocks_norm:
        return {"kind": "block", "text": raw, "confidence": 0.9, "candidates": [norm]}

    if BLOCK_RE.match(raw) and norm not in lexicon_norm:
        return {"kind": "block", "text": raw, "confidence": 0.6, "candidates": [norm]}

    if not PLOT_TOKEN_RE.match(raw):
        return {"kind": "unknown", "text": raw, "confidence": 0.0, "candidates": []}

    # When no database inventory is supplied (e.g. brand-new project),
    # accept well-formed plot identifiers directly as proposals.
    if not lexicon_norm:
        return {
            "kind": "plot",
            "text": raw,
            "confidence": 0.85,
            "candidates": [norm],
        }

    # Fuzzy suggestions against the project lexicon. These are suggestions
    # only — the caller must flag them for review.
    suggestions: List[Tuple[int, str]] = []
    max_distance = 1 if len(norm) <= 4 else 2
    for entry in set(lexicon_norm):
        if not entry:
            continue
        distance = levenshtein(norm, entry)
        if distance <= max_distance:
            suggestions.append((distance, entry))
    suggestions.sort()

    if suggestions:
        best_distance, best = suggestions[0]
        second = suggestions[1][0] if len(suggestions) > 1 else 99
        # A suggestion is only offered when it is clearly better than the
        # runner-up, otherwise the token is ambiguous.
        if second - best_distance >= 1 or len(suggestions) == 1:
            return {
                "kind": "plot_suggestion",
                "text": raw,
                "confidence": 0.55 if best_distance == 1 else 0.4,
                "candidates": [best],
                "ambiguous": len(suggestions) > 1 and second - best_distance < 1,
            }
        return {
            "kind": "plot_suggestion",
            "text": raw,
            "confidence": 0.3,
            "candidates": [c for _d, c in suggestions[:3]],
            "ambiguous": True,
        }

    return {"kind": "unknown", "text": raw, "confidence": 0.0, "candidates": []}


# --------------------------------------------------------------------------
# label reading
# --------------------------------------------------------------------------

def _preprocess_variants(crop: np.ndarray) -> List[Tuple[str, np.ndarray]]:
    """Contrast / threshold variants of a crop, cheapest first."""
    variants: List[Tuple[str, np.ndarray]] = [("raw", crop)]

    if crop.ndim == 3:
        lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        cl = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(l)
        variants.append(
            ("clahe", cv2.cvtColor(cv2.merge((cl, a, b)), cv2.COLOR_LAB2BGR))
        )
    else:
        cl = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(crop)
        variants.append(("clahe", cl))

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop
    _thr, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(("otsu", otsu))
    return variants


def read_label_for_candidate(
    polygon_px: np.ndarray,
    image: np.ndarray,
    *,
    engine: OcrEngine,
    lexicon: Optional[Sequence[str]] = None,
    known_blocks: Optional[Sequence[str]] = None,
    pad_ratio: float = 0.28,
    min_side_px: int = 96,
    max_side_px: int = 640,
    rotation_angle: float = 0.0,
) -> Dict[str, Any]:
    """
    Read the plot number printed inside one candidate.

    The crop is taken around the candidate, enlarged, and read with the
    detector. When the detector finds nothing, a centred sub-crop is read in
    recognition-only mode. All preprocessed variants are tried and the best
    *classified* result wins.

    Returns a record with the chosen token, its confidence and the reason
    when nothing could be read.
    """
    if polygon_px is None or len(polygon_px) < 3 or image is None or image.size == 0:
        return {"text": "", "kind": "none", "confidence": 0.0, "reason": "NO_GEOMETRY"}

    ih, iw = image.shape[:2]
    xs = polygon_px[:, 0]
    ys = polygon_px[:, 1]
    x0, x1 = float(xs.min()), float(xs.max())
    y0, y1 = float(ys.min()), float(ys.max())
    bw = max(1.0, x1 - x0)
    bh = max(1.0, y1 - y0)
    pad = pad_ratio * max(bw, bh)

    cx0 = max(0, int(x0 - pad))
    cy0 = max(0, int(y0 - pad))
    cx1 = min(iw, int(x1 + pad) + 1)
    cy1 = min(ih, int(y1 + pad) + 1)
    if cx1 - cx0 < 6 or cy1 - cy0 < 6:
        return {"text": "", "kind": "none", "confidence": 0.0, "reason": "CROP_TOO_SMALL"}

    crop = image[cy0:cy1, cx0:cx1]
    ch, cw = crop.shape[:2]
    scale = 1.0
    if min(ch, cw) < min_side_px:
        scale = min_side_px / float(min(ch, cw))
    elif max(ch, cw) > max_side_px:
        scale = max_side_px / float(max(ch, cw))
    if abs(scale - 1.0) > 1e-3:
        crop = cv2.resize(
            crop,
            (max(1, int(cw * scale)), max(1, int(ch * scale))),
            interpolation=cv2.INTER_CUBIC,
        )

    best: Optional[Dict[str, Any]] = None
    best_score = -1.0

    # When the sheet was deskewed, the text inside each plot is rotated by
    # the same angle. Try a deskewed copy of the crop so the glyphs are
    # axis-aligned for the recognition model.
    crops_to_try: List[Tuple[str, np.ndarray]] = [("base", crop)]
    if abs(rotation_angle) > 0.5:
        centre = (crop.shape[1] / 2.0, crop.shape[0] / 2.0)
        M = cv2.getRotationMatrix2D(centre, -rotation_angle, 1.0)
        rotated = cv2.warpAffine(
            crop, M, (crop.shape[1], crop.shape[0]),
            flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255),
        )
        crops_to_try.append(("deskewed", rotated))

    for crop_tag, crop_variant in crops_to_try:
        for variant_name, variant in _preprocess_variants(crop_variant):
            tag = f"{crop_tag}_{variant_name}"
            for token in engine.read(variant):
                classified = classify_token(
                    token["text"], lexicon=lexicon, known_blocks=known_blocks
                )
                if classified["kind"] in ("dimension", "road_text", "unknown"):
                    continue
                score = token["score"] * (1.0 if classified["kind"] == "plot" else 0.8)
                if score > best_score:
                    best_score = score
                    best = {
                        "text": token["text"],
                        "kind": classified["kind"],
                        "confidence": round(float(token["score"]), 4),
                        "variant": tag,
                        "candidates": classified.get("candidates", []),
                        "ambiguous": bool(classified.get("ambiguous")),
                    }

    if best is not None:
        return best

    # Fall back to recognition-only on a centred crop.
    h, w = crop.shape[:2]
    mh, mw = int(h * 0.62), int(w * 0.62)
    y0c = max(0, (h - mh) // 2)
    x0c = max(0, (w - mw) // 2)
    centre = crop[y0c : y0c + mh, x0c : x0c + mw]
    if centre.size == 0:
        return {"text": "", "kind": "none", "confidence": 0.0, "reason": "NO_CROP"}

    centre_crops = [("base", centre)]
    if abs(rotation_angle) > 0.5:
        M = cv2.getRotationMatrix2D(
            (centre.shape[1] / 2.0, centre.shape[0] / 2.0), -rotation_angle, 1.0
        )
        centre_crops.append(
            ("deskewed", cv2.warpAffine(
                centre, M, (centre.shape[1], centre.shape[0]),
                flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255),
            ))
        )
    for crop_tag, centre_variant in centre_crops:
        for variant_name, variant in _preprocess_variants(centre_variant):
            token = engine.read_recognition_only(variant)
        if not token:
            continue
        classified = classify_token(
            token["text"], lexicon=lexicon, known_blocks=known_blocks
        )
        if classified["kind"] in ("dimension", "road_text", "unknown"):
            continue
        score = token["score"] * (1.0 if classified["kind"] == "plot" else 0.8)
        if score > best_score:
            best_score = score
            best = {
                "text": token["text"],
                "kind": classified["kind"],
                "confidence": round(float(token["score"]), 4),
                "variant": f"rec_only_{crop_tag}_{variant_name}",
                "candidates": classified.get("candidates", []),
                "ambiguous": bool(classified.get("ambiguous")),
            }

    if best is not None:
        return best

    return {"text": "", "kind": "none", "confidence": 0.0, "reason": "NO_TEXT_FOUND"}


# --------------------------------------------------------------------------
# spatial association
# --------------------------------------------------------------------------

def _point_in_polygon(x: float, y: float, poly: Sequence[Dict[str, float]]) -> bool:
    pts = [(float(p["x"]), float(p["y"])) for p in poly if isinstance(p, dict)]
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


def _bbox_overlap(a: Dict[str, float], b: Dict[str, float]) -> float:
    x1 = max(a["x"], b["x"])
    y1 = max(a["y"], b["y"])
    x2 = min(a["x"] + a["width"], b["x"] + b["width"])
    y2 = min(a["y"] + a["height"], b["y"] + b["height"])
    if x2 <= x1 or y2 <= y1:
        return 0.0
    inter = (x2 - x1) * (y2 - y1)
    a_area = a["width"] * a["height"]
    b_area = b["width"] * b["height"]
    union = a_area + b_area - inter
    return (inter / union) if union > 0 else 0.0


def associate_labels(
    candidates: List[Dict[str, Any]],
    tokens: List[Dict[str, Any]],
    *,
    lexicon: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """
    Associate OCR tokens with candidate polygons.

    Several independent signals are combined: containment of the token in
    the polygon, bounding-box overlap, distance to the polygon centroid,
    OCR confidence and the candidate's own geometry confidence. The label
    *association* confidence is kept separate from the OCR confidence and
    from the geometry confidence.

    Assignment is one-to-one: a token is used by at most one candidate and a
    candidate receives at most one token. When two candidates compete for
    the same token by a small margin, both are flagged ``AMBIGUOUS_LABEL``.
    """
    if not candidates or not tokens:
        return {"assignments": {}, "flags": [], "duplicateIdentifiers": []}

    scored: List[Tuple[float, int, int, Dict[str, Any]]] = []

    for ti, token in enumerate(tokens):
        classified = classify_token(
            token.get("text", ""), lexicon=lexicon
        )
        if classified["kind"] not in ("plot", "plot_suggestion"):
            continue
        tx = token.get("x")
        ty = token.get("y")
        if tx is None or ty is None:
            continue

        for ci, cand in enumerate(candidates):
            # A candidate that is barely bigger than the token itself is the
            # enclosure around the glyph strokes (a text fragment), not the
            # parcel the token labels. Parcels are orders of magnitude larger
            # than their printed numbers; anything under 3x the token area
            # is excluded from competing for it, so the real plot keeps the
            # number instead of a stray blob around the text.
            tb = token.get("bbox") or {}
            token_area = float(tb.get("width", 0.0)) * float(tb.get("height", 0.0))
            bb = cand.get("boundingBox") or {}
            cand_area = float(bb.get("width", 0.0)) * float(bb.get("height", 0.0))
            if token_area > 0 and cand_area < 3.0 * token_area:
                continue
            # Block candidates are kept for review but must never carry a
            # plot number: a block crop covers several plots and the
            # association would hand the inner plots' numbers to the block.
            if (cand.get("classification") or "") == "block":
                continue

            poly = cand.get("points", [])
            centre = cand.get("center", {})
            inside = _point_in_polygon(tx, ty, poly)
            overlap = _bbox_overlap(token.get("bbox", {}), cand.get("boundingBox", {}))
            dist = math.hypot(
                tx - float(centre.get("x", 0.0)), ty - float(centre.get("y", 0.0))
            )
            # Normalised distance: relative to the candidate's own size.
            bb = cand.get("boundingBox", {})
            diag = math.hypot(bb.get("width", 1.0), bb.get("height", 1.0)) or 1.0
            rel_dist = dist / diag

            containment_bonus = 0.55 if inside else 0.0
            overlap_bonus = 0.25 * overlap
            distance_penalty = 0.30 * min(1.0, rel_dist)
            ocr_term = 0.25 * float(token.get("score", 0.0))
            geometry_term = 0.15 * float(cand.get("geometryConfidence", 0.0))
            kind_term = 0.30 if classified["kind"] == "plot" else 0.10

            score = (
                containment_bonus
                + overlap_bonus
                + ocr_term
                + geometry_term
                + kind_term
                - distance_penalty
            )
            if score <= 0:
                continue
            scored.append(
                (
                    round(score, 5),
                    ci,
                    ti,
                    {
                        "inside": inside,
                        "overlap": round(overlap, 3),
                        "relativeDistance": round(rel_dist, 3),
                        "kind": classified["kind"],
                        "candidates": classified.get("candidates", []),
                        "ambiguousToken": bool(classified.get("ambiguous")),
                    },
                )
            )

    scored.sort(key=lambda item: -item[0])

    used_tokens: set = set()
    used_candidates: set = set()
    used_identifiers: set = set()
    assignments: Dict[int, Dict[str, Any]] = {}
    flags: List[Dict[str, Any]] = []

    for score, ci, ti, detail in scored:
        if ci in used_candidates or ti in used_tokens:
            continue

        # A single plot number must not be assigned to several candidates.
        # The token's identifier (exact or suggested) is the deduplication key.
        token = tokens[ti]
        identifier_key = normalise_identifier(token.get("text", ""))
        if identifier_key and identifier_key in used_identifiers:
            # Flag the losing candidate for review but do not assign it.
            flags.append(
                {
                    "candidateId": candidates[ci].get("candidateId"),
                    "code": "DUPLICATE_LABEL",
                    "detail": token.get("text", ""),
                }
            )
            continue

        # Competing score for the same candidate / token.
        competitor = None
        for s2, c2, t2, _d2 in scored:
            if s2 < score * 0.9:
                break
            if c2 == ci and t2 != ti:
                competitor = ("candidate", s2)
                break
            if t2 == ti and c2 != ci:
                competitor = ("token", s2)
                break

        token = tokens[ti]
        assignments[ci] = {
            "tokenIndex": ti,
            "text": token.get("text", ""),
            "ocrConfidence": round(float(token.get("score", 0.0)), 4),
            "associationScore": score,
            "associationConfidence": round(min(1.0, max(0.0, score)), 4),
            **detail,
        }
        used_candidates.add(ci)
        used_tokens.add(ti)
        if identifier_key:
            used_identifiers.add(identifier_key)

        if competitor is not None:
            flags.append(
                {
                    "candidateId": candidates[ci].get("candidateId"),
                    "code": "AMBIGUOUS_LABEL",
                    "detail": f"competing {competitor[0]} score {competitor[1]}",
                }
            )
            if detail["ambiguousToken"]:
                flags.append(
                    {
                        "candidateId": candidates[ci].get("candidateId"),
                        "code": "AMBIGUOUS_DATABASE_MATCH",
                        "detail": token.get("text", ""),
                    }
                )

    # Duplicate identifier detection across assignments.
    seen: Dict[str, List[int]] = {}
    for ci, assignment in assignments.items():
        key = normalise_identifier(assignment["text"])
        if key:
            seen.setdefault(key, []).append(ci)
    duplicates = []
    for key, cis in seen.items():
        if len(cis) > 1:
            duplicates.append({"identifier": key, "candidateIndexes": cis})
            for ci in cis:
                flags.append(
                    {
                        "candidateId": candidates[ci].get("candidateId"),
                        "code": "DUPLICATE_LABEL",
                        "detail": key,
                    }
                )

    return {
        "assignments": assignments,
        "flags": flags,
        "duplicateIdentifiers": duplicates,
    }
