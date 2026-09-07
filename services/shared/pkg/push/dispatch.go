package push

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/notification"

	"firebase.google.com/go/v4/messaging"
	webpush "github.com/SherClockHolmes/webpush-go"
)

const QueueName = "push_queue"

func vapidPublicKey() string {
	return strings.TrimSpace(os.Getenv("VAPID_PUBLIC_KEY"))
}

func deleteSubscription(id string) {
	_ = database.DB.WithContext(context.Background()).Delete(&models.PushSubscription{}, "id = ?", id).Error
}

func dispatchFCM(ctx context.Context, sub *models.PushSubscription, dto notification.NotificationDTO) {
	token := notification.FCMTokenFromEndpoint(sub.Endpoint)
	if token == "" {
		return
	}
	err := sendFCMToToken(ctx, token, dto)
	if err == nil {
		return
	}
	if messaging.IsUnregistered(err) {
		log.Printf("[Push] FCM token expired, removing %s", sub.ID)
		deleteSubscription(sub.ID)
		return
	}
	log.Printf("[Push] FCM error sending to %s: %v", sub.ID, err)
}

func dispatchNativeWebPush(sub *models.PushSubscription, payloadBytes []byte, publicKey, privateKey, subscriber string) {
	s := &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.P256dh,
			Auth:   sub.Auth,
		},
	}

	resp, err := webpush.SendNotification(payloadBytes, s, &webpush.Options{
		Subscriber:      subscriber,
		VAPIDPublicKey:  publicKey,
		VAPIDPrivateKey: privateKey,
		TTL:             3600,
	})
	if err != nil {
		log.Printf("[Push] WebPush error sending to %s: %v", sub.Endpoint, err)
		return
	}
	if resp != nil {
		if resp.StatusCode == http.StatusGone || resp.StatusCode == http.StatusNotFound {
			log.Printf("[Push] Subscription expired (%d), removing %s", resp.StatusCode, sub.ID)
			deleteSubscription(sub.ID)
		}
		_ = resp.Body.Close()
	}
}

// DispatchToSubscribers sends one notification to every stored FCM / Web Push subscription.
func DispatchToSubscribers(ctx context.Context, dto notification.NotificationDTO) {
	var subs []models.PushSubscription
	err := database.DB.WithContext(ctx).Preload("User").Find(&subs).Error
	if err != nil {
		log.Printf("[Push] Failed to load subscriptions: %v", err)
		return
	}
	if len(subs) == 0 {
		return
	}

	publicKey := vapidPublicKey()
	privateKey := strings.TrimSpace(os.Getenv("VAPID_PRIVATE_KEY"))
	subscriber := os.Getenv("VAPID_SUBSCRIBER")
	if subscriber == "" {
		subscriber = "mailto:admin@quoctran.space"
	}

	payloadBytes, err := json.Marshal(dto)
	if err != nil {
		log.Printf("[Push] Failed to marshal payload: %v", err)
		return
	}

	for _, sub := range subs {
		// Check user push preferences if linked to a user
		if sub.User != nil {
			prefs := sub.User.PushPreferences
			prefKey := dto.Category
			// Map alert types to the "stranger" setting umbrella
			if prefKey == "risk" || prefKey == "suspicious" || prefKey == "fall" {
				prefKey = "stranger"
			}

			if enabled, exists := prefs[prefKey]; exists && !enabled {
				continue // User disabled push notifications for this category
			}
		}

		if notification.IsFCMEndpoint(sub.Endpoint) {
			dispatchFCM(ctx, &sub, dto)
			continue
		}
		if publicKey == "" || privateKey == "" {
			log.Printf("[Push] Skipping native subscription %s: VAPID keys are not configured", sub.ID)
			continue
		}
		dispatchNativeWebPush(&sub, payloadBytes, publicKey, privateKey, subscriber)
	}
}
