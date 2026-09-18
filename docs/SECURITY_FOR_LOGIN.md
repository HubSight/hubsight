# Agent Guide: Session Logging, Device Fingerprinting & Session Management for the HubSight CCTV Platform

## 1. System context (read before starting)

- HubSight is a centralized CCTV system: viewer apps (Flutter mobile/desktop, React Web) **do not connect directly to cameras**; they connect to the central backend.
- The backend provides video streams to clients through **WebRTC** (low latency), coordinated by the Realtime SDK (WebRTC + Socket.io).
- Auth and business APIs (including sessions and playback segment feeds) belong to the **Core SDK**; clients do not manage the auth lifecycle or build their own HTTP client.
- **Specific requirement for this phase**: trace **login activity** only (not camera viewing activity). Account owners can review their own login history (device, time, location) and **revoke** any suspicious login; revocation must take effect **in realtime** (the revoked device is removed immediately instead of waiting for natural token expiry).

## 2. Work scope

Implement three feature groups that are independent but related:

1. **Session Logging** — record the login-session lifecycle so account owners can review history
2. **Device Fingerprinting** — identify viewer devices and detect unfamiliar devices
3. **Session Management** — manage the token lifecycle and revoke in realtime

**Non-goals for this guide**:
- Primary authentication (login flow, MFA/passkey), WebRTC stream encryption, and camera/camera-group viewing permissions (ACL) belong to other modules.
- **Camera access logs (who viewed which camera and when) are not required at this stage.** This guide tracks login sessions only, not which stream/archive was viewed. It can be added later if compliance/audit requirements arise; the session design in section 3 leaves room for this extension (`session_id` is a natural foreign key if an access-log table is added later).

## 3. Data Model

### 3.1. `login_session` table (login-session lifecycle)

```
login_session
├── id                  UUID, PK
├── user_id             FK → users
├── ip_address          inet
├── user_agent          text (raw)
├── device_fingerprint  text (hash, see section 4)
├── device_label        text (e.g. "Windows Desktop App", "iPhone 15 - Flutter")
├── client_type         enum: web | desktop_windows | desktop_mac | mobile_ios | mobile_android
├── geo_city / geo_country
├── created_at
├── last_active_at
├── expires_at
├── revoked_at          nullable
├── revoke_reason       enum: user_logout | admin_revoke | anomaly_detected | expired | concurrent_limit
```

### 3.2. Immutability principles

- `login_session` has no ordinary DELETE; only `revoked_at` is set (soft state), while the original record remains so the account owner can review the complete history.
- Consider a DB constraint or trigger that blocks direct UPDATE/DELETE of recorded columns (created_at, ip_address, user_id, etc.) and allows updates only to state columns (revoked_at, last_active_at).

## 4. Device Fingerprinting

### 4.1. Strategy by client type

| Client | Fingerprint source |
|---|---|
| Web (React) | Passive: UA, Accept-Language, and TLS/JA3 when available at the edge. Consider FingerprintJS if higher accuracy is needed. |
| Flutter Desktop (Windows/Mac) | Stable OS device ID (Windows: MachineGuid from the registry; macOS: IOPlatformUUID) plus a locally stored app instance ID — **much more stable** than a browser fingerprint; prefer this over building a canvas-style fingerprint. |
| Flutter Mobile | `device_info_plus` package: obtain identifierForVendor (iOS) / Android ID and combine it with an app install ID in local storage. |

**Important design decision**: because two of the three clients are native apps (Flutter desktop + mobile), not browsers, the agent **does not need** complex active browser fingerprinting (canvas/WebGL). Obtain a stable device identifier from the OS/SDK and hash it before sending it to the server. This is simpler and more reliable.

### 4.2. Where it is performed

- The **Core SDK** computes the device fingerprint and attaches it to login/refresh requests; client apps (Flutter/React) do not do this, following the SDK encapsulation principle.
- The server stores the fingerprint hash and does not retain more sensitive raw device information than necessary.

### 4.3. Unfamiliar-device detection logic

```
When the Core SDK successfully calls the login API:
1. The server receives `device_fingerprint` from the request.
2. It compares it with fingerprints recorded for this `user_id` (the separate `known_devices` table).
3. If it does **not** match:
   → Create `login_session` with `is_new_device = true`.
   → Trigger an email/push notification: "Login from a new device".
   → For the admin/security-officer role, consider requiring step-up auth before granting camera-view permission.
4. If it matches, issue a normal session and update `known_devices.last_seen_at`.
```

### 4.4. Client Device Metadata Contract

For detailed, clear login history (`login_session` & `known_devices`) and accurate audit trails, the Web SPA and Mobile/Desktop Apps (Flutter, React Native, Go) **must provide complete device information** when calling authentication APIs (`POST /api/auth/login`, `POST /api/auth/2fa/verify`, `POST /api/auth/passkeys/login/verify`).

#### 4.4.1. `device_info` structure (JSON body payload)

```json
{
  "username": "admin",
  "password": "...",
  "device_info": {
    "fingerprint": "a3f89b91c49b6d41829e18b1...",
    "device_label": "Apple iPhone 15 Pro (iOS 17.5.1) • App v1.2.0",
    "client_type": "mobile_ios",
    "platform": "iOS",
    "os_version": "17.5.1",
    "model": "iPhone 15 Pro",
    "manufacturer": "Apple",
    "app_version": "1.2.0",
    "screen_resolution": "1179x2556",
    "language": "vi-VN",
    "timezone": "Asia/Ho_Chi_Minh"
  }
}
```

| Field | Type | Description | Example |
|---|---|---|---|
| `fingerprint` | string | Stable, unique device-identity hash | SHA-256 hash |
| `device_label` | string | User-friendly device name | `Apple iPhone 15 Pro (iOS 17.5.1) • App v1.2.0` |
| `client_type` | enum | Client category (`web`, `mobile_ios`, `mobile_android`, `desktop_windows`, `desktop_mac`, `desktop_linux`, `desktop_app`, `third_party`) | `mobile_ios` |
| `platform` | string | Operating-system name | `iOS`, `Android`, `Windows`, `macOS`, `Linux` |
| `os_version` | string | Operating-system version | `17.5.1`, `14.0`, `11` |
| `browser_name` | string | (Web only) Browser name | `Chrome`, `Firefox`, `Safari`, `Edge` |
| `browser_version`| string | (Web only) Browser version | `128.0` |
| `app_version` | string | (Mobile/Desktop) Application version | `1.2.0` |
| `model` | string | Hardware model name | `iPhone 15 Pro`, `SM-S928B`, `ThinkPad X1` |
| `manufacturer` | string | Device manufacturer | `Apple`, `Samsung`, `Lenovo`, `Dell` |
| `screen_resolution` | string | Screen resolution | `1179x2556`, `1920x1080` |
| `language` | string | System/client language | `vi-VN`, `en-US` |
| `timezone` | string | IANA system timezone | `Asia/Ho_Chi_Minh` |
| `latitude` | number | GPS/native location latitude, sent only after user permission | `10.7769` |
| `longitude` | number | GPS/native location longitude, sent only after user permission | `106.7009` |
| `accuracy` | number | GPS accuracy in meters | `25` |

If the client does not send coordinates or the user denies Location permission, the backend automatically queries IP-based geolocation to store an approximate location. This is a best-effort fallback and must not be used to block login.

#### 4.4.2. Supported HTTP headers (dual headers)

In addition to the `device_info` JSON payload, clients may attach standard HTTP headers so the backend and API Gateway can identify the device even when the request has no JSON body:
- `X-Device-Fingerprint`: Device-identity hash
- `X-Device-Label`: User-friendly device name
- `X-Client-Type`: Client type (`mobile_ios`, `mobile_android`, `desktop_windows`, `web`, etc.)
- `X-Screen-Resolution`: Screen resolution

#### 4.4.3. Flutter Mobile/Desktop App integration example

Use the `device_info_plus` and `package_info_plus` packages:

```dart
import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:crypto/crypto.dart';
import 'dart:convert';

Future<Map<String, dynamic>> collectDeviceInfo() async {
  final deviceInfoPlugin = DeviceInfoPlugin();
  final packageInfo = await PackageInfo.fromPlatform();
  
  String fingerprint = '';
  String model = '';
  String manufacturer = '';
  String osVersion = '';
  String platform = '';
  String clientType = 'mobile_ios';

  if (Platform.isIOS) {
    final ios = await deviceInfoPlugin.iosInfo;
    platform = 'iOS';
    clientType = 'mobile_ios';
    model = ios.utsname.machine; // e.g. iPhone15,2
    manufacturer = 'Apple';
    osVersion = ios.systemVersion;
    fingerprint = sha256.convert(utf8.encode(ios.identifierForVendor ?? 'ios_device')).toString();
  } else if (Platform.isAndroid) {
    final android = await deviceInfoPlugin.androidInfo;
    platform = 'Android';
    clientType = 'mobile_android';
    model = android.model;
    manufacturer = android.manufacturer;
    osVersion = android.version.release;
    fingerprint = sha256.convert(utf8.encode('${android.id}_${android.hardware}')).toString();
  } else if (Platform.isWindows) {
    final win = await deviceInfoPlugin.windowsInfo;
    platform = 'Windows';
    clientType = 'desktop_windows';
    model = win.computerName;
    manufacturer = 'PC';
    fingerprint = sha256.convert(utf8.encode(win.deviceId)).toString();
  }

  final deviceLabel = '$manufacturer $model ($platform $osVersion) • App v${packageInfo.version}';

  return {
    'fingerprint': fingerprint,
    'device_label': deviceLabel,
    'client_type': clientType,
    'platform': platform,
    'os_version': osVersion,
    'model': model,
    'manufacturer': manufacturer,
    'app_version': packageInfo.version,
    'language': Platform.localeName,
  };
}
```


## 5. Session management

### 5.1. Tokens

- Short-lived access token (JWT): 10-15 minutes; this is a sensitive system, so access tokens should not live longer.
- Refresh token: opaque, stored in the database (not a JWT), and immediately revocable. This is required for a CCTV system because an intrusion must be locked out immediately; a pure JWT cannot provide that.
- Refresh-token rotation: issue a new token on every refresh and invalidate the old token immediately. If an old refresh token is reused, revoke the user's entire session chain and raise an alert.

### 5.2. Concurrent-session limits — **different from ordinary apps**

Important for the agent: **do not apply a rigid concurrent-session limit like consumer apps**. A legitimate security guard may watch on the control-room desktop and on a phone while patrolling; this is a valid use case, not fraud.

Instead:
- Configure limits by **role** (for example, the `viewer` role allows at most 2 concurrent sessions, while `security_admin` has no limit).
- Prefer **alerts** over **hard blocking** when an unusual threshold is exceeded (for example, 5+ sessions from 5 different geographic locations within 10 minutes is a credential-sharing signal that should alert an admin).

### 5.3. Realtime revocation (required)

This is the most important requirement: when an account owner clicks "Revoke" for a session in the login-history list, that session must become invalid **immediately**, without waiting for access-token expiry (10-15 minutes is too slow for this security purpose).

Combine two mechanisms:

1. **Check at the API gateway/middleware on every request**: every request with an access token must also query the `session_id` status in Redis (cache `session:{id} → revoked | active`), rather than trusting only an unexpired JWT signature. This blocks subsequent HTTP requests immediately after revocation.
2. **Push a signal through the existing Realtime channel (Socket.io)**: HubSight already has a Realtime SDK for WebRTC/Socket.io, so reuse it. When an admin/account owner revokes a session, the server emits `session:revoked` to the device's exact open `session_id`/`socket connection`. When a Flutter/Web client receives it, it automatically disconnects the active WebRTC stream, deletes the local token, and navigates to the login screen. This also handles a device watching a live stream: it blocks the running stream, not only the next API request.

Do not rely on only one mechanism: with (1) alone, a device watching WebRTC continues until the app makes another API request; with (2) alone, a temporarily disconnected socket misses the revocation command.

### 5.4. Idle and absolute timeouts

- Idle timeout for live view: shorter than normal (for example, require re-authentication after 20 minutes without viewer-UI interaction) because this is access to security cameras and a session should not remain suspended indefinitely.
- Absolute timeout: configured according to the customer organization's policy (some organizations require re-authentication every shift).

## 6. Anomaly detection (minimum recommended now)

Implement these rules first; defer more complex ML/scoring to a later phase:

1. **Impossible travel**: two consecutive logins are geographically separated beyond what could be traveled in the elapsed time.
2. **Unusual off-hours login**: if an account has a fixed activity-hour pattern (for example, a shift), a login far outside that window is flagged so the account owner/admin can identify it in history.
3. **High consecutive failed-login count** from the same IP or account → rate limit + alert (a brute-force/credential-stuffing signal), independent of camera activity because it relies only on `login_session`.

## 7. Acceptance criteria for the completed implementation

- [ ] Every login creates a `login_session` record with IP, UA, fingerprint, and geolocation.
- [ ] The account owner can use an API/UI to view their own login history (device, time, location, and active/revoked state).
- [ ] The account owner can revoke individual sessions; an admin can revoke another user's session.
- [ ] Revocation takes effect **in realtime**: the next API request is immediately blocked (checked through Redis) AND the device with an open socket is immediately removed through `session:revoked`.
- [ ] Refresh-token rotation works; reuse revokes the entire chain.
- [ ] A fingerprint mismatch triggers a notification and is not hard-blocked unless step-up auth is configured.
- [ ] Concurrent-session limits are role-configurable, not hardcoded.
- [ ] Application code cannot directly UPDATE/DELETE historical columns in `login_session`.
