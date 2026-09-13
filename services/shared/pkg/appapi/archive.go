package appapi

import (
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"time"

	"cctv/shared/pkg/recording"
	"cctv/shared/pkg/response"
	"cctv/shared/pkg/storage"

	"github.com/gin-gonic/gin"
)

type ArchiveSegmentDTO struct {
	ID              string    `json:"id"`
	CameraID        string    `json:"camera_id"`
	StartAt         time.Time `json:"start_at"`
	EndAt           time.Time `json:"end_at"`
	DurationSeconds int       `json:"duration_seconds"`
	SizeBytes       int64     `json:"size_bytes"`
	ThumbnailURL    string    `json:"thumbnail_url,omitempty"`
}

// GetArchiveCalendarHandler returns the list of days in a month that have NVR recordings for a camera.
func GetArchiveCalendarHandler(c *gin.Context) {
	cameraID := c.Param("id")
	yearStr := c.Query("year")
	monthStr := c.Query("month")

	year, _ := strconv.Atoi(yearStr)
	month, _ := strconv.Atoi(monthStr)

	if year == 0 || month == 0 {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
		return
	}

	days, err := recording.GetAvailableDays(c.Request.Context(), cameraID, year, month)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, response.ErrInternalServer)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":         "ok",
		"camera_id":      cameraID,
		"year":           year,
		"month":          month,
		"available_days": days,
	})
}

// GetArchiveTimelineHandler returns video segments for timeline scrubbing within a time range.
func GetArchiveTimelineHandler(c *gin.Context) {
	cameraID := c.Param("id")
	fromStr := c.Query("from")
	toStr := c.Query("to")

	from, err := time.Parse(time.RFC3339, fromStr)
	if err != nil {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
		return
	}

	to, err := time.Parse(time.RFC3339, toStr)
	if err != nil {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
		return
	}

	records, err := recording.GetTimeline(c.Request.Context(), from, to, cameraID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, response.ErrInternalServer)
		return
	}

	dtos := make([]ArchiveSegmentDTO, 0, len(records))
	for _, r := range records {
		thumbURL := ""
		if r.ThumbnailPath != nil && *r.ThumbnailPath != "" {
			thumbURL = fmt.Sprintf("/api/app/v1/archive/%s/thumbnail", r.ID)
		}

		dtos = append(dtos, ArchiveSegmentDTO{
			ID:              r.ID,
			CameraID:        r.CameraID,
			StartAt:         r.StartAt,
			EndAt:           r.EndAt,
			DurationSeconds: r.DurationSeconds,
			SizeBytes:       r.SizeBytes,
			ThumbnailURL:    thumbURL,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"camera_id": cameraID,
		"segments":  dtos,
	})
}

// GetArchivePlayStreamHandler provides a presigned direct MP4 playback URL for a recording.
func GetArchivePlayStreamHandler(c *gin.Context) {
	recordingID := c.Param("recording_id")
	rec, err := recording.GetByID(c.Request.Context(), recordingID)
	if err != nil {
		response.Error(c, http.StatusNotFound, response.ErrRecordingNotFound)
		return
	}

	expiry := 2 * time.Hour
	var reqParams url.Values
	if c.Query("download") == "true" {
		reqParams = make(url.Values)
		filename := filepath.Base(rec.FilePath)
		if filename == "" || filename == "." {
			filename = fmt.Sprintf("recording_%s_%s.mp4", rec.ID, rec.StartAt.Format("20060102_150405"))
		}
		reqParams.Set("response-content-disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	}

	presignedURL, err := storage.S3Client.PresignedGetObject(c.Request.Context(), storage.S3Bucket, rec.FilePath, expiry, reqParams)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, response.ErrInternalServer)
		return
	}

	// If redirect param is explicitly false, return JSON (useful for mobile API client libraries)
	if c.Query("redirect") == "false" {
		c.JSON(http.StatusOK, gin.H{
			"status":           "ok",
			"recording_id":     rec.ID,
			"camera_id":        rec.CameraID,
			"stream_url":       presignedURL.String(),
			"duration_seconds": rec.DurationSeconds,
			"size_bytes":       rec.SizeBytes,
			"format":           "mp4",
			"expires_at":       time.Now().Add(expiry),
		})
		return
	}

	// Default: 302 Found redirect for native players (ExoPlayer / AVPlayer)
	c.Redirect(http.StatusFound, presignedURL.String())
}

// GetArchiveThumbnailHandler returns a presigned URL or redirects to the segment thumbnail image.
func GetArchiveThumbnailHandler(c *gin.Context) {
	recordingID := c.Param("recording_id")
	rec, err := recording.GetByID(c.Request.Context(), recordingID)
	if err != nil || rec.ThumbnailPath == nil || *rec.ThumbnailPath == "" {
		response.Error(c, http.StatusNotFound, response.ErrNotFound)
		return
	}

	expiry := 2 * time.Hour
	presignedURL, err := storage.S3Client.PresignedGetObject(c.Request.Context(), storage.S3Bucket, *rec.ThumbnailPath, expiry, nil)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, response.ErrInternalServer)
		return
	}

	if c.Query("redirect") == "false" {
		c.JSON(http.StatusOK, gin.H{
			"status":        "ok",
			"thumbnail_url": presignedURL.String(),
		})
		return
	}

	c.Redirect(http.StatusFound, presignedURL.String())
}
