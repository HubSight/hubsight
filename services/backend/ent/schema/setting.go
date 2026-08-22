package schema

import (
	"cctv/internal/nanoid"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
)

// Setting holds the schema definition for the Setting entity.
type Setting struct {
	ent.Schema
}

// Fields of the Setting.
func (Setting) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			Immutable().
			DefaultFunc(nanoid.New).
			Comment("Nano ID for the singleton settings record"),
		field.Bool("nvr_status").
			Default(true).
			Comment("Global status of the NVR Recorder Service"),
		field.Int("storage_quota_gb").
			Default(50).
			Comment("Maximum storage quota in GB"),
		field.Int("retention_days").
			Default(4).
			Comment("Number of days to keep recordings before deleting"),
	}
}

// Edges of the Setting.
func (Setting) Edges() []ent.Edge {
	return nil
}
