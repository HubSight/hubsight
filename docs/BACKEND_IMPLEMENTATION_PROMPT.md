# Prompt triển khai HubSight Admin Backend

Bạn là Senior Backend Engineer phụ trách hoàn thiện HubSight Admin API.

## Mục tiêu

Hoàn thiện backend để tương thích đầy đủ với HubSight Admin SDK for Qt/C++.

SDK đã có:

- Admin API namespace: `/api/admin/v1`;
- 136 endpoint entries trong catalog:
  `qt-sdk/include/hubsight/admin/admin_endpoint_catalog.h`;
- 135 HTTP endpoints;
- Standard JSON realtime relay: `/relay/admin/v1`;
- Socket.IO compatibility relay tùy chọn: `/relay`;
- WebRTC signaling/session foundation;
- JWT access/refresh flow;
- API key authentication;
- `.hscfg` chứa cấu hình gateway/realtime/WebRTC URLs.

Backend phải triển khai hoặc đồng bộ đúng contract trên. Không sửa SDK để tương thích với các legacy route sai contract.

---

## Bước 1: Khảo sát hiện trạng

Trước khi sửa code:

1. Đọc toàn bộ tài liệu liên quan trong thư mục `hubsight/docs`, đặc biệt:
   - `ADMIN_API_V1_ENDPOINT_CATALOG.md`;
   - `ADMIN_API_QT_SDK_UNIFIED_PLAN.md`;
   - tài liệu authentication/JWT;
   - realtime/relay;
   - WebRTC;
   - upload/member/notification.
2. Đọc catalog phía SDK:
   ```text
   qt-sdk/include/hubsight/admin/admin_endpoint_catalog.h
   ```
3. Đọc các response DTO và parser:
   ```text
   qt-sdk/include/hubsight/admin/resources/*_types.h
   qt-sdk/src/resources/*_types.cpp
   ```
4. Lập bảng đối chiếu:

   | Catalog endpoint | Backend route hiện tại | HTTP method | Auth | Response schema | Trạng thái |
   |---|---|---|---|---|---|

5. Phân loại rõ:
   - đã đúng contract;
   - đang dùng legacy route;
   - thiếu route;
   - sai request/response schema;
   - thiếu auth/permission;
   - thiếu test.

Không đánh dấu endpoint là hoàn tất nếu chỉ trả về HTTP 200 giả.

---

## Bước 2: Admin REST namespace

Tất cả Admin route phải nằm dưới:

```text
/api/admin/v1
```

Không dùng các route legacy như:

```text
/api/app/v1
/notifications/read-all
/notifications/batch
/notifications/:id/read
```

nếu chúng không đồng thời được expose dưới Admin contract mới.

Đảm bảo toàn bộ 135 HTTP endpoints trong catalog hoạt động thật:

- authentication/account/profile/passkey/2FA;
- system/dashboard/health/settings/audit/NVR/pool;
- cameras/lifecycle/PTZ/presets/discovery/ONVIF/recognition logs;
- live capabilities/session negotiation/heartbeat/release/QoE;
- archive timeline/recording URLs;
- members/avatar/faces/uploads;
- notifications/push subscriptions;
- permissions/roles/users/sessions;
- API clients;
- Google service accounts/Firebase preflight;
- app configs;
- long-running operations.

Mỗi route phải có:

- method chính xác;
- path parameter chính xác;
- query parameter chính xác;
- validation;
- permission check;
- audit logging cho mutation/destructive actions;
- idempotency nếu là mutation có nguy cơ retry;
- response status code đúng;
- error response đúng contract.

---

## Authentication

Admin API phải hỗ trợ:

```http
X-API-Key: <admin-api-key>
Authorization: Bearer <access-token>
```

Yêu cầu:

- không chấp nhận API key hoặc JWT trong query string;
- không phụ thuộc cookie/browser session;
- validate JWT issuer, audience, expiry, signature;
- audience dành cho Admin desktop:
  ```text
  admin_desktop
  admin_api
  ```
- refresh token rotation;
- revoke session;
- logout;
- 2FA;
- passkey/WebAuthn nếu endpoint đã có trong catalog;
- kiểm tra permissions theo từng endpoint.

Backend phải trả lỗi phân biệt rõ:

- `401`: thiếu/sai/expired JWT;
- `403`: không đủ permission;
- `409`: conflict;
- `422` hoặc `400`: validation;
- `429`: rate limit;
- `503`: Admin API maintenance/disabled.

---

## Error envelope

Chuẩn hóa error response tối thiểu:

```json
{
  "status": "error",
  "code": "INVALID_INPUT",
  "message": "Human readable message",
  "details": {},
  "request_id": "req_123",
  "retry_after_seconds": 0
}
```

Các field quan trọng:

- `code`;
- `message` hoặc `message_en`;
- `details` hoặc `errors`;
- `request_id`;
- `retry_after_seconds` nếu retry được.

Khi Admin API bị disable/maintenance:

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 120
```

```json
{
  "status": "error",
  "code": "ADMIN_API_DISABLED",
  "maintenance": true,
  "retry_after_seconds": 120,
  "request_id": "req_maintenance"
}
```

Mọi request phải có hoặc được backend phản hồi lại `request_id`.

---

## Pagination và query

Các list endpoint phải thống nhất:

```text
cursor
limit
next_cursor
has_more
```

Response có thể theo envelope:

```json
{
  "data": {
    "items": [],
    "next_cursor": "cursor_2",
    "has_more": true
  },
  "request_id": "req_123"
}
```

Hoặc format tương thích được documented trong API contract, nhưng phải nhất quán giữa các resource.

---

## Upload

Triển khai thật:

```text
POST /api/admin/v1/uploads/images
```

Hỗ trợ:

```http
Content-Type: multipart/form-data; boundary=...
```

Đồng thời triển khai:

```text
POST /api/admin/v1/uploads/images:presign
PUT  /api/admin/v1/members/{member_id}/avatar
DELETE /api/admin/v1/members/{member_id}/avatar
```

Yêu cầu:

- giới hạn kích thước file;
- kiểm tra MIME type;
- kiểm tra magic bytes/file signature;
- chống path traversal;
- không tin filename từ client;
- virus/malware scanning nếu hạ tầng hỗ trợ;
- lưu object storage hoặc storage backend đúng chuẩn;
- trả về upload/image ID;
- URL có expiry khi sử dụng presigned upload;
- không log raw image bytes hoặc credentials.

---

## Realtime Standard JSON Relay

Triển khai:

```text
/relay/admin/v1
```

Contract cần hỗ trợ:

- authenticated WebSocket handshake;
- API key và JWT headers;
- subscribe;
- unsubscribe;
- ping;
- resume/replay;
- event_id;
- schema_version;
- topic;
- timestamp;
- security events;
- `session.revoked`;
- `auth.force_logout`;
- `admin_api.disabled`;
- replay unavailable response;
- reconnect-safe behavior.

Event envelope đề xuất:

```json
{
  "type": "event",
  "event_id": "evt_123",
  "schema_version": 1,
  "topic": "camera.updated",
  "timestamp": "2026-09-18T10:00:00Z",
  "data": {}
}
```

Các topic phải được allowlist, không cho client subscribe tùy ý vào topic nội bộ.

---

## Socket.IO compatibility

Nếu backend vẫn cần hỗ trợ deployment legacy, duy trì Socket.IO tại:

```text
/relay
```

Không dùng Socket.IO framing cho:

```text
/relay/admin/v1
```

Socket.IO phải hỗ trợ:

- Engine.IO v4;
- namespace;
- heartbeat;
- event acknowledgement;
- room join/leave;
- authentication;
- session revoked/force logout;
- reconnect-safe room rejoin.

Polling fallback và binary attachment chỉ triển khai nếu backend contract thực sự yêu cầu.

---

## Live/WebRTC signaling

Backend phải triển khai đúng các route live:

- capabilities;
- list live cameras;
- negotiate;
- heartbeat;
- release;
- change-profile;
- stats;
- QoE;
- camera status.

WebRTC signaling response phải chứa đúng thông tin cần thiết:

```json
{
  "data": {
    "session_id": "live_1",
    "camera_id": "cam_1",
    "profile": "balanced",
    "media_transport": "webrtc",
    "remote_description": {
      "type": "answer",
      "sdp": "..."
    },
    "ice_candidates": [],
    "webrtc": {
      "ice_servers": [
        {
          "urls": ["stun:stun.example.com"]
        }
      ]
    }
  }
}
```

Cần triển khai hoặc cấu hình:

- STUN;
- TURN;
- ICE credentials;
- session expiry;
- session ownership;
- heartbeat timeout;
- release cleanup;
- server-side media/signaling lifecycle.

Lưu ý: native WebRTC media engine trên desktop là phần client-side riêng, không thay thế cho backend signaling/STUN/TURN.

---

## `.hscfg`

Backend/configuration service phải cung cấp `.hscfg` đúng contract Admin:

- profile: `admin_api`;
- format: `2.0`;
- gateway URL;
- Standard relay URL;
- Socket.IO URL nếu có;
- WebRTC signaling/media URLs;
- audience:
  ```text
  admin_desktop
  admin_api
  ```

Các URL production phải dùng:

```text
https://
wss://
```

Không đưa API key/JWT/refresh token vào URL.

---

## HTTP/2

Gateway cần hỗ trợ HTTP/2 qua TLS ALPN.

Kiểm tra:

- HTTP/2 handshake;
- fallback HTTP/1.1;
- reverse proxy;
- timeout;
- keep-alive;
- request ID forwarding;
- body size limit;
- compression nếu được phép.

SDK đã tự negotiate protocol, backend chỉ cần expose TLS/ALPN đúng.

---

## Tests bắt buộc

Thêm contract/integration tests cho:

1. Tất cả 135 HTTP catalog endpoints:
   - method;
   - path;
   - auth;
   - permission;
   - success response;
   - validation response.
2. JWT login/refresh/logout/revoke.
3. API key bắt buộc.
4. Không chấp nhận token trong query string.
5. 401/403/409/422/429/503.
6. Maintenance response `ADMIN_API_DISABLED`.
7. Pagination.
8. Idempotency và retry.
9. Multipart upload.
10. Presigned upload.
11. Avatar binary upload.
12. Standard JSON relay.
13. Replay/resume.
14. Security realtime events.
15. Live/WebRTC negotiate/heartbeat/release.
16. HTTP/1.1 và HTTP/2 nếu test infrastructure hỗ trợ.
17. Request ID propagation.
18. Audit log cho các mutation/destructive operations.

Không dùng mock 200 response để thay thế integration test với route thật.

---

## Quy tắc triển khai

- Không phá legacy API nếu chưa cần; có thể giữ backward compatibility.
- Nhưng Admin SDK phải luôn dùng `/api/admin/v1`.
- Không sửa SDK để che giấu backend route/schema chưa đúng.
- Không trả HTTP 200 cho operation thất bại.
- Không ghi log password, JWT, refresh token, API key, image bytes hoặc raw credentials.
- Tách rõ implementation REST, realtime, upload và WebRTC signaling.
- Dùng transaction/idempotency cho mutation quan trọng.
- Cập nhật OpenAPI/schema nếu repository có sử dụng.
- Cập nhật migration/database/permission seed nếu cần.

---

## Deliverables

Sau khi hoàn thành, cung cấp:

1. Bảng coverage 136 catalog entries.
2. Danh sách route mới hoặc route đã sửa.
3. Danh sách database migration.
4. Danh sách permission/role mới.
5. OpenAPI/schema cập nhật.
6. Test command và kết quả.
7. Các endpoint còn phụ thuộc external service:
   - object storage;
   - STUN/TURN;
   - Firebase;
   - Google service account;
   - WebRTC media service.
8. Các vấn đề còn tồn tại nếu backend chưa thể hoàn tất 100%.

Mục tiêu cuối cùng:

```text
qt-sdk AdminClient/AdminApplicationClient
        |
        v
/api/admin/v1
/relay/admin/v1
/relay
WebRTC signaling
        |
        v
HubSight backend chạy thật,
không còn route giả hoặc SDK_ENDPOINT_NOT_IMPLEMENTED
```
