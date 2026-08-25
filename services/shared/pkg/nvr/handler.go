package nvr

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"runtime"
	"time"

	"cctv/shared/ent"
	"cctv/shared/ent/camera"
	"cctv/shared/ent/recording"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/live"
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
	var storageSum []struct {
		Sum int64 `json:"sum"`
	}
	_ = database.Client.Recording.Query().
		Aggregate(ent.Sum(recording.FieldSizeBytes)).
		Scan(ctx, &storageSum)

	var totalUsedBytes int64 = 0
	if len(storageSum) > 0 {
		totalUsedBytes = storageSum[0].Sum
	}

	totalRecordingsCount, _ := database.Client.Recording.Query().Count(ctx)

	var oldestSegmentAt *time.Time
	if oldestRec, err := database.Client.Recording.Query().Order(ent.Asc(recording.FieldStartAt)).First(ctx); err == nil {
		oldestSegmentAt = &oldestRec.StartAt
	}

	var newestSegmentAt *time.Time
	if newestRec, err := database.Client.Recording.Query().Order(ent.Desc(recording.FieldEndAt)).First(ctx); err == nil {
		newestSegmentAt = &newestRec.EndAt
	}

	// Get global settings
	globalSettings, err := database.Client.Setting.Query().Only(ctx)
	if err != nil {
		globalSettings = &ent.Setting{
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
		TotalSegmentsCount:  totalRecordingsCount,
		OldestSegmentAt:     oldestSegmentAt,
		NewestSegmentAt:     newestSegmentAt,
		RetentionDays:       globalSettings.RetentionDays,
		CleanupIntervalDays: 1,
		RetentionStats:      &storage.CurrentRetentionStats,
	}

	// 3. Per-Camera Recorder Status
	cameras, err := database.Client.Camera.Query().All(ctx)
	if err != nil {
		return nil, err
	}

	cameraStatuses := make([]CameraRecorderStatus, 0, len(cameras))
	now := time.Now()

	for _, cam := range cameras {
		// Query latest segment for this camera
		latestRec, _ := database.Client.Recording.Query().
			Where(recording.HasCameraWith(camera.ID(cam.ID))).
			Order(ent.Desc(recording.FieldEndAt)).
			First(ctx)

		camSegCount, _ := database.Client.Recording.Query().
			Where(recording.HasCameraWith(camera.ID(cam.ID))).
			Count(ctx)

		status := "inactive"
		var latestAt *time.Time
		var latestSize int64 = 0
		var latestDur int = 0

		if latestRec != nil {
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
			if latestRec == nil || now.Sub(latestRec.EndAt) <= maxExpectedAge {
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
			TotalSegments:         camSegCount,
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
			if database.Client == nil {
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
