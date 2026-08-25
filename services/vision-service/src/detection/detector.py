import os
import threading
import time
import logging

import numpy as np
import requests

from .byte_tracker import ByteTrack
from .motion_gate import MotionGate
from .track_identity import TrackIdentity
from .yolo_onnx import YOLOOnnxDetector
from src.recognition.face_engine import FaceEngine

logger = logging.getLogger(__name__)


class PersonDetector:
    def __init__(self, mq_client, face_engine=None, conf_threshold=0.45, iou_threshold=0.5, no_person_timeout=4.0):
        model_name = "yolo-cctv.onnx" if os.path.exists("yolo-cctv.onnx") else "yolo26n.onnx"
        # Keep a low ONNX floor so ByteTrack can associate weak detections; display still uses conf_threshold.
        self.detector = YOLOOnnxDetector(
            model_name,
            input_size=(384, 640),
            conf_thresh=min(0.1, conf_threshold),
            iou_thresh=iou_threshold,
        )
        self.mq_client = mq_client
        self.face_engine = face_engine or FaceEngine()
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.no_person_timeout = no_person_timeout
        # Custom CCTV weights use person(0), smoke(1), fire(2), weapon(3).
        # Stock yolo26n is COCO: 1/2/3 are bicycle/car/motorcycle — do not treat as danger.
        self.use_danger_classes = os.path.basename(model_name).startswith("yolo-cctv")
        self.danger_classes = {1: "smoke", 2: "fire", 3: "weapon"} if self.use_danger_classes else {}
        self.allowed_classes = {0} | set(self.danger_classes.keys())

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
                    "tracker": ByteTrack(
                        track_high_thresh=self.conf_threshold,
                        track_low_thresh=0.1,
                        match_thresh=0.5,
                        max_time_lost=15,
                    ),
                }
            return self.camera_states[camera_id]

    def process_frame(self, frame, camera_id="default", camera_name=""):
        cam = self._get_cam_state(camera_id)
        current_time = time.time()

        is_moving = cam["motion_gate"].has_motion(frame)
        person_present = cam["state"] == "PERSON_PRESENT"
        if not is_moving and not person_present:
            return False, []

        h, w = frame.shape[:2]
        dets = self.detector.detect(frame)
        if len(dets) > 0:
            cls_col = dets[:, 5].astype(np.int32)
            dets = dets[np.isin(cls_col, list(self.allowed_classes))]
        tracks = cam["tracker"].update(
            dets if len(dets) > 0 else np.empty((0, 6), dtype=np.float32),
            frame,
        )

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
                    self._send_notification(camera_id, camera_name, f"{danger_type}_detected", danger_type.upper(), "danger", "")
                continue

            if cls_id == 0:
                person_detected = True
                person_norm = (x1 / w, y1 / h, x2 / w, y2 / h)

                track_state_obj = None
                if track_id is not None:
                    active_track_ids.add(track_id)
                    if track_id not in cam["tracks"] or isinstance(cam["tracks"][track_id], float):
                        cam["tracks"][track_id] = TrackIdentity(track_id)
                    track_state_obj = cam["tracks"][track_id]
                    track_state_obj.last_seen = current_time

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
                                        if track_state_obj.state == "stranger":
                                            self._send_notification(
                                                camera_id, camera_name, "stranger_detected",
                                                track_state_obj.name or "Người lạ", "stranger", "",
                                            )

                state_cat = track_state_obj.state if track_state_obj else "verifying"
                name_label = track_state_obj.name if track_state_obj else ""
                role_label = track_state_obj.role if track_state_obj else ""

                boxes.append({
                    "x1": round(x1 / w, 4), "y1": round(y1 / h, 4),
                    "x2": round(x2 / w, 4), "y2": round(y2 / h, 4),
                    "confidence": conf, "track_id": track_id,
                    "state": state_cat, "name": name_label, "role": role_label,
                    "similarity": track_state_obj.best_similarity if track_state_obj else 0.0,
                })

        stale_tracks = [k for k, v in cam["tracks"].items() if (isinstance(v, TrackIdentity) and (current_time - v.last_seen) > 10.0)]
        for tid in stale_tracks:
            del cam["tracks"][tid]

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
                cam["last_boxes"] = []
                self._publish_state_change("vision.person.left", camera_id, cam["state"], [])
            elif cam["state"] == "PERSON_PRESENT":
                self._publish_state_change("vision.person.update", camera_id, cam["state"], cam["last_boxes"])

        return person_detected, boxes

    def _send_notification(self, camera_id, camera_name, n_type, name, role, member_id):
        try:
            payload = {
                "camera_id": str(camera_id),
                "camera_name": str(camera_name) if camera_name else f"Camera {camera_id}",
                "type": n_type,
                "name": name,
                "role": role,
                "member_id": str(member_id),
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
