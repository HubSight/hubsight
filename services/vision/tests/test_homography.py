"""Tests for §2.4 opt-in ground-plane homography (fixed cameras only)."""

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.detection.homography import (  # noqa: E402
    LandmarkShiftChecker,
    compute_homography,
    parse_points,
    project_to_bev,
)

POINTS_JSON = '[{"x":0.1,"y":0.1},{"x":0.9,"y":0.1},{"x":0.9,"y":0.9},{"x":0.1,"y":0.9}]'


def _frame_with_corner_markers(pts_norm, w=640, h=384, shift_x=0):
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    for x, y in pts_norm:
        cx, cy = int(x * w) + shift_x, int(y * h)
        cv2.rectangle(frame, (cx - 15, cy - 15), (cx + 15, cy + 15), (0, 255, 0), -1)
    return frame


class ParsePointsTests(unittest.TestCase):
    def test_valid_json(self):
        pts = parse_points(POINTS_JSON)
        self.assertEqual(pts.shape, (4, 2))

    def test_empty_or_malformed(self):
        self.assertIsNone(parse_points(""))
        self.assertIsNone(parse_points("not json"))
        self.assertIsNone(parse_points("[{\"x\":0.1,\"y\":0.1}]"))  # only 1 point


class ComputeHomographyTests(unittest.TestCase):
    def test_maps_corners_onto_unit_square(self):
        pts = parse_points(POINTS_JSON)
        h_matrix = compute_homography(pts)
        self.assertIsNotNone(h_matrix)
        bev = project_to_bev(h_matrix, (0.1, 0.1))
        self.assertAlmostEqual(bev[0], 0.0, places=2)
        self.assertAlmostEqual(bev[1], 0.0, places=2)
        bev2 = project_to_bev(h_matrix, (0.9, 0.9))
        self.assertAlmostEqual(bev2[0], 1.0, places=2)
        self.assertAlmostEqual(bev2[1], 1.0, places=2)

    def test_none_without_matrix(self):
        self.assertIsNone(project_to_bev(None, (0.5, 0.5)))
        self.assertIsNone(compute_homography(None))


class LandmarkShiftCheckerTests(unittest.TestCase):
    def test_unchanged_scene_stays_valid(self):
        pts = parse_points(POINTS_JSON)
        frame = _frame_with_corner_markers(pts)
        checker = LandmarkShiftChecker()
        checker.arm(frame, pts)
        self.assertTrue(checker.check(frame, now=1000.0))

    def test_bumped_camera_invalidates(self):
        pts = parse_points(POINTS_JSON)
        frame = _frame_with_corner_markers(pts)
        shifted = _frame_with_corner_markers(pts, shift_x=60)  # ~9% of frame width
        checker = LandmarkShiftChecker()
        checker.arm(frame, pts)
        self.assertFalse(checker.check(shifted, now=1031.0))

    def test_check_before_interval_is_a_noop_pass(self):
        pts = parse_points(POINTS_JSON)
        frame = _frame_with_corner_markers(pts)
        shifted = _frame_with_corner_markers(pts, shift_x=60)
        checker = LandmarkShiftChecker()
        checker.arm(frame, pts)
        checker.last_check = 1000.0
        # Still within the 30s cadence -> should not re-check yet, reports valid.
        self.assertTrue(checker.check(shifted, now=1000.5))

    def test_unarmed_checker_always_valid(self):
        checker = LandmarkShiftChecker()
        frame = np.zeros((384, 640, 3), dtype=np.uint8)
        self.assertTrue(checker.check(frame, now=1000.0))


if __name__ == "__main__":
    unittest.main()
