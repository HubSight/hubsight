package notification

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"cctv/shared/ent"
	"cctv/shared/ent/notification"
	"cctv/shared/ent/pushsubscription"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/mq"

	"github.com/gin-gonic/gin"
)

type SubscribePushInput struct {
	Endpoint string `json:"endpoint" binding:"required"`
	Keys     struct {
		P256dh string `json:"p256dh" binding:"required"`
		Auth   string `json:"auth" binding:"required"`
	} `json:"keys" binding:"required"`
	UserAgent string `json:"user_agent"`
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

// SubscribePushHandler registers a Web Push subscription
func SubscribePushHandler(c *gin.Context) {
	var input SubscribePushInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid subscription: " + err.Error()})
		return
	}

	ctx := c.Request.Context()

	// Check if already subscribed
	exists, _ := database.Client.PushSubscription.Query().
		Where(pushsubscription.Endpoint(input.Endpoint)).
		First(ctx)

	if exists != nil {
		// Update existing
		_, err := database.Client.PushSubscription.UpdateOneID(exists.ID).
			SetP256dh(input.Keys.P256dh).
			SetAuth(input.Keys.Auth).
			SetUserAgent(input.UserAgent).
			Save(ctx)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update subscription"})
			return
		}
	} else {
		// Create new
		_, err := database.Client.PushSubscription.Create().
			SetEndpoint(input.Endpoint).
			SetP256dh(input.Keys.P256dh).
			SetAuth(input.Keys.Auth).
			SetUserAgent(input.UserAgent).
			Save(ctx)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save subscription"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": "subscribed"})
}

// GetVapidPublicKeyHandler returns the public key for Web Push subscription
func GetVapidPublicKeyHandler(c *gin.Context) {
	// Standard public key for HubSight Web Push
	publicKey := os.Getenv("VAPID_PUBLIC_KEY")
	if publicKey == "" {
		publicKey = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"
	}

	c.JSON(http.StatusOK, gin.H{
		"publicKey": publicKey,
	})
}

// CreateAndDispatchNotification saves notification, broadcasts to Socket.IO, and triggers Web Push
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

	// 1. Broadcast online notification via Socket.IO
	_ = mq.PublishEvent("notification.new", dto)
	log.Printf("[Notification] Created in DB (ID: %s) & broadcasted: %s (%s)", n.ID, title, category)

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

