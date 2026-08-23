import cv2
import os
import logging
import time
import requests
import threading
import grpc
from dotenv import load_dotenv
from rabbitmq_client import RabbitMQClient
from detector import PersonDetector
from face_engine import FaceEngine

import pb.core_pb2 as core_pb2
import pb.core_pb2_grpc as core_pb2_grpc

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
CORE_GRPC_URL = os.getenv("CORE_GRPC_URL", "core-service:50053")
PROCESS_FPS = int(os.getenv("PROCESS_FPS", "0"))
# Internal go2rtc RTSP server – vision-service reads from the same buffered
# source that WebRTC uses, ensuring temporal alignment with the live stream.
GO2RTC_RTSP_BASE = os.getenv("GO2RTC_RTSP_BASE", "rtsp://webrtc-service:8554")
WEBRTC_API_URL = os.getenv("WEBRTC_API_URL", "http://webrtc-service:1984")

active_streams = {} # cam_id -> {'thread': t, 'stop_event': e, 'host': url}
detector = None
face_engine = None

def ensure_go2rtc_stream(cam_id, rtsp_url):
    try:
        src_direct = rtsp_url
        if "#" not in src_direct:
            src_direct = f"{src_direct}#backchannel=0#transport=tcp"
        elif "transport=" not in src_direct:
            src_direct = f"{src_direct}#transport=tcp"
        src_ffmpeg = f"ffmpeg:{rtsp_url}#audio=opus"
        
        url = f"{WEBRTC_API_URL}/api/streams"
        params = [("name", f"cam_{cam_id}_cv"), ("src", src_direct), ("src", src_ffmpeg)]
        resp = requests.put(url, params=params, timeout=3)
        if resp.status_code in (200, 201):
            logger.debug(f"[{cam_id}] Registered Connection #0 in go2rtc successfully")
    except Exception as e:
        logger.warning(f"[{cam_id}] Could not register stream in go2rtc: {e}")

def get_ai_cameras():
    try:
        channel = grpc.insecure_channel(CORE_GRPC_URL)
        client = core_pb2_grpc.CoreServiceStub(channel)
        req = core_pb2.GetCamerasRequest(only_active=True, only_ai_enabled=True)
        resp = client.GetCameras(req, timeout=5)
        
        cams = []
        for c in resp.cameras:
            cams.append({
                'id': c.id,
                'name': c.name,
                'host': c.host,
                'is_active': c.is_active,
                'enable_ai': c.enable_ai
            })
        return cams
    except Exception as e:
        logger.warning(f"Error fetching AI cameras from core-service gRPC: {e}")
    return None

def sync_face_embeddings():
    """Fetch all member face vectors from core-service to keep in-memory store updated."""
    global face_engine
    if face_engine is None:
        return
    try:
        channel = grpc.insecure_channel(CORE_GRPC_URL)
        client = core_pb2_grpc.CoreServiceStub(channel)
        resp = client.GetFaces(core_pb2.GetFacesRequest(), timeout=5)
        
        items = []
        for f in resp.faces:
            items.append({
                'member_id': f.member_id,
                'name': f.name,
                'role': f.role,
                'embedding': list(f.embedding),
                'face_id': f.face_id
            })
        face_engine.load_embeddings(items)
    except Exception as e:
        logger.warning(f"Error syncing face embeddings via gRPC: {e}")

def stream_worker(cam_id, cam_name, rtsp_url, stop_event):
    ensure_go2rtc_stream(cam_id, rtsp_url)
    # Connection #0 dedicated for Computer Vision processing
    go2rtc_cv_url = f"{GO2RTC_RTSP_BASE}/cam_{cam_id}_cv"
    logger.info(f"[{cam_id} - {cam_name}] Starting 24/7 background AI processing thread (Connection #0: {go2rtc_cv_url})")
    
    frame_interval = 1.0 / PROCESS_FPS if PROCESS_FPS > 0 else 0
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
    
    while not stop_event.is_set():
        # Try internal go2rtc stream first
        cap = cv2.VideoCapture(go2rtc_cv_url)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        if not cap.isOpened():
            ensure_go2rtc_stream(cam_id, rtsp_url)
            logger.warning(f"[{cam_id}] go2rtc stream not ready, trying direct RTSP source...")
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
        
        try:
            while cap.isOpened() and not stop_event.is_set():
                ret, frame = cap.read()
                if not ret:
                    logger.warning(f"[{cam_id}] Failed to read frame or end of stream.")
                    break
                
                current_time = time.time()
                if frame_interval == 0 or (current_time - last_process_time) >= frame_interval:
                    detector.process_frame(frame, camera_id=str(cam_id), camera_name=str(cam_name))
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
    global detector, face_engine
    logger.info("Starting Vision Service with InsightFace ArcFace & YOLO Tracking (24/7 Background Mode)...")
    
    mq_client = RabbitMQClient(RABBITMQ_URL)
    mq_client.connect()
    
    face_engine = FaceEngine()
    detector = PersonDetector(mq_client=mq_client, face_engine=face_engine)
    
    # Initial vector sync
    sync_face_embeddings()
    last_sync_time = time.time()
    
    while True:
        # Periodically refresh vectors every 30s
        if time.time() - last_sync_time > 30.0:
            sync_face_embeddings()
            last_sync_time = time.time()

        cameras = get_ai_cameras()
        if cameras is not None:
            current_cam_ids = set()
            for cam in cameras:
                cam_id = cam.get('id')
                cam_name = cam.get('name') or f"Camera {cam_id}"
                host = cam.get('host')
                
                if cam_id and host:
                    current_cam_ids.add(cam_id)
                    if cam_id not in active_streams:
                        stop_event = threading.Event()
                        t = threading.Thread(target=stream_worker, args=(cam_id, cam_name, host, stop_event))
                        t.daemon = True
                        t.start()
                        active_streams[cam_id] = {'thread': t, 'stop_event': stop_event, 'host': host, 'name': cam_name}
                    elif active_streams[cam_id]['host'] != host:
                        logger.info(f"[{cam_id}] Host changed. Restarting thread.")
                        active_streams[cam_id]['stop_event'].set()
                        active_streams[cam_id]['thread'].join(timeout=5)
                        
                        stop_event = threading.Event()
                        t = threading.Thread(target=stream_worker, args=(cam_id, cam_name, host, stop_event))
                        t.daemon = True
                        t.start()
                        active_streams[cam_id] = {'thread': t, 'stop_event': stop_event, 'host': host, 'name': cam_name}

            # Stop threads only for cameras that were explicitly removed or disabled in the valid list
            for cam_id in list(active_streams.keys()):
                if cam_id not in current_cam_ids:
                    logger.info(f"[{cam_id}] Camera removed or AI disabled. Stopping thread.")
                    active_streams[cam_id]['stop_event'].set()
                    active_streams[cam_id]['thread'].join(timeout=5)
                    del active_streams[cam_id]
                    
        time.sleep(5)  # Poll every 5s for camera config updates

if __name__ == "__main__":
    main()
