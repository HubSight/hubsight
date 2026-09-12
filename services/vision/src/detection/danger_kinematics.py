"""Fire/smoke temporal + visual verification on top of yolo-fire-smoke.onnx boxes (§4).

Zero-dependency: reuses cv2 (already required by motion_gate.py) for HSV/Laplacian
checks and greedy IoU (mirrors byte_tracker.py's approach) to keep short-lived
per-candidate history across frames without a second tracker/model.
"""

from __future__ import annotations

import time
from typing import Optional

import cv2
import numpy as np

# Fire path (§4.3 Path A)
FIRE_SAT_MIN = 0.35
FIRE_HUE_RANGES = ((0, 35), (340, 360))
FIRE_GLARE_VALUE_MIN = 0.90
FIRE_GLARE_SAT_MAX = 0.25
FIRE_PERSIST_K = 7
FIRE_PERSIST_M = 10
FIRE_PERSIST_IOU = 0.40
FIRE_AREA_CV_MIN = 0.08  # sigma/mu

# Smoke path (§4.3 Path B)
SMOKE_SAT_MAX = 0.20
SMOKE_LAPLACIAN_VAR_MAX = 120.0
SMOKE_PERSIST_K = 5
SMOKE_PERSIST_M = 10
SMOKE_PERSIST_IOU = 0.35
SMOKE_GROWTH_RATIO_MIN = 1.30
SMOKE_GROWTH_WINDOW_S = 2.0

CANDIDATE_HISTORY_S = 4.0


def _box_iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _hue_in_fire_range(hue_deg: float) -> bool:
    return any(lo <= hue_deg <= hi for lo, hi in FIRE_HUE_RANGES)


def fire_hsv_pass(crop_bgr: np.ndarray) -> bool:
    """§4.3 Path A.1 — specular-glare rejection + warm-saturated hue gate."""
    if crop_bgr is None or crop_bgr.size == 0:
        return False
    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    h = float(np.mean(hsv[:, :, 0])) * 2.0  # OpenCV hue is 0-179 -> degrees
    s = float(np.mean(hsv[:, :, 1])) / 255.0
    v = float(np.mean(hsv[:, :, 2])) / 255.0
    if v > FIRE_GLARE_VALUE_MIN and s < FIRE_GLARE_SAT_MAX:
        return False
    if s < FIRE_SAT_MIN:
        return False
    return _hue_in_fire_range(h)


def smoke_texture_pass(crop_bgr: np.ndarray) -> bool:
    """§4.3 Path B.1 — low-chroma, low-edge-density (diffuse) gate."""
    if crop_bgr is None or crop_bgr.size == 0:
        return False
    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    s = float(np.mean(hsv[:, :, 1])) / 255.0
    if s > SMOKE_SAT_MAX:
        return False
    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return lap_var < SMOKE_LAPLACIAN_VAR_MAX


class DangerCandidate:
    """Rolling per-candidate history for one fire/smoke blob (§4.3)."""

    def __init__(self, danger_type: str, box, ts: float):
        self.danger_type = danger_type
        self.box = box  # last-seen (x1,y1,x2,y2) in original-frame pixels
        self.last_seen = ts
        # (ts, box, area, y_center, visual_pass) history, capped to CANDIDATE_HISTORY_S
        self.history = []
        self.confirmed = False

    def update(self, box, ts: float, visual_pass: bool):
        x1, y1, x2, y2 = box
        area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        y_center = (y1 + y2) / 2.0
        self.box = box
        self.last_seen = ts
        self.history.append((ts, box, area, y_center, visual_pass))
        self.history = [h for h in self.history if ts - h[0] <= CANDIDATE_HISTORY_S]

    def _recent(self, window_s: float, now: float):
        return [h for h in self.history if now - h[0] <= window_s]

    def check_fire(self, now: float) -> bool:
        recent = self._recent(FIRE_PERSIST_M * 0.1 + 0.05, now)  # ~M frames at 10 FPS
        if len(recent) < 3:
            return False
        hits = sum(1 for h in recent if h[4])
        if hits < FIRE_PERSIST_K:
            return False
        areas = np.array([h[2] for h in recent], dtype=np.float64)
        mu = float(areas.mean())
        if mu <= 1e-6:
            return False
        sigma = float(areas.std())
        return (sigma / mu) >= FIRE_AREA_CV_MIN

    def check_smoke(self, now: float) -> bool:
        recent = self._recent(SMOKE_PERSIST_M * 0.1 + 0.05, now)
        if len(recent) < 3:
            return False
        hits = sum(1 for h in recent if h[4])
        if hits < SMOKE_PERSIST_K:
            return False
        growth_window = self._recent(SMOKE_GROWTH_WINDOW_S, now)
        if len(growth_window) < 2:
            return False
        area_then = growth_window[0][2]
        area_now = growth_window[-1][2]
        if area_then <= 1e-6 or (area_now / area_then) < SMOKE_GROWTH_RATIO_MIN:
            return False
        y_then = growth_window[0][3]
        y_now = growth_window[-1][3]
        return y_now <= y_then  # non-negative upward drift (smaller y = higher)


class DangerCandidateTracker:
    """Per-camera, per-class candidate association across frames (no ML tracker)."""

    def __init__(self):
        self.candidates: dict[str, list[DangerCandidate]] = {"fire": [], "smoke": []}

    def observe(self, danger_type: str, box, ts: float, visual_pass: bool) -> DangerCandidate:
        bucket = self.candidates.setdefault(danger_type, [])
        persist_iou = FIRE_PERSIST_IOU if danger_type == "fire" else SMOKE_PERSIST_IOU
        best, best_iou = None, persist_iou
        for cand in bucket:
            iou = _box_iou(cand.box, box)
            if iou > best_iou:
                best, best_iou = cand, iou
        if best is None:
            best = DangerCandidate(danger_type, box, ts)
            bucket.append(best)
        best.update(box, ts, visual_pass)
        # Drop stale candidates.
        self.candidates[danger_type] = [c for c in bucket if ts - c.last_seen <= CANDIDATE_HISTORY_S]
        return best

    def evaluate(self, danger_type: str, candidate: DangerCandidate, now: Optional[float] = None) -> bool:
        now = now if now is not None else time.time()
        if danger_type == "fire":
            return candidate.check_fire(now)
        if danger_type == "smoke":
            return candidate.check_smoke(now)
        return False
