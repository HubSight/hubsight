package device

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/onvif"
	"cctv/shared/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ProbeONVIFInput struct {
	CameraID string `json:"camera_id"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// extractHostIP parses an RTSP or HTTP URL or raw host string and returns just the IP/hostname.
func extractHostIP(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.Contains(raw, "://") {
		if u, err := url.Parse(raw); err == nil {
			return u.Hostname()
		}
	}
	if i := strings.Index(raw, "@"); i >= 0 {
		raw = raw[i+1:]
	}
	if i := strings.Index(raw, "/"); i >= 0 {
		raw = raw[:i]
	}
	if i := strings.Index(raw, ":"); i >= 0 {
		raw = raw[:i]
	}
	return raw
}

// ProbeONVIFHandler inspects an ONVIF camera to discover device info, profiles, and RTSP stream URIs.
func ProbeONVIFHandler(c *gin.Context) {
	var input ProbeONVIFInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
		return
	}

	targetHost := input.Host
	targetPort := input.Port
	username := input.Username
	password := input.Password

	// If camera_id is provided, look up stored credentials
	if input.CameraID != "" {
		var cam models.Camera
		if err := database.DB.WithContext(c.Request.Context()).Where("id = ?", input.CameraID).First(&cam).Error; err == nil {
			if targetHost == "" {
				targetHost = cam.Host
			}
			if targetPort <= 0 {
				targetPort = cam.OnvifPort
			}
			if username == "" {
				username = cam.OnvifUsername
			}
			if password == "" {
				password = cam.OnvifPassword
			}
		}
	}

	cleanIP := extractHostIP(targetHost)
	if cleanIP == "" {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
		return
	}
	if targetPort <= 0 {
		targetPort = 80
	}

	result, err := onvif.ProbeCamera(c.Request.Context(), cleanIP, targetPort, username, password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "error",
			"code":    response.ErrOnvifProbeFailed,
			"error":   response.ErrOnvifProbeFailed,
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, result)
}

type PTZActionInput struct {
	Action string  `json:"action" binding:"required"` // "move" | "relative" | "stop"
	Pan    float64 `json:"pan"`                       // -1.0 to 1.0
	Tilt   float64 `json:"tilt"`                      // -1.0 to 1.0
	Zoom   float64 `json:"zoom"`                      // -1.0 to 1.0
}

// CameraPTZHandler executes real-time Pan/Tilt/Zoom movements on an ONVIF camera.
func CameraPTZHandler(c *gin.Context) {
	camID := c.Param("id")
	if camID == "" {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidDeviceID)
		return
	}

	var input PTZActionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
		return
	}

	var cam models.Camera
	if err := database.DB.WithContext(c.Request.Context()).Where("id = ?", camID).First(&cam).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, http.StatusNotFound, response.ErrDeviceNotFound)
			return
		}
		response.Error(c, http.StatusInternalServerError, response.ErrInternalServer)
		return
	}

	if !cam.OnvifEnabled {
		response.Error(c, http.StatusBadRequest, response.ErrOnvifNotEnabled)
		return
	}

	cleanIP := extractHostIP(cam.Host)
	onvifPort := cam.OnvifPort
	if onvifPort <= 0 {
		onvifPort = 80
	}

	client := onvif.NewClient(cleanIP, onvifPort, cam.OnvifUsername, cam.OnvifPassword)
	_ = client.SyncClockOffset(c.Request.Context())

	profileToken := cam.OnvifProfileToken
	if profileToken == "" {
		profiles, err := client.GetProfiles(c.Request.Context())
		if err == nil && len(profiles) > 0 {
			profileToken = profiles[0].Token
			// Update DB with discovered profile token
			_ = database.DB.Model(&models.Camera{ID: cam.ID}).Update("onvif_profile_token", profileToken)
		}
	}

	if profileToken == "" {
		response.Error(c, http.StatusBadRequest, response.ErrOnvifPtzNotSupported)
		return
	}

	var err error
	switch strings.ToLower(input.Action) {
	case "move", "continuous":
		err = client.ContinuousMove(c.Request.Context(), profileToken, onvif.PTZVector{
			Pan:  input.Pan,
			Tilt: input.Tilt,
			Zoom: input.Zoom,
		})
	case "relative":
		err = client.RelativeMove(c.Request.Context(), profileToken, onvif.PTZVector{
			Pan:  input.Pan,
			Tilt: input.Tilt,
			Zoom: input.Zoom,
		})
	case "stop":
		err = client.Stop(c.Request.Context(), profileToken)
	default:
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
		return
	}

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "error",
			"code":    response.ErrOnvifActionFailed,
			"error":   response.ErrOnvifActionFailed,
			"details": err.Error(),
		})
		return
	}

	response.OK(c)
}

// GetCameraPresetsHandler lists all preset positions saved on the camera.
func GetCameraPresetsHandler(c *gin.Context) {
	camID := c.Param("id")
	if camID == "" {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidDeviceID)
		return
	}

	var cam models.Camera
	if err := database.DB.WithContext(c.Request.Context()).Where("id = ?", camID).First(&cam).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, http.StatusNotFound, response.ErrDeviceNotFound)
			return
		}
		response.Error(c, http.StatusInternalServerError, response.ErrInternalServer)
		return
	}

	if !cam.OnvifEnabled {
		response.Error(c, http.StatusBadRequest, response.ErrOnvifNotEnabled)
		return
	}

	cleanIP := extractHostIP(cam.Host)
	onvifPort := cam.OnvifPort
	if onvifPort <= 0 {
		onvifPort = 80
	}

	client := onvif.NewClient(cleanIP, onvifPort, cam.OnvifUsername, cam.OnvifPassword)
	_ = client.SyncClockOffset(c.Request.Context())

	profileToken := cam.OnvifProfileToken
	if profileToken == "" {
		profiles, err := client.GetProfiles(c.Request.Context())
		if err == nil && len(profiles) > 0 {
			profileToken = profiles[0].Token
		}
	}

	presets, err := client.GetPresets(c.Request.Context(), profileToken)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "error",
			"code":    response.ErrOnvifActionFailed,
			"error":   response.ErrOnvifActionFailed,
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, presets)
}

type ManagePresetInput struct {
	Action      string `json:"action" binding:"required"` // "goto" | "set" | "remove"
	PresetToken string `json:"preset_token"`
	PresetName  string `json:"preset_name"`
}

// ManageCameraPresetsHandler stores, triggers, or removes preset positions on the camera.
func ManageCameraPresetsHandler(c *gin.Context) {
	camID := c.Param("id")
	if camID == "" {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidDeviceID)
		return
	}

	var input ManagePresetInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
		return
	}

	var cam models.Camera
	if err := database.DB.WithContext(c.Request.Context()).Where("id = ?", camID).First(&cam).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, http.StatusNotFound, response.ErrDeviceNotFound)
			return
		}
		response.Error(c, http.StatusInternalServerError, response.ErrInternalServer)
		return
	}

	if !cam.OnvifEnabled {
		response.Error(c, http.StatusBadRequest, response.ErrOnvifNotEnabled)
		return
	}

	cleanIP := extractHostIP(cam.Host)
	onvifPort := cam.OnvifPort
	if onvifPort <= 0 {
		onvifPort = 80
	}

	client := onvif.NewClient(cleanIP, onvifPort, cam.OnvifUsername, cam.OnvifPassword)
	_ = client.SyncClockOffset(c.Request.Context())

	profileToken := cam.OnvifProfileToken
	if profileToken == "" {
		profiles, err := client.GetProfiles(c.Request.Context())
		if err == nil && len(profiles) > 0 {
			profileToken = profiles[0].Token
		}
	}

	switch strings.ToLower(input.Action) {
	case "goto":
		if input.PresetToken == "" {
			response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
			return
		}
		if err := client.GotoPreset(c.Request.Context(), profileToken, input.PresetToken); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"status":  "error",
				"code":    response.ErrOnvifActionFailed,
				"error":   response.ErrOnvifActionFailed,
				"details": err.Error(),
			})
			return
		}
		response.OK(c)

	case "set":
		if input.PresetName == "" {
			response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
			return
		}
		token, err := client.SetPreset(c.Request.Context(), profileToken, input.PresetName)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"status":  "error",
				"code":    response.ErrOnvifActionFailed,
				"error":   response.ErrOnvifActionFailed,
				"details": err.Error(),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{"preset_token": token, "name": input.PresetName})

	case "remove":
		if input.PresetToken == "" {
			response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
			return
		}
		if err := client.RemovePreset(c.Request.Context(), profileToken, input.PresetToken); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"status":  "error",
				"code":    response.ErrOnvifActionFailed,
				"error":   response.ErrOnvifActionFailed,
				"details": err.Error(),
			})
			return
		}
		response.OK(c)

	default:
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
	}
}
