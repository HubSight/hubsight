"""§7.2 — progressive, non-blocking high-angle benchmark suite.

This is a *nightly tracker*, not a PR gate: it reports precision/recall trends
over a growing archive of real clips without failing CI when that archive is
still empty (a fresh checkout, or a dev machine with no footage staged).

Expected layout (not committed — populate from the production archive per
§7.2's protocol):

    services/vision/tests/fixtures/high_angle/
        falls/*.mp4        # staged falls, 50-70deg pitch, motionless >=5s post-impact
        negatives/*.mp4    # walking-under-camera, bending, sitting, headlight sweeps, IR

Each clip is processed frame-by-frame through PersonDetector exactly as
production does (yolo26n-pose.onnx via ByteTrack); a `falls/` clip is a hit if
any "fall_detected"/"accident_detected" event fires, a `negatives/` clip is a
false positive if one does. Run explicitly with:

    RUN_HIGH_ANGLE_BENCHMARK=1 python -m pytest tests/test_high_angle_benchmark.py -q -s
"""

import glob
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "high_angle")
FALLS_DIR = os.path.join(FIXTURES_DIR, "falls")
NEGATIVES_DIR = os.path.join(FIXTURES_DIR, "negatives")


def _clips(dir_path):
    if not os.path.isdir(dir_path):
        return []
    exts = ("*.mp4", "*.mkv", "*.avi")
    files = []
    for ext in exts:
        files.extend(glob.glob(os.path.join(dir_path, ext)))
    return sorted(files)


class _FakeMQ:
    def publish_event(self, *a, **kw):
        pass


def _run_clip_events(detector, path):
    """Feed every frame of `path` through PersonDetector; return the set of
    n_type strings that were emitted via _emit_event."""
    import cv2

    events = []
    orig_emit = detector._emit_event

    def _capture(camera_id, camera_name, n_type, **kw):
        events.append(n_type)
        return orig_emit(camera_id, camera_name, n_type, **kw)

    detector._emit_event = _capture
    cap = cv2.VideoCapture(path)
    try:
        cam_id = os.path.basename(path)
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            detector.process_frame(frame, camera_id=cam_id, camera_name=cam_id)
    finally:
        cap.release()
        detector._emit_event = orig_emit
    return events


@unittest.skipUnless(
    os.environ.get("RUN_HIGH_ANGLE_BENCHMARK") == "1",
    "opt-in nightly benchmark — set RUN_HIGH_ANGLE_BENCHMARK=1 (see module docstring)",
)
class HighAngleBenchmarkTests(unittest.TestCase):
    def test_precision_recall_report(self):
        fall_clips = _clips(FALLS_DIR)
        neg_clips = _clips(NEGATIVES_DIR)
        if not fall_clips and not neg_clips:
            self.skipTest(
                f"No clips staged under {FIXTURES_DIR} yet — "
                "populate falls/ and negatives/ per §7.2 to activate this benchmark."
            )

        from src.detection.detector import PersonDetector

        detector = PersonDetector(mq_client=_FakeMQ())

        fall_hits = 0
        for clip in fall_clips:
            events = _run_clip_events(detector, clip)
            hit = any(e in ("fall_detected", "accident_detected") for e in events)
            fall_hits += int(hit)
            print(f"[fall]     {os.path.basename(clip)}: {'HIT' if hit else 'MISS'} ({events})")

        false_positives = 0
        for clip in neg_clips:
            events = _run_clip_events(detector, clip)
            fp = any(e in ("fall_detected", "accident_detected") for e in events)
            false_positives += int(fp)
            print(f"[negative] {os.path.basename(clip)}: {'FALSE-POSITIVE' if fp else 'ok'} ({events})")

        recall = fall_hits / len(fall_clips) if fall_clips else float("nan")
        fp_rate = false_positives / len(neg_clips) if neg_clips else float("nan")
        print(
            f"\n§7.2 high-angle benchmark: recall={recall:.2%} "
            f"({fall_hits}/{len(fall_clips)}), false_positive_rate={fp_rate:.2%} "
            f"({false_positives}/{len(neg_clips)})"
        )
        # Non-blocking by design (§7.2) — this reports trends, it does not assert
        # against the §7.1 KPI targets, since a handful of early clips is not a
        # statistically meaningful sample.


if __name__ == "__main__":
    unittest.main()
