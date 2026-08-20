# HubSight Phase 1 - Vision Service Implementation Plan

## Mục tiêu Phase 1

- Detect có người trong camera hay không.
- Không nhận diện danh tính.
- Không action recognition.
- Không face recognition.
- Không xử lý notification trực tiếp.
- Luồng:
    `vision-service -> RabbitMQ -> relay-service -> Socket.IO -> Frontend`.

------------------------------------------------------------------------

## 1. Tạo service mới: vision-service

Tạo microservice nội bộ chịu trách nhiệm:

- Đọc camera stream.
- Chạy AI inference.
- Phát hiện person.
- Publish event qua RabbitMQ.

Service: - Không expose public port. - Không giao tiếp trực tiếp với
frontend.

------------------------------------------------------------------------

## 2. Công nghệ

- Python 3.11+
- OpenCV
- Ultralytics YOLO
- PyTorch
- RabbitMQ client

------------------------------------------------------------------------

## 3. Kiến trúc tổng thể

``` text
Camera RTSP
    |
    +--> nvr-service (recording)
    |
    +--> vision-service
             |
             v
        RabbitMQ
             |
             v
        relay-service
             |
             v
        Socket.IO
             |
             v
        React FE
```

------------------------------------------------------------------------

## 4. Camera Stream Management

Implement RTSP reader:

- Connect RTSP.
- Reconnect khi mất kết nối.
- Decode frame.
- Frame sampling.

Không xử lý toàn bộ FPS camera.

------------------------------------------------------------------------

## 5. YOLO Person Detection

Phase 1 sử dụng model lightweight:

- YOLO11n hoặc tương đương.

Pipeline:

``` text
Frame
 |
YOLO inference
 |
Filter person
 |
Confidence threshold
 |
Detection result
```

------------------------------------------------------------------------

## 6. Detection State Management

Không publish event mỗi frame.

State machine:

``` text
NO_PERSON

    |
    | detect person
    v

PERSON_PRESENT

    |
    | no person trong X giây
    v

NO_PERSON
```

Event:

- `person.entered`
- `person.left`

------------------------------------------------------------------------

## 7. RabbitMQ Integration

Exchange:

``` text
vision.events
```

Routing key:

``` text
vision.person.entered
vision.person.left
```

`vision-service` chỉ publish event.

------------------------------------------------------------------------

## 8. Relay-service Integration

Relay-service:

- Subscribe vision events từ RabbitMQ.
- Convert thành Socket.IO event.
- Forward realtime cho frontend.

------------------------------------------------------------------------

## 9. Frontend Integration

Frontend:

-   Listen Socket.IO event.
-   Hiển thị trạng thái person detected.
-   Hỗ trợ bounding box overlay bằng Canvas.

------------------------------------------------------------------------

## 10. Bounding Box Overlay

Không modify video stream.

Sử dụng:

``` text
WebRTC video
+
Canvas overlay
```

Video là một layer, AI metadata là một layer.

------------------------------------------------------------------------

## 11. Monitoring

Health check:

-   Model loaded.
-   Camera connected.
-   RabbitMQ connected.

Metrics:

-   FPS input.
-   FPS inference.
-   CPU/GPU usage.
-   Last detection timestamp.

------------------------------------------------------------------------

## 12. Deployment Order

1.  Create vision-service skeleton.
2.  Docker compose integration.
3.  RTSP reader.
4.  YOLO inference.
5.  State machine.
6.  RabbitMQ publisher.
7.  Relay consumer.
8.  Socket.IO frontend.
9.  Canvas overlay.

------------------------------------------------------------------------

## Definition of Done

Feature hoàn thành khi:

-   RTSP camera đọc được.
-   YOLO detect person.
-   Không spam event.
-   RabbitMQ hoạt động.
-   Relay nhận event.
-   FE nhận Socket.IO event.
-   Bounding box realtime hoạt động.
-   vision-service không expose public endpoint.
-   Không ảnh hưởng recording pipeline.
