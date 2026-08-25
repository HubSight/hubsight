package member

import (
	"bytes"
	"strings"
	"unicode"
)

const (
	maxRawImageBytes      = 2 << 20  // target size after auto-compress, before AI crop
	maxSampleUploadBytes  = 15 << 20 // oversized samples are compressed, then cropped
	maxAvatarUploadBytes  = 15 << 20 // avatar is compressed server-side to ≤500KB
	maxSamplesPerMember   = 1000
	maxSamplesPerUpload   = 100
	jpegPNGOnlyError      = "Only JPEG and PNG images are allowed"
	rawImageTooLargeError = "Image exceeds 2MB"
	avatarTooLargeError   = "Avatar image exceeds 15MB"
)

var (
	jpegMagic = []byte{0xff, 0xd8, 0xff}
	pngMagic  = []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}
)

func allowedJPEGOrPNG(contentType, filename string) bool {
	ct := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	switch ct {
	case "image/jpeg", "image/jpg", "image/png":
		return true
	case "image/webp", "image/gif", "image/bmp", "image/heic", "image/heif", "image/avif":
		return false
	}
	ext := strings.ToLower(filenameExt(filename))
	switch ext {
	case ".jpg", ".jpeg", ".png":
		return true
	}
	return ct == "" && ext == ""
}

func sniffJPEGOrPNG(data []byte) bool {
	return sniffJPEG(data) || sniffPNG(data)
}

func sniffJPEG(data []byte) bool {
	return len(data) >= 3 && bytes.Equal(data[:3], jpegMagic)
}

func sniffPNG(data []byte) bool {
	return len(data) >= 8 && bytes.Equal(data[:8], pngMagic)
}

func filenameExt(name string) string {
	name = strings.TrimSpace(name)
	i := strings.LastIndexByte(name, '.')
	if i < 0 {
		return ""
	}
	ext := name[i:]
	for _, r := range ext {
		if r > unicode.MaxASCII {
			return ""
		}
	}
	return ext
}
