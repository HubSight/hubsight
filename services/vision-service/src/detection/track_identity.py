import time
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

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
        self.angle_history = []  # (ts, angle_deg)

    def update_pose_history(self, norm_box):
        x1, y1, x2, y2 = norm_box
        w = max(1e-5, x2 - x1)
        h = max(1e-5, y2 - y1)
        aspect_ratio = w / h  # Normal standing person: aspect_ratio < 0.6. Fallen/lying: aspect_ratio > 1.2
        now = time.time()
        self.box_history.append((now, norm_box, aspect_ratio))
        # Keep last 5 seconds of boxes
        self.box_history = [b for b in self.box_history if now - b[0] <= 5.0]

    def check_abnormal_behavior(self, now=None, torso_angle=None):
        """Fall via pose torso angle when available; otherwise bbox aspect-ratio."""
        now = now if now is not None else time.time()
        self.torso_angle = torso_angle
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
