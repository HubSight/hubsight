package fingerprint

import (
	"net/http/httptest"
	"testing"
)

func TestDetectWithClientInfo_NativeApp(t *testing.T) {
	req := httptest.NewRequest("POST", "/auth/login", nil)
	req.Header.Set("X-Forwarded-For", "192.168.1.50")

	clientInfo := &ClientDeviceInfo{
		Fingerprint:      "native_hw_id_apple_15_pro_abc",
		ClientType:       "mobile_ios",
		Model:            "iPhone 15 Pro",
		Manufacturer:     "Apple",
		Platform:         "iOS",
		OSVersion:        "17.5.1",
		AppVersion:       "1.2.0",
		ScreenResolution: "393x852",
	}

	info := DetectWithClientInfo(req, clientInfo)

	if info.Fingerprint != "native_hw_id_apple_15_pro_abc" {
		t.Errorf("Expected fingerprint native_hw_id_apple_15_pro_abc, got %s", info.Fingerprint)
	}

	if info.ClientType != "mobile_ios" {
		t.Errorf("Expected client_type mobile_ios, got %s", info.ClientType)
	}

	expectedLabel := "Apple iPhone 15 Pro (iOS 17.5.1) • App v1.2.0"
	if info.DeviceLabel != expectedLabel {
		t.Errorf("Expected device_label %s, got %s", expectedLabel, info.DeviceLabel)
	}

	if info.IPAddress != "192.168.1.50" {
		t.Errorf("Expected IP 192.168.1.50, got %s", info.IPAddress)
	}

	if info.GeoCountry != "LAN" {
		t.Errorf("Expected LAN, got %s", info.GeoCountry)
	}
}

func TestDetectWithClientInfo_WebClient(t *testing.T) {
	req := httptest.NewRequest("POST", "/auth/login", nil)
	req.Header.Set("X-Real-IP", "14.161.20.10")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	clientInfo := &ClientDeviceInfo{
		Fingerprint:      "web_composite_fp_123456",
		ClientType:       "web",
		Platform:         "Windows 11",
		BrowserName:      "Chrome",
		BrowserVersion:   "128.0",
		ScreenResolution: "1920x1080",
	}

	info := DetectWithClientInfo(req, clientInfo)

	if info.Fingerprint != "web_composite_fp_123456" {
		t.Errorf("Expected fingerprint web_composite_fp_123456, got %s", info.Fingerprint)
	}

	if info.ClientType != "web" {
		t.Errorf("Expected client_type web, got %s", info.ClientType)
	}

	expectedLabel := "Chrome 128.0 trên Windows 11 (1920x1080)"
	if info.DeviceLabel != expectedLabel {
		t.Errorf("Expected device_label %s, got %s", expectedLabel, info.DeviceLabel)
	}

	if info.IPAddress != "14.161.20.10" {
		t.Errorf("Expected IP 14.161.20.10, got %s", info.IPAddress)
	}
}

func TestDetectWithClientInfo_HeadersFallback(t *testing.T) {
	req := httptest.NewRequest("POST", "/auth/login", nil)
	req.Header.Set("X-Device-Fingerprint", "hdr_fp_xyz")
	req.Header.Set("X-Device-Label", "Desktop Workstation (Windows)")
	req.Header.Set("X-Client-Type", "desktop_windows")

	info := DetectWithClientInfo(req, nil)

	if info.Fingerprint != "hdr_fp_xyz" {
		t.Errorf("Expected fingerprint hdr_fp_xyz, got %s", info.Fingerprint)
	}

	if info.DeviceLabel != "Desktop Workstation (Windows)" {
		t.Errorf("Expected label Desktop Workstation (Windows), got %s", info.DeviceLabel)
	}

	if info.ClientType != "desktop_windows" {
		t.Errorf("Expected client_type desktop_windows, got %s", info.ClientType)
	}
}

func TestIsPrivateIP(t *testing.T) {
	tests := []struct {
		ip       string
		expected bool
	}{
		{"127.0.0.1", true},
		{"::1", true},
		{"10.0.1.20", true},
		{"172.20.0.5", true},
		{"192.168.1.1", true},
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"118.69.182.5", false},
	}

	for _, tt := range tests {
		if got := IsPrivateIP(tt.ip); got != tt.expected {
			t.Errorf("IsPrivateIP(%s) = %v, expected %v", tt.ip, got, tt.expected)
		}
	}
}
