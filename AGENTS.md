# HubSight CCTV - Agent Guidelines

Welcome to the HubSight project! This `AGENTS.md` file serves as the definitive rulebook and knowledge base for all AI agents working on this codebase. 

## 1. System Architecture & Topology

HubSight is a microservices-based CCTV surveillance and playback platform using a **Single Unified API Gateway Entrypoint**.

### The Gateway Pattern
- **API Gateway (`api-gateway` port `:8088`)**: The absolute single entry point for all external client traffic. 
- The frontend (React SPA) **must only communicate** with `http://localhost:8088` (or the deployed gateway domain).
- The gateway routes traffic internally to:
  - `GET/POST /api/auth/*` ➔ `auth-service:8081`
  - `GET/POST /api/*` ➔ `core-service:8080` (device CRUD, archive, etc.)
  - `WS/WSS /relay/*` ➔ `relay-service:3001` (Socket.IO Real-time Events)
  - `GET/POST /webrtc/*` ➔ `webrtc-service:1984` (go2rtc signaling API)

### Internal Services
- **`core-service`**: Business logic, database interactions, WebRTC wrapper logic.
- **`pool-service`**: Monitors and tracks WebRTC stream connections and clients.
- **`vision-service`**: Python/OpenCV/YOLO background worker that detects persons/faces.
- **`webrtc-service` (go2rtc)**: Handles raw stream encoding/decoding and media transport (UDP/TCP port `8555`).
- **`mq-service` (RabbitMQ)**: Internal message broker for Pub/Sub. Used extensively to broadcast state changes across isolated services (e.g., Vision emitting detections -> Relay broadcasting to UI).
- **`nvr-service` & `bgrd-service`**: Background chunking, recording, retention tasks via `asynq` and Redis (Valkey).
- **`push-service`**: Offline FCM / Web Push worker. Consumes `push_queue`; does not expose HTTP.

## 2. Core Business Logic & Workflows

### Connection Pool Management (`connection_pools.txt` spec)
Connections to `go2rtc` streams are tightly managed to save resources:
- **Connection #0 (`cam_{id}_cv`)**: STRICTLY dedicated to Computer Vision (`vision-service`). It is ONLY created if the camera has `enable_ai=true`. If AI is disabled, the `vision-service` actively terminates the worker thread AND deletes the stream via `go2rtc` HTTP API.
- **Connection #1 (`cam_{id}_nvr`)**: STRICTLY dedicated to the NVR recorder. Only connects if NVR is enabled.
- **Connection #2+ (`cam_{id}_client_{n}`)**: Used for live viewing. Each connection groups up to 5 concurrent UI clients. If 5 clients are full, a new connection is spawned. Idle connections (0 clients) are closed immediately.

### AI & Notifications Pipeline
1. **Vision Service**: Pulls stream #0, processes frames via YOLO.
2. **Face Extraction**: Uses internal gRPC to fetch face vectors (`pgvector`) from `core-service`.
3. **Ingestion**: If a person/face is locked, it posts to `core-service` (`/api/internal/notifications/ingest`).
4. **Relay**: `core-service` saves to DB, then publishes to RabbitMQ. `relay-service` pushes to Socket.IO clients.
5. **Web Push**: `core-service` also publishes `notification.new` to `push_queue`. `push-service` sends FCM / VAPID Web Push to stored subscriptions.

## 3. Data Schema & Stack

- **Backend**: Go 1.25, Gin Web Framework, gRPC (for service-to-service).
- **ORM**: `entgo.io/ent`. Schemas reside in `services/shared/ent/schema`.
- **Database**: PostgreSQL (with `pgvector` for AI face embeddings).
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Lucide Icons.
- **ID Generation**: 21-character `nanoid` is used for all Primary Keys and Foreign Keys instead of UUID or integers.

## 4. Agent Coding Constraints & Rules

1. **Gateway Isolation**: Never expose internal services to the host except `api-gateway` (8088) and WebRTC media (8555). Never instruct the frontend to bypass the gateway.
2. **Standard Coding Conventions**:
   - Use standard Go conventions (gofmt, idiomatic variable names).
   - Use `ent` ORM builder patterns strictly for all DB queries.
   - Use standard React Functional Components + Hooks (no class components).
3. **Database Changes**: If you modify `services/shared/ent/schema`, you must inform the user to run `ent generate` or execute the script. Do not manipulate DB migrations directly without user permission.
4. **Inter-service Communication**: 
   - HTTP/REST for Gateway -> Service.
   - gRPC for high-performance Service -> Service (e.g., `vision` -> `core`).
   - RabbitMQ for async Event Broadcasting (e.g., `core` -> `relay`).
5. **AI Enablement Rule for Event-based Capture**:
   - Event-based NVR rolling buffering and capture is **STRICTLY EXCLUSIVE** to cameras where `enable_ai=true` in the Device Management settings.
   - If a camera has `enable_ai=false`, neither `vision-service` nor `nvr-service` shall ever spawn stream connections, buffer chunks, or execute event capture for that camera.
6. **Deployment**: 
   - There is ONLY ONE deployment command: `docker compose up -d --build`.
   - Never invent alternative shell scripts or kubernetes manifests unless explicitly requested.
7. **Connection Pool Integrity**: Any modifications to the configuration or settings of an active (running) device MUST force an immediate teardown of its Connection Pool. In the UI, saving changes for an active camera requires invoking a sequence of `stop` (to tear down `go2rtc` resources) followed by `start` (to recreate them with the fresh config), ensuring no stale streaming artifacts or ghost sessions remain in the `pool-service`.
8. **Go Build Artifact Hygiene**:
   - Never run plain `go build` without an output directory.
   - All local Go binaries must strictly be compiled into the `dist/` folder (e.g. `go build -o dist/ ./services/...` or `go install` with `GOBIN`), or by running `.\scripts\build.ps1` (Windows), `./scripts/build.sh` (macOS/Linux), or `make build`.
   - Never leave compiled binaries in root or service directories.

When modifying this repository, read and abide by these rules. Focus on resource efficiency (particularly streaming and AI processes) and keep the frontend strictly coupled to the gateway.

