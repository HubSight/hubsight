"""Torso-angle fall detector from COCO-17 pose (shoulders + hips)."""

from __future__ import annotations

import math
from typing import Optional

import numpy as np

L_SHOULDER, R_SHOULDER = 5, 6
L_HIP, R_HIP = 11, 12
HEAD_KPTS = (0, 1, 2, 3, 4)  # nose, eyes, ears — cranial cluster (§2.2)
KP_CONF = 0.3
# Angle of hip→shoulder vs image vertical. ~0 standing, ~90 lying.
FALL_ANGLE_DEG = 50.0
UPRIGHT_ANGLE_DEG = 35.0

# §3.4 Signal 0 — prone/horizontal posture gate (necessary-not-sufficient; the
# Stillness Gate is what actually separates "fallen" from "walking toward camera").
PRONE_AR_THRESHOLD = 1.15
PRONE_SPAN_RATIO_THRESHOLD = 1.20

# §2.3 — median bbox aspect ratio decision boundary for the angle-profile estimator.
PROFILE_HIGH_AR_THRESHOLD = 0.80
PROFILE_SAMPLE_SIZE = 200

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


def head_anchor(keypoints: np.ndarray, min_conf: float = KP_CONF) -> Optional[np.ndarray]:
    """Mean (x, y) of the valid cranial keypoints (COCO 0–4), or None (§2.2).

    At steep overhead pitch, hips/ankles routinely drop below `min_conf` while the
    head remains visible from above — this is the fallback spatial anchor for
    tracking when the torso/legs are foreshortened or occluded.
    """
    if keypoints is None or len(keypoints) < 17:
        return None
    kpts = np.asarray(keypoints, dtype=np.float32)
    conf = kpts[:, 2]
    mask = np.zeros(len(kpts), dtype=bool)
    mask[list(HEAD_KPTS)] = True
    valid = mask & (conf >= min_conf)
    if not np.any(valid):
        return None
    return np.mean(kpts[valid, :2], axis=0)


def posture_signal(
    box_ar: float,
    span_ratio: Optional[float] = None,
    ar_threshold: float = PRONE_AR_THRESHOLD,
    span_threshold: float = PRONE_SPAN_RATIO_THRESHOLD,
) -> bool:
    """§3.4 Signal 0 — prone/horizontal posture gate.

    `box_ar` = bbox w/h. `span_ratio` = keypoint (max_x-min_x)/(max_y-min_y), when
    available. True if either exceeds its threshold. This is a *necessary, not
    sufficient* condition for a fall — a person walking straight at a steep-angle
    camera is also compressed this way; the Stillness Gate (Signal 2) is the real
    precision backstop (§3.4 note).
    """
    if box_ar >= ar_threshold:
        return True
    if span_ratio is not None and span_ratio >= span_threshold:
        return True
    return False


def keypoint_span_ratio(keypoints: np.ndarray, min_conf: float = KP_CONF) -> Optional[float]:
    """(max_x-min_x)/(max_y-min_y) over valid keypoints, for Signal 0's span check."""
    if keypoints is None or len(keypoints) < 17:
        return None
    kpts = np.asarray(keypoints, dtype=np.float32)
    conf = kpts[:, 2]
    valid = conf >= min_conf
    if np.count_nonzero(valid) < 2:
        return None
    xy = kpts[valid, :2]
    dx = float(xy[:, 0].max() - xy[:, 0].min())
    dy = float(xy[:, 1].max() - xy[:, 1].min())
    return dx / (dy + 1e-4)


def classify_angle_profile(median_ar: float, threshold: float = PROFILE_HIGH_AR_THRESHOLD) -> str:
    """§2.3 decision rule: median upright-person bbox aspect ratio → camera profile."""
    return "high" if median_ar > threshold else "standard"
