package nvr

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"runtime"
	"sync"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/live"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/storage"

	"github.com/gin-gonic/gin"
)

var startTime = time.Now()

// storageCache caches expensive aggregate queries on recordings to avoid hammering
// the database on every 10-second broadcast cycle.
var storageCache struct {
	mu             sync.Mutex
	totalUsedBytes int64
	totalCount     int64
	oldestAt       *time.Time
	newestAt       *time.Time
	refreshedAt    time.Time
}

const storageCacheTTL = 30 * time.Second

// refreshStorageCache recomputes the expensive aggregate stats and caches the result.
// It is called at most once per storageCacheTTL interval.
func refreshStorageCache(ctx context.Context) {
	storageCache.mu.Lock()
	defer storageCache.mu.Unlock()

	if time.Since(storageCache.refreshedAt) < storageCacheTTL {
		return
	}

	var totalUsedBytes int64
	_ = database.DB.WithContext(ctx).Model(&models.Recording{}).
		Select("COALESCE(SUM(size_bytes), 0)").
		Scan(&totalUsedBytes).Error

	var totalCount int64
	_ = database.DB.WithContext(ctx).Model(&models.Recording{}).Count(&totalCount).Error

	var oldestRec models.Recording
	var oldestAt *time.Time
	if err := database.DB.WithContext(ctx).Order("start_at ASC").First(&oldestRec).Error; err == nil {
		t := oldestRec.StartAt
		oldestAt = &t
	}

	var newestRec models.Recording
	var newestAt *time.Time
	if err := database.DB.WithContext(ctx).Order("end_at DESC").First(&newestRec).Error; err == nil {
		t := newestRec.EndAt
		newestAt = &t
	}

	storageCache.totalUsedBytes = totalUsedBytes
	storageCache.totalCount = totalCount
	storageCache.oldestAt = oldestAt
	storageCache.newestAt = newestAt
	storageCache.refreshedAt = time.Now()
}

// GetNvrStatusSnapshot computes full statistics of the NVR engine.
// Expensive aggregate queries (SUM, COUNT on recordings) are cached for 30 seconds.
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

	// 2. Storage / Quota stats — served from cache (refreshed every 30s)
	refreshStorageCache(ctx)

	storageCache.mu.Lock()
	totalUsedBytes := storageCache.totalUsedBytes
	totalRecordingsCount := storageCache.totalCount
	oldestSegmentAt := storageCache.oldestAt
	newestSegmentAt := storageCache.newestAt
	storageCache.mu.Unlock()

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

		nvrMode := cam.NvrMode
		if nvrMode == "" {
			nvrMode = "event"
		}
		recordQuality := cam.RecordQuality
		if recordQuality == "" {
			recordQuality = "standard"
		}

		if !cam.IsActive || cam.IsStopped || nvrMode == "disabled" {
			status = "disabled"
		} else if nvrMode == "event" && !cam.EnableAi {
			status = "disabled"
		} else {
			segDuration := cam.SegmentDuration
			if segDuration <= 0 {
				segDuration = 300
			}

			// If the camera is active and NVR mode is active
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
			NvrMode:               nvrMode,
			RecordQuality:         recordQuality,
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
		IsGlobalEnabled:        true,
		AppApiEnabled:          globalSettings.AppApiEnabled,
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

// StartNvrStatusBroadcaster starts a background ticker to publish real-time NVR status.
// Interval is 10s (down from 3s) to reduce DB connection pressure.
// Expensive aggregate queries are cached for 30s (see storageCache).
func StartNvrStatusBroadcaster() {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			if database.DB == nil {
				continue
			}
			// Allow 12s for a full snapshot — long enough to avoid false timeouts
			// on slow cloud DB, but short enough to not starve the pool indefinitely.
			ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
			if err := BroadcastNvrStatus(ctx); err != nil {
				// Silently skip if MQ or DB is temporarily busy
			}
			cancel()
		}
		log.Println("[NVR] Real-time Status Broadcaster stopped")
	}()
	log.Println("[NVR] Real-time Status Broadcaster started (10s interval, 30s aggregate cache)")
}
