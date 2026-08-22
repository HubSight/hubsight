package recording

import (
	"time"
)

type Recording struct {
	ID              string    `json:"id"`
	CameraID        string    `json:"camera_id"`
	StartAt         time.Time `json:"start_at"`
	EndAt           time.Time `json:"end_at"`
	DurationSeconds int       `json:"duration_seconds"`
	FilePath        string    `json:"file_path"`
	SizeBytes       int64     `json:"size_bytes"`
	CreatedAt       time.Time `json:"created_at"`
}
