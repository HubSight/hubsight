package recording

import (
	"context"
	"time"

	"cctv/shared/ent"
	"cctv/shared/ent/camera"
	"cctv/shared/ent/recording"
	"cctv/shared/pkg/database"
)

func GetTimeline(ctx context.Context, from, to time.Time, cameraID string) ([]*ent.Recording, error) {
	q := database.Client.Recording.Query().
		Where(
			recording.StartAtGTE(from),
			recording.StartAtLTE(to),
		)

	if cameraID != "" {
		q = q.Where(recording.HasCameraWith(camera.ID(cameraID)))
	}

	return q.Order(ent.Asc(recording.FieldStartAt)).All(ctx)
}

func GetByID(ctx context.Context, id string) (*ent.Recording, error) {
	return database.Client.Recording.Get(ctx, id)
}

// Ensure the Camera exists first (for foreign key). We can hardcode camera 1 for now if needed.
func Insert(ctx context.Context, cameraID string, startAt, endAt time.Time, duration int, filePath string, sizeBytes int64) (*ent.Recording, error) {
	return database.Client.Recording.Create().
		SetCameraID(cameraID).
		SetStartAt(startAt).
		SetEndAt(endAt).
		SetDurationSeconds(duration).
		SetFilePath(filePath).
		SetSizeBytes(sizeBytes).
		Save(ctx)
}

func GetAvailableDays(ctx context.Context, cameraID string, year, month int) ([]int, error) {
	// Construct the start and end of the month
	startOfMonth := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	endOfMonth := startOfMonth.AddDate(0, 1, 0).Add(-time.Nanosecond)

	recordings, err := database.Client.Recording.Query().
		Where(
			recording.HasCameraWith(camera.ID(cameraID)),
			recording.StartAtGTE(startOfMonth),
			recording.StartAtLTE(endOfMonth),
		).
		Select(recording.FieldStartAt).
		All(ctx)

	if err != nil {
		return nil, err
	}

	daysMap := make(map[int]bool)
	for _, r := range recordings {
		daysMap[r.StartAt.Day()] = true
	}

	var days []int
	for day := range daysMap {
		days = append(days, day)
	}

	return days, nil
}
