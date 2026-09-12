package device

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"

	"gorm.io/gorm"
)

type DeviceInput struct {
	Name            string  `json:"name" binding:"required"`
	Host            string  `json:"host" binding:"required"`
	Brand           string  `json:"brand"`
	RtspPort        int     `json:"rtsp_port"`
	RtspTransport   string  `json:"rtsp_transport"`
	SegmentDuration int     `json:"segment_duration"`
	VideoCodec      string  `json:"video_codec"`
	AudioMode       string  `json:"audio_mode"`
	ExtraArgs       string  `json:"extra_args"`
	IsActive        *bool   `json:"is_active"`
	IsStopped       *bool   `json:"is_stopped"`
	EnableAi        *bool   `json:"enable_ai"`
	ShowBbox        *bool   `json:"show_bbox"`
	NvrMode         *string `json:"nvr_mode"`
	RecordQuality   *string `json:"record_quality"`
	IsFixed         *bool   `json:"is_fixed"`
}

// HomographyPoint is one of the 4 normalized (0..1) image-space points an admin
// clicks to calibrate a fixed camera's ground plane (§2.4). Vision-service maps
// these to a unit floor square via cv2.getPerspectiveTransform.
type HomographyPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Backward compatibility alias
type CameraInput = DeviceInput

func populateThumbnail(cam *models.Camera) {
	if cam == nil {
		return
	}
	if cam.IsActive && !cam.IsStopped {
		cam.ThumbnailURL = "/api/cameras/" + cam.ID + "/thumbnail"
		cam.StreamName = "cam_" + cam.ID + "_thumb"
	} else {
		cam.ThumbnailURL = ""
		cam.StreamName = ""
	}
}

func GetAll(ctx context.Context) ([]*models.Camera, error) {
	var devices []*models.Camera
	err := database.DB.WithContext(ctx).Order("id ASC").Find(&devices).Error
	if err == nil {
		for _, dev := range devices {
			populateThumbnail(dev)
		}
	}
	return devices, err
}

func Create(ctx context.Context, input DeviceInput) (*models.Camera, error) {
	cam := models.Camera{
		Name:            input.Name,
		Host:            input.Host,
		Brand:           input.Brand,
		RtspPort:        input.RtspPort,
		RtspTransport:   input.RtspTransport,
		SegmentDuration: input.SegmentDuration,
		VideoCodec:      input.VideoCodec,
		AudioMode:       input.AudioMode,
		ExtraArgs:       input.ExtraArgs,
		IsActive:        true,
		ShowBbox:        true,
		NvrMode:         "event",
		RecordQuality:   "standard",
	}

	if input.IsActive != nil {
		cam.IsActive = *input.IsActive
	}
	if input.IsStopped != nil {
		cam.IsStopped = *input.IsStopped
	}
	if input.EnableAi != nil {
		cam.EnableAi = *input.EnableAi
	}
	if input.ShowBbox != nil {
		cam.ShowBbox = *input.ShowBbox
	}
	if input.NvrMode != nil && *input.NvrMode != "" {
		cam.NvrMode = *input.NvrMode
	}
	if input.RecordQuality != nil && *input.RecordQuality != "" {
		cam.RecordQuality = *input.RecordQuality
	}

	if err := database.DB.WithContext(ctx).Create(&cam).Error; err != nil {
		return nil, err
	}
	populateThumbnail(&cam)
	return &cam, nil
}

func Update(ctx context.Context, id string, input DeviceInput) (*models.Camera, error) {
	updates := map[string]any{
		"name":       input.Name,
		"host":       input.Host,
		"extra_args": input.ExtraArgs,
		"updated_at": time.Now(),
	}

	if input.Brand != "" {
		updates["brand"] = input.Brand
	}
	if input.RtspPort > 0 {
		updates["rtsp_port"] = input.RtspPort
	}
	if input.RtspTransport != "" {
		updates["rtsp_transport"] = input.RtspTransport
	}
	if input.SegmentDuration > 0 {
		updates["segment_duration"] = input.SegmentDuration
	}
	if input.VideoCodec != "" {
		updates["video_codec"] = input.VideoCodec
	}
	if input.AudioMode != "" {
		updates["audio_mode"] = input.AudioMode
	}
	if input.IsActive != nil {
		updates["is_active"] = *input.IsActive
	}
	if input.IsStopped != nil {
		updates["is_stopped"] = *input.IsStopped
	}
	if input.EnableAi != nil {
		updates["enable_ai"] = *input.EnableAi
	}
	if input.ShowBbox != nil {
		updates["show_bbox"] = *input.ShowBbox
	}
	if input.NvrMode != nil && *input.NvrMode != "" {
		updates["nvr_mode"] = *input.NvrMode
	}
	if input.RecordQuality != nil && *input.RecordQuality != "" {
		updates["record_quality"] = *input.RecordQuality
	}
	if input.IsFixed != nil {
		updates["is_fixed"] = *input.IsFixed
	}

	res := database.DB.WithContext(ctx).Model(&models.Camera{ID: id}).Updates(updates)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	var cam models.Camera
	if err := database.DB.WithContext(ctx).First(&cam, "id = ?", id).Error; err != nil {
		return nil, err
	}
	populateThumbnail(&cam)
	return &cam, nil
}

func Delete(ctx context.Context, id string) error {
	res := database.DB.WithContext(ctx).Where("id = ?", id).Delete(&models.Camera{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func SetStopped(ctx context.Context, id string, stopped bool) (*models.Camera, error) {
	res := database.DB.WithContext(ctx).Model(&models.Camera{ID: id}).Updates(map[string]any{
		"is_stopped": stopped,
		"updated_at": time.Now(),
	})
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	var cam models.Camera
	if err := database.DB.WithContext(ctx).First(&cam, "id = ?", id).Error; err != nil {
		return nil, err
	}
	populateThumbnail(&cam)
	return &cam, nil
}

// SetHomography persists the 4 image-space calibration points for a fixed
// camera (§2.4). Vision-service computes the actual homography matrix — this
// just stores the raw points and marks them valid/fresh.
func SetHomography(ctx context.Context, id string, points []HomographyPoint) (*models.Camera, error) {
	if len(points) != 4 {
		return nil, fmt.Errorf("homography calibration requires exactly 4 points, got %d", len(points))
	}
	encoded, err := json.Marshal(points)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	res := database.DB.WithContext(ctx).Model(&models.Camera{ID: id}).Updates(map[string]any{
		// Calibrating implies opting in — saves a confusing two-step commit where
		// the admin picks points but forgets to separately flip is_fixed via the
		// main "Update Device" button.
		"is_fixed":              true,
		"homography_points":     string(encoded),
		"homography_valid":      true,
		"homography_updated_at": &now,
		"updated_at":            now,
	})
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	var cam models.Camera
	if err := database.DB.WithContext(ctx).First(&cam, "id = ?", id).Error; err != nil {
		return nil, err
	}
	populateThumbnail(&cam)
	return &cam, nil
}

// InvalidateHomography flips homography_valid=false — called by vision-service
// when its landmark-shift check detects the camera was bumped/repositioned.
func InvalidateHomography(ctx context.Context, id string) (*models.Camera, error) {
	res := database.DB.WithContext(ctx).Model(&models.Camera{ID: id}).Updates(map[string]any{
		"homography_valid": false,
		"updated_at":       time.Now(),
	})
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	var cam models.Camera
	if err := database.DB.WithContext(ctx).First(&cam, "id = ?", id).Error; err != nil {
		return nil, err
	}
	populateThumbnail(&cam)
	return &cam, nil
}

// IsStreaming reports whether the camera may hold pool / live / CV / NVR connections.
func IsStreaming(dev *models.Camera) bool {
	return dev != nil && dev.IsActive && !dev.IsStopped
}

// CameraEventPayload always includes bools.
func CameraEventPayload(dev *models.Camera) map[string]interface{} {
	if dev == nil {
		return map[string]interface{}{}
	}
	return map[string]interface{}{
		"id":                    dev.ID,
		"name":                  dev.Name,
		"host":                  dev.Host,
		"brand":                 dev.Brand,
		"rtsp_port":             dev.RtspPort,
		"rtsp_transport":        dev.RtspTransport,
		"segment_duration":      dev.SegmentDuration,
		"video_codec":           dev.VideoCodec,
		"audio_mode":            dev.AudioMode,
		"extra_args":            dev.ExtraArgs,
		"is_active":             dev.IsActive,
		"is_stopped":            dev.IsStopped,
		"enable_ai":             dev.EnableAi,
		"show_bbox":             dev.ShowBbox,
		"nvr_mode":              dev.NvrMode,
		"record_quality":        dev.RecordQuality,
		"is_fixed":              dev.IsFixed,
		"homography_points":     dev.HomographyPoints,
		"homography_valid":      dev.HomographyValid,
		"homography_updated_at": dev.HomographyUpdatedAt,
		"created_at":            dev.CreatedAt,
		"updated_at":            dev.UpdatedAt,
	}
}
