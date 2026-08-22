package notification

import (
	"context"
	"fmt"
	"sync"
	"time"
)

var (
	debounceLock sync.Mutex
	lastNotifMap = make(map[string]time.Time) // key -> lastSentTime
)

// IngestVisionEvent ingests a vision recognition event and creates a deduplicated notification
func IngestVisionEvent(ctx context.Context, cameraID, eventType, name, role, memberID, thumbURL string) error {
	// Deduplicate: Don't create notification if same person at same camera was notified in last 60 seconds
	dedupKey := fmt.Sprintf("%s:%s:%s", cameraID, name, role)
	
	debounceLock.Lock()
	lastSent, exists := lastNotifMap[dedupKey]
	now := time.Now()
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
		body = fmt.Sprintf("Nhận diện thành viên gia đình (%s) lúc %s", name, now.Format("15:04:05"))
	case "guest", "neighbor", "staff":
		category = "guest"
		title = fmt.Sprintf("👤 %s vừa đến", name)
		body = fmt.Sprintf("Phát hiện khách quen / hàng xóm (%s) lúc %s", name, now.Format("15:04:05"))
	case "stranger":
		category = "stranger"
		title = "⚠️ Cảnh báo: Phát hiện người lạ"
		body = fmt.Sprintf("Phát hiện người chưa xác định tại camera lúc %s", now.Format("15:04:05"))
	default:
		category = "system"
		title = "👁️ Phát hiện chuyển động người"
		body = fmt.Sprintf("Phát hiện người lúc %s", now.Format("15:04:05"))
	}

	_, err := CreateAndDispatchNotification(ctx, cameraID, eventType, title, body, category, memberID, thumbURL)
	return err
}
