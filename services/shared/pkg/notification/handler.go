package notification

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/mq"

	"github.com/gin-gonic/gin"
)

type SubscribePushKeys struct {
	P256dh string `json:"p256dh"`
	Auth   string `json:"auth"`
}

type SubscribePushInput struct {
	Token     string             `json:"token"`
	Endpoint  string             `json:"endpoint"`
	Keys      *SubscribePushKeys `json:"keys"`
	UserAgent string             `json:"user_agent"`
}

type NotificationDTO struct {
	ID           string    `json:"id"`
	CameraID     string    `json:"camera_id"`
	Type         string    `json:"type"`
	Title        string    `json:"title"`
	Body         string    `json:"body"`
	Category     string    `json:"category"`
	MemberID     string    `json:"member_id"`
	ThumbnailURL string    `json:"thumbnail_url"`
	IsRead       bool      `json:"is_read"`
	CreatedAt    time.Time `json:"created_at"`
}

type ListNotificationsResponse struct {
	UnreadCount   int               `json:"unread_count"`
	Notifications []NotificationDTO `json:"notifications"`
}

// ListNotificationsHandler returns recent notifications and unread counter
func ListNotificationsHandler(c *gin.Context) {
	ctx := c.Request.Context()

	var items []*models.Notification
	if err := database.DB.WithContext(ctx).
		Order("created_at DESC").
		Limit(50).
		Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notifications: " + err.Error()})
		return
	}

	var unreadCount int64
	_ = database.DB.WithContext(ctx).
		Model(&models.Notification{}).
		Where("is_read = ?", false).
		Count(&unreadCount).Error

	dtos := make([]NotificationDTO, 0, len(items))
	for _, item := range items {
		dtos = append(dtos, NotificationDTO{
			ID:           item.ID,
			CameraID:     item.CameraID,
			Type:         item.Type,
			Title:        item.Title,
			Body:         item.Body,
			Category:     item.Category,
			MemberID:     item.MemberID,
			ThumbnailURL: item.ThumbnailURL,
			IsRead:       item.IsRead,
			CreatedAt:    item.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, ListNotificationsResponse{
		UnreadCount:   int(unreadCount),
		Notifications: dtos,
	})
}

// MarkReadHandler marks a single notification as read
func MarkReadHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid notification ID"})
		return
	}

	err := database.DB.WithContext(c.Request.Context()).
		Model(&models.Notification{ID: id}).
		Update("is_read", true).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark read: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// MarkAllReadHandler marks all notifications as read
func MarkAllReadHandler(c *gin.Context) {
	err := database.DB.WithContext(c.Request.Context()).
		Model(&models.Notification{}).
		Where("is_read = ?", false).
		Update("is_read", true).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark all read: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// DeleteNotificationHandler deletes a notification
func DeleteNotificationHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid notification ID"})
		return
	}

	err := database.DB.WithContext(c.Request.Context()).
		Where("id = ?", id).
		Delete(&models.Notification{}).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete notification: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ClearAllNotificationsHandler deletes every in-app notification.
func ClearAllNotificationsHandler(c *gin.Context) {
	res := database.DB.WithContext(c.Request.Context()).
		Where("1 = 1").
		Delete(&models.Notification{})

	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear notifications: " + res.Error.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "deleted": res.RowsAffected})
}

func currentUserID(c *gin.Context) string {
	userObj, exists := c.Get("user")
	if !exists {
		return ""
	}
	if u, ok := userObj.(*models.User); ok && u != nil {
		return u.ID
	}
	return ""
}

func upsertPushSubscription(ctx context.Context, endpoint, p256dh, auth, userAgent, userID string) error {
	var sub models.PushSubscription
	err := database.DB.WithContext(ctx).Where("endpoint = ?", endpoint).First(&sub).Error
	if err == nil {
		updates := map[string]any{
			"p256dh":     p256dh,
			"auth":       auth,
			"user_agent": userAgent,
		}
		if userID != "" {
			updates["user_id"] = userID
		}
		return database.DB.WithContext(ctx).Model(&models.PushSubscription{ID: sub.ID}).Updates(updates).Error
	}

	create := models.PushSubscription{
		Endpoint:  endpoint,
		P256dh:    p256dh,
		Auth:      auth,
		UserAgent: userAgent,
		UserID:    userID,
	}
	return database.DB.WithContext(ctx).Create(&create).Error
}

// SubscribePushHandler registers an FCM token (preferred) or a native Web Push subscription.
func SubscribePushHandler(c *gin.Context) {
	var input SubscribePushInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid subscription: " + err.Error()})
		return
	}

	token := strings.TrimSpace(input.Token)
	endpoint := strings.TrimSpace(input.Endpoint)
	p256dh := ""
	auth := ""
	if input.Keys != nil {
		p256dh = input.Keys.P256dh
		auth = input.Keys.Auth
	}

	switch {
	case token != "":
		endpoint = fcmEndpointFromToken(token)
		p256dh = fcmPlaceholder
		auth = fcmPlaceholder
	case endpoint != "" && p256dh != "" && auth != "":
		// Native Web Push subscription (endpoint + VAPID keys).
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "FCM token or Web Push endpoint+keys is required"})
		return
	}

	ctx := c.Request.Context()
	if err := upsertPushSubscription(ctx, endpoint, p256dh, auth, input.UserAgent, currentUserID(c)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save subscription"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "subscribed"})
}

func vapidPublicKey() string {
	return strings.TrimSpace(os.Getenv("VAPID_PUBLIC_KEY"))
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func firebaseWebConfig() gin.H {
	projectID := firstNonEmpty(os.Getenv("FIREBASE_WEB_PROJECT_ID"), os.Getenv("FIREBASE_PROJECT_ID"))
	return gin.H{
		"apiKey":            os.Getenv("FIREBASE_WEB_API_KEY"),
		"authDomain":        os.Getenv("FIREBASE_WEB_AUTH_DOMAIN"),
		"projectId":         projectID,
		"storageBucket":     os.Getenv("FIREBASE_WEB_STORAGE_BUCKET"),
		"messagingSenderId": os.Getenv("FIREBASE_WEB_MESSAGING_SENDER_ID"),
		"appId":             os.Getenv("FIREBASE_WEB_APP_ID"),
	}
}

// GetPushConfigHandler returns public Firebase web config + VAPID public key.
func GetPushConfigHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"vapidPublicKey": vapidPublicKey(),
		"firebase":       firebaseWebConfig(),
	})
}

// GetVapidPublicKeyHandler returns the public key for Web Push subscription
func GetVapidPublicKeyHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"publicKey": vapidPublicKey(),
	})
}

// CreateAndDispatchNotification saves the inbox row and publishes MQ events.
func CreateAndDispatchNotification(ctx context.Context, cameraID, nType, title, body, category, memberID, thumbURL string) (*models.Notification, error) {
	n := models.Notification{
		CameraID:     cameraID,
		Type:         nType,
		Title:        title,
		Body:         body,
		Category:     category,
		MemberID:     memberID,
		ThumbnailURL: thumbURL,
	}

	if err := database.DB.WithContext(ctx).Create(&n).Error; err != nil {
		return nil, err
	}

	dto := NotificationDTO{
		ID:           n.ID,
		CameraID:     n.CameraID,
		Type:         n.Type,
		Title:        n.Title,
		Body:         n.Body,
		Category:     n.Category,
		MemberID:     n.MemberID,
		ThumbnailURL: n.ThumbnailURL,
		IsRead:       n.IsRead,
		CreatedAt:    n.CreatedAt,
	}

	_ = mq.PublishEvent("notification.new", dto)
	_ = mq.PublishToQueue("nvr_recorder_queue", "notification.new", dto)
	_ = mq.PublishToQueue("push_queue", "notification.new", dto)
	log.Printf("[Notification] Created in DB (ID: %s) & published: %s (%s)", n.ID, title, category)

	return &n, nil
}

type IngestVisionEventInput struct {
	CameraID   string `json:"camera_id" binding:"required"`
	CameraName string `json:"camera_name"`
	Type       string `json:"type"`
	Name       string `json:"name"`
	Role       string `json:"role"`
	MemberID   string `json:"member_id"`
	ThumbURL   string `json:"thumbnail_url"`
}

// IngestVisionEventHandler handles vision service notification ingestion
func IngestVisionEventHandler(c *gin.Context) {
	var input IngestVisionEventInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := IngestVisionEvent(
		c.Request.Context(),
		input.CameraID,
		input.CameraName,
		input.Type,
		input.Name,
		input.Role,
		input.MemberID,
		input.ThumbURL,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to ingest notification: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// TestPushHandler triggers a dummy test notification for verifying Web Push.
func TestPushHandler(c *gin.Context) {
	_, err := CreateAndDispatchNotification(
		c.Request.Context(),
		"", // cameraID
		"system",
		"Test Push Notification",
		"This is a test notification triggered from the UI.",
		"system",
		"",
		"",
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
