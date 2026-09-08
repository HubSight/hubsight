package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"cctv/shared/pkg/appconfig"
	"cctv/shared/pkg/auth"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/google"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/nanoid"
	"cctv/shared/pkg/storage"

	"github.com/gin-gonic/gin"
	"github.com/minio/minio-go/v7"
	"github.com/skip2/go-qrcode"
	"gorm.io/gorm"
)

// GenerateAppConfigRequest is the payload for creating a new .hscfg profile.
type GenerateAppConfigRequest struct {
	Name                   string `json:"name" binding:"required"`
	Description            string `json:"description"`
	PIN                    string `json:"pin" binding:"required"` // 6-digit PIN
	GoogleServiceAccountID string `json:"google_service_account_id"`
	ClientID               string `json:"client_id"`
	AutoCreateClient       bool   `json:"auto_create_client"`
	ClientName             string `json:"client_name"`
	Platform               string `json:"platform"` // "all", "mobile", "desktop"
	GatewayURL             string `json:"gateway_url"`
	APIBaseURL             string `json:"api_base_url"`
	WebRTCBaseURL          string `json:"webrtc_base_url"`
	RelayWSURL             string `json:"relay_ws_url"`
	AndroidConfigRaw       string `json:"android_config_raw"`
	IosConfigRaw           string `json:"ios_config_raw"`
	CACertRaw              string `json:"ca_cert_raw"`
}

// GenerateMobileConfigRequest alias for backward compatibility
type GenerateMobileConfigRequest = GenerateAppConfigRequest

// ListAppConfigs handles GET /api/app-configs (and legacy /api/mobile-configs)
func ListAppConfigs(c *gin.Context) {
	if database.DB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Cơ sở dữ liệu chưa sẵn sàng"})
		return
	}

	var list []models.AppConfig
	if err := database.DB.Preload("Client").Preload("GoogleServiceAccount").Order("created_at DESC").Find(&list).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể truy vấn danh sách cấu hình"})
		return
	}

	c.JSON(http.StatusOK, list)
}

// GetAppConfig handles GET /api/app-configs/:id
func GetAppConfig(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}

	var cfg models.AppConfig
	if err := database.DB.Preload("Client").Preload("GoogleServiceAccount").First(&cfg, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy cấu hình ứng dụng"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi truy vấn cơ sở dữ liệu"})
		return
	}

	c.JSON(http.StatusOK, cfg)
}

// GenerateAppConfig handles POST /api/app-configs
func GenerateAppConfig(c *gin.Context) {
	var req GenerateAppConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu yêu cầu không hợp lệ: " + err.Error()})
		return
	}

	req.PIN = strings.TrimSpace(req.PIN)
	if len(req.PIN) != 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mã PIN bắt buộc phải đúng 6 chữ số"})
		return
	}
	for _, ch := range req.PIN {
		if ch < '0' || ch > '9' {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Mã PIN chỉ được chứa các chữ số từ 0 đến 9"})
			return
		}
	}

	ctx := c.Request.Context()
	var username string
	var userID string
	if u, exists := c.Get("user"); exists {
		if user, ok := u.(*models.User); ok && user != nil {
			username = user.Username
			userID = user.ID
		}
	}

	// 1. Resolve or Create API Client
	platform := strings.TrimSpace(strings.ToLower(req.Platform))
	if platform == "" {
		platform = "all"
	}

	var client models.ApiClient
	if req.AutoCreateClient || strings.TrimSpace(req.ClientID) == "" {
		cName := strings.TrimSpace(req.ClientName)
		if cName == "" {
			cName = fmt.Sprintf("App - %s", req.Name)
		}
		newClientID := auth.GenerateClientId(platform)
		newAPIKey, err := auth.GenerateClientApiKey(platform)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể sinh API Key: " + err.Error()})
			return
		}

		client = models.ApiClient{
			ClientID:     newClientID,
			APIKey:       newAPIKey,
			Name:         cName,
			Platform:     platform,
			ClientType:   "public",
			IsActive:     true,
			IsSystem:     false,
			RateLimitRPS: 60,
		}
		if err := database.DB.Create(&client).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể tự động tạo Client API Key: " + err.Error()})
			return
		}
	} else {
		if err := database.DB.First(&client, "client_id = ?", req.ClientID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Không tìm thấy client ứng dụng đã chọn"})
			return
		}
	}

	// 2. Resolve FCM Configs
	var androidBytes []byte
	var iosBytes []byte
	var gsaProjectID string
	var gsa models.GoogleServiceAccount

	if req.GoogleServiceAccountID != "" {
		if err := database.DB.First(&gsa, "id = ?", req.GoogleServiceAccountID).Error; err == nil {
			gsaProjectID = gsa.ProjectID

			// Fetch Android FCM
			if len(strings.TrimSpace(req.AndroidConfigRaw)) > 0 {
				androidBytes = []byte(req.AndroidConfigRaw)
			} else {
				if _, data, err := google.FetchAndroidConfigFile(ctx, gsa.RawJSON, ""); err == nil {
					androidBytes = data
				}
			}

			// Fetch iOS FCM
			if len(strings.TrimSpace(req.IosConfigRaw)) > 0 {
				iosBytes = []byte(req.IosConfigRaw)
			} else {
				if _, data, err := google.FetchIosConfigFile(ctx, gsa.RawJSON, ""); err == nil {
					iosBytes = data
				}
			}
		}
	} else {
		if len(strings.TrimSpace(req.AndroidConfigRaw)) > 0 {
			androidBytes = []byte(req.AndroidConfigRaw)
		}
		if len(strings.TrimSpace(req.IosConfigRaw)) > 0 {
			iosBytes = []byte(req.IosConfigRaw)
		}
	}

	var caCertBytes []byte
	if len(strings.TrimSpace(req.CACertRaw)) > 0 {
		caCertBytes = []byte(req.CACertRaw)
	}

	// 3. Resolve URLs: Unified Gateway Pattern behind Nginx reverse proxy
	// When deployed, all HTTP/REST and WebSocket traffic (API, Relay, Auth, WebRTC signaling) are unified
	// through the API gateway on the domain (ports 80/443), EXCEPT WebRTC media streaming on port 8555.
	gatewayURL := strings.TrimRight(strings.TrimSpace(req.GatewayURL), "/")
	if gatewayURL == "" {
		proto := "http"
		if c.Request.TLS != nil || c.Request.Header.Get("X-Forwarded-Proto") == "https" {
			proto = "https"
		}
		host := c.Request.Host
		gatewayURL = fmt.Sprintf("%s://%s", proto, host)
	}

	// Unified API Base URL
	apiBaseURL := strings.TrimRight(strings.TrimSpace(req.APIBaseURL), "/")
	if apiBaseURL == "" {
		apiBaseURL = gatewayURL + "/api"
	}

	// Unified Relay WebSocket URL
	relayWSURL := strings.TrimRight(strings.TrimSpace(req.RelayWSURL), "/")
	if relayWSURL == "" {
		wsProto := "ws"
		if strings.HasPrefix(gatewayURL, "https://") {
			wsProto = "wss"
		}
		gatewayHost := strings.TrimPrefix(strings.TrimPrefix(gatewayURL, "https://"), "http://")
		relayWSURL = fmt.Sprintf("%s://%s/relay", wsProto, gatewayHost)
	}

	// WebRTC Exception: WebRTC media uses dedicated streaming port 8555
	webrtcBaseURL := strings.TrimRight(strings.TrimSpace(req.WebRTCBaseURL), "/")
	if webrtcBaseURL == "" {
		// Extract hostname without port from gatewayURL
		gwNoProto := strings.TrimPrefix(strings.TrimPrefix(gatewayURL, "https://"), "http://")
		gwHost := gwNoProto
		if idx := strings.Index(gwHost, ":"); idx != -1 {
			gwHost = gwHost[:idx]
		}
		if idx := strings.Index(gwHost, "/"); idx != -1 {
			gwHost = gwHost[:idx]
		}
		webrtcBaseURL = fmt.Sprintf("http://%s:8555", gwHost)
	}

	configID := nanoid.New()
	now := time.Now().UTC()

	// 4. Pack & Encrypt container
	_, privKey, _ := appconfig.GenerateSigningKeyPair()

	packOpts := appconfig.PackOptions{
		ConfigID:           configID,
		ConfigName:         req.Name,
		CreatedByID:        userID,
		CreatedByUsername:  username,
		CreatedAt:          now,
		PIN:                req.PIN,
		GatewayURL:         gatewayURL,
		APIBaseURL:         apiBaseURL,
		WebRTCBaseURL:      webrtcBaseURL,
		WebRTCSignalingURL: gatewayURL + "/webrtc",
		WebRTCMediaPort:    8555,
		RelayWSURL:         relayWSURL,
		ClientID:           client.ClientID,
		ClientName:         client.Name,
		APIKey:             client.APIKey,
		Platform:           platform,
		AndroidConfigBytes: androidBytes,
		IosConfigBytes:     iosBytes,
		CACertBytes:        caCertBytes,
		SigningPrivateKey:  privKey,
	}

	hscfgBytes, checksum, err := appconfig.PackAndEncrypt(packOpts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể đóng gói container .hscfg: " + err.Error()})
		return
	}

	// 5. Upload to MinIO
	objectKey := fmt.Sprintf("app-configs/hubsight_%s.hscfg", configID)
	if storage.S3Client != nil {
		reader := bytes.NewReader(hscfgBytes)
		_, err := storage.S3Client.PutObject(ctx, storage.S3Bucket, objectKey, reader, int64(len(hscfgBytes)), minio.PutObjectOptions{
			ContentType: "application/octet-stream",
			UserMetadata: map[string]string{
				"config-id":   configID,
				"checksum":    checksum,
				"created-by":  username,
			},
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi lưu file .hscfg lên hệ thống lưu trữ: " + err.Error()})
			return
		}
	} else {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Dịch vụ lưu trữ hệ thống chưa sẵn sàng"})
		return
	}

	// 6. Save DB record
	appCfg := models.AppConfig{
		ID:                     configID,
		Name:                   req.Name,
		Description:            req.Description,
		ObjectKey:              objectKey,
		FileSize:               int64(len(hscfgBytes)),
		SHA256Checksum:         checksum,
		ClientID:               client.ClientID,
		GoogleServiceAccountID: req.GoogleServiceAccountID,
		ProjectID:              gsaProjectID,
		GatewayURL:             gatewayURL,
		APIBaseURL:             apiBaseURL,
		WebRTCBaseURL:          webrtcBaseURL,
		RelayWSURL:             relayWSURL,
		HasAndroidFCM:          len(androidBytes) > 0,
		HasIosFCM:              len(iosBytes) > 0,
		HasCACert:              len(caCertBytes) > 0,
		CreatedBy:              username,
		CreatedAt:              now,
	}

	if err := database.DB.Create(&appCfg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể lưu cấu hình vào cơ sở dữ liệu: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"message": "Đã tạo và mã hóa file cấu hình .hscfg thành công",
		"config":  appCfg,
	})
}

// DownloadAppConfig handles GET /api/app-configs/:id/download
func DownloadAppConfig(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}

	var cfg models.AppConfig
	if err := database.DB.First(&cfg, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy cấu hình ứng dụng"})
		return
	}

	if storage.S3Client == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Dịch vụ lưu trữ hệ thống chưa sẵn sàng"})
		return
	}

	ctx := c.Request.Context()
	obj, err := storage.S3Client.GetObject(ctx, storage.S3Bucket, cfg.ObjectKey, minio.GetObjectOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể đọc file từ hệ thống lưu trữ: " + err.Error()})
		return
	}
	defer obj.Close()

	// Increment download count
	_ = database.DB.Model(&models.AppConfig{}).Where("id = ?", id).Update("download_count", gorm.Expr("download_count + 1")).Error

	filename := fmt.Sprintf("hubsight_%s.hscfg", sanitizeFilename(cfg.Name))
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", fmt.Sprintf("%d", cfg.FileSize))
	c.Header("X-Checksum-SHA256", cfg.SHA256Checksum)

	_, _ = io.Copy(c.Writer, obj)
}

// GetAppConfigQR handles GET /api/app-configs/:id/qr
func GetAppConfigQR(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}

	var cfg models.AppConfig
	if err := database.DB.First(&cfg, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy cấu hình ứng dụng"})
		return
	}

	// Generate a 24-hour Presigned GET URL from MinIO
	ctx := c.Request.Context()
	presignedURL, err := storage.PresignedGetObjectURL(ctx, cfg.ObjectKey, 24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể tạo presigned URL: " + err.Error()})
		return
	}

	// Payload encoded in QR for client app (Mobile or Desktop):
	qrPayload := map[string]interface{}{
		"schema":       "hubsight-config-v1",
		"config_id":    cfg.ID,
		"name":         cfg.Name,
		"download_url": presignedURL,
		"sha256":       cfg.SHA256Checksum,
		"file_size":    cfg.FileSize,
		"gateway_url":  cfg.GatewayURL,
	}
	qrBytes, err := json.Marshal(qrPayload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi mã hóa dữ liệu QR: " + err.Error()})
		return
	}

	pngBytes, err := qrcode.Encode(string(qrBytes), qrcode.Medium, 320)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể tạo mã QR PNG: " + err.Error()})
		return
	}

	qrBase64 := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)
	c.JSON(http.StatusOK, gin.H{
		"qr_code_base64": qrBase64,
		"download_url":   presignedURL,
		"config_id":      cfg.ID,
		"name":           cfg.Name,
		"expires_in":     86400, // 24 hours
	})
}

// DeleteAppConfig handles DELETE /api/app-configs/:id
func DeleteAppConfig(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}

	var cfg models.AppConfig
	if err := database.DB.First(&cfg, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy cấu hình ứng dụng"})
		return
	}

	ctx := c.Request.Context()
	if storage.S3Client != nil && cfg.ObjectKey != "" {
		_ = storage.S3Client.RemoveObject(ctx, storage.S3Bucket, cfg.ObjectKey, minio.RemoveObjectOptions{})
	}

	if err := database.DB.Delete(&cfg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể xóa bản ghi cấu hình"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Đã xóa cấu hình ứng dụng thành công"})
}

// Aliases for backwards compatibility with any remaining mobile naming
var (
	ListMobileConfigs     = ListAppConfigs
	GetMobileConfig       = GetAppConfig
	GenerateMobileConfig  = GenerateAppConfig
	DownloadMobileConfig  = DownloadAppConfig
	GetMobileConfigQR     = GetAppConfigQR
	DeleteMobileConfig    = DeleteAppConfig
)

// PreflightFirebaseApps handles GET /api/google-service-accounts/:id/firebase-preflight
func PreflightFirebaseApps(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}

	var sa models.GoogleServiceAccount
	if err := database.DB.First(&sa, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy service account"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()

	result, err := google.InspectFirebaseProject(ctx, sa.RawJSON)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success":    false,
			"error":      err.Error(),
			"project_id": sa.ProjectID,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"project_id":   result.ProjectID,
		"android_apps": result.AndroidApps,
		"ios_apps":     result.IosApps,
		"web_apps":     result.WebApps,
	})
}

func sanitizeFilename(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var buf strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			buf.WriteRune(r)
		} else if r == ' ' {
			buf.WriteRune('_')
		}
	}
	res := buf.String()
	if res == "" {
		return "profile"
	}
	return res
}
