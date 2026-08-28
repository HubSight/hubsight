#!/usr/bin/env bash
# ==============================================================================
# HubSight CCTV - FaceTime HD Camera RTSP Streamer for macOS
# Streams Mac Webcam to rtsp://127.0.0.1:8556/facetime via MediaMTX + FFmpeg
# ==============================================================================

set -e

RTSP_PORT=8556
STREAM_PATH="facetime"
CONTAINER_NAME="cctv-mediamtx-facetime"

# Colors for terminal output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   🎥 HubSight FaceTime RTSP Streamer for macOS       ${NC}"
echo -e "${BLUE}======================================================${NC}"

# 1. Check prerequisites
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}❌ FFmpeg is not installed!${NC}"
    echo -e "Install via Homebrew: ${YELLOW}brew install ffmpeg${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed or not in PATH!${NC}"
    exit 1
fi

# 2. Cleanup on Exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping RTSP streaming and MediaMTX...${NC}"
    if [ -n "$FFMPEG_PID" ]; then
        kill "$FFMPEG_PID" 2>/dev/null || true
    fi
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
    echo -e "${GREEN}✅ Cleanup completed.${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 3. Start MediaMTX in Docker on Port 8556
echo -e "${YELLOW}🚀 Starting MediaMTX RTSP Server on port ${RTSP_PORT}...${NC}"
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

docker run -d --name "$CONTAINER_NAME" \
    -e MTX_RTSPADDRESS=":$RTSP_PORT" \
    -p "$RTSP_PORT:$RTSP_PORT/tcp" \
    -p "$RTSP_PORT:$RTSP_PORT/udp" \
    bluenviron/mediamtx:latest >/dev/null

sleep 1.5

# Verify MediaMTX is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}❌ Failed to start MediaMTX container.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ MediaMTX RTSP Server is READY on port ${RTSP_PORT}${NC}"

echo -e "${BLUE}📹 Capturing from macOS FaceTime Camera (libx264 zerolatency + repeat-headers)...${NC}"
echo -e "------------------------------------------------------"
echo -e "${GREEN}📌 RTSP Stream URLs:${NC}"
echo -e "   • For HubSight (Docker):  ${YELLOW}rtsp://host.docker.internal:${RTSP_PORT}/${STREAM_PATH}${NC}"
echo -e "   • For Local VLC / Player: ${YELLOW}rtsp://127.0.0.1:${RTSP_PORT}/${STREAM_PATH}${NC}"
echo -e "------------------------------------------------------"
echo -e "${GREEN}🔴 STREAMING LIVE... (Press Ctrl+C to stop)${NC}"
echo ""

# 4. Ultra-smooth Low-Latency Streamer
# - Uses libx264 with zerolatency tune (0 frame buffer, 0 lookahead, 0 latency)
# - repeat-headers=1 sends SPS/PPS with every I-frame so WebRTC locks on instantly
# - keyint=30 creates 1 keyframe every second
ffmpeg -hide_banner \
    -f avfoundation \
    -pixel_format nv12 \
    -framerate 30 \
    -video_size 1280x720 \
    -i "0:none" \
    -c:v libx264 \
    -preset ultrafast \
    -tune zerolatency \
    -x264-params "keyint=30:min-keyint=30:no-scenecut=1:repeat-headers=1:b-adapt=0:bframes=0" \
    -pix_fmt yuv420p \
    -b:v 2500k \
    -maxrate 2500k \
    -bufsize 1000k \
    -fps_mode cfr \
    -r 30 \
    -an \
    -f rtsp \
    -rtsp_transport tcp \
    "rtsp://127.0.0.1:${RTSP_PORT}/${STREAM_PATH}" &

FFMPEG_PID=$!
wait $FFMPEG_PID
