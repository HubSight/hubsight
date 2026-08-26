"""Enrollment: detect one face, quality-gate, square crop, ArcFace 512D."""

from __future__ import annotations

import base64
import io
import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)

MAX_DECODE_SIDE = 1600
CROP_MARGIN = 0.25
CROP_SIZE = 512
JPEG_QUALITY = 90


class EnrollError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def decode_image(data: bytes) -> np.ndarray:
    if not data:
        raise EnrollError("DECODE_ERROR", "Empty image payload")
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        try:
            from PIL import Image

            pil = Image.open(io.BytesIO(data)).convert("RGB")
            img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
        except Exception as exc:
            raise EnrollError("DECODE_ERROR", f"Could not decode image: {exc}") from exc
    if img is None or img.size == 0:
        raise EnrollError("DECODE_ERROR", "Could not decode image")
    return img


def downscale_for_detect(frame: np.ndarray, max_side: int = MAX_DECODE_SIDE) -> np.ndarray:
    h, w = frame.shape[:2]
    side = max(h, w)
    if side <= max_side:
        return frame
    scale = max_side / float(side)
    return cv2.resize(frame, (int(round(w * scale)), int(round(h * scale))), interpolation=cv2.INTER_AREA)


def square_crop_with_margin(frame: np.ndarray, bbox, margin: float = CROP_MARGIN, out_size: int = CROP_SIZE) -> np.ndarray:
    """Expand bbox by margin, pad to square, resize to out_size. Keeps original pose (not ArcFace 112 aligned)."""
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = [float(v) for v in bbox]
    bw, bh = max(1.0, x2 - x1), max(1.0, y2 - y1)
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    side = max(bw, bh) * (1.0 + 2.0 * margin)

    x1n = int(round(cx - side / 2.0))
    y1n = int(round(cy - side / 2.0))
    x2n = int(round(cx + side / 2.0))
    y2n = int(round(cy + side / 2.0))

    pad_left = max(0, -x1n)
    pad_top = max(0, -y1n)
    pad_right = max(0, x2n - w)
    pad_bottom = max(0, y2n - h)

    x1c, y1c = max(0, x1n), max(0, y1n)
    x2c, y2c = min(w, x2n), min(h, y2n)
    crop = frame[y1c:y2c, x1c:x2c]
    if crop.size == 0:
        raise EnrollError("LOW_QUALITY", "Face crop is empty")

    if pad_left or pad_top or pad_right or pad_bottom:
        crop = cv2.copyMakeBorder(
            crop, pad_top, pad_bottom, pad_left, pad_right,
            cv2.BORDER_CONSTANT, value=(114, 114, 114),
        )

    if crop.shape[0] != out_size or crop.shape[1] != out_size:
        crop = cv2.resize(crop, (out_size, out_size), interpolation=cv2.INTER_LINEAR)
    return crop


def encode_jpeg(image: np.ndarray, quality: int = JPEG_QUALITY) -> bytes:
    ok, buf = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
    if not ok:
        raise EnrollError("DECODE_ERROR", "Failed to encode cropped JPEG")
    return buf.tobytes()


def enroll_from_bytes(face_engine, data: bytes, *, require_quality: bool = True) -> dict:
    """Detect exactly one face, optionally gate quality, return crop JPEG + 512D embedding."""
    if face_engine is None or getattr(face_engine, "app", None) is None:
        raise EnrollError("VISION_UNAVAILABLE", "Face engine is not ready")

    frame = decode_image(data)
    detect_frame = downscale_for_detect(frame)
    scale = frame.shape[1] / float(detect_frame.shape[1])

    with face_engine.infer_lock:
        faces = face_engine.app.get(detect_frame)

    if not faces:
        raise EnrollError("NO_FACE", "No face detected in this photo")
    if len(faces) > 1:
        raise EnrollError("MULTI_FACE", f"Found {len(faces)} faces; enroll requires exactly one")

    face = faces[0]
    bbox = face.bbox
    # Map detect-frame coords back to original
    orig_bbox = (bbox[0] * scale, bbox[1] * scale, bbox[2] * scale, bbox[3] * scale)
    kps = face.kps * scale if face.kps is not None else None

    is_good, q_score, blur, yaw, pitch = face_engine.quality_gate.evaluate(frame, orig_bbox, kps)
    if require_quality and not is_good:
        raise EnrollError(
            "LOW_QUALITY",
            f"Face quality too low (score={q_score}, blur={blur}, yaw={yaw}, pitch={pitch})",
        )

    emb = face.embedding
    if emb is None or len(emb) != 512:
        raise EnrollError("LOW_QUALITY", "Failed to extract 512D embedding")
    norm = float(np.linalg.norm(emb))
    if norm < 1e-5:
        raise EnrollError("LOW_QUALITY", "Embedding is degenerate")
    emb = (emb / norm).astype(np.float32)

    crop = square_crop_with_margin(frame, orig_bbox)
    jpeg = encode_jpeg(crop)

    return {
        "ok": True,
        "crop_jpeg_b64": base64.b64encode(jpeg).decode("ascii"),
        "embedding": [float(x) for x in emb.tolist()],
        "quality_score": float(q_score),
        "yaw": float(yaw),
        "pitch": float(pitch),
        "blur_score": float(blur),
        "det_score": float(getattr(face, "det_score", 0.9)),
    }
