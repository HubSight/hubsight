import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.detection.byte_tracker import ByteTrack, iou_batch  # noqa: E402


class ByteTrackTests(unittest.TestCase):
    def test_empty_dets_returns_empty(self):
        tracker = ByteTrack()
        out = tracker.update(np.empty((0, 6), dtype=np.float32))
        self.assertEqual(out.shape, (0, 8))

    def test_new_detection_gets_id(self):
        tracker = ByteTrack(track_high_thresh=0.5)
        dets = np.array([[10, 10, 50, 80, 0.9, 0.0]], dtype=np.float32)
        out = tracker.update(dets)
        self.assertEqual(out.shape[0], 1)
        self.assertEqual(int(out[0, 4]), 1)
        self.assertEqual(int(out[0, 6]), 0)

    def test_id_persists_when_box_moves(self):
        tracker = ByteTrack(track_high_thresh=0.5, match_thresh=0.3)
        a = np.array([[10, 10, 50, 80, 0.9, 0.0]], dtype=np.float32)
        b = np.array([[14, 12, 54, 84, 0.88, 0.0]], dtype=np.float32)
        id1 = int(tracker.update(a)[0, 4])
        id2 = int(tracker.update(b)[0, 4])
        self.assertEqual(id1, id2)

    def test_second_person_gets_new_id(self):
        tracker = ByteTrack(track_high_thresh=0.5)
        dets = np.array([
            [10, 10, 50, 80, 0.9, 0.0],
            [200, 20, 250, 100, 0.85, 0.0],
        ], dtype=np.float32)
        out = tracker.update(dets)
        ids = sorted(int(x) for x in out[:, 4])
        self.assertEqual(ids, [1, 2])

    def test_ids_are_per_instance(self):
        a = ByteTrack()
        b = ByteTrack()
        det = np.array([[10, 10, 50, 80, 0.9, 0.0]], dtype=np.float32)
        self.assertEqual(int(a.update(det)[0, 4]), 1)
        self.assertEqual(int(b.update(det)[0, 4]), 1)

    def test_iou_identical_boxes_is_one(self):
        box = np.array([[0, 0, 10, 10]], dtype=np.float32)
        ious = iou_batch(box, box)
        self.assertAlmostEqual(float(ious[0, 0]), 1.0, places=5)

    def test_missed_unconfirmed_track_is_dropped(self):
        tracker = ByteTrack(track_high_thresh=0.5, max_time_lost=15)
        det = np.array([[10, 10, 50, 80, 0.9, 0.0]], dtype=np.float32)
        tracker.update(det)
        out = tracker.update(np.empty((0, 6), dtype=np.float32))
        self.assertEqual(out.shape[0], 0)

    def test_confirmed_track_keeps_id_after_gap(self):
        tracker = ByteTrack(track_high_thresh=0.5, match_thresh=0.3, max_time_lost=15)
        det = np.array([[10, 10, 50, 80, 0.9, 0.0]], dtype=np.float32)
        tracker.update(det)
        tracker.update(det)  # confirm (hits >= 2)
        tid = int(tracker.update(det)[0, 4])
        tracker.update(np.empty((0, 6), dtype=np.float32))  # one miss → lost, not exported
        moved = np.array([[16, 14, 56, 86, 0.87, 0.0]], dtype=np.float32)
        out = tracker.update(moved)
        self.assertEqual(out.shape[0], 1)
        self.assertEqual(int(out[0, 4]), tid)


if __name__ == "__main__":
    unittest.main()
