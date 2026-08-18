package camera

import (
	"net/http"
	"strconv"
	
	"cctv/ent"
	"github.com/gin-gonic/gin"
)

func ListCamerasHandler(c *gin.Context) {
	cameras, err := GetAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch cameras"})
		return
	}
	
	if cameras == nil {
		cameras = []*ent.Camera{}
	}
	
	c.JSON(http.StatusOK, cameras)
}

func AddCameraHandler(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
		Host string `json:"host" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	cam, err := Create(c.Request.Context(), req.Name, req.Host)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create camera"})
		return
	}

	c.JSON(http.StatusCreated, cam)
}

func DeleteCameraHandler(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid camera ID"})
		return
	}

	if err := Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete camera"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Camera deleted successfully"})
}

func UpdateCameraHandler(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid camera ID"})
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
		Host string `json:"host" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	cam, err := Update(c.Request.Context(), id, req.Name, req.Host)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update camera"})
		return
	}

	c.JSON(http.StatusOK, cam)
}
