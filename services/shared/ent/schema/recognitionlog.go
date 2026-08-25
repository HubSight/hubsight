package schema

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// RecognitionLog holds persistent AI recognition events for the Playback sidebar.
// Written by vision-service 24/7; independent of whether any browser is open.
type RecognitionLog struct {
	ent.Schema
}

// Fields of the RecognitionLog.
func (RecognitionLog) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			Immutable().
			DefaultFunc(nanoid.New),
		field.String("camera_id").
			NotEmpty(),
		field.String("type").
			NotEmpty().
			Comment("member_identified, stranger_detected, fire_detected, smoke_detected, weapon_detected, fall_detected, accident_detected, suspicious"),
		field.String("category").
			Default("member").
			Comment("member (emerald), guest (blue), stranger (red), risk (orange), fall (rose), suspicious (amber)"),
		field.String("member_id").
			Optional().
			Default(""),
		field.Int("track_id").
			Optional().
			Default(0),
		field.String("message_key").
			NotEmpty(),
		field.JSON("message_params", map[string]string{}).
			Optional(),
		field.Time("created_at").
			Default(time.Now),
	}
}

// Edges of the RecognitionLog.
func (RecognitionLog) Edges() []ent.Edge {
	return nil
}

// Indexes of the RecognitionLog.
func (RecognitionLog) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("camera_id", "created_at"),
	}
}
