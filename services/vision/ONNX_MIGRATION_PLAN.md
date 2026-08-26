# Kế Hoạch: Migrate vision-service từ PyTorch → ONNX Runtime

## Mục tiêu

Loại bỏ hoàn toàn phụ thuộc vào `torch` và `torchvision` khỏi **runtime** `vision-service` để:

- **Giảm Docker image**: từ ~2.78GB xuống ~1.5–1.8GB
- **Giảm RAM runtime**: từ ~1–1.2GB xuống ~400–600MB
- **Tăng tốc inference CPU**: ONNX Runtime thay cho PyTorch eager
- **Khởi động nhanh hơn**: load `.onnx` thay vì `ultralytics.YOLO(.pt)`

Torch vẫn được dùng **một lần** trong Docker stage `model-fetcher` để export ONNX, rồi bị loại khỏi image runtime.

---

## Đánh giá bản kế hoạch cũ — những chỗ đã sửa

| # | Vấn đề trong plan gốc | Hệ quả | Cách làm đúng |
|---|---|---|---|
| 1 | Postprocess giả định YOLO output `(N, 4+nc)` xywh + NMS | **YOLO26 export mặc định là end-to-end `(1, 300, 6)` xyxy, không NMS**. Parse sai → 0 box hoặc box lệch | Hỗ trợ cả hai: e2e `(300, 6)` và legacy `(4+nc, anchors)` |
| 2 | Dùng `boxmot==11.0.0` thay lapx | `boxmot` **phụ thuộc `torch` + `torchvision` + `timm`**, AGPL-3.0 — phá mục tiêu bỏ PyTorch | ByteTrack thuần NumPy trong `byte_tracker.py` |
| 3 | `cv2.resize` thẳng lên 384×640 (méo tỉ lệ) | Box lệch so với Ultralytics letterbox (pad 114) | Letterbox giữ aspect ratio, map box ngược về frame gốc |
| 4 | `cv2.dnn.NMSBoxes` nhận xyxy | OpenCV NMSBoxes nhận **(x, y, w, h)** | Convert xyxy → xywh trước NMS (chỉ nhánh legacy) |
| 5 | `ultralytics.YOLO.track(persist=True)` dùng chung 1 model | Nhiều camera **dùng chung tracker ID** (race) | `ByteTrack()` **per camera** trong `_get_cam_state` |
| 6 | `yolo26n` COCO class 1/2/3 = bicycle/car/motorcycle | Plan giữ danger mapping smoke/fire/weapon → **false alarm** | Danger classes chỉ bật khi model là `yolo-cctv.onnx` |
| 7 | Claim RAM/latency cụ thể như SLA | Chưa đo trên hardware thật | Giữ là mục tiêu; đo sau khi build |

Identity / quality gate / RabbitMQ / motion gate **không đổi**.

---

## Kiến trúc runtime

```
frame (numpy BGR)
  → MotionGate
  → YOLOOnnxDetector.detect()          # ONNX Runtime, letterbox + e2e/legacy postprocess
  → ByteTrack.update(dets, frame)      # per-camera, numpy Kalman + greedy IoU
  → TrackIdentity + FaceEngine         # giữ nguyên (InsightFace vốn đã ONNX)
```

---

## Files

| Hành động | File |
|---|---|
| **Tạo** | `src/detection/yolo_onnx.py` |
| **Tạo** | `src/detection/byte_tracker.py` |
| **Tạo** | `export_yolo_onnx.py` |
| **Tạo** | `tests/test_yolo_onnx.py`, `tests/test_byte_tracker.py` |
| **Sửa** | `src/detection/detector.py` |
| **Sửa** | `requirements.txt` (xóa torch/ultralytics/lapx; **không** thêm boxmot) |
| **Sửa** | `Dockerfile` (model-fetcher export ONNX; runtime không cài torch) |

---

## Runtime requirements.txt

```
opencv-python-headless
onnxruntime>=1.20.0
pika
python-dotenv
requests
insightface>=0.7.3
numpy>=1.26.0
scikit-learn
```

---

## YOLO26 output

Export mặc định (`end2end=True`):

```
(1, 300, 6) = [x1, y1, x2, y2, conf, class_id]   # đã NMS, toạ độ letterbox
```

Chỉ filter conf. Map letterbox → frame gốc.

Nếu custom `yolo-cctv` là head cũ:

```
(1, 4+nc, anchors) xywh + class scores → NMS theo class
```

`export_yolo_onnx.py` in shape lúc Docker build để xác nhận.

---

## Tracker

- Một `ByteTrack` cho mỗi camera (không share).
- High/low score association (ByteTrack chuẩn).
- Greedy IoU — đủ vì mỗi frame CCTV nhà thường 0–5 người.
- Track ID local theo camera, không dùng class-level counter toàn cục.

---

## Lưu ý triển khai

1. **Không cài boxmot** — kéo torch trở lại.
2. **Letterbox bắt buộc** — không stretch resize.
3. **Danger class** chỉ với `yolo-cctv.onnx`.
4. ONNX Runtime `InferenceSession.run` thread-safe; FaceEngine có `infer_lock` vì InsightFace `app.get()` thì không.
5. Build: `docker compose up -d --build` (vision-service rebuild sẽ export YOLO26n → ONNX, cần mạng lúc build).
