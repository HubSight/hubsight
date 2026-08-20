FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV and other needs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libxcb1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download model once to cache it in image
RUN python -c "from ultralytics import YOLO; YOLO('yolo11n.pt')"

COPY . .

CMD ["python", "-u", "main.py"]
