package notification

import (
	"context"
	"fmt"
	"sync"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
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
		var cam models.Camera
		if err := database.DB.WithContext(ctx).First(&cam, "id = ?", cameraID).Error; err == nil {
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
	case "danger":
		category = "risk"
		label := name
		if label == "" {
			label = "nguy hiểm"
		}
		title = fmt.Sprintf("⚠️ Cảnh báo rủi ro: %s", label)
		body = fmt.Sprintf("Phát hiện %s tại camera %s lúc %s", label, cameraName, timeStr)
	case "fall":
		category = "fall"
		title = "⚠️ Cảnh báo: Phát hiện té ngã"
		body = fmt.Sprintf("Phát hiện té ngã tại camera %s lúc %s", cameraName, timeStr)
	case "accident":
		category = "risk"
		title = "⚠️ Cảnh báo: Tai nạn"
		body = fmt.Sprintf("Phát hiện tai nạn tại camera %s lúc %s", cameraName, timeStr)
	case "suspicious":
		category = "suspicious"
		title = "⚠️ Hành vi đáng ngờ"
		body = fmt.Sprintf("Phát hiện hành vi đáng ngờ tại camera %s lúc %s", cameraName, timeStr)
	default:
		category = "system"
		title = fmt.Sprintf("👁️ Phát hiện người tại %s", cameraName)
		body = fmt.Sprintf("Phát hiện người tại camera %s lúc %s", cameraName, timeStr)
	}

	_, err := CreateAndDispatchNotification(ctx, cameraID, eventType, title, body, category, memberID, thumbURL)
	return err
}
