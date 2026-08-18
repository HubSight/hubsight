package schema

import (
	"time"
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/edge"
)

// Recording holds the schema definition for the Recording entity.
type Recording struct {
	ent.Schema
}

// Fields of the Recording.
func (Recording) Fields() []ent.Field {
	return []ent.Field{
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
		edge.From("camera", Camera.Type).Ref("recordings").Unique().Required(),
	}
}
