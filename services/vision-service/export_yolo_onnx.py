"""Export YOLO .pt weights to ONNX for the vision-service runtime image.

Used only in the Docker model-fetcher stage (torch is not installed at runtime).
Prints input/output shapes so the postprocess path can be verified at build time.
"""

from __future__ import annotations

import os
import sys

import numpy as np


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


def main() -> int:
    exported = []
    exported.append(export_one("yolo26n.pt"))
    if os.path.exists("yolo-cctv.pt"):
        exported.append(export_one("yolo-cctv.pt"))
    else:
        print("yolo-cctv.pt not present — skipping custom export")
    print("DONE", exported)
    return 0


if __name__ == "__main__":
    sys.exit(main())
