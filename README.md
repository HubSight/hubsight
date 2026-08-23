# HubSight - Smart Surveillance & Playback Platform

A modern, robust, and full-featured camera recording and playback surveillance system built with **Go**, **Ent ORM**, **NestJS (Socket.IO Relay)**, **React (Vite + TypeScript)**, **webrtc-service (go2rtc)**, **FFmpeg**, and **PostgreSQL (pgvector)**.

---

## 🏛️ System Architecture: Single Unified API Gateway Entrypoint

The frontend client communicates **exclusively** with the **API Gateway (`api-gateway :8088`)**. All REST APIs, Auth flows, Relay (WebSocket) real-time events, and WebRTC signaling are transparently routed through the gateway:

![System Architecture](diagrams.png)

---

## 🌐 Microservices & Network Topology

| Service Name | Role | Public Host Port | Internal Address | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`api-gateway`** | **Single Unified API Gateway** | **`:8088`** | `http://api-gateway:8080` | **Sole Public HTTP & WebSocket Entrypoint**. Serves the **React SPA Frontend** and proxies REST APIs (`/api/*`), Auth (`/api/auth/*`), WebSocket Relay (`/relay`), and WebRTC signaling (`/webrtc/*`). |
| **`core-service`** | **Core CCTV Business Logic** | *None* | `http://core-service:8080` | **Private Internal Microservice** handling devices, camera CRUD, RTSP URL generation, archive playback timeline, and WebRTC signaling. |
| **`relay-service`** | **Socket.IO Relay Server** | *None* | `http://relay-service:3001` | **Private Internal Service** for real-time notifications and rooms, routed through Gateway `:8088/relay`. Uses RabbitMQ for internal events. |
| **`mq-service`** | **Message Broker** | *None* | `amqp://mq-service:5672` | **Private Internal Broker**. Used for async pub/sub events from Core, NVR, Auth services to Relay service. |
| **`auth-service`** | **Auth & SSO Engine** | *None* | `http://auth-service:8081` | **Private Internal Microservice** for SSO/OIDC auth, session verification, and token rotation. |
| **`webrtc-service`** | **WebRTC Media Engine** | **`:8555`** | `http://webrtc-service:1984` | Port `:8555` UDP/TCP transmits direct WebRTC video RTP media. All signaling APIs are routed via Gateway `:8088/webrtc`. |
| **`nvr-service`** | **NVR Recording Engine** | *None* | *Background Worker* | **Private Internal Worker** for FFmpeg chunking and S3 archiving. |
| **`pool-service`** | **Connection Pool Monitor** | *None* | `http://pool-service:8080` | **Private Internal Service** managing RTSP/WebRTC active stream connections, client count tracking, and persistent CV connection #0 logic. |
| **`bgrd-service`** | **Background Job Worker** | *None* | *Background Worker* | **Private Internal Worker** handling periodic tasks like 3-day retention cron via `asynq`. |
| **`redis-service`** | **Redis Queue** | *None* | `redis://redis-service:6379` | **Private Internal Cache** used by `asynq` for job queues. |
| **`vision-service`**| **AI Vision Engine (YOLO)**| *None* | *Background Worker* | **Private Internal Service** for AI real-time person & face detection. Uses OpenCV and Ultralytics YOLO, and publishes bounding box coordinates to RabbitMQ. |

---

## Key Features

### 1. Single-Entry API Gateway (`api-gateway`)
- **Single Origin For All Protocols**: Frontend only targets **`http://localhost:8088`** for REST, Auth, and WebSockets (`ws://`/`wss://`).
- **Pure Path Names**:
  - `/api/auth/*` ➔ `http://auth-service:8081`
  - `/relay` & `/relay/*` ➔ `http://relay-service:3001`
  - `/webrtc/*` ➔ `http://webrtc-service:1984/*`
  - `/api/*` (devices, archive, live, recorder, pool, members) ➔ `http://core-service:8080`

### 2. AI Person & Face Recognition (pgvector)
- **YOLOv11 Inference**: The `vision-service` reads RTSP camera streams and detects people in real-time.
- **Face Recognition**: Supports storing and querying Face Embeddings using PostgreSQL `pgvector`.
- **Live Bounding Boxes**: The AI engine publishes coordinates to RabbitMQ. The `relay-service` forwards them to the frontend, allowing `<LivePlayer>` to render moving red tracking rectangles dynamically over the WebRTC stream.
- **Smart Face Gallery**: Frontend optimized with infinite scrolling, quality-based sorting, and batch actions to manage hundreds of face vectors seamlessly without UI lag.

### 3. Background Push Notifications & Smart Routing
- **Web Push API (Service Worker)**: Uses `webpush-go` and a custom Service Worker for cross-platform background & offline notification delivery (Push API + VAPID).
- **Intelligent Routing**: Clicking a notification (both system tray or in-app drawer) automatically routes the user to the Playback screen, selects the relevant camera, and seeks precisely to the timestamp of the event.

### 4. Continuous AI Processing (Connection #0)
- Dedicated `pool-service` tracks active live streams.
- The `vision-service` connects as a background connection #0 to maintain continuous CV detection and anomaly notifications even when no users are viewing the stream. The connection pool automatically synchronizes state.

### 5. Role-Based Access Control (RBAC)
- **Admin Role**: Full access to device management, face vector libraries (Member Profiles), and system health monitors (`/pool`, `/recorder`).
- **Viewer Role**: Strict read-only access restricted to Live Streams, Playback, and receiving notifications.

---

## Getting Started

### 1. Quick Start with Docker Compose

```bash
# Clone repository and start all microservices
git clone https://github.com/your-repo/cctv.git
cd cctv

docker compose up -d --build
```

Access points:
- **Unified API Gateway & Web App**: `http://localhost:8088` (Serves the Frontend UI and proxies all REST APIs, Auth, WebSocket `/relay` & WebRTC signaling `/webrtc/*`)
- **WebRTC Stream Media**: `http://localhost:8555` (RTP media transport)

---

### 2. Seeding Accounts & RBAC Setup

```bash
cd services/core
go run cmd/seed/main.go
```

Generates `users_credentials.csv` with credentials for configured accounts.

### 3. Existing database migration

Before deploying this refactor to an existing database, run the versioned
migrations with `DATABASE_URL` set. Migration `000002` preserves rows while
replacing every primary key and foreign keys with 21-character Nano IDs. It has no rollback path, so take a database backup first.

```bash
DATABASE_URL='postgres://…' ./scripts/migrate.sh
```

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
