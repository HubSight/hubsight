package schema

import (
	"time"
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/edge"
)

// Camera holds the schema definition for the Camera entity.
type Camera struct {
	ent.Schema
}

// Fields of the Camera.
func (Camera) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").NotEmpty(),
		field.String("host").NotEmpty(),
		field.String("brand").Default("generic"),
		field.Int("rtsp_port").Default(554),
		field.String("rtsp_transport").Default("tcp"),
		field.Int("segment_duration").Default(300),
		field.String("video_codec").Default("copy"),
		field.String("audio_mode").Default("auto"),
		field.String("extra_args").Default(""),
		field.Bool("is_active").Default(true),
		field.Time("created_at").Default(time.Now),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

// Edges of the Camera.
func (Camera) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("recordings", Recording.Type),
	}
}
