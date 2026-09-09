package appapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/notification"

	"github.com/gin-gonic/gin"
)

type RegisterPushTokenRequest struct {
	FCMToken   string `json:"fcm_token" binding:"required"`
	DeviceName string `json:"device_name"`
	Platform   string `json:"platform"`
	AppVersion string `json:"app_version"`
	OSVersion  string `json:"os_version"`
}

type UnregisterPushTokenRequest struct {
	FCMToken string `json:"fcm_token" binding:"required"`
}

type AppNotificationDTO struct {
	ID           string    `json:"id"`
	CameraID     string    `json:"camera_id"`
	Type         string    `json:"type"`
	Title        string    `json:"title"`
	Body         string    `json:"body"`
	Category     string    `json:"category"`
	MemberID     string    `json:"member_id,omitempty"`
	ThumbnailURL string    `json:"thumbnail_url,omitempty"`
	IsRead       bool      `json:"is_read"`
	CreatedAt    time.Time `json:"created_at"`
}

func getAppUserID(c *gin.Context) string {
	userObj, exists := c.Get("user")
	if !exists {
		return ""
	}
	if u, ok := userObj.(*models.User); ok && u != nil {
		return u.ID
	}
	return ""
}

// RegisterPushTokenHandler registers an FCM device token for push notifications.
func RegisterPushTokenHandler(c *gin.Context) {
	var req RegisterPushTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "error",
			"code":    "INVALID_INPUT",
			"message": "FCM Token là bắt buộc.",
		})
		return
	}

	token := strings.TrimSpace(req.FCMToken)
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "error",
			"message": "FCM Token không được để trống.",
		})
		return
	}

	endpoint := notification.FCMEndpointPrefix + token
	userAgent := req.DeviceName
	if req.Platform != "" {
		userAgent = req.Platform + " - " + userAgent
	}
	if req.OSVersion != "" {
		userAgent = userAgent + " (" + req.OSVersion + ")"
	}

	userID := getAppUserID(c)

	var sub models.PushSubscription
	err := database.DB.WithContext(c.Request.Context()).
		Where("endpoint = ?", endpoint).
		First(&sub).Error

	if err == nil {
		updates := map[string]any{
			"p256dh":     "fcm",
			"auth":       "fcm",
			"user_agent": userAgent,
		}
		if userID != "" {
			updates["user_id"] = userID
		}
		_ = database.DB.WithContext(c.Request.Context()).
			Model(&models.PushSubscription{ID: sub.ID}).
			Updates(updates).Error

		c.JSON(http.StatusOK, gin.H{
			"status":    "ok",
			"message":   "Đăng ký token thành công.",
			"device_id": sub.ID,
		})
		return
	}

	newSub := models.PushSubscription{
		Endpoint:  endpoint,
		P256dh:    "fcm",
		Auth:      "fcm",
		UserAgent: userAgent,
		UserID:    userID,
	}
	if err := database.DB.WithContext(c.Request.Context()).Create(&newSub).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  "error",
			"message": "Lỗi lưu đăng ký FCM token: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"message":   "Đăng ký token thành công.",
		"device_id": newSub.ID,
	})
}

// UnregisterPushTokenHandler revokes an FCM device token on logout or uninstall.
func UnregisterPushTokenHandler(c *gin.Context) {
	var req UnregisterPushTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "error",
			"message": "FCM Token là bắt buộc.",
		})
		return
	}

	token := strings.TrimSpace(req.FCMToken)
	endpoint := notification.FCMEndpointPrefix + token

	_ = database.DB.WithContext(c.Request.Context()).
		Where("endpoint = ?", endpoint).
		Delete(&models.PushSubscription{}).Error

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"message": "Hủy đăng ký token thành công.",
	})
}

// GetUnreadCountHandler is an ultra-fast query for app icon notification badge counter.
func GetUnreadCountHandler(c *gin.Context) {
	var unreadCount int64
	_ = database.DB.WithContext(c.Request.Context()).
		Model(&models.Notification{}).
		Where("is_read = ?", false).
		Count(&unreadCount).Error

	c.JSON(http.StatusOK, gin.H{
		"status":       "ok",
		"unread_count": int(unreadCount),
	})
}

// ListNotificationsHandler lists notifications with pagination and filters.
func ListNotificationsHandler(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	q := database.DB.WithContext(c.Request.Context()).Model(&models.Notification{})

	if camID := c.Query("camera_id"); camID != "" {
		q = q.Where("camera_id = ?", camID)
	}
	if notifType := c.Query("type"); notifType != "" {
		q = q.Where("type = ?", notifType)
	}
	if isReadStr := c.Query("is_read"); isReadStr != "" {
		if isReadStr == "true" {
			q = q.Where("is_read = ?", true)
		} else if isReadStr == "false" {
			q = q.Where("is_read = ?", false)
		}
	}

	var total int64
	_ = q.Count(&total).Error

	var unreadCount int64
	_ = database.DB.WithContext(c.Request.Context()).
		Model(&models.Notification{}).
		Where("is_read = ?", false).
		Count(&unreadCount).Error

	var items []models.Notification
	err := q.Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&items).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  "error",
			"message": "Lỗi lấy danh sách thông báo: " + err.Error(),
		})
		return
	}

	dtos := make([]AppNotificationDTO, 0, len(items))
	for _, it := range items {
		dtos = append(dtos, AppNotificationDTO{
			ID:           it.ID,
			CameraID:     it.CameraID,
			Type:         it.Type,
			Title:        it.Title,
			Body:         it.Body,
			Category:     it.Category,
			MemberID:     it.MemberID,
			ThumbnailURL: it.ThumbnailURL,
			IsRead:       it.IsRead,
			CreatedAt:    it.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"status":       "ok",
		"unread_count": int(unreadCount),
		"page":         page,
		"limit":        limit,
		"total":        total,
		"items":        dtos,
	})
}

// MarkNotificationReadHandler marks a single notification as read.
func MarkNotificationReadHandler(c *gin.Context) {
	id := c.Param("id")
	res := database.DB.WithContext(c.Request.Context()).
		Model(&models.Notification{ID: id}).
		Update("is_read", true)

	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": "error", "message": res.Error.Error()})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"status": "error", "message": "Thông báo không tồn tại."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Đã đánh dấu đọc."})
}

// MarkAllNotificationsReadHandler marks all notifications as read.
func MarkAllNotificationsReadHandler(c *gin.Context) {
	_ = database.DB.WithContext(c.Request.Context()).
		Model(&models.Notification{}).
		Where("is_read = ?", false).
		Update("is_read", true).Error

	c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Đã đánh dấu đọc tất cả thông báo."})
}

// DeleteNotificationHandler removes a notification record.
func DeleteNotificationHandler(c *gin.Context) {
	id := c.Param("id")
	res := database.DB.WithContext(c.Request.Context()).
		Where("id = ?", id).
		Delete(&models.Notification{})

	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": "error", "message": res.Error.Error()})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"status": "error", "message": "Thông báo không tồn tại."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Xóa thông báo thành công."})
}
