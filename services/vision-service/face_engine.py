import os
import cv2
import numpy as np
import logging
import threading
import requests
import math

logger = logging.getLogger(__name__)

# Attempt to import insightface
try:
    import insightface
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    INSIGHTFACE_AVAILABLE = False
    logger.warning("InsightFace is not installed. Face recognition will run in fallback simulation mode.")

class FaceQualityGate:
    """Quality Gate to ensure only clear, properly sized, unblurred faces are embedded/matched."""
    def __init__(self, min_size=32, min_blur=40.0, max_yaw=50.0, max_pitch=50.0):
        self.min_size = min_size
        self.min_blur = min_blur
        self.max_yaw = max_yaw
        self.max_pitch = max_pitch

    def estimate_blur(self, face_crop):
        if face_crop is None or face_crop.size == 0:
            return 0.0
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY) if len(face_crop.shape) == 3 else face_crop
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())

    def estimate_pose(self, kps):
        """Estimate approximate yaw and pitch angles from 5 facial landmarks.
        kps: 5 landmarks (left eye, right eye, nose, left mouth, right mouth)
        """
        if kps is None or len(kps) < 5:
            return 0.0, 0.0
        
        left_eye, right_eye, nose, left_mouth, right_mouth = kps[0], kps[1], kps[2], kps[3], kps[4]
        
        # Eye distance and center
        eye_dx = right_eye[0] - left_eye[0]
        eye_dy = right_eye[1] - left_eye[1]
        eye_dist = math.hypot(eye_dx, eye_dy)
        if eye_dist < 1e-3:
            return 0.0, 0.0
        eye_center = ((left_eye[0] + right_eye[0]) / 2.0, (left_eye[1] + right_eye[1]) / 2.0)
        
        # Nose offset from eye center (Yaw estimation)
        nose_dx = nose[0] - eye_center[0]
        yaw = float(np.clip((nose_dx / (eye_dist + 1e-5)) * 90.0, -90.0, 90.0))
        
        # Nose to mouth vertical distance (Pitch estimation)
        mouth_center_y = (left_mouth[1] + right_mouth[1]) / 2.0
        nose_dy = nose[1] - eye_center[1]
        mouth_dy = mouth_center_y - nose[1]
        pitch_ratio = nose_dy / (mouth_dy + 1e-5)
        pitch = float(np.clip((pitch_ratio - 1.0) * 45.0, -90.0, 90.0))
        
        return yaw, pitch

    def evaluate(self, frame, bbox, kps=None):
        """Evaluate face quality. Returns: (is_good, quality_score, blur_score, yaw, pitch)"""
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        
        fw, fh = x2 - x1, y2 - y1
        if fw < self.min_size or fh < self.min_size:
            return False, 0.1, 0.0, 0.0, 0.0
        
        face_crop = frame[y1:y2, x1:x2]
        blur_score = self.estimate_blur(face_crop)
        yaw, pitch = self.estimate_pose(kps)
        
        is_blurred = blur_score < self.min_blur
        is_extreme_pose = abs(yaw) > self.max_yaw or abs(pitch) > self.max_pitch
        
        # Compute normalized quality score [0.0 - 1.0]
        size_score = min(1.0, (fw * fh) / (120.0 * 120.0))
        blur_factor = min(1.0, blur_score / 150.0)
        pose_factor = max(0.0, 1.0 - (abs(yaw) + abs(pitch)) / 120.0)
        quality_score = round(0.4 * size_score + 0.35 * blur_factor + 0.25 * pose_factor, 2)
        
        is_good = (not is_blurred) and (not is_extreme_pose) and (quality_score >= 0.4)
        return is_good, quality_score, round(blur_score, 1), round(yaw, 1), round(pitch, 1)


class FaceEngine:
    """InsightFace ArcFace Engine with In-Memory NumPy Vector Index and Dynamic Sync."""
    def __init__(self, model_name="buffalo_s", strong_thresh=0.65, weak_thresh=0.50):
        self.model_name = model_name
        self.strong_thresh = strong_thresh
        self.weak_thresh = weak_thresh
        self.quality_gate = FaceQualityGate()
        self.app = None
        self.lock = threading.Lock()
        
        # In-memory vector matrix: shape (N, 512) normalized
        self.embedding_matrix = np.empty((0, 512), dtype=np.float32)
        self.metadata_list = [] # List of {member_id, name, role, face_id}
        
        self._init_model()

    def _init_model(self):
        if not INSIGHTFACE_AVAILABLE:
            return
        try:
            logger.info(f"Initializing InsightFace model pack: {self.model_name}...")
            self.app = FaceAnalysis(name=self.model_name, providers=['CPUExecutionProvider'])
            self.app.prepare(ctx_id=0, det_size=(320, 320))
            logger.info("InsightFace FaceAnalysis initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize InsightFace: {e}")
            self.app = None

    def load_embeddings(self, embedding_items):
        """Bulk load/replace in-memory embedding matrix."""
        with self.lock:
            vectors = []
            metas = []
            for item in embedding_items:
                emb = item.get("embedding")
                if emb and len(emb) == 512:
                    vec = np.array(emb, dtype=np.float32)
                    norm = np.linalg.norm(vec)
                    if norm > 1e-5:
                        vectors.append(vec / norm)
                        metas.append({
                            "member_id": item.get("member_id"),
                            "name": item.get("name", "Unknown"),
                            "role": item.get("role", "family"),
                            "face_id": item.get("face_id", "")
                        })
            
            if len(vectors) > 0:
                self.embedding_matrix = np.vstack(vectors)
                self.metadata_list = metas
                logger.info(f"Loaded {len(metas)} face embeddings into In-Memory RAM matrix.")
            else:
                self.embedding_matrix = np.empty((0, 512), dtype=np.float32)
                self.metadata_list = []
                logger.info("In-Memory embedding store is currently empty.")

    def extract_face_embeddings(self, frame, person_bbox=None):
        """Extract face detection, landmarks and 512D ArcFace embeddings from person crop or full frame."""
        if not INSIGHTFACE_AVAILABLE or self.app is None:
            return []

        h, w = frame.shape[:2]
        crop = frame
        offset_x, offset_y = 0, 0

        # If person bbox is provided, crop the upper 60% of person box to accelerate SCRFD
        if person_bbox is not None:
            px1 = max(0, int(person_bbox[0] * w))
            py1 = max(0, int(person_bbox[1] * h))
            px2 = min(w, int(person_bbox[2] * w))
            py2 = min(h, int(person_bbox[3] * h))
            
            # Head/upper body region (0% to 65% of person height)
            head_h = int((py2 - py1) * 0.65)
            crop_y2 = min(h, py1 + head_h)
            
            if (px2 - px1) > 20 and (crop_y2 - py1) > 20:
                crop = frame[py1:crop_y2, px1:px2]
                offset_x, offset_y = px1, py1

        try:
            faces = self.app.get(crop)
            results = []
            for face in faces:
                # Map bbox back to original frame coordinates
                fb = face.bbox
                fx1 = fb[0] + offset_x
                fy1 = fb[1] + offset_y
                fx2 = fb[2] + offset_x
                fy2 = fb[3] + offset_y
                
                kps = face.kps + np.array([offset_x, offset_y]) if face.kps is not None else None
                
                # Evaluate face quality
                is_good, q_score, blur, yaw, pitch = self.quality_gate.evaluate(frame, (fx1, fy1, fx2, fy2), kps)
                
                emb = face.embedding
                if emb is not None:
                    norm = np.linalg.norm(emb)
                    if norm > 1e-5:
                        emb = emb / norm
                
                results.append({
                    "bbox": (round(fx1/w, 4), round(fy1/h, 4), round(fx2/w, 4), round(fy2/h, 4)),
                    "embedding": emb,
                    "is_good": is_good,
                    "quality_score": q_score,
                    "blur_score": blur,
                    "yaw": yaw,
                    "pitch": pitch,
                    "det_score": float(face.det_score) if hasattr(face, "det_score") else 0.9
                })
            return results
        except Exception as e:
            logger.debug(f"Error in extract_face_embeddings: {e}")
            return []

    def match_embedding(self, query_embedding):
        """Fast Cosine Similarity matrix dot product search (<0.05ms) against all stored faces."""
        if query_embedding is None or len(self.metadata_list) == 0 or len(self.embedding_matrix) == 0:
            return None, "verifying", "verifying", 0.0

        with self.lock:
            # Query embedding is already normalized, stored embeddings are normalized
            # Cosine sim = Dot product
            sims = np.dot(self.embedding_matrix, query_embedding)
            best_idx = int(np.argmax(sims))
            best_score = float(sims[best_idx])
            best_meta = self.metadata_list[best_idx]

        if best_score >= self.strong_thresh:
            # Strong match: return member name and role
            role = best_meta.get("role", "family")
            return best_meta.get("member_id"), best_meta.get("name"), role, best_score
        elif best_score >= self.weak_thresh:
            # Weak match candidate for multi-frame aggregation
            role = best_meta.get("role", "family")
            return best_meta.get("member_id"), best_meta.get("name"), "verifying", best_score
        else:
            # Unknown / stranger candidate
            return None, "Người lạ", "stranger", best_score
