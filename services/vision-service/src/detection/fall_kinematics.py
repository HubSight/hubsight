"""Torso-angle fall detector from COCO-17 pose (shoulders + hips)."""

from __future__ import annotations

import math
from typing import Optional

import numpy as np

L_SHOULDER, R_SHOULDER = 5, 6
L_HIP, R_HIP = 11, 12
KP_CONF = 0.3
# Angle of hip→shoulder vs image vertical. ~0 standing, ~90 lying.
FALL_ANGLE_DEG = 50.0
UPRIGHT_ANGLE_DEG = 35.0

# COCO-17 skeleton edges for overlay.
SKELETON = (
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
    (5, 11), (6, 12), (11, 12),
    (11, 13), (13, 15), (12, 14), (14, 16),
    (0, 1), (0, 2), (1, 3), (2, 4), (0, 5), (0, 6),
)


def _midpoint(xy: np.ndarray, conf: np.ndarray, i: int, j: int, min_conf: float):
    pts = []
    if conf[i] >= min_conf:
        pts.append(xy[i])
    if conf[j] >= min_conf:
        pts.append(xy[j])
    if not pts:
        return None
    return np.mean(np.stack(pts, axis=0), axis=0)


def torso_angle_deg(keypoints: np.ndarray, min_conf: float = KP_CONF) -> Optional[float]:
    """Return 0–90° from vertical, or None if shoulders/hips are too uncertain.

    `keypoints` is (17, 3) = x, y, conf in any consistent pixel/normalized space.
    """
    if keypoints is None or len(keypoints) < 17:
        return None
    kpts = np.asarray(keypoints, dtype=np.float32)
    xy = kpts[:, :2]
    conf = kpts[:, 2]
    sh = _midpoint(xy, conf, L_SHOULDER, R_SHOULDER, min_conf)
    hip = _midpoint(xy, conf, L_HIP, R_HIP, min_conf)
    if sh is None or hip is None:
        return None
    vx = float(sh[0] - hip[0])
    vy = float(sh[1] - hip[1])
    norm = math.hypot(vx, vy)
    if norm < 1e-3:
        return None
    # atan2(|horizontal|, |vertical|) → 0 upright, 90 flat on the ground.
    return float(abs(math.degrees(math.atan2(abs(vx), abs(vy)))))


def is_fallen_pose(angle_deg: Optional[float], threshold: float = FALL_ANGLE_DEG) -> bool:
    return angle_deg is not None and angle_deg >= threshold
