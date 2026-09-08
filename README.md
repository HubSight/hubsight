# HubSight - Smart Surveillance & Playback Platform

A modern, high-performance, and resource-optimized CCTV surveillance and playback platform built with **Go 1.25**, **Ent ORM**, **NestJS 11 (Socket.IO Relay)**, **React (Vite + TypeScript)**, **webrtc-service (go2rtc)**, **FFmpeg (Zero-CPU Stream Copy)**, **Ultralytics YOLO**, **InsightFace**, **Firebase Cloud Messaging (FCM / Web Push)**, **PostgreSQL (pgvector)**, **Argon2id + AES-256-GCM + Ed25519 App Configuration Containers (`.hscfg`)**, and **Hardware-backed WebAuthn / Passkeys**.

---

## 🏛️ System Architecture: Single Unified API Gateway Entrypoint

The frontend client communicates **exclusively** with the **API Gateway (`api-gateway :8088`)**. All REST APIs, Auth flows, Relay (WebSocket) real-time events, and WebRTC signaling are transparently routed through the gateway:

![System Architecture](diagrams.png)

Compose **service names** keep the `-service` suffix (Docker DNS). Source directories under `services/` do not (`services/pool`, `services/relay`, `services/vision`, `services/push`, …).

---

## 🌐 Microservices & Network Topology

| Service Name | Source | Role | Public Host Port | Internal Address | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`api-gateway`** | `services/gateway` | **Single Unified API Gateway** | **`:8088`** | `http://api-gateway:8080` | **Sole Public HTTP & WebSocket Entrypoint**. Serves the **React SPA Frontend** and proxies REST APIs (`/api/*`), Auth (`/api/auth/*`), WebSocket Relay (`/relay`), and WebRTC signaling (`/webrtc/*`). |
| **`core-service`** | `services/core` | **Core CCTV Business Logic** | *None* | `http://core-service:8080` | **Private Internal Microservice** handling devices, camera CRUD, face vector embeddings (`pgvector`), notification inbox + ingest, archive timeline, Google Service Accounts & Firebase Management API, encrypted App Configurations (`.hscfg`), OAuth2 clients, and gRPC endpoints. Publishes events; does not send FCM directly. |
| **`auth-service`** | `services/auth` | **Auth & SSO Engine** | *None* | `http://auth-service:8081` | **Private Internal Microservice** for SSO/OIDC auth, session verification, token rotation, and WebAuthn / Passkeys via gRPC and REST. |
| **`pool-service`** | `services/pool` | **Connection Pool Monitor** | *None* | `http://pool-service:8085` | **Private Internal Service** managing RTSP/WebRTC active stream connections with viewer packing and Connection #0/#1 policies. |
| **`relay-service`** | `services/relay` | **Socket.IO Relay Server** | *None* | `http://relay-service:3001` | **Private Internal Service** (NestJS 11 / Socket.IO 4.8 / Node 24) for in-app real-time notifications and bounding box broadcasting, routed through Gateway `:8088/relay`. |
| **`hawkeyes-service`** | `services/hawkeyes` | **RTSP Discovery** | *None* | `http://hawkeyes-service:8091` | **Private Internal Service** scanning LAN/VPN/Docker for verified RTSP cameras. |
| **`vision-service`** | `services/vision` | **AI Vision Engine (YOLO + ArcFace)** | *None* | *Background Worker* | **Private Internal Service** for multi-class detection (person, smoke, fire, weapon), pose anomaly tracking, and face recognition. |
| **`nvr-service`** | `services/recorder` | **Event-based NVR Engine** | *None* | *Background Worker* | **Private Internal Worker** providing Zero-CPU continuous rolling buffering and event video clip stitching. Consumes `nvr_recorder_queue`. |
| **`push-service`** | `services/push` | **FCM / Web Push Worker** | *None* | *Background Worker* | **Private Internal Worker**. Consumes `push_queue` and sends offline FCM / VAPID Web Push. No public HTTP. |
| **`bgrd-service`** | `services/bgrd` | **Background Job Worker** | *None* | *Background Worker* | **Private Internal Worker** handling periodic tasks like retention cron via `asynq` and Redis (Valkey). |
| **`webrtc-service`** | `services/go2rtc` | **WebRTC Media Engine (go2rtc)** | **`:8555`** | `http://webrtc-service:1984` | Port `:8555` UDP/TCP transmits direct WebRTC video RTP media. All signaling APIs are routed via Gateway `:8088/webrtc`. |
| **`mq-service`** | — | **Message Broker (RabbitMQ)** | *None* | `amqp://mq-service:5672` | **Private Internal Broker**. Fan-out: detections ➔ Relay ➔ UI, notifications ➔ NVR + Push. |
| **`redis-service`** | — | **Valkey/Redis Cache & Queue** | *None* | `redis://redis-service:6379` | **Private Internal Cache** used by `asynq` for background job queues. |

Shared Go library (Ent schemas, HTTP handlers, MQ client, FCM sender, AppConfig crypto engine, Google Firebase client): `services/shared`. Frontend SPA: `webapp/`.

---

## 🎯 Core Business Logic & Architecture

### 1. Connection Pool Policy (`connection_pools.txt`)
Connections to `go2rtc` streams are tightly managed to conserve bandwidth and CPU:
- **Connection #0 (`cam_{id}_cv`)**: STRICTLY dedicated to Computer Vision (`vision-service`). It runs at **640p @ 10FPS** and is ONLY created if the camera has `enable_ai=true`. If AI is disabled, the worker thread and `go2rtc` stream are terminated immediately.
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
services/vision/
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

### 4. Notifications: Inbox, Live UI, and Offline Web Push

`core-service` owns ingest, dedup, the inbox DB, and FCM token registration. After saving a notification it publishes `notification.new` to three queues:

```
vision  →  core (DB)
             ├─ relay_queue         → relay-service  → Socket.IO toast (app open)
             ├─ nvr_recorder_queue  → nvr-service    → event clip
             └─ push_queue          → push-service   → FCM / VAPID (app closed)
```

The SPA registers via Firebase JS SDK + VAPID (`getToken`). `push-service` holds Firebase Admin credentials and sends data-only FCM messages; the PWA service worker renders the OS notification.

---

### 5. App Configuration Container (`.hscfg`) & Zero-Config Enrollment

HubSight introduces an encrypted multi-layer container format **`.hscfg` (HubSight Configuration)** designed for zero-effort enrollment of **Mobile** (Flutter / React Native / Native) and **Desktop** (Go / Electron / Tauri) applications.

#### Security Specifications
- **Argon2id Key Derivation**: 64 MiB RAM, 4 rounds, 2 lanes, 32-byte key derived from an admin-selected **6-digit PIN**.
- **AES-256-GCM Encryption**: Payload is encrypted with authenticated Additional Authenticated Data (`AAD: HSCFG\x01`), protecting against offline tampering.
- **Ed25519 Digital Signature**: Each profile is digitally signed by a dedicated Ed25519 keypair before encryption to ensure end-to-end authenticity.
- **Unified Gateway Routing**: Enforces strict routing where all REST API and WebSocket Relay traffic routes through the external domain gateway (port 80/443 or `:8088`), with WebRTC video media on port `:8555`.

```
decrypted_payload.zip/
├── metadata.yml              # Profile metadata, creation timestamp, Ed25519 public key & signature
├── urls.yml                  # Unified Gateway Base URLs (API, Relay WebSocket, WebRTC)
├── key.yml                   # Client ID, Client Secret, and granted permissions
├── google-services.json      # (Optional) Android Firebase FCM configuration
├── GoogleService-Info.plist  # (Optional) iOS Firebase FCM configuration
└── ca_cert.pem               # (Optional) Internal CA root certificate for private deployments
```

- **Instant QR Enrollment**: Admin can generate a 24-hour Presigned QR Code. Users scan the QR on mobile/desktop, enter their 6-digit PIN, and start streaming immediately.
- 📖 Full Technical Specification & Client Integration Guide: See [`docs/APP_CONFIG_SPECIFICATION.md`](docs/APP_CONFIG_SPECIFICATION.md).

---

### 6. Google Service Account & Firebase Management API Integration

Power users and administrators can manage Google Service Accounts directly from the web interface (`/google-service-accounts`):
- **Direct Firebase Console JSON Import**: Upload standard Service Account keys downloaded from Firebase Console.
- **Secure Key Masking**: RSA private keys are stored securely using AES-256 and masked in the UI to prevent credential exposure.
- **Automated App Preflight**: Integrates with Google Firebase Management API (`https://firebase.googleapis.com/v1beta1/...`) to automatically discover registered Android package names and iOS bundle IDs.
- **Automated Configuration Extraction**: When generating `.hscfg` profiles, the system automatically pulls `google-services.json` and `GoogleService-Info.plist` without requiring manual file handling.

---

### 7. Client Management & OAuth2 Security

Dynamic Client Application registration (`/clients`) allows granular access control:
- **Unique Client Credentials**: Generates `client_id` and hashed `client_secret`.
- **Granular Scopes**: Assign capabilities such as `cameras:view`, `playback:view`, and `notifications:receive`.
- **Audit & Revocation**: Instant revocation of compromised clients or outdated applications.

---

### 8. WebAuthn & Hardware-Backed Passkeys

Supports passwordless and hardware-backed multi-factor authentication (MFA):
- **Passkeys (FIDO2 / WebAuthn)**: Register biometrics (FaceID, TouchID, Windows Hello) or physical security keys (YubiKey).
- **Fallback 2FA**: TOTP authenticator app support with secure recovery codes.

---

## 📚 Technical Documentation & Guides

| Document | Description |
| :--- | :--- |
| [`docs/APP_CONFIG_SPECIFICATION.md`](docs/APP_CONFIG_SPECIFICATION.md) | **Technical Specification & Client Integration Guide** for `.hscfg` encrypted containers (Flutter, React Native, Go/Desktop). |
| [`docs/FACE_RECOGNITION_INSIGHTFACE_PLAN_REVISED.md`](docs/FACE_RECOGNITION_INSIGHTFACE_PLAN_REVISED.md) | InsightFace ArcFace biometric face recognition architecture and pipeline. |
| [`AGENTS.md`](AGENTS.md) | System architecture rules, connection pool policies, coding standards, and deployment constraints for AI agents. |

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
cd services/seed
go run .
```

Generates `users_credentials.csv` with credentials for configured accounts.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
