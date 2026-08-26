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

from .face_quality_gate import FaceQualityGate



class FaceEngine:
    """InsightFace ArcFace Engine with In-Memory NumPy Vector Index and Dynamic Sync."""
    def __init__(self, model_name="buffalo_s", strong_thresh=0.58, weak_thresh=0.45):
        self.model_name = model_name
        self.strong_thresh = strong_thresh
        self.weak_thresh = weak_thresh
        self.quality_gate = FaceQualityGate()
        self.app = None
        self.lock = threading.Lock()
        self.infer_lock = threading.Lock()
        
        # In-memory vector matrix: shape (N, 512) normalized
        self.embedding_matrix = np.empty((0, 512), dtype=np.float32)
        self.metadata_list = [] # List of {member_id, name, role, face_id}
        self.members = {}  # member_id -> {name, role}
        
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
            
            members = {}
            for meta in metas:
                mid = meta.get("member_id")
                if mid:
                    members[mid] = {"name": meta.get("name", "Unknown"), "role": meta.get("role", "family")}
            self.members = members
            if len(vectors) > 0:
                self.embedding_matrix = np.vstack(vectors)
                self.metadata_list = metas
                logger.info(f"Loaded {len(metas)} face embeddings into In-Memory RAM matrix ({len(members)} members).")
            else:
                self.embedding_matrix = np.empty((0, 512), dtype=np.float32)
                self.metadata_list = []
                logger.info("In-Memory embedding store is currently empty.")

    def label_for(self, member_id):
        """Current gallery name/role for a member_id, or None."""
        if not member_id:
            return None
        with self.lock:
            info = self.members.get(member_id)
            return dict(info) if info else None

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
            with self.infer_lock:
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

        role = best_meta.get("role") or "family"
        if role in ("verifying", "stranger"):
            role = "family"
        if best_score >= self.strong_thresh:
            return best_meta.get("member_id"), best_meta.get("name"), role, best_score
        if best_score >= self.weak_thresh:
            # Keep the real gallery role so two weak frames can lock family/guest, not "verifying".
            return best_meta.get("member_id"), best_meta.get("name"), role, best_score
        return None, "Người lạ", "stranger", best_score
