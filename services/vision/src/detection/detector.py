import json
import math
import os
import threading
import time
import logging
from collections import deque

import cv2
import numpy as np
import requests

from .byte_tracker import ByteTrack
from .motion_gate import MotionGate
from .track_identity import TrackIdentity, FALL_STATE_DESCENDING, FALL_STATE_STILLNESS
from .fall_kinematics import (
    torso_angle_deg,
    head_anchor,
    classify_angle_profile,
    PROFILE_SAMPLE_SIZE,
)
from .danger_kinematics import DangerCandidateTracker, fire_hsv_pass, smoke_texture_pass
from .homography import LandmarkShiftChecker, compute_homography, parse_points
from .yolo_onnx import YOLOOnnxDetector
from .yolo_pose import YOLOPoseOnnxDetector
from src.recognition.face_engine import FaceEngine

logger = logging.getLogger(__name__)

FIRE_SMOKE_ONNX = "yolo-fire-smoke.onnx"
FIRE_SMOKE_NAMES = "yolo-fire-smoke.names.json"
FIRE_INFER_INTERVAL = 1.0
FIRE_CONF_THRESHOLD = 0.35

# §2.3 — angle-profile auto-estimation re-evaluation cadence.
PROFILE_REEVAL_INTERVAL_S = 4 * 3600
PROFILE_REEVAL_DET_COUNT = 1000
WALKING_MIN_SPEED = 0.05  # normalized height/s (§2.3.1)

# §6.1 — small-target degradation gate.
SMALL_TARGET_PX = 30

# §3.4 Signal 3 — track-loss recovery during a fall.
LOST_RECOVERY_DIST = 0.08
LOST_RECOVERY_IOU = 0.30
LOST_RECOVERY_WINDOW_S = 1.5

# §5.1 — IR / night-mode auto-detection.
IR_SAT_THRESHOLD = 0.08
IR_STREAK_FRAMES = 30
IR_FIRE_REQUIRES_SMOKE_WINDOW_S = 15.0


def _mean_saturation(frame) -> float:
    """§5.1 — cheap mean HSV saturation on a downscaled frame."""
    small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_NEAREST)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    return float(np.mean(hsv[:, :, 1])) / 255.0


def _normalize_danger_label(raw: str):
    label = (raw or "").strip().lower()
    if label in ("fire", "flame", "flames"):
        return "fire"
    if label in ("smoke", "smokes", "vapor"):
        return "smoke"
    return None


def _load_fire_class_map(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
    except Exception as exc:
        logger.warning("Failed to read %s: %s", path, exc)
        return {}
    mapping = {}
    for key, value in raw.items():
        danger = _normalize_danger_label(str(value))
        if danger is None:
            continue
        try:
            mapping[int(key)] = danger
        except (TypeError, ValueError):
            continue
    return mapping


def _box_iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _match_pose_kpts(track_xyxy, pose_boxes: np.ndarray, pose_kpts: np.ndarray):
    if pose_boxes is None or len(pose_boxes) == 0 or len(pose_kpts) == 0:
        return None
    best_i, best_iou = -1, 0.3
    for i, row in enumerate(pose_boxes):
        iou = _box_iou(track_xyxy, (float(row[0]), float(row[1]), float(row[2]), float(row[3])))
        if iou > best_iou:
            best_iou = iou
            best_i = i
    if best_i < 0 or best_i >= len(pose_kpts):
        return None
    return pose_kpts[best_i]


ALERT_TYPES = {
    "stranger_detected",
    "fire_detected",
    "smoke_detected",
    "weapon_detected",
    "fall_detected",
    "accident_detected",
    "suspicious",
}

TYPE_TO_NOTIF_ROLE = {
    "stranger_detected": "stranger",
    "fire_detected": "danger",
    "smoke_detected": "danger",
    "weapon_detected": "danger",
    "fall_detected": "fall",
    "accident_detected": "accident",
    "suspicious": "suspicious",
}

TYPE_TO_MESSAGE_KEY = {
    "member_identified": "log.memberIdentified",
    "stranger_detected": "log.strangerDetected",
    "fire_detected": "log.fireDetected",
    "smoke_detected": "log.smokeDetected",
    "weapon_detected": "log.weaponDetected",
    "fall_detected": "log.fallDetected",
    "accident_detected": "log.accidentDetected",
    "suspicious": "log.suspiciousLoitering",
}


class PersonDetector:
    def __init__(self, mq_client, face_engine=None, conf_threshold=0.45, iou_threshold=0.5, no_person_timeout=4.0):
        combined = os.path.exists("yolo-cctv.onnx")
        self.mq_client = mq_client
        self.face_engine = face_engine or FaceEngine()
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.no_person_timeout = no_person_timeout
        # Combined custom weights: person(0), smoke(1), fire(2), weapon(3).
        # Otherwise person+pose comes from yolo26n-pose; fire/smoke from a dedicated model.
        self.use_danger_classes = combined
        self.danger_classes = {1: "smoke", 2: "fire", 3: "weapon"} if combined else {}
        self.allowed_classes = {0} | set(self.danger_classes.keys())
        self.pose_detector = None
        self.detector = None
        if os.path.exists("yolo26n-pose.onnx"):
            self.pose_detector = YOLOPoseOnnxDetector(
                "yolo26n-pose.onnx",
                input_size=(384, 640),
                conf_thresh=min(0.1, conf_threshold),
                iou_thresh=iou_threshold,
            )
            logger.info("Pose fall detector enabled (yolo26n-pose.onnx)")
        else:
            model_name = "yolo-cctv.onnx" if combined else "yolo26n.onnx"
            self.detector = YOLOOnnxDetector(
                model_name,
                input_size=(384, 640),
                conf_thresh=min(0.1, conf_threshold),
                iou_thresh=iou_threshold,
            )
            logger.warning("yolo26n-pose.onnx not found — fall detection uses bbox aspect-ratio only")

        self.fire_detector = None
        self.fire_class_map = {}
        if not combined and os.path.exists(FIRE_SMOKE_ONNX):
            self.fire_detector = YOLOOnnxDetector(
                FIRE_SMOKE_ONNX,
                input_size=(384, 640),
                conf_thresh=min(0.1, FIRE_CONF_THRESHOLD),
                iou_thresh=iou_threshold,
            )
            self.fire_class_map = _load_fire_class_map(FIRE_SMOKE_NAMES)
            if not self.fire_class_map:
                self.fire_class_map = {0: "fire", 1: "smoke"}
            logger.info("Fire/smoke detector enabled (%s) classes=%s", FIRE_SMOKE_ONNX, self.fire_class_map)
        elif not combined:
            logger.warning("Fire/smoke model %s not found — danger classes disabled", FIRE_SMOKE_ONNX)

        self.camera_states = {}
        self._state_lock = threading.Lock()

    def _get_cam_state(self, camera_id):
        with self._state_lock:
            if camera_id not in self.camera_states:
                self.camera_states[camera_id] = {
                    "state": "NO_PERSON",
                    "last_person_time": 0,
                    "motion_gate": MotionGate(),
                    "last_boxes": [],
                    "tracks": {},  # track_id -> TrackIdentity
                    "last_danger_time": 0.0,
                    "last_fire_infer": 0.0,
                    # §2.3 — zero-calibration angle-profile estimator.
                    "angle_profile": "standard",
                    "angle_profile_evaluated_once": False,
                    "angle_profile_last_eval": 0.0,
                    "angle_profile_det_count": 0,
                    "ar_buffer": deque(maxlen=PROFILE_SAMPLE_SIZE),
                    # §5.1 — IR / night-mode auto-detection.
                    "ir_mode": False,
                    "ir_low_streak": 0,
                    "ir_high_streak": 0,
                    # §4 — fire/smoke candidate temporal verification.
                    "danger_tracker": DangerCandidateTracker(),
                    "last_confirmed_smoke_time": 0.0,
                    # §3.4 Signal 3 — track-loss recovery during a fall.
                    "last_pixel_box": {},
                    "lost_during_fall": {},
                    # §2.4 — opt-in ground-plane homography (fixed cameras only).
                    "is_fixed": False,
                    "homography_points": None,
                    "homography_matrix": None,
                    "homography_valid": True,
                    "landmark_checker": LandmarkShiftChecker(),
                    "tracker": ByteTrack(
                        track_high_thresh=self.conf_threshold,
                        track_low_thresh=0.1,
                        match_thresh=0.5,
                        max_time_lost=15,
                    ),
                }
            return self.camera_states[camera_id]

    def set_camera_calibration(self, camera_id, is_fixed, homography_points_json, homography_valid):
        """§2.4 — sync a fixed camera's calibration from core-service (gRPC poll /
        camera.updated MQ event). Only vision-service can decode frames, so it
        computes the actual homography matrix and re-arms the landmark checker."""
        cam = self._get_cam_state(camera_id)
        points = parse_points(homography_points_json) if is_fixed else None
        with self._state_lock:
            cam["is_fixed"] = bool(is_fixed)
            cam["homography_points"] = points
            cam["homography_matrix"] = compute_homography(points) if points is not None else None
            cam["homography_valid"] = bool(homography_valid) if is_fixed else True
            cam["landmark_checker"] = LandmarkShiftChecker()  # re-arm from the next frame

    def _invalidate_homography(self, camera_id):
        try:
            core_url = os.getenv("CORE_SERVICE_URL", "http://core-service:8080")
            headers = {}
            secret = os.getenv("M2M_SECRET")
            if secret:
                headers["X-Service-Key"] = secret
            requests.post(
                f"{core_url}/api/internal/cameras/{camera_id}/homography-invalidate",
                headers=headers, timeout=1.5,
            )
        except Exception as e:
            logger.error(f"Failed to invalidate homography for camera {camera_id}: {e}")

    def process_frame(self, frame, camera_id="default", camera_name=""):
        cam = self._get_cam_state(camera_id)
        current_time = time.time()

        is_moving = cam["motion_gate"].has_motion(frame)
        person_present = cam["state"] == "PERSON_PRESENT"
        run_fire = self.fire_detector is not None and (
            is_moving or (current_time - cam.get("last_fire_infer", 0.0) >= FIRE_INFER_INTERVAL)
        )
        if not is_moving and not person_present and not run_fire:
            return False, []

        h, w = frame.shape[:2]

        # §5.1 — IR / night-mode auto-detection (hysteresis over the low/high streaks).
        mean_sat = _mean_saturation(frame)
        if mean_sat < IR_SAT_THRESHOLD:
            cam["ir_low_streak"] = cam.get("ir_low_streak", 0) + 1
            cam["ir_high_streak"] = 0
        else:
            cam["ir_high_streak"] = cam.get("ir_high_streak", 0) + 1
            cam["ir_low_streak"] = 0
        if cam["ir_low_streak"] >= IR_STREAK_FRAMES:
            cam["ir_mode"] = True
        elif cam["ir_high_streak"] >= IR_STREAK_FRAMES:
            cam["ir_mode"] = False

        # §2.4 — opt-in homography shift-invalidation for fixed cameras only.
        if cam.get("is_fixed") and cam.get("homography_matrix") is not None:
            checker = cam["landmark_checker"]
            if checker.reference_patches is None:
                checker.arm(frame, cam["homography_points"])
            elif cam.get("homography_valid", True) and not checker.check(frame, current_time):
                cam["homography_valid"] = False
                logger.warning(
                    "[Camera %s] homography landmark shift detected — invalidating calibration",
                    camera_id,
                )
                self._invalidate_homography(camera_id)

        dets = np.empty((0, 6), dtype=np.float32)
        pose_kpts = np.empty((0, 17, 3), dtype=np.float32)
        if is_moving or person_present:
            if self.pose_detector is not None:
                dets, pose_kpts = self.pose_detector.detect_pose(frame)
            elif self.detector is not None:
                dets = self.detector.detect(frame)
            if len(dets) > 0:
                cls_col = dets[:, 5].astype(np.int32)
                keep = np.isin(cls_col, list(self.allowed_classes))
                dets = dets[keep]
                if len(pose_kpts) == keep.shape[0]:
                    pose_kpts = pose_kpts[keep]
        tracks = cam["tracker"].update(
            dets if len(dets) > 0 else np.empty((0, 6), dtype=np.float32),
            frame,
        )

        fire_dets = np.empty((0, 6), dtype=np.float32)
        if run_fire:
            cam["last_fire_infer"] = current_time
            fire_dets = self.fire_detector.detect(frame)

        person_detected = False
        boxes = []
        active_track_ids = set()

        for track in tracks:
            x1, y1, x2, y2, track_id, conf, cls_id, _ = track
            x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
            track_id = int(track_id)
            cls_id = int(cls_id)
            conf = round(float(conf), 2)

            if conf < self.conf_threshold:
                continue
            if cls_id not in self.allowed_classes:
                continue

            if cls_id in self.danger_classes:
                danger_type = self.danger_classes[cls_id]
                if self._danger_confirmed(frame, cam, w, h, x1, y1, x2, y2, danger_type, current_time) \
                        and not self._ir_fire_suppressed(cam, danger_type, current_time):
                    self._append_danger_box(
                        boxes, cam, camera_id, camera_name, current_time, w, h,
                        x1, y1, x2, y2, conf, track_id, danger_type,
                    )
                continue

            if cls_id == 0:
                person_detected = True
                person_norm = (x1 / w, y1 / h, x2 / w, y2 / h)
                nkpts = None
                angle = None

                track_state_obj = None
                if track_id is not None:
                    active_track_ids.add(track_id)
                    track_state_obj = self._get_or_recover_track(cam, track_id, (x1, y1, x2, y2), current_time, w)
                    cam["last_pixel_box"][track_id] = (x1, y1, x2, y2)
                    track_state_obj.last_seen = current_time
                    track_state_obj.update_pose_history(person_norm)

                    # §6.1 — small-target degradation: below this, keypoints collapse
                    # into noise, so pose-based fall detection is disabled entirely.
                    track_state_obj.resolution_tier = "low_res" if (y2 - y1) < SMALL_TARGET_PX else "normal"

                    kpts = _match_pose_kpts((x1, y1, x2, y2), dets, pose_kpts)
                    angle = None
                    nkpts = None
                    if kpts is not None and track_state_obj.resolution_tier != "low_res":
                        kp_conf = 0.20 if cam.get("ir_mode") else 0.30
                        angle = torso_angle_deg(kpts, min_conf=kp_conf)
                        nkpts = np.column_stack([
                            np.clip(kpts[:, 0] / w, 0, 1),
                            np.clip(kpts[:, 1] / h, 0, 1),
                            kpts[:, 2],
                        ]).tolist()
                        track_state_obj.keypoints = nkpts
                        # §2.2 — cranial head-anchor fallback when shoulders/hips are
                        # foreshortened or occluded (kept on the track for downstream use).
                        ha = head_anchor(kpts, kp_conf)
                        track_state_obj.head_anchor = (float(ha[0]) / w, float(ha[1]) / h) if ha is not None else None
                    else:
                        track_state_obj.keypoints = None
                        track_state_obj.head_anchor = None

                    self._update_angle_profile(cam, track_state_obj, current_time)

                    if (not track_state_obj.is_locked or (current_time - track_state_obj.last_face_infer) > 2.0):
                        if (current_time - track_state_obj.last_face_infer) >= 0.25:
                            track_state_obj.last_face_infer = current_time
                            face_results = self.face_engine.extract_face_embeddings(frame, person_norm)
                            if face_results:
                                best_face = max(face_results, key=lambda f: f.get("quality_score", 0))
                                if best_face.get("embedding") is not None:
                                    mid, name, role, sim = self.face_engine.match_embedding(best_face["embedding"])
                                    was_locked = track_state_obj.is_locked
                                    track_state_obj.update_match(mid, name, role, sim, best_face.get("is_good", False))

                                    if not was_locked and track_state_obj.is_locked:
                                        self._emit_identity_lock(camera_id, camera_name, track_state_obj)

                    fall_evt = track_state_obj.check_abnormal_behavior(
                        current_time, torso_angle=angle,
                        angle_profile=cam.get("angle_profile", "standard"),
                        ir_mode=cam.get("ir_mode", False),
                    )
                    if fall_evt == "fall_detected":
                        recent_danger = current_time - cam.get("last_danger_time", 0) <= 10.0
                        n_type = "accident_detected" if recent_danger else "fall_detected"
                        category = "risk" if recent_danger else "fall"
                        self._emit_event(
                            camera_id, camera_name,
                            n_type=n_type,
                            category=category,
                            name=track_state_obj.name or "",
                            member_id=track_state_obj.member_id or "",
                            track_id=track_id,
                        )

                    if track_state_obj.check_loitering(current_time):
                        self._emit_event(
                            camera_id, camera_name,
                            n_type="suspicious",
                            category="suspicious",
                            name=track_state_obj.name or "",
                            member_id=track_state_obj.member_id or "",
                            track_id=track_id,
                        )

                self._apply_gallery_label(track_state_obj)
                state_cat = track_state_obj.state if track_state_obj else "verifying"
                if track_state_obj and track_state_obj.is_fallen:
                    state_cat = "fall"
                name_label = track_state_obj.name if track_state_obj else ""
                role_label = track_state_obj.role if track_state_obj else ""

                label = name_label
                if track_state_obj and track_state_obj.is_fallen:
                    ang = track_state_obj.torso_angle
                    ang_s = f"{ang:.0f} deg" if ang is not None else ""
                    label = f"#{track_id} FALLEN" + (f" [{ang_s}]" if ang_s else "")
                boxes.append({
                    "x1": round(x1 / w, 4), "y1": round(y1 / h, 4),
                    "x2": round(x2 / w, 4), "y2": round(y2 / h, 4),
                    "confidence": conf, "track_id": track_id,
                    "state": state_cat, "name": label, "role": role_label,
                    "similarity": track_state_obj.best_similarity if track_state_obj else 0.0,
                    "angle_deg": round(track_state_obj.torso_angle, 1) if track_state_obj and track_state_obj.torso_angle is not None else None,
                    "keypoints": nkpts if track_state_obj else None,
                    "head_anchor": [round(float(v), 4) for v in track_state_obj.head_anchor] if track_state_obj and track_state_obj.head_anchor is not None else None,
                })

        # §3.4 Signal 3 — cache tracks that vanished mid-fall (motion blur / shape
        # deformation dropping ByteTrack's association) so a re-appearing detection
        # can inherit identity + fall state instead of restarting at UPRIGHT.
        last_pixel_boxes = cam["last_pixel_box"]
        for old_id in list(last_pixel_boxes.keys()):
            if old_id in active_track_ids:
                continue
            obj = cam["tracks"].get(old_id)
            if (
                isinstance(obj, TrackIdentity)
                and obj.fall_state in (FALL_STATE_DESCENDING, FALL_STATE_STILLNESS)
                and old_id not in cam["lost_during_fall"]
            ):
                cam["lost_during_fall"][old_id] = (obj, last_pixel_boxes[old_id], current_time)
            del last_pixel_boxes[old_id]
        cam["lost_during_fall"] = {
            k: v for k, v in cam["lost_during_fall"].items()
            if current_time - v[2] <= LOST_RECOVERY_WINDOW_S
        }

        stale_tracks = [k for k, v in cam["tracks"].items() if (isinstance(v, TrackIdentity) and (current_time - v.last_seen) > 10.0)]
        for tid in stale_tracks:
            del cam["tracks"][tid]

        had_danger = False
        if len(fire_dets) > 0:
            for row in fire_dets:
                fx1, fy1, fx2, fy2, fconf, fcls = row.tolist()
                if fconf < FIRE_CONF_THRESHOLD:
                    continue
                danger_type = self.fire_class_map.get(int(fcls))
                if not danger_type:
                    continue
                if not self._danger_confirmed(frame, cam, w, h, fx1, fy1, fx2, fy2, danger_type, current_time):
                    continue
                if self._ir_fire_suppressed(cam, danger_type, current_time):
                    continue
                had_danger = True
                self._append_danger_box(
                    boxes, cam, camera_id, camera_name, current_time, w, h,
                    fx1, fy1, fx2, fy2, round(float(fconf), 2), 0, danger_type,
                )

        if person_detected:
            cam["last_person_time"] = current_time
            cam["last_boxes"] = boxes
            if cam["state"] == "NO_PERSON":
                cam["state"] = "PERSON_PRESENT"
                self._publish_state_change("vision.person.entered", camera_id, cam["state"], boxes)
            else:
                self._publish_state_change("vision.person.update", camera_id, cam["state"], boxes)
        else:
            if cam["state"] == "PERSON_PRESENT" and (current_time - cam["last_person_time"]) > self.no_person_timeout:
                cam["state"] = "NO_PERSON"
                cam["last_boxes"] = boxes if had_danger else []
                self._publish_state_change(
                    "vision.person.left" if not had_danger else "vision.person.update",
                    camera_id,
                    cam["state"],
                    cam["last_boxes"],
                )
            elif cam["state"] == "PERSON_PRESENT":
                merged = list(cam.get("last_boxes") or [])
                if had_danger:
                    merged = [b for b in merged if b.get("role") != "danger"] + [b for b in boxes if b.get("role") == "danger"]
                    cam["last_boxes"] = merged
                self._publish_state_change("vision.person.update", camera_id, cam["state"], cam["last_boxes"])
            elif had_danger:
                cam["last_boxes"] = [b for b in boxes if b.get("role") == "danger"]
                self._publish_state_change("vision.person.update", camera_id, cam["state"], cam["last_boxes"])
            elif cam.get("last_boxes"):
                cam["last_boxes"] = []
                self._publish_state_change("vision.person.update", camera_id, cam["state"], [])

        return person_detected, boxes

    def _get_or_recover_track(self, cam, track_id, pixel_box, current_time, frame_w):
        """§3.4 Signal 3 — reuse an in-progress fall's identity if this "new" track_id
        is really the same person after a brief ByteTrack ID loss during the fall."""
        existing = cam["tracks"].get(track_id)
        if isinstance(existing, TrackIdentity):
            return existing

        recovered, recovered_key = None, None
        for old_id, (cached_obj, cached_box, lost_ts) in cam["lost_during_fall"].items():
            if current_time - lost_ts > LOST_RECOVERY_WINDOW_S:
                continue
            cx1, cy1, cx2, cy2 = cached_box
            px1, py1, px2, py2 = pixel_box
            centroid_dist = math.hypot(
                ((cx1 + cx2) / 2.0) - ((px1 + px2) / 2.0),
                ((cy1 + cy2) / 2.0) - ((py1 + py2) / 2.0),
            ) / max(1.0, frame_w)
            if centroid_dist <= LOST_RECOVERY_DIST and _box_iou(cached_box, pixel_box) > LOST_RECOVERY_IOU:
                recovered, recovered_key = cached_obj, old_id
                break

        if recovered is not None:
            del cam["lost_during_fall"][recovered_key]
            logger.info("[Track %s] recovered identity from lost track %s mid-fall", track_id, recovered_key)
            recovered.track_id = track_id
            cam["tracks"][track_id] = recovered
            return recovered

        new_obj = TrackIdentity(track_id)
        cam["tracks"][track_id] = new_obj
        return new_obj

    def _update_angle_profile(self, cam, track_state_obj, current_time):
        """§2.3 — zero-calibration angle-profile estimator (median AR over walking tracks)."""
        if track_state_obj.resolution_tier == "low_res" or len(track_state_obj.box_history) < 3:
            return
        t0, b0, _ = track_state_obj.box_history[0]
        t1, b1, ar1 = track_state_obj.box_history[-1]
        dt = t1 - t0
        if dt < 0.3:
            return
        disp = math.hypot(((b1[0] + b1[2]) / 2.0) - ((b0[0] + b0[2]) / 2.0), ((b1[1] + b1[3]) / 2.0) - ((b0[1] + b0[3]) / 2.0))
        if (disp / dt) <= WALKING_MIN_SPEED:
            return

        cam["ar_buffer"].append(ar1)
        cam["angle_profile_det_count"] += 1
        if len(cam["ar_buffer"]) < PROFILE_SAMPLE_SIZE:
            return
        due = (
            not cam["angle_profile_evaluated_once"]
            or (current_time - cam["angle_profile_last_eval"]) >= PROFILE_REEVAL_INTERVAL_S
            or cam["angle_profile_det_count"] >= PROFILE_REEVAL_DET_COUNT
        )
        if not due:
            return
        median_ar = float(np.median(cam["ar_buffer"]))
        new_profile = classify_angle_profile(median_ar)
        if new_profile != cam["angle_profile"]:
            logger.info(
                "[Camera %s] angle_profile -> %s (median AR=%.2f, n=%d)",
                track_state_obj.track_id, new_profile, median_ar, len(cam["ar_buffer"]),
            )
        cam["angle_profile"] = new_profile
        cam["angle_profile_evaluated_once"] = True
        cam["angle_profile_last_eval"] = current_time
        cam["angle_profile_det_count"] = 0

    def _danger_confirmed(self, frame, cam, w, h, x1, y1, x2, y2, danger_type, current_time) -> bool:
        """§4.2/§4.3 — HSV/texture visual gate + temporal persistence/growth verification."""
        ix1, iy1 = max(0, int(x1)), max(0, int(y1))
        ix2, iy2 = min(w, int(x2)), min(h, int(y2))
        crop = frame[iy1:iy2, ix1:ix2] if ix2 > ix1 and iy2 > iy1 else None
        if danger_type == "fire":
            visual_pass = fire_hsv_pass(crop)
        elif danger_type == "smoke":
            visual_pass = smoke_texture_pass(crop)
        else:
            visual_pass = False
        candidate = cam["danger_tracker"].observe(danger_type, (x1, y1, x2, y2), current_time, visual_pass)
        confirmed = cam["danger_tracker"].evaluate(danger_type, candidate, current_time)
        if danger_type == "smoke" and confirmed:
            cam["last_confirmed_smoke_time"] = current_time
        return confirmed

    def _ir_fire_suppressed(self, cam, danger_type, current_time) -> bool:
        """§5.2.1 — in IR mode, standalone fire needs a co-occurring growing smoke plume."""
        if danger_type != "fire" or not cam.get("ir_mode"):
            return False
        return (current_time - cam.get("last_confirmed_smoke_time", 0.0)) > IR_FIRE_REQUIRES_SMOKE_WINDOW_S

    def _append_danger_box(self, boxes, cam, camera_id, camera_name, current_time, w, h, x1, y1, x2, y2, conf, track_id, danger_type):
        boxes.append({
            "x1": round(x1 / w, 4), "y1": round(y1 / h, 4),
            "x2": round(x2 / w, 4), "y2": round(y2 / h, 4),
            "confidence": conf, "track_id": track_id or 0,
            "state": "danger", "name": danger_type.upper(), "role": "danger", "similarity": 1.0,
        })
        danger_key = f"danger_{danger_type}"
        last_alert = cam["tracks"].get(danger_key, 0) if isinstance(cam["tracks"].get(danger_key), float) else 0
        if current_time - last_alert > 10.0:
            cam["tracks"][danger_key] = current_time
            cam["last_danger_time"] = current_time
            self._emit_event(
                camera_id, camera_name,
                n_type=f"{danger_type}_detected",
                category="risk",
                name=danger_type.upper(),
                member_id="",
                track_id=track_id or 0,
            )

    def _apply_gallery_label(self, track):
        if not track or not track.member_id or not self.face_engine:
            return
        info = self.face_engine.label_for(track.member_id)
        if not info:
            return
        name = info.get("name") or track.name
        role = info.get("role") or track.role or "family"
        if role in ("verifying", "stranger", ""):
            role = "family"
        track.name = name
        track.role = role
        if track.is_locked and track.state not in ("fall",):
            track.state = "family" if role == "family" else "guest"

    def refresh_locked_identities(self):
        """Re-apply gallery names after a member rename / embedding reload."""
        with self._state_lock:
            for cam in self.camera_states.values():
                tracks = cam.get("tracks") or {}
                for track in tracks.values():
                    if isinstance(track, TrackIdentity):
                        self._apply_gallery_label(track)
                for box in cam.get("last_boxes") or []:
                    t = tracks.get(box.get("track_id"))
                    if not t:
                        continue
                    box["name"] = t.name
                    box["role"] = t.role
                    if t.is_fallen:
                        box["state"] = "fall"
                    else:
                        box["state"] = t.state

    def _emit_identity_lock(self, camera_id, camera_name, track):
        if track.state == "stranger":
            self._emit_event(
                camera_id, camera_name,
                n_type="stranger_detected",
                category="stranger",
                name=track.name or "Người lạ",
                member_id="",
                track_id=track.track_id,
            )
            return
        if track.state == "family":
            self._emit_event(
                camera_id, camera_name,
                n_type="member_identified",
                category="member",
                name=track.name or "",
                member_id=track.member_id or "",
                track_id=track.track_id,
            )
            return
        if track.state == "guest":
            self._emit_event(
                camera_id, camera_name,
                n_type="member_identified",
                category="guest",
                name=track.name or "",
                member_id=track.member_id or "",
                track_id=track.track_id,
                message_key="log.guestIdentified",
            )

    def _emit_event(self, camera_id, camera_name, n_type, category, name, member_id, track_id, message_key=None):
        cam_label = str(camera_name) if camera_name else f"Camera {camera_id}"
        key = message_key or TYPE_TO_MESSAGE_KEY.get(n_type, "log.strangerDetected")
        params = {"name": str(name or ""), "camera": cam_label, "detail": n_type}
        self._ingest_log(camera_id, cam_label, n_type, category, member_id, track_id, key, params)
        if n_type in ALERT_TYPES:
            role = TYPE_TO_NOTIF_ROLE.get(n_type, "system")
            self._send_notification(camera_id, cam_label, n_type, name or n_type, role, member_id)

    def _ingest_log(self, camera_id, camera_name, n_type, category, member_id, track_id, message_key, params):
        try:
            payload = {
                "camera_id": str(camera_id),
                "camera_name": str(camera_name),
                "type": n_type,
                "category": category,
                "member_id": str(member_id) if member_id else "",
                "track_id": int(track_id) if track_id else 0,
                "message_key": message_key,
                "message_params": params or {},
            }
            core_url = os.getenv("CORE_SERVICE_URL", "http://core-service:8080")
            requests.post(f"{core_url}/api/internal/recognition-logs/ingest", json=payload, timeout=1.5)
        except Exception as e:
            logger.error(f"Failed to ingest recognition log: {e}")

    def _send_notification(self, camera_id, camera_name, n_type, name, role, member_id):
        try:
            payload = {
                "camera_id": str(camera_id),
                "camera_name": str(camera_name) if camera_name else f"Camera {camera_id}",
                "type": n_type,
                "name": name,
                "role": role,
                "member_id": str(member_id) if member_id else "",
                "thumbnail_url": "",
            }
            core_url = os.getenv("CORE_SERVICE_URL", "http://core-service:8080")
            requests.post(f"{core_url}/api/internal/notifications/ingest", json=payload, timeout=1.5)
        except Exception as e:
            logger.error(f"Failed to ingest notification: {e}")

    def _publish_state_change(self, event, camera_id, state, boxes):
        payload = {
            "timestamp": int(time.time() * 1000),
            "camera_id": camera_id,
            "state": state,
            "boxes": boxes,
        }
        self.mq_client.publish_event(event, payload)
