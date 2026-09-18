# HubSight CCTV - Mobile & Desktop App API Specification (v1)

Comprehensive technical specification for mobile app developers (Flutter, React Native, iOS Swift, Android Kotlin) and desktop developers (Go, Electron, Tauri, C#/.NET) integrating with the **HubSight CCTV** platform.

---

## 1. Architecture overview and design principles

All APIs dedicated to mobile and desktop applications use the prefix:
```
/api/app/v1/*
```
All network traffic from external applications **must** pass through the **API Gateway Entrypoint** (default port `:8088` or the standard domain `https://cctv.quoctran.space`).

```mermaid
graph TD
    App[Mobile / Desktop Client] -->|X-API-Key + Bearer Token| GW[API Gateway :8088]
    GW -->|/api/app/v1/*| Core[Core Service :8080]
    Core --> Auth[Auth Service / DB]
    Core --> Pool[Pool Service gRPC]
    Core --> RMQ[RabbitMQ]
    RMQ --> Push[Push Service - FCM]
```

### 1.1. Required API key (`X-API-Key`)
Every request to `/api/app/v1/*` **must** include the Client authentication header:
- **`X-API-Key`**: Client secret (automatically configured and decrypted from the `.hscfg` container).
- *(Backward compatibility)*: `X-HubSight-App-Key`, `X-Client-ID`, or the `?api_key=...` query parameter may be used.
- Without a key, the system returns `HTTP 401 Unauthorized` (`APP_KEY_REQUIRED`).
- If the key does not exist or is disabled in `api_clients`, the system returns `HTTP 403 Forbidden` (`INVALID_APP_KEY`).

### 1.2. Admin kill switch (HTTP 503 Service Unavailable)
An administrator can activate the emergency kill switch from the Web UI (`AppConfigs.tsx` or `PUT /api/settings`):
- When disabled (`app_api_enabled = false`), every app API immediately responds with:
  - **HTTP Status**: `503 Service Unavailable`
  - **Header**: `Retry-After: 300` (the client should retry after five minutes)
  - **Friendly payload**:
    ```json
    {
      "status": "error",
      "code": "APP_API_DISABLED",
      "maintenance": true,
      "message": "Mobile and desktop app connectivity is temporarily paused for system maintenance. Contact an administrator or use the web interface.",
      "message_en": "HubSight mobile & desktop app access is temporarily disabled by administrator. Please access via the web portal."
    }
    ```

---

## 2. Endpoint summary

| Feature group | Method & route | Bearer token required | Summary |
| :--- | :--- | :---: | :--- |
| **System** | `GET /api/app/v1/system/status` | No | Check readiness, v1 version, and feature flags |
| **Authentication** | `POST /api/app/v1/auth/login` | No | Username/password login with session or 2FA challenge |
| | `POST /api/app/v1/auth/2fa/verify` | No | Verify a six-digit TOTP or recovery code |
| | `POST /api/app/v1/auth/refresh` | No | Issue a new access token from a refresh token |
| | `POST /api/app/v1/auth/change-password`| Yes | Change a periodic or first-login password (`must_change_password`) |
| | `POST /api/app/v1/auth/logout` | Yes | Log out the current session |
| **Profile** | `GET /api/app/v1/profile` | Yes | View user information, role, and detailed permissions |
| | `PATCH /api/app/v1/profile` | Yes | Update name, timezone, language (vi/en), theme, and push preferences |
| | `GET /api/app/v1/profile/sessions` | Yes | List all login sessions from other devices |
| | `DELETE /api/app/v1/profile/sessions/:id`| Yes | Remotely log out/revoke a login session |
| **Live cameras**| `GET /api/app/v1/cameras` | Yes | List cameras with status, `thumbnail_url`, and `stream_name` |
| | `GET /api/app/v1/cameras/:id` | Yes | Camera configuration, `thumbnail_url`, and parameters |
| | `GET /api/app/v1/cameras/:id/thumbnail`| Yes | **[App visual]** Get a live frame (640p 15FPS JPEG) as a thumbnail |
| | `POST /api/app/v1/cameras/:id/live/webrtc` | Yes | Exchange WebRTC SDP offer/answer for live viewing |
| | `POST /api/app/v1/cameras/:id/live/heartbeat`| Yes | Keep the live-stream session alive (30-second interval) |
| | `POST /api/app/v1/cameras/:id/live/release` | Yes | Close the live-stream session and release go2rtc resources |
| **Multi-view** | `POST /api/app/v1/cameras/live/batch-webrtc` | Yes | **[App-specific]** Negotiate SDP for multiple cameras in parallel |
| | `POST /api/app/v1/cameras/live/batch-heartbeat`| Yes | **[Battery/network optimized]** Send one heartbeat for all viewed cameras |
| | `POST /api/app/v1/cameras/live/batch-release` | Yes | Release all streams when leaving the multi-view screen |
| **Archive** | `GET /api/app/v1/cameras/:id/archive/calendar` | Yes | List days with archived video (`YYYY-MM-DD`) |
| | `GET /api/app/v1/cameras/:id/archive/timeline` | Yes | List video segments with AI event flags |
| | `GET /api/app/v1/archive/:recording_id/play` | Yes | Get an MP4 playback URL (HTTP Range and 302 Redirect supported) |
| | `GET /api/app/v1/archive/:recording_id/thumbnail`| Yes | Get the video-segment thumbnail |
| **Notifications** | `POST /api/app/v1/notifications/push-token` | Yes | Register an FCM device token for Firebase push notifications |
| | `DELETE /api/app/v1/notifications/push-token`| Yes | Unregister the FCM device token on account logout |
| | `GET /api/app/v1/notifications/unread-count` | Yes | Get a lightweight unread count for the app badge |
| | `GET /api/app/v1/notifications` | Yes | Get paginated, category-filtered notifications |
| | `PATCH /api/app/v1/notifications/:id/read` | Yes | Mark one notification as read |
| | `POST /api/app/v1/notifications/read-all` | Yes | Mark all notifications as read |
| | `DELETE /api/app/v1/notifications/batch?ids=:id1,:id2` | Yes | Delete multiple notifications in one request |
| | `DELETE /api/app/v1/notifications/:id` | Yes | Delete one notification |

---

## 3. API details and data contracts

### 3.1. System status and readiness
#### `GET /api/app/v1/system/status`
Headers:
```http
X-API-Key: hs_mob_client_default
```
Response `200 OK`:
```json
{
  "status": "ok",
  "app_api_version": "v1",
  "app_api_enabled": true,
  "features": {
    "live_streaming": true,
    "multi_view_batch": true,
    "archive_playback": true,
    "fcm_push": true,
    "two_factor_auth": true
  },
  "server_time": "2026-09-09T04:14:47.919Z"
}
```

---

### 3.2. Login authentication and 2FA
#### `POST /api/app/v1/auth/login`
Headers: `X-API-Key`
Request Body:
```json
{
  "username": "admin",
  "password": "SecurePassword123!",
  "device_name": "iPhone 15 Pro",
  "platform": "mobile_ios",
  "device_id": "device_uuid_abcd_1234",
  "device_info": {
    "client_type": "mobile_ios",
    "platform": "iOS",
    "os_version": "17.5.1",
    "model": "iPhone 15 Pro",
    "app_version": "1.2.0",
    "latitude": 10.7769,
    "longitude": 106.7009,
    "accuracy": 25
  }
}
```

`device_info.latitude`, `device_info.longitude`, and `device_info.accuracy` are optional. The mobile app sends these fields only after the user grants Location permission; login must not be blocked if the user denies permission. Without GPS coordinates, the backend automatically uses the request IP to store an approximate location (with lower accuracy).

Response case 1: Direct successful login (`200 OK`):
```json
{
  "status": "ok",
  "token": "hs_tok_eyJhbGciOi...",
  "refresh_token": "hs_ref_a91b2c...",
  "must_change_password": false,
  "user": {
    "id": "usr_9918231",
    "username": "admin",
    "full_name": "Administrator",
    "role": "admin",
    "locale": "vi",
    "timezone": "Asia/Ho_Chi_Minh",
    "permissions": ["*"]
  }
}
```

Response case 2: Two-factor authentication required (`200 OK` with `requires_2fa: true`):
```json
{
  "status": "ok",
  "requires_2fa": true,
  "pre_auth_token": "pre_auth_tok_81726354"
}
```

#### `POST /api/app/v1/auth/2fa/verify`
Headers: `X-API-Key`
Request Body:
```json
{
  "pre_auth_token": "pre_auth_tok_81726354",
  "code": "582910",
  "recovery_code": "",
  "device_info": {
    "client_type": "mobile_ios",
    "latitude": 10.7769,
    "longitude": 106.7009,
    "accuracy": 25
  }
}
```

---

### 3.3. Camera list and thumbnails

#### `GET /api/app/v1/cameras`
Headers: `X-API-Key: hs_mob_client_default`, `Authorization: Bearer <token>`

Response `200 OK`:
```json
{
  "status": "ok",
  "cameras": [
    {
      "id": "cam_front_door",
      "name": "Front Door",
      "host": "rtsp://192.168.1.100:554/live",
      "is_active": true,
      "is_stopped": false,
      "enable_ai": true,
      "thumbnail_url": "/api/app/v1/cameras/cam_front_door/thumbnail",
      "stream_name": "cam_cam_front_door_thumb",
      "onvif_enabled": true,
      "onvif_ptz_supported": true
    },
    {
      "id": "cam_garage",
      "name": "Gara xe",
      "host": "rtsp://192.168.1.101:554/live",
      "is_active": true,
      "is_stopped": false,
      "enable_ai": false,
      "thumbnail_url": "/api/app/v1/cameras/cam_garage/thumbnail",
      "stream_name": "cam_cam_garage_thumb",
      "onvif_enabled": false,
      "onvif_ptz_supported": false
    }
  ]
}
```

#### `GET /api/app/v1/cameras/:id/thumbnail` (or `/snapshot`)
Get the latest JPEG frame extracted directly from the camera's persistent **640p 15FPS** stream in the media router.

- **Headers**:
  ```http
  X-API-Key: hs_mob_client_default
  Authorization: Bearer <token>
  ```
- **Query-string support (for app image widgets)**:
  If an app image widget (Flutter/React Native) cannot attach custom headers, the application may pass them directly:
  ```http
  GET /api/app/v1/cameras/:id/thumbnail?api_key=hs_mob_client_default&token=<user_token>
  ```
- **Response**: `200 OK`
  - `Content-Type: image/jpeg`
  - `Cache-Control: no-cache, no-store, must-revalidate`
  - Binary JPEG image data (640p standard).
  - If the camera is stopped (`is_stopped=true`), return `503 Service Unavailable`.

##### Mobile app integration example:
**Flutter:**
```dart
Image.network(
  '${gatewayUrl}${camera.thumbnailUrl}?api_key=${apiKey}&token=${userToken}',
  fit: BoxFit.cover,
  errorBuilder: (context, error, stackTrace) => PlaceholderCameraCard(),
)
```

**React Native:**
```tsx
<Image
  source={{
    uri: `${gatewayUrl}${camera.thumbnail_url}?api_key=${apiKey}&token=${userToken}`,
    headers: { 'Cache-Control': 'no-cache' },
  }}
  style={styles.cameraThumbnail}
/>
```

---

### 3.4. Live Streaming & Multi-View Song song

#### `POST /api/app/v1/cameras/:id/live/webrtc` (single stream)
Headers: `X-API-Key`, `Authorization: Bearer <token>`, `Content-Type: text/plain` (or JSON)
Request Body:
```
v=0
o=- 0 0 IN IP4 127.0.0.1
s=HubSight WebRTC Session
...
```
`200 OK` response: Return an `SDP Answer` string ready for `setRemoteDescription` on the WebRTC PeerConnection.

#### `POST /api/app/v1/cameras/live/batch-webrtc` (Multi-View Song song)
Optimized for mobile apps displaying a 4/9/16-camera grid. The client sends camera IDs and corresponding SDP offers; the server negotiates them in parallel over gRPC and returns all results in one network round trip:
Request Body:
```json
{
  "requests": [
    { "camera_id": "cam_front_door", "sdp_offer": "v=0\r\no=..." },
    { "camera_id": "cam_backyard", "sdp_offer": "v=0\r\no=..." }
  ]
}
```
Response `200 OK`:
```json
{
  "results": [
    {
      "camera_id": "cam_front_door",
      "success": true,
      "sdp_answer": "v=0\r\no=...",
      "stream_name": "cam_front_door_client_0",
      "conn_index": 2
    },
    {
      "camera_id": "cam_backyard",
      "success": true,
      "sdp_answer": "v=0\r\no=...",
      "stream_name": "cam_backyard_client_0",
      "conn_index": 2
    }
  ]
}
```

#### `POST /api/app/v1/cameras/live/batch-heartbeat`
Keep the sessions alive for cameras currently displayed:
```json
{
  "camera_ids": ["cam_front_door", "cam_backyard"]
}
```
Response: `{"status": "ok"}`

---

### 3.5. PTZ control and preset management (ONVIF Profile S)

For cameras with `onvif_ptz_supported: true` (or `onvif_enabled: true`).

#### `POST /api/app/v1/cameras/:id/ptz`
Send pan, zoom, or stop commands to the camera through ONVIF Profile S.

- **Headers**:
  ```http
  X-API-Key: hs_mob_client_default
  Authorization: Bearer <token>
  Content-Type: application/json
  ```
- **Request Body**:
  ```json
  {
    "action": "continuous",
    "pan": 0.5,
    "tilt": 0.0,
    "zoom": 0.0,
    "timeout": 5
  }
  ```
  - `action`:
    - `"continuous"` or `"move"`: Continuously pan/tilt/zoom according to the velocity vector (`pan`, `tilt`, `zoom` from `-1.0` to `+1.0`). The camera continues until `stop` is sent or `timeout` expires.
    - `"stop"`: Immediately stop all pan/tilt and zoom movement.
    - `"relative"`: Move by one relative step.
    - `"zoom_in"`: Zoom in (`zoom: 0.5`).
    - `"zoom_out"`: Zoom out (`zoom: -0.5`).
- **Response `200 OK`**:
  ```json
  {
    "status": "ok"
  }
  ```

#### `GET /api/app/v1/cameras/:id/presets`
Get the preset positions stored on the camera hardware.

- **Headers**: `X-API-Key: hs_mob_client_default`, `Authorization: Bearer <token>`
- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "presets": [
      { "token": "1", "name": "Front Door" },
      { "token": "2", "name": "Parking Lot" }
    ]
  }
  ```

#### `POST /api/app/v1/cameras/:id/presets`
Perform an operation on a preset position.

- **Request Body**:
  - Go to a preset:
    ```json
    { "action": "goto", "preset_token": "1" }
    ```
  - Save the current position as a new preset:
    ```json
    { "action": "save", "preset_name": "Back Yard" }
    ```
  - Delete a preset:
    ```json
    { "action": "delete", "preset_token": "1" }
    ```
- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "preset_token": "1",
    "name": "Back Yard"
  }
  ```

#### `POST /api/app/v1/onvif/probe`
Automatically discover ONVIF Profile S device parameters for the mobile app setup/add-device screen.

- **Request Body**:
  ```json
  {
    "host": "192.168.1.100",
    "port": 80,
    "username": "admin",
    "password": "password123"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "success": true,
    "device_info": {
      "manufacturer": "Dahua",
      "model": "DH-IPC-HFW",
      "firmware_version": "2.800.0000000.10.R",
      "serial_number": "7E043B7PANXXXXX"
    },
    "has_ptz": true,
    "profiles": [
      {
        "token": "Profile_1",
        "name": "MainStream",
        "video_codec": "H264",
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "stream_uri": "rtsp://admin:password123@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0"
      }
    ],
    "main_stream_uri": "rtsp://admin:password123@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0",
    "main_profile_token": "Profile_1"
  }
  ```

---

### 3.6. Archived video and NVR playback

#### `GET /api/app/v1/cameras/:id/archive/calendar?month=2026-09`
Response `200 OK`:
```json
{
  "days": ["2026-09-01", "2026-09-02", "2026-09-07", "2026-09-08", "2026-09-09"]
}
```

#### `GET /api/app/v1/cameras/:id/archive/timeline?date=2026-09-09`
Response `200 OK`:
```json
{
  "camera_id": "cam_front_door",
  "date": "2026-09-09",
  "segments": [
    {
      "id": "rec_01J8G92",
      "start_at": "2026-09-09T08:00:00Z",
      "end_at": "2026-09-09T08:05:00Z",
      "duration_seconds": 300,
      "size_bytes": 15428900,
      "has_event": true,
      "event_type": "person"
    }
  ]
}
```

#### `GET /api/app/v1/archive/:recording_id/play`
Response `200 OK`:
```json
{
  "recording_id": "rec_01J8G92",
  "play_url": "https://dl.learncurv.space/bucket-faces-cctv/recordings/cam_front_door/2026-09-09/08-00-00.mp4?X-Amz-Expires=7200...",
  "expires_in_seconds": 7200
}
```
*(If the client includes `Accept: video/mp4` or `?redirect=true`, the server automatically returns `302 Found` redirecting directly to the video URL.)*

---

### 3.5. Push notification registration and management (FCM Push)

#### `POST /api/app/v1/notifications/push-token`
Request Body:
```json
{
  "token": "eXamPle_fcm_token_device_abcdef123456",
  "platform": "mobile_android",
  "device_name": "Galaxy S24 Ultra"
}
```
Response `200 OK`:
```json
{
  "status": "ok",
  "message": "FCM device token registered successfully."
}
```

#### `GET /api/app/v1/notifications/unread-count`
Lightweight response for displaying a badge count on the app icon:
```json
{
  "unread_count": 4
}
```

#### `DELETE /api/app/v1/notifications/batch?ids=:id1,:id2`

The `ids` query parameter is a comma-separated list of notification IDs. Empty and duplicate IDs are ignored.

Response `200 OK`:
```json
{
  "status": "ok",
  "deleted": 2
}
```

If the request has no valid IDs, return `400 INVALID_INPUT`; if no notifications are found, return `404 NOTIFICATION_NOT_FOUND`.

---

## 4. Integration example (Flutter/Dart)

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class HubSightApiClient {
  final String baseUrl; // e.g. 'https://cctv.quoctran.space'
  final String apiKey;  // e.g. 'hs_mob_client_default'
  String? bearerToken;

  HubSightApiClient({required this.baseUrl, required this.apiKey});

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    if (bearerToken != null) 'Authorization': 'Bearer $bearerToken',
  };

  // 1. Check system status and the kill switch
  Future<bool> checkSystemReadiness() async {
    final res = await http.get(
      Uri.parse('$baseUrl/api/app/v1/system/status'),
      headers: _headers,
    );

    if (res.statusCode == 503) {
      final body = jsonDecode(res.body);
      throw Exception(body['message'] ?? 'System is under maintenance');
    }
    return res.statusCode == 200;
  }

  // 2. Log in
  Future<Map<String, dynamic>> login(String username, String password) async {
    final res = await http.post(
      Uri.parse('$baseUrl/api/app/v1/auth/login'),
      headers: _headers,
      body: jsonEncode({
        'username': username,
        'password': password,
        'device_name': 'Mobile Client',
        'platform': 'flutter',
      }),
    );

    final data = jsonDecode(res.body);
    if (res.statusCode == 200 && data['token'] != null) {
      bearerToken = data['token'];
    }
    return data;
  }

  // 3. Register the FCM token when the app starts
  Future<void> registerFcmToken(String fcmToken) async {
    await http.post(
      Uri.parse('$baseUrl/api/app/v1/notifications/push-token'),
      headers: _headers,
      body: jsonEncode({
        'token': fcmToken,
        'platform': 'mobile_flutter',
      }),
    );
  }
}
```
