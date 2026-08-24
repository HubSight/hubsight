# HubSight - Smart Surveillance & Playback Platform

A modern, high-performance, and resource-optimized CCTV surveillance and playback platform built with **Go 1.25**, **Ent ORM**, **NestJS 11 (Socket.IO Relay)**, **React (Vite + TypeScript)**, **webrtc-service (go2rtc)**, **FFmpeg (Zero-CPU Stream Copy)**, **Ultralytics YOLO**, **InsightFace**, and **PostgreSQL (pgvector)**.

---

## 🏛️ System Architecture: Single Unified API Gateway Entrypoint

The frontend client communicates **exclusively** with the **API Gateway (`api-gateway :8088`)**. All REST APIs, Auth flows, Relay (WebSocket) real-time events, and WebRTC signaling are transparently routed through the gateway:

![System Architecture](diagrams.png)

---

## 🌐 Microservices & Network Topology

| Service Name | Role | Public Host Port | Internal Address | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`api-gateway`** | **Single Unified API Gateway** | **`:8088`** | `http://api-gateway:8080` | **Sole Public HTTP & WebSocket Entrypoint**. Serves the **React SPA Frontend** and proxies REST APIs (`/api/*`), Auth (`/api/auth/*`), WebSocket Relay (`/relay`), and WebRTC signaling (`/webrtc/*`). |
| **`core-service`** | **Core CCTV Business Logic** | *None* | `http://core-service:8080` | **Private Internal Microservice** handling devices, camera CRUD, face vector embeddings (`pgvector`), notifications ingestion, archive timeline, and gRPC endpoints. |
| **`relay-service`** | **Socket.IO Relay Server** | *None* | `http://relay-service:3001` | **Private Internal Service** (NestJS 11 / Socket.IO 4.8 / Node 24) for real-time notifications and bounding box broadcasting, routed through Gateway `:8088/relay`. |
| **`mq-service`** | **Message Broker (RabbitMQ)** | *None* | `amqp://mq-service:5672` | **Private Internal Broker**. Used for async pub/sub events (Detections ➔ Relay ➔ UI, Notifications ➔ NVR Recorder). |
| **`auth-service`** | **Auth & SSO Engine** | *None* | `http://auth-service:8081` | **Private Internal Microservice** for SSO/OIDC auth, session verification, and token rotation via gRPC and REST. |
| **`webrtc-service`** | **WebRTC Media Engine (go2rtc)**| **`:8555`** | `http://webrtc-service:1984` | Port `:8555` UDP/TCP transmits direct WebRTC video RTP media. All signaling APIs are routed via Gateway `:8088/webrtc`. |
| **`nvr-service`** | **Event-based NVR Engine** | *None* | *Background Worker* | **Private Internal Worker** providing Zero-CPU continuous rolling buffering and event video clip stitching. |
| **`pool-service`** | **Connection Pool Monitor** | *None* | `http://pool-service:8080` | **Private Internal Service** managing RTSP/WebRTC active stream connections with viewer packing and Connection #0/#1 policies. |
| **`bgrd-service`** | **Background Job Worker** | *None* | *Background Worker* | **Private Internal Worker** handling periodic tasks like 3-day retention cron via `asynq` and Redis (Valkey). |
| **`redis-service`** | **Valkey/Redis Cache & Queue** | *None* | `redis://redis-service:6379` | **Private Internal Cache** used by `asynq` for background job queues. |
| **`vision-service`**| **AI Vision Engine (YOLO + ArcFace)**| *None* | *Background Worker* | **Private Internal Service** for multi-class detection (person, smoke, fire, weapon), pose anomaly tracking, and face recognition. |

---

## 🎯 Core Business Logic & Architecture

### 1. Connection Pool Policy (`connection_pools.txt`)
Connections to `go2rtc` streams are tightly managed to conserve bandwidth and CPU:
- **Connection #0 (`cam_{id}_cv`)**: STRICTLY dedicated to Computer Vision (`vision-service`). It runs at **640p @ 5FPS** and is ONLY created if the camera has `enable_ai=true`. If AI is disabled, the worker thread and `go2rtc` stream are terminated immediately.
- **Connection #1 (`cam_{id}_nvr`)**: STRICTLY dedicated to the NVR recorder. Only connects if NVR is enabled globally or per camera.
- **Connection #2+ (`cam_{id}_client_{n}`)**: Used for live viewing. **Packs up to 5 concurrent UI viewers per connection**. If 5 viewers are full, a new connection is spawned. When viewer count drops to 0, idle connections are closed immediately.

---

### 2. Zero-CPU Event-based NVR (ARM64 Optimized)
Designed to run efficiently on low-power, GPU-less servers (e.g. 4-core ARM64):
- **Principle #1: No 24/7 junk storage**: Zero continuous recording saved to persistent disk.
- **Continuous Circular Buffer (RAM/tmpfs)**: `nvr-service` runs FFmpeg with `-c copy` (Direct stream copy, 0% CPU decoding overhead) maintaining 5 rolling 10-second segments (`-segment_wrap 5`, max 50s total buffer) in volatile temporary storage.
- **Pre & Post Event Buffering**: When the AI detects an event, NVR captures the pre-buffer (10–20s before) and waits for post-buffer (15–20s after), then losslessly concatenates the chunks into a single `< 50s` `.mp4` clip saved to `/data/camera/` at native **720p/15FPS+**.

---

### 3. AI & Computer Vision Pipeline (`vision-service`)
Refactored into a clean, domain-driven package structure:

```
services/vision-service/
├── main.py                          # Bootstrap entrypoint & gRPC background sync
└── src/
    ├── detection/                   # Object detection & tracking domain
    │   ├── detector.py              # PersonDetector (YOLO + Danger detection)
    │   ├── motion_gate.py           # MotionGate (Lightweight background subtraction <0.3ms)
    │   └── track_identity.py        # TrackIdentity (Consensus voting & posture anomaly detection)
    ├── recognition/                 # Face biometrics domain
    │   ├── face_engine.py           # FaceEngine (InsightFace ArcFace vector matching)
    │   └── face_quality_gate.py     # FaceQualityGate (Blur, pose yaw/pitch & size filter)
    ├── streaming/                   # Video stream ingestion domain
    │   └── stream_manager.py        # StreamManager (go2rtc Connection #0 worker threads)
    └── messaging/                   # Event broker domain
        └── rabbitmq_client.py       # RabbitMQClient (Event publishing)
```

- **Motion Gate**: Fast frame-differencing filter (<0.3ms) skips static frames, ensuring YOLO only runs when motion occurs.
- **Smoke & Fire Detection**: Recognizes danger classes (`smoke`, `fire`, `weapon`) via fine-tuned YOLO model (`yolo-cctv.pt` / `yolo26n.pt`).
- **Abnormal Behavior & Fall Detection**: Monitors bounding box aspect ratio and posture changes over a 5-second sliding window. Detects sudden collapses or lying down ($\text{Aspect Ratio} \ge 1.15$).
- **Intelligent Notification Filtering**:
  - 🟢 **Recognized Family Members (Normal)** ➔ Logged silently, **no push notifications & no NVR recording**.
  - 🔴 **Strangers** ➔ Triggers `stranger_detected` alert + NVR event clip.
  - 🚨 **Smoke / Fire / Weapon** ➔ Triggers immediate `danger` alarm + NVR event clip.
  - ⚠️ **Family Member Fall / Collapse** ➔ Triggers high-priority `fall_detected` alarm + NVR event clip.

---

## 🚀 Getting Started

### 1. Single-Command Dependency Installation (Optional for Local Dev)

Install dependencies across Go, Node.js (`pnpm`), and Python (`.venv`) with a single command:

```powershell
# On Windows PowerShell
.\scripts\install_deps.ps1
```

```bash
# On Linux / macOS
./scripts/install_deps.sh
```

---

### 2. Deploy with Docker Compose

There is **only one deployment command** for the entire platform:

```bash
docker compose up -d --build
```

Access points:
- **Unified API Gateway & Web App**: `http://localhost:8088` (Serves the Frontend UI and proxies all REST APIs, Auth, WebSocket `/relay` & WebRTC signaling `/webrtc/*`)
- **WebRTC Stream Media**: `http://localhost:8555` (UDP/TCP RTP media transport)

---

### 3. Seeding Accounts & RBAC Setup

```bash
cd services/core
go run cmd/seed/main.go
```

Generates `users_credentials.csv` with credentials for configured accounts.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

