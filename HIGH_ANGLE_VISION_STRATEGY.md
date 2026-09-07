# High-Angle CCTV Computer Vision Strategy: Person, Fall & Fire Detection

> **Document Type:** Technical Architecture & Algorithm Design
> **Target Audience:** AI/CV Engineers, Systems Architects (including Claude review)
> **Repository:** HubSight CCTV Platform (`services/vision`)
> **Status:** Grounded Engineering Specification (v3.2)
> **Changelog:** v3.2 — Added §2.5 (Face Recognition Scope Boundary for High-Angle Streams).

---

## 1. Executive Summary & The High-Angle CCTV Problem

In practical surveillance deployments, CCTV cameras are almost universally mounted at high elevations (ceilings, poles, wall corners at 2.5m – 6m height) tilted downwards at steep oblique angles (**pitch 45° to 75°**).

### 1.1 Scope & Profile Demarcation
> **Important Scope Limitation:** This specification applies **specifically to cameras operating at steep tilt angles (pitch $45^\circ\text{–}75^\circ$)**. Moderate-angle and eye-level cameras (pitch $15^\circ\text{–}35^\circ$, typically deployed in corridors, entryways, and access control for facial recognition) retain the existing baseline processing path. The high-angle heuristic modifications (P0/P1) are selectively activated via the automatic zero-calibration angle profile estimator (§2.3) to prevent regressions on eye-level streams.

### 1.2 Production Constraints in HubSight
Every proposed solution in this document is strictly bound by the actual production constraints of the HubSight pipeline:
- **Stream Profile (`services/vision/src/streaming/stream_manager.py:19-20`):**
  - Managed by `pool-service` as **Connection #0 (`cam_{id}_cv`)**.
  - **Resolution:** 640p (typically $640 \times 384$ or $640 \times 480$).
  - **Framerate:** Fixed at **$\sim 10\text{ FPS}$** ($\Delta t \approx 100\text{ ms}$ per frame).
  - **Audio:** None.
  - **Mathematical Consequence:** By the Nyquist-Shannon sampling theorem, the maximum observable frequency without aliasing is:
    $$f_{\text{Nyquist}} = \frac{10\text{ FPS}}{2} = 5\text{ Hz}$$
    Any temporal frequency analysis above $5\text{ Hz}$ (such as 8–12 Hz flame flicker FFT) is **physically impossible** on this stream and produces pure aliasing.
- **Camera Heterogeneity:**
  - Cameras are arbitrary RTSP streams added via network scan.
  - No interactive calibration UI exists by default.
  - Cameras may be PTZ (Pan-Tilt-Zoom) or subject to structural vibration.
  - Planar Homography / Bird's-Eye View (BEV) **cannot be a mandatory baseline dependency**.
- **Compute Budget (ONNX Runtime on CPU):**
  - Runs on multi-core host CPUs serving $N$ concurrent camera streams.
  - Primary model: `yolo26n-pose.onnx` ($384 \times 640$ input, $\approx 35\text{–}48\text{ ms}$ per frame on CPU).
  - Secondary model: `yolo-fire-smoke.onnx` ($384 \times 640$ input, runs conditionally via `FIRE_INFER_INTERVAL = 1.0\text{s}`).
  - **Constraint:** We cannot introduce an additional neural network (e.g., separate head-detector or dense optical flow CNN) without exceeding CPU capacity across multiple streams. All enhancements must use lightweight geometric and temporal heuristics on existing model outputs.

---

## 2. Person Detection & Tracking at High Angles

### 2.1 Reality of High-Angle Perspective
- **Perspective Foreshortening:** As camera pitch approaches 70°, an upright standing person is compressed along the vertical axis ($H/W$ ratio changes from $\approx 3:1$ down to $\approx 1:1$ or $0.8:1$).
- **Self-Occlusion:** The head visually overlaps the neck, shoulders, and hips. Feet are frequently occluded by the torso itself.
- **Environmental Occlusion:** Office partitions, counters, and furniture block the lower body, causing traditional full-body bounding box trackers to drop tracks.

### 2.2 Reusing Existing Pose Keypoints (COCO 0–4: Head-Anchor)
`yolo26n-pose.onnx` already predicts 17 COCO keypoints per person:
- `0`: Nose
- `1, 2`: Left / Right Eye
- `3, 4`: Left / Right Ear
- `5, 6`: Left / Right Shoulder
- `11, 12`: Left / Right Hip

At steep overhead angles, while hips (`11, 12`) and ankles (`15, 16`) frequently drop below `KP_CONF` (0.3), **keypoints 0 through 4 (the cranial cluster) remain visible from above**.

#### Implementation:
- **What is measured:** Head anchor position $\mathbf{p}_{\text{head}} = (\bar{x}_{\text{head}}, \bar{y}_{\text{head}})$, computed as the mean of valid keypoints in indices $\{0, 1, 2, 3, 4\}$ where $\text{conf}_i \ge 0.30$:
  $$\mathbf{p}_{\text{head}} = \frac{1}{|K_{\text{head}}|} \sum_{i \in \{0..4\}, \text{conf}_i \ge 0.3} (x_i, y_i)$$
- **Fallback Trigger:** If shoulders (`5, 6`) or hips (`11, 12`) have confidence $< 0.30$ (foreshortened or occluded), use $\mathbf{p}_{\text{head}}$ as the primary spatial reference for tracking rather than the bounding box bottom-center.
- **Compute Cost:** $< 0.02\text{ ms}$ per track (NumPy slice mean).
- **Operation at 10 FPS:** Evaluated every frame (100 ms) in `detector.py:265-273`.
- **Target File/Function:** `services/vision/src/detection/detector.py` in `process_frame()` and `services/vision/src/detection/fall_kinematics.py`.

### 2.3 Camera Angle Profile Auto-Estimation (Zero-Calibration)

Cameras added via automatic network scan contain no tilt/pitch metadata, and requiring manual calibration violates HubSight's zero-friction plug-and-play architecture. To dynamically determine whether a camera requires the high-angle strategy ($45^\circ\text{–}75^\circ$) or should retain the standard eye-level baseline ($15^\circ\text{–}35^\circ$), we implement a **purely automatic, zero-calibration angle profile estimator**:

#### Mechanism:
1. **Observation Phase (Rolling Aspect-Ratio Collection):**
   - For every confirmed walking or standing person track (`track_id` with continuous movement displacement $v > 0.05\text{ height/s}$ in normalized space), collect the bounding box aspect ratio:
     $$AR = \frac{w_{\text{box}}}{h_{\text{box}}}$$
   - Accumulate a rolling buffer of the first $N = 200$ valid upright person detections across the scene.
2. **Classification Decision Rule:**
   - Compute the median aspect ratio across the buffer:
     $$AR_{\text{median}} = \text{median}(\{AR_1, AR_2, \dots, AR_N\})$$
   - At standard eye-level / corridor angles ($15^\circ\text{–}35^\circ$), an upright human body has $w/h \approx 0.35\text{–}0.60$ ($AR_{\text{median}} \le 0.70$).
   - At high overhead pitch ($45^\circ\text{–}75^\circ$), perspective foreshortening severely compresses height, causing $w/h \ge 0.85\text{–}1.20$.
   - **Decision Boundary:**
     $$\text{angle\_profile} = \begin{cases} \text{"high"}, & \text{if } AR_{\text{median}} > 0.80 \\ \text{"standard"}, & \text{otherwise} \end{cases}$$
3. **Runtime Lifecycle & Fail-Safe:**
   - **Fail-Safe Default:** When a stream starts or when fewer than $N=200$ detections have been recorded (e.g., newly added camera, empty scene, or camera pointed at an empty corridor), `angle_profile` defaults strictly to `"standard"`. This guarantees zero regressions and preserves the existing baseline path.
   - **Persistence & Periodic Re-Evaluation:** `angle_profile` is stored in the active camera worker state (`StreamManager` / `Detector`) and periodically re-evaluated every 4 hours (or every 1,000 new detections). This seamlessly accommodates PTZ camera movements, manual re-positioning, or lens adjustments without requiring user intervention.
4. **Target File/Function:** `services/vision/src/detection/detector.py:Detector` and `services/vision/src/streaming/stream_manager.py`.

### 2.4 Opt-in Ground-Plane Homography (P2 Feature for Fixed Cameras Only)
To respect the constraint that cameras are arbitrary RTSP and may be PTZ:
- **Baseline:** Ground-plane homography is **disabled by default**. Tracking runs in normalized image space.
- **Opt-in Design:**
  1. A camera must be explicitly marked as `is_fixed: true` in the device settings.
  2. The UI allows an admin to click 4 reference points on the floor to establish planar homography matrix $\mathbf{H} \in \mathbb{R}^{3 \times 3}$.
  3. $\mathbf{H}$ is stored in the `cameras` database record.
  4. **Shift Invalidation:** To prevent invalid homography if the camera is bumped or panned, a feature/template-matching check monitors 3–4 static architectural patches (door frames, floor seams). If static structural landmarks shift by $> 5\%$, $\mathbf{H}$ is automatically invalidated and the system falls back to normalized image space.

### 2.5 Face Recognition Scope Boundary (High-Angle Streams)

> **Ràng buộc bổ sung cho §1.1:** Nếu hệ thống bổ sung module nhận diện khuôn mặt (face ID, ví dụ dựa trên InsightFace/ArcFace) trong tương lai, module này **không được kích hoạt trên luồng camera có `angle_profile = "high"`** (xác định bởi §2.3). Face ID chỉ được coi là đáng tin cậy trên luồng `angle_profile = "standard"` (pitch $15^\circ\text{--}35^\circ$), đúng như phạm vi đã giới hạn ở §1.1.

**Cơ sở kỹ thuật:**
- Các model InsightFace/ArcFace được huấn luyện chủ yếu trên tập dữ liệu web-scraped (MS1MV2, Glint360K...), biến thiên chủ yếu theo góc **yaw** (quay trái/phải); biến thiên theo **pitch** (nhìn từ trên xuống) trong tập huấn luyện rất hạn chế so với yaw.
- Ở pitch vượt ngưỡng khoảng $30^\circ$, hiệu năng sinh trắc học của các hệ thống nhận diện khuôn mặt hiện tại suy giảm đáng kể; ở pitch $45^\circ\text{--}75^\circ$ như camera CCTV trần cao trong hệ thống này, phần trán/đỉnh đầu che khuất mắt-mũi-miệng, khiến bước 5-point landmark alignment (tiền đề bắt buộc trước khi trích embedding) thất bại trước khi model kịp hoạt động.
- Khoảng cách xa và độ phân giải thấp (640p, cùng ràng buộc compute ở §1.2) cộng dồn với domain gap về pose -- hai trục suy giảm này nhân lên chứ không cộng tuyến tính, tương tự vấn đề "Small Target Degradation" đã nêu ở §6.1 cho pose keypoints.

**Gating Rule nếu buộc phải thử nghiệm trên luồng góc cao (không khuyến nghị dùng làm baseline):**
1. Ước lượng pose khuôn mặt (yaw/pitch) từ 5-point landmark do face detector (SCRFD/RetinaFace) trả về; loại bỏ ứng viên nếu pitch ước lượng $> 25^\circ\text{--}30^\circ$.
2. Áp ngưỡng kích thước khuôn mặt tối thiểu (interocular distance hoặc bbox width), tương tự cơ chế `resolution_tier: "low_res"` ở §6.1; dưới ngưỡng, đánh dấu `face_quality: "unusable"` và không chạy recognition.
3. Không dispatch cảnh báo định danh (identity match alert) dựa trên embedding có `face_quality: "unusable"` -- chỉ log "detected, unidentified" để tránh false-match.

- **Target File/Function (dự kiến, nếu module được thêm):** `services/vision/src/recognition/face_id.py` -- logic gating nên tái sử dụng `angle_profile` từ `Detector` (§2.3) làm điều kiện early-exit, tránh lãng phí compute budget đã cam kết ở §1.2.

---

## 3. Fall Detection (Té Ngã) at High Angles

### 3.1 Accurate Diagnosis of Current Codebase

HubSight already has multi-frame temporal tracking in `services/vision/src/detection/track_identity.py`:
- `self.angle_history`: Maintains a 5-second sliding window (`now - a[0] <= 5.0`).
- `past_upright`: Checks if the person was upright in the past 5s (`any(a[1] <= UPRIGHT_ANGLE_DEG for a in self.angle_history[:-1])` where `UPRIGHT_ANGLE_DEG = 35.0`).
- `self.last_abnormal_alert`: Enforces a 30-second cooldown (`now - self.last_abnormal_alert < 30.0`).
- `_check_fall_from_box`: Fallback aspect-ratio check (`current_ar >= 1.15` and `past_standing = any(b[2] < 0.7...)`).

#### The Real Failure Mode:
The core failure is **not** a lack of temporal tracking. The failure is that `torso_angle_deg()` in `services/vision/src/detection/fall_kinematics.py:51-57` calculates:
```python
vx = float(sh[0] - hip[0])
vy = float(sh[1] - hip[1])
return float(abs(math.degrees(math.atan2(abs(vx), abs(vy)))))
```
At a steep tilt angle ($50^\circ\text{–}75^\circ$):
- When an upright person stands or walks, their shoulders and hips project very close together along the vertical image plane: $v_y = sh_y - hip_y \to 0$.
- Any minor lateral sway or natural gait produces $|v_x| \ge |v_y|$, causing $\text{atan2}(|v_x|, |v_y|)$ to spike above $50^\circ$ (`FALL_ANGLE_DEG`).
- The person is marked `is_fallen = True` while simply standing or walking, rendering the 5-second temporal buffer useless because the input signal itself is degenerate.

### 3.2 Correcting the Physical Model at 10 FPS

#### Why Second-Derivative Acceleration ($\text{m/s}^2$) Must Be Avoided:
- At 10 FPS, a fall from standing to floor contact takes **$300\text{–}600\text{ ms}$ (only 3 to 6 discrete frames)**.
- Calculating numerical acceleration $\frac{\Delta^2 y}{\Delta t^2}$ over 3–5 samples with noisy 640p keypoints leads to severe derivative noise amplification.
- Furthermore, converting pixel coordinates to $\text{m/s}^2$ requires depth calibration, which arbitrary RTSP streams lack.

#### Why Image-Y Drop Velocity Alone Fails (The Pitch 70° Edge Case):
- At a steep pitch of $\approx 70^\circ$, if a person falls **along the camera's optical line of sight** (falling directly away from or towards the camera along the floor plane), their centroid vertical displacement in the image ($\Delta y_{\text{center}}$) can be negligible ($\Delta y \approx 0$).
- Therefore, a single-gate transition based strictly on $V_{\text{drop\_y}}$ will fail to detect true falls in this direction.

#### Why Overhead Area Expansion Cannot Be a Mandatory Gate:
- At steep overhead angles ($70^\circ\text{–}75^\circ$), an upright person's bounding box encompasses their head-and-shoulders footprint on the floor.
- When a person falls on the floor seen from directly above, their limbs may tuck or extend along the camera axis; their 2D projected bounding box area does **not** consistently expand $2\times\text{–}3\times$ (in some orientations it barely changes or even contracts).
- **Rule:** Area expansion cannot be a hard blocker.

### 3.3 The High-Angle Fall State Machine

To solve both false positives and missed falls, the architectural philosophy is:
> **Entry into `DESCENDING` must be an OR of weak trigger signals (high recall). Verification of `FALL_CONFIRMED` must be strict via posture and stillness (high precision).**

```
   [UPRIGHT]
       │
       │ Triggered by OR of weak signals:
       │  (a) Rapid vertical drop V_drop > 0.40 height/s over 2-3 frames
       │  (b) Sudden posture aspect-ratio / span collapse ΔAR > 0.50 over 2-3 frames
       │  (c) Slow-crumple: continuous descent / shrinkage over 1.0-1.5s
       ▼
  [DESCENDING] ──────── (Tracking lost for > 5 frames) ──────┐
       │                                                     │
       │ (Signal 0: Prone Posture verified AND Deceleration)  ▼
       ▼                                              [LOST_DURING_FALL]
 [STILLNESS_VERIFYING]                                (Hold candidate 1.5s;
       │                                               latch if track recovers
       ├── (Motion energy > threshold within 3.0s) ──> Revert to UPRIGHT
       │
       ▼ (Stillness maintained continuously for ≥ 3.0s / 30 frames)
 [FALL_CONFIRMED] ──> Dispatch Alert
```

---

### 3.4 Measurable Signals & Precise Definitions

> *Note: All numerical thresholds in this section are initial engineering baselines. They must be tuned against the internal benchmark suite (§7.2) and are subject to empirical optimization.*

#### Signal 0: Posture (Prone / Horizontal State Gate)
- **What is measured:** Evaluates whether the subject is currently lying flat on the floor, replacing the degenerate `atan2(|vx|, |vy|)`. Computed as a dual indicator combining normalized bounding box aspect ratio and keypoint horizontal spread:
  $$\text{Aspect Ratio: } AR = \frac{w_{\text{box}}}{h_{\text{box}}}$$
  $$\text{Keypoint Span Ratio: } \text{Ratio}_{\text{span}} = \frac{\max_{i \in K} x_i - \min_{i \in K} x_i}{\max_{i \in K} y_i - \min_{i \in K} y_i + 1e-4}$$
- **Threshold:** $\text{IsProne} = \text{True}$ if $AR \ge 1.15$ OR $\text{Ratio}_{\text{span}} \ge 1.20$.
- **Lưu ý về False Positive góc $70^\circ$:** Người đi bộ thẳng về phía camera ở góc $70^\circ$ cũng bị nén phối cảnh khiến $AR$ và $\text{Ratio}_{\text{span}}$ tăng cao, có thể kích hoạt Signal 0 báo "prone" giả. Vì vậy, **Signal 0 là điều kiện cần-không-đủ**; chính **Stillness Gate 3.0s** (§3.4 Signal 2) mới là chốt chặn quyết định phân biệt giữa "nằm ngã" với "đi về phía camera" (người đi bộ liên tục dịch chuyển và vận động chi, sẽ bị loại bỏ ngay lập tức ở Stillness Gate).
- **Compute Cost:** $< 0.03\text{ ms}$ per track (NumPy min/max).
- **10 FPS Operation:** Checked at each frame; acts as the mandatory gating condition to enter `STILLNESS_VERIFYING`.
- **Target File/Function:** `services/vision/src/detection/fall_kinematics.py:is_fallen_pose()`.

#### Signal 1: Multi-Trigger Descent (Entering `DESCENDING`)
Entry from `UPRIGHT` into `DESCENDING` is an **OR condition** of 3 weak signals:
1. **Rapid Image-Y Drop:**
   $$V_{\text{drop}}(t) = \frac{y_{\text{center}}(t) - y_{\text{center}}(t - 2\Delta t)}{2\Delta t} \ge 0.40\text{ height/s}$$
   (Downwards translation $\ge 8\%$ of frame height in 200 ms).
2. **Sudden Posture Change (Tumbling / Pitch Collapse):**
   $$AR(t) - AR(t - 2\Delta t) \ge 0.50 \quad \text{within } 200\text{ ms}$$
3. **Slow Crumple / Collapse (Net Descent with Monotonicity Check):**
   $$[y_{\text{center}}(t) - y_{\text{center}}(t - 12\Delta t)] \ge 0.25 \quad \mathbf{AND} \quad \sum_{k=1}^{12} \mathbb{I}\left(y_{\text{center}}(t - (k-1)\Delta t) < y_{\text{center}}(t - k\Delta t)\right) \le 2$$
   (Hạ độ cao tịnh tiến ròng $\ge 0.25$ chiều cao khung hình qua 12 frame / $1.2\text{s}$, đồng thời số frame có xu hướng đi ngược lên trên không vượt quá 2/12 frame. Điều này loại bỏ hoàn toàn hiện tượng telescoping cancellation và ngăn ngừa kích hoạt giả do người nhấp nhô lên-xuống ngẫu nhiên).
- **Compute Cost:** $< 0.02\text{ ms}$ using rolling `box_history` deque.
- **Target File/Function:** `services/vision/src/detection/track_identity.py:update_pose_history()`.

#### Signal 2: Stillness Gate with Automatic Fallback (NKD vs. Bbox-Stillness)
To prevent pose model breakdown on prone/occluded bodies from breaking the stillness gate, we define a **two-tier stillness metric**:

- **Tier A: Normalized Keypoint Displacement (NKD) — Used when $|K_{\text{valid}}| \ge 6$:**
  $$E_{\text{motion}}(t) = \frac{1}{|K_{\text{valid}}|} \sum_{i \in K_{\text{valid}}} \frac{\|\mathbf{p}_i(t) - \mathbf{p}_i(t - \Delta t)\|_2}{\max(w_{\text{box}}, h_{\text{box}})}$$
  - Stillness Threshold: $E_{\text{motion}} < 0.02$ per frame.
- **Tier B: Bounding-Box Centroid & Area Stillness — Fallback when $|K_{\text{valid}}| < 6$:**
  When a person lies prone and keypoint detection jitters or fails, calculate stillness directly from the bounding box (extending `_check_fall_from_box`):
  $$D_{\text{bbox}}(t) = \frac{\|\mathbf{c}_{\text{box}}(t) - \mathbf{c}_{\text{box}}(t - \Delta t)\|_2}{\max(w_{\text{box}}, h_{\text{box}})} + \frac{|\text{Area}(t) - \text{Area}(t - \Delta t)|}{\text{Area}(t) + 1e-4}$$
  - Stillness Threshold: $D_{\text{bbox}} < 0.03$ per frame.
- **Gating Rule:** Stillness condition (Tier A or Tier B) must hold continuously for **$\ge 30$ consecutive frames ($3.0\text{ seconds}$ at 10 FPS)**.
- **Compute Cost:** $< 0.04\text{ ms}$ per track.
- **Target File/Function:** `services/vision/src/detection/track_identity.py:check_abnormal_behavior()`.

#### Signal 3: Track-Loss Recovery with Strict Gating
During rapid falls, ByteTrack often drops track for 2–5 frames due to motion blur or shape deformation.
- **Recovery Rule:** If a track is lost while in `DESCENDING`:
  - Cache $(x_{\text{last}}, y_{\text{last}}, w_{\text{last}}, h_{\text{last}}, t_{\text{lost}})$.
  - If a new track or untracked detection appears within:
    1. Normalized Euclidean centroid distance $d \le 0.08$ ($\approx 50\text{px}$ at 640p), **AND**
    2. Bounding box $\text{IoU} > 0.30$ with the last known box, **AND**
    3. Elapsed time $\Delta t_{\text{lost}} \le 1.5\text{s}$ (15 frames):
  - **Identity Carry-Over:** The new track immediately inherits `track_id`, `name`, `role`, `member_id`, `is_locked`, and `created_at` from the lost track. State transitions directly to `STILLNESS_VERIFYING`.
- **Compute Cost:** $< 0.01\text{ ms}$.
- **Target File/Function:** `services/vision/src/detection/detector.py:process_frame()`.

---

## 4. Fire & Smoke Detection (Lửa & Khói) at High Angles

### 4.1 Rejection of Flicker-FFT at 10 FPS
At 10 FPS ($\Delta t = 100\text{ ms}$), the Nyquist limit is $5\text{ Hz}$. A typical 8–12 Hz flame flicker produces severe frequency aliasing (e.g. 9 Hz folds into 1 Hz, mimicking slow lighting transitions). **Flicker-FFT is permanently removed.**

### 4.2 Parallel Two-Path Pipeline: Fire vs. Smoke

> **Crucial Safety Architecture:** Clean combustion, early electrical fires, and wind-dispersed outdoor fires do not produce detectable smoke plumes initially. Therefore, **Fire and Smoke detection operate on two independent parallel paths**. Fire detection does NOT require smoke co-presence.

```
                  [Candidate Bounding Box from yolo-fire-smoke.onnx]
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
             [CLASS: FIRE]                               [CLASS: SMOKE]
                   │                                           │
  [1. Specular Glare & HSV Filter]              [1. Texture & Chroma Filter]
   • Mean Saturation S ≥ 0.35                    • Low Saturation S ≤ 0.20 (gray/white)
   • Hue H ∈ [0, 35] ∪ [340, 360]                • Low Edge Density: Var(Laplace) < 120
   • Reject if (V > 0.90 and S < 0.25)           • Diffuse blurry boundary gradient
                   │                                           │
                   ▼                                           ▼
  [2. Temporal Persistence Gate]                [2. Multi-Frame Persistence Gate]
   • Detected in K = 7 out of M = 10 frames      • Detected in ≥ 5 out of 10 frames
                   │                                           │
                   ▼                                           ▼
  [3. Spatial Area/Luma Instability]            [3. Monotonic Growth & Drift Gate]
   • Area std dev σ_area / μ_area ≥ 0.08         • Area expansion A(t)/A(t-2s) ≥ 1.30
   • Rejects static warm lamps/signs             • Upward centroid drift Δy_centroid ≤ 0
                   │                                           │
                   ▼                                           ▼
         [DISPATCH FIRE ALERT]                       [DISPATCH SMOKE ALERT]
```

### 4.3 Detailed Filter Mechanics & Compute Costs

> *Note: All thresholds below are initial baseline estimates to be tuned against §7.2.*

#### Path A: Fire Verification Filters
1. **Specular Reflection Filter (HSV Saturation & Glare):**
   - Floor reflections (wet tile, polished concrete, car headlights) are specular: they exhibit high luminance but low chroma ($S < 0.35$ in HSV), or blown-out white highlights ($V > 0.90$ and $S < 0.25$).
   - True combustion flames show high saturation ($S \ge 0.45$) in warm hues ($H \in [0, 35] \cup [340, 360]$).
   - *Note on Floor Fires:* We do **not** reject boxes based on bottom-frame position alone (real floor fires exist: spilled fuel, trash bins, fallen candles). A floor-level box is accepted if it passes the HSV and persistence tests.
   - **Compute Cost:** $\approx 0.15\text{ ms}$ per candidate crop (crop size $\le 100 \times 100$).
2. **Temporal Persistence Gate ($K/M$ Buffer):**
   - Must be detected in at least $K = 7$ of the last $M = 10$ frames ($0.7\text{–}1.0\text{s}$) using IoU $\ge 0.40$.
   - Eliminates transient flashes from opening doors, moving vehicle headlights, or camera sensor auto-exposure adjustments.
   - **Compute Cost:** $< 0.01\text{ ms}$.
3. **Spatial Instability Check:**
   - Real flames fluctuate in shape: the bounding box area variance over 10 frames satisfies $\frac{\sigma_{\text{area}}}{\mu_{\text{area}}} \ge 0.08$.
   - Static yellow emergency lamps or heated industrial elements maintain $\sigma_{\text{area}} \approx 0$ and are rejected.
   - **Compute Cost:** $< 0.01\text{ ms}$.

#### Path B: Smoke Verification Filters
1. **Texture & Chroma Filter (Low-Saturation, Low Edge Density & Diffuse Blur):**
   - **Chroma Filter:** Mean saturation in HSV space $S \le 0.20$ (khói thật có màu xám, trắng xám hoặc đen muội; loại trừ các vật thể có màu sắc rực rỡ như rèm cửa, quần áo chuyển động, banner quảng cáo).
   - **Low Edge Density (Laplacian Variance):** Khói không có cấu trúc bề mặt sắc nét mà ở dạng hạt phân tán / mờ đục. Tính phương sai toán tử Laplace trên crop grayscale:
     $$\text{Var}(\nabla^2 I_{\text{crop}}) < 120$$
     Các vật thể có biên sắc nét (rèm cửa dập dờn, tấm bạt lay động, người mặc áo trắng, chăn màn bay) có $\text{Var}(\nabla^2 I) \ge 300\text{–}1000$ và bị loại bỏ ngay lập tức.
   - **Diffuse Boundary Gradient:** Biên độ chuyển tiếp biên diễn ra mờ nhòe (diffuse), loại trừ các luồng ánh sáng projector, bóng phản chiếu trên tường hoặc hơi nước áp lực cao có viền biên sắc gọn.
   - **Compute Cost:** $\approx 0.08\text{ ms}$ trên crop xám kích thước $80 \times 80$.
2. **Temporal Persistence Gate:**
   - Xuất hiện trong ít nhất $5$ trên $10$ frame liên tiếp ($0.5\text{–}1.0\text{s}$) với $\text{IoU} \ge 0.35$.
3. **Monotonic Smoke Growth Gate:**
   - Smoke plumes naturally expand due to convection.
   - Measure bounding box area over a rolling 20–40 frame window ($2.0\text{–}4.0\text{s}$ at 10 FPS):
     $$\frac{\text{Area}(t)}{\text{Area}(t - 2.0\text{s})} \ge 1.30$$
   - Reject static white architectural pillars, clouds, or stationary steam pipes whose area remains constant.
4. **Upward Centroid Progression:**
   - The centroid vertical coordinate must show non-negative upward velocity: $y_{\text{center}}(t) \le y_{\text{center}}(t - 1.0\text{s})$ in normalized image space.
- **Target File/Function:** `services/vision/src/detection/detector.py:_append_danger_box()`.

---

## 5. Night / Infrared (IR) Mode Operation

High-angle CCTV cameras frequently transition to Black & White / IR illumination at night, altering pixel dynamics.

### 5.1 Automatic IR Detection
- **Mechanism:** Compute the mean color saturation across the downscaled frame:
  $$\bar{S} = \frac{1}{N} \sum_{(x, y)} S(x, y)$$
- **Condition:** If $\bar{S} < 0.08$ continuously for $\ge 30$ frames (3s), the camera is operating in **IR Night Mode**.

### 5.2 Operating Rule Adjustments in IR Mode
1. **Fire Detection Suppression / High-Bar Gate:**
   - In IR mode, chromatic information is destroyed ($S \approx 0$).
   - Incandescent lamps, vehicle exhausts, and heating appliances emit intense IR light that appears as blown-out white blobs, triggering massive false fire detections.
   - **Policy:** In IR mode, standalone `fire` detection is **disabled or strictly gated on co-occurrence with a verified growing `smoke` plume**. *(Quy tắc IR này cố ý override tính độc lập 2-path ở §4.2 — vì xác minh fire dựa trên chroma (HSV/hue) bất khả thi khi không có màu.)*
2. **Relaxed Pose Thresholds for IR Grain:**
   - IR video exhibits pronounced sensor shot noise.
   - Relax `KP_CONF` in `fall_kinematics.py` from $0.30$ to $0.20$ for shoulders and hips to avoid dropping valid keypoints.
   - Compensate for the lower keypoint confidence by **increasing the stillness verification window from 3.0s to 4.0s (40 frames)**.

---

## 6. Limitations & Graceful Degradation

### 6.1 Small Target Degradation (Person $< 30\text{px}$)
In high-angle views (e.g. 5m ceiling height), a person standing far from the camera in a large warehouse or courtyard may occupy fewer than 30 vertical pixels:
- **Failure Mode:** At $< 30\text{px}$, YOLO-pose keypoint estimation collapses into random noise. Both `torso_angle_deg` and cranial keypoints 0–4 become unreliable.
- **Graceful Degradation Policy:**
  - If $h_{\text{box}} < 30\text{px}$:
    1. Suppress pose-based fall detection entirely (`torso_angle = None`).
    2. Suppress cranial head-anchor fallback.
    3. Rely strictly on bounding-box centroid tracking (`ByteTrack`).
    4. Mark the track object with `resolution_tier: "low_res"`.
    5. Fall detection is disabled for this track to guarantee zero false positives from pixel quantization noise.

---

## 7. Metrics & Evaluation Plan

### 7.1 Quantitative Target KPIs
| Metric                            | Target KPI                              | Measurement Basis                                                                                                           |
| :-------------------------------- | :-------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| **Fall False Alert Rate**         | **$< 1.0$ false alert / camera / 24h**  | Measured over 72h continuous multi-camera production run.                                                                   |
| **Fall Recall**                   | **$\ge 90\%$**                          | On true positive falls with $\ge 3\text{s}$ post-impact stillness.                                                          |
| **Fall Hard Alert Latency**       | **$\le 4.0\text{ seconds}$**            | From floor impact to RabbitMQ event dispatch (3.0s stillness gate + 1.0s processing/dispatch).                              |
| **Soft Alert Latency (Optional)** | **$\le 1.2\text{ seconds}$**            | Emit `"suspected_fall_verifying"` event at $t + 1.0\text{s}$ for UI visual badge (intentional precision/latency trade-off). |
| **Fire False Alert Rate**         | **$< 0.1$ false alert / camera / week** | Zero alerts on car headlights, polished floor reflections, and IR bloom.                                                    |
| **Smoke Detection Delay**         | **$\le 15\text{ seconds}$**             | From visible plume onset to alert dispatch.                                                                                 |

### 7.2 Benchmark Test Suite & Evaluation Protocol
Instead of requiring an unmanageable dataset before merging, we establish a **progressive, non-blocking evaluation suite** in `services/vision/tests/test_high_angle_benchmark.py`:
- **Initial Dataset Size (Day 1):**
  - **10 Staged Fall Clips:** Recorded at $50^\circ\text{–}70^\circ$ pitch with subjects remaining motionless on the floor for $\ge 5\text{s}$.
  - **30 Negative Edge-Case Clips:** Extracted from existing live archive footage:
    - Walking directly under camera lens (overhead foreshortening).
    - Bending down to pick up items or tie shoes ($0.5\text{s} – 2.0\text{s}$).
    - Controlled sitting on chairs and floor.
    - Moving headlights sweeping across polished floor tiles.
    - IR night scenes with incandescent heat sources.
- **CI Integration:**
  - Evaluated as a **nightly benchmark tracker**, reporting precision/recall trends without blocking pull requests.
  - Expands continuously as real production edge cases are archived.

---

## 8. Prioritized Implementation Roadmap

The roadmap is strictly ordered by **implementation cost vs. production impact**, honoring the CPU budget constraint:

```
[P0: Zero-Dependency Code Fixes] ──> [P1: Reusing Existing Model Features] ──> [P2: Advanced Opt-in Calibration]
   • 3.0s stillness verification        • NKD Motion Energy (Tier A/B)            • 4-point Planar Homography UI
   • Signal 0 Posture + Multi-drop      • Head-keypoint anchor (COCO 0-4)         • DB storage of H per camera
   • Fire K/M persistence + HSV         • Monotonic smoke growth gate             • Background landmark shift check
   • IR Night Mode auto-switch          • Nightly benchmark evaluation suite
```

### Phase P0: High-Impact Code Refactoring (Zero New Dependencies, 0ms Extra Inference)
- **`services/vision/src/detection/fall_kinematics.py`:**
  - Implement **Signal 0 Posture** ($AR \ge 1.15$ OR $\text{Ratio}_{\text{span}} \ge 1.20$).
  - Remove direct image-plane vertical `atan2(|vx|, |vy|)`.
- **`services/vision/src/detection/track_identity.py`:**
  - Implement multi-trigger descent ($V_{\text{drop}}$, $\Delta AR$, slow-crumple).
  - Add 3.0-second post-drop stillness timer (`self.stillness_start_time`).
  - Allow direct state transition from `DESCENDING` to `STILLNESS_VERIFYING`.
  - Add track loss recovery caching ($d \le 0.08$, $\text{IoU} > 0.30$, 1.5s window).
- **`services/vision/src/detection/detector.py`:**
  - Implement parallel fire/smoke paths in `_append_danger_box()`.
  - Add $K/M$ persistence filter (7 of 10 frames) for fire candidates.
  - Add HSV saturation filter ($S \ge 0.35$) to eliminate specular reflections.
  - Add automatic IR Night Mode detection ($\bar{S} < 0.08$).
  - Add camera angle profile auto-estimation (§2.3) using median aspect ratio over $N=200$ detections, selectively applying high-angle rules without manual calibration.

### Phase P1: Feature Extraction on Existing Models (Zero Additional ONNX Models)
- **`services/vision/src/detection/track_identity.py`:**
  - Implement dual-tier stillness gate: Tier A (NKD) when $|K_{\text{valid}}| \ge 6$, falling back to Tier B (Bbox-stillness) when $|K_{\text{valid}}| < 6$.
  - Implement cranial head-anchor tracking (COCO keypoints 0–4) when hips/legs are occluded or foreshortened.
- **`services/vision/src/detection/detector.py`:**
  - Add smoke texture & chroma filter (low saturation $S \le 0.20$, Laplacian variance $< 120$, blurry boundary gradient) to eliminate false alarms from curtains, steam, and projector light.
  - Add 30-frame monotonic area growth tracker for smoke candidates.
  - Add small-target degradation gate ($h_{\text{box}} < 30\text{px}$).
- **`services/vision/tests/`:**
  - Implement `test_high_angle_benchmark.py` running nightly against the 10+30 clip test harness.

### Phase P2: Advanced Opt-in Features (Only for Fixed Non-PTZ Cameras)
- **Frontend & Core-Service:** Add 4-point floor calibration modal on Web UI.
- **`services/vision/src/detection/homography.py`:** Planar perspective transform from camera coordinates to Bird's-Eye View.
- **Camera Shift Invalidator:** Background template matching on 3–4 static landmarks that automatically disables homography if camera moves.

### Explicitly Excluded / Deprecated
- **Flicker-FFT (8–12 Hz):** Permanently removed due to Nyquist sampling violation at 10 FPS.
- **Secondary Head-Detection Model:** Replaced by existing COCO pose cranial keypoints 0–4 to preserve CPU compute headroom.
- **Face ID (InsightFace/ArcFace) trên luồng high-angle:** Không triển khai làm baseline do domain gap về pitch + độ phân giải; xem §2.5 cho cơ sở kỹ thuật và gating rule nếu thử nghiệm.