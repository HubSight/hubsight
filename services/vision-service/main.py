import os
import logging
import time
import grpc
from dotenv import load_dotenv
from src.messaging.rabbitmq_client import RabbitMQClient
from src.detection.detector import PersonDetector
from src.recognition.face_engine import FaceEngine
from src.streaming.stream_manager import StreamManager

import pb.core_pb2 as core_pb2
import pb.core_pb2_grpc as core_pb2_grpc

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
CORE_GRPC_URL = os.getenv("CORE_GRPC_URL", "core-service:50053")
PROCESS_FPS = int(os.getenv("PROCESS_FPS", "0"))
GO2RTC_RTSP_BASE = os.getenv("GO2RTC_RTSP_BASE", "rtsp://webrtc-service:8554")
WEBRTC_API_URL = os.getenv("WEBRTC_API_URL", "http://webrtc-service:1984")

def get_ai_cameras():
    """Query core-service gRPC for AI-enabled active cameras."""
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

def sync_face_embeddings(face_engine):
    """Fetch all member face vectors from core-service to keep in-memory vector store updated."""
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

def main():
    logger.info("Starting Vision Service with InsightFace ArcFace & YOLO Tracking (Event-Driven MQ Mode)...")
    
    # 1. Initialize message broker
    mq_client = RabbitMQClient(RABBITMQ_URL)
    mq_client.connect()
    
    # 2. Initialize AI Engines
    face_engine = FaceEngine()
    detector = PersonDetector(mq_client=mq_client, face_engine=face_engine)
    
    # 3. Initialize Stream Manager
    stream_mgr = StreamManager(
        detector=detector,
        go2rtc_rtsp_base=GO2RTC_RTSP_BASE,
        webrtc_api_url=WEBRTC_API_URL,
        process_fps=PROCESS_FPS
    )
    
    # Initial vector sync and camera sync
    sync_face_embeddings(face_engine)
    initial_cams = get_ai_cameras()
    stream_mgr.reconcile(initial_cams)
    
    # 4. Start Event-Driven MQ Consumer for instant updates (<10ms response)
    def on_mq_event(pattern, data):
        logger.info(f"[MQ Event] Received '{pattern}': {data}")
        if pattern.startswith("camera."):
            logger.info("[MQ] Camera configuration changed, reconciling stream workers immediately...")
            cams = get_ai_cameras()
            stream_mgr.reconcile(cams)
        elif pattern.startswith("member.") or pattern.startswith("face."):
            logger.info("[MQ] Member or face vectors updated, reloading vector database immediately...")
            sync_face_embeddings(face_engine)

    mq_client.start_consumer("vision_queue", on_mq_event)
    logger.info("[Vision Service] Subscribed to vision_queue. Listening for real-time events.")
    
    # 5. Heartbeat backup loop (runs every 30s as safety fallback)
    while True:
        time.sleep(30)
        # Periodic fallback check
        cams = get_ai_cameras()
        stream_mgr.reconcile(cams)

if __name__ == "__main__":
    main()

