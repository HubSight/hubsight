package recording

import (
	"net/http"
	"strconv"
	"time"
	"log"

	"cctv/ent"
	"cctv/internal/storage"
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

	camIDStr := c.Query("camera_id")
	var cameraID int
	if camIDStr != "" {
		cameraID, _ = strconv.Atoi(camIDStr)
	}

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
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	rec, err := GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recording not found"})
		return
	}

	expiry := time.Hour * 1
	presignedURL, err := storage.S3Client.PresignedGetObject(c.Request.Context(), storage.S3Bucket, rec.FilePath, expiry, nil)
	if err != nil {
		log.Printf("Failed to generate presigned URL: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get stream"})
		return
	}

	c.Redirect(http.StatusFound, presignedURL.String())
}
