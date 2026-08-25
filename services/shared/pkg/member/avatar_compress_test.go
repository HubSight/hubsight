package member

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func TestCompressAvatarJPEGCapsSize(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 3600, 2400))
	for y := 0; y < 2400; y++ {
		for x := 0; x < 3600; x++ {
			img.SetRGBA(x, y, color.RGBA{uint8(x * 3), uint8(y * 2), uint8(x ^ y), 255})
		}
	}
	var raw bytes.Buffer
	if err := jpeg.Encode(&raw, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	if raw.Len() <= maxAvatarStoredBytes {
		t.Fatalf("fixture too small to test compression: %d", raw.Len())
	}

	out, err := compressAvatarJPEG(raw.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if len(out) == 0 || len(out) > maxAvatarStoredBytes {
		t.Fatalf("compressed size %d exceeds %d", len(out), maxAvatarStoredBytes)
	}
	if _, err := jpeg.Decode(bytes.NewReader(out)); err != nil {
		t.Fatalf("output is not jpeg: %v", err)
	}
}

func TestCompressAvatarJPEGKeepsSmallJPEG(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 32, 32))
	var raw bytes.Buffer
	if err := jpeg.Encode(&raw, img, &jpeg.Options{Quality: 80}); err != nil {
		t.Fatal(err)
	}
	out, err := compressAvatarJPEG(raw.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(out, raw.Bytes()) {
		t.Fatalf("small jpeg should pass through, got %d vs %d bytes", len(out), raw.Len())
	}
}
