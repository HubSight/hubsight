import cv2

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
