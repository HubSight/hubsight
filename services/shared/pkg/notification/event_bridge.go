package notification

import (
	"context"
	"fmt"
	"sync"
	"time"

	"cctv/shared/pkg/database"
)

var (
	debounceLock sync.Mutex
	lastNotifMap = make(map[string]time.Time) // key -> lastSentTime
)

// IngestVisionEvent ingests a vision recognition event and creates a rich deduplicated notification
func IngestVisionEvent(ctx context.Context, cameraID, cameraName, eventType, name, role, memberID, thumbURL string) error {
	now := time.Now()
	timeStr := now.Format("15:04:05 02/01/2006")

	// If cameraName is empty, attempt lookup from DB
	if cameraName == "" && cameraID != "" {
		if cam, err := database.Client.Camera.Get(ctx, cameraID); err == nil && cam != nil {
			cameraName = cam.Name
		}
	}
	if cameraName == "" {
		cameraName = "Camera"
	}

	// Deduplicate: Don't create notification if same person at same camera was notified in last 60 seconds
	dedupKey := fmt.Sprintf("%s:%s:%s", cameraID, name, role)
	
	debounceLock.Lock()
	lastSent, exists := lastNotifMap[dedupKey]
	if exists && now.Sub(lastSent) < 60*time.Second {
		debounceLock.Unlock()
		return nil // Skip duplicate
	}
	lastNotifMap[dedupKey] = now
	debounceLock.Unlock()

	var title, body, category string

	switch role {
	case "family":
		category = "family"
		title = fmt.Sprintf("👤 %s đã về nhà", name)
		body = fmt.Sprintf("Nhận diện thành viên %s tại camera %s lúc %s", name, cameraName, timeStr)
	case "guest", "neighbor", "staff":
		category = "guest"
		title = fmt.Sprintf("👤 %s vừa đến", name)
		body = fmt.Sprintf("Phát hiện khách %s tại camera %s lúc %s", name, cameraName, timeStr)
	case "stranger":
		category = "stranger"
		title = "⚠️ Cảnh báo: Phát hiện người lạ"
		body = fmt.Sprintf("Phát hiện người chưa xác định tại camera %s lúc %s", cameraName, timeStr)
	default:
		category = "system"
		title = fmt.Sprintf("👁️ Phát hiện người tại %s", cameraName)
		body = fmt.Sprintf("Phát hiện người tại camera %s lúc %s", cameraName, timeStr)
	}

	_, err := CreateAndDispatchNotification(ctx, cameraID, eventType, title, body, category, memberID, thumbURL)
	return err
}
