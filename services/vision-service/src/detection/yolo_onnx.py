"""YOLO ONNX Runtime detector.

Supports both YOLO26 end-to-end output (N, 300, 6) xyxy — no NMS — and the
legacy one-to-many head (4+nc, anchors) xywh that still needs NMS. This covers
yolo26n.onnx as well as a custom yolo-cctv.onnx that may have been trained on
an older Ultralytics family.
"""

from __future__ import annotations

import logging
import os

import cv2
import numpy as np
import onnxruntime as ort

logger = logging.getLogger(__name__)

LETTERBOX_COLOR = (114, 114, 114)


def letterbox(frame: np.ndarray, input_h: int, input_w: int):
    """Ultralytics-style letterbox: keep aspect ratio, pad with gray (114).

    Returns (padded_bgr, ratio, pad_w, pad_h) where pad is the left/top inset
    in the letterboxed image. Boxes from the model live in this padded space
    and must be mapped back with scale_boxes_from_letterbox.
    """
    orig_h, orig_w = frame.shape[:2]
    ratio = min(input_h / orig_h, input_w / orig_w)
    new_w = int(round(orig_w * ratio))
    new_h = int(round(orig_h * ratio))
    resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR) if (new_w, new_h) != (orig_w, orig_h) else frame
    pad_w = (input_w - new_w) / 2.0
    pad_h = (input_h - new_h) / 2.0
    top = int(round(pad_h - 0.1))
    left = int(round(pad_w - 0.1))
    bottom = input_h - new_h - top
    right = input_w - new_w - left
    padded = cv2.copyMakeBorder(
        resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=LETTERBOX_COLOR
    )
    return padded, ratio, left, top


def scale_boxes_from_letterbox(boxes_xyxy: np.ndarray, orig_h: int, orig_w: int, ratio: float, pad_w: float, pad_h: float) -> np.ndarray:
    """Map boxes from letterboxed input pixels back to the original frame."""
    if boxes_xyxy.size == 0:
        return boxes_xyxy
    out = boxes_xyxy.copy()
    out[:, [0, 2]] = (out[:, [0, 2]] - pad_w) / ratio
    out[:, [1, 3]] = (out[:, [1, 3]] - pad_h) / ratio
    out[:, [0, 2]] = np.clip(out[:, [0, 2]], 0, orig_w)
    out[:, [1, 3]] = np.clip(out[:, [1, 3]], 0, orig_h)
    return out


def _xywh_to_xyxy(xywh: np.ndarray) -> np.ndarray:
    x, y, w, h = xywh[:, 0], xywh[:, 1], xywh[:, 2], xywh[:, 3]
    return np.stack([x - w / 2, y - h / 2, x + w / 2, y + h / 2], axis=1)


def _nms_per_class(boxes: np.ndarray, confs: np.ndarray, class_ids: np.ndarray, conf_thresh: float, iou_thresh: float) -> np.ndarray:
    """boxes are xyxy. OpenCV NMSBoxes expects (x, y, w, h) top-left + size."""
    if len(boxes) == 0:
        return np.empty((0,), dtype=np.int64)
    keep_idx = []
    for cls in np.unique(class_ids):
        cls_mask = class_ids == cls
        cls_indices = np.where(cls_mask)[0]
        xyxy = boxes[cls_mask]
        xywh = np.column_stack([
            xyxy[:, 0],
            xyxy[:, 1],
            xyxy[:, 2] - xyxy[:, 0],
            xyxy[:, 3] - xyxy[:, 1],
        ])
        nms = cv2.dnn.NMSBoxes(
            xywh.tolist(),
            confs[cls_mask].tolist(),
            conf_thresh,
            iou_thresh,
        )
        if nms is None or len(nms) == 0:
            continue
        nms = np.array(nms).flatten()
        keep_idx.extend(cls_indices[nms])
    if not keep_idx:
        return np.empty((0,), dtype=np.int64)
    return np.array(keep_idx, dtype=np.int64)


class YOLOOnnxDetector:
    """Drop-in YOLO detector backed by ONNX Runtime (no PyTorch)."""

    def __init__(self, model_path: str, input_size=(384, 640), conf_thresh=0.45, iou_thresh=0.5):
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"YOLO ONNX model not found: {model_path}")

        self.conf_thresh = conf_thresh
        self.iou_thresh = iou_thresh
        self.model_path = model_path

        sess_options = ort.SessionOptions()
        intra = int(os.getenv("ORT_INTRA_OP_NUM_THREADS", "2"))
        sess_options.intra_op_num_threads = max(1, intra)
        sess_options.inter_op_num_threads = 1
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

        self.session = ort.InferenceSession(
            model_path,
            sess_options=sess_options,
            providers=["CPUExecutionProvider"],
        )
        self.input_name = self.session.get_inputs()[0].name
        shape = self.session.get_inputs()[0].shape  # [N, C, H, W]
        if len(shape) == 4 and isinstance(shape[2], int) and isinstance(shape[3], int):
            self.input_h, self.input_w = int(shape[2]), int(shape[3])
        else:
            self.input_h, self.input_w = int(input_size[0]), int(input_size[1])

        out_shapes = [(o.name, o.shape) for o in self.session.get_outputs()]
        logger.info(
            "YOLO ONNX loaded %s input=%s (%dx%d) outputs=%s providers=%s",
            model_path,
            self.input_name,
            self.input_h,
            self.input_w,
            out_shapes,
            self.session.get_providers(),
        )

    def preprocess(self, frame: np.ndarray):
        padded, ratio, pad_w, pad_h = letterbox(frame, self.input_h, self.input_w)
        img = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB)
        blob = img.astype(np.float32) / 255.0
        blob = np.transpose(blob, (2, 0, 1))[None, ...]
        blob = np.ascontiguousarray(blob)
        return blob, ratio, pad_w, pad_h

    def postprocess(self, outputs, orig_h: int, orig_w: int, ratio: float, pad_w: float, pad_h: float) -> np.ndarray:
        """Return (N, 6) float32 array [x1, y1, x2, y2, conf, cls_id] in original-frame pixels."""
        pred = np.asarray(outputs[0])
        if pred.ndim == 3:
            pred = pred[0]
        if pred.ndim != 2:
            logger.warning("Unexpected YOLO ONNX output ndim=%s shape=%s", pred.ndim, getattr(pred, "shape", None))
            return np.empty((0, 6), dtype=np.float32)

        if self._is_end2end(pred):
            boxes = self._postprocess_end2end(pred)
        else:
            boxes = self._postprocess_traditional(pred)

        if len(boxes) == 0:
            return np.empty((0, 6), dtype=np.float32)

        boxes[:, :4] = scale_boxes_from_letterbox(boxes[:, :4], orig_h, orig_w, ratio, pad_w, pad_h)
        # Drop degenerate boxes after unpadding.
        w = boxes[:, 2] - boxes[:, 0]
        h = boxes[:, 3] - boxes[:, 1]
        boxes = boxes[(w > 1.0) & (h > 1.0)]
        return boxes.astype(np.float32, copy=False)

    @staticmethod
    def _is_end2end(pred: np.ndarray) -> bool:
        """YOLO26 e2e is (300, 6) or (6, 300); legacy is (4+nc, anchors) with 4+nc typically 6–90."""
        h, w = pred.shape
        if w in (6, 7) and h >= 6:
            return True
        if h in (6, 7) and w >= 6 and w > h:
            return True
        return False

    def _postprocess_end2end(self, pred: np.ndarray) -> np.ndarray:
        # (300, 6) [x1, y1, x2, y2, conf, class_id] — already NMS'd.
        if pred.shape[0] in (6, 7) and pred.shape[1] not in (6, 7):
            pred = pred.T
        confs = pred[:, 4]
        mask = confs >= self.conf_thresh
        pred = pred[mask]
        if len(pred) == 0:
            return np.empty((0, 6), dtype=np.float32)
        boxes = np.column_stack([
            pred[:, 0], pred[:, 1], pred[:, 2], pred[:, 3],
            pred[:, 4], pred[:, 5],
        ]).astype(np.float32)
        return boxes

    def _postprocess_traditional(self, pred: np.ndarray) -> np.ndarray:
        # (4+nc, anchors) or (anchors, 4+nc) — xywh + per-class scores, needs NMS.
        # ONNX legacy head is (4+nc, anchors). 4+nc is typically 5–90.
        if 5 <= pred.shape[0] <= 90 and pred.shape[1] > pred.shape[0]:
            pred = pred.T
        boxes_xywh = pred[:, :4]
        scores = pred[:, 4:]
        if scores.size == 0:
            return np.empty((0, 6), dtype=np.float32)
        class_ids = np.argmax(scores, axis=1)
        confs = scores[np.arange(len(scores)), class_ids]
        mask = confs >= self.conf_thresh
        boxes_xywh = boxes_xywh[mask]
        confs = confs[mask]
        class_ids = class_ids[mask]
        if len(boxes_xywh) == 0:
            return np.empty((0, 6), dtype=np.float32)

        boxes_xyxy = _xywh_to_xyxy(boxes_xywh)
        keep = _nms_per_class(boxes_xyxy, confs, class_ids, self.conf_thresh, self.iou_thresh)
        if keep.size == 0:
            return np.empty((0, 6), dtype=np.float32)
        return np.column_stack([
            boxes_xyxy[keep],
            confs[keep],
            class_ids[keep].astype(np.float32),
        ]).astype(np.float32)

    def detect(self, frame: np.ndarray) -> np.ndarray:
        orig_h, orig_w = frame.shape[:2]
        blob, ratio, pad_w, pad_h = self.preprocess(frame)
        outputs = self.session.run(None, {self.input_name: blob})
        return self.postprocess(outputs, orig_h, orig_w, ratio, pad_w, pad_h)
