package device

import (
	"context"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"

	"gorm.io/gorm"
)

type DeviceInput struct {
	Name            string `json:"name" binding:"required"`
	Host            string `json:"host" binding:"required"`
	Brand           string `json:"brand"`
	RtspPort        int    `json:"rtsp_port"`
	RtspTransport   string `json:"rtsp_transport"`
	SegmentDuration int    `json:"segment_duration"`
	VideoCodec      string `json:"video_codec"`
	AudioMode       string `json:"audio_mode"`
	ExtraArgs       string `json:"extra_args"`
	IsActive        *bool  `json:"is_active"`
	IsStopped       *bool  `json:"is_stopped"`
	EnableAi        *bool  `json:"enable_ai"`
	ShowBbox        *bool  `json:"show_bbox"`
}

// Backward compatibility alias
type CameraInput = DeviceInput

func GetAll(ctx context.Context) ([]*models.Camera, error) {
	var devices []*models.Camera
	err := database.DB.WithContext(ctx).Order("id ASC").Find(&devices).Error
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

	if err := database.DB.WithContext(ctx).Create(&cam).Error; err != nil {
		return nil, err
	}
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
	return &cam, nil
}

func Delete(ctx context.Context, id string) error {
	return database.DB.WithContext(ctx).Where("id = ?", id).Delete(&models.Camera{}).Error
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
		"id":               dev.ID,
		"name":             dev.Name,
		"host":             dev.Host,
		"brand":            dev.Brand,
		"rtsp_port":        dev.RtspPort,
		"rtsp_transport":   dev.RtspTransport,
		"segment_duration": dev.SegmentDuration,
		"video_codec":      dev.VideoCodec,
		"audio_mode":       dev.AudioMode,
		"extra_args":       dev.ExtraArgs,
		"is_active":        dev.IsActive,
		"is_stopped":       dev.IsStopped,
		"enable_ai":        dev.EnableAi,
		"show_bbox":        dev.ShowBbox,
		"created_at":       dev.CreatedAt,
		"updated_at":       dev.UpdatedAt,
	}
}
