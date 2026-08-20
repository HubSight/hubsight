package nvr

import (
	"net/http"
	"runtime"
	"time"

	"cctv/ent"
	"cctv/ent/camera"
	"cctv/ent/recording"
	"cctv/internal/database"
	"cctv/internal/storage"
	"github.com/gin-gonic/gin"
)

var startTime = time.Now()

func NvrStatusHandler(c *gin.Context) {
	ctx := c.Request.Context()

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

	quotaBytes := int64(storage.ThresholdBytes)
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
		RetentionDays:       3,
		CleanupIntervalDays: 1,
		RetentionStats:      &storage.CurrentRetentionStats,
	}

	// 3. Per-Camera Recorder Status
	cameras, err := database.Client.Camera.Query().All(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch cameras: " + err.Error()})
		return
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

		if cam.IsActive {
			segDuration := cam.SegmentDuration
			if segDuration <= 0 {
				segDuration = 300
			}

			// If the camera is active and we received a segment within (2 * segment_duration + 90s)
			maxExpectedAge := time.Duration(segDuration*2+90) * time.Second
			if latestRec != nil && now.Sub(latestRec.EndAt) <= maxExpectedAge {
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

	// 4. Active Live Streams
	activeLiveCount := 0
	// go2rtc manages live streams on the fly, so we don't track active sessions here natively anymore.
	// For NVR status, we can just report the number of active cameras as a proxy.
	for _, s := range cameraStatuses {
		if s.IsActive {
			activeLiveCount++
		}
	}

	res := NvrStatusResponse{
		ServiceName:            "CCTV NVR Engine",
		Status:                 "healthy",
		Timestamp:              now,
		System:                 sysStats,
		Storage:                storeStats,
		Cameras:                cameraStatuses,
		ActiveLiveStreamsCount: activeLiveCount,
	}

	c.JSON(http.StatusOK, res)
}
