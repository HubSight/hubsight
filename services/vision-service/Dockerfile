# syntax=docker/dockerfile:1.7
# =============================================================================
# Stage 1: proto-builder — compile .proto → .py (grpcio-tools isolated)
# =============================================================================
FROM python:3.11-slim AS proto-builder

WORKDIR /app

# Install only grpcio-tools for protobuf compilation (not carried into runtime image)
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-deps grpcio-tools grpcio protobuf

# Compile protobuf stubs
COPY services/shared/proto ./proto
RUN mkdir -p pb && \
    python -m grpc_tools.protoc \
        -I=./proto \
        --python_out=./pb \
        --grpc_python_out=./pb \
        ./proto/*.proto && \
        touch ./pb/__init__.py && \
        sed -i 's/import core_pb2 as core__pb2/from . import core_pb2 as core__pb2/' pb/core_pb2_grpc.py

# =============================================================================
# Stage 2: model-fetcher — bake YOLO weights + InsightFace models into cache layer
# =============================================================================
FROM python:3.11-slim AS model-fetcher

WORKDIR /app

# Minimal system libraries for CV2 during model download
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libxcb1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install headless OpenCV first to avoid GUI/X11 dependencies
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install opencv-python-headless && \
    pip install numpy onnxruntime insightface requests onnx

# Pull InsightFace buffalo_s model weights at build time (no internet needed at runtime)
RUN python -c "\
import insightface; \
from insightface.app import FaceAnalysis; \
app = FaceAnalysis(name='buffalo_s', root='/root/.insightface', providers=['CPUExecutionProvider']); \
app.prepare(ctx_id=-1, det_size=(320, 320)); \
print('InsightFace buffalo_s downloaded OK')"

# Pull YOLO weights at build time — use CPU-only torch variant to minimise download size
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --extra-index-url https://download.pytorch.org/whl/cpu \
    torch torchvision ultralytics lapx
RUN python -c "\
from ultralytics import YOLO; import numpy as np; \
m = YOLO('yolo26n.pt'); \
m.track(np.zeros((384,640,3), dtype=np.uint8), classes=[0], imgsz=(384,640), tracker='bytetrack.yaml', verbose=False); \
print('YOLO yolo26n.pt cached OK')"

# =============================================================================
# Stage 3: runtime — lean production image
# =============================================================================
FROM python:3.11-slim AS runtime

WORKDIR /app

# Minimal system libraries needed at runtime
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libxcb1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python runtime dependencies with pip cache
COPY services/vision-service/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-deps grpcio protobuf && \
    pip install \
        --extra-index-url https://download.pytorch.org/whl/cpu \
        -r requirements.txt && \
    pip uninstall -y opencv-python && \
    pip install --force-reinstall opencv-python-headless && \
    pip uninstall -y polars polars-runtime-32 sympy mpmath

# Bake in pre-fetched YOLO model weights (eliminates internet download at startup)
COPY --from=model-fetcher /app/yolo26n.pt ./yolo26n.pt

# Bake in pre-fetched InsightFace models (eliminates network call at startup)
COPY --from=model-fetcher /root/.insightface /root/.insightface

# Copy compiled protobuf stubs from proto-builder stage
COPY --from=proto-builder /app/pb ./pb

# Copy application source (done last — changes here don't bust dependency/model cache layers)
COPY services/vision-service .

# Prevent ultralytics from trying to connect to the internet at runtime
ENV YOLO_OFFLINE=1
ENV ULTRALYTICS_SETTINGS_DIR=/tmp/Ultralytics

CMD ["python", "-u", "main.py"]
