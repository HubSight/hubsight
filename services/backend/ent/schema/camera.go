package schema

import (
	"time"

	"cctv/internal/nanoid"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Camera holds the schema definition for the Camera entity.
type Camera struct {
	ent.Schema
}

// Fields of the Camera.
func (Camera) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			Immutable().
			DefaultFunc(nanoid.New),
		field.String("name").NotEmpty(),
		field.String("host").NotEmpty(),
		field.String("brand").Default("generic"),
		field.Int("rtsp_port").Default(554),
		field.String("rtsp_transport").Default("auto"),
		field.Int("segment_duration").Default(1800),
		field.String("video_codec").Default("copy"),
		field.String("audio_mode").Default("auto"),
		field.String("extra_args").Default(""),
		field.Bool("is_active").Default(true),
		field.Bool("enable_ai").Default(false),
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
