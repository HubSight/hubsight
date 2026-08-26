package notification

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"cctv/shared/ent"
	"cctv/shared/ent/notification"
	"cctv/shared/ent/pushsubscription"
	"cctv/shared/pkg/database"
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

	items, err := database.Client.Notification.Query().
		Order(ent.Desc(notification.FieldCreatedAt)).
		Limit(50).
		All(ctx)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notifications: " + err.Error()})
		return
	}

	unreadCount, _ := database.Client.Notification.Query().
		Where(notification.IsRead(false)).
		Count(ctx)

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
		UnreadCount:   unreadCount,
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

	err := database.Client.Notification.UpdateOneID(id).
		SetIsRead(true).
		Exec(c.Request.Context())

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark read: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// MarkAllReadHandler marks all notifications as read
func MarkAllReadHandler(c *gin.Context) {
	_, err := database.Client.Notification.Update().
		Where(notification.IsRead(false)).
		SetIsRead(true).
		Save(c.Request.Context())

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

	err := database.Client.Notification.DeleteOneID(id).Exec(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete notification: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ClearAllNotificationsHandler deletes every in-app notification.
func ClearAllNotificationsHandler(c *gin.Context) {
	n, err := database.Client.Notification.Delete().Exec(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear notifications: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "deleted": n})
}

func currentUserID(c *gin.Context) string {
	userObj, exists := c.Get("user")
	if !exists {
		return ""
	}
	if u, ok := userObj.(*ent.User); ok && u != nil {
		return u.ID
	}
	return ""
}

func upsertPushSubscription(ctx context.Context, endpoint, p256dh, auth, userAgent, userID string) error {
	exists, _ := database.Client.PushSubscription.Query().
		Where(pushsubscription.Endpoint(endpoint)).
		First(ctx)

	if exists != nil {
		upd := database.Client.PushSubscription.UpdateOneID(exists.ID).
			SetP256dh(p256dh).
			SetAuth(auth).
			SetUserAgent(userAgent)
		if userID != "" {
			upd.SetUserID(userID)
		}
		_, err := upd.Save(ctx)
		return err
	}

	create := database.Client.PushSubscription.Create().
		SetEndpoint(endpoint).
		SetP256dh(p256dh).
		SetAuth(auth).
		SetUserAgent(userAgent)
	if userID != "" {
		create.SetUserID(userID)
	}
	_, err := create.Save(ctx)
	return err
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
// Offline FCM / Web Push is handled by push-service via push_queue.
func CreateAndDispatchNotification(ctx context.Context, cameraID, nType, title, body, category, memberID, thumbURL string) (*ent.Notification, error) {
	n, err := database.Client.Notification.Create().
		SetCameraID(cameraID).
		SetType(nType).
		SetTitle(title).
		SetBody(body).
		SetCategory(category).
		SetMemberID(memberID).
		SetThumbnailURL(thumbURL).
		Save(ctx)

	if err != nil {
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

	return n, nil
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
