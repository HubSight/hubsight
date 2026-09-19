package adminapi

import (
	"testing"
)

func TestNormalizeQoEMetricsAcceptsKnownAndCustomMetrics(t *testing.T) {
	fps := 15.0
	report := adminQoEReport{
		SessionID: "session_1",
		CameraID:  "camera_1",
		Profile:   "matrix_64",
		FPS:       &fps,
		Metrics:   map[string]float64{"rtt_ms": 42},
	}
	metrics, err := normalizeQoEMetrics(report)
	if err != nil {
		t.Fatalf("normalizeQoEMetrics returned error: %v", err)
	}
	if metrics["fps"] != fps || metrics["rtt_ms"] != 42 {
		t.Fatalf("unexpected metrics: %#v", metrics)
	}
}

func TestNormalizeQoEMetricsRejectsInvalidRanges(t *testing.T) {
	packetLoss := 101.0
	_, err := normalizeQoEMetrics(adminQoEReport{
		SessionID:  "session_1",
		CameraID:   "camera_1",
		PacketLoss: &packetLoss,
	})
	if err == nil {
		t.Fatal("expected packet-loss validation error")
	}
}
