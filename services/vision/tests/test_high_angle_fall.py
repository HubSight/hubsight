"""Tests for the §3.3 high-angle fall state machine (angle_profile == "high").

These exercise TrackIdentity.check_abnormal_behavior(..., angle_profile="high")
directly with synthetic box sequences — no video or ONNX model needed. Box
history entries are pushed directly (like test_track_identity.py does) rather
than via update_pose_history(), which timestamps with wall-clock time.time()
and would fight the synthetic `now` used here.
"""

import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.detection.track_identity import (  # noqa: E402
    TrackIdentity,
    FALL_STATE_UPRIGHT,
    FALL_STATE_DESCENDING,
    FALL_STATE_STILLNESS,
    FALL_STATE_CONFIRMED,
)


def _push_box(t, ts, cx, cy, w, h):
    box = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    t.box_history.append((ts, box, w / h))
    t.box_history = [b for b in t.box_history if ts - b[0] <= 5.0]


def _drive_descent(t, now):
    """Upright-walking then a rapid drop + AR collapse within 0.2s. Returns the
    event from the frame that should trigger Signal 1 (entry to DESCENDING)."""
    _push_box(t, now - 1.0, 0.5, 0.30, 0.20, 0.50)
    t.check_abnormal_behavior(now - 1.0, angle_profile="high")
    _push_box(t, now - 0.8, 0.5, 0.32, 0.20, 0.50)
    t.check_abnormal_behavior(now - 0.8, angle_profile="high")
    _push_box(t, now - 0.6, 0.5, 0.80, 0.60, 0.15)
    return t.check_abnormal_behavior(now - 0.6, angle_profile="high")


class DescentSignalTests(unittest.TestCase):
    def test_rapid_drop_enters_descending(self):
        t = TrackIdentity(1)
        now = time.time()
        _drive_descent(t, now)
        self.assertEqual(t.fall_state, FALL_STATE_DESCENDING)

    def test_walking_alone_stays_upright(self):
        t = TrackIdentity(2)
        now = time.time()
        for i in range(20):
            _push_box(t, now - 2.0 + i * 0.1, 0.3 + i * 0.01, 0.5, 0.20, 0.45)
            t.check_abnormal_behavior(now - 2.0 + i * 0.1, angle_profile="high")
        self.assertEqual(t.fall_state, FALL_STATE_UPRIGHT)


class StillnessGateTests(unittest.TestCase):
    def test_full_fall_confirms_after_stillness(self):
        t = TrackIdentity(3)
        now = time.time()
        evt = _drive_descent(t, now)
        self.assertIsNone(evt)
        self.assertEqual(t.fall_state, FALL_STATE_DESCENDING)

        # Prone posture (AR>=1.15) gates DESCENDING -> STILLNESS_VERIFYING.
        _push_box(t, now - 0.5, 0.5, 0.85, 0.60, 0.15)
        evt = t.check_abnormal_behavior(now - 0.5, angle_profile="high")
        self.assertIsNone(evt)
        self.assertEqual(t.fall_state, FALL_STATE_STILLNESS)

        # Hold a perfectly still bbox for 30 consecutive frames (Tier B, no keypoints).
        evt = None
        ts = now - 0.4
        for _ in range(35):
            _push_box(t, ts, 0.5, 0.85, 0.60, 0.15)
            evt = t.check_abnormal_behavior(ts, angle_profile="high")
            ts += 0.1
            if evt == "fall_detected":
                break
        self.assertEqual(evt, "fall_detected")
        self.assertEqual(t.fall_state, FALL_STATE_CONFIRMED)
        self.assertTrue(t.is_fallen)

    def test_motion_during_stillness_reverts_to_upright(self):
        t = TrackIdentity(4)
        now = time.time()
        _drive_descent(t, now)
        _push_box(t, now - 0.5, 0.5, 0.85, 0.60, 0.15)
        t.check_abnormal_behavior(now - 0.5, angle_profile="high")
        self.assertEqual(t.fall_state, FALL_STATE_STILLNESS)

        # A few still frames, then a big bbox jump (still moving -> not a fall).
        ts = now - 0.4
        for _ in range(5):
            _push_box(t, ts, 0.5, 0.85, 0.60, 0.15)
            t.check_abnormal_behavior(ts, angle_profile="high")
            ts += 0.1
        _push_box(t, ts, 0.2, 0.4, 0.20, 0.45)
        t.check_abnormal_behavior(ts, angle_profile="high")
        self.assertEqual(t.fall_state, FALL_STATE_UPRIGHT)


class SmallTargetGateTests(unittest.TestCase):
    def test_low_res_track_never_alerts(self):
        t = TrackIdentity(5)
        t.resolution_tier = "low_res"
        now = time.time()
        for i in range(40):
            _push_box(t, now + i * 0.1, 0.5, 0.85, 0.60, 0.15)
            evt = t.check_abnormal_behavior(now + i * 0.1, angle_profile="high")
            self.assertIsNone(evt)


class StandardProfileUnaffectedTests(unittest.TestCase):
    def test_standard_profile_ignores_high_angle_machinery(self):
        """§1.1 — angle_profile='standard' must reproduce the pre-existing torso-angle path."""
        t = TrackIdentity(6)
        now = time.time()
        t.check_abnormal_behavior(now - 1.2, torso_angle=12, angle_profile="standard")
        t.check_abnormal_behavior(now - 0.8, torso_angle=15, angle_profile="standard")
        evt = t.check_abnormal_behavior(now, torso_angle=62, angle_profile="standard")
        self.assertEqual(evt, "fall_detected")
        self.assertEqual(t.fall_state, FALL_STATE_UPRIGHT)  # state machine never engaged


if __name__ == "__main__":
    unittest.main()
