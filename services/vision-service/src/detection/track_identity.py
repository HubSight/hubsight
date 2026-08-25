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

    def update_pose_history(self, norm_box):
        x1, y1, x2, y2 = norm_box
        w = max(1e-5, x2 - x1)
        h = max(1e-5, y2 - y1)
        aspect_ratio = w / h  # Normal standing person: aspect_ratio < 0.6. Fallen/lying: aspect_ratio > 1.2
        now = time.time()
        self.box_history.append((now, norm_box, aspect_ratio))
        # Keep last 5 seconds of boxes
        self.box_history = [b for b in self.box_history if now - b[0] <= 5.0]

    def check_abnormal_behavior(self, now=None):
        """Detect sudden posture anomaly (e.g. falling down or lying on the ground)."""
        if len(self.box_history) < 3:
            return None

        now = now if now is not None else time.time()
        current_ar = self.box_history[-1][2]
        # Require a prior upright posture in the 5s window to reduce sitting/couch FPs.
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
            self.match_history.append((member_id, name, role, similarity))

        if self.is_locked:
            return

        # Multi-frame consensus algorithm:
        # 1. Count votes for specific members
        member_votes = defaultdict(list)
        for mid, mname, mrole, sim in self.match_history:
            if mid is not None and sim >= 0.58:
                member_votes[mid].append((mname, mrole, sim))

        # Check if any member has >= 2 strong matches
        for mid, votes in member_votes.items():
            if len(votes) >= 2:
                best_sim = max(v[2] for v in votes)
                self.member_id = mid
                self.name = votes[0][0]
                self.role = votes[0][1] # 'family', 'guest', 'neighbor', 'staff'
                self.best_similarity = round(best_sim, 2)
                
                # Map role to 4-color visual category
                if self.role == "family":
                    self.state = "family" # Green (#10b981)
                else:
                    self.state = "guest"  # Blue (#3b82f6)
                self.is_locked = True
                logger.info(f"[Track {self.track_id}] LOCKED identity: {self.name} ({self.role}) with score {best_sim:.2f}")
                return

        # If >= 4 good evaluations with no candidate match above 0.45 -> Stranger
        if self.good_eval_count >= 4 and len(member_votes) == 0:
            self.state = "stranger" # Red (#ef4444)
            self.name = "Người lạ"
            self.role = "stranger"
            self.is_locked = True
            logger.info(f"[Track {self.track_id}] LOCKED identity: STRANGER after {self.good_eval_count} clear frames")
