package device

import (
	"context"

	"cctv/shared/ent"
	"cctv/shared/pkg/database"
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

func GetAll(ctx context.Context) ([]*ent.Camera, error) {
	return database.Client.Camera.Query().Order(ent.Asc("id")).All(ctx)
}

func Create(ctx context.Context, input DeviceInput) (*ent.Camera, error) {
	query := database.Client.Camera.Create().
		SetName(input.Name).
		SetHost(input.Host)

	if input.Brand != "" {
		query.SetBrand(input.Brand)
	}
	if input.RtspPort > 0 {
		query.SetRtspPort(input.RtspPort)
	}
	if input.RtspTransport != "" {
		query.SetRtspTransport(input.RtspTransport)
	}
	if input.SegmentDuration > 0 {
		query.SetSegmentDuration(input.SegmentDuration)
	}
	if input.VideoCodec != "" {
		query.SetVideoCodec(input.VideoCodec)
	}
	if input.AudioMode != "" {
		query.SetAudioMode(input.AudioMode)
	}
	if input.ExtraArgs != "" {
		query.SetExtraArgs(input.ExtraArgs)
	}
	if input.IsActive != nil {
		query.SetIsActive(*input.IsActive)
	}
	if input.IsStopped != nil {
		query.SetIsStopped(*input.IsStopped)
	}
	if input.EnableAi != nil {
		query.SetEnableAi(*input.EnableAi)
	}
	if input.ShowBbox != nil {
		query.SetShowBbox(*input.ShowBbox)
	}

	return query.Save(ctx)
}

func Update(ctx context.Context, id string, input DeviceInput) (*ent.Camera, error) {
	query := database.Client.Camera.UpdateOneID(id).
		SetName(input.Name).
		SetHost(input.Host)

	if input.Brand != "" {
		query.SetBrand(input.Brand)
	}
	if input.RtspPort > 0 {
		query.SetRtspPort(input.RtspPort)
	}
	if input.RtspTransport != "" {
		query.SetRtspTransport(input.RtspTransport)
	}
	if input.SegmentDuration > 0 {
		query.SetSegmentDuration(input.SegmentDuration)
	}
	if input.VideoCodec != "" {
		query.SetVideoCodec(input.VideoCodec)
	}
	if input.AudioMode != "" {
		query.SetAudioMode(input.AudioMode)
	}
	query.SetExtraArgs(input.ExtraArgs)
	if input.IsActive != nil {
		query.SetIsActive(*input.IsActive)
	}
	if input.IsStopped != nil {
		query.SetIsStopped(*input.IsStopped)
	}
	if input.EnableAi != nil {
		query.SetEnableAi(*input.EnableAi)
	}
	if input.ShowBbox != nil {
		query.SetShowBbox(*input.ShowBbox)
	}

	return query.Save(ctx)
}

func Delete(ctx context.Context, id string) error {
	return database.Client.Camera.DeleteOneID(id).Exec(ctx)
}

func SetStopped(ctx context.Context, id string, stopped bool) (*ent.Camera, error) {
	return database.Client.Camera.UpdateOneID(id).SetIsStopped(stopped).Save(ctx)
}

// IsStreaming reports whether the camera may hold pool / live / CV / NVR connections.
func IsStreaming(dev *ent.Camera) bool {
	return dev != nil && dev.IsActive && !dev.IsStopped
}

// CameraEventPayload always includes bools. ent json omitempty drops enable_ai=false
// which made pool/vision treat an AI camera as disabled on every update.
func CameraEventPayload(dev *ent.Camera) map[string]interface{} {
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
