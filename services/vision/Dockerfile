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
# Stage 2: model-fetcher — export YOLO ONNX + bake InsightFace models
# Torch lives ONLY in this stage. Runtime never installs it.
# =============================================================================
FROM python:3.11-slim AS model-fetcher

WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libxcb1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install opencv-python-headless numpy onnxruntime insightface requests onnx

# Pull InsightFace buffalo_s model weights at build time (no internet needed at runtime)
RUN python -c "\
import insightface; \
from insightface.app import FaceAnalysis; \
app = FaceAnalysis(name='buffalo_s', root='/root/.insightface', providers=['CPUExecutionProvider']); \
app.prepare(ctx_id=-1, det_size=(320, 320)); \
print('InsightFace buffalo_s downloaded OK')"

# Torch + ultralytics are used only to export ONNX, then discarded with this stage
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --extra-index-url https://download.pytorch.org/whl/cpu \
    torch torchvision ultralytics onnx

COPY services/vision/export_yolo_onnx.py ./export_yolo_onnx.py
RUN python export_yolo_onnx.py

# =============================================================================
# Stage 3: runtime — no torch / ultralytics / lapx
# =============================================================================
FROM python:3.11-slim AS runtime

WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libxcb1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY services/vision/requirements.txt .
# insightface pulls opencv-python (GUI). Uninstall it, then reinstall headless LAST
# so cv2 is actually present at runtime. Fail the build if import cv2 breaks.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir grpcio protobuf && \
    pip install --no-cache-dir -r requirements.txt && \
    pip uninstall -y opencv-python opencv-python-headless 2>/dev/null || true && \
    pip install --no-cache-dir opencv-python-headless && \
    python -c "import cv2, numpy, onnxruntime; print('cv2', cv2.__version__, 'ort', onnxruntime.__version__)" && \
    find /usr/local/lib/python3.11/site-packages -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true && \
    pip cache purge 2>/dev/null || true

COPY --from=model-fetcher /app/*.onnx ./
COPY --from=model-fetcher /app/yolo-fire-smoke.names.json ./
COPY --from=model-fetcher /root/.insightface /root/.insightface
COPY --from=proto-builder /app/pb ./pb
COPY services/vision/main.py ./main.py
COPY services/vision/src ./src

ENV OMP_NUM_THREADS=2
ENV OPENBLAS_NUM_THREADS=2
ENV ORT_INTRA_OP_NUM_THREADS=2

CMD ["python", "-u", "main.py"]
