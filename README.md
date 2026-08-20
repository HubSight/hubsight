# CCTV Surveillance & Playback Platform

A modern, robust, and full-featured CCTV recording and playback surveillance system built with **Go**, **Ent ORM**, **NestJS (Socket.IO Relay)**, **React (Vite + TypeScript)**, **webrtc-service (go2rtc)**, **FFmpeg**, and **PostgreSQL**.

---

## 🏛️ System Architecture: Single Unified API Gateway Entrypoint

The frontend client communicates **exclusively** with the **API Gateway (`api-gateway :8088`)**. All REST APIs, Auth flows, Relay (WebSocket) real-time events, and WebRTC signaling are transparently routed through the gateway:

```mermaid
flowchart TB
    %% ==========================================
    %% 1. CLIENT LAYER
    %% ==========================================
    subgraph ClientLayer ["📱 Frontend Client Layer (PWA & Web)"]
        direction TB
        PWA["PWA Standalone App<br/>(Desktop / iOS / Android)"]
        Browser["Web Browser Client"]
        SW["Service Worker & Workbox<br/>(Instant Auto-Update)"]
        AuthApp["Auth & Refresh Interceptor<br/>(Indefinite Session)"]
        LockEngine["App Lock & WebAuthn Engine<br/>(Face ID / Touch ID / PIN)"]
        LiveView["Live Stream Player<br/>(WebRTC / HLS)"]
        PlaybackView["Archive Player<br/>(24h Timeline & MP4 Download)"]

        PWA --- SW
        PWA --- LockEngine
        PWA --- AuthApp
        AuthApp --- LiveView
        AuthApp --- PlaybackView
    end

    %% ==========================================
    %% 2. PUBLIC API GATEWAY (THE ONLY EXTERNAL ENTRYPOINT)
    %% ==========================================
    subgraph PublicBoundary ["🌐 Public Boundary (Single Host Entrypoint)"]
        direction TB
        APIGateway["🚪 Pure API Gateway (:8088)<br/>Single Unified Entrypoint for FE<br/>- REST APIs (/api/*)<br/>- Auth Endpoints (/api/auth/*)<br/>- WebSocket Relay (/relay)<br/>- WebRTC Signaling & WHEP (/webrtc/*)"]
        RTCStream["📹 WebRTC Media Port (:8555 UDP/TCP)<br/>Direct RTP/SRTP Video Transport"]
    end

    %% ==========================================
    %% 3. INTERNAL PRIVATE MICROSERVICES
    %% ==========================================
    subgraph InternalServices ["🔒 Internal Services (100% Private Network)"]
        direction TB
        AuthSvc["🔐 Standalone Auth Service (:8081)<br/>SSO/OIDC Ready Engine<br/>Session & Token Verification"]
        CoreSvc["⚙️ Core CCTV Service (:8080)<br/>Devices, Cameras, Archive & Playback Logic"]
        RelayWS["⚡ Socket.IO Relay Server (:3001)<br/>Real-time Push Events & Rooms (Path: /relay)"]
        WebRTCSvc["📹 WebRTC Engine (:1984)<br/>Internal Dynamic RTSP Mapping"]
        NVRSvc["📼 NVR Recorder Service<br/>Multi-Camera FFmpeg Workers<br/>720p @ 15fps Segmentation"]
        Postgres[("Shared PostgreSQL DB")]
        S3Storage[("S3 / MinIO Storage<br/>YYYY-MM-DD/Camera_ID/")]
    end

    %% ==========================================
    %% 4. CAMERA HARDWARE
    %% ==========================================
    subgraph CameraLayer ["📷 IP Cameras & RTSP Sources"]
        direction TB
        CamDahua["Dahua IP Camera"]
        CamHik["Hikvision IP Camera"]
        CamEzviz["Ezviz / Imou Camera"]
        CamGeneric["Generic RTSP Stream"]
    end

    %% ==========================================
    %% CONNECTIONS & FLOWS
    %% ==========================================
    %% FE communicates ONLY with API Gateway
    ClientLayer -->|"1. REST APIs (/api/*)"| APIGateway
    ClientLayer <-->|"2. Real-time WebSocket (ws://host:8088/relay)"| APIGateway
    LiveView -->|"3. WebRTC Signaling (/webrtc/*, /api/live/*)"| APIGateway
    LiveView <-->|"4. Direct RTP Media (:8555)"| RTCStream

    %% Gateway Dispatches to Internal Services
    APIGateway -->|"Proxy /api/auth/*"| AuthSvc
    APIGateway -->|"Proxy /relay (WebSocket Upgrade & Engine)"| RelayWS
    APIGateway -->|"Proxy /webrtc/*"| WebRTCSvc
    APIGateway -->|"Proxy /api/* (Devices, Archive, Live)"| CoreSvc

    %% Core Service Interactions
    CoreSvc -->|"Validate Session / Token"| AuthSvc
    CoreSvc -->|"Signaling /api/live/:id/webrtc"| WebRTCSvc
    CoreSvc -.->|"Trigger Push Events"| RelayWS
    CoreSvc -->|"CRUD & Metadata"| Postgres
    CoreSvc -->|"Generate Stream URLs"| S3Storage

    %% Internal Microservices
    AuthSvc --> Postgres
    RelayWS -->|"Auth Guard Handshake"| AuthSvc
    NVRSvc --> Postgres
    NVRSvc --> S3Storage

    CamDahua -->|"RTSP Stream"| WebRTCSvc
    CamHik -->|"RTSP Stream"| WebRTCSvc
    CamEzviz -->|"RTSP Stream"| WebRTCSvc
    CamGeneric -->|"RTSP Stream"| WebRTCSvc

    CamDahua -.->|"Direct Capture"| NVRSvc
    CamHik -.->|"Direct Capture"| NVRSvc
    CamEzviz -.->|"Direct Capture"| NVRSvc
    CamGeneric -.->|"Direct Capture"| NVRSvc
```

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

---

## Key Features

### 1. Single-Entry API Gateway (`api-gateway`)
- **Single Origin For All Protocols**: Frontend only targets **`http://localhost:8088`** for REST, Auth, and WebSockets (`ws://`/`wss://`).
- **Pure Path Names**:
  - `/api/auth/*` ➔ `http://auth-service:8081` (rewrites to `/auth/*`)
  - `/relay` & `/relay/*` ➔ `http://relay-service:3001` (WebSocket upgrades on path `/relay`)
  - `/webrtc/*` ➔ `http://webrtc-service:1984/*` (WebRTC signaling & WHEP streams)
  - `/api/*` (devices, archive, live, recorder) ➔ `http://core-service:8080`
- **Complete Internal Isolation**: `core-service`, `auth-service`, `relay-service`, and `nvr-service` have zero host port exposure.

### 2. Client Connection Examples

#### Frontend Socket.IO Connection:
```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8088', {
  path: '/relay',
  withCredentials: true,
  transports: ['websocket', 'polling'],
});
```

#### Frontend WebRTC Live Video:
```typescript
const response = await fetch('http://localhost:8088/api/live/5/webrtc', {
  method: 'POST',
  body: peerConnection.localDescription?.sdp,
  headers: { 'Content-Type': 'application/sdp' },
  credentials: 'include',
});
```

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
cd backend
go run cmd/seed/main.go
```

Generates `users_credentials.csv` with credentials for configured accounts.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
