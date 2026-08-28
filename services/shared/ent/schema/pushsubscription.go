package schema

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// PushSubscription holds the schema definition for the PushSubscription entity.
type PushSubscription struct {
	ent.Schema
}

// Fields of the PushSubscription.
func (PushSubscription) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			Immutable().
			DefaultFunc(nanoid.New),
		field.String("user_id").
			Optional().
			Default(""),
		field.String("endpoint").
			NotEmpty().
			Unique(),
		field.String("p256dh").
			NotEmpty(),
		field.String("auth").
			NotEmpty(),
		field.String("user_agent").
			Default(""),
		field.Time("created_at").
			Default(time.Now),
	}
}

// Edges of the PushSubscription.
func (PushSubscription) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).
			Ref("push_subscriptions").
			Field("user_id").
			Unique(),
	}
}
