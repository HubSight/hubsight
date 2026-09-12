import cv2
import numpy as np
import math

class FaceQualityGate:
    """Quality Gate to ensure only clear, properly sized, unblurred faces are embedded/matched."""
    # max_pitch=30: published overhead/CCTV face-recognition studies show accuracy
    # falling off sharply past ~30 deg pitch (near-frontal ArcFace training data has
    # little pitch variation), so this runs recognition on every camera regardless of
    # mount angle but rejects pitched-down frames before they can produce an
    # unreliable match rather than silently degrading confidence.
    def __init__(self, min_size=32, min_blur=40.0, max_yaw=50.0, max_pitch=30.0):
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
