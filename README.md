# CCTV Surveillance & Playback Platform

A modern, robust, and full-featured CCTV recording and playback surveillance system built with **Go**, **Ent ORM**, **NestJS (Socket.IO Relay)**, **React (Vite + TypeScript)**, **webrtc-service (go2rtc)**, **FFmpeg**, and **PostgreSQL**.

---

## 🏛️ System Architecture: Single-Entry API Gateway Topology

The platform adopts a clean **API Gateway Pattern**:

```mermaid
flowchart TB
    %% ==========================================
    %% 1. CLIENT LAYER
    %% ==========================================
    subgraph ClientLayer ["📱 Frontend Client Layer (PWA & Web)"]
        direction TB
        PWA["PWA Standalone App\n(Desktop / iOS / Android)"]
        Browser["Web Browser Client"]
        SW["Service Worker & Workbox\n(Instant Auto-Update)"]
        AuthApp["Auth & Refresh Interceptor\n(Indefinite Session)"]
        LockEngine["App Lock & WebAuthn Engine\n(Face ID / Touch ID / PIN)"]
        LiveView["Live Stream Player\n(WebRTC / HLS)"]
        PlaybackView["Archive Player\n(24h Timeline & MP4 Download)"]
        
        PWA --- SW
        PWA --- LockEngine
        PWA --- AuthApp
        AuthApp --- LiveView
        AuthApp --- PlaybackView
    end

    %% ==========================================
    %% 2. PUBLIC API GATEWAY & WEBSOCKET BOUNDARY
    %% ==========================================
    subgraph PublicBoundary ["🌐 Public Boundary (External Entrypoints)"]
        direction TB
        APIGateway["🚪 API Gateway & Core Server\n(api-gateway :8088)\n- Single REST Entrypoint for FE\n- Proxies /api/auth/* & Token Validation\n- Proxies WebRTC Signaling"]
        RelayWS["⚡ Socket.IO Relay Server\n(relay-service :3005)\n- Real-time Push Events & Rooms"]
        RTCStream["📹 WebRTC Media Port\n(webrtc-service :8555 UDP/TCP)"]
    end

    %% ==========================================
    %% 3. INTERNAL PRIVATE MICROSERVICES
    %% ==========================================
    subgraph InternalServices ["🔒 Internal Services (Private Network - No Public Ports)"]
        direction TB
        AuthSvc["🔐 Standalone Auth Service (:8081)\n- SSO/OIDC Ready Engine\n- Session & Refresh Tokens\n- Password & WebAuthn Verification"]
        WebRTCSvc["📹 WebRTC Signaling Service (:1984)\n- Internal Dynamic RTSP Mapping"]
        NVRSvc["📼 NVR Recorder Service\n- Multi-Camera FFmpeg Workers\n- 720p @ 15fps Segmentation"]
        Postgres[("Shared PostgreSQL DB")]
        S3Storage[("S3 / MinIO Storage\n- YYYY-MM-DD/<Camera_ID>/")]
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
    %% Client to Public Entrypoints
    ClientLayer -->|1. All REST & Auth API Requests (:8088)| APIGateway
    ClientLayer <-->|2. Real-time Events WebSocket (:3005)| RelayWS
    LiveView <-->|3. WebRTC Video RTP/SRTP Media (:8555)| RTCStream

    %% Gateway to Internal Services
    APIGateway -->|Reverse Proxy /api/auth/* & Validate Token| AuthSvc
    APIGateway -->|WebRTC Signaling /api/live/:id/webrtc| WebRTCSvc
    APIGateway -.->|Trigger Real-time Push Events| RelayWS
    APIGateway -->|CRUD & Metadata| Postgres
    APIGateway -->|Generate Presigned Stream URLs| S3Storage

    %% Internal Services to DB / Storage
    AuthSvc --> Postgres
    NVRSvc --> Postgres
    NVRSvc --> S3Storage

    %% Cameras to Internal Media & Recorder
    CamDahua -->|RTSP Stream| WebRTCSvc
    CamHik -->|RTSP Stream| WebRTCSvc
    CamEzviz -->|RTSP Stream| WebRTCSvc
    CamGeneric -->|RTSP Stream| WebRTCSvc

    CamDahua -.->|Direct RTSP Capture| NVRSvc
    CamHik -.->|Direct RTSP Capture| NVRSvc
    CamEzviz -.->|Direct RTSP Capture| NVRSvc
    CamGeneric -.->|Direct RTSP Capture| NVRSvc
```

---

## 🌐 Microservices & Network Topology

| Service Name | Role | Public Host Port | Internal Address | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`api-gateway`** | **API Gateway & Core API** | **`:8088`** | `http://api-gateway:8080` | **Sole REST Entrypoint** for frontend HTTP requests (`/api/auth/*`, `/api/devices`, `/api/archive/*`, `/api/live/*`). |
| **`relay-service`** | **Socket.IO Relay** | **`:3005`** | `http://relay-service:3001` | **WebSocket Entrypoint** for frontend real-time notifications, rooms, and client relay. Protected by Auth & M2M bypass. |
| **`webrtc-service`** | **WebRTC Media Engine** | **`:8555`** | `http://webrtc-service:1984` | Port `:8555` UDP/TCP transmits WebRTC video RTP media. Signaling API port `:1984` is **strictly internal**. |
| **`auth-service`** | **Auth & SSO Engine** | *None* | `http://auth-service:8081` | **Private Internal Microservice** for SSO/OIDC auth, session verification, and token rotation. |
| **`nvr-service`** | **NVR Recording Engine** | *None* | *Background Worker* | **Private Internal Worker** for FFmpeg chunking and S3 archiving. |

---

## Key Features

### 1. Unified API Gateway Pattern (`api-gateway`)
- Frontend only needs **one API origin** (`http://localhost:8088`) for all operations.
- Zero CORS / Cross-Origin Cookie complications between Auth and Application services.
- All internal microservices (`auth-service`, `webrtc-service API`, `nvr-service`) remain fully protected behind the internal Docker network.

### 2. Dedicated Socket.IO Relay Service with Auth & M2M Protection (`relay-service`)
- **Frontend Auth Guard**: All WebSocket connections from Frontend clients are verified against `auth-service` (via session cookie, auth token, or `Authorization: Bearer`). Invalid connections are instantly rejected with `auth_error`.
- **Machine-to-Machine (M2M) Internal Bypass**: Identified internal services (`x-service-key` / `M2M_SECRET`) bypass user auth and connect directly for cluster-wide message relaying.
- **Rooms & Namespaces**: Auto-joins users to personal `user_<id>` and role `role_<role>` rooms, and supports manual room subscriptions (`join_room`, `leave_room`, `relay_message`).
- **REST Endpoints**: HTTP webhook endpoints (`POST /relay/emit`, `POST /relay/broadcast`) allow backend services to push real-time alerts.

### 3. Standalone Auth Service (`auth-service`)
- Dedicated auth microservice handling users, sessions, rotating PWA refresh tokens, and password verification.
- Exposes standard OIDC discovery (`/.well-known/openid-configuration`) and `/auth/validate-token`.
- Shares the existing PostgreSQL database schema.

### 4. Role-Based Access Control (RBAC)
- **Admin**: Full access (Camera Management, NVR Monitor, Playback, and Archive Downloads).
- **Viewer**: View-only access dedicated to Live streaming and Historical Playback with Archive downloads.
- **Role Badges**: Red (**Admin**) and Blue (**Viewer**) visual badges.

### 5. PWA Indefinite Sessions & WebAuthn App Lock
- **Indefinite Sessions**: PWA standalone mode automatically refreshes tokens via background interceptor.
- **App Lock**: Locks screen on background minimization with **Face ID / Touch ID / Fingerprint / PIN** or account password fallback.

### 6. Automated NVR Recording (`nvr-service`) & S3 Hierarchy
- Multi-camera FFmpeg workers store MP4 segments structured by `YYYY-MM-DD/<CameraName>_<ID>/<Filename>.mp4` (720p @ 15fps).
- 24-hour interactive playback timeline and direct MP4 downloads.

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
- **Frontend App**: `http://localhost:5173` (or deployed URL)
- **CCTV API Gateway**: `http://localhost:8088` (Proxies all REST & Auth APIs)
- **Socket.IO Relay**: `http://localhost:3005` (WebSocket events)
- **WebRTC Stream Media**: `http://localhost:8555`

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
