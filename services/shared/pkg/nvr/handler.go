package nvr

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"runtime"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/live"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/storage"
	"github.com/gin-gonic/gin"
)

var startTime = time.Now()

// GetNvrStatusSnapshot computes full statistics of the NVR engine
func GetNvrStatusSnapshot(ctx context.Context) (*NvrStatusResponse, error) {
	// 1. Collect System / Runtime statistics
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	sysStats := SystemStats{
		GoVersion:     runtime.Version(),
		NumCPU:        runtime.NumCPU(),
		Goroutines:    runtime.NumGoroutine(),
		MemoryAllocMB: float64(memStats.Alloc) / (1024 * 1024),
		MemorySysMB:   float64(memStats.Sys) / (1024 * 1024),
		HeapAllocMB:   float64(memStats.HeapAlloc) / (1024 * 1024),
		UptimeSeconds: int64(time.Since(startTime).Seconds()),
	}

	// 2. Storage / Quota stats
	var totalUsedBytes int64
	_ = database.DB.WithContext(ctx).Model(&models.Recording{}).
		Select("COALESCE(SUM(size_bytes), 0)").
		Scan(&totalUsedBytes).Error

	var totalRecordingsCount int64
	_ = database.DB.WithContext(ctx).Model(&models.Recording{}).Count(&totalRecordingsCount).Error

	var oldestSegmentAt *time.Time
	var oldestRec models.Recording
	if err := database.DB.WithContext(ctx).Order("start_at ASC").First(&oldestRec).Error; err == nil {
		oldestSegmentAt = &oldestRec.StartAt
	}

	var newestSegmentAt *time.Time
	var newestRec models.Recording
	if err := database.DB.WithContext(ctx).Order("end_at DESC").First(&newestRec).Error; err == nil {
		newestSegmentAt = &newestRec.EndAt
	}

	// Get global settings
	var globalSettings models.Setting
	if err := database.DB.WithContext(ctx).First(&globalSettings).Error; err != nil {
		globalSettings = models.Setting{
			NvrStatus:      true,
			StorageQuotaGB: 50,
			RetentionDays:  4,
		}
	}

	quotaBytes := int64(globalSettings.StorageQuotaGB) * 1024 * 1024 * 1024
	usedPercent := 0.0
	if quotaBytes > 0 {
		usedPercent = (float64(totalUsedBytes) / float64(quotaBytes)) * 100
	}

	storeStats := StorageStats{
		UsedBytes:           totalUsedBytes,
		QuotaBytes:          quotaBytes,
		UsedPercentage:      usedPercent,
		TotalSegmentsCount:  int(totalRecordingsCount),
		OldestSegmentAt:     oldestSegmentAt,
		NewestSegmentAt:     newestSegmentAt,
		RetentionDays:       globalSettings.RetentionDays,
		CleanupIntervalDays: 1,
		RetentionStats:      &storage.CurrentRetentionStats,
	}

	// 3. Per-Camera Recorder Status
	var cameras []models.Camera
	if err := database.DB.WithContext(ctx).Find(&cameras).Error; err != nil {
		return nil, err
	}

	cameraStatuses := make([]CameraRecorderStatus, 0, len(cameras))
	now := time.Now()

	for _, cam := range cameras {
		// Query latest segment for this camera
		var latestRec models.Recording
		hasLatest := database.DB.WithContext(ctx).
			Where("camera_id = ?", cam.ID).
			Order("end_at DESC").
			First(&latestRec).Error == nil

		var camSegCount int64
		_ = database.DB.WithContext(ctx).Model(&models.Recording{}).
			Where("camera_id = ?", cam.ID).
			Count(&camSegCount).Error

		status := "inactive"
		var latestAt *time.Time
		var latestSize int64 = 0
		var latestDur int = 0

		if hasLatest {
			latestAt = &latestRec.EndAt
			latestSize = latestRec.SizeBytes
			latestDur = latestRec.DurationSeconds
		}

		if !globalSettings.NvrStatus || !cam.IsActive || cam.IsStopped {
			status = "disabled"
		} else {
			segDuration := cam.SegmentDuration
			if segDuration <= 0 {
				segDuration = 300
			}

			// If the camera is active and NVR engine is ON
			maxExpectedAge := time.Duration(segDuration*2+90) * time.Second
			if !hasLatest || now.Sub(latestRec.EndAt) <= maxExpectedAge {
				status = "recording"
			} else {
				status = "stalled"
			}
		}

		cameraStatuses = append(cameraStatuses, CameraRecorderStatus{
			CameraID:              cam.ID,
			Name:                  cam.Name,
			Host:                  cam.Host,
			Brand:                 cam.Brand,
			IsActive:              cam.IsActive,
			Status:                status,
			RTSPTransport:         cam.RtspTransport,
			SegmentDuration:       cam.SegmentDuration,
			VideoCodec:            cam.VideoCodec,
			AudioMode:             cam.AudioMode,
			ExtraArgs:             cam.ExtraArgs,
			LatestSegmentAt:       latestAt,
			LatestSegmentSize:     latestSize,
			LatestSegmentDuration: latestDur,
			TotalSegments:         int(camSegCount),
		})
	}

	// 4. Active Live Streams (Query go2rtc for streams with active consumers, or fallback to live.Tracker)
	activeLiveCount := 0
	webrtcURL := os.Getenv("WEBRTC_SERVICE_URL")
	if webrtcURL == "" {
		webrtcURL = os.Getenv("GO2RTC_URL")
		if webrtcURL == "" {
			webrtcURL = "http://webrtc-service:1984"
		}
	}

	httpClient := &http.Client{Timeout: 800 * time.Millisecond}
	if resp, err := httpClient.Get(webrtcURL + "/api/streams"); err == nil {
		defer resp.Body.Close()
		var streamsMap map[string]struct {
			Consumers []any `json:"consumers"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&streamsMap); err == nil {
			for _, stream := range streamsMap {
				if len(stream.Consumers) > 0 {
					activeLiveCount++
				}
			}
		}
	} else {
		activeLiveCount = len(live.Tracker.ActiveCameraIDs())
	}

	res := &NvrStatusResponse{
		ServiceName:            "HubSight NVR Engine",
		Status:                 "healthy",
		IsGlobalEnabled:        globalSettings.NvrStatus,
		Timestamp:              now,
		System:                 sysStats,
		Storage:                storeStats,
		Cameras:                cameraStatuses,
		ActiveLiveStreamsCount: activeLiveCount,
	}

	return res, nil
}

// NvrStatusHandler handles HTTP GET requests for initial load
func NvrStatusHandler(c *gin.Context) {
	res, err := GetNvrStatusSnapshot(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch NVR status: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

// BroadcastNvrStatus computes snapshot and publishes nvr.status.update to RabbitMQ
func BroadcastNvrStatus(ctx context.Context) error {
	res, err := GetNvrStatusSnapshot(ctx)
	if err != nil {
		return err
	}
	return mq.PublishEvent("nvr.status.update", res)
}

// StartNvrStatusBroadcaster starts a background ticker to publish real-time NVR status
func StartNvrStatusBroadcaster() {
	go func() {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			if database.DB == nil {
				continue
			}
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			if err := BroadcastNvrStatus(ctx); err != nil {
				// Silently skip if MQ or DB is temporarily busy
			}
			cancel()
		}
		log.Println("[NVR] Real-time Status Broadcaster stopped")
	}()
	log.Println("[NVR] Real-time Status Broadcaster started (3s interval over RabbitMQ -> Socket.IO)")
}
