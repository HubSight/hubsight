"""Tests for the §4 fire/smoke two-path verification pipeline."""

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.detection.danger_kinematics import (  # noqa: E402
    DangerCandidateTracker,
    fire_hsv_pass,
    smoke_texture_pass,
)


def _solid_bgr(h, w, bgr):
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :] = bgr
    return img


def _diffuse_gray_bgr(h, w, mean=140, rng=None):
    """Smoke-like: low-saturation gray with a soft (blurred) low-frequency texture."""
    rng = rng or np.random.default_rng(0)
    gray = np.clip(rng.normal(mean, 25, size=(h, w)), 0, 255).astype(np.uint8)
    gray = cv2.GaussianBlur(gray, (11, 11), 0)
    return np.stack([gray, gray, gray], axis=-1)


class FireHsvPassTests(unittest.TestCase):
    def test_warm_saturated_crop_passes(self):
        # BGR orange-red flame-like color: high R, medium G, low B.
        crop = _solid_bgr(20, 20, (10, 90, 220))
        self.assertTrue(fire_hsv_pass(crop))

    def test_specular_glare_rejected(self):
        # Blown-out white highlight: high V, low S.
        crop = _solid_bgr(20, 20, (250, 250, 250))
        self.assertFalse(fire_hsv_pass(crop))

    def test_desaturated_reflection_rejected(self):
        crop = _solid_bgr(20, 20, (180, 180, 190))
        self.assertFalse(fire_hsv_pass(crop))

    def test_empty_crop_rejected(self):
        self.assertFalse(fire_hsv_pass(None))
        self.assertFalse(fire_hsv_pass(np.zeros((0, 0, 3), dtype=np.uint8)))


class SmokeTexturePassTests(unittest.TestCase):
    def test_diffuse_gray_passes(self):
        crop = _diffuse_gray_bgr(40, 40, mean=150)
        self.assertTrue(smoke_texture_pass(crop))

    def test_saturated_object_rejected(self):
        crop = _solid_bgr(40, 40, (10, 90, 220))  # warm/saturated, not smoke-gray
        self.assertFalse(smoke_texture_pass(crop))

    def test_sharp_edged_gray_rejected(self):
        # A hard-edged checkerboard: gray/low-saturation but high Laplacian variance.
        crop = np.zeros((40, 40, 3), dtype=np.uint8)
        crop[::2, :] = 200
        self.assertFalse(smoke_texture_pass(crop))


class DangerCandidateTrackerTests(unittest.TestCase):
    def test_fire_confirms_after_km_persistence_and_instability(self):
        tracker = DangerCandidateTracker()
        box = (10.0, 10.0, 40.0, 40.0)
        confirmed = False
        # 10 observations over ~1.0s with area jittering (real flame flicker) and
        # 8/10 visual passes (>= K=7).
        for i in range(10):
            ts = i * 0.1
            jitter = 4 if i % 2 == 0 else -4
            b = (box[0], box[1], box[2] + jitter, box[3] + jitter)
            visual = i != 2 and i != 5  # 8 of 10 pass
            cand = tracker.observe("fire", b, ts, visual)
            confirmed = tracker.evaluate("fire", cand, ts) or confirmed
        self.assertTrue(confirmed)

    def test_fire_rejected_without_persistence(self):
        tracker = DangerCandidateTracker()
        box = (10.0, 10.0, 40.0, 40.0)
        confirmed = False
        for i in range(10):
            ts = i * 0.1
            visual = i < 3  # only 3/10 — below K=7
            cand = tracker.observe("fire", box, ts, visual)
            confirmed = tracker.evaluate("fire", cand, ts) or confirmed
        self.assertFalse(confirmed)

    def test_fire_rejected_when_static_area(self):
        """A static warm lamp: always visually 'fire-like' but zero area variance."""
        tracker = DangerCandidateTracker()
        box = (10.0, 10.0, 40.0, 40.0)
        confirmed = False
        for i in range(10):
            ts = i * 0.1
            cand = tracker.observe("fire", box, ts, True)
            confirmed = tracker.evaluate("fire", cand, ts) or confirmed
        self.assertFalse(confirmed)

    def test_smoke_confirms_on_growth_and_upward_drift(self):
        tracker = DangerCandidateTracker()
        confirmed = False
        for i in range(20):
            ts = i * 0.1
            # Growing box (area increases ~1.5x by t=2.0s) drifting upward (y shrinks).
            scale = 1.0 + 0.03 * i
            y_top = 40.0 - i * 1.0
            b = (10.0, y_top, 10.0 + 30.0 * scale, y_top + 30.0 * scale)
            cand = tracker.observe("smoke", b, ts, True)
            confirmed = tracker.evaluate("smoke", cand, ts) or confirmed
        self.assertTrue(confirmed)

    def test_smoke_rejected_for_static_pillar(self):
        tracker = DangerCandidateTracker()
        box = (10.0, 10.0, 40.0, 60.0)
        confirmed = False
        for i in range(20):
            ts = i * 0.1
            cand = tracker.observe("smoke", box, ts, True)
            confirmed = tracker.evaluate("smoke", cand, ts) or confirmed
        self.assertFalse(confirmed)


if __name__ == "__main__":
    unittest.main()
