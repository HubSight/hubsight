import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.recognition.face_quality_gate import FaceQualityGate  # noqa: E402


def _sharp_face_crop(size=160):
    rng = np.random.default_rng(0)
    return rng.integers(0, 255, size=(size, size, 3), dtype=np.uint8)


def _kps_for_pitch(pitch_deg, eye_dist=60.0):
    """5-point landmarks (left eye, right eye, nose, left mouth, right mouth)
    reverse-engineered from FaceQualityGate.estimate_pose's own pitch formula
    so the test drives a specific pitch value rather than guessing coordinates."""
    left_eye = (100.0, 100.0)
    right_eye = (100.0 + eye_dist, 100.0)
    nose = (100.0 + eye_dist / 2.0, 130.0)
    pitch_ratio = pitch_deg / 45.0 + 1.0
    nose_dy = nose[1] - 100.0
    mouth_dy = nose_dy / pitch_ratio
    mouth_y = nose[1] + mouth_dy
    left_mouth = (100.0 + eye_dist / 2.0 - 10.0, mouth_y)
    right_mouth = (100.0 + eye_dist / 2.0 + 10.0, mouth_y)
    return [left_eye, right_eye, nose, left_mouth, right_mouth]


class FaceQualityGateTests(unittest.TestCase):
    def setUp(self):
        self.gate = FaceQualityGate()
        self.frame = np.full((720, 1280, 3), 128, dtype=np.uint8)
        h, w = self.frame.shape[:2]
        rng = np.random.default_rng(1)
        self.frame[:] = rng.integers(0, 255, size=(h, w, 3), dtype=np.uint8)
        self.bbox = (400, 200, 560, 360)  # 160x160

    def test_moderate_pitch_within_default_threshold_passes_pose_check(self):
        kps = _kps_for_pitch(20.0)
        is_good, _, _, _, pitch = self.gate.evaluate(self.frame, self.bbox, kps)
        self.assertLess(abs(pitch), self.gate.max_pitch)

    def test_overhead_pitch_beyond_default_threshold_is_rejected(self):
        # A steep ceiling-mount angle (e.g. the "high angle" ~45-70 deg pitch
        # cameras documented in HIGH_ANGLE_VISION_STRATEGY.md) must fail the
        # pose gate even when size/blur are otherwise perfect, since matches
        # this far off-axis are known-unreliable rather than merely lower
        # confidence (see the max_pitch rationale comment in the source file).
        kps = _kps_for_pitch(55.0)
        is_good, _, _, _, pitch = self.gate.evaluate(self.frame, self.bbox, kps)
        self.assertGreater(abs(pitch), self.gate.max_pitch)
        self.assertFalse(is_good)

    def test_too_small_face_rejected_regardless_of_pose(self):
        is_good, quality_score, *_ = self.gate.evaluate(
            self.frame, (400, 200, 410, 210), kps=_kps_for_pitch(0.0)
        )
        self.assertFalse(is_good)
        self.assertLess(quality_score, 0.4)


if __name__ == "__main__":
    unittest.main()
