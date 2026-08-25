"""Export YOLO .pt weights to ONNX for the vision-service runtime image.

Used only in the Docker model-fetcher stage (torch is not installed at runtime).
Prints input/output shapes so the postprocess path can be verified at build time.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request

import numpy as np

FIRE_SMOKE_PT_URL = os.getenv(
    "FIRE_SMOKE_PT_URL",
    "https://huggingface.co/SalahALHaismawi/yolov26-fire-detection/resolve/main/best.pt",
)
FIRE_SMOKE_PT = "yolo-fire-smoke.pt"
FIRE_SMOKE_ONNX = "yolo-fire-smoke.onnx"
FIRE_SMOKE_NAMES = "yolo-fire-smoke.names.json"


def _print_onnx_io(path: str) -> None:
    import onnxruntime as ort

    sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    for inp in sess.get_inputs():
        print(f"INPUT  {inp.name} {inp.shape} {inp.type}")
    for out in sess.get_outputs():
        print(f"OUTPUT {out.name} {out.shape} {out.type}")

    dummy = np.zeros((1, 3, 384, 640), dtype=np.float32)
    outputs = sess.run(None, {sess.get_inputs()[0].name: dummy})
    for i, arr in enumerate(outputs):
        print(f"RUNTIME_OUTPUT[{i}] shape={np.asarray(arr).shape} dtype={np.asarray(arr).dtype}")


def export_one(model_name: str, imgsz=(384, 640)) -> str:
    from ultralytics import YOLO

    print(f"Loading {model_name}...")
    model = YOLO(model_name)
    try:
        path = model.export(
            format="onnx",
            imgsz=imgsz,
            opset=17,
            simplify=True,
            dynamic=False,
            half=False,
        )
    except Exception as exc:
        print(f"simplify=True export failed ({exc}); retrying without simplify")
        path = model.export(
            format="onnx",
            imgsz=imgsz,
            opset=17,
            simplify=False,
            dynamic=False,
            half=False,
        )
    onnx_path = path if isinstance(path, str) else model_name.replace(".pt", ".onnx")
    if not os.path.exists(onnx_path):
        raise FileNotFoundError(f"Export claimed success but {onnx_path} is missing")
    print(f"Exported {onnx_path} OK")
    _print_onnx_io(onnx_path)
    return onnx_path


def _download(url: str, dest: str) -> None:
    print(f"Downloading {url} -> {dest}")
    req = urllib.request.Request(url, headers={"User-Agent": "HubSight-vision-build/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp, open(dest, "wb") as out:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    size = os.path.getsize(dest)
    if size < 1_000_000:
        raise RuntimeError(f"Downloaded {dest} is too small ({size} bytes)")
    print(f"Downloaded {dest} ({size} bytes)")


def _write_names(path: str, names: dict) -> None:
    payload = {str(k): str(v) for k, v in names.items()}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")
    print(f"Wrote class names {path}: {payload}")


def export_fire_smoke() -> str | None:
    try:
        if not os.path.exists(FIRE_SMOKE_PT):
            _download(FIRE_SMOKE_PT_URL, FIRE_SMOKE_PT)
        from ultralytics import YOLO

        model = YOLO(FIRE_SMOKE_PT)
        names = getattr(model, "names", None) or {}
        _write_names(FIRE_SMOKE_NAMES, names)
        onnx_path = export_one(FIRE_SMOKE_PT)
        if os.path.abspath(onnx_path) != os.path.abspath(FIRE_SMOKE_ONNX):
            if os.path.exists(FIRE_SMOKE_ONNX):
                os.remove(FIRE_SMOKE_ONNX)
            os.replace(onnx_path, FIRE_SMOKE_ONNX)
        print(f"Fire/smoke ONNX ready: {FIRE_SMOKE_ONNX}")
        return FIRE_SMOKE_ONNX
    except Exception as exc:
        print(f"WARNING: fire/smoke model export failed ({exc})")
        if not os.path.exists(FIRE_SMOKE_NAMES):
            _write_names(FIRE_SMOKE_NAMES, {})
        return None


def main() -> int:
    exported = []
    exported.append(export_one("yolo26n.pt"))
    exported.append(export_one("yolo26n-pose.pt"))
    if os.path.exists("yolo-cctv.pt"):
        exported.append(export_one("yolo-cctv.pt"))
    else:
        print("yolo-cctv.pt not present — skipping custom combined export")
    fire = export_fire_smoke()
    if not fire:
        print("ERROR: fire/smoke ONNX export is required for real detection")
        return 1
    exported.append(fire)
    print("DONE", exported)
    return 0


if __name__ == "__main__":
    sys.exit(main())
