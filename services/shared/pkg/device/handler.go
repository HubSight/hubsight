package device

import (
	"net/http"
	"os"

	"cctv/shared/ent"
	"cctv/shared/ent/camera"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/mq"
	"github.com/gin-gonic/gin"
)

func ListDevicesHandler(c *gin.Context) {
	devices, err := GetAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch devices"})
		return
	}

	if devices == nil {
		devices = []*ent.Camera{}
	}

	c.JSON(http.StatusOK, devices)
}

func ListAICamerasHandler(c *gin.Context) {
	// Simple M2M Secret check
	secret := c.GetHeader("X-Service-Key")
	expected := os.Getenv("M2M_SECRET")
	if expected != "" && secret != expected {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized internal access"})
		return
	}

	// Fetch all streaming cameras with AI enabled from database.
	// In Connection Pool mode, CV runs continuously in background 24/7.
	devices, err := database.Client.Camera.Query().
		Where(camera.IsActive(true), camera.IsStopped(false), camera.EnableAi(true)).
		Order(ent.Asc("id")).
		All(c.Request.Context())

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch AI cameras: " + err.Error()})
		return
	}

	if devices == nil {
		devices = []*ent.Camera{}
	}

	c.JSON(http.StatusOK, devices)
}

func ListPoolCamerasHandler(c *gin.Context) {
	// Simple M2M Secret check
	secret := c.GetHeader("X-Service-Key")
	expected := os.Getenv("M2M_SECRET")
	if expected != "" && secret != expected {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized internal access"})
		return
	}

	// Fetch all cameras from DB for pool initialization
	devices, err := database.Client.Camera.Query().
		Order(ent.Asc("id")).
		All(c.Request.Context())

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch cameras for pool: " + err.Error()})
		return
	}

	if devices == nil {
		devices = []*ent.Camera{}
	}

	c.JSON(http.StatusOK, devices)
}

func AddDeviceHandler(c *gin.Context) {
	var req DeviceInput

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	dev, err := Create(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create device"})
		return
	}

	mq.PublishCameraEvent("camera.created", CameraEventPayload(dev))

	c.JSON(http.StatusCreated, dev)
}

func DeleteDeviceHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid device ID"})
		return
	}

	if err := Delete(c.Request.Context(), idStr); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete device"})
		return
	}

	// Notify Connection Pool and Relay of deleted device
	mq.PublishCameraEvent("camera.deleted", gin.H{"id": idStr})

	c.JSON(http.StatusOK, gin.H{"message": "Device deleted successfully"})
}

func UpdateDeviceHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid device ID"})
		return
	}

	var req DeviceInput

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	dev, err := Update(c.Request.Context(), idStr, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update device"})
		return
	}

	mq.PublishCameraEvent("camera.updated", CameraEventPayload(dev))

	c.JSON(http.StatusOK, dev)
}

func pickAlternativeCamera(c *gin.Context, stoppedID string) (id, name string) {
	others, err := database.Client.Camera.Query().
		Where(
			camera.IDNEQ(stoppedID),
			camera.IsActive(true),
			camera.IsStopped(false),
		).
		Order(ent.Asc(camera.FieldID)).
		All(c.Request.Context())
	if err != nil || len(others) == 0 {
		return "", ""
	}
	return others[0].ID, others[0].Name
}

func StopDeviceHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid device ID"})
		return
	}

	dev, err := SetStopped(c.Request.Context(), idStr, true)
	if err != nil {
		if ent.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to stop device"})
		return
	}

	altID, altName := pickAlternativeCamera(c, idStr)
	updatedPayload := CameraEventPayload(dev)
	mq.PublishCameraEvent("camera.updated", updatedPayload)

	stoppedPayload := CameraEventPayload(dev)
	if altID != "" {
		stoppedPayload["alternative_id"] = altID
		stoppedPayload["alternative_name"] = altName
	}
	mq.PublishCameraEvent("camera.stopped", stoppedPayload)

	c.JSON(http.StatusOK, gin.H{
		"camera":           dev,
		"alternative_id":   altID,
		"alternative_name": altName,
	})
}

func StartDeviceHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid device ID"})
		return
	}

	dev, err := SetStopped(c.Request.Context(), idStr, false)
	if err != nil {
		if ent.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start device"})
		return
	}

	payload := CameraEventPayload(dev)
	mq.PublishCameraEvent("camera.updated", payload)
	_ = mq.PublishEvent("camera.started", payload)

	c.JSON(http.StatusOK, dev)
}

// Backward compatibility aliases
var (
	ListCamerasHandler  = ListDevicesHandler
	AddCameraHandler    = AddDeviceHandler
	DeleteCameraHandler = DeleteDeviceHandler
	UpdateCameraHandler = UpdateDeviceHandler
)
