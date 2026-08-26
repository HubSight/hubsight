"""YOLO pose ONNX detector — bbox + COCO-17 keypoints."""

from __future__ import annotations

import logging

import numpy as np

from .yolo_onnx import YOLOOnnxDetector, _nms_per_class, _xywh_to_xyxy, scale_boxes_from_letterbox

logger = logging.getLogger(__name__)

KPT_DIM = 51  # 17 * 3
POSE_COLS_NO_CLS = 4 + 1 + KPT_DIM  # 56
POSE_COLS_WITH_CLS = 4 + 1 + 1 + KPT_DIM  # 57


class YOLOPoseOnnxDetector(YOLOOnnxDetector):
    """Person detector that also returns 17 COCO keypoints per box."""

    def detect_pose(self, frame: np.ndarray):
        """Return (boxes N×6, kpts N×17×3) in original-frame pixels."""
        orig_h, orig_w = frame.shape[:2]
        blob, ratio, pad_w, pad_h = self.preprocess(frame)
        outputs = self.session.run(None, {self.input_name: blob})
        return self.postprocess_pose(outputs, orig_h, orig_w, ratio, pad_w, pad_h)

    def postprocess_pose(self, outputs, orig_h: int, orig_w: int, ratio: float, pad_w: float, pad_h: float):
        pred = np.asarray(outputs[0])
        if pred.ndim == 3:
            pred = pred[0]
        if pred.ndim != 2:
            logger.warning("Unexpected pose ONNX ndim=%s shape=%s", pred.ndim, getattr(pred, "shape", None))
            return np.empty((0, 6), dtype=np.float32), np.empty((0, 17, 3), dtype=np.float32)

        if self._is_pose_end2end(pred):
            boxes, kpts = self._pose_end2end(pred)
        else:
            boxes, kpts = self._pose_traditional(pred)

        if len(boxes) == 0:
            return np.empty((0, 6), dtype=np.float32), np.empty((0, 17, 3), dtype=np.float32)

        boxes[:, :4] = scale_boxes_from_letterbox(boxes[:, :4], orig_h, orig_w, ratio, pad_w, pad_h)
        kpts[:, :, 0] = (kpts[:, :, 0] - pad_w) / ratio
        kpts[:, :, 1] = (kpts[:, :, 1] - pad_h) / ratio
        kpts[:, :, 0] = np.clip(kpts[:, :, 0], 0, orig_w)
        kpts[:, :, 1] = np.clip(kpts[:, :, 1], 0, orig_h)

        w = boxes[:, 2] - boxes[:, 0]
        h = boxes[:, 3] - boxes[:, 1]
        keep = (w > 1.0) & (h > 1.0)
        return boxes[keep].astype(np.float32, copy=False), kpts[keep].astype(np.float32, copy=False)

    @staticmethod
    def _is_pose_end2end(pred: np.ndarray) -> bool:
        h, w = pred.shape
        if w in (POSE_COLS_NO_CLS, POSE_COLS_WITH_CLS) and h >= 6:
            return True
        if h in (POSE_COLS_NO_CLS, POSE_COLS_WITH_CLS) and w >= 6 and w > h:
            return True
        return False

    def _pose_end2end(self, pred: np.ndarray):
        if pred.shape[0] in (POSE_COLS_NO_CLS, POSE_COLS_WITH_CLS) and pred.shape[1] not in (
            POSE_COLS_NO_CLS,
            POSE_COLS_WITH_CLS,
        ):
            pred = pred.T
        cols = pred.shape[1]
        confs = pred[:, 4]
        mask = confs >= self.conf_thresh
        pred = pred[mask]
        if len(pred) == 0:
            return np.empty((0, 6), dtype=np.float32), np.empty((0, 17, 3), dtype=np.float32)
        cls = pred[:, 5] if cols >= POSE_COLS_WITH_CLS else np.zeros(len(pred), dtype=np.float32)
        kpt_off = 6 if cols >= POSE_COLS_WITH_CLS else 5
        boxes = np.column_stack([pred[:, 0], pred[:, 1], pred[:, 2], pred[:, 3], pred[:, 4], cls]).astype(np.float32)
        kpts = pred[:, kpt_off:kpt_off + KPT_DIM].reshape(-1, 17, 3).astype(np.float32)
        return boxes, kpts

    def _pose_traditional(self, pred: np.ndarray):
        # (4+nc+51, anchors) → transpose to (anchors, C)
        if pred.shape[0] < pred.shape[1] and pred.shape[0] >= POSE_COLS_NO_CLS:
            pred = pred.T
        c = pred.shape[1]
        nc = c - 4 - KPT_DIM
        if nc < 1:
            nc = 1
        boxes_xywh = pred[:, :4]
        scores = pred[:, 4:4 + nc]
        class_ids = np.argmax(scores, axis=1)
        confs = scores[np.arange(len(scores)), class_ids]
        mask = confs >= self.conf_thresh
        boxes_xywh = boxes_xywh[mask]
        confs = confs[mask]
        class_ids = class_ids[mask]
        kpts = pred[mask, 4 + nc:4 + nc + KPT_DIM].reshape(-1, 17, 3)
        if len(boxes_xywh) == 0:
            return np.empty((0, 6), dtype=np.float32), np.empty((0, 17, 3), dtype=np.float32)
        boxes_xyxy = _xywh_to_xyxy(boxes_xywh)
        keep = _nms_per_class(boxes_xyxy, confs, class_ids, self.conf_thresh, self.iou_thresh)
        if keep.size == 0:
            return np.empty((0, 6), dtype=np.float32), np.empty((0, 17, 3), dtype=np.float32)
        boxes = np.column_stack([
            boxes_xyxy[keep],
            confs[keep],
            class_ids[keep].astype(np.float32),
        ]).astype(np.float32)
        return boxes, kpts[keep].astype(np.float32)
