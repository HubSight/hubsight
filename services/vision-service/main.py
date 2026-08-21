import cv2
import os
import logging
import time
import requests
import threading
from dotenv import load_dotenv
from rabbitmq_client import RabbitMQClient
from detector import PersonDetector

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
CORE_SERVICE_URL = os.getenv("CORE_SERVICE_URL", "http://core-service:8080")
M2M_SECRET = os.getenv("M2M_SECRET", "cctv-internal-m2m-secret")
PROCESS_FPS = int(os.getenv("PROCESS_FPS", "0"))
# Internal go2rtc RTSP server – vision-service reads from the same buffered
# source that WebRTC uses, ensuring temporal alignment with the live stream.
GO2RTC_RTSP_BASE = os.getenv("GO2RTC_RTSP_BASE", "rtsp://webrtc-service:8554")

active_streams = {} # cam_id -> {'thread': t, 'stop_event': e, 'host': url}
detector = None

def get_ai_cameras():
    try:
        headers = {"X-Service-Key": M2M_SECRET}
        resp = requests.get(f"{CORE_SERVICE_URL}/api/internal/ai-cameras", headers=headers, timeout=5)
        if resp.status_code == 200:
            return resp.json()
        logger.error(f"Failed to fetch AI cameras: {resp.status_code} {resp.text}")
    except Exception as e:
        logger.error(f"Error fetching AI cameras: {e}")
    return []

def stream_worker(cam_id, rtsp_url, stop_event):
    # Read from go2rtc's internal RTSP server so that vision-service and the
    # WebRTC stream consume the same buffer, keeping detections temporally
    # aligned with the video displayed in the browser.
    go2rtc_url = f"{GO2RTC_RTSP_BASE}/cam_{cam_id}"
    logger.info(f"[{cam_id}] Starting AI processing thread. Source: {go2rtc_url}")
    
    frame_interval = 1.0 / PROCESS_FPS if PROCESS_FPS > 0 else 0
    
    while not stop_event.is_set():
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        cap = cv2.VideoCapture(go2rtc_url)
        # Keep OpenCV buffer at 1 frame to stay as close to live edge as possible.
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        if not cap.isOpened():
            logger.warning(f"[{cam_id}] go2rtc stream not ready yet. Retrying in 5s...")
            time.sleep(5)
            continue
        
        # Drain any frames that accumulated during connection setup so that the
        # first processed frame is current (not stale).
        for _ in range(5):
            cap.grab()
            
        last_process_time = 0
        
        try:
            while cap.isOpened() and not stop_event.is_set():
                ret, frame = cap.read()
                if not ret:
                    logger.warning(f"[{cam_id}] Failed to read frame or end of stream.")
                    break
                
                current_time = time.time()
                if frame_interval == 0 or (current_time - last_process_time) >= frame_interval:
                    detector.process_frame(frame, camera_id=str(cam_id))
                    last_process_time = current_time
                    
        except Exception as e:
            logger.error(f"[{cam_id}] Error reading stream: {e}")
            
        finally:
            cap.release()
            if not stop_event.is_set():
                logger.info(f"[{cam_id}] Connection dropped. Reconnecting in 2s...")
                time.sleep(2)
                
    logger.info(f"[{cam_id}] Thread stopped.")

def main():
    global detector
    logger.info("Starting Vision Service (Multi-Camera)...")
    
    mq_client = RabbitMQClient(RABBITMQ_URL)
    mq_client.connect()
    
    detector = PersonDetector(mq_client=mq_client)
    
    while True:
        cameras = get_ai_cameras()
        
        current_cam_ids = set()
        for cam in cameras:
            cam_id = cam.get('id')
            host = cam.get('host')
            
            if cam_id and host:
                current_cam_ids.add(cam_id)
                if cam_id not in active_streams:
                    stop_event = threading.Event()
                    t = threading.Thread(target=stream_worker, args=(cam_id, host, stop_event))
                    t.daemon = True
                    t.start()
                    active_streams[cam_id] = {'thread': t, 'stop_event': stop_event, 'host': host}
                elif active_streams[cam_id]['host'] != host:
                    logger.info(f"[{cam_id}] Host changed. Restarting thread.")
                    active_streams[cam_id]['stop_event'].set()
                    active_streams[cam_id]['thread'].join(timeout=5)
                    
                    stop_event = threading.Event()
                    t = threading.Thread(target=stream_worker, args=(cam_id, host, stop_event))
                    t.daemon = True
                    t.start()
                    active_streams[cam_id] = {'thread': t, 'stop_event': stop_event, 'host': host}

        # Stop threads for cameras that are no longer AI-enabled or active
        for cam_id in list(active_streams.keys()):
            if cam_id not in current_cam_ids:
                logger.info(f"[{cam_id}] Camera removed or AI disabled. Stopping thread.")
                active_streams[cam_id]['stop_event'].set()
                active_streams[cam_id]['thread'].join(timeout=5)
                del active_streams[cam_id]
                
        time.sleep(5)  # Poll every 5s for fast on-demand activation/deactivation

if __name__ == "__main__":
    main()
