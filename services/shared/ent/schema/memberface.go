package schema

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// MemberFace holds the schema definition for the MemberFace entity.
type MemberFace struct {
	ent.Schema
}

// Fields of the MemberFace.
func (MemberFace) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			Immutable().
			DefaultFunc(nanoid.New),
		field.String("member_id").
			Immutable(),
		field.JSON("embedding", []float64{}).
			Comment("512D ArcFace float embedding vector"),
		field.String("sample_image_url").Default(""),
		field.Float("quality_score").Default(0.0),
		field.Float("yaw").Default(0.0),
		field.Float("pitch").Default(0.0),
		field.Float("blur_score").Default(0.0),
		field.Bool("is_active").Default(true),
		field.Time("created_at").Default(time.Now),
	}
}

// Edges of the MemberFace.
func (MemberFace) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("member", Member.Type).
			Ref("faces").
			Field("member_id").
			Unique().
			Required().
			Immutable(),
	}
}
