package member

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png"
)

const maxAvatarStoredBytes = 500 * 1024

func compressAvatarJPEG(src []byte) ([]byte, error) {
	return compressJPEGMaxBytes(src, maxAvatarStoredBytes)
}

func compressSampleJPEG(src []byte) ([]byte, error) {
	return compressJPEGMaxBytes(src, maxRawImageBytes)
}

// compressJPEGMaxBytes returns a JPEG no larger than maxBytes.
func compressJPEGMaxBytes(src []byte, maxBytes int) ([]byte, error) {
	if len(src) == 0 {
		return nil, fmt.Errorf("empty image")
	}
	if maxBytes <= 0 {
		maxBytes = maxRawImageBytes
	}

	img, format, err := image.Decode(bytes.NewReader(src))
	if err != nil {
		if len(src) <= maxBytes {
			return src, nil
		}
		return nil, fmt.Errorf("could not decode image")
	}
	if format == "jpeg" && len(src) <= maxBytes {
		return src, nil
	}

	maxSides := []int{1920, 1600, 1280, 1024, 800, 640}
	qualities := []int{82, 72, 62, 50, 40, 32}
	var last []byte
	for _, side := range maxSides {
		resized := resizeToMaxSide(img, side)
		for _, q := range qualities {
			var buf bytes.Buffer
			if err := jpeg.Encode(&buf, resized, &jpeg.Options{Quality: q}); err != nil {
				return nil, err
			}
			last = buf.Bytes()
			if len(last) <= maxBytes {
				return last, nil
			}
		}
	}
	if len(last) == 0 {
		return nil, fmt.Errorf("failed to encode jpeg")
	}
	if len(last) <= maxBytes {
		return last, nil
	}
	return last, fmt.Errorf("image still exceeds size limit after compression")
}

func resizeToMaxSide(src image.Image, maxSide int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return src
	}
	side := w
	if h > side {
		side = h
	}
	if side <= maxSide {
		return src
	}
	nw := w * maxSide / side
	nh := h * maxSide / side
	if nw < 1 {
		nw = 1
	}
	if nh < 1 {
		nh = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	for y := 0; y < nh; y++ {
		sy := b.Min.Y + y*h/nh
		for x := 0; x < nw; x++ {
			sx := b.Min.X + x*w/nw
			r, g, b8, a := src.At(sx, sy).RGBA()
			dst.SetRGBA(x, y, color.RGBA{uint8(r >> 8), uint8(g >> 8), uint8(b8 >> 8), uint8(a >> 8)})
		}
	}
	return dst
}
