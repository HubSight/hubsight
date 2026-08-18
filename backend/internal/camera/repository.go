package camera

import (
	"context"
	
	"cctv/ent"
	"cctv/internal/database"
)

type CameraInput struct {
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
}

func GetAll(ctx context.Context) ([]*ent.Camera, error) {
	return database.Client.Camera.Query().Order(ent.Asc("id")).All(ctx)
}

func Create(ctx context.Context, input CameraInput) (*ent.Camera, error) {
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

	return query.Save(ctx)
}

func Update(ctx context.Context, id int, input CameraInput) (*ent.Camera, error) {
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

	return query.Save(ctx)
}

func Delete(ctx context.Context, id int) error {
	return database.Client.Camera.DeleteOneID(id).Exec(ctx)
}
