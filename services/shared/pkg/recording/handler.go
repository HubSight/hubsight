package recording

import (
	"fmt"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"cctv/shared/ent"
	"cctv/shared/pkg/storage"

	"github.com/gin-gonic/gin"
)

func TimelineHandler(c *gin.Context) {
	fromStr := c.Query("from")
	toStr := c.Query("to")

	from, err := time.Parse(time.RFC3339, fromStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'from' date"})
		return
	}

	to, err := time.Parse(time.RFC3339, toStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'to' date"})
		return
	}

	cameraID := c.Query("camera_id")

	recordings, err := GetTimeline(c.Request.Context(), from, to, cameraID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if recordings == nil {
		recordings = []*ent.Recording{}
	}

	c.JSON(http.StatusOK, recordings)
}

func StreamHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	rec, err := GetByID(c.Request.Context(), idStr)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recording not found"})
		return
	}

	expiry := time.Hour * 1
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
		log.Printf("Failed to generate presigned URL: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get stream"})
		return
	}

	c.Redirect(http.StatusFound, presignedURL.String())
}

func AvailableDaysHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	yearStr := c.Query("year")
	monthStr := c.Query("month")
	year, _ := strconv.Atoi(yearStr)
	month, _ := strconv.Atoi(monthStr)

	if year == 0 || month == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Year and month are required"})
		return
	}

	days, err := GetAvailableDays(c.Request.Context(), idStr, year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, days)
}

func ThumbnailHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	rec, err := GetByID(c.Request.Context(), idStr)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recording not found"})
		return
	}

	ext := filepath.Ext(rec.FilePath)
	thumbKey := strings.TrimSuffix(rec.FilePath, ext) + "_thumb.jpg"

	expiry := time.Hour * 2
	presignedURL, err := storage.S3Client.PresignedGetObject(c.Request.Context(), storage.S3Bucket, thumbKey, expiry, nil)
	if err != nil {
		log.Printf("Failed to generate thumbnail presigned URL: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get thumbnail"})
		return
	}

	c.Redirect(http.StatusFound, presignedURL.String())
}
