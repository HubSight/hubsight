import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.recognition.enroll import square_crop_with_margin, encode_jpeg, decode_image, EnrollError  # noqa: E402


class EnrollCropTests(unittest.TestCase):
    def test_square_output_size(self):
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        frame[100:300, 200:360] = 200
        crop = square_crop_with_margin(frame, (200, 100, 360, 300), margin=0.25, out_size=512)
        self.assertEqual(crop.shape, (512, 512, 3))

    def test_crop_clamps_near_border(self):
        frame = np.full((100, 100, 3), 30, dtype=np.uint8)
        crop = square_crop_with_margin(frame, (2, 2, 40, 40), margin=0.5, out_size=64)
        self.assertEqual(crop.shape, (64, 64, 3))

    def test_jpeg_roundtrip(self):
        img = np.full((512, 512, 3), 80, dtype=np.uint8)
        data = encode_jpeg(img, quality=90)
        self.assertGreater(len(data), 100)
        decoded = decode_image(data)
        self.assertEqual(decoded.shape[2], 3)

    def test_decode_empty_raises(self):
        with self.assertRaises(EnrollError) as ctx:
            decode_image(b"")
        self.assertEqual(ctx.exception.code, "DECODE_ERROR")


if __name__ == "__main__":
    unittest.main()
