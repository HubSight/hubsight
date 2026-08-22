# syntax=docker/dockerfile:1.7
FROM python:3.11-slim

WORKDIR /app

# 1. System dependencies with apt cache mount
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libxcb1 \
    && rm -rf /var/lib/apt/lists/*

# 2. Python dependencies with pip cache mount
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# 3. Cache YOLO model weights
RUN python -c "from ultralytics import YOLO; YOLO('yolo11n.pt')"

# 4. Copy application source
COPY . .

CMD ["python", "-u", "main.py"]
