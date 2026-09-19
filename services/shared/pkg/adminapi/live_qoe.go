package adminapi

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/live"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/response"

	"github.com/gin-gonic/gin"
)

const (
	maxQoEReportsPerRequest = 64
	maxQoEPayloadBytes      = 256 << 10
)

var qoePruner struct {
	sync.Mutex
	lastRun time.Time
}

type adminQoEReport struct {
	SessionID          string             `json:"session_id"`
	CameraID           string             `json:"camera_id"`
	StreamName         string             `json:"stream_name"`
	Profile            string             `json:"profile"`
	ReportedAt         *time.Time         `json:"reported_at"`
	Metrics            map[string]float64 `json:"metrics"`
	FPS                *float64           `json:"fps"`
	DroppedFrames      *float64           `json:"dropped_frames"`
	PacketLoss         *float64           `json:"packet_loss"`
	RTTMilliseconds    *float64           `json:"rtt_ms"`
	JitterMilliseconds *float64           `json:"jitter_ms"`
	DecodeLatency      *float64           `json:"decode_latency_ms"`
	DecoderQueue       *float64           `json:"decoder_queue_ms"`
	GPUUtilization     *float64           `json:"gpu_utilization"`
	CPUUtilization     *float64           `json:"cpu_utilization"`
}

type adminQoERequest struct {
	Reports []adminQoEReport `json:"reports"`
	// Single-report fields keep the endpoint convenient for SDKs that emit one
	// sample per completed playback interval instead of batching samples.
	adminQoEReport
}

// AdminLiveQoEHandler accepts a bounded batch of client-side live playback
// metrics and persists it with a short operational retention window. Metrics
// are best-effort: a telemetry failure must not affect media playback.
func AdminLiveQoEHandler(c *gin.Context) {
	body, err := readLimitedJSON(c, maxQoEPayloadBytes)
	if err != nil {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	var req adminQoERequest
	if err := json.Unmarshal(body, &req); err != nil {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	reports := req.Reports
	if len(reports) == 0 && strings.TrimSpace(req.CameraID) != "" {
		reports = []adminQoEReport{req.adminQoEReport}
	}
	if len(reports) == 0 || len(reports) > maxQoEReportsPerRequest {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"max_reports": maxQoEReportsPerRequest})
		return
	}

	userID := ""
	if value, ok := c.Get("user"); ok {
		if user, ok := value.(*models.User); ok && user != nil {
			userID = user.ID
		}
	}
	clientID := ""
	if client, ok := adminClient(c); ok {
		clientID = client.ClientID
	}
	stored := make([]models.LiveQoEReport, 0, len(reports))
	for _, report := range reports {
		metrics, err := normalizeQoEMetrics(report)
		if err != nil {
			adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"reason": err.Error()})
			return
		}
		if report.ReportedAt == nil {
			now := time.Now().UTC()
			report.ReportedAt = &now
		}
		if report.ReportedAt.Before(time.Now().Add(-24*time.Hour)) || report.ReportedAt.After(time.Now().Add(24*time.Hour)) {
			adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"reason": "reported_at is outside the allowed clock-skew window"})
			return
		}
		stored = append(stored, models.LiveQoEReport{
			UserID: userID, ClientID: clientID, SessionID: strings.TrimSpace(report.SessionID),
			CameraID: strings.TrimSpace(report.CameraID), StreamName: strings.TrimSpace(report.StreamName),
			Profile: strings.TrimSpace(report.Profile), ReportedAt: report.ReportedAt.UTC(), Metrics: metrics,
		})
	}
	if err := database.DB.WithContext(c.Request.Context()).Create(&stored).Error; err != nil {
		// The endpoint is best-effort from the SDK perspective, but an explicit
		// 503 lets the SDK retry or drop the sample according to its policy.
		adminError(c, http.StatusServiceUnavailable, response.ErrDatabaseError, nil)
		return
	}
	pruneOldQoEReports(c)
	c.JSON(http.StatusAccepted, gin.H{"status": "accepted", "accepted": len(stored), "retention_days": qoeRetentionDays(), "request_id": c.GetString("request_id")})
}

func readLimitedJSON(c *gin.Context, limit int64) ([]byte, error) {
	body, err := ioReadAllLimit(c, limit)
	if err != nil {
		return nil, err
	}
	return body, nil
}

// ioReadAllLimit avoids accepting an unbounded telemetry body while keeping
// the helper local to this feature.
func ioReadAllLimit(c *gin.Context, limit int64) ([]byte, error) {
	reader := io.LimitReader(c.Request.Body, limit+1)
	body, err := io.ReadAll(reader)
	if err != nil || int64(len(body)) > limit {
		return nil, errors.New(response.ErrInvalidInput)
	}
	return body, nil
}

func normalizeQoEMetrics(report adminQoEReport) (map[string]float64, error) {
	metrics := make(map[string]float64, len(report.Metrics)+10)
	for name, value := range report.Metrics {
		if strings.TrimSpace(name) == "" || !validQoEValue(value) {
			return nil, &qoeValidationError{"metrics contains an invalid value"}
		}
		metrics[name] = value
	}
	for name, value := range map[string]*float64{
		"fps": report.FPS, "dropped_frames": report.DroppedFrames, "packet_loss": report.PacketLoss,
		"rtt_ms": report.RTTMilliseconds, "jitter_ms": report.JitterMilliseconds,
		"decode_latency_ms": report.DecodeLatency, "decoder_queue_ms": report.DecoderQueue,
		"gpu_utilization": report.GPUUtilization, "cpu_utilization": report.CPUUtilization,
	} {
		if value == nil {
			continue
		}
		if !validQoEValue(*value) {
			return nil, &qoeValidationError{"metrics contains an invalid value"}
		}
		if _, exists := metrics[name]; !exists {
			metrics[name] = *value
		}
	}
	if strings.TrimSpace(report.CameraID) == "" || strings.TrimSpace(report.SessionID) == "" || len(metrics) == 0 {
		return nil, &qoeValidationError{"session_id, camera_id, and at least one metric are required"}
	}
	if len(report.CameraID) > 21 || len(report.SessionID) > 128 || len(report.StreamName) > 128 || len(report.Profile) > 32 {
		return nil, &qoeValidationError{"identifier is too long"}
	}
	if report.Profile != "" && !live.IsLiveProfile(report.Profile) {
		return nil, &qoeValidationError{"unsupported live profile"}
	}
	if value, ok := metrics["packet_loss"]; ok && value > 100 {
		return nil, &qoeValidationError{"packet_loss must be between 0 and 100"}
	}
	for _, name := range []string{"gpu_utilization", "cpu_utilization"} {
		if value, ok := metrics[name]; ok && value > 100 {
			return nil, &qoeValidationError{name + " must be between 0 and 100"}
		}
	}
	return metrics, nil
}

type qoeValidationError struct{ message string }

func (e *qoeValidationError) Error() string { return e.message }

func validQoEValue(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 0
}

func qoeRetentionDays() int {
	days := 7
	if raw, err := strconv.Atoi(strings.TrimSpace(os.Getenv("ADMIN_LIVE_QOE_RETENTION_DAYS"))); err == nil && raw > 0 {
		days = raw
	}
	if days > 30 {
		days = 30
	}
	return days
}

func pruneOldQoEReports(c *gin.Context) {
	qoePruner.Lock()
	defer qoePruner.Unlock()
	if time.Since(qoePruner.lastRun) < time.Hour {
		return
	}
	qoePruner.lastRun = time.Now()
	cutoff := time.Now().Add(-time.Duration(qoeRetentionDays()) * 24 * time.Hour)
	_ = database.DB.WithContext(c.Request.Context()).Where("created_at < ?", cutoff).Delete(&models.LiveQoEReport{}).Error
}
