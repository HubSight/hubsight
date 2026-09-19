package adminapi

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"cctv/shared/pkg/appconfig"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/nanoid"
	"cctv/shared/pkg/response"
	"cctv/shared/pkg/storage"

	"github.com/gin-gonic/gin"
	"github.com/minio/minio-go/v7"
	"github.com/skip2/go-qrcode"
	"gorm.io/gorm"
)

type adminAppConfigRequest struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	PIN           string `json:"pin" binding:"required"`
	GatewayURL    string `json:"gateway_url"`
	APIBaseURL    string `json:"api_base_url"`
	WebRTCBaseURL string `json:"webrtc_base_url"`
	RelayWSURL    string `json:"relay_ws_url"`
	CACertRaw     string `json:"ca_cert_raw"`
}

type adminDeleteConfirmation struct {
	Confirmation struct {
		Value string `json:"value"`
	} `json:"confirmation"`
}

func adminConfigFromStore(c *gin.Context, id string) (*models.AppConfig, error) {
	var config models.AppConfig
	err := database.DB.WithContext(c.Request.Context()).
		Where("id = ? AND profile = ?", id, appconfig.AdminAPIProfile).
		First(&config).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, gorm.ErrRecordNotFound
	}
	return &config, err
}

func validateAdminConfigPIN(pin string) bool {
	pin = strings.TrimSpace(pin)
	if len(pin) != 6 {
		return false
	}
	for _, char := range pin {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

func adminGatewayURL(c *gin.Context, configured string) string {
	if gateway := strings.TrimRight(strings.TrimSpace(configured), "/"); gateway != "" {
		return gateway
	}
	protocol := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		protocol = "https"
	}
	return fmt.Sprintf("%s://%s", protocol, c.Request.Host)
}

func adminWebSocketURL(gateway string) string {
	if strings.HasPrefix(gateway, "https://") {
		return "wss://" + strings.TrimPrefix(gateway, "https://")
	}
	return "ws://" + strings.TrimPrefix(gateway, "http://")
}

// AdminGenerateAppConfigHandler creates the v2 Admin-only .hscfg package.
// The request intentionally has no Google/Firebase fields.
func AdminGenerateAppConfigHandler(c *gin.Context) {
	var req adminAppConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil || !validateAdminConfigPIN(req.PIN) {
		abortError(c, http.StatusBadRequest, response.ErrInvalidPinFormat, nil)
		return
	}
	client, ok := adminClient(c)
	if !ok {
		abortError(c, http.StatusForbidden, response.ErrInvalidAdminKey, nil)
		return
	}
	userValue, _ := c.Get("user")
	user, _ := userValue.(*models.User)
	if user == nil {
		abortError(c, http.StatusUnauthorized, response.ErrUnauthorized, nil)
		return
	}

	ctx := c.Request.Context()
	configID := nanoid.New()
	now := time.Now().UTC()
	gatewayURL := adminGatewayURL(c, req.GatewayURL)
	apiBaseURL := strings.TrimRight(strings.TrimSpace(req.APIBaseURL), "/")
	if apiBaseURL == "" {
		apiBaseURL = gatewayURL + "/api/admin/v1"
	}
	relayURL := strings.TrimRight(strings.TrimSpace(req.RelayWSURL), "/")
	if relayURL == "" {
		relayURL = adminWebSocketURL(gatewayURL) + "/relay/admin/v1"
	}
	webrtcBaseURL := strings.TrimRight(strings.TrimSpace(req.WebRTCBaseURL), "/")
	if webrtcBaseURL == "" {
		gatewayHost := strings.TrimPrefix(strings.TrimPrefix(gatewayURL, "https://"), "http://")
		if index := strings.Index(gatewayHost, "/"); index >= 0 {
			gatewayHost = gatewayHost[:index]
		}
		if index := strings.Index(gatewayHost, ":"); index >= 0 {
			gatewayHost = gatewayHost[:index]
		}
		webrtcBaseURL = fmt.Sprintf("http://%s:8555", gatewayHost)
	}

	_, signingKey, err := appconfig.GenerateSigningKeyPair()
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrConfigPackFailed, nil)
		return
	}
	packaged, checksum, err := appconfig.PackAdminAndEncrypt(appconfig.PackOptions{
		ConfigID:           configID,
		ConfigName:         strings.TrimSpace(req.Name),
		CreatedByID:        user.ID,
		CreatedByUsername:  user.Username,
		CreatedAt:          now,
		PIN:                strings.TrimSpace(req.PIN),
		GatewayURL:         gatewayURL,
		APIBaseURL:         apiBaseURL,
		RelayWSURL:         relayURL,
		WebRTCBaseURL:      webrtcBaseURL,
		WebRTCSignalingURL: gatewayURL + "/webrtc",
		WebRTCMediaPort:    8555,
		ClientID:           client.ClientID,
		ClientName:         client.Name,
		APIKey:             client.APIKey,
		CACertBytes:        []byte(strings.TrimSpace(req.CACertRaw)),
		SigningPrivateKey:  signingKey,
	})
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrConfigPackFailed, nil)
		return
	}

	if storage.S3Client == nil {
		abortError(c, http.StatusInternalServerError, response.ErrStorageUnavailable, nil)
		return
	}
	objectKey := fmt.Sprintf("admin-configs/hubsight_%s.hscfg", configID)
	if _, err := storage.S3Client.PutObject(ctx, storage.S3Bucket, objectKey, bytes.NewReader(packaged), int64(len(packaged)), minio.PutObjectOptions{
		ContentType: "application/octet-stream",
		UserMetadata: map[string]string{
			"config-id":  configID,
			"profile":    appconfig.AdminAPIProfile,
			"checksum":   checksum,
			"created-by": user.Username,
		},
	}); err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrStorageError, nil)
		return
	}

	stored := models.AppConfig{
		ID:             configID,
		Name:           strings.TrimSpace(req.Name),
		Description:    strings.TrimSpace(req.Description),
		FormatVersion:  appconfig.AdminFormatVersion,
		Profile:        appconfig.AdminAPIProfile,
		ObjectKey:      objectKey,
		FileSize:       int64(len(packaged)),
		SHA256Checksum: checksum,
		ClientID:       client.ClientID,
		GatewayURL:     gatewayURL,
		APIBaseURL:     apiBaseURL,
		WebRTCBaseURL:  webrtcBaseURL,
		RelayWSURL:     relayURL,
		HasCACert:      strings.TrimSpace(req.CACertRaw) != "",
		CreatedBy:      user.Username,
		CreatedAt:      now,
	}
	if err := database.DB.WithContext(ctx).Create(&stored).Error; err != nil {
		_ = storage.S3Client.RemoveObject(ctx, storage.S3Bucket, objectKey, minio.RemoveObjectOptions{})
		abortError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"status":         "ok",
		"config":         stored,
		"profile":        appconfig.AdminAPIProfile,
		"format_version": appconfig.AdminFormatVersion,
		"fcm_enabled":    false,
		"request_id":     c.GetString("request_id"),
	})
}

func AdminListAppConfigsHandler(c *gin.Context) {
	var configs []models.AppConfig
	if err := database.DB.WithContext(c.Request.Context()).
		Where("profile = ?", appconfig.AdminAPIProfile).
		Order("created_at DESC").Find(&configs).Error; err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": configs, "request_id": c.GetString("request_id")})
}

func AdminGetAppConfigHandler(c *gin.Context) {
	config, err := adminConfigFromStore(c, c.Param("config_id"))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		abortError(c, http.StatusNotFound, response.ErrConfigNotFound, nil)
		return
	}
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": config, "fcm_enabled": false, "request_id": c.GetString("request_id")})
}

func AdminCreateDownloadURLHandler(c *gin.Context) {
	config, err := adminConfigFromStore(c, c.Param("config_id"))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		abortError(c, http.StatusNotFound, response.ErrConfigNotFound, nil)
		return
	}
	if err != nil || storage.S3Client == nil {
		abortError(c, http.StatusInternalServerError, response.ErrStorageUnavailable, nil)
		return
	}
	if config.Revoked {
		abortError(c, http.StatusGone, "CONFIG_REVOKED", nil)
		return
	}
	url, err := storage.PresignedGetObjectURL(c.Request.Context(), config.ObjectKey, 15*time.Minute)
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrStorageError, nil)
		return
	}
	_ = database.DB.Model(&models.AppConfig{}).Where("id = ?", config.ID).Update("download_count", gorm.Expr("download_count + 1")).Error
	c.JSON(http.StatusOK, gin.H{"status": "ok", "download_url": url, "expires_in": 900, "sha256": config.SHA256Checksum, "request_id": c.GetString("request_id")})
}

func AdminAppConfigQRHandler(c *gin.Context) {
	config, err := adminConfigFromStore(c, c.Param("config_id"))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		abortError(c, http.StatusNotFound, response.ErrConfigNotFound, nil)
		return
	}
	if err != nil || storage.S3Client == nil {
		abortError(c, http.StatusInternalServerError, response.ErrStorageUnavailable, nil)
		return
	}
	if config.Revoked {
		abortError(c, http.StatusGone, "CONFIG_REVOKED", nil)
		return
	}
	url, err := storage.PresignedGetObjectURL(c.Request.Context(), config.ObjectKey, 24*time.Hour)
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrStorageError, nil)
		return
	}
	payload, err := json.Marshal(gin.H{
		"schema":         "hubsight-admin-config-v2",
		"config_id":      config.ID,
		"profile":        appconfig.AdminAPIProfile,
		"format_version": appconfig.AdminFormatVersion,
		"name":           config.Name,
		"download_url":   url,
		"sha256":         config.SHA256Checksum,
		"file_size":      config.FileSize,
		"fcm_enabled":    false,
	})
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	png, err := qrcode.Encode(string(payload), qrcode.Medium, 320)
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":         "ok",
		"qr_code_base64": "data:image/png;base64," + base64.StdEncoding.EncodeToString(png),
		"download_url":   url,
		"expires_in":     86400,
		"profile":        appconfig.AdminAPIProfile,
		"fcm_enabled":    false,
		"request_id":     c.GetString("request_id"),
	})
}

// AdminRevokeAppConfigHandler disables an Admin .hscfg before expiry while
// retaining its audit metadata. The stored package is not deleted so the
// action remains reviewable and can be correlated with issued configs.
func AdminRevokeAppConfigHandler(c *gin.Context) {
	id, action := splitAction(c.Param("config_id"))
	if action != "revoke" || id == "" {
		abortError(c, http.StatusNotFound, response.ErrConfigNotFound, nil)
		return
	}
	c.Params = append(c.Params, gin.Param{Key: "config_id", Value: id})
	config, err := adminConfigFromStore(c, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		abortError(c, http.StatusNotFound, response.ErrConfigNotFound, nil)
		return
	}
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	var req adminDeleteConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Confirmation.Value) != config.Name {
		abortError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": config.Name})
		return
	}
	if !config.Revoked {
		now := time.Now().UTC()
		if err := database.DB.WithContext(c.Request.Context()).Model(config).Updates(map[string]any{
			"revoked":    true,
			"revoked_at": now,
		}).Error; err != nil {
			abortError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "config_id": config.ID, "revoked": true, "request_id": c.GetString("request_id")})
}

func AdminDeleteAppConfigHandler(c *gin.Context) {
	config, err := adminConfigFromStore(c, c.Param("config_id"))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		abortError(c, http.StatusNotFound, response.ErrConfigNotFound, nil)
		return
	}
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	var req adminDeleteConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Confirmation.Value) != config.Name {
		abortError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": config.Name})
		return
	}
	if storage.S3Client != nil && config.ObjectKey != "" {
		_ = storage.S3Client.RemoveObject(c.Request.Context(), storage.S3Bucket, config.ObjectKey, minio.RemoveObjectOptions{})
	}
	if err := database.DB.WithContext(c.Request.Context()).Delete(config).Error; err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "request_id": c.GetString("request_id")})
}
