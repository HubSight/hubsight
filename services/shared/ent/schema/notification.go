package schema

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
)

// Notification holds the schema definition for the Notification entity.
type Notification struct {
	ent.Schema
}

// Fields of the Notification.
func (Notification) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			Immutable().
			DefaultFunc(nanoid.New),
		field.String("camera_id").
			Optional().
			Default(""),
		field.String("type").
			Default("person_identified"),
		field.String("title").
			NotEmpty(),
		field.String("body").
			Default(""),
		field.String("category").
			Default("family").
			Comment("family (green), guest (blue), stranger (red), system (gray)"),
		field.String("member_id").
			Optional().
			Default(""),
		field.String("thumbnail_url").
			Default(""),
		field.Bool("is_read").
			Default(false),
		field.Time("created_at").
			Default(time.Now),
	}
}

// Edges of the Notification.
func (Notification) Edges() []ent.Edge {
	return nil
}
