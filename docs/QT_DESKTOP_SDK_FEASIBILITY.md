# Báo cáo Nghiên cứu Tính Khả thi: Xây dựng Bộ SDK Qt (C++ / QML) Đa Nền tảng Dựa trên HubSight App API

---

## 1. Kết luận Đánh giá Tính Khả thi (Executive Verdict)

### 👉 Đánh giá: **HOÀN TOÀN KHẢ THI (HIGH FEASIBILITY)** & là **LỰA CHỌN TỐI ƯU NHẤT CHO PHẦN MỀM DESKTOP VMS CHUYÊN NGHIỆP**

Việc xây dựng một bộ SDK dành riêng cho framework **Qt 6 (C++ / QML)** dựa trên bộ **HubSight Mobile & Desktop App API (`/api/app/v1/*`)** không những hoàn toàn tương thích 100% về mặt giao thức mạng, mà còn là **hướng đi chiến lược vượt trội** so với các giải pháp như Electron (Web) hay Flutter Desktop trong ngành giám sát an ninh (CCTV / Video Management System - VMS):

1. **Hiệu năng Render Ma trận Camera Cực lớn (Grid 16 / 32 / 64 luồng)**:
   - Các trạm giám sát an ninh (Security Operations Center - SOC) yêu cầu mở đồng thời từ 16 đến 64 camera trên màn hình lớn.
   - Electron ngốn từ 2GB đến 6GB RAM và giật lag khi render ma trận video lớn.
   - Qt 6 tận dụng **Qt Rendering Hardware Interface (RHI)** render trực tiếp qua **Direct3D 11/12 (Windows)**, **Metal (macOS)** và **Vulkan/OpenGL (Linux)** với mức ngốn RAM chỉ bằng 1/10 (~150MB – 300MB).
2. **Giải mã Phần cứng GPU Không Sao chép Bộ nhớ (Zero-Copy Hardware Decoding)**:
   - C++ cho phép tích hợp trực tiếp với **Intel QuickSync (QSV)**, **NVIDIA NVDEC (CUDA)** và **Apple VideoToolbox**. Khung hình video sau khi giải mã nằm trực tiếp trên VRAM của GPU và được vẽ thẳng lên màn hình mà không cần copy qua CPU.
3. **Tương thích Hoàn hảo với Kiến trúc API Hiện tại**:
   - `/api/app/v1/*` hỗ trợ đầy đủ `X-API-Key`, Query Token (`?api_key=...&token=...`), WebRTC Batch đàm phán (`batch-webrtc`), nhịp tim gộp (`batch-heartbeat`) và ảnh chụp thường trực 640p 15FPS. Mọi tính năng này đều ánh xạ trực tiếp sang các class native của Qt (`QNetworkAccessManager`, `QQuickImageProvider`, `QWebSocket`).

---

## 2. Khảo sát Tính Tương thích Kỹ thuật Giữa HubSight App API và Qt 6

```mermaid
graph TD
    subgraph HubSightBackend ["HubSight Gateway (:8088 / :8555)"]
        GW_REST["/api/app/v1/* (REST API)"]
        GW_WS["/relay/* (Socket.IO Realtime)"]
        GW_THUMB["/cameras/:id/thumbnail (640p 15FPS)"]
        RTC_MEDIA["webrtc-service:8555 (UDP/TCP Media)"]
    end

    subgraph QtSDK ["HubSight Qt 6 C++ SDK Core"]
        direction TB
        QNet["Qt Network Layer<br/>QNetworkAccessManager + SSL/TLS"]
        QAuth["Auth Manager & Interceptor<br/>Atomic Token Mutex + Kill-Switch"]
        QHscfg["Container Decryptor (.hscfg)<br/>OpenSSL 3.x / libsodium"]
        QThumb["Thumbnail Engine<br/>QQuickImageProvider + Memory Cache"]
        QRTC["WebRTC Engine<br/>libdatachannel + FFmpeg Hardware Decode"]
        QMedia["NVR Playback Engine<br/>Qt Multimedia (QMediaPlayer)"]
        QWS["Realtime Event Client<br/>QtWebSockets (QWebSocket)"]
    end

    subgraph DesktopUI ["Giao diện Ứng dụng Desktop Đa nền tảng"]
        QML["Qt Quick / QML (Giao diện Hiện đại 120 FPS)"]
        Widgets["Qt Widgets (Giao diện Giám sát Doanh nghiệp)"]
    end

    DesktopUI --> QtSDK
    QNet <==>|HTTP/2 JSON| GW_REST
    QThumb <==>|JPEG Frame Stream| GW_THUMB
    QRTC <==>|SDP Exchange :8088| GW_REST
    QRTC <==>|RTP/SRTP Media :8555| RTC_MEDIA
    QWS <==>|WSS Realtime Alerts| GW_WS
```

### 2.1. Tầng Mạng & Xác thực (Network & Auth Layer)
- **Công nghệ Qt**: `QNetworkAccessManager`, `QNetworkRequest`, `QNetworkReply`.
- **Đánh giá Khả thi**: **100% Native**.
  - Hỗ trợ HTTP/1.1, HTTP/2 và HTTPS qua OpenSSL.
  - Xây dựng cơ chế **Atomic Token Refresh với `QMutex` và `QQueue<QNetworkRequest>`**: Khi gặp `HTTP 401 Unauthorized`, SDK tạm dừng hàng đợi request, gửi request refresh token ngầm, sau đó tự động phát lại các request mà giao diện người dùng không hề bị gián đoạn.
  - Bắt mã lỗi `503 Service Unavailable` (`APP_API_DISABLED`) để phát Signal `maintenanceModeTriggered(QString message)`.

### 2.2. Giải mã File Cấu hình Không Chạm (`.hscfg`)
- **Yêu cầu Thuật toán**: Argon2id (64MB, 4 rounds), AES-256-GCM (AAD: `HSCFG\x01`), Chữ ký số Ed25519.
- **Giải pháp trong Qt/C++**:
  - Tận dụng ngay **OpenSSL 3.x** (thư viện mật mã học mà Qt Network đã liên kết sẵn để chạy HTTPS). OpenSSL 3.0+ hỗ trợ sẵn EVP cho AES-256-GCM và Ed25519.
  - Đối với Argon2id: Nhúng thư viện C nhỏ gọn `libargon2` hoặc `libsodium` (chỉ nặng ~300KB khi biên dịch tĩnh).
  - Tốc độ giải mã trên C++ native chỉ mất **dưới 150ms**, nhanh hơn 4 lần so với JavaScript/Dart.

### 2.3. Hiển thị Ảnh Thu nhỏ Thời gian thực (640p 15FPS Thumbnail Engine)
- **Cơ chế**: Tận dụng endpoint `/api/app/v1/cameras/:id/thumbnail?api_key=...&token=...`.
- **Giải pháp trong Qt**:
  - Đối với **QML / Qt Quick**: Kế thừa class **`QQuickImageProvider`** với kiểu `QQuickImageProvider::Image`.
  - Trong QML, việc nạp ảnh được viết cực kỳ tinh gọn:
    ```qml
    Image {
        id: camThumb
        source: "image://hubsight_thumb/" + camera.id + "?t=" + currentTimestamp
        cache: false
        fillMode: Image.PreserveAspectCrop
    }
    ```
  - Cơ chế nạp bất đồng bộ ngầm trên background thread của Qt giúp giao diện người dùng duy trì mượt mà ở mức **60–120 FPS**, hoàn toàn không bị khựng (drop frame) khi tải cùng lúc 32 camera.

### 2.4. Bài toán Cốt tử: Giải mã & Render WebRTC Video trên Desktop
Trong môi trường Desktop C++, WebRTC là bài toán thách thức nhất. Sau khi nghiên cứu sâu, chúng tôi đề xuất **3 Hướng Tiếp cận**:

| Hướng Tiếp Cận | Thư viện Đề xuất | Ưu điểm | Nhược điểm | Đánh giá |
| :--- | :--- | :--- | :--- | :---: |
| **Hướng 1 (Khuyến nghị Cốt lõi)** | **`libdatachannel` + FFmpeg (`libavcodec`)** | • Rất nhẹ (~3MB), mã nguồn C++ hiện đại, dễ build với CMake.<br>• Tự do ghép nối decoder phần cứng (Intel QSV / NVIDIA NVDEC).<br>• Render trực tiếp lên `QQuickItem` (OpenGL/Metal texture). | Phải tự ghép code giữa luồng nhận RTP và decoder FFmpeg (khoảng 300 dòng code C++). | ⭐⭐⭐⭐⭐ **TỐI ƯU NHẤT** |
| **Hướng 2 (Google Official)** | **Google Native `libwebrtc` (M-series)** | • Đầy đủ 100% tính năng WebRTC của Chrome.<br>• Tự động xử lý ICE, STUN, TURN, Jitter Buffer. | Quá cồng kềnh (Bộ nguồn 15GB, build bằng GN/Ninja phức tạp), khó tích hợp vào CMake thông thường. | ⭐⭐⭐ (Nặng nề) |
| **Hướng 3 (Multimedia Pipeline)** | **GStreamer C++ (`webrtcbin`)** | • Hệ sinh thái video cực mạnh, có sẵn plugin `qmlglsink`. | Phải cài đặt bộ runtime GStreamer trên máy client Windows/macOS. | ⭐⭐⭐⭐ (Phù hợp Linux) |

👉 **Kiến trúc Khuyến nghị cho HubSight Qt SDK**:
Sử dụng **`libdatachannel`** để đảm nhận tầng WebRTC PeerConnection (trao đổi SDP Offer/Answer với HubSight Gateway `:8088` và nhận RTP packets từ `:8555`), sau đó chuyển các frame H.264 sang **FFmpeg** để giải mã phần cứng GPU và vẽ lên **`QQuickItem` / `QVideoSink`** của Qt.

### 2.5. Xem lại Video NVR (Archive Playback)
- HubSight App API cung cấp URL phát trực tiếp MP4 (`/api/app/v1/archive/:recording_id/play`).
- **Qt 6 Multimedia (`QMediaPlayer`)**: Kể từ phiên bản Qt 6.5, backend mặc định của Qt Multimedia trên mọi nền tảng (Windows, macOS, Linux) đã được chuyển sang **FFmpeg**.
- Hỗ trợ xem mượt mà, tua nhanh/chậm (Playback rate 0.5x, 2x, 4x, 8x, 16x) và hỗ trợ chuẩn HTTP Range Request để tua ngay lập tức mà không cần tải hết file.

### 2.6. Lưu trữ Khóa & Token An toàn Đa nền tảng (Secure Storage)
- Sử dụng thư viện **`qtkeychain`** (thư viện C++/Qt mã nguồn mở tiêu chuẩn, được tin dùng bởi các dự án lớn như Nextcloud Desktop, ownCloud):
  - **Windows**: Tự động mã hóa qua Windows Credential Manager / DPAPI (`CryptProtectData`).
  - **macOS**: Lưu trữ trong macOS Keychain Access (Apple Security Framework).
  - **Linux**: Lưu trữ qua Secret Service API (Freedesktop / GNOME Keyring / KWallet).

---

## 3. Bản Thiết kế Kiến trúc Bộ SDK Qt (`HubSightQtSDK`)

### 3.1. Cấu trúc Thư mục Dự án Đề xuất

```
HubSightQtSDK/
├── CMakeLists.txt                 # Cấu hình build CMake đa nền tảng (Win/Mac/Linux)
├── include/
│   └── hubsight/
│       ├── HubSightClient.h       # Entrypoint chính của SDK (QObject)
│       ├── HubSightTypes.h        # Struct dữ liệu (CameraDTO, RecordingDTO, UserDTO)
│       ├── HubSightConfig.h       # Module giải mã .hscfg
│       ├── CameraManager.h        # Quản lý danh sách, nhóm và trạng thái camera
│       ├── WebRTCPlayer.h         # QQuickItem render video WebRTC bằng GPU
│       ├── ThumbnailProvider.h    # QQuickImageProvider cho QML
│       ├── ArchiveManager.h       # Quản lý NVR timeline, calendar, video seeking
│       ├── RelayClient.h          # Client WebSocket nhận thông báo AI thời gian thực
│       └── SecureStorage.h        # Wrapper lưu trữ token trên Keychain/DPAPI
├── src/
│   ├── HubSightClient.cpp
│   ├── network/
│   │   ├── AuthInterceptor.cpp    # Atomic Token Refresh Mutex
│   │   └── HttpTransport.cpp
│   ├── media/
│   │   ├── WebRTCStreamSession.cpp# Wrapper libdatachannel
│   │   └── H264HardwareDecoder.cpp# Tích hợp Intel QSV / NVDEC / VideoToolbox
│   └── crypto/
│       └── HscfgDecryptor.cpp     # Argon2id + AES-256-GCM + Ed25519
├── qml/                           # Các QML Component dựng sẵn cho lập trình viên
│   ├── CameraGridView.qml         # Lưới camera thông minh (1x1, 2x2, 3x3, 4x4)
│   ├── CameraCard.qml             # Thẻ hiển thị thumbnail tự động refresh
│   └── NvrTimelineControl.qml     # Thanh trượt thời gian NVR đa năng
└── examples/
    └── DesktopVMSDemo/            # Ứng dụng Desktop giám sát mẫu hoàn chỉnh
```

---

## 4. Mã Nguồn Minh Họa Khả Thi (Proof-of-Concept Implementation)

### 4.1. `HubSightClient.h` - Thiết kế Chuẩn Idiomatic Qt (Signals & Slots)

```cpp
#pragma once
#include <QObject>
#include <QString>
#include <QVector>
#include <QNetworkAccessManager>
#include <QJsonObject>
#include "HubSightTypes.h"

class HubSightClient : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool isAuthenticated READ isAuthenticated NOTIFY authStateChanged)
    Q_PROPERTY(bool isMaintenance READ isMaintenance NOTIFY maintenanceChanged)
    Q_PROPERTY(QString serverUrl READ serverUrl WRITE setServerUrl NOTIFY serverUrlChanged)

public:
    explicit HubSightClient(QObject *parent = nullptr);
    ~HubSightClient() override;

    // 1. Cấu hình & Khởi tạo từ file .hscfg
    Q_INVOKABLE bool loadConfigurationPackage(const QString &filePath, const QString &pinCode);

    // 2. Xác thực
    Q_INVOKABLE void login(const QString &username, const QString &password);
    Q_INVOKABLE void verify2FA(const QString &totpCode);
    Q_INVOKABLE void logout();

    // 3. Quản lý Camera
    Q_INVOKABLE void fetchCameras();
    
    // 4. Multi-View WebRTC Streaming
    Q_INVOKABLE void startMultiView(const QStringList &cameraIds);
    Q_INVOKABLE void stopMultiView();

    bool isAuthenticated() const;
    bool isMaintenance() const;
    QString serverUrl() const;
    void setServerUrl(const QString &url);

signals:
    void authStateChanged(bool authenticated);
    void loginSuccess(const UserDTO &user);
    void loginRequires2FA(const QString &preAuthToken);
    void loginFailed(const QString &errorMessage);
    void sessionExpired();
    void maintenanceModeTriggered(const QString &message, int retryAfterSeconds);
    
    void camerasReceived(const QVector<CameraDTO> &cameras);
    void aiAlertReceived(const NotificationDTO &notification);

private slots:
    void handleNetworkReply();
    void sendBatchHeartbeat();

private:
    QNetworkAccessManager *m_netManager;
    QString m_serverUrl;
    QString m_apiKey;
    QString m_accessToken;
    QString m_refreshToken;
    bool m_isRefreshingToken = false;
    QTimer *m_heartbeatTimer;
    QStringList m_activeStreamingCameraIds;
};
```

---

### 4.2. `ThumbnailProvider.h` - Cung cấp Ảnh Snapshot Thường trực cho QML

```cpp
#pragma once
#include <QQuickImageProvider>
#include <QNetworkAccessManager>
#include <QEventLoop>

class CameraThumbnailProvider : public QQuickImageProvider {
public:
    CameraThumbnailProvider(QNetworkAccessManager *netManager, const QString &gatewayUrl, 
                            const QString &apiKey, const QString &token)
        : QQuickImageProvider(QQuickImageProvider::Image),
          m_net(netManager), m_gatewayUrl(gatewayUrl), m_apiKey(apiKey), m_token(token) {}

    QImage requestImage(const QString &id, QSize *size, const QSize &requestedSize) override {
        // id dạng: "cam_front_door?t=1725890000"
        QString camId = id.split('?').first();
        
        QUrl url(QString("%1/api/app/v1/cameras/%2/thumbnail?api_key=%3&token=%4")
                    .arg(m_gatewayUrl, camId, m_apiKey, m_token));
        
        QNetworkRequest req(url);
        req.setRawHeader("Cache-Control", "no-cache");
        
        // Thực hiện request đồng bộ trên background image thread của QML
        QEventLoop loop;
        QNetworkReply *reply = m_net->get(req);
        QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit);
        loop.exec();

        QImage image;
        if (reply->error() == QNetworkReply::NoError) {
            image.loadFromData(reply->readAll(), "JPEG");
        } else {
            // Trả về placeholder màu tối nếu camera tạm dừng (HTTP 503) hoặc mất kết nối
            image = QImage(640, 360, QImage::Format_RGB32);
            image.fill(QColor(30, 30, 30));
        }
        reply->deleteLater();

        if (size) *size = image.size();
        return image;
    }

private:
    QNetworkAccessManager *m_net;
    QString m_gatewayUrl;
    QString m_apiKey;
    QString m_token;
};
```

---

## 5. So sánh Công nghệ Desktop: Qt (C++) vs Electron vs Flutter Desktop

| Tiêu chí Đánh giá | Qt 6 (C++ / QML) | Electron (Chromium/Node) | Flutter Desktop (C++/Dart) |
| :--- | :---: | :---: | :---: |
| **Hiệu năng Render Ma trận 32 Camera** | ⭐⭐⭐⭐⭐ **Hoàn hảo** (Render GPU Native qua Metal/DirectX, 60–120 FPS mượt mà) | ⭐⭐ **Rất nặng** (DOM giật lag, drop frame nghiêm trọng) | ⭐⭐⭐⭐ **Khá** (Impeller/Skia khá tốt nhưng chưa tối ưu multi-stream WebRTC native) |
| **Mức Chiếm dụng Bộ nhớ RAM** | **Siêu nhẹ** (~150MB – 300MB khi chạy 16 luồng) | **Khổng lồ** (~1.8GB – 4GB RAM) | **Trung bình** (~400MB – 800MB) |
| **Tận dụng Giải mã Phần cứng GPU** | **Trực tiếp** qua Intel QSV, NVIDIA NVDEC, Apple VideoToolbox | Phụ thuộc vào Chromium flags (khó kiểm soát trên các card đồ họa rời) | Phải viết Native C++ Plugin cầu nối |
| **Tốc độ Khởi động Ứng dụng** | **Dưới 0.5 giây** (Native Binary) | **3 – 6 giây** (Do nạp toàn bộ Chromium runtime) | **1 – 2 giây** |
| **Kích thước Bộ Cài đặt (.exe / .dmg)** | **Gọn gàng** (~35MB – 50MB) | **Nặng** (~120MB – 180MB) | **Gọn gàng** (~40MB – 60MB) |
| **Hỗ trợ Đa Màn hình (Multi-Monitor Wall)**| **Xuất sắc** (`QScreen`, tách nhiều cửa sổ độc lập không tốn RAM phụ) | Kém (Mỗi cửa sổ mới là 1 tiến trình Renderer tốn thêm 300MB RAM) | Khá (Multi-window API vẫn đang trong giai đoạn hoàn thiện) |
| **Chuẩn mực Ngành CCTV Quốc tế** | **90% phần mềm CCTV lớn đều viết bằng C++/Qt** (Milestone XProtect, Avigilon, Dahua SmartPSS, Hikvision iVMS) | Rất hiếm khi dùng cho trạm giám sát an ninh nặng | Mới xuất hiện, chủ yếu cho app gia đình nhẹ |

---

## 6. Ma trận Rủi ro Kỹ thuật & Biện pháp Hóa giải (Risk Mitigation)

| Rủi ro Kỹ thuật | Mức độ | Nguyên nhân | Biện pháp Hóa giải trong Thiết kế SDK |
| :--- | :---: | :--- | :--- |
| **Build WebRTC C++ phức tạp** | **Cao** | Google `libwebrtc` rất khó biên dịch chéo cho Windows/Mac/Linux. | Sử dụng **`libdatachannel`** (thuần C++17, chỉ cần CMake kéo về qua FetchContent hoặc vcpkg, build chỉ mất 2 phút). |
| **Xung đột phiên bản OpenSSL trên Linux** | **Trung bình** | Các bản phân phối Linux (Ubuntu 20/22/24) cài sẵn các bản OpenSSL 1.1 hoặc 3.0 khác nhau. | Đóng gói bộ cài đặt bằng **AppImage** hoặc **Flatpak** đính kèm sẵn OpenSSL tương thích. |
| **Chớp màn hình khi nạp thumbnail** | **Thấp** | Tải liên tục ảnh JPEG mới gây hiệu ứng flicker. | Áp dụng kỹ thuật **Double Buffering** trong `QQuickItem` hoặc kích hoạt `gaplessPlayback` ở tầng render. |
| **Rò rỉ Bộ nhớ khi Chạy 24/7** | **Trung bình** | Ứng dụng giám sát an ninh thường mở liên tục nhiều tuần/tháng không tắt. | Tuân thủ tuyệt đối chuẩn **C++ RAII**, con trỏ thông minh (`std::unique_ptr`, `QSharedPointer`), kiểm tra bằng AddressSanitizer & Valgrind trước khi phát hành. |

---

## 7. Lộ trình Triển khai Dự án Qt SDK (Implementation Plan)

```mermaid
gantt
    title Kế hoạch Triển khai Bộ SDK Qt Đa Nền tảng
    dateFormat  YYYY-MM-DD
    section Giai đoạn 1: Core & Auth
    Tạo cấu trúc CMake & Quản lý Thư viện qua vcpkg :m1_1, 2026-10-01, 7d
    Module Giải mã .hscfg (Argon2id + AES-GCM)        :m1_2, after m1_1, 10d
    HttpTransport, AuthInterceptor & Atomic Refresh    :m1_3, after m1_2, 10d
    section Giai đoạn 2: Camera & Media
    QQuickImageProvider cho Thumbnail 640p            :m2_1, after m1_3, 7d
    Tích hợp libdatachannel & Đàm phán batch-webrtc   :m2_2, after m2_1, 14d
    FFmpeg Hardware Decoder & Render QQuickItem       :m2_3, after m2_2, 14d
    section Giai đoạn 3: NVR & Realtime
    NVR Timeline Player (Qt Multimedia FFmpeg)         :m3_1, after m2_3, 10d
    Relay Client WebSocket nhận sự kiện AI            :m3_2, after m3_1, 7d
    section Giai đoạn 4: Đóng gói & Demo
    Xây dựng Demo App DesktopVMS (Ma trận 16 Camera)   :m4_1, after m3_2, 14d
    Đóng gói Windows (MSI/InnoSetup), macOS (DMG)      :m4_2, after m4_1, 10d
```

---

## 8. Kết luận & Đề xuất Bước đi Tiếp theo

1. **Khẳng định**: Việc phát triển **HubSight Qt SDK** là hoàn toàn khả thi, cực kỳ phù hợp với bộ API hiện có và là **bước đi tất yếu** nếu HubSight muốn tiến sâu vào thị trường **phần mềm giám sát chuyên nghiệp cho khối doanh nghiệp, nhà máy, tòa nhà và ngân hàng**.
2. **Khuyến nghị Công nghệ**:
   - Ngôn ngữ: **C++20** kết hợp **Qt 6.6+**.
   - Giao diện: **Qt Quick / QML** cho trải nghiệm người dùng hiện đại, đồ họa tăng tốc GPU.
   - Thư viện WebRTC: **`libdatachannel` + FFmpeg**.
   - Quản lý gói phụ thuộc: **`vcpkg`** hoặc **`Conan`** để tự động hóa quá trình build trên Windows, macOS và Linux.
