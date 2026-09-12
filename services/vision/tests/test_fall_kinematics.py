import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.detection.fall_kinematics import (  # noqa: E402
    is_fallen_pose,
    torso_angle_deg,
    head_anchor,
    posture_signal,
    keypoint_span_ratio,
    classify_angle_profile,
)
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


class HeadAnchorTests(unittest.TestCase):
    def test_uses_only_cranial_keypoints(self):
        k = _kpts((100, 40), (100, 180), conf=0.9)
        k[0] = [90, 30, 0.9]  # nose
        k[1] = [110, 32, 0.9]  # left eye
        anchor = head_anchor(k)
        self.assertIsNotNone(anchor)
        self.assertAlmostEqual(float(anchor[0]), 100.0, places=3)
        self.assertAlmostEqual(float(anchor[1]), 31.0, places=3)

    def test_none_when_all_cranial_low_conf(self):
        k = _kpts((100, 40), (100, 180), conf=0.9)
        self.assertIsNone(head_anchor(k))  # no cranial kpts (0-4) set above conf


class PostureSignalTests(unittest.TestCase):
    def test_prone_by_aspect_ratio(self):
        self.assertTrue(posture_signal(box_ar=1.3, span_ratio=None))

    def test_prone_by_span_ratio(self):
        self.assertTrue(posture_signal(box_ar=0.5, span_ratio=1.4))

    def test_upright_neither(self):
        self.assertFalse(posture_signal(box_ar=0.5, span_ratio=0.6))


class KeypointSpanRatioTests(unittest.TestCase):
    def test_horizontal_spread_gt_1(self):
        k = np.zeros((17, 3), dtype=np.float32)
        k[0] = [0, 100, 0.9]
        k[1] = [200, 100, 0.9]
        k[2] = [100, 110, 0.9]
        ratio = keypoint_span_ratio(k)
        self.assertGreater(ratio, 1.0)

    def test_insufficient_points_returns_none(self):
        k = np.zeros((17, 3), dtype=np.float32)
        k[0] = [0, 0, 0.9]
        self.assertIsNone(keypoint_span_ratio(k))


class AngleProfileClassifierTests(unittest.TestCase):
    def test_standard_below_threshold(self):
        self.assertEqual(classify_angle_profile(0.5), "standard")

    def test_high_above_threshold(self):
        self.assertEqual(classify_angle_profile(0.95), "high")

    def test_boundary_is_standard(self):
        self.assertEqual(classify_angle_profile(0.80), "standard")


if __name__ == "__main__":
    unittest.main()
