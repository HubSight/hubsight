"""Opt-in ground-plane homography for fixed (non-PTZ) cameras (§2.4).

Only vision-service decodes frames, so only it can compute the actual
homography matrix and watch for the camera being bumped/repositioned —
core-service (Go) just stores the 4 raw calibration points an admin clicked.

Baseline tracking stays in normalized image space (§2.4) — this module is an
opt-in projection utility, not a dependency of the P0/P1 fall/person signals.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# The 4 clicked points map onto a unit floor square — no real-world metric
# measurement is required from the admin, just 4 coplanar floor points.
_UNIT_SQUARE = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=np.float32)

# §2.4 shift-invalidation: small patches centered on each calibration point,
# re-checked periodically against a freshly captured reference.
LANDMARK_PATCH_PX = 40
LANDMARK_SEARCH_MARGIN_PX = 20
LANDMARK_CHECK_INTERVAL_S = 30.0
LANDMARK_SHIFT_FRACTION = 0.05  # of frame dimension
LANDMARK_MIN_AGREEING = 3  # of 4 patches must agree it's still there


def parse_points(homography_points_json: str) -> Optional[np.ndarray]:
    """Parse core-service's stored JSON `[{"x":..,"y":..}, ...]` (normalized 0..1)."""
    if not homography_points_json:
        return None
    try:
        raw = json.loads(homography_points_json)
        pts = np.array([[float(p["x"]), float(p["y"])] for p in raw], dtype=np.float32)
    except Exception as exc:
        logger.warning("Failed to parse homography_points: %s", exc)
        return None
    if pts.shape != (4, 2):
        return None
    return pts


def compute_homography(points_norm: np.ndarray) -> Optional[np.ndarray]:
    """4 normalized image points -> 3x3 homography onto the unit floor square."""
    if points_norm is None or points_norm.shape != (4, 2):
        return None
    h, _ = cv2.findHomography(points_norm.astype(np.float32), _UNIT_SQUARE)
    return h


def project_to_bev(h_matrix: np.ndarray, point_norm) -> Optional[tuple]:
    """Project one normalized image point to unit-floor-square BEV coordinates."""
    if h_matrix is None:
        return None
    pt = np.array([[[float(point_norm[0]), float(point_norm[1])]]], dtype=np.float32)
    out = cv2.perspectiveTransform(pt, h_matrix)
    return float(out[0, 0, 0]), float(out[0, 0, 1])


class LandmarkShiftChecker:
    """§2.4 — invalidate a fixed camera's calibration if the scene moved under it.

    The 4 calibration points are, by construction, static floor/architecture
    features, so they double as the shift-check landmarks (no separate UI step).
    """

    def __init__(self):
        self.reference_patches = None  # list of (cx_px, cy_px, gray_patch)
        self.last_check = 0.0

    def arm(self, frame, points_norm: np.ndarray):
        """Capture reference patches from the current frame at the calibration points."""
        if points_norm is None:
            self.reference_patches = None
            return
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        half = LANDMARK_PATCH_PX // 2
        patches = []
        for x_norm, y_norm in points_norm:
            cx, cy = int(x_norm * w), int(y_norm * h)
            x1, y1 = max(0, cx - half), max(0, cy - half)
            x2, y2 = min(w, cx + half), min(h, cy + half)
            if x2 - x1 < 4 or y2 - y1 < 4:
                continue
            patches.append((cx, cy, gray[y1:y2, x1:x2].copy()))
        self.reference_patches = patches or None

    def check(self, frame, now: float) -> bool:
        """Returns True if calibration still holds (or hasn't been armed / isn't due)."""
        if self.reference_patches is None:
            return True
        if now - self.last_check < LANDMARK_CHECK_INTERVAL_S:
            return True
        self.last_check = now

        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        max_shift_px = LANDMARK_SHIFT_FRACTION * max(w, h)
        agreeing = 0
        for cx, cy, ref_patch in self.reference_patches:
            ph, pw = ref_patch.shape[:2]
            sx1 = max(0, cx - pw // 2 - LANDMARK_SEARCH_MARGIN_PX)
            sy1 = max(0, cy - ph // 2 - LANDMARK_SEARCH_MARGIN_PX)
            sx2 = min(w, cx + pw // 2 + LANDMARK_SEARCH_MARGIN_PX)
            sy2 = min(h, cy + ph // 2 + LANDMARK_SEARCH_MARGIN_PX)
            search = gray[sy1:sy2, sx1:sx2]
            if search.shape[0] < ph or search.shape[1] < pw:
                continue
            result = cv2.matchTemplate(search, ref_patch, cv2.TM_CCOEFF_NORMED)
            _, max_val, _, max_loc = cv2.minMaxLoc(result)
            if max_val < 0.5:
                continue  # patch no longer recognizable at all -> doesn't agree
            found_cx = sx1 + max_loc[0] + pw / 2.0
            found_cy = sy1 + max_loc[1] + ph / 2.0
            shift = ((found_cx - cx) ** 2 + (found_cy - cy) ** 2) ** 0.5
            if shift <= max_shift_px:
                agreeing += 1

        return agreeing >= min(LANDMARK_MIN_AGREEING, len(self.reference_patches))
