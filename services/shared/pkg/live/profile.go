package live

import (
	"fmt"
	"strings"
)

const (
	LiveProfileThumbnail = "thumbnail"
	LiveProfileMatrix64  = "matrix_64"
	LiveProfileMatrix16  = "matrix_16"
	LiveProfileFocus     = "focus"
	DefaultLiveProfile   = LiveProfileMatrix64
)

// NormalizeLiveProfile keeps the profile vocabulary shared by the Admin API
// and pool-service. Empty profile values use the matrix default so legacy App
// API callers continue to behave exactly as before.
func NormalizeLiveProfile(value string) (string, error) {
	profile := strings.TrimSpace(value)
	if profile == "" {
		return DefaultLiveProfile, nil
	}
	switch profile {
	case LiveProfileThumbnail, LiveProfileMatrix64, LiveProfileMatrix16, LiveProfileFocus:
		return profile, nil
	default:
		return "", fmt.Errorf("unsupported live profile %q", profile)
	}
}

func IsLiveProfile(value string) bool {
	_, err := NormalizeLiveProfile(value)
	return err == nil
}
