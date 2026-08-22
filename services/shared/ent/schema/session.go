package schema

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Session holds the schema definition for the Session entity.
type Session struct {
	ent.Schema
}

// Fields of the Session.
func (Session) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			Immutable().
			DefaultFunc(nanoid.New),
		field.String("user_id").
			Immutable(),
		field.Bytes("token_hash").Unique(),
		field.Bytes("refresh_token_hash").Optional(),
		field.Bool("is_pwa").Default(false),
		field.Time("expires_at"),
		field.Time("created_at").Default(time.Now),
		field.Time("last_seen_at").Optional(),
	}
}

// Edges of the Session.
func (Session) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).
			Ref("sessions").
			Field("user_id").
			Unique().
			Required().
			Immutable(),
	}
}
