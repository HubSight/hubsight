from ultralytics import YOLO
import logging
import time

logger = logging.getLogger(__name__)

class PersonDetector:
    def __init__(self, mq_client, conf_threshold=0.5, no_person_timeout=5.0):
        self.model = YOLO('yolo11n.pt')
        self.mq_client = mq_client
        self.conf_threshold = conf_threshold
        self.no_person_timeout = no_person_timeout
        
        # State machine
        self.state = 'NO_PERSON'
        self.last_person_time = 0
        
    def process_frame(self, frame, camera_id="default"):
        # Run YOLO inference
        results = self.model(frame, stream=False, verbose=False)
        
        person_detected = False
        boxes = []
        
        for result in results:
            # Get original image shape (height, width)
            orig_shape = result.orig_shape
            h, w = orig_shape
            
            for box in result.boxes:
                # Class 0 in COCO is 'person'
                if int(box.cls[0]) == 0 and float(box.conf[0]) >= self.conf_threshold:
                    person_detected = True
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    boxes.append({
                        "x1": round(x1 / w, 4),
                        "y1": round(y1 / h, 4),
                        "x2": round(x2 / w, 4),
                        "y2": round(y2 / h, 4),
                        "confidence": round(float(box.conf[0]), 2)
                    })
        
        current_time = time.time()
        
        if person_detected:
            self.last_person_time = current_time
            if self.state == 'NO_PERSON':
                self.state = 'PERSON_PRESENT'
                self._publish_state_change('vision.person.entered', camera_id, boxes)
            else:
                # Publish update so frontend can track moving bounding boxes continuously
                self._publish_state_change('vision.person.update', camera_id, boxes)
        else:
            if self.state == 'PERSON_PRESENT' and (current_time - self.last_person_time) > self.no_person_timeout:
                self.state = 'NO_PERSON'
                self._publish_state_change('vision.person.left', camera_id, [])
                
        return person_detected, boxes

    def _publish_state_change(self, event, camera_id, boxes):
        payload = {
            "timestamp": int(time.time() * 1000),
            "camera_id": camera_id,
            "state": self.state,
            "boxes": boxes
        }
        self.mq_client.publish_event(event, payload)
