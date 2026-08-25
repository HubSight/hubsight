package member

import "testing"

func TestAllowedJPEGOrPNG(t *testing.T) {
	if !allowedJPEGOrPNG("image/jpeg", "a.jpg") {
		t.Fatal("jpeg should be allowed")
	}
	if !allowedJPEGOrPNG("image/png", "a.png") {
		t.Fatal("png should be allowed")
	}
	if allowedJPEGOrPNG("image/webp", "a.webp") {
		t.Fatal("webp should be rejected")
	}
	if allowedJPEGOrPNG("image/gif", "a.gif") {
		t.Fatal("gif should be rejected")
	}
	if allowedJPEGOrPNG("", "photo.webp") {
		t.Fatal("webp extension should be rejected")
	}
}

func TestSniffJPEGOrPNG(t *testing.T) {
	if !sniffJPEGOrPNG([]byte{0xff, 0xd8, 0xff, 0xe0}) {
		t.Fatal("jpeg magic")
	}
	if !sniffJPEGOrPNG([]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00}) {
		t.Fatal("png magic")
	}
	if sniffJPEGOrPNG([]byte("RIFF....WEBP")) {
		t.Fatal("webp payload should not sniff as jpeg/png")
	}
}
