import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.detection.yolo_onnx import (  # noqa: E402
    YOLOOnnxDetector,
    letterbox,
    scale_boxes_from_letterbox,
)


class LetterboxTests(unittest.TestCase):
    def test_already_target_size_has_no_pad(self):
        frame = np.zeros((384, 640, 3), dtype=np.uint8)
        padded, ratio, pad_w, pad_h = letterbox(frame, 384, 640)
        self.assertEqual(padded.shape[:2], (384, 640))
        self.assertAlmostEqual(ratio, 1.0)
        self.assertEqual(pad_w, 0)
        self.assertEqual(pad_h, 0)

    def test_roundtrip_box_from_letterbox_space(self):
        orig_h, orig_w = 720, 1280
        frame = np.zeros((orig_h, orig_w, 3), dtype=np.uint8)
        padded, ratio, pad_w, pad_h = letterbox(frame, 384, 640)
        self.assertEqual(padded.shape[:2], (384, 640))
        # A person box in original pixels, mapped into letterbox, then back.
        orig = np.array([[100.0, 80.0, 300.0, 500.0]], dtype=np.float32)
        letterboxed = orig.copy()
        letterboxed[:, [0, 2]] = orig[:, [0, 2]] * ratio + pad_w
        letterboxed[:, [1, 3]] = orig[:, [1, 3]] * ratio + pad_h
        restored = scale_boxes_from_letterbox(letterboxed, orig_h, orig_w, ratio, pad_w, pad_h)
        np.testing.assert_allclose(restored, orig, atol=1.5)


class PostprocessTests(unittest.TestCase):
    def _detector(self):
        det = YOLOOnnxDetector.__new__(YOLOOnnxDetector)
        det.conf_thresh = 0.45
        det.iou_thresh = 0.5
        det.input_h, det.input_w = 384, 640
        return det

    def test_end2end_filters_low_conf_and_scales(self):
        det = self._detector()
        # (1, 300, 6) YOLO26 e2e in letterboxed 384x640 space.
        pred = np.zeros((1, 300, 6), dtype=np.float32)
        pred[0, 0] = [80.0, 40.0, 160.0, 200.0, 0.9, 0.0]
        pred[0, 1] = [10.0, 10.0, 20.0, 20.0, 0.1, 0.0]  # below thresh
        orig_h, orig_w = 384, 640
        boxes = det.postprocess([pred], orig_h, orig_w, ratio=1.0, pad_w=0.0, pad_h=0.0)
        self.assertEqual(boxes.shape, (1, 6))
        np.testing.assert_allclose(boxes[0, :4], [80.0, 40.0, 160.0, 200.0], atol=0.5)
        self.assertAlmostEqual(boxes[0, 4], 0.9, places=5)
        self.assertEqual(int(boxes[0, 5]), 0)

    def test_end2end_transposed_layout(self):
        det = self._detector()
        pred = np.zeros((6, 300), dtype=np.float32)
        pred[:, 0] = [80.0, 40.0, 160.0, 200.0, 0.91, 0.0]
        boxes = det.postprocess([pred[None, ...]], 384, 640, 1.0, 0.0, 0.0)
        self.assertEqual(len(boxes), 1)
        self.assertEqual(int(boxes[0, 5]), 0)

    def test_traditional_xywh_with_nms(self):
        det = self._detector()
        # (1, 8, 20) — 4-class custom head (xywh + 4 class scores) x 20 anchors.
        pred = np.zeros((1, 8, 20), dtype=np.float32)
        pred[0, :, 0] = [100, 100, 40, 80, 0.9, 0.05, 0.01, 0.01]
        pred[0, :, 1] = [102, 101, 40, 80, 0.6, 0.05, 0.01, 0.01]
        pred[0, :, 2] = [400, 200, 30, 60, 0.8, 0.02, 0.01, 0.01]
        pred[0, :, 3] = [200, 200, 20, 20, 0.1, 0.0, 0.0, 0.0]
        boxes = det.postprocess([pred], 384, 640, 1.0, 0.0, 0.0)
        self.assertEqual(len(boxes), 2)
        classes = sorted(int(c) for c in boxes[:, 5])
        self.assertEqual(classes, [0, 0])

    def test_runtime_modules_do_not_import_torch(self):
        import ast

        root = os.path.join(os.path.dirname(__file__), "..", "src")
        banned = {"torch", "torchvision", "ultralytics", "boxmot", "lapx"}
        for dirpath, _, files in os.walk(root):
            for name in files:
                if not name.endswith(".py"):
                    continue
                path = os.path.join(dirpath, name)
                with open(path, encoding="utf-8") as fh:
                    tree = ast.parse(fh.read(), filename=path)
                imported = set()
                for node in ast.walk(tree):
                    if isinstance(node, ast.Import):
                        imported.update(alias.name.split(".")[0] for alias in node.names)
                    elif isinstance(node, ast.ImportFrom) and node.module:
                        imported.add(node.module.split(".")[0])
                hits = imported & banned
                self.assertFalse(hits, msg=f"{path} imports banned packages: {hits}")


if __name__ == "__main__":
    unittest.main()
