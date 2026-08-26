import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.detection.track_identity import TrackIdentity  # noqa: E402


class TrackIdentityBehaviorTests(unittest.TestCase):
    def test_fall_requires_prior_standing(self):
        t = TrackIdentity(1)
        now = time.time()
        # Already horizontal history only — should not fire.
        for i in range(4):
            t.box_history.append((now - 1.0 + i * 0.2, (0.1, 0.4, 0.7, 0.6), 3.0))
        self.assertIsNone(t.check_abnormal_behavior(now))

    def test_fall_rising_edge_from_standing(self):
        t = TrackIdentity(1)
        now = time.time()
        t.box_history = [
            (now - 1.2, (0.4, 0.1, 0.55, 0.8), 0.2),
            (now - 0.8, (0.4, 0.15, 0.56, 0.82), 0.22),
            (now - 0.1, (0.2, 0.45, 0.8, 0.62), 3.5),
        ]
        self.assertEqual(t.check_abnormal_behavior(now), "fall_detected")
        self.assertTrue(t.is_fallen)
        # Cooldown 30s
        self.assertIsNone(t.check_abnormal_behavior(now + 1.0))

    def test_loitering_stranger_after_45s(self):
        t = TrackIdentity(2)
        t.state = "stranger"
        t.created_at = time.time() - 46
        self.assertEqual(t.check_loitering(), "loitering")
        self.assertIsNone(t.check_loitering())  # once per track

    def test_loitering_skips_family(self):
        t = TrackIdentity(3)
        t.state = "family"
        t.created_at = time.time() - 60
        self.assertIsNone(t.check_loitering())

    def test_two_mid_scores_lock_family(self):
        t = TrackIdentity(4)
        t.update_match("mem1", "Cậu Quốc", "family", 0.54, True)
        self.assertFalse(t.is_locked)
        t.update_match("mem1", "Cậu Quốc", "family", 0.61, True)
        self.assertTrue(t.is_locked)
        self.assertEqual(t.state, "family")
        self.assertEqual(t.name, "Cậu Quốc")

    def test_weak_hits_do_not_lock_stranger_after_four_frames(self):
        t = TrackIdentity(5)
        for _ in range(4):
            t.update_match("mem1", "Cậu Quốc", "family", 0.47, True)
        self.assertFalse(t.is_locked)
        self.assertNotEqual(t.state, "stranger")


if __name__ == "__main__":
    unittest.main()
