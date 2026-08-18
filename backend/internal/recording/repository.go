package recording

import (
	"context"
	"time"

	"cctv/ent"
	"cctv/ent/recording"
	"cctv/ent/camera"
	"cctv/internal/database"
)

func GetTimeline(ctx context.Context, from, to time.Time, cameraID int) ([]*ent.Recording, error) {
	q := database.Client.Recording.Query().
		Where(
			recording.StartAtGTE(from),
			recording.StartAtLTE(to),
		)
		
	if cameraID > 0 {
		q = q.Where(recording.HasCameraWith(camera.ID(cameraID)))
	}
	
	return q.Order(ent.Asc(recording.FieldStartAt)).All(ctx)
}

func GetByID(ctx context.Context, id int) (*ent.Recording, error) {
	return database.Client.Recording.Get(ctx, id)
}

// Ensure the Camera exists first (for foreign key). We can hardcode camera 1 for now if needed.
func Insert(ctx context.Context, cameraID int, startAt, endAt time.Time, duration int, filePath string, sizeBytes int64) (*ent.Recording, error) {
	return database.Client.Recording.Create().
		SetCameraID(cameraID).
		SetStartAt(startAt).
		SetEndAt(endAt).
		SetDurationSeconds(duration).
		SetFilePath(filePath).
		SetSizeBytes(sizeBytes).
		Save(ctx)
}
