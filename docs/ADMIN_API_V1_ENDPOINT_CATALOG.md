# HubSight Admin API v1 — Endpoint Catalog

> **Status:** Draft for review before implementation.
>
> This catalog describes only new Admin API endpoints. None of the endpoints below is an alias, rewrite, or HTTP wrapper for the existing `/api/*`, `/api/auth/*`, or `/api/app/v1/*` routes.

## 1. Base URL, version, and authentication

```text
REST: https://<gateway>/api/admin/v1
Realtime: wss://<gateway>/relay/admin/v1
```

### 1.1. Authentication conventions

| Symbol | Required header | Applies to |
|---|---|---|
| `K` | `X-API-Key: <admin-desktop-key>` | Bootstrap authentication and system status |
| `J+K` | `Authorization: Bearer <JWT>` + `X-API-Key` | Every protected endpoint |

The Admin API accepts only a Bearer JWT and an API key header. It does not accept a `session` cookie, `X-Client-ID`, `?token=`, `?api_key=`, or `?client_id=`.

### 1.2. General conventions

- The API key must belong to an active client with the `admin_desktop` audience/platform.
- The JWT must contain `aud=admin_desktop`; the JWT `client_id` must match the API key.
- All timestamps are RFC 3339; every primary ID is a 21-character nanoid.
- List endpoints use `cursor`, `limit`, `sort`, `order`, and filters documented in OpenAPI.
- Every mutation accepts the `Idempotency-Key` header.
- Every mutation returns `request_id`; entities requiring optimistic concurrency return `revision`/`ETag`.
- Every `DELETE` or destructive cleanup requires `confirmation.value`, exactly matching the target name/unique name; if there is no target name, it must be the literal `yes`.
- File or stream endpoints must use authentication headers; never put tokens/keys in the query string.

### 1.3. Maintenance / kill-switch error

When `admin_api_enabled=false`, all REST requests and realtime handshakes return `503`:

```http
Retry-After: 300
```

```json
{
  "status": "error",
  "code": "ADMIN_API_DISABLED",
  "error": "ADMIN_API_DISABLED",
  "maintenance": true,
  "retry_after_seconds": 300,
  "request_id": "req_..."
}
```

## 2. Bootstrap authentication

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/system/status` | K | — | Check Admin API enablement, version, maintenance, server time, feature flags, and capability summary |
| POST | `/auth/login` | K | — | Username/password login; return access JWT + refresh token; do not set a cookie |
| POST | `/auth/2fa/verify` | K | — | Complete TOTP or recovery-code login |
| POST | `/auth/passkeys/login/options` | K | — | Get WebAuthn assertion options |
| POST | `/auth/passkeys/login/verify` | K | — | Verify a passkey and return the token pair |
| POST | `/auth/refresh` | K | — | Rotate the refresh token and return a new access JWT |

## 3. Authentication, profile, and current-user security

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| POST | `/auth/logout` | J+K | Authenticated | Revoke the current JWT/refresh token; the SDK deletes local credentials |
| GET | `/auth/me` | J+K | Authenticated | User, role, permissions, client binding, and token expiry metadata |
| POST | `/auth/verify-password` | J+K | Authenticated | Re-authenticate before a sensitive action |
| PUT | `/auth/password` | J+K | Authenticated | Change the current user's password |
| PUT | `/profile` | J+K | Authenticated | Update full name, locale, timezone, theme, and preferences |
| GET | `/profile/sessions` | J+K | Authenticated | List the current user's token/device history and geolocation |
| DELETE | `/profile/sessions/{session_id}` | J+K | Authenticated | Revoke a session/token belonging to the current user |
| POST | `/profile/sessions:revoke-others` | J+K | Authenticated | Revoke all other tokens/sessions for the current user |
| POST | `/auth/2fa/setup` | J+K | Authenticated | Initialize the TOTP secret/QR/recovery codes |
| POST | `/auth/2fa/enable` | J+K | Authenticated | Enable 2FA with a TOTP code |
| POST | `/auth/2fa/disable` | J+K | Authenticated | Disable 2FA after password/TOTP verification |
| POST | `/auth/2fa/recovery-codes:regenerate` | J+K | Authenticated | Generate new recovery codes |
| GET | `/auth/passkeys` | J+K | Authenticated | List the current user's passkeys |
| POST | `/auth/passkeys/registration/options` | J+K | Authenticated | Get WebAuthn registration options |
| POST | `/auth/passkeys/registration/verify` | J+K | Authenticated | Complete passkey registration |
| PATCH | `/auth/passkeys/{passkey_id}` | J+K | Authenticated | Rename a passkey |
| DELETE | `/auth/passkeys/{passkey_id}` | J+K | Authenticated | Delete a passkey; confirmation required |

## 4. Dashboard, system, and settings

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/dashboard/summary` | J+K | `system:monitor` | Camera, alert, recording, storage, and NVR/pool health overview |
| GET | `/dashboard/activity` | J+K | `system:monitor` | Recent notifications, AI events, and system activity with cursor/filter |
| GET | `/system/health` | J+K | `system:monitor` | Aggregated gateway/core/auth/pool/relay/NVR/storage health |
| GET | `/system/capabilities` | J+K | `system:monitor` | Codec, live profiles, realtime schema, API limits, and supported operations |
| GET | `/system/settings` | J+K | `system:settings` | NVR status, storage quota, retention, and app/Admin API switches |
| PATCH | `/system/settings` | J+K | `system:settings` | Update settings; `admin_api_enabled` has a self-lockout protection rule |
| POST | `/system/storage:cleanup` | J+K | `system:settings` | Clean archive by retention/quota; `confirmation.value=yes` required |
| GET | `/system/audit-events` | J+K | `system:monitor` | Audit log with actor/client/action/target/time-range filters |

## 5. Camera inventory, discovery, and configuration

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/cameras` | J+K | `cameras:view` | List cameras with pagination/filter/status/capability summary |
| POST | `/cameras` | J+K | `cameras:manage` | Create a camera |
| GET | `/cameras/{camera_id}` | J+K | `cameras:view` | Camera configuration and safely redacted runtime status |
| PATCH | `/cameras/{camera_id}` | J+K | `cameras:manage` | Update a camera; active cameras run stop → update → start server-side |
| DELETE | `/cameras/{camera_id}` | J+K | `cameras:manage` | Delete a camera; exact-name confirmation required |
| POST | `/cameras/{camera_id}:start` | J+K | `cameras:manage` | Start the camera and recreate the required pool connection |
| POST | `/cameras/{camera_id}:stop` | J+K | `cameras:manage` | Stop the camera and tear down the pool connection immediately |
| POST | `/cameras/{camera_id}:restart` | J+K | `cameras:manage` | Stop/start with an explicit operation result |
| GET | `/cameras/{camera_id}/thumbnail` | J+K | `cameras:view` | Persistent 640p/15 FPS JPEG thumbnail, no-cache |
| GET | `/cameras/{camera_id}/snapshot` | J+K | `cameras:view` | Latest JPEG snapshot |
| PATCH | `/cameras/{camera_id}/homography` | J+K | `cameras:manage` | Update homography/calibration points |
| POST | `/cameras/{camera_id}/ptz:move` | J+K | `cameras:manage` | PTZ continuous/relative/absolute move, stop, zoom, and focus |
| GET | `/cameras/{camera_id}/presets` | J+K | `cameras:view` | List ONVIF PTZ presets |
| POST | `/cameras/{camera_id}/presets` | J+K | `cameras:manage` | Create/set/goto/remove a PTZ preset |
| POST | `/camera-discovery:scan` | J+K | `cameras:manage` | Start a subnet/CIDR scan for RTSP/ONVIF cameras |
| GET | `/camera-discovery/jobs/{job_id}` | J+K | `cameras:manage` | Poll the scan job and candidate results |
| POST | `/camera-discovery/jobs/{job_id}:cancel` | J+K | `cameras:manage` | Cancel a scan job |
| POST | `/cameras:onvif-probe` | J+K | `cameras:manage` | Probe host/port/credentials and return profile/stream URI/PTZ capabilities |
| GET | `/cameras/{camera_id}/recognition-logs` | J+K | `members:view` | Camera AI recognition logs with cursor/filter/time-range support |
| DELETE | `/cameras/{camera_id}/recognition-logs` | J+K | `members:manage` | Clear the camera's AI logs; camera-name confirmation required |

## 6. Live WebRTC and 64-camera matrix

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/live/capabilities` | J+K | `cameras:view` | Codec, stream profiles, matrix limit, heartbeat TTL, and media policy |
| GET | `/live/cameras` | J+K | `cameras:view` | Catalog of live-capable cameras, profile/substream capabilities, and status |
| POST | `/live/sessions:negotiate` | J+K | `cameras:view` | Batch SDP negotiation for up to 64 cameras, with a partial result per camera |
| POST | `/live/sessions:heartbeat` | J+K | `cameras:view` | Renew batch live leases |
| POST | `/live/sessions:release` | J+K | `cameras:view` | Idempotently release batch leases when changing layout or leaving the app |
| POST | `/live/sessions:change-profile` | J+K | `cameras:view` | Switch a tile between `thumbnail`/`matrix_64`/`matrix_16`/`focus` |
| GET | `/live/sessions:stats` | J+K | `cameras:view` | Server/pool status for live sessions owned by the current token |
| POST | `/live/sessions:qoe` | J+K | `cameras:view` | SDK best-effort report of dropped frames, RTT, jitter, decode/GPU telemetry |
| GET | `/live/cameras/{camera_id}/status` | J+K | `cameras:view` | Live status for one camera without creating a session/lease |

`POST /live/sessions:negotiate` must reject requests exceeding 64 items, duplicate camera IDs, or the SDP payload limit. The server returns `results[]` per camera instead of failing the entire request when one camera errors.

## 7. Archive, recording, and playback

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/archive/timeline` | J+K | `recordings:view` | Recording segments by `from`, `to`, `camera_id`, and cursor/filter |
| GET | `/archive/cameras/{camera_id}/available-days` | J+K | `recordings:view` | Days with recordings by year/month |
| GET | `/archive/recordings/{recording_id}` | J+K | `recordings:view` | Recording metadata |
| POST | `/archive/recordings/{recording_id}:playback-url` | J+K | `recordings:view` | Short-lived playback/presigned URL or stream descriptor for the native player |
| POST | `/archive/recordings/{recording_id}:download-url` | J+K | `recordings:view` | Short-lived download URL with an audited download action |
| POST | `/archive/recordings/{recording_id}:thumbnail-url` | J+K | `recordings:view` | Short-lived thumbnail URL |

## 8. Members, face recognition, and image upload

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/members` | J+K | `members:view` | List/search/filter/paginate members |
| POST | `/members` | J+K | `members:manage` | Create a member |
| GET | `/members/{member_id}` | J+K | `members:view` | Member details |
| PATCH | `/members/{member_id}` | J+K | `members:manage` | Update a member |
| DELETE | `/members/{member_id}` | J+K | `members:manage` | Delete a member; exact-name confirmation |
| PUT | `/members/{member_id}/avatar` | J+K | `members:manage` | Upload/replace an avatar using multipart |
| DELETE | `/members/{member_id}/avatar` | J+K | `members:manage` | Delete an avatar; member-name confirmation |
| GET | `/members/{member_id}/faces` | J+K | `members:view` | List face samples/vector metadata with pagination |
| POST | `/members/{member_id}/faces:enroll` | J+K | `members:manage` | Upload an image and enroll a face embedding |
| DELETE | `/members/{member_id}/faces/{face_id}` | J+K | `members:manage` | Delete one face sample; use `yes` if the face has no name |
| POST | `/members/{member_id}/faces:batch-delete` | J+K | `members:manage` | Delete multiple face samples; `yes` confirmation |
| POST | `/uploads/images` | J+K | `members:manage` | Upload a shared image with size/type validation |
| POST | `/uploads/images:presign` | J+K | `members:manage` | Get presigned upload instructions when direct object upload is needed |

## 9. Notifications and push configuration

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/notifications` | J+K | Authenticated | List/filter notifications, unread count, and cursor |
| GET | `/notifications/{notification_id}` | J+K | Authenticated | Notification details |
| PATCH | `/notifications/{notification_id}` | J+K | Authenticated | Mark as read/unread |
| POST | `/notifications:read-all` | J+K | Authenticated | Mark all notifications as read by user scope/filter |
| DELETE | `/notifications/{notification_id}` | J+K | Authenticated | Delete a notification; `yes` confirmation |
| POST | `/notifications:batch-delete` | J+K | Authenticated | Delete selected notifications; `yes` confirmation |
| POST | `/notifications:clear` | J+K | Authenticated | Delete all notifications in scope; `yes` confirmation |
| POST | `/notifications:test` | J+K | `system:monitor` | Test notification/push dispatch according to policy |
| GET | `/notifications/push-config` | J+K | Authenticated | Public push configuration state for SDKs supporting native push |
| PUT | `/notifications/push-subscriptions/current` | J+K | Authenticated | Upsert the native desktop push subscription/token when enabled |
| DELETE | `/notifications/push-subscriptions/current` | J+K | Authenticated | Remove the native push subscription from the current installation |

## 10. NVR and connection-pool monitoring

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/nvr/status` | J+K | `system:monitor` | Global/camera NVR status, recording queues, and storage summary |
| GET | `/pool/status` | J+K | `system:monitor` | Complete camera/connection/viewer pool snapshot |
| POST | `/pool:sync` | J+K | `system:monitor` | Trigger pool resynchronization and return the operation result |

## 11. User, role, permission, and session administration

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/permissions` | J+K | `users:view` | System permission catalog |
| GET | `/roles` | J+K | `users:view` | List roles and the permission matrix |
| POST | `/roles` | J+K | `roles:manage` | Create a custom role |
| GET | `/roles/{role_id}` | J+K | `users:view` | Role details |
| PATCH | `/roles/{role_id}` | J+K | `roles:manage` | Update name/description/permissions |
| DELETE | `/roles/{role_id}` | J+K | `roles:manage` | Delete a role; exact-role-name confirmation |
| GET | `/users` | J+K | `users:view` | List/search/filter/paginate users |
| POST | `/users` | J+K | `users:manage` | Create a user |
| GET | `/users/{user_id}` | J+K | `users:view` | User details and role summary |
| PATCH | `/users/{user_id}` | J+K | `users:manage` | Update profile, role, and active status |
| POST | `/users/{user_id}:reset-password` | J+K | `users:manage` | Admin password reset/must-change-password |
| POST | `/users/{user_id}:block` | J+K | `users:manage` | Block a user and revoke active tokens/sessions |
| POST | `/users/{user_id}:unblock` | J+K | `users:manage` | Unblock a user |
| DELETE | `/users/{user_id}` | J+K | `users:manage` | Delete a user; exact-username confirmation |
| GET | `/users/{user_id}/sessions` | J+K | `users:manage` | Session/device/token history for a user |
| DELETE | `/users/{user_id}/sessions/{session_id}` | J+K | `users:manage` | Revoke a specific token/session |
| POST | `/users/{user_id}/sessions:revoke-all` | J+K | `users:manage` | Revoke all tokens/sessions; username confirmation |

## 12. API client governance

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/clients` | J+K | `clients:manage` | List API clients, audience, platform, rate policy, and active status |
| POST | `/clients` | J+K | `clients:manage` | Create an API client; return the secret key only once |
| GET | `/clients/{client_id}` | J+K | `clients:manage` | Client details without exposing the secret key |
| PATCH | `/clients/{client_id}` | J+K | `clients:manage` | Update name, platform/audience, rate limit, expiry, and policy |
| POST | `/clients/{client_id}:enable` | J+K | `clients:manage` | Enable a client |
| POST | `/clients/{client_id}:disable` | J+K | `clients:manage` | Disable a client; revoke realtime/Admin token binding according to policy |
| POST | `/clients/{client_id}:rotate-key` | J+K | `clients:manage` | Rotate the secret; audit the old-key grace period clearly |
| POST | `/clients:verify` | J+K | `clients:manage` | Verify client configuration/policy for admin review |
| DELETE | `/clients/{client_id}` | J+K | `clients:manage` | Delete a client; exact client name/ID confirmation |

## 13. Google service accounts

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/google-service-accounts` | J+K | `service_accounts:manage` | List account metadata, active state, and health summary |
| POST | `/google-service-accounts:import` | J+K | `service_accounts:manage` | Import service-account JSON/multipart; encrypt the secret at rest |
| GET | `/google-service-accounts/{account_id}` | J+K | `service_accounts:manage` | Account metadata with credentials redacted |
| POST | `/google-service-accounts/{account_id}:activate` | J+K | `service_accounts:manage` | Select the active account |
| POST | `/google-service-accounts/{account_id}:test` | J+K | `service_accounts:manage` | Test credentials/connectivity |
| GET | `/google-service-accounts/{account_id}/firebase-preflight` | J+K | `service_accounts:manage` | Firebase app/project preflight |
| DELETE | `/google-service-accounts/{account_id}` | J+K | `service_accounts:manage` | Delete an account; exact name/project ID confirmation |

## 14. App configuration (`.hscfg`)

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/app-configs` | J+K | `app_configs:manage` | List config metadata, expiry, status, and target platform |
| POST | `/app-configs` | J+K | `app_configs:manage` | Generate an encrypted/signed `.hscfg` |
| GET | `/app-configs/{config_id}` | J+K | `app_configs:manage` | Config metadata details |
| POST | `/app-configs/{config_id}:download-url` | J+K | `app_configs:manage` | Short-lived download instruction/URL with download audit |
| GET | `/app-configs/{config_id}/qr` | J+K | `app_configs:manage` | QR enrollment payload/image metadata |
| POST | `/app-configs/{config_id}:revoke` | J+K | `app_configs:manage` | Disable enrollment/config before expiry |
| DELETE | `/app-configs/{config_id}` | J+K | `app_configs:manage` | Delete a config file; exact config name/object key confirmation |

## 15. Long-running operation API

Scan, camera restart, storage cleanup, Google service-account import/test, pool sync, and config generation may return an asynchronous operation.

| Method | Endpoint | Auth | Permission | Purpose |
|---|---|---:|---|---|
| GET | `/operations/{operation_id}` | J+K | Permission of the originating operation | Get the state/progress/result/error of a long-running operation |
| POST | `/operations/{operation_id}:cancel` | J+K | Permission of the originating operation | Cancel the operation if it is cancelable |

Realtime sends `operation.progress`, `operation.completed`, or `operation.failed` for operations the SDK is authorized to view.

## 16. Admin realtime protocol

### 16.1. Handshake

```text
GET wss://<gateway>/relay/admin/v1
Authorization: Bearer <JWT>
X-API-Key: <admin-desktop-key>
```

Do not use the Socket.IO protocol, cookies, or URL query credentials. The relay accepts only standard JSON WebSocket.

### 16.2. Client commands

| Command | Meaning |
|---|---|
| `subscribe` | Subscribe to one or more allowlisted and authorized topics |
| `unsubscribe` | Unsubscribe from a topic |
| `resume` | Provide `last_event_id` for best-effort resume/replay |
| `ping` | Application heartbeat when needed |

Generic room joins, custom broadcasts, and system-event publishing from Admin clients are not supported.

### 16.3. Server events

| Topic | Main data |
|---|---|
| `admin_api.enabled` | API switch enabled |
| `admin_api.disabled` | API switch disabled; the client must stop media/realtime |
| `auth.force_logout` | User blocked or forcibly logged out |
| `session.revoked` | JWT/token ledger revoked |
| `camera.started` | Camera started |
| `camera.stopped` | Camera stopped; live lease must close |
| `camera.updated` | Camera configuration/status changed |
| `pool.status.update` | Pool summary snapshot/delta |
| `nvr.status.update` | NVR state updated |
| `vision.person.entered` | AI event for a person entering the scene |
| `vision.person.update` | AI tracking/overlay update |
| `vision.person.left` | AI event for a person leaving the scene |
| `vision.log.new` | New recognition log |
| `member.face.updated` | Face/member state changed |
| `notification.new` | New notification |
| `operation.progress` | Long-running operation progress |
| `operation.completed` | Operation succeeded |
| `operation.failed` | Operation failed |

Every event uses this envelope:

```json
{
  "event_id": "evt_...",
  "schema_version": 1,
  "topic": "camera.updated",
  "timestamp": "2026-09-18T10:00:00Z",
  "data": {}
}
```

## 17. Review checklist

- [ ] Every web app action has a corresponding Admin endpoint.
- [ ] No Admin route reuses an existing HTTP endpoint.
- [ ] Login/refresh/passkey/2FA does not create or require a session cookie.
- [ ] Protected REST and realtime require both the JWT and `X-API-Key`.
- [ ] API keys/client IDs/query credentials are not exposed in URLs/logs.
- [ ] The Admin kill switch is separate from the Mobile App API and returns a consistent maintenance contract.
- [ ] Active camera updates follow stop → update → start.
- [ ] Destructive endpoints have server-side confirmation.
- [ ] Live negotiation is limited to 64, supports partial failure, and has idempotent heartbeat/release.
- [ ] Admin WebSocket uses an allowlisted topic set, not generic rooms/broadcasts.
- [ ] Every endpoint has an OpenAPI schema, RBAC mapping, audit rule, and contract test before release.
