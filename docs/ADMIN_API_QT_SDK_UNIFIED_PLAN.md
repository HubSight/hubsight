# HubSight Admin API and Qt/C++ SDK Unified Plan

> **Status:** Draft for architecture and implementation review
>
> **Consolidated from:** `ADMIN_API_QT_SDK_PLAN.md` and `QT_DESKTOP_SDK_FEASIBILITY.md` (removed after consolidation)
>
> This document is the consolidated architecture and feasibility plan for the professional HubSight Admin desktop client. The endpoint-level contract remains defined in [`ADMIN_API_V1_ENDPOINT_CATALOG.md`](ADMIN_API_V1_ENDPOINT_CATALOG.md).

## 1. Executive decision

Building a cross-platform HubSight Admin desktop client with Qt 6, C++20, and QML is technically feasible and is the preferred direction for a professional VMS workstation. Qt provides the native networking, GPU rendering, multithreading, secure-storage integration, and packaging control required for long-running surveillance applications.

The SDK must be built on the new **Admin API v1**, not directly on the existing App API. The existing App API remains a compatibility reference and may continue serving Mobile/Desktop App clients, but it is not a runtime dependency of the Admin SDK.

The combined solution is therefore:

```text
HubSight Admin SDK (Qt 6 / C++20 / QML)
        |
        | HTTPS REST: Authorization: Bearer <JWT>
        |              X-API-Key: <admin-desktop-key>
        v
API Gateway
  |- /api/admin/v1/*  -> dedicated Admin API handlers
  |- /relay/admin/v1  -> dedicated JSON WebSocket relay
  `- /webrtc/*        -> gateway-controlled WebRTC signaling/media policy
        |
        `-> shared domain services, repositories, pool, NVR, storage, and events
```

The Admin API and SDK must satisfy these non-negotiable requirements:

- The Gateway is the only external REST and realtime entry point.
- The Admin desktop client uses a Bearer JWT and an API client key together.
- The SDK never uses cookies, HTTP sessions, query-string credentials, or `X-Client-ID`.
- Admin endpoints, DTOs, handlers, OpenAPI schemas, and realtime contracts are separate from existing API contracts.
- Shared business logic may be extracted into domain services and reused by both legacy and Admin handlers.
- Live viewing supports layouts up to 64 cameras with bounded resource usage and partial-failure handling.
- WebSocket carries control/events only; video continues through WebRTC/media transport.

## 2. Analysis of the source documents

### 2.1. Responsibilities of each source

| Source | Strongest contribution | Decision in the unified plan |
|---|---|---|
| `ADMIN_API_QT_SDK_PLAN.md` | Admin namespace, JWT/API-key security, kill switch, endpoint groups, 64-camera matrix, realtime protocol, implementation phases, acceptance criteria | Normative backend and integration contract |
| `QT_DESKTOP_SDK_FEASIBILITY.md` | Qt/C++ feasibility, QML architecture, WebRTC/FFmpeg options, GPU decoding, `.hscfg`, archive playback, secure storage, packaging, technology risks | Normative client technology guidance, subject to benchmark and platform validation |

### 2.2. Important inconsistencies resolved

| Topic | Feasibility document | Admin API plan | Unified decision |
|---|---|---|---|
| API base | Uses `/api/app/v1/*` | Requires `/api/admin/v1/*` | Admin SDK uses only `/api/admin/v1/*`; App API is legacy/reference-only |
| Authentication | Mentions `?api_key=...&token=...` and legacy App API behavior | Requires JWT + `X-API-Key` headers | Credentials are sent only in headers; query credentials are forbidden |
| Realtime | References existing Socket.IO `/relay` | Requires plain JSON WebSocket `/relay/admin/v1` | Admin SDK uses standard JSON WebSocket because `QWebSocket` does not implement Socket.IO framing natively |
| Client entry point | `HubSightClient` | `AdminClient`, `AuthManager`, `LiveMatrixManager` | Use a dedicated Admin SDK API; retain old names only in an explicit compatibility package if needed |
| Thumbnail example | Synchronous `QEventLoop` inside `QQuickImageProvider` | Header-authenticated Admin endpoints | The synchronous example is proof-of-concept only; production uses an asynchronous thumbnail/cache pipeline |
| Performance figures | Gives RAM/startup/FPS estimates | Requires benchmarked profiles and bounded concurrency | Treat estimates as hypotheses and validate them on supported hardware |
| Video transport | WebRTC through a gateway signaling path and media port | WebRTC remains separate from REST/WebSocket control | Keep the separation; expose only gateway-approved signaling/media paths |

The main architectural correction is to prevent the new Admin SDK from inheriting the weaker or incompatible credential conventions of the existing App API.

## 3. Scope and non-goals

### 3.1. Scope

The Admin API and SDK cover the functionality needed by the web administration experience and a professional desktop VMS client:

- system dashboard, health, settings, storage, NVR, and pool monitoring;
- camera CRUD, discovery, ONVIF probing, lifecycle, PTZ, presets, homography, thumbnails, and snapshots;
- live camera catalog, profile selection, batch WebRTC negotiation, lease heartbeat/release, and QoE telemetry;
- archive timeline, available recording days, playback, download, and thumbnails;
- members, face samples, AI logs, recognition events, and image uploads;
- notifications and native desktop push configuration;
- users, roles, permissions, sessions, audit events, and client governance;
- Google service-account administration and Firebase preflight;
- `.hscfg` generation, download, QR enrollment, revocation, and deletion;
- Admin realtime events and long-running operation progress.

### 3.2. Non-goals

- Do not replace or remount the existing Web App API or Mobile/Desktop App API.
- Do not expose core-service, auth-service, pool-service, relay-service, gRPC, RabbitMQ, or go2rtc directly to the public network.
- Do not send video frames over REST or WebSocket.
- Do not promise 64 high-resolution full-HD streams without a hardware/source-specific benchmark.
- Do not make the SDK responsible for composing camera `stop -> update -> start`; the server owns that atomic workflow.

## 4. Unified Admin API contract

### 4.1. Namespaces and authentication

```text
REST:     https://<gateway>/api/admin/v1
Realtime: wss://<gateway>/relay/admin/v1
WebRTC:   gateway-controlled signaling and permitted media transport
```

Authentication rules:

- Bootstrap endpoints accept `X-API-Key` and do not require a JWT.
- Every protected REST request requires both `Authorization: Bearer <JWT>` and `X-API-Key`.
- The WebSocket handshake requires the same two headers.
- The key must belong to an active client with the `admin_desktop` audience/platform.
- The JWT must contain `aud=admin_desktop`, and its `client_id` must match the API key.
- Tokens and keys must never appear in URLs, logs, image-provider IDs, or playback query strings.
- The server may keep a token ledger for refresh rotation, revocation, audit, and security alerts; this is not an HTTP session used by the client.

The complete endpoint list, permissions, and request purposes are maintained in [`ADMIN_API_V1_ENDPOINT_CATALOG.md`](ADMIN_API_V1_ENDPOINT_CATALOG.md).

### 4.2. Login and token lifecycle

1. The SDK calls `POST /api/admin/v1/auth/login` with the API key and credentials.
2. The server performs credential, MFA/passkey, client-audience, and policy checks.
3. The response returns an access JWT, refresh token, expiry metadata, user data, and client binding without setting a cookie.
4. The SDK keeps the access token in memory where possible and stores the refresh token/API key through OS secure storage.
5. Every protected request sends both required headers.
6. Refresh tokens rotate. Logout, user blocking, client revocation, or forced logout invalidates the relevant token ledger entries.
7. A single-flight refresh coordinator prevents multiple concurrent `401` responses from starting parallel refresh operations.

### 4.3. Kill switch and recovery

`settings.admin_api_enabled` is independent of the existing Mobile App API switch. When it is disabled, Admin REST and WebSocket handshakes return `503` with `ADMIN_API_DISABLED` and `Retry-After: 300`.

The SDK must:

- enter a `Maintenance` state with the server code and retry time;
- stop rendering and close WebRTC peer connections;
- disconnect realtime and cancel lease heartbeats;
- preserve credentials during maintenance or transient network failure;
- retry with `Retry-After`, exponential backoff, and jitter;
- refresh the token, reconnect realtime, load a fresh REST snapshot, and restore the layout only after recovery;
- distinguish intentional Admin API maintenance from DNS, timeout, and generic `5xx` degradation.

### 4.4. Common REST rules

- JSON is UTF-8; timestamps use RFC 3339; IDs use 21-character nanoids.
- Mutations accept `Idempotency-Key`.
- Lists use cursor pagination and explicit filters; large lists must not use offset pagination.
- Mutations that require concurrency control return `revision`/`ETag`.
- Destructive operations require an exact target-name confirmation. If no name/unique name exists, the required literal is `yes`.
- Active camera configuration changes are server-side transactions: `validate -> stop pool -> update -> start pool -> publish camera.updated`.
- The server returns a standard error envelope containing `status`, `code`, `error`, `details`, and `request_id`.

## 5. Qt/C++ feasibility and technology choices

### 5.1. Recommended baseline

| Area | Recommendation | Rationale |
|---|---|---|
| Language | C++20 | RAII, deterministic lifetime, native media integration, long-running-process stability |
| UI | Qt Quick/QML | GPU-accelerated compositing, flexible camera-grid layouts, modern desktop UI |
| Enterprise widgets | Qt Widgets where appropriate | Mature administration controls and complex data-entry screens |
| Qt version | Qt 6.6+ | Required API baseline for the SDK and supported platform toolchains |
| HTTP | `QNetworkAccessManager` | Native HTTPS/HTTP2 support, request interception, cancellation, and Qt event integration |
| WebSocket | `QWebSocket` | Standard JSON WebSocket for Admin realtime; no Socket.IO framing |
| WebRTC | `libdatachannel` | Smaller C++ integration surface than Google `libwebrtc`, suitable for a custom SDK |
| Video decode | FFmpeg with platform hardware backends | QSV, NVDEC, VideoToolbox, and software fallback |
| Rendering | `QQuickItem`, `QVideoSink`, or platform texture path | Enables GPU-aware rendering and zero-copy where supported |
| Secure storage | `qtkeychain` or equivalent OS-native adapter | Windows Credential Manager/DPAPI, macOS Keychain, Linux Secret Service/KWallet |
| Build/package | CMake + vcpkg or Conan | Reproducible dependency management across Windows, macOS, and Linux |

### 5.2. Why Qt is suitable for a professional VMS client

Qt is a strong fit because the client needs native control over GPU resources, decoder lifetime, worker threads, multiple windows, and 24/7 operation. It also allows the product to share a C++ media layer between QML views and lower-level diagnostic or enterprise widgets.

Claims such as a specific RAM footprint, startup time, or 60–120 FPS UI must not be treated as universal guarantees. They depend on the number of active decoders, codec/profile, GPU driver, display layout, operating system, and camera network conditions. They become release targets only after the benchmark in Section 11 passes.

## 6. SDK architecture

### 6.1. Proposed repository structure

```text
hubsight-admin-sdk-cpp/
  CMakeLists.txt
  include/hubsight/admin/
    AdminClient.h
    AdminTypes.h
    AuthManager.h
    RealtimeClient.h
    LiveMatrixManager.h
    SecureStorage.h
    HscfgManager.h
    resources/
      CameraClient.h
      ArchiveClient.h
      MemberClient.h
      NotificationClient.h
      AccessClient.h
      SystemClient.h
      GoogleServiceClient.h
      AppConfigClient.h
  src/
    transport/
    auth/
    realtime/
    media/
    archive/
    crypto/
    resources/
  qml/
    CameraGridView.qml
    CameraTile.qml
    NvrTimelineControl.qml
  examples/admin-vms-qml/
  tests/
    unit/
    contract/
    integration/
    performance/
```

### 6.2. Public components

- `AdminClient`: gateway configuration, API-key provider, request IDs, timeout, retry, and resource-client access.
- `AuthManager`: login, MFA/passkey, single-flight refresh, logout, token state, and secure-storage integration.
- `RealtimeClient`: authenticated WebSocket lifecycle, topic subscriptions, reconnect, event replay, and snapshot reconciliation.
- `LiveMatrixManager`: layout state, wave-based negotiation, profile switching, lease heartbeat/release, cancellation, and QoE reporting.
- Resource clients: camera, archive, member/AI, notification, access, system, Google service, and app config.
- `HscfgManager`: decrypt/validate local `.hscfg` packages using the approved specification; keep secrets out of ordinary logs and DTOs.
- `SecureStorage`: platform adapter for API keys and refresh tokens.
- Typed `Error`: authentication, permission, maintenance, validation, conflict, network, media, and service-unavailable categories.

### 6.3. Public API shape

The public API must represent the Admin contract rather than exposing raw URL construction to application code. A simplified shape is:

```cpp
class AdminClient : public QObject {
    Q_OBJECT

public:
    explicit AdminClient(QObject* parent = nullptr);

    void setGatewayUrl(const QUrl& gatewayUrl);
    void setApiKeyProvider(std::shared_ptr<ApiKeyProvider> provider);
    AuthManager* auth();
    RealtimeClient* realtime();
    LiveMatrixManager* liveMatrix();
    CameraClient* cameras();
    ArchiveClient* archive();

signals:
    void stateChanged(AdminState state);
    void maintenanceChanged(MaintenanceInfo info);
    void requestFailed(AdminError error);
};
```

A legacy `HubSightClient` may exist in a separate App API compatibility library, but it must not silently route Admin SDK calls to `/api/app/v1/*`.

## 7. Media and live-matrix architecture

### 7.1. Profiles and limits

The SDK supports layouts of 1/4/9/16/32/64 tiles. Profiles are selected according to the visible layout and camera capabilities:

| Profile | Intended use | Initial target |
|---|---|---|
| `matrix_64` | Overview | 320–640p, 5–10 FPS, H.264, audio off by default |
| `matrix_16` | Detailed grid | 640–720p, 10–15 FPS |
| `focus` | Selected/fullscreen camera | Main stream at the best supported quality |
| `thumbnail` | Offscreen/transition state | Persistent 640p/15 FPS JPEG, no WebRTC lease |

The server rejects more than 64 negotiation items, duplicate camera IDs, and oversized SDP payloads. A batch response contains a result for each camera, so one failed camera does not discard successful negotiations.

### 7.2. Control and media flow

```text
Admin SDK
  -> POST /api/admin/v1/live/sessions:negotiate
  <- SDP answer + lease/profile result per camera
  <-> WebRTC media through the gateway-approved media path

Admin SDK
  -> POST /api/admin/v1/live/sessions:heartbeat
  -> POST /api/admin/v1/live/sessions:release
  -> POST /api/admin/v1/live/sessions:qoe
```

Backend requirements:

- batch-load camera metadata rather than issuing one database query per tile;
- use a bounded signaling worker pool, such as a configurable 8–16 concurrent negotiations;
- make lease heartbeat and release idempotent;
- keep the pool policy of at most five UI clients per live RTSP connection;
- release or downgrade streams when tiles leave the viewport;
- publish camera, pool, and NVR events so the client does not poll continuously.

Client requirements:

- negotiate in waves and cancel obsolete waves when the layout changes;
- keep active audio to one tile or a configurable small number;
- use virtualized QML tiles and thumbnail fallback for offscreen cameras;
- close/release streams on logout, token revocation, API disablement, window close, and suspend;
- collect connect time, FPS, dropped frames, packet loss, RTT, jitter, decoder queue, and GPU/CPU telemetry where available.

### 7.3. WebRTC implementation options

| Option | Decision | Reason |
|---|---|---|
| `libdatachannel` + FFmpeg | Recommended baseline | Practical C++/CMake integration and flexible hardware-decoder control |
| Google `libwebrtc` | Deferred option | Feature-rich but has a very large source/build/toolchain cost |
| GStreamer `webrtcbin` | Platform-specific option | Strong Linux pipeline, but increases runtime/plugin deployment requirements on Windows and macOS |

The recommended media path is `libdatachannel` for PeerConnection and RTP reception, FFmpeg for decode, and a Qt texture/rendering adapter for QML. Hardware decode is preferred, with a controlled software fallback and explicit decoder-capacity limits.

## 8. Other client capabilities retained from the feasibility study

### 8.1. Archive playback

The Admin API returns a short-lived playback descriptor or URL through `POST /archive/recordings/{recording_id}:playback-url`. The SDK uses Qt Multimedia/FFmpeg or the shared media layer, supports HTTP range seeking where the server permits it, and keeps playback credentials out of URLs when a header-authenticated stream is available.

### 8.2. Thumbnail pipeline

The Admin endpoint is `GET /api/admin/v1/cameras/{camera_id}/thumbnail`. The production SDK should use an asynchronous provider and a bounded memory cache, not a blocking `QEventLoop` in `QQuickImageProvider::requestImage`. A dedicated thumbnail worker can coalesce refreshes, apply no-cache semantics, and return a dark placeholder for unavailable cameras without blocking the UI thread.

### 8.3. `.hscfg` and secure storage

The SDK may load encrypted configuration packages using the existing `.hscfg` specification: Argon2id, AES-256-GCM with the defined AAD, and Ed25519 signature verification. Implement this in a separately testable crypto module and keep the PIN, decrypted secrets, refresh token, and API key out of QML properties and diagnostic logs.

Use OS-backed secure storage for refresh tokens and API keys:

- Windows Credential Manager/DPAPI;
- macOS Keychain;
- Linux Secret Service, GNOME Keyring, or KWallet.

### 8.4. QML and Widgets

Use QML for the live matrix, responsive layout, overlays, and high-frequency visual state. Use Qt Widgets where dense tables, administration forms, or existing enterprise controls are more maintainable. Both UI layers must consume the same SDK resource and media abstractions.

## 9. Realtime protocol

Admin realtime uses standard JSON WebSocket at `/relay/admin/v1`:

```text
GET wss://<gateway>/relay/admin/v1
Authorization: Bearer <JWT>
X-API-Key: <admin-desktop-key>
```

The client may subscribe only to allowlisted topics authorized by its permissions. Generic room joins, arbitrary client broadcasts, and event publishing by the client are not supported.

Events use a versioned envelope:

```json
{
  "event_id": "evt_...",
  "schema_version": 1,
  "topic": "camera.updated",
  "timestamp": "2026-09-18T10:00:00Z",
  "data": {}
}
```

Important topics include `admin_api.enabled`, `admin_api.disabled`, `auth.force_logout`, `session.revoked`, camera/pool/NVR updates, AI recognition events, notifications, and long-running operation progress/completion/failure.

After reconnect, the SDK loads a REST snapshot and then requests best-effort replay from the last `event_id`. If replay is unavailable, the snapshot is authoritative.

## 10. Security, reliability, and lifecycle requirements

- Enforce JWT audience, client binding, permission, expiry, and token-revocation checks at the Admin middleware boundary.
- Redact API keys, refresh tokens, passwords, service-account credentials, and signed URLs from logs and crash reports.
- Apply rate limits, expiry, rotation, revocation, and last-used auditing to Admin client keys.
- Record sensitive actions with actor, client, token ID, IP, target, redacted payload, request ID, result, and timestamp.
- Use RAII, smart pointers, explicit thread ownership, cancellation, and bounded queues.
- Test 24/7 operation for memory leaks, thread leaks, decoder exhaustion, stale leases, and orphan WebRTC streams.
- Make logout, forced logout, API disablement, camera stop, window close, and app suspend converge on the same resource-release path.

## 11. Benchmark and proof-of-concept plan

The feasibility study's RAM, startup, and rendering figures are useful planning hypotheses. Before committing to release targets, measure at least:

| Benchmark | Required scenarios | Evidence |
|---|---|---|
| Matrix capacity | 1/4/9/16/32/64 cameras; `matrix_64`, `matrix_16`, and `focus` profiles | FPS, dropped frames, decode latency, CPU/GPU/RAM |
| Negotiation | 64-camera batch, partial failures, rapid layout changes | p50/p95 negotiation time, cancellation rate, server concurrency |
| Long-running stability | 24-hour and multi-day soak with reconnects and profile changes | memory/handle/thread/lease/decoder trend |
| Maintenance recovery | kill switch, DNS failure, gateway restart, token revocation | recovery time and absence of orphan streams |
| Archive | seek, rate changes, concurrent live + playback | seek latency, decoder contention, resource usage |
| Platform matrix | supported Windows, macOS, and Linux GPU/driver combinations | pass/fail and fallback behavior |

Initial acceptance targets should be agreed after a representative hardware baseline is selected. The product must not advertise “64 streams” without stating the tested profile, codec, resolution, FPS, and hardware.

## 12. Delivery roadmap

### Phase 0 — Contract, threat model, and benchmark baseline

1. Finalize OpenAPI 3.1, realtime JSON schemas, error codes, idempotency, pagination, and delete confirmation.
2. Finalize JWT claims, API-key audience, refresh/revocation lifecycle, secure-storage policy, and audit rules.
3. Define supported desktop hardware/OS baselines and run the first 64-camera benchmark.

### Phase 1 — Admin API foundation

1. Add `admin_api_enabled` and the web-app toggle.
2. Add Admin client audience/key validation and `AdminKillSwitchMiddleware`.
3. Implement JWT-only auth handlers without cookie reads/writes.
4. Add dedicated Gateway routes and defense-in-depth checks in auth/core/relay.
5. Add contract tests for dual authentication, revocation, and maintenance behavior.

### Phase 2 — REST parity and shared domain services

1. Implement Admin handlers and DTOs for system, profile, cameras, live catalog, archive, members/AI, and notifications.
2. Implement access control, client governance, Google services, and app configuration.
3. Extract reusable domain logic from legacy HTTP handlers without sharing transport contracts.
4. Complete endpoint-level OpenAPI, RBAC, audit, examples, and contract tests.

### Phase 3 — Realtime and live matrix

1. Implement the Admin JSON WebSocket relay and topic authorization.
2. Implement 64-item negotiation, bounded worker pools, leases, profile switching, and QoE telemetry.
3. Add maintenance, revocation, camera, pool, NVR, and long-running-operation events.
4. Run load, reconnect, and soak tests across the supported profiles.

### Phase 4 — Qt SDK and sample VMS

1. Implement transport, auth, secure storage, REST resources, and realtime.
2. Implement `.hscfg` handling, thumbnail cache, archive playback, and QML components.
3. Integrate `libdatachannel`, FFmpeg hardware decoding, software fallback, and QML rendering.
4. Deliver a sample Admin VMS with 1/4/9/16/32/64 layouts.

### Phase 5 — Packaging, hardening, and release

1. Package Windows, macOS, and Linux with signed release artifacts and reproducible dependencies.
2. Perform security review for key leakage, JWT confusion, replay, privilege escalation, and WebSocket subscription bypass.
3. Perform performance and 24/7 stability review.
4. Publish SDK semver, ABI policy, CMake package configuration, vcpkg/Conan metadata, changelog, and upgrade guidance.

## 13. Unified acceptance criteria

- Admin SDK requests never require or send cookies, sessions, query tokens, or query API keys.
- Protected REST and realtime requests require both the JWT and `X-API-Key`.
- Non-Admin JWTs and keys outside the `admin_desktop` audience are rejected.
- The Admin kill switch is independent of the Mobile App API and returns the documented maintenance contract.
- Maintenance, network failure, token refresh, token revocation, logout, and reconnect do not leave orphan media or leases.
- No Admin endpoint aliases an existing endpoint; shared code exists below the transport/handler contract boundary.
- All web-app functionality has a documented, permissioned, audited, and contract-tested Admin mapping.
- Active camera updates always execute server-side as stop -> update -> start.
- Destructive operations require exact-name or literal `yes` confirmation.
- Matrix negotiation never exceeds 64 items, supports partial failure, and uses idempotent heartbeat/release.
- The Qt SDK provides tested implementations for networking, secure storage, realtime, thumbnails, archive playback, and WebRTC lifecycle.
- Benchmark and soak evidence supports the advertised camera count and profile on each supported hardware baseline.

## 14. Document ownership

- `ADMIN_API_QT_SDK_UNIFIED_PLAN.md`: consolidated architecture, feasibility, SDK design, and delivery plan.
- `ADMIN_API_V1_ENDPOINT_CATALOG.md`: authoritative endpoint inventory, permissions, and realtime message catalog.
