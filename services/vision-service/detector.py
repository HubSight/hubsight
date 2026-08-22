import cv2
import numpy as np
from ultralytics import YOLO
import logging
import time

logger = logging.getLogger(__name__)

class MotionGate:
    """Lightweight (<0.3ms) motion pre-filter using frame differencing on downscaled image."""
    def __init__(self, min_motion_pixels=200):
        self.prev_gray = None
        self.min_motion_pixels = min_motion_pixels

    def has_motion(self, frame):
        # Downscale to 160x90 for sub-millisecond motion analysis
        small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_NEAREST)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)

        if self.prev_gray is None:
            self.prev_gray = gray
            return True

        # Frame absolute difference
        diff = cv2.absdiff(self.prev_gray, gray)
        _, thresh = cv2.threshold(diff, 20, 255, cv2.THRESH_BINARY)
        motion_count = cv2.countNonZero(thresh)
        self.prev_gray = gray

        return motion_count >= self.min_motion_pixels


class PersonDetector:
    def __init__(self, mq_client, conf_threshold=0.45, iou_threshold=0.5, no_person_timeout=5.0):
        self.model = YOLO('yolo11n.pt')
        self.mq_client = mq_client
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.no_person_timeout = no_person_timeout
        
        # State machine per camera: cam_id -> {'state', 'last_person_time', 'motion_gate', 'last_boxes'}
        self.camera_states = {}

    def _get_cam_state(self, camera_id):
        if camera_id not in self.camera_states:
            self.camera_states[camera_id] = {
                'state': 'NO_PERSON',
                'last_person_time': 0,
                'motion_gate': MotionGate(),
                'last_boxes': []
            }
        return self.camera_states[camera_id]

    def process_frame(self, frame, camera_id="default"):
        cam = self._get_cam_state(camera_id)
        current_time = time.time()
        
        # 1. Motion Pre-filter Gate:
        # If no motion is detected AND no person was recently tracked, skip expensive YOLO inference (saves 70-80% CPU)
        is_moving = cam['motion_gate'].has_motion(frame)
        person_present = cam['state'] == 'PERSON_PRESENT'
        
        # Only run YOLO if there is motion OR if a person is currently tracked (to maintain tracking continuity)
        if not is_moving and not person_present:
            return False, []

        # 2. Optimized YOLO11 Tracking:
        # - classes=[0]: Filter only 'person' (drops 79 irrelevant classes, boosting NMS speed and accuracy)
        # - imgsz=(384, 640): Native 16:9 aspect ratio (eliminates black letterbox padding, increases effective resolution)
        # - persist=True + tracker="bytetrack.yaml": ByteTrack temporal smoothing across frames
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
        
        for result in results:
            orig_shape = result.orig_shape
            h, w = orig_shape
            
            for box in result.boxes:
                if int(box.cls[0]) == 0 and float(box.conf[0]) >= self.conf_threshold:
                    person_detected = True
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    track_id = int(box.id[0]) if box.id is not None else None
                    
                    boxes.append({
                        "x1": round(x1 / w, 4),
                        "y1": round(y1 / h, 4),
                        "x2": round(x2 / w, 4),
                        "y2": round(y2 / h, 4),
                        "confidence": round(float(box.conf[0]), 2),
                        "track_id": track_id
                    })
        
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
                # During brief tracking occlusions, keep broadcasting last known state
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
