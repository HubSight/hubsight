import math
import time
import logging
from collections import defaultdict

import numpy as np

from .fall_kinematics import keypoint_span_ratio, posture_signal

logger = logging.getLogger(__name__)

# §3.3 High-angle fall state machine states.
FALL_STATE_UPRIGHT = "UPRIGHT"
FALL_STATE_DESCENDING = "DESCENDING"
FALL_STATE_STILLNESS = "STILLNESS_VERIFYING"
FALL_STATE_CONFIRMED = "FALL_CONFIRMED"

# §3.4 Signal 1 — multi-trigger descent (OR of 3 weak signals).
V_DROP_THRESHOLD = 0.40  # height/s
DROP_WINDOW_S = 0.2  # ~2 frames @ 10 FPS
AR_JUMP_THRESHOLD = 0.50
CRUMPLE_WINDOW_S = 1.2  # ~12 frames @ 10 FPS
CRUMPLE_NET_DROP = 0.25
CRUMPLE_MAX_UPWARD_FRAMES = 2
DESCENDING_TIMEOUT_S = 3.0  # never went prone -> false trigger, back off to UPRIGHT

# §3.4 Signal 2 — dual-tier stillness gate.
NKD_THRESHOLD = 0.02
BBOX_STILLNESS_THRESHOLD = 0.03
MIN_VALID_KPTS_FOR_NKD = 6
STILLNESS_FRAMES_STANDARD = 30  # 3.0s @ 10 FPS
STILLNESS_FRAMES_IR = 40  # §5.2.2 relaxed window for IR grain


class TrackIdentity:
    """Tracks identity state and detects posture anomalies (e.g. falling) across time using multi-frame consensus."""
    def __init__(self, track_id):
        self.track_id = track_id
        self.created_at = time.time()
        self.last_seen = time.time()
        self.last_face_infer = 0.0
        
        # State: 'verifying' (gray), 'family' (green), 'guest' (blue), 'stranger' (red)
        self.state = "verifying"
        self.name = ""
        self.role = ""
        self.member_id = None
        self.confidence = 0.0
        self.best_similarity = 0.0
        
        # Consensus buffer: list of (member_id, name, role, score, is_good)
        self.match_history = []
        self.good_eval_count = 0
        self.is_locked = False
        
        # Abnormal Behavior Tracking (Fall, Collapse, Sudden Posture Change)
        self.box_history = []  # list of (timestamp, norm_box (x1, y1, x2, y2), aspect_ratio)
        self.is_fallen = False
        self.last_abnormal_alert = 0.0
        self.loiter_alerted = False
        self.torso_angle = None
        self.keypoints = None  # (17,3) normalized 0–1
        self.head_anchor = None  # (x, y) normalized cranial keypoint mean (§2.2)
        self.angle_history = []  # (ts, angle_deg)

        # High-angle (§2.3 angle_profile == "high") fall state machine (§3.3).
        self.fall_state = FALL_STATE_UPRIGHT
        self.descend_entered_at = 0.0
        self.stillness_entered_at = 0.0
        self.stillness_streak = 0
        self._prev_motion_kpts = None  # previous frame's (17,3) for NKD (Tier A)
        self.resolution_tier = "normal"  # "low_res" -> §6.1 small-target degradation

    def update_pose_history(self, norm_box):
        x1, y1, x2, y2 = norm_box
        w = max(1e-5, x2 - x1)
        h = max(1e-5, y2 - y1)
        aspect_ratio = w / h  # Normal standing person: aspect_ratio < 0.6. Fallen/lying: aspect_ratio > 1.2
        now = time.time()
        self.box_history.append((now, norm_box, aspect_ratio))
        # Keep last 5 seconds of boxes
        self.box_history = [b for b in self.box_history if now - b[0] <= 5.0]

    def check_abnormal_behavior(self, now=None, torso_angle=None, angle_profile="standard", ir_mode=False):
        """Fall via pose torso angle when available; otherwise bbox aspect-ratio.

        `angle_profile` (§2.3) selectively routes steep-pitch cameras through the
        high-angle state machine (§3.3); eye-level/"standard" streams keep the
        original torso-angle / bbox-aspect-ratio path unchanged (§1.1 — zero
        regression on the existing baseline).
        """
        now = now if now is not None else time.time()
        self.torso_angle = torso_angle
        if self.resolution_tier == "low_res":
            return None  # §6.1 — pixel quantization noise; no fall detection.
        if angle_profile == "high":
            return self._check_fall_high_angle(now, ir_mode=ir_mode)
        if torso_angle is not None:
            return self._check_fall_from_angle(now, torso_angle)
        if self.keypoints is None:
            return self._check_fall_from_box(now)
        return None

    def _check_fall_from_angle(self, now, angle_deg):
        from .fall_kinematics import FALL_ANGLE_DEG, UPRIGHT_ANGLE_DEG

        self.angle_history.append((now, float(angle_deg)))
        self.angle_history = [a for a in self.angle_history if now - a[0] <= 5.0]
        if len(self.angle_history) < 3:
            return None
        if angle_deg >= FALL_ANGLE_DEG:
            past_upright = any(a[1] <= UPRIGHT_ANGLE_DEG for a in self.angle_history[:-1])
            if past_upright and not self.is_fallen:
                if now - self.last_abnormal_alert < 30.0:
                    self.is_fallen = True
                    return None
                self.is_fallen = True
                self.last_abnormal_alert = now
                logger.info("[Track %s] FALLEN pose angle=%.1f deg", self.track_id, angle_deg)
                return "fall_detected"
            if past_upright:
                self.is_fallen = True
            return None
        if angle_deg <= UPRIGHT_ANGLE_DEG:
            self.is_fallen = False
        return None

    def _check_fall_from_box(self, now):
        if len(self.box_history) < 3:
            return None
        current_ar = self.box_history[-1][2]
        if current_ar >= 1.15:
            past_standing = any(b[2] < 0.7 for b in self.box_history[:-1])
            if past_standing and not self.is_fallen:
                if now - self.last_abnormal_alert < 30.0:
                    self.is_fallen = True
                    return None
                self.is_fallen = True
                self.last_abnormal_alert = now
                return "fall_detected"
        else:
            self.is_fallen = False
        return None

    @staticmethod
    def _y_center(box):
        return (box[1] + box[3]) / 2.0

    def _box_at_or_before(self, target_ts):
        candidates = [b for b in self.box_history if b[0] <= target_ts]
        if candidates:
            return candidates[-1]
        return self.box_history[0] if self.box_history else None

    def _signal1_descent(self, now):
        """§3.4 Signal 1 — OR of 3 weak descent triggers (high recall by design)."""
        if len(self.box_history) < 3:
            return False
        cur_ts, cur_box, cur_ar = self.box_history[-1]
        cur_y = self._y_center(cur_box)

        ref = self._box_at_or_before(now - DROP_WINDOW_S)
        if ref is not None and cur_ts > ref[0]:
            dt = cur_ts - ref[0]
            if dt > 1e-3:
                v_drop = (cur_y - self._y_center(ref[1])) / dt
                if v_drop >= V_DROP_THRESHOLD:
                    return True
                if (cur_ar - ref[2]) >= AR_JUMP_THRESHOLD:
                    return True

        window = [b for b in self.box_history if now - b[0] <= CRUMPLE_WINDOW_S]
        if len(window) >= 4:
            net_drop = self._y_center(window[-1][1]) - self._y_center(window[0][1])
            upward = sum(
                1 for i in range(1, len(window))
                if self._y_center(window[i][1]) < self._y_center(window[i - 1][1])
            )
            if net_drop >= CRUMPLE_NET_DROP and upward <= CRUMPLE_MAX_UPWARD_FRAMES:
                return True
        return False

    def _motion_energy_tier_a(self, kpts_arr, kp_conf):
        """§3.4 Signal 2 Tier A — Normalized Keypoint Displacement."""
        if kpts_arr is None or self._prev_motion_kpts is None or not self.box_history:
            return None
        conf_cur = kpts_arr[:, 2]
        conf_prev = self._prev_motion_kpts[:, 2]
        common = (conf_cur >= kp_conf) & (conf_prev >= kp_conf)
        if int(np.count_nonzero(common)) < MIN_VALID_KPTS_FOR_NKD:
            return None
        box = self.box_history[-1][1]
        scale = max(1e-5, box[2] - box[0], box[3] - box[1])
        diffs = np.linalg.norm(kpts_arr[common, :2] - self._prev_motion_kpts[common, :2], axis=1)
        return float(np.mean(diffs)) / scale

    def _motion_energy_tier_b(self):
        """§3.4 Signal 2 Tier B — bbox centroid + area stillness fallback."""
        if len(self.box_history) < 2:
            return None
        prev = self.box_history[-2][1]
        cur = self.box_history[-1][1]
        scale = max(1e-5, cur[2] - cur[0], cur[3] - cur[1])
        c_prev = ((prev[0] + prev[2]) / 2.0, (prev[1] + prev[3]) / 2.0)
        c_cur = ((cur[0] + cur[2]) / 2.0, (cur[1] + cur[3]) / 2.0)
        centroid_drift = math.hypot(c_cur[0] - c_prev[0], c_cur[1] - c_prev[1]) / scale
        area_prev = max(0.0, prev[2] - prev[0]) * max(0.0, prev[3] - prev[1])
        area_cur = max(0.0, cur[2] - cur[0]) * max(0.0, cur[3] - cur[1])
        area_drift = abs(area_cur - area_prev) / (area_cur + 1e-4)
        return centroid_drift + area_drift

    def _check_fall_high_angle(self, now, ir_mode=False):
        """§3.3 high-angle fall state machine (steep-pitch cameras only)."""
        if not self.box_history:
            return None
        kp_conf = 0.20 if ir_mode else 0.30
        stillness_required = STILLNESS_FRAMES_IR if ir_mode else STILLNESS_FRAMES_STANDARD

        box_ar = self.box_history[-1][2]
        kpts_arr = None
        span_ratio = None
        if self.keypoints is not None:
            kpts_arr = np.asarray(self.keypoints, dtype=np.float32)
            span_ratio = keypoint_span_ratio(kpts_arr, kp_conf)
        prone = posture_signal(box_ar, span_ratio)

        e_motion = self._motion_energy_tier_a(kpts_arr, kp_conf)
        if e_motion is not None:
            still = e_motion < NKD_THRESHOLD
        else:
            e_bbox = self._motion_energy_tier_b()
            still = e_bbox is not None and e_bbox < BBOX_STILLNESS_THRESHOLD

        # Advance the per-frame motion reference for the next call.
        self._prev_motion_kpts = kpts_arr

        if self.fall_state == FALL_STATE_UPRIGHT:
            if self._signal1_descent(now):
                self.fall_state = FALL_STATE_DESCENDING
                self.descend_entered_at = now
            return None

        if self.fall_state == FALL_STATE_DESCENDING:
            if prone:
                self.fall_state = FALL_STATE_STILLNESS
                self.stillness_streak = 0
                self.stillness_entered_at = now
            elif now - self.descend_entered_at > DESCENDING_TIMEOUT_S:
                # Never went prone (e.g. a crouch/pick-up-item bend, §7.2 negative
                # clips) — back off rather than stay latched in DESCENDING.
                self.fall_state = FALL_STATE_UPRIGHT
            return None

        if self.fall_state == FALL_STATE_STILLNESS:
            if not still:
                self.fall_state = FALL_STATE_UPRIGHT
                self.stillness_streak = 0
                return None
            self.stillness_streak += 1
            if self.stillness_streak >= stillness_required:
                if self.is_fallen and now - self.last_abnormal_alert < 30.0:
                    return None
                self.fall_state = FALL_STATE_CONFIRMED
                self.is_fallen = True
                self.last_abnormal_alert = now
                logger.info(
                    "[Track %s] HIGH-ANGLE FALL_CONFIRMED after %d still frames",
                    self.track_id, self.stillness_streak,
                )
                return "fall_detected"
            return None

        if self.fall_state == FALL_STATE_CONFIRMED:
            if still is False:
                self.fall_state = FALL_STATE_UPRIGHT
                self.is_fallen = False
                self.stillness_streak = 0
            return None

        return None

    def check_loitering(self, now=None):
        """Stranger / unverified person remaining in frame for >= 45s."""
        if self.loiter_alerted:
            return None
        if self.state in ("family", "guest"):
            return None
        now = now if now is not None else time.time()
        if now - self.created_at >= 45.0:
            self.loiter_alerted = True
            return "loitering"
        return None

    def update_match(self, member_id, name, role, similarity, is_good):
        self.last_seen = time.time()
        if is_good:
            self.good_eval_count += 1
        if is_good or member_id is not None:
            self.match_history.append((member_id, name, role, similarity))

        if self.is_locked:
            # Keep lock, but pick up gallery rename/role change immediately.
            if member_id and member_id == self.member_id and name:
                self.name = name
                if role and role not in ("verifying", "stranger", ""):
                    self.role = role
                    self.state = "family" if role == "family" else "guest"
            return

        # Multi-frame consensus:
        # Live 640–720p faces often sit 0.52–0.65 vs enrolled photos; require two votes at 0.52+.
        member_votes = defaultdict(list)
        for mid, mname, mrole, sim in self.match_history:
            if mid is not None and sim >= 0.52:
                member_votes[mid].append((mname, mrole, sim))

        for mid, votes in member_votes.items():
            if len(votes) >= 2:
                best = max(votes, key=lambda v: v[2])
                best_sim = best[2]
                self.member_id = mid
                self.name = best[0]
                self.role = best[1] if best[1] not in ("verifying", "stranger", "") else "family"
                self.best_similarity = round(best_sim, 2)
                if self.role == "family":
                    self.state = "family"
                else:
                    self.state = "guest"
                self.is_locked = True
                logger.info(f"[Track {self.track_id}] LOCKED identity: {self.name} ({self.role}) with score {best_sim:.2f}")
                return

        # Weak gallery hits must not be frozen as stranger (ByteTrack IDs churn on a webcam).
        has_member_hint = any(
            mid is not None and sim >= 0.45
            for mid, _, _, sim in self.match_history
        )
        if self.good_eval_count >= 10 and len(member_votes) == 0 and not has_member_hint:
            self.state = "stranger"
            self.name = "Người lạ"
            self.role = "stranger"
            self.is_locked = True
            logger.info(f"[Track {self.track_id}] LOCKED identity: STRANGER after {self.good_eval_count} clear frames")
