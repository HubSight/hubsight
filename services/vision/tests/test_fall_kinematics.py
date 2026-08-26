import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.detection.fall_kinematics import is_fallen_pose, torso_angle_deg  # noqa: E402
from src.detection.track_identity import TrackIdentity  # noqa: E402
import time


def _kpts(sh, hip, conf=0.9):
    arr = np.zeros((17, 3), dtype=np.float32)
    arr[:, 2] = 0.05
    for i in (5, 6):
        arr[i] = [sh[0], sh[1], conf]
    for i in (11, 12):
        arr[i] = [hip[0], hip[1], conf]
    return arr


class TorsoAngleTests(unittest.TestCase):
    def test_upright_near_zero(self):
        ang = torso_angle_deg(_kpts((100, 40), (100, 180)))
        self.assertIsNotNone(ang)
        self.assertLess(ang, 8)

    def test_horizontal_near_90(self):
        ang = torso_angle_deg(_kpts((200, 100), (40, 100)))
        self.assertIsNotNone(ang)
        self.assertGreater(ang, 80)

    def test_low_conf_returns_none(self):
        k = _kpts((100, 40), (100, 180), conf=0.05)
        self.assertIsNone(torso_angle_deg(k))

    def test_fallen_threshold(self):
        self.assertTrue(is_fallen_pose(55))
        self.assertFalse(is_fallen_pose(20))
        self.assertFalse(is_fallen_pose(None))


class PoseFallTrackTests(unittest.TestCase):
    def test_fall_requires_prior_upright_angle(self):
        t = TrackIdentity(9)
        now = time.time()
        t.check_abnormal_behavior(now - 1.2, torso_angle=12)
        t.check_abnormal_behavior(now - 0.8, torso_angle=15)
        evt = t.check_abnormal_behavior(now, torso_angle=62)
        self.assertEqual(evt, "fall_detected")
        self.assertTrue(t.is_fallen)
        self.assertEqual(t.check_abnormal_behavior(now + 1, torso_angle=70), None)


if __name__ == "__main__":
    unittest.main()
