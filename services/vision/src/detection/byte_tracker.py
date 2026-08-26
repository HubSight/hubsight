"""Minimal ByteTrack in NumPy.

Replaces boxmot/lapx/ultralytics tracking so the runtime image does not pull
PyTorch. Association is greedy IoU (N is tiny on a home CCTV stream — typically
0–5 people — so Hungarian is unnecessary).
"""

from __future__ import annotations

import numpy as np


def iou_batch(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Pairwise IoU for xyxy boxes. a:(N,4) b:(M,4) -> (N,M)."""
    if a.size == 0 or b.size == 0:
        return np.zeros((len(a), len(b)), dtype=np.float32)
    tl = np.maximum(a[:, None, :2], b[None, :, :2])
    br = np.minimum(a[:, None, 2:], b[None, :, 2:])
    wh = np.clip(br - tl, 0, None)
    inter = wh[:, :, 0] * wh[:, :, 1]
    area_a = np.clip(a[:, 2] - a[:, 0], 0, None) * np.clip(a[:, 3] - a[:, 1], 0, None)
    area_b = np.clip(b[:, 2] - b[:, 0], 0, None) * np.clip(b[:, 3] - b[:, 1], 0, None)
    union = area_a[:, None] + area_b[None, :] - inter
    return (inter / np.clip(union, 1e-6, None)).astype(np.float32)


def greedy_match(track_boxes: np.ndarray, det_boxes: np.ndarray, iou_thresh: float):
    """Return (matches[(t,d),...], unmatched_track_idx, unmatched_det_idx)."""
    n_t, n_d = len(track_boxes), len(det_boxes)
    if n_t == 0 or n_d == 0:
        return [], list(range(n_t)), list(range(n_d))
    ious = iou_batch(track_boxes, det_boxes)
    order = np.dstack(np.unravel_index(np.argsort(-ious, axis=None), ious.shape))[0]
    matches = []
    used_t, used_d = set(), set()
    for t, d in order:
        t, d = int(t), int(d)
        if t in used_t or d in used_d:
            continue
        if ious[t, d] < iou_thresh:
            break
        matches.append((t, d))
        used_t.add(t)
        used_d.add(d)
    unmatched_t = [i for i in range(n_t) if i not in used_t]
    unmatched_d = [i for i in range(n_d) if i not in used_d]
    return matches, unmatched_t, unmatched_d


def xyxy_to_xyah(box: np.ndarray) -> np.ndarray:
    w = box[2] - box[0]
    h = max(box[3] - box[1], 1e-6)
    return np.array([box[0] + w / 2.0, box[1] + h / 2.0, w / h, h], dtype=np.float32)


def xyah_to_xyxy(xyah: np.ndarray) -> np.ndarray:
    cx, cy, a, h = float(xyah[0]), float(xyah[1]), float(xyah[2]), float(xyah[3])
    w = a * h
    return np.array([cx - w / 2.0, cy - h / 2.0, cx + w / 2.0, cy + h / 2.0], dtype=np.float32)


class KalmanFilterXYAH:
    """Constant-velocity Kalman filter over [cx, cy, aspect, height]."""

    def __init__(self):
        self._motion = np.eye(8, dtype=np.float64)
        for i in range(4):
            self._motion[i, i + 4] = 1.0
        self._update = np.eye(4, 8, dtype=np.float64)
        self._std_pos = 1.0 / 20
        self._std_vel = 1.0 / 160

    def initiate(self, measurement: np.ndarray):
        mean = np.zeros(8, dtype=np.float64)
        mean[:4] = measurement
        h = max(float(measurement[3]), 1.0)
        std = np.array([
            2 * self._std_pos * h, 2 * self._std_pos * h, 1e-2, 2 * self._std_pos * h,
            10 * self._std_vel * h, 10 * self._std_vel * h, 1e-5, 10 * self._std_vel * h,
        ], dtype=np.float64)
        return mean, np.diag(np.square(std))

    def predict(self, mean: np.ndarray, cov: np.ndarray):
        h = max(float(mean[3]), 1.0)
        std = np.array([
            self._std_pos * h, self._std_pos * h, 1e-2, self._std_pos * h,
            self._std_vel * h, self._std_vel * h, 1e-5, self._std_vel * h,
        ], dtype=np.float64)
        motion_cov = np.diag(np.square(std))
        mean = self._motion @ mean
        cov = self._motion @ cov @ self._motion.T + motion_cov
        return mean, cov

    def update(self, mean: np.ndarray, cov: np.ndarray, measurement: np.ndarray):
        h = max(float(mean[3]), 1.0)
        std = np.array([
            self._std_pos * h, self._std_pos * h, 1e-1, self._std_pos * h,
        ], dtype=np.float64)
        projected_mean = self._update @ mean
        projected_cov = self._update @ cov @ self._update.T + np.diag(np.square(std))
        b = cov @ self._update.T
        gain = np.linalg.solve(projected_cov, b.T).T
        innovation = measurement - projected_mean
        new_mean = mean + gain @ innovation
        new_cov = cov - gain @ projected_cov @ gain.T
        # Numerical hygiene: keep covariance symmetric positive-ish.
        new_cov = 0.5 * (new_cov + new_cov.T)
        return new_mean, new_cov


class STrack:
    def __init__(self, track_id: int, box_xyxy: np.ndarray, conf: float, cls_id: float, det_idx: int, kf: KalmanFilterXYAH):
        self.track_id = track_id
        self.conf = float(conf)
        self.cls_id = float(cls_id)
        self.det_idx = int(det_idx)
        self.kf = kf
        self.mean, self.cov = kf.initiate(xyxy_to_xyah(box_xyxy))
        self.time_since_update = 0
        self.hits = 1
        self.age = 1
        self.state = "tracked"  # tracked | lost

    @property
    def xyxy(self) -> np.ndarray:
        return xyah_to_xyxy(self.mean)

    def predict(self):
        self.mean, self.cov = self.kf.predict(self.mean, self.cov)
        self.age += 1
        self.time_since_update += 1

    def update(self, box_xyxy: np.ndarray, conf: float, cls_id: float, det_idx: int):
        self.mean, self.cov = self.kf.update(self.mean, self.cov, xyxy_to_xyah(box_xyxy))
        self.conf = float(conf)
        self.cls_id = float(cls_id)
        self.det_idx = int(det_idx)
        self.time_since_update = 0
        self.hits += 1
        self.state = "tracked"


class ByteTrack:
    """Per-camera ByteTrack. Do not share one instance across cameras."""

    def __init__(self, track_high_thresh=0.5, track_low_thresh=0.1, match_thresh=0.5, max_time_lost=15):
        self.track_high_thresh = track_high_thresh
        self.track_low_thresh = track_low_thresh
        self.match_thresh = match_thresh
        self.max_time_lost = max_time_lost
        self.kf = KalmanFilterXYAH()
        self.tracked = []
        self.lost = []
        self._next_id = 1

    def _new_id(self) -> int:
        tid = self._next_id
        self._next_id += 1
        return tid

    def update(self, dets: np.ndarray, frame=None) -> np.ndarray:
        """dets: (N, 6) [x1,y1,x2,y2,conf,cls]. Returns (M, 8) [x1,y1,x2,y2,id,conf,cls,det_idx]."""
        if dets is None or len(dets) == 0:
            dets = np.empty((0, 6), dtype=np.float32)
        else:
            dets = np.asarray(dets, dtype=np.float32)
            if dets.ndim == 1:
                dets = dets.reshape(1, -1)

        for t in self.tracked + self.lost:
            t.predict()

        high_mask = dets[:, 4] >= self.track_high_thresh if len(dets) else np.array([], dtype=bool)
        low_mask = (dets[:, 4] >= self.track_low_thresh) & (dets[:, 4] < self.track_high_thresh) if len(dets) else np.array([], dtype=bool)
        high = dets[high_mask] if len(dets) else dets
        low = dets[low_mask] if len(dets) else dets
        high_idx = np.where(high_mask)[0] if len(dets) else np.empty((0,), dtype=np.int64)
        low_idx = np.where(low_mask)[0] if len(dets) else np.empty((0,), dtype=np.int64)

        pool = self.tracked + self.lost
        pool_boxes = np.stack([t.xyxy for t in pool], axis=0) if pool else np.empty((0, 4), dtype=np.float32)
        high_boxes = high[:, :4] if len(high) else np.empty((0, 4), dtype=np.float32)

        matches, unmatched_t, unmatched_d = greedy_match(pool_boxes, high_boxes, self.match_thresh)
        matched_tracks = set()
        for ti, di in matches:
            pool[ti].update(high[di, :4], high[di, 4], high[di, 5], int(high_idx[di]))
            matched_tracks.add(ti)

        # Second association: leftover *tracked* (not already-lost) vs low-score dets.
        tracked_ids = {id(t) for t in self.tracked}
        leftover_tracked = [i for i in unmatched_t if id(pool[i]) in tracked_ids]
        low_boxes = low[:, :4] if len(low) else np.empty((0, 4), dtype=np.float32)
        if leftover_tracked and len(low):
            lt_boxes = np.stack([pool[i].xyxy for i in leftover_tracked], axis=0)
            m2, _, _ = greedy_match(lt_boxes, low_boxes, 0.5)
            for k, di in m2:
                ti = leftover_tracked[k]
                pool[ti].update(low[di, :4], low[di, 4], low[di, 5], int(low_idx[di]))
                matched_tracks.add(ti)

        new_tracked, new_lost = [], []
        for i, t in enumerate(pool):
            if i in matched_tracks:
                new_tracked.append(t)
                continue
            t.state = "lost"
            # Unconfirmed (seen once) tracks are dropped on the first miss.
            if t.hits == 1:
                continue
            if t.time_since_update <= self.max_time_lost:
                new_lost.append(t)

        for di in unmatched_d:
            box = high[di]
            new_tracked.append(STrack(self._new_id(), box[:4], box[4], box[5], int(high_idx[di]), self.kf))

        self.tracked = new_tracked
        self.lost = new_lost
        return self._export(self.tracked)

    @staticmethod
    def _export(tracks) -> np.ndarray:
        if not tracks:
            return np.empty((0, 8), dtype=np.float32)
        rows = []
        for t in tracks:
            x1, y1, x2, y2 = t.xyxy
            rows.append([x1, y1, x2, y2, float(t.track_id), t.conf, t.cls_id, float(t.det_idx)])
        return np.asarray(rows, dtype=np.float32)
