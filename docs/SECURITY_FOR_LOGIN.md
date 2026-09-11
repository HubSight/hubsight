# Hướng dẫn Agent: Session Logging, Device Fingerprinting & Session Management cho HubSight CCTV Platform

## 1. Bối cảnh hệ thống (đọc trước khi bắt đầu)

- HubSight là hệ thống CCTV tập trung: các viewer app (Flutter mobile/desktop, Web React) **không kết nối trực tiếp tới camera**, mà kết nối tới backend trung tâm.
- Backend cấp video stream cho client qua **WebRTC** (low-latency), điều phối bởi Realtime SDK (WebRTC + Socket.io).
- Auth và các business API (bao gồm session, playback segment feed...) thuộc phạm vi **Core SDK** — client không tự quản lý auth lifecycle hay tự dựng HTTP client.
- **Yêu cầu cụ thể cho giai đoạn này**: chỉ cần trace lại **lượt đăng nhập** (không phải lượt xem camera). Chủ tài khoản có quyền xem lại lịch sử đăng nhập của chính mình (thiết bị, thời gian, vị trí) và **revoke** một lượt đăng nhập bất kỳ nếu nghi ngờ — việc revoke phải có hiệu lực **theo thời gian thực** (thiết bị bị revoke bị đá ra ngay, không phải đợi token hết hạn tự nhiên).

## 2. Phạm vi công việc (Scope)

Agent triển khai 3 nhóm tính năng, độc lập nhưng liên kết với nhau:

1. **Session Logging** — ghi nhận vòng đời session đăng nhập, chủ tài khoản xem lại được lịch sử
2. **Device Fingerprinting** — nhận diện thiết bị viewer, phát hiện thiết bị lạ
3. **Session Management** — quản lý vòng đời token, thu hồi theo thời gian thực

**Ngoài phạm vi (Non-goals) của guide này**:
- Xác thực chính (login flow, MFA/passkey), mã hoá luồng WebRTC, quản lý quyền xem theo camera/nhóm camera (ACL) — thuộc module khác.
- **Camera access log (ai xem camera nào, lúc nào) — chưa cần ở giai đoạn này.** Guide này chỉ theo dõi ở mức phiên đăng nhập (login session), không xuống tới mức "đã xem stream/archive nào". Có thể bổ sung sau nếu yêu cầu compliance/audit trail phát sinh — thiết kế session ở mục 3 vẫn để mở khả năng mở rộng này (session_id là khoá ngoại tự nhiên nếu sau này thêm bảng access log).

## 3. Data Model

### 3.1. Bảng `login_session` (vòng đời phiên đăng nhập)

```
login_session
├── id                  UUID, PK
├── user_id             FK → users
├── ip_address          inet
├── user_agent          text (raw)
├── device_fingerprint  text (hash, xem mục 4)
├── device_label        text (vd "Windows Desktop App", "iPhone 15 - Flutter")
├── client_type         enum: web | desktop_windows | desktop_mac | mobile_ios | mobile_android
├── geo_city / geo_country
├── created_at
├── last_active_at
├── expires_at
├── revoked_at          nullable
├── revoke_reason       enum: user_logout | admin_revoke | anomaly_detected | expired | concurrent_limit
```

### 3.2. Nguyên tắc immutability

- `login_session` không có DELETE thông thường — chỉ có `revoked_at` set giá trị (soft state), record gốc giữ nguyên để chủ tài khoản xem lại lịch sử đầy đủ.
- Agent cân nhắc dùng DB constraint hoặc trigger chặn UPDATE/DELETE trực tiếp lên các cột đã ghi (created_at, ip_address, user_id...), chỉ cho phép update các cột trạng thái (revoked_at, last_active_at).

## 4. Device Fingerprinting

### 4.1. Chiến lược cho từng loại client

| Client | Fingerprint nguồn |
|---|---|
| Web (React) | Passive: UA, Accept-Language + TLS/JA3 nếu có ở edge. Cân nhắc FingerprintJS nếu cần độ chính xác cao hơn. |
| Flutter Desktop (Windows/Mac) | Device ID ổn định của OS (Windows: MachineGuid từ registry; macOS: IOPlatformUUID) + app instance ID lưu local — **ổn định hơn nhiều** so với browser fingerprint, ưu tiên dùng cái này thay vì tự dựng canvas-style fingerprint. |
| Flutter Mobile | `device_info_plus` package: lấy identifierForVendor (iOS) / Android ID — kết hợp app install ID lưu local storage. |

**Quyết định thiết kế quan trọng**: vì 2/3 client là native app (Flutter desktop + mobile) chứ không phải browser, agent **không cần** làm active browser fingerprinting (canvas/WebGL) phức tạp như web thông thường — chỉ cần lấy device identifier ổn định do OS/SDK cung cấp và hash lại trước khi gửi lên server. Việc này vừa đơn giản hơn, vừa đáng tin cậy hơn.

### 4.2. Nơi thực hiện

- Device fingerprint được **Core SDK** tính toán và đính kèm vào request login/refresh — client app (Flutter/React) không tự làm việc này, đúng nguyên tắc encapsulation đã thống nhất cho SDK.
- Server lưu fingerprint hash, không lưu raw device info nhạy cảm hơn mức cần thiết.

### 4.3. Logic phát hiện thiết bị lạ

```
Khi Core SDK gọi API login thành công:
1. Server nhận device_fingerprint từ request
2. So khớp với các fingerprint đã ghi nhận cho user_id này (bảng riêng `known_devices`)
3. Nếu KHÔNG khớp:
   → Tạo login_session với flag is_new_device = true
   → Trigger notification (email/push) "Có đăng nhập từ thiết bị mới"
   → Với role admin/security-officer: cân nhắc bắt buộc xác thực lại (step-up auth) trước khi cấp quyền xem camera
4. Nếu khớp → cấp session bình thường, update known_devices.last_seen_at
```

### 4.4. Đặc tả Gửi Thông tin Thiết bị Đăng nhập (Client Device Metadata Contract)

Để lịch sử phiên đăng nhập (`login_session` & `known_devices`) hiển thị chi tiết, rõ ràng và phục vụ audit trail chính xác, cả Web SPA và Mobile/Desktop App (Flutter, React Native, Go) **phải cung cấp đầy đủ thông tin thiết bị** khi gọi các API xác thực (`POST /api/auth/login`, `POST /api/auth/2fa/verify`, `POST /api/auth/passkeys/login/verify`).

#### 4.4.1. Cấu trúc `device_info` (JSON Body Payload)

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

| Trường | Kiểu | Mô tả | Ví dụ |
|---|---|---|---|
| `fingerprint` | string | Chuỗi hash định danh thiết bị duy nhất, ổn định | SHA-256 hash |
| `device_label` | string | Tên thiết bị thân thiện hiển thị cho người dùng | `Apple iPhone 15 Pro (iOS 17.5.1) • App v1.2.0` |
| `client_type` | enum | Phân loại client (`web`, `mobile_ios`, `mobile_android`, `desktop_windows`, `desktop_mac`, `desktop_linux`, `desktop_app`, `third_party`) | `mobile_ios` |
| `platform` | string | Tên hệ điều hành | `iOS`, `Android`, `Windows`, `macOS`, `Linux` |
| `os_version` | string | Phiên bản hệ điều hành | `17.5.1`, `14.0`, `11` |
| `browser_name` | string | (Dành cho Web) Tên trình duyệt | `Chrome`, `Firefox`, `Safari`, `Edge` |
| `browser_version`| string | (Dành cho Web) Phiên bản trình duyệt | `128.0` |
| `app_version` | string | (Dành cho Mobile/Desktop) Phiên bản ứng dụng | `1.2.0` |
| `model` | string | Tên model phần cứng | `iPhone 15 Pro`, `SM-S928B`, `ThinkPad X1` |
| `manufacturer` | string | Hãng sản xuất thiết bị | `Apple`, `Samsung`, `Lenovo`, `Dell` |
| `screen_resolution` | string | Độ phân giải màn hình | `1179x2556`, `1920x1080` |
| `language` | string | Ngôn ngữ hệ thống / client | `vi-VN`, `en-US` |
| `timezone` | string | Múi giờ hệ thống IANA | `Asia/Ho_Chi_Minh` |

#### 4.4.2. HTTP Headers hỗ trợ đồng thời (Dual Headers)

Bên cạnh JSON payload `device_info`, client có thể gắn các HTTP Header tiêu chuẩn để backend và API Gateway nhận diện ngay cả khi request không có JSON body:
- `X-Device-Fingerprint`: Hash định danh thiết bị
- `X-Device-Label`: Tên thiết bị thân thiện
- `X-Client-Type`: Loại client (`mobile_ios`, `mobile_android`, `desktop_windows`, `web`, v.v.)
- `X-Screen-Resolution`: Độ phân giải màn hình

#### 4.4.3. Mẫu tích hợp cho Flutter Mobile / Desktop App

Sử dụng package `device_info_plus` và `package_info_plus`:

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


## 5. Session Management

### 5.1. Token

- Access token (JWT) sống ngắn: 10-15 phút — vì đây là hệ thống nhạy cảm, không nên để access token sống lâu.
- Refresh token: opaque, lưu DB (không phải JWT), cho phép revoke tức thời — bắt buộc với hệ thống CCTV vì khi phát hiện xâm nhập cần khóa ngay, JWT thuần không làm được điều này.
- Refresh token rotation: mỗi lần refresh phát hành token mới, token cũ vô hiệu ngay. Phát hiện refresh token cũ bị dùng lại → revoke toàn bộ session chain của user + alert.

### 5.2. Giới hạn session đồng thời — **khác với app thông thường**

Lưu ý quan trọng cho agent: **không áp dụng concurrent session limit cứng nhắc như các app tiêu dùng khác**. Một nhân viên bảo vệ hợp lệ có thể vừa xem trên desktop app tại phòng điều khiển, vừa xem trên điện thoại khi đi tuần — đây là use-case hợp lệ, không phải gian lận.

Thay vào đó:
- Giới hạn theo **role**, cấu hình được (vd: role `viewer` tối đa 2 session đồng thời, role `security_admin` không giới hạn).
- Ưu tiên **cảnh báo** hơn **chặn cứng** khi vượt ngưỡng bất thường (ví dụ 5+ session cùng lúc từ 5 vị trí địa lý khác nhau trong 10 phút → đây mới là dấu hiệu chia sẻ credential, cần alert cho admin).

### 5.3. Revoke theo thời gian thực (yêu cầu bắt buộc)

Đây là phần quan trọng nhất theo yêu cầu: khi chủ tài khoản bấm "Revoke" trên 1 session trong danh sách lịch sử đăng nhập, session đó phải mất hiệu lực **ngay lập tức**, không chờ access token hết hạn (10-15 phút là quá chậm cho mục đích bảo mật này).

Hai cơ chế kết hợp:

1. **Kiểm tra tại API gateway/middleware mỗi request**: mỗi request kèm access token phải tra thêm trạng thái `session_id` trong Redis (cache `session:{id} → revoked | active`), không chỉ tin vào JWT signature còn hạn. Đây là cách chặn được các request HTTP tiếp theo ngay khi revoke.
2. **Đẩy tín hiệu qua kênh Realtime có sẵn (Socket.io)**: vì HubSight đã có Realtime SDK phục vụ WebRTC/Socket.io, tận dụng luôn kênh này — khi admin/chủ tài khoản revoke, server emit event `session:revoked` tới đúng `session_id`/`socket connection` đang mở của thiết bị đó. Client (Flutter/Web) nhận event này thì tự động: ngắt kết nối WebRTC đang xem, xoá token local, điều hướng về màn hình login. Việc này xử lý được cả trường hợp thiết bị đang xem live stream — không chỉ chặn API tiếp theo mà chặn luôn stream đang chạy.

Không nên chỉ dựa vào 1 trong 2 cơ chế: chỉ dùng (1) thì thiết bị đang xem WebRTC vẫn tiếp tục xem cho tới khi app đó tự gọi API tiếp theo; chỉ dùng (2) thì nếu thiết bị mất kết nối socket tạm thời sẽ không nhận được lệnh revoke.

### 5.4. Idle & absolute timeout

- Idle timeout cho live view: ngắn hơn bình thường (vd 20 phút không tương tác trên UI viewer → yêu cầu xác thực lại) vì đây là quyền truy cập camera an ninh, không nên để phiên "treo" vô thời hạn.
- Absolute timeout: theo policy tổ chức khách hàng cấu hình (một số nơi yêu cầu re-auth mỗi ca trực).

## 6. Anomaly Detection (mức tối thiểu nên có ngay)

Agent triển khai các rule sau trước, phần ML/scoring phức tạp hơn để giai đoạn sau:

1. **Impossible travel**: 2 login liên tiếp cách nhau về địa lý mà không thể di chuyển kịp trong khoảng thời gian đó.
2. **Đăng nhập ngoài giờ bất thường**: nếu tài khoản có pattern giờ hoạt động cố định (vd ca trực), login lệch hẳn khung giờ đó → gắn cờ để chủ tài khoản/admin dễ nhận ra khi xem lại lịch sử.
3. **Số lượt đăng nhập thất bại liên tiếp cao** từ cùng IP hoặc cùng account → rate limit + cảnh báo (dấu hiệu brute-force/credential stuffing), độc lập với phần camera vì chỉ dựa trên `login_session`.

## 7. Acceptance Criteria cho agent khi implement xong

- [ ] Mọi login đều tạo record `login_session` với đầy đủ IP, UA, fingerprint, geo
- [ ] Chủ tài khoản có API/UI xem được lịch sử đăng nhập của chính mình (thiết bị, thời gian, vị trí, trạng thái còn hiệu lực hay đã revoke)
- [ ] Chủ tài khoản revoke được từng session của chính mình; admin revoke được session của user khác
- [ ] Revoke có hiệu lực **theo thời gian thực**: request API tiếp theo bị chặn ngay (kiểm tra qua Redis) VÀ thiết bị đang mở socket bị đá ra ngay qua event `session:revoked`
- [ ] Refresh token rotation hoạt động, phát hiện reuse thì revoke toàn chain
- [ ] Fingerprint mismatch trigger được notification, không chặn cứng trừ khi cấu hình yêu cầu step-up auth
- [ ] Concurrent session limit cấu hình theo role, không hardcode
- [ ] `login_session` không thể bị UPDATE/DELETE trực tiếp các cột lịch sử qua application code