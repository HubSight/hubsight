# HubSight Admin API v1 — Implementation Coverage

## Scope

This document records the implementation status of the 135 HTTP entries in
`ADMIN_API_V1_ENDPOINT_CATALOG.md` and the Admin realtime contract requested by
`BACKEND_IMPLEMENTATION_PROMPT.md`.

The public namespace is isolated at `/api/admin/v1`. Existing domain packages
may be reused behind it, but no Admin endpoint is registered under the legacy
`/api/*`, `/api/auth/*`, or `/api/app/v1/*` route trees.

The C++ Qt SDK source referenced by the implementation prompt was not present
in this checkout (`qt-sdk/include/hubsight/admin/...` is absent). Coverage is
therefore validated against the checked-in endpoint catalog and existing Go
domain contracts. DTO/parser compatibility must be rechecked when that SDK
source is added.

## Implemented areas

| Area | Catalog entries | Status |
|---|---:|---|
| Bootstrap authentication | 6 | Implemented; Admin JWT only, no cookie |
| Profile, sessions, 2FA, passkeys | 17 | Implemented; destructive passkey deletion requires confirmation |
| Dashboard/system/settings | 8 | Implemented except durable audit-event querying |
| Cameras/discovery/PTZ/recognition logs | 20 | Implemented through isolated Admin routes; camera delete and log cleanup require exact confirmation |
| Live/WebRTC matrix | 9 | Implemented except profile switching and QoE persistence |
| Archive/playback | 6 | Implemented with short-lived signed URLs |
| Members/faces/uploads | 13 | Implemented; member/avatar/face deletion confirmation enforced |
| Notifications/push subscriptions | 11 | Implemented |
| NVR/pool monitoring | 3 | Implemented |
| Users/roles/permissions/sessions | 17 | Implemented; viewer access is denied by `admin_api:access` boundary |
| API client governance | 9 | Implemented; secret key is returned only on creation |
| Google service accounts | 7 | Implemented; Admin delete requires name/project/ID confirmation |
| Admin `.hscfg` | 7 | Implemented, including revoke and `fcm_enabled=false` |
| Long-running operations | 2 | Scan-job backed; a general durable operation store remains pending |

The catalog contains 135 HTTP entries. The prose in the implementation prompt
calls this “136 catalog entries” because it counts the realtime contract as an
additional catalog item.

## Deliberate follow-up items

The following routes are registered and protected, but currently return an
explicit `501 Not Implemented` contract instead of claiming a false success:

- `GET /system/audit-events` — requires a durable audit-event model/store and
  retention/query policy.
- `POST /live/sessions:change-profile` — requires pool lease profile migration
  without tearing down unrelated matrix tiles.
- `POST /live/sessions:qoe` — requires a bounded telemetry ingestion path and
  retention policy.

`/operations/{operation_id}` and `POST /operations/{operation_id}:cancel` are
currently backed by the camera-discovery job service. Other asynchronous
operations should publish a durable operation record before they are advertised
as fully generic operations.

## Authentication boundary

Every Admin REST route uses the following chain:

1. `X-API-Key` must resolve to an active `admin_desktop` client with audience
   `admin_api`.
2. Protected routes require `Authorization: Bearer <JWT>`.
3. The JWT must contain audience `admin_api`, match the API client binding, and
   resolve to an active session.
4. The user must be an Admin or have the explicit `admin_api:access`
   permission. A viewer with ordinary viewer permissions is rejected.
5. Route permissions are evaluated separately using the existing RBAC matrix.

The same boundary is used for login authorization, refresh, protected REST,
the internal relay validation endpoint, and WebRTC requests made with an
`admin_desktop/admin_api` client. Admin JWTs are rejected by the legacy token
validation path so they cannot be replayed through a legacy client route.

## Realtime implementation

`wss://<gateway>/relay/admin/v1` is a standard JSON WebSocket. It supports:

- `subscribe`, `unsubscribe`, `resume`, and `ping` commands;
- allowlisted topics with RBAC permission checks;
- versioned event envelopes with `event_id`, `schema_version`, `topic`,
  `timestamp`, and `data`;
- bounded in-memory best-effort replay and an explicit
  `replay_unavailable` response;
- no generic room joins, client event publishing, cookies, or query credentials.

The existing Socket.IO relay remains available at `/relay` for legacy clients.

## Database note

Admin `.hscfg` revocation adds `revoked` and `revoked_at` to `app_configs`.
The repository's existing GORM `AutoMigrate` path applies this change at
service startup. Download and QR generation reject revoked Admin packages with
`CONFIG_REVOKED`.
