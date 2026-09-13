package notification

import (
	"context"
	"errors"
	"strings"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
)

var ErrNotificationIDsRequired = errors.New("notification IDs are required")

// BatchDeleteNotifications normalizes a comma-separated list of IDs and deletes matching notifications.
func BatchDeleteNotifications(ctx context.Context, rawIDs string) (int64, error) {
	ids := normalizeNotificationIDs(rawIDs)
	if len(ids) == 0 {
		return 0, ErrNotificationIDsRequired
	}

	res := database.DB.WithContext(ctx).
		Where("id IN ?", ids).
		Delete(&models.Notification{})
	return res.RowsAffected, res.Error
}

func normalizeNotificationIDs(rawIDs string) []string {
	seen := make(map[string]struct{})
	ids := make([]string, 0)
	for _, rawID := range strings.Split(rawIDs, ",") {
		id := strings.TrimSpace(rawID)
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids
}
