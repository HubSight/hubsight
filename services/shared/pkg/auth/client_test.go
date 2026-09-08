package auth

import (
	"strings"
	"testing"

	"cctv/shared/pkg/models"
)

func TestGenerateClientApiKey(t *testing.T) {
	tests := []struct {
		platform       string
		expectedPrefix string
	}{
		{models.PlatformMobile, "hs_mob_"},
		{models.PlatformWebSPA, "hs_web_"},
		{models.PlatformThirdParty, "hs_ext_"},
		{"unknown_platform", "hs_ext_"},
	}

	for _, tt := range tests {
		t.Run(tt.platform, func(t *testing.T) {
			key, err := GenerateClientApiKey(tt.platform)
			if err != nil {
				t.Fatalf("GenerateClientApiKey failed: %v", err)
			}
			if !strings.HasPrefix(key, tt.expectedPrefix) {
				t.Errorf("expected prefix %s, got %s", tt.expectedPrefix, key)
			}
			if len(key) <= len(tt.expectedPrefix) {
				t.Errorf("generated key too short: %s", key)
			}
		})
	}
}

func TestGenerateClientId(t *testing.T) {
	tests := []struct {
		platform       string
		expectedPrefix string
	}{
		{models.PlatformMobile, "mob_"},
		{models.PlatformWebSPA, "web_"},
		{models.PlatformThirdParty, "ext_"},
	}

	for _, tt := range tests {
		t.Run(tt.platform, func(t *testing.T) {
			id := GenerateClientId(tt.platform)
			if !strings.HasPrefix(id, tt.expectedPrefix) {
				t.Errorf("expected prefix %s, got %s", tt.expectedPrefix, id)
			}
		})
	}
}
