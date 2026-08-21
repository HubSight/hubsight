package device

import (
	"net/http"
	"os"

	"cctv/ent"
	"cctv/ent/camera"
	"cctv/internal/database"
	"cctv/internal/live"
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

	// Fetch all cameras with AI enabled from the database.
	devices, err := database.Client.Camera.Query().
		Where(camera.IsActive(true), camera.EnableAi(true)).
		Order(ent.Asc("id")).
		All(c.Request.Context())

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch AI cameras"})
		return
	}

	// Filter to only cameras that currently have at least one active viewer.
	// This enables on-demand CV processing: vision-service only spins up threads
	// when a real user is watching, saving significant server resources.
	activeSet := make(map[string]struct{})
	for _, id := range live.Tracker.ActiveCameraIDs() {
		activeSet[id] = struct{}{}
	}

	var result []*ent.Camera
	for _, d := range devices {
		if _, watched := activeSet[d.ID]; watched {
			result = append(result, d)
		}
	}

	if result == nil {
		result = []*ent.Camera{}
	}

	c.JSON(http.StatusOK, result)
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

	c.JSON(http.StatusOK, dev)
}

// Backward compatibility aliases
var (
	ListCamerasHandler  = ListDevicesHandler
	AddCameraHandler    = AddDeviceHandler
	DeleteCameraHandler = DeleteDeviceHandler
	UpdateCameraHandler = UpdateDeviceHandler
)
