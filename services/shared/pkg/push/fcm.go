package push

import (
	"context"
	"encoding/json"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/notification"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

var (
	fcmMu     sync.RWMutex
	fcmOnce   sync.Once
	fcmClient *messaging.Client
	fcmErr    error
)

// ReloadFCMClient resets and reloads the cached FCM messaging client.
func ReloadFCMClient(ctx context.Context) error {
	fcmMu.Lock()
	defer fcmMu.Unlock()
	fcmClient = nil
	fcmErr = nil
	fcmOnce = sync.Once{}
	_, err := getFCMClient(ctx)
	return err
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func firebaseCredentialsJSON() ([]byte, string) {
	// 1. Check database for active GoogleServiceAccount
	if database.DB != nil {
		var sa models.GoogleServiceAccount
		if err := database.DB.Where("is_active = ?", true).Order("updated_at DESC").First(&sa).Error; err == nil && len(sa.RawJSON) > 0 {
			return []byte(sa.RawJSON), sa.ProjectID
		}
	}

	// 2. Fallback to FIREBASE_CREDENTIALS_JSON environment variable
	if raw := strings.TrimSpace(os.Getenv("FIREBASE_CREDENTIALS_JSON")); raw != "" {
		projectID := firstNonEmpty(os.Getenv("FIREBASE_PROJECT_ID"), os.Getenv("FIREBASE_WEB_PROJECT_ID"))
		return []byte(raw), projectID
	}

	// 3. Fallback to individual FIREBASE_* env vars
	projectID := firstNonEmpty(os.Getenv("FIREBASE_PROJECT_ID"), os.Getenv("FIREBASE_WEB_PROJECT_ID"))
	clientEmail := os.Getenv("FIREBASE_CLIENT_EMAIL")
	privateKey := os.Getenv("FIREBASE_PRIVATE_KEY")
	if projectID == "" || clientEmail == "" || privateKey == "" {
		return nil, ""
	}

	privateKey = strings.ReplaceAll(privateKey, "\\n", "\n")
	body, err := json.Marshal(map[string]string{
		"type":         "service_account",
		"project_id":   projectID,
		"client_email": clientEmail,
		"private_key":  privateKey,
		"token_uri":    "https://oauth2.googleapis.com/token",
	})
	if err != nil {
		return nil, ""
	}
	return body, projectID
}

func getFCMClient(ctx context.Context) (*messaging.Client, error) {
	fcmMu.RLock()
	if fcmClient != nil {
		defer fcmMu.RUnlock()
		return fcmClient, nil
	}
	fcmMu.RUnlock()

	fcmMu.Lock()
	defer fcmMu.Unlock()

	fcmOnce.Do(func() {
		var opts []option.ClientOption
		creds, credsProjectID := firebaseCredentialsJSON()
		if len(creds) > 0 {
			opts = append(opts, option.WithCredentialsJSON(creds))
		} else if path := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"); path != "" {
			opts = append(opts, option.WithCredentialsFile(path))
		} else {
			fcmErr = errFCMNotConfigured
			return
		}

		projectID := firstNonEmpty(credsProjectID, os.Getenv("FIREBASE_PROJECT_ID"), os.Getenv("FIREBASE_WEB_PROJECT_ID"))
		cfg := &firebase.Config{ProjectID: projectID}
		app, err := firebase.NewApp(ctx, cfg, opts...)
		if err != nil {
			fcmErr = err
			return
		}
		client, err := app.Messaging(ctx)
		if err != nil {
			fcmErr = err
			return
		}
		fcmClient = client
	})
	if fcmErr != nil {
		return nil, fcmErr
	}
	return fcmClient, nil
}

type fcmConfigError struct{}

func (e *fcmConfigError) Error() string {
	return "firebase credentials are not configured"
}

var errFCMNotConfigured = &fcmConfigError{}

func buildFCMMessage(token string, dto notification.NotificationDTO) *messaging.Message {
	playbackPath := "/playback"
	if dto.CameraID != "" {
		playbackPath += "?camera_id=" + dto.CameraID
		if !dto.CreatedAt.IsZero() {
			playbackPath += "&t=" + strconv.FormatInt(dto.CreatedAt.UnixMilli(), 10)
		}
	}

	data := map[string]string{
		"id":            dto.ID,
		"camera_id":     dto.CameraID,
		"type":          dto.Type,
		"title":         dto.Title,
		"body":          dto.Body,
		"category":      dto.Category,
		"member_id":     dto.MemberID,
		"thumbnail_url": dto.ThumbnailURL,
		"created_at":    dto.CreatedAt.Format(time.RFC3339),
		"url":           playbackPath,
	}

	return &messaging.Message{
		Token: token,
		Data:  data,
		Webpush: &messaging.WebpushConfig{
			Headers: map[string]string{
				"Urgency": "high",
				"TTL":     "3600",
			},
			Data: data,
		},
		FCMOptions: &messaging.FCMOptions{
			AnalyticsLabel: "hubsight_alerts",
		},
	}
}

func sendFCMToToken(ctx context.Context, token string, dto notification.NotificationDTO) error {
	client, err := getFCMClient(ctx)
	if err != nil {
		return err
	}
	_, err = client.Send(ctx, buildFCMMessage(token, dto))
	return err
}
