package recording

import (
	"context"
	"sort"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
)

func GetTimeline(ctx context.Context, from, to time.Time, cameraID string) ([]*models.Recording, error) {
	q := database.DB.WithContext(ctx).
		Where("start_at >= ? AND start_at <= ?", from, to)

	if cameraID != "" {
		q = q.Where("camera_id = ?", cameraID)
	}

	var recordings []*models.Recording
	err := q.Order("start_at ASC").Find(&recordings).Error
	return recordings, err
}

func GetByID(ctx context.Context, id string) (*models.Recording, error) {
	var rec models.Recording
	if err := database.DB.WithContext(ctx).First(&rec, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &rec, nil
}

func Insert(ctx context.Context, cameraID string, startAt, endAt time.Time, duration int, filePath string, thumbnailPath string, sizeBytes int64) (*models.Recording, error) {
	rec := models.Recording{
		CameraID:        cameraID,
		StartAt:         startAt,
		EndAt:           endAt,
		DurationSeconds: duration,
		FilePath:        filePath,
		SizeBytes:       sizeBytes,
	}
	if thumbnailPath != "" {
		rec.ThumbnailPath = &thumbnailPath
	}

	if err := database.DB.WithContext(ctx).Create(&rec).Error; err != nil {
		return nil, err
	}
	return &rec, nil
}

func GetAvailableDays(ctx context.Context, cameraID string, year, month int) ([]int, error) {
	startOfMonth := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	endOfMonth := startOfMonth.AddDate(0, 1, 0).Add(-time.Nanosecond)

	var dates []time.Time
	err := database.DB.WithContext(ctx).Model(&models.Recording{}).
		Where("camera_id = ? AND start_at >= ? AND start_at <= ?", cameraID, startOfMonth, endOfMonth).
		Pluck("start_at", &dates).Error

	if err != nil {
		return nil, err
	}

	daysMap := make(map[int]bool)
	for _, d := range dates {
		daysMap[d.Day()] = true
	}

	days := make([]int, 0, len(daysMap))
	for day := range daysMap {
		days = append(days, day)
	}
	sort.Ints(days)

	return days, nil
}
