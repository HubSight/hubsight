# Kế Hoạch: Migrate vision-service từ PyTorch → ONNX Runtime

## Mục tiêu

Loại bỏ hoàn toàn phụ thuộc vào `torch` và `torchvision` khỏi `vision-service` để:

- **Giảm Docker image**: từ ~2.78GB xuống ~1.5–1.8GB (tiết kiệm ~1GB)
- **Giảm RAM runtime**: từ ~1–1.2GB xuống ~400–600MB
- **Tăng tốc inference CPU**: nhanh hơn ~30–50% nhờ ONNX Runtime backend tối ưu
- **Khởi động nhanh hơn**: model load ~0.5–1s thay vì ~3–5s

## Bối Cảnh Hiện Tại

### Các file cần thay đổi

| File | Vấn đề |
|---|---|
| `src/detection/detector.py` | Dùng `from ultralytics import YOLO` — gọi `self.model.track(...)` trả về đối tượng PyTorch |
| `requirements.txt` | Có `torch`, `torchvision`, `ultralytics`, `lapx` — tổng ~900MB |
| `Dockerfile` | Stage model-fetcher dùng PyTorch để warmup model |

### Luồng xử lý hiện tại trong `detector.py`

`
frame (numpy ndarray)
  → self.model.track(frame, tracker="bytetrack.yaml")   # PyTorch + lapx ByteTrack
  → result.boxes  (PyTorch Tensor)
      ├── box.xyxy   → tolist()
      ├── box.cls    → int()
      ├── box.conf   → float()
      └── box.id     → int()  (track ID từ ByteTrack)
`

### Thách thức chính

`lapx` (ByteTrack tracker) phụ thuộc vào PyTorch tensor. Khi bỏ PyTorch, phải thay thế bằng
một tracker thuần numpy. Thư viện `boxmot` hỗ trợ ByteTrack thuần numpy và tương thích
với đầu vào ONNX (numpy array thay vì tensor).

---

## Kế Hoạch Thực Hiện

### Bước 1: Export model YOLO26n sang ONNX

Tạo file `services/vision-service/export_yolo_onnx.py`:

`python
# export_yolo_onnx.py
from ultralytics import YOLO
import os

for model_name in ["yolo-cctv.pt", "yolo26n.pt"]:
    if os.path.exists(model_name):
        model = YOLO(model_name)
        model.export(
            format="onnx",
            imgsz=(384, 640),
            opset=17,
            simplify=True,
            dynamic=False,
            half=False,
        )
        onnx_name = model_name.replace(".pt", ".onnx")
        print(f"Exported {onnx_name} OK")
`

> **Lưu ý:** YOLO26n export sang ONNX chỉ là backbone detection (boxes + scores + classes),
> **không có** tracker. Tracker phải xử lý ở phía Python riêng.

---

### Bước 2: Thay thế Tracker

Thay `lapx` (ByteTrack PyTorch) bằng `boxmot` — hỗ trợ ByteTrack thuần numpy.
Pin cứng version trong requirements: `boxmot==11.0.0`

`python
from boxmot import ByteTrack
import numpy as np

tracker = ByteTrack()
# detections: np.array shape (N, 6) — [x1, y1, x2, y2, conf, cls_id]
dets = np.array([[x1, y1, x2, y2, conf, cls_id], ...])
tracks = tracker.update(dets, frame)
# tracks: np.array shape (M, 8) — [x1, y1, x2, y2, track_id, conf, cls_id, det_idx]
`

---

### Bước 3: Tạo file `src/detection/yolo_onnx.py` (MỚI HOÀN TOÀN)

`python
import cv2
import numpy as np
import onnxruntime as ort

class YOLOOnnxDetector:
    """Drop-in replacement cho ultralytics YOLO, chạy thuần ONNX Runtime."""

    def __init__(self, model_path: str, input_size=(384, 640), conf_thresh=0.45, iou_thresh=0.5):
        self.input_h, self.input_w = input_size
        self.conf_thresh = conf_thresh
        self.iou_thresh = iou_thresh

        sess_options = ort.SessionOptions()
        sess_options.inter_op_num_threads = 2   # phù hợp server 4 nhân ARM
        sess_options.intra_op_num_threads = 2
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self.session = ort.InferenceSession(
            model_path,
            sess_options=sess_options,
            providers=["CPUExecutionProvider"]
        )
        self.input_name = self.session.get_inputs()[0].name

    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """BGR HWC → RGB NCHW float32 [0,1]."""
        img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (self.input_w, self.input_h), interpolation=cv2.INTER_LINEAR)
        img = img.astype(np.float32) / 255.0
        img = img.transpose(2, 0, 1)
        img = np.expand_dims(img, axis=0)
        return img

    def postprocess(self, outputs, orig_h, orig_w) -> np.ndarray:
        """
        Parse ONNX output → (N, 6) numpy array [x1, y1, x2, y2, conf, cls_id].
        YOLO26 ONNX output shape thường là: [1, 4+num_classes, num_anchors].
        KIỂM TRA lại shape thực tế bằng sess.get_outputs() trước khi deploy.
        """
        pred = outputs[0][0].T          # (N, 4+num_classes)
        boxes_xywh = pred[:, :4]
        scores = pred[:, 4:]
        class_ids = np.argmax(scores, axis=1)
        confs = scores[np.arange(len(scores)), class_ids]

        mask = confs >= self.conf_thresh
        boxes_xywh = boxes_xywh[mask]
        confs = confs[mask]
        class_ids = class_ids[mask]

        if len(boxes_xywh) == 0:
            return np.empty((0, 6), dtype=np.float32)

        sx = orig_w / self.input_w
        sy = orig_h / self.input_h
        x1 = (boxes_xywh[:, 0] - boxes_xywh[:, 2] / 2) * sx
        y1 = (boxes_xywh[:, 1] - boxes_xywh[:, 3] / 2) * sy
        x2 = (boxes_xywh[:, 0] + boxes_xywh[:, 2] / 2) * sx
        y2 = (boxes_xywh[:, 1] + boxes_xywh[:, 3] / 2) * sy
        boxes_xyxy = np.stack([x1, y1, x2, y2], axis=1)

        keep = []
        for cls in np.unique(class_ids):
            cls_mask = class_ids == cls
            cls_indices = np.where(cls_mask)[0]
            nms_idx = cv2.dnn.NMSBoxes(
                boxes_xyxy[cls_mask].tolist(), confs[cls_mask].tolist(),
                self.conf_thresh, self.iou_thresh
            )
            if len(nms_idx) > 0:
                keep.extend(cls_indices[nms_idx.flatten()])

        if not keep:
            return np.empty((0, 6), dtype=np.float32)

        return np.column_stack([
            boxes_xyxy[keep],
            confs[keep],
            class_ids[keep].astype(np.float32)
        ])

    def detect(self, frame: np.ndarray) -> np.ndarray:
        orig_h, orig_w = frame.shape[:2]
        blob = self.preprocess(frame)
        outputs = self.session.run(None, {self.input_name: blob})
        return self.postprocess(outputs, orig_h, orig_w)
`

---

### Bước 4: Sửa `src/detection/detector.py`

Chỉ thay đổi phần khởi tạo và vòng lặp xử lý kết quả. Logic identity/track/notification giữ nguyên.

`python
# THÊM import
from .yolo_onnx import YOLOOnnxDetector
from boxmot import ByteTrack
import numpy as np

# XÓA import
# from ultralytics import YOLO

class PersonDetector:
    def __init__(self, mq_client, face_engine=None, conf_threshold=0.45, iou_threshold=0.5, no_person_timeout=4.0):
        # THAY: self.model = YOLO(...)
        model_name = 'yolo-cctv.onnx' if os.path.exists('yolo-cctv.onnx') else 'yolo26n.onnx'
        self.detector = YOLOOnnxDetector(model_name, input_size=(384, 640),
                                          conf_thresh=conf_threshold, iou_thresh=iou_threshold)
        # ... giữ nguyên các thuộc tính còn lại

    def _get_cam_state(self, camera_id):
        if camera_id not in self.camera_states:
            self.camera_states[camera_id] = {
                'state': 'NO_PERSON',
                'last_person_time': 0,
                'motion_gate': MotionGate(),
                'last_boxes': [],
                'tracks': {},
                'tracker': ByteTrack(),   # ← MỖI CAMERA CÓ TRACKER RIÊNG
            }
        return self.camera_states[camera_id]

    def process_frame(self, frame, camera_id="default", camera_name=""):
        cam = self._get_cam_state(camera_id)
        current_time = time.time()

        # Motion gate giữ nguyên
        is_moving = cam['motion_gate'].has_motion(frame)
        person_present = cam['state'] == 'PERSON_PRESENT'
        if not is_moving and not person_present:
            return False, []

        # THAY: self.model.track(...)
        orig_h, orig_w = frame.shape[:2]
        dets = self.detector.detect(frame)  # (N, 6)
        tracks = cam['tracker'].update(
            dets if len(dets) > 0 else np.empty((0, 6), dtype=np.float32),
            frame
        )  # (M, 8): [x1, y1, x2, y2, track_id, conf, cls_id, det_idx]

        person_detected = False
        boxes = []
        active_track_ids = set()

        for track in tracks:
            x1, y1, x2, y2, track_id, conf, cls_id, _ = track
            x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
            track_id = int(track_id)
            cls_id = int(cls_id)
            conf = round(float(conf), 2)

            if conf < self.conf_threshold:
                continue

            # --- Danger Classes (1=smoke, 2=fire, 3=weapon) ---
            if cls_id in self.danger_classes:
                # ... giữ nguyên logic danger hiện tại ...
                pass

            # --- Person Class (0) ---
            if cls_id == 0:
                # ... giữ nguyên toàn bộ logic identity/face recognition ...
                # Chỉ thay box.xyxy[0].tolist() bằng x1,y1,x2,y2 từ track
                pass

        # ... phần còn lại của process_frame giữ nguyên
`

---

### Bước 5: Cập nhật `requirements.txt`

`
# TRƯỚC:
--extra-index-url https://download.pytorch.org/whl/cpu
torch
torchvision
opencv-python-headless
ultralytics
lapx
pika
python-dotenv
requests
insightface>=0.7.3
onnxruntime>=1.20.0
numpy>=1.26.0
scikit-learn

# SAU:
opencv-python-headless
onnxruntime>=1.20.0
boxmot==11.0.0
pika
python-dotenv
requests
insightface>=0.7.3
numpy>=1.26.0
scikit-learn
`

---

### Bước 6: Cập nhật `Dockerfile`

`dockerfile
# syntax=docker/dockerfile:1.7

# Stage 1: proto-builder (giữ nguyên)
FROM python:3.11-slim AS proto-builder
# ... không đổi

# Stage 2: model-fetcher — dùng torch TẠM THỜI chỉ để export ONNX
FROM python:3.11-slim AS model-fetcher
WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1 libxcb1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Cài torch/ultralytics chỉ để export — không copy vào runtime image
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install opencv-python-headless numpy onnxruntime insightface requests onnx && \
    pip install --extra-index-url https://download.pytorch.org/whl/cpu \
        torch torchvision ultralytics

# Tải buffalo_s InsightFace models
RUN python -c "from insightface.app import FaceAnalysis; \
    app = FaceAnalysis(name='buffalo_s', root='/root/.insightface', providers=['CPUExecutionProvider']); \
    app.prepare(ctx_id=-1, det_size=(320, 320)); print('InsightFace OK')"

# Export YOLO26n.pt → YOLO26n.onnx
COPY services/vision-service/export_yolo_onnx.py .
RUN python -c "from ultralytics import YOLO; \
    m = YOLO('yolo26n.pt'); \
    m.export(format='onnx', imgsz=(384,640), opset=17, simplify=True, dynamic=False, half=False); \
    print('yolo26n.onnx exported OK')"

# Stage 3: runtime — KHÔNG có torch
FROM python:3.11-slim AS runtime
WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY services/vision-service/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt && \
    find /usr/local/lib -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

COPY --from=model-fetcher /app/yolo26n.onnx ./yolo26n.onnx
COPY --from=model-fetcher /root/.insightface /root/.insightface
COPY --from=proto-builder /app/pb ./pb
COPY services/vision-service .

ENV YOLO_OFFLINE=1
ENV ULTRALYTICS_SETTINGS_DIR=/tmp/Ultralytics
CMD ["python", "-u", "main.py"]
`

---

## Tóm Tắt Các File Cần Tạo/Sửa

| Hành động | File | Nội dung chính |
|---|---|---|
| **[TẠO MỚI]** | `export_yolo_onnx.py` | Script export .pt → .onnx |
| **[TẠO MỚI]** | `src/detection/yolo_onnx.py` | Class `YOLOOnnxDetector` |
| **[SỬA]** | `src/detection/detector.py` | Thay YOLO+lapx bằng YOLOOnnxDetector+ByteTrack |
| **[SỬA]** | `requirements.txt` | Xóa torch/torchvision/ultralytics/lapx; thêm boxmot |
| **[SỬA]** | `Dockerfile` | Stage model-fetcher export ONNX; runtime không cài torch |

---

## Kết Quả Dự Kiến

| Chỉ số | Trước | Sau |
|---|---|---|
| Docker image size | ~2.78 GB | ~1.5–1.8 GB |
| RAM khi idle | ~600–800 MB | ~150–250 MB |
| RAM khi inference | ~1–1.2 GB | ~400–600 MB |
| Tốc độ inference CPU | baseline | nhanh hơn ~30–50% |
| Thời gian khởi động | ~3–5s | ~0.5–1s |

---

## Rủi Ro & Lưu Ý Quan Trọng

1. **Kiểm tra ONNX output shape TRƯỚC:** Chạy lệnh sau ngay sau khi export để xác nhận
   shape thực tế trước khi viết `postprocess()`:
   `python
   import onnxruntime as ort
   sess = ort.InferenceSession("yolo26n.onnx")
   for o in sess.get_outputs():
       print(o.name, o.shape)
   `

2. **Custom model `yolo-cctv.pt`:** Nếu có, script `export_yolo_onnx.py` cũng cần export nó.

3. **`boxmot` version:** Pin cứng `boxmot==11.0.0` trong requirements. API thay đổi giữa version.

4. **Tracker per-camera:** `ByteTrack` phải khởi tạo riêng biệt cho mỗi camera trong
   `_get_cam_state()`. Không share tracker.

5. **InsightFace không thay đổi:** `face_engine.py` đã dùng onnxruntime, không cần sửa.
