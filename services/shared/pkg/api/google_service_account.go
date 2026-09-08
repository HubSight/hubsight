package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/nanoid"
	"cctv/shared/pkg/push"

	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2/google"
	"gorm.io/gorm"
)

// GoogleServiceAccountRaw represents the expected structure of a Google Cloud Service Account JSON file.
type GoogleServiceAccountRaw struct {
	Type                    string `json:"type"`
	ProjectID               string `json:"project_id"`
	PrivateKeyID            string `json:"private_key_id"`
	PrivateKey              string `json:"private_key"`
	ClientEmail             string `json:"client_email"`
	ClientID                string `json:"client_id"`
	AuthURI                 string `json:"auth_uri"`
	TokenURI                string `json:"token_uri"`
	AuthProviderX509CertURL string `json:"auth_provider_x509_cert_url"`
	ClientX509CertURL       string `json:"client_x509_cert_url"`
	UniverseDomain          string `json:"universe_domain"`
}

// ParseAndValidateServiceAccountJSON parses and strictly validates raw JSON string.
func ParseAndValidateServiceAccountJSON(raw string) (*GoogleServiceAccountRaw, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("nội dung file JSON trống")
	}

	var sa GoogleServiceAccountRaw
	if err := json.Unmarshal([]byte(raw), &sa); err != nil {
		return nil, fmt.Errorf("định dạng JSON không hợp lệ: %w", err)
	}

	if sa.Type != "service_account" {
		return nil, fmt.Errorf("loại tệp không phải 'service_account' (phát hiện '%s')", sa.Type)
	}
	if strings.TrimSpace(sa.ProjectID) == "" {
		return nil, errors.New("thiếu trường 'project_id' trong file JSON")
	}
	if strings.TrimSpace(sa.ClientEmail) == "" {
		return nil, errors.New("thiếu trường 'client_email' trong file JSON")
	}
	if strings.TrimSpace(sa.PrivateKey) == "" {
		return nil, errors.New("thiếu trường 'private_key' trong file JSON")
	}
	if !strings.Contains(sa.PrivateKey, "-----BEGIN PRIVATE KEY-----") {
		return nil, errors.New("khóa 'private_key' không đúng định dạng RSA PEM chuẩn")
	}

	return &sa, nil
}

// testGoogleOAuth2Connection verifies the credentials against Google STS.
func testGoogleOAuth2Connection(ctx context.Context, rawJSON string) (string, error) {
	testCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	creds, err := google.CredentialsFromJSON(testCtx, []byte(rawJSON), "https://www.googleapis.com/auth/firebase.messaging")
	if err != nil {
		return "", fmt.Errorf("không thể đọc thông tin xác thực Google: %w", err)
	}

	token, err := creds.TokenSource.Token()
	if err != nil {
		return "", fmt.Errorf("xác thực thất bại với Google OAuth2: %w", err)
	}

	if token == nil || token.AccessToken == "" {
		return "", errors.New("Google không trả về access token hợp lệ")
	}

	return fmt.Sprintf("Xác thực thành công. Token có hiệu lực tới %s", token.Expiry.Format("15:04:05 02/01/2006")), nil
}

// ListGoogleServiceAccounts handles GET /api/google-service-accounts
func ListGoogleServiceAccounts(c *gin.Context) {
	if database.DB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database is not connected"})
		return
	}

	var list []models.GoogleServiceAccount
	if err := database.DB.Order("is_active DESC, created_at DESC").Find(&list).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể truy vấn danh sách service accounts"})
		return
	}

	dtos := make([]models.GoogleServiceAccountDTO, len(list))
	for i, sa := range list {
		dtos[i] = sa.ToDTO()
	}

	c.JSON(http.StatusOK, dtos)
}

// GetGoogleServiceAccount handles GET /api/google-service-accounts/:id
func GetGoogleServiceAccount(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}

	var sa models.GoogleServiceAccount
	if err := database.DB.First(&sa, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy service account"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi truy vấn cơ sở dữ liệu"})
		return
	}

	c.JSON(http.StatusOK, sa.ToDTO())
}

// ImportGoogleServiceAccountRequest payload schema.
type ImportGoogleServiceAccountRequest struct {
	Name     string `json:"name"`
	RawJSON  string `json:"raw_json"`
	IsActive *bool  `json:"is_active"`
}

// ImportGoogleServiceAccount handles POST /api/google-service-accounts/import
// Supports both JSON body and multipart/form-data file upload.
func ImportGoogleServiceAccount(c *gin.Context) {
	var (
		rawJSON  string
		name     string
		isActive = true
	)

	// Check if request is multipart/form-data
	contentType := c.GetHeader("Content-Type")
	if strings.Contains(contentType, "multipart/form-data") {
		fileHeader, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Vui lòng chọn file JSON để tải lên"})
			return
		}

		file, err := fileHeader.Open()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Không thể đọc file đã tải lên"})
			return
		}
		defer file.Close()

		fileBytes, err := io.ReadAll(file)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Không thể đọc nội dung file"})
			return
		}
		rawJSON = string(fileBytes)
		name = strings.TrimSpace(c.PostForm("name"))
		if activeStr := c.PostForm("is_active"); activeStr != "" {
			isActive = activeStr == "true" || activeStr == "1"
		}
	} else {
		var req ImportGoogleServiceAccountRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu yêu cầu không hợp lệ"})
			return
		}
		rawJSON = req.RawJSON
		name = strings.TrimSpace(req.Name)
		if req.IsActive != nil {
			isActive = *req.IsActive
		}
	}

	parsed, err := ParseAndValidateServiceAccountJSON(rawJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if name == "" {
		if strings.Contains(parsed.ClientEmail, "firebase-adminsdk") {
			name = fmt.Sprintf("Firebase Admin SDK (%s)", parsed.ProjectID)
		} else {
			name = parsed.ProjectID
		}
	}

	// Current user
	var username string
	if u, exists := c.Get("user"); exists {
		if user, ok := u.(*models.User); ok && user != nil {
			username = user.Username
		}
	}

	// Test credentials against Google OAuth2
	testMsg, testErr := testGoogleOAuth2Connection(c.Request.Context(), rawJSON)
	status := "active"
	lastError := ""
	now := time.Now()
	if testErr != nil {
		status = "error"
		lastError = testErr.Error()
	}

	// Check if account with same project_id and client_email already exists
	var existing models.GoogleServiceAccount
	err = database.DB.Where("project_id = ? AND client_email = ?", parsed.ProjectID, parsed.ClientEmail).First(&existing).Error

	var record models.GoogleServiceAccount
	if err == nil {
		// Update existing
		record = existing
		record.Name = name
		record.Type = parsed.Type
		record.PrivateKeyID = parsed.PrivateKeyID
		record.PrivateKey = parsed.PrivateKey
		record.ClientID = parsed.ClientID
		record.AuthURI = parsed.AuthURI
		record.TokenURI = parsed.TokenURI
		record.AuthProviderCertURL = parsed.AuthProviderX509CertURL
		record.ClientCertURL = parsed.ClientX509CertURL
		record.RawJSON = rawJSON
		record.Status = status
		record.LastTestedAt = &now
		record.LastError = lastError
		record.CreatedBy = username
		if isActive {
			record.IsActive = true
		}
	} else {
		// Create new
		record = models.GoogleServiceAccount{
			ID:                  nanoid.New(),
			Name:                name,
			Type:                parsed.Type,
			ProjectID:           parsed.ProjectID,
			PrivateKeyID:        parsed.PrivateKeyID,
			PrivateKey:          parsed.PrivateKey,
			ClientEmail:         parsed.ClientEmail,
			ClientID:            parsed.ClientID,
			AuthURI:             parsed.AuthURI,
			TokenURI:            parsed.TokenURI,
			AuthProviderCertURL: parsed.AuthProviderX509CertURL,
			ClientCertURL:       parsed.ClientX509CertURL,
			RawJSON:             rawJSON,
			IsActive:            isActive,
			Status:              status,
			LastTestedAt:        &now,
			LastError:           lastError,
			CreatedBy:           username,
		}
	}

	err = database.DB.Transaction(func(tx *gorm.DB) error {
		if record.IsActive {
			// Deactivate all other accounts
			if err := tx.Model(&models.GoogleServiceAccount{}).Where("id != ?", record.ID).Update("is_active", false).Error; err != nil {
				return err
			}
		}
		return tx.Save(&record).Error
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể lưu service account vào cơ sở dữ liệu: " + err.Error()})
		return
	}

	// Reload FCM client
	_ = push.ReloadFCMClient(c.Request.Context())

	resp := gin.H{
		"account": record.ToDTO(),
		"message": "Nhập Google Service Account thành công",
	}
	if testErr != nil {
		resp["warning"] = "Cảnh báo xác thực: " + testErr.Error()
	} else {
		resp["test_result"] = testMsg
	}

	c.JSON(http.StatusCreated, resp)
}

// ActivateGoogleServiceAccount handles PUT /api/google-service-accounts/:id/activate
func ActivateGoogleServiceAccount(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}

	var sa models.GoogleServiceAccount
	if err := database.DB.First(&sa, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy service account"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi truy vấn cơ sở dữ liệu"})
		return
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.GoogleServiceAccount{}).Where("id != ?", id).Update("is_active", false).Error; err != nil {
			return err
		}
		return tx.Model(&models.GoogleServiceAccount{}).Where("id = ?", id).Update("is_active", true).Error
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể kích hoạt service account"})
		return
	}

	sa.IsActive = true
	_ = push.ReloadFCMClient(c.Request.Context())

	c.JSON(http.StatusOK, sa.ToDTO())
}

// TestGoogleServiceAccount handles POST /api/google-service-accounts/:id/test
func TestGoogleServiceAccount(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}

	var sa models.GoogleServiceAccount
	if err := database.DB.First(&sa, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy service account"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi truy vấn cơ sở dữ liệu"})
		return
	}

	msg, err := testGoogleOAuth2Connection(c.Request.Context(), sa.RawJSON)
	now := time.Now()
	sa.LastTestedAt = &now

	if err != nil {
		sa.Status = "error"
		sa.LastError = err.Error()
		_ = database.DB.Model(&models.GoogleServiceAccount{}).Where("id = ?", id).Updates(map[string]interface{}{
			"status":         "error",
			"last_tested_at": &now,
			"last_error":     err.Error(),
		}).Error

		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
			"status":  "error",
		})
		return
	}

	sa.Status = "active"
	sa.LastError = ""
	_ = database.DB.Model(&models.GoogleServiceAccount{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":         "active",
		"last_tested_at": &now,
		"last_error":     "",
	}).Error

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": msg,
		"status":  "active",
	})
}

// DeleteGoogleServiceAccount handles DELETE /api/google-service-accounts/:id
func DeleteGoogleServiceAccount(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}

	var sa models.GoogleServiceAccount
	if err := database.DB.First(&sa, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy service account"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi truy vấn cơ sở dữ liệu"})
		return
	}

	wasActive := sa.IsActive

	if err := database.DB.Delete(&sa).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể xóa service account"})
		return
	}

	// If the deleted account was active, activate the next most recent one if available
	if wasActive {
		var next models.GoogleServiceAccount
		if err := database.DB.Order("updated_at DESC").First(&next).Error; err == nil {
			database.DB.Model(&models.GoogleServiceAccount{}).Where("id = ?", next.ID).Update("is_active", true)
		}
	}

	_ = push.ReloadFCMClient(c.Request.Context())

	c.JSON(http.StatusOK, gin.H{"message": "Đã xóa service account thành công"})
}
