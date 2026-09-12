import os
import cv2
import time
import threading
import logging

logger = logging.getLogger(__name__)

class StreamManager:
    """Manages 24/7 background AI processing stream worker threads for cameras."""
    def __init__(self, detector, media_rtsp_base, webrtc_api_url, process_fps=0):
        self.detector = detector
        self.media_rtsp_base = media_rtsp_base
        self.webrtc_api_url = webrtc_api_url
        self.process_fps = process_fps
        self.active_streams = {}  # cam_id -> {'thread': t, 'stop_event': e, 'host': url, 'name': name}

    def ensure_media_stream(self, cam_id, rtsp_url):
        # Connection #0 (cam_{id}_cv) is owned by pool-service (640p / 10FPS / no audio).
        # Vision must not PUT/overwrite that profile.
        return

    def remove_media_stream(self, cam_id):
        # Pool-service unregisters Connection #0 when AI is disabled. Do not DELETE here.
        return

    def _stream_worker(self, cam_id, cam_name, rtsp_url, stop_event):
        self.ensure_media_stream(cam_id, rtsp_url)
        media_cv_url = f"{self.media_rtsp_base}/cam_{cam_id}_cv"
        logger.info(f"[{cam_id} - {cam_name}] Starting background AI processing thread (Connection #0: {media_cv_url})")
        
        frame_interval = 1.0 / self.process_fps if self.process_fps > 0 else 0
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        
        while not stop_event.is_set():
            cap = None
            for attempt in range(4):
                cap = cv2.VideoCapture(media_cv_url)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                if cap.isOpened():
                    break
                cap.release()
                cap = None
                time.sleep(1.0)

            if cap is None or not cap.isOpened():
                logger.warning(f"[{cam_id}] media re-serve not ready, trying direct RTSP source...")
                cap = cv2.VideoCapture(rtsp_url)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                
            if not cap.isOpened():
                logger.warning(f"[{cam_id}] Stream sources unreachable. Retrying in 3s...")
                time.sleep(3)
                continue
            
            # Drain stale buffered frames
            for _ in range(5):
                cap.grab()
                
            last_process_time = 0
            logged_open = False
            
            try:
                while cap.isOpened() and not stop_event.is_set():
                    ret, frame = cap.read()
                    if not ret:
                        logger.warning(f"[{cam_id}] Failed to read frame or end of stream.")
                        break
                    if not logged_open:
                        h, w = frame.shape[:2]
                        logger.info(f"[{cam_id}] AI stream open {w}x{h}")
                        logged_open = True
                    
                    current_time = time.time()
                    if frame_interval == 0 or (current_time - last_process_time) >= frame_interval:
                        self.detector.process_frame(frame, camera_id=str(cam_id), camera_name=str(cam_name))
                        last_process_time = current_time
                        
            except Exception as e:
                logger.error(f"[{cam_id}] Error reading stream: {e}")
                
            finally:
                cap.release()
                if not stop_event.is_set():
                    logger.info(f"[{cam_id}] Connection dropped. Reconnecting in 2s...")
                    time.sleep(2)
                    
        logger.info(f"[{cam_id}] Thread stopped.")

    def reconcile(self, cameras):
        if cameras is None:
            return

        current_cam_ids = set()
        for cam in cameras:
            cam_id = cam.get('id')
            cam_name = cam.get('name') or f"Camera {cam_id}"
            host = cam.get('host')
            
            if cam_id and host and cam.get('enable_ai') and cam.get('is_active'):
                current_cam_ids.add(cam_id)
                if cam_id not in self.active_streams:
                    stop_event = threading.Event()
                    t = threading.Thread(target=self._stream_worker, args=(cam_id, cam_name, host, stop_event))
                    t.daemon = True
                    t.start()
                    self.active_streams[cam_id] = {'thread': t, 'stop_event': stop_event, 'host': host, 'name': cam_name}
                elif self.active_streams[cam_id]['host'] != host:
                    logger.info(f"[{cam_id}] Host changed. Restarting thread.")
                    self.active_streams[cam_id]['stop_event'].set()
                    self.active_streams[cam_id]['thread'].join(timeout=5)
                    
                    stop_event = threading.Event()
                    t = threading.Thread(target=self._stream_worker, args=(cam_id, cam_name, host, stop_event))
                    t.daemon = True
                    t.start()
                    self.active_streams[cam_id] = {'thread': t, 'stop_event': stop_event, 'host': host, 'name': cam_name}

        # Stop threads for cameras that were removed or disabled
        for cam_id in list(self.active_streams.keys()):
            if cam_id not in current_cam_ids:
                logger.info(f"[{cam_id}] Camera removed or AI disabled. Stopping thread.")
                self.active_streams[cam_id]['stop_event'].set()
                self.active_streams[cam_id]['thread'].join(timeout=5)
                self.remove_media_stream(cam_id)
                del self.active_streams[cam_id]
