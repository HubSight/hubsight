"""Internal HTTP enroll API. Not published to the host — core-service only."""

from __future__ import annotations

import json
import logging
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from src.recognition.enroll import EnrollError, enroll_from_bytes

logger = logging.getLogger(__name__)

MAX_BODY = 2 * 1024 * 1024


class _EnrollHandler(BaseHTTPRequestHandler):
    server_version = "HubSightEnroll/1.0"

    def log_message(self, fmt, *args):
        logger.info("enroll-http " + fmt, *args)

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") == "/healthz":
            self._json(200, {"status": "ok", "service": "vision-enroll"})
            return
        self._json(404, {"ok": False, "code": "NOT_FOUND", "message": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/internal/enroll":
            self._json(404, {"ok": False, "code": "NOT_FOUND", "message": "not found"})
            return
        qs = parse_qs(parsed.query)
        require_quality = (qs.get("quality") or ["on"])[0].lower() != "off"
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            self._json(400, {"ok": False, "code": "DECODE_ERROR", "message": "Empty body"})
            return
        if length > MAX_BODY:
            self._json(413, {"ok": False, "code": "TOO_LARGE", "message": "Image exceeds 2MB"})
            return
        data = self.rfile.read(length)
        engine = getattr(self.server, "face_engine", None)
        try:
            result = enroll_from_bytes(engine, data, require_quality=require_quality)
            self._json(200, result)
        except EnrollError as exc:
            status = 503 if exc.code == "VISION_UNAVAILABLE" else 422
            self._json(status, {"ok": False, "code": exc.code, "message": exc.message})
        except Exception as exc:
            logger.exception("enroll failed")
            self._json(500, {"ok": False, "code": "INTERNAL", "message": str(exc)})


def start_enroll_server(face_engine, host: str = "0.0.0.0", port: int = 8090) -> ThreadingHTTPServer:
    httpd = ThreadingHTTPServer((host, port), _EnrollHandler)
    httpd.face_engine = face_engine
    thread = threading.Thread(target=httpd.serve_forever, name="enroll-http", daemon=True)
    thread.start()
    logger.info("Enrollment HTTP listening on %s:%s (internal only)", host, port)
    return httpd
