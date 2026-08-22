package schema

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Recording holds the schema definition for the Recording entity.
type Recording struct {
	ent.Schema
}

// Fields of the Recording.
func (Recording) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			Immutable().
			DefaultFunc(nanoid.New),
		field.String("camera_id").
			Immutable(),
		field.Time("start_at"),
		field.Time("end_at"),
		field.Int("duration_seconds"),
		field.String("file_path").Unique(),
		field.Int64("size_bytes"),
		field.Time("created_at").Default(time.Now),
	}
}

// Edges of the Recording.
func (Recording) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("camera", Camera.Type).
			Ref("recordings").
			Field("camera_id").
			Unique().
			Required().
			Immutable(),
	}
}
