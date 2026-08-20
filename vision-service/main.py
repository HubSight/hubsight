import cv2
import os
import logging
import time
from dotenv import load_dotenv
from rabbitmq_client import RabbitMQClient
from detector import PersonDetector

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()

RTSP_URL = os.getenv("RTSP_URL", "rtsp://localhost:8554/cam")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
PROCESS_FPS = int(os.getenv("PROCESS_FPS", "5"))

def main():
    logger.info("Starting Vision Service...")
    
    mq_client = RabbitMQClient(RABBITMQ_URL)
    mq_client.connect()
    
    detector = PersonDetector(mq_client=mq_client)
    
    PROCESS_FPS = int(os.getenv("PROCESS_FPS", "0"))
    frame_interval = 1.0 / PROCESS_FPS if PROCESS_FPS > 0 else 0
    
    while True:
        logger.info(f"Connecting to RTSP stream: {RTSP_URL}")
        # Configure OpenCV to drop old frames and avoid lag in RTSP buffers
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        cap = cv2.VideoCapture(RTSP_URL)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        if not cap.isOpened():
            logger.error("Failed to open RTSP stream. Retrying in 5 seconds...")
            time.sleep(5)
            continue
            
        last_process_time = 0
        
        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    logger.warning("Failed to read frame or end of stream.")
                    break
                
                current_time = time.time()
                if frame_interval == 0 or (current_time - last_process_time) >= frame_interval:
                    detector.process_frame(frame, camera_id="demo-camera")
                    last_process_time = current_time
                    
        except Exception as e:
            logger.error(f"Error reading stream: {e}")
            
        finally:
            cap.release()
            logger.info("Connection dropped. Reconnecting...")
            time.sleep(2)

if __name__ == "__main__":
    main()
