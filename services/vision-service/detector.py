import cv2
import numpy as np
from ultralytics import YOLO
import logging
import time
from collections import defaultdict
from face_engine import FaceEngine

logger = logging.getLogger(__name__)

class MotionGate:
    """Lightweight (<0.3ms) motion pre-filter using frame differencing on downscaled image."""
    def __init__(self, min_motion_pixels=200):
        self.prev_gray = None
        self.min_motion_pixels = min_motion_pixels

    def has_motion(self, frame):
        small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_NEAREST)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)

        if self.prev_gray is None:
            self.prev_gray = gray
            return True

        diff = cv2.absdiff(self.prev_gray, gray)
        _, thresh = cv2.threshold(diff, 20, 255, cv2.THRESH_BINARY)
        motion_count = cv2.countNonZero(thresh)
        self.prev_gray = gray

        return motion_count >= self.min_motion_pixels


class TrackIdentity:
    """Tracks identity state across time using multi-frame consensus."""
    def __init__(self, track_id):
        self.track_id = track_id
        self.created_at = time.time()
        self.last_seen = time.time()
        self.last_face_infer = 0.0
        
        # State: 'verifying' (gray), 'family' (green), 'guest' (blue), 'stranger' (red)
        self.state = "verifying"
        self.name = ""
        self.role = ""
        self.member_id = None
        self.confidence = 0.0
        self.best_similarity = 0.0
        
        # Consensus buffer: list of (member_id, name, role, score, is_good)
        self.match_history = []
        self.good_eval_count = 0
        self.is_locked = False

    def update_match(self, member_id, name, role, similarity, is_good):
        self.last_seen = time.time()
        if is_good:
            self.good_eval_count += 1
            self.match_history.append((member_id, name, role, similarity))

        if self.is_locked:
            return

        # Multi-frame consensus algorithm:
        # 1. Count votes for specific members
        member_votes = defaultdict(list)
        for mid, mname, mrole, sim in self.match_history:
            if mid is not None and sim >= 0.58:
                member_votes[mid].append((mname, mrole, sim))

        # Check if any member has >= 2 strong matches
        for mid, votes in member_votes.items():
            if len(votes) >= 2:
                best_sim = max(v[2] for v in votes)
                self.member_id = mid
                self.name = votes[0][0]
                self.role = votes[0][1] # 'family', 'guest', 'neighbor', 'staff'
                self.best_similarity = round(best_sim, 2)
                
                # Map role to 4-color visual category
                if self.role == "family":
                    self.state = "family" # Green (#10b981)
                else:
                    self.state = "guest"  # Blue (#3b82f6)
                self.is_locked = True
                logger.info(f"[Track {self.track_id}] LOCKED identity: {self.name} ({self.role}) with score {best_sim:.2f}")
                return

        # If >= 4 good evaluations with no candidate match above 0.45 -> Stranger
        if self.good_eval_count >= 4 and len(member_votes) == 0:
            self.state = "stranger" # Red (#ef4444)
            self.name = "Người lạ"
            self.role = "stranger"
            self.is_locked = True
            logger.info(f"[Track {self.track_id}] LOCKED identity: STRANGER after {self.good_eval_count} clear frames")


class PersonDetector:
    def __init__(self, mq_client, face_engine=None, conf_threshold=0.45, iou_threshold=0.5, no_person_timeout=4.0):
        self.model = YOLO('yolo26n.pt')
        self.mq_client = mq_client
        self.face_engine = face_engine or FaceEngine()
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.no_person_timeout = no_person_timeout
        
        # State machine per camera: cam_id -> {'state', 'last_person_time', 'motion_gate', 'last_boxes', 'tracks'}
        self.camera_states = {}

    def _get_cam_state(self, camera_id):
        if camera_id not in self.camera_states:
            self.camera_states[camera_id] = {
                'state': 'NO_PERSON',
                'last_person_time': 0,
                'motion_gate': MotionGate(),
                'last_boxes': [],
                'tracks': {} # track_id -> TrackIdentity
            }
        return self.camera_states[camera_id]

    def process_frame(self, frame, camera_id="default"):
        cam = self._get_cam_state(camera_id)
        current_time = time.time()
        
        # 1. Motion Pre-filter Gate:
        is_moving = cam['motion_gate'].has_motion(frame)
        person_present = cam['state'] == 'PERSON_PRESENT'
        
        if not is_moving and not person_present:
            return False, []

        # 2. Optimized YOLO Person Tracking with ByteTrack
        results = self.model.track(
            source=frame,
            classes=[0],
            imgsz=(384, 640),
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False
        )
        
        person_detected = False
        boxes = []
        active_track_ids = set()
        
        for result in results:
            orig_shape = result.orig_shape
            h, w = orig_shape
            
            for box in result.boxes:
                if int(box.cls[0]) == 0 and float(box.conf[0]) >= self.conf_threshold:
                    person_detected = True
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    track_id = int(box.id[0]) if box.id is not None else None
                    conf = round(float(box.conf[0]), 2)
                    
                    person_norm = (x1/w, y1/h, x2/w, y2/h)
                    
                    track_state_obj = None
                    if track_id is not None:
                        active_track_ids.add(track_id)
                        if track_id not in cam['tracks']:
                            cam['tracks'][track_id] = TrackIdentity(track_id)
                        track_state_obj = cam['tracks'][track_id]
                        track_state_obj.last_seen = current_time

                        # Run Face Recognition at 3 FPS per track if not yet locked
                        if (not track_state_obj.is_locked or (current_time - track_state_obj.last_face_infer) > 2.0):
                            if (current_time - track_state_obj.last_face_infer) >= 0.25:
                                track_state_obj.last_face_infer = current_time
                                face_results = self.face_engine.extract_face_embeddings(frame, person_norm)
                                if face_results:
                                    # Pick the best face in this person box
                                    best_face = max(face_results, key=lambda f: f.get("quality_score", 0))
                                    if best_face.get("embedding") is not None:
                                        mid, name, role, sim = self.face_engine.match_embedding(best_face["embedding"])
                                        was_locked = track_state_obj.is_locked
                                        track_state_obj.update_match(mid, name, role, sim, best_face.get("is_good", False))
                                        
                                        # When identity is freshly locked, trigger notification.new event
                                        if not was_locked and track_state_obj.is_locked:
                                            if track_state_obj.state == "stranger":
                                                self.mq_client.publish_event("notification.new", {
                                                    "camera_id": camera_id,
                                                    "type": "stranger_detected",
                                                    "title": "⚠️ Cảnh báo: Phát hiện người lạ",
                                                    "body": f"Phát hiện người chưa xác định tại camera",
                                                    "category": "stranger",
                                                    "member_id": "",
                                                    "is_read": False,
                                                    "timestamp": int(time.time() * 1000)
                                                })
                                            else:
                                                title_text = f"👤 {track_state_obj.name} đã về nhà" if track_state_obj.role == "family" else f"👤 {track_state_obj.name} vừa đến"
                                                self.mq_client.publish_event("notification.new", {
                                                    "camera_id": camera_id,
                                                    "type": "person_identified",
                                                    "title": title_text,
                                                    "body": f"Nhận diện {track_state_obj.name} ({track_state_obj.role})",
                                                    "category": "family" if track_state_obj.role == "family" else "guest",
                                                    "member_id": track_state_obj.member_id or "",
                                                    "is_read": False,
                                                    "timestamp": int(time.time() * 1000)
                                                })

                    # Format box metadata
                    state_cat = track_state_obj.state if track_state_obj else "verifying"
                    name_label = track_state_obj.name if track_state_obj else ""
                    role_label = track_state_obj.role if track_state_obj else ""
                    
                    boxes.append({
                        "x1": round(x1 / w, 4),
                        "y1": round(y1 / h, 4),
                        "x2": round(x2 / w, 4),
                        "y2": round(y2 / h, 4),
                        "confidence": conf,
                        "track_id": track_id,
                        "state": state_cat,    # 'family' (green), 'guest' (blue), 'verifying' (gray), 'stranger' (red)
                        "name": name_label,     # Member display name or 'Người lạ'
                        "role": role_label,     # 'family', 'guest', 'neighbor', 'staff', 'stranger'
                        "similarity": track_state_obj.best_similarity if track_state_obj else 0.0
                    })
        
        # Clean up stale tracks older than 10 seconds
        stale_tracks = [tid for tid, tobj in cam['tracks'].items() if (current_time - tobj.last_seen) > 10.0]
        for tid in stale_tracks:
            del cam['tracks'][tid]

        if person_detected:
            cam['last_person_time'] = current_time
            cam['last_boxes'] = boxes
            if cam['state'] == 'NO_PERSON':
                cam['state'] = 'PERSON_PRESENT'
                self._publish_state_change('vision.person.entered', camera_id, cam['state'], boxes)
            else:
                self._publish_state_change('vision.person.update', camera_id, cam['state'], boxes)
        else:
            if cam['state'] == 'PERSON_PRESENT' and (current_time - cam['last_person_time']) > self.no_person_timeout:
                cam['state'] = 'NO_PERSON'
                cam['last_boxes'] = []
                self._publish_state_change('vision.person.left', camera_id, cam['state'], [])
            elif cam['state'] == 'PERSON_PRESENT':
                self._publish_state_change('vision.person.update', camera_id, cam['state'], cam['last_boxes'])
                
        return person_detected, boxes

    def _publish_state_change(self, event, camera_id, state, boxes):
        payload = {
            "timestamp": int(time.time() * 1000),
            "camera_id": camera_id,
            "state": state,
            "boxes": boxes
        }
        self.mq_client.publish_event(event, payload)
