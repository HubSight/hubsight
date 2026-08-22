package schema

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// User holds the schema definition for the User entity.
type User struct {
	ent.Schema
}

// Fields of the User.
func (User) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			Immutable().
			DefaultFunc(nanoid.New),
		field.String("username").Unique().NotEmpty(),
		field.String("full_name").Default(""),
		field.String("password_hash").NotEmpty(),
		field.Enum("role").Values("admin", "viewer").Default("viewer"),
		field.Bool("is_active").Default(true),
		field.Enum("locale").Values("vi", "en").Default("vi").
			Comment("User's preferred UI language"),
		field.String("timezone").Default("Asia/Ho_Chi_Minh").
			Comment("User's preferred display timezone"),
		field.Time("created_at").Default(time.Now),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
		field.Time("last_login_at").Optional(),
	}
}

// Edges of the User.
func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("sessions", Session.Type),
	}
}
