package onvif

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestGenerateSecurityHeader(t *testing.T) {
	header := GenerateSecurityHeader("admin", "secret123", 0)
	if !strings.Contains(header, "<wsse:Username>admin</wsse:Username>") {
		t.Errorf("Expected username in header, got %s", header)
	}
	if !strings.Contains(header, "PasswordDigest") {
		t.Errorf("Expected PasswordDigest type, got %s", header)
	}
	if !strings.Contains(header, "<wsu:Created>") {
		t.Errorf("Expected Created element, got %s", header)
	}
	if !strings.Contains(header, "<wsse:Nonce") {
		t.Errorf("Expected Nonce element, got %s", header)
	}
}

func TestNormalizeEndpointAndRTSPURI(t *testing.T) {
	client := NewClient("192.168.1.50", 8080, "admin", "pass")

	// 1. Endpoint normalization from loopback to camera IP
	normalized := client.normalizeEndpoint("http://127.0.0.1/onvif/device_service")
	if !strings.Contains(normalized, "192.168.1.50:8080") {
		t.Errorf("Expected normalized endpoint to contain 192.168.1.50:8080, got: %s", normalized)
	}

	// 2. RTSP normalization (injecting credentials and fixing host)
	rtspRaw := "rtsp://127.0.0.1:554/live/ch0"
	rtspNorm := client.normalizeRTSPURI(rtspRaw)
	if !strings.Contains(rtspNorm, "rtsp://admin:pass@192.168.1.50:554/live/ch0") {
		t.Errorf("Expected normalized RTSP to have credentials and real IP, got: %s", rtspNorm)
	}
}

func TestONVIFEndToEndMock(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bodyBytes := make([]byte, 2048)
		n, _ := r.Body.Read(bodyBytes)
		body := string(bodyBytes[:n])

		w.Header().Set("Content-Type", "application/soap+xml; charset=utf-8")

		switch {
		case strings.Contains(body, "GetSystemDateAndTime"):
			w.Write([]byte(`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Body>
    <tds:GetSystemDateAndTimeResponse>
      <tds:SystemDateAndTime>
        <tds:UTCDateTime>
          <tds:Time><tds:Hour>12</tds:Hour><tds:Minute>0</tds:Minute><tds:Second>0</tds:Second></tds:Time>
          <tds:Date><tds:Year>2026</tds:Year><tds:Month>9</tds:Month><tds:Day>13</tds:Day></tds:Date>
        </tds:UTCDateTime>
      </tds:SystemDateAndTime>
    </tds:GetSystemDateAndTimeResponse>
  </s:Body>
</s:Envelope>`))

		case strings.Contains(body, "GetDeviceInformation"):
			w.Write([]byte(`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Body>
    <tds:GetDeviceInformationResponse>
      <tds:Manufacturer>Hikvision</tds:Manufacturer>
      <tds:Model>DS-2CD2043G2-I</tds:Model>
      <tds:FirmwareVersion>V5.5.80</tds:FirmwareVersion>
      <tds:SerialNumber>DS-2CD2043G2-I20260913AAWR123456</tds:SerialNumber>
      <tds:HardwareId>1.0</tds:HardwareId>
    </tds:GetDeviceInformationResponse>
  </s:Body>
</s:Envelope>`))

		case strings.Contains(body, "GetCapabilities"):
			w.Write([]byte(`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <tds:GetCapabilitiesResponse>
      <tds:Capabilities>
        <tds:Media><tt:XAddr>http://127.0.0.1/onvif/Media</tt:XAddr></tds:Media>
        <tds:PTZ><tt:XAddr>http://127.0.0.1/onvif/PTZ</tt:XAddr></tds:PTZ>
      </tds:Capabilities>
    </tds:GetCapabilitiesResponse>
  </s:Body>
</s:Envelope>`))

		case strings.Contains(body, "GetProfiles"):
			w.Write([]byte(`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <trt:GetProfilesResponse>
      <trt:Profiles token="Profile_1">
        <tt:Name>MainStream</tt:Name>
        <tt:VideoEncoderConfiguration>
          <tt:Encoding>H264</tt:Encoding>
          <tt:Resolution><tt:Width>1920</tt:Width><tt:Height>1080</tt:Height></tt:Resolution>
          <tt:RateControl><tt:FrameRateLimit>25</tt:FrameRateLimit></tt:RateControl>
        </tt:VideoEncoderConfiguration>
      </trt:Profiles>
      <trt:Profiles token="Profile_2">
        <tt:Name>SubStream</tt:Name>
        <tt:VideoEncoderConfiguration>
          <tt:Encoding>H264</tt:Encoding>
          <tt:Resolution><tt:Width>640</tt:Width><tt:Height>360</tt:Height></tt:Resolution>
          <tt:RateControl><tt:FrameRateLimit>15</tt:FrameRateLimit></tt:RateControl>
        </tt:VideoEncoderConfiguration>
      </trt:Profiles>
    </trt:GetProfilesResponse>
  </s:Body>
</s:Envelope>`))

		case strings.Contains(body, "GetStreamUri"):
			w.Write([]byte(`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <trt:GetStreamUriResponse>
      <trt:MediaUri>
        <tt:Uri>rtsp://127.0.0.1:554/Streaming/Channels/101</tt:Uri>
      </trt:MediaUri>
    </trt:GetStreamUriResponse>
  </s:Body>
</s:Envelope>`))

		case strings.Contains(body, "ContinuousMove"):
			w.Write([]byte(`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <s:Body><tptz:ContinuousMoveResponse/></s:Body>
</s:Envelope>`))

		case strings.Contains(body, "Stop"):
			w.Write([]byte(`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <s:Body><tptz:StopResponse/></s:Body>
</s:Envelope>`))

		case strings.Contains(body, "GetPresets"):
			w.Write([]byte(`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <tptz:GetPresetsResponse>
      <tptz:Preset token="preset_1"><tt:Name>Front Door</tt:Name></tptz:Preset>
      <tptz:Preset token="preset_2"><tt:Name>Parking Lot</tt:Name></tptz:Preset>
    </tptz:GetPresetsResponse>
  </s:Body>
</s:Envelope>`))

		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer mockServer.Close()

	u, _ := url.Parse(mockServer.URL)
	port, _ := strconv.Atoi(u.Port())
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Run Probe
	result, err := ProbeCamera(ctx, u.Hostname(), port, "admin", "123456")
	if err != nil {
		t.Fatalf("ProbeCamera returned error: %v", err)
	}

	if !result.Success {
		t.Fatalf("Expected probe success, got: %s", result.ErrorMessage)
	}
	if result.DeviceInfo.Manufacturer != "Hikvision" {
		t.Errorf("Expected Hikvision, got %s", result.DeviceInfo.Manufacturer)
	}
	if !result.HasPTZ {
		t.Errorf("Expected HasPTZ true")
	}
	if len(result.Profiles) != 2 {
		t.Fatalf("Expected 2 profiles, got %d", len(result.Profiles))
	}
	if !strings.Contains(result.MainStreamURI, "rtsp://admin:123456@") {
		t.Errorf("Expected MainStreamURI to be normalized with auth, got: %s", result.MainStreamURI)
	}

	// Test PTZ methods
	client := NewClient(u.Hostname(), port, "admin", "123456")
	if err := client.ContinuousMove(ctx, "Profile_1", PTZVector{Pan: 0.5, Tilt: 0.0, Zoom: 0.0}); err != nil {
		t.Errorf("ContinuousMove failed: %v", err)
	}
	if err := client.Stop(ctx, "Profile_1"); err != nil {
		t.Errorf("Stop failed: %v", err)
	}

	presets, err := client.GetPresets(ctx, "Profile_1")
	if err != nil || len(presets) != 2 {
		t.Errorf("Expected 2 presets, got %d (err: %v)", len(presets), err)
	}
}
