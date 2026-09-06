// Package models defines plain Go domain structs and GORM ORM tags for HubSight CCTV.
//
// Field Mapping between GORM models and the legacy database entities:
//
// 1. User (table "users"):
//   - ID -> ent.FieldString("id") (varchar(21), NanoID)
//   - Username -> ent.FieldString("username")
//   - FullName -> ent.FieldString("full_name")
//   - PasswordHash -> ent.FieldString("password_hash") [SECURITY FIX: json:"-" to prevent hash leak]
//   - Role -> ent.FieldEnum("role") ("admin", "viewer")
//   - IsActive -> ent.FieldBool("is_active")
//   - Locale -> ent.FieldEnum("locale") ("vi", "en")
//   - Timezone -> ent.FieldString("timezone")
//   - CreatedAt -> ent.FieldTime("created_at")
//   - UpdatedAt -> ent.FieldTime("updated_at")
//   - LastLoginAt -> ent.FieldTime("last_login_at") (nullable pointer)
//   - PushPreferences -> ent.FieldJSON("push_preferences") (jsonb)
//   - Sessions -> ent.EdgeTo("sessions", Session)
//   - PushSubscriptions -> ent.EdgeTo("push_subscriptions", PushSubscription)
//
// 2. Session (table "sessions"):
//   - ID -> ent.FieldString("id") (varchar(21), NanoID)
//   - UserID -> ent.FieldString("user_id") (FK users.id)
//   - TokenHash -> ent.FieldBytes("token_hash") (bytea, unique)
//   - RefreshTokenHash -> ent.FieldBytes("refresh_token_hash") (bytea, nullable)
//   - IsPwa -> ent.FieldBool("is_pwa")
//   - ExpiresAt -> ent.FieldTime("expires_at")
//   - CreatedAt -> ent.FieldTime("created_at")
//   - LastSeenAt -> ent.FieldTime("last_seen_at") (nullable pointer)
//   - User -> ent.EdgeFrom("user", User)
//
// 3. Camera (table "cameras"):
//   - ID -> ent.FieldString("id") (varchar(21), NanoID)
//   - Name -> ent.FieldString("name")
//   - Host -> ent.FieldString("host")
//   - Brand -> ent.FieldString("brand")
//   - RtspPort -> ent.FieldInt("rtsp_port")
//   - RtspTransport -> ent.FieldString("rtsp_transport")
//   - SegmentDuration -> ent.FieldInt("segment_duration")
//   - VideoCodec -> ent.FieldString("video_codec")
//   - AudioMode -> ent.FieldString("audio_mode")
//   - ExtraArgs -> ent.FieldString("extra_args")
//   - IsActive -> ent.FieldBool("is_active") (no omitempty)
//   - IsStopped -> ent.FieldBool("is_stopped") (no omitempty)
//   - EnableAi -> ent.FieldBool("enable_ai") (no omitempty)
//   - ShowBbox -> ent.FieldBool("show_bbox") (no omitempty)
//   - CreatedAt -> ent.FieldTime("created_at")
//   - UpdatedAt -> ent.FieldTime("updated_at")
//   - Recordings -> ent.EdgeTo("recordings", Recording)
//
// 4. Recording (table "recordings"):
//   - ID -> ent.FieldString("id") (varchar(21), NanoID)
//   - CameraID -> ent.FieldString("camera_id") (FK cameras.id)
//   - StartAt -> ent.FieldTime("start_at")
//   - EndAt -> ent.FieldTime("end_at")
//   - DurationSeconds -> ent.FieldInt("duration_seconds")
//   - FilePath -> ent.FieldString("file_path") (unique)
//   - ThumbnailPath -> ent.FieldString("thumbnail_path") (nullable pointer)
//   - SizeBytes -> ent.FieldInt64("size_bytes")
//   - CreatedAt -> ent.FieldTime("created_at")
//   - Camera -> ent.EdgeFrom("camera", Camera)
//
// 5. Member (table "members"):
//   - ID -> ent.FieldString("id") (varchar(21), NanoID)
//   - Name -> ent.FieldString("name")
//   - Role -> ent.FieldEnum("role") ("family", "guest", "neighbor", "staff")
//   - AvatarURL -> ent.FieldString("avatar_url")
//   - IsActive -> ent.FieldBool("is_active")
//   - CreatedAt -> ent.FieldTime("created_at")
//   - UpdatedAt -> ent.FieldTime("updated_at")
//   - Faces -> ent.EdgeTo("faces", MemberFace)
//
// 6. MemberFace (table "member_faces"):
//   - ID -> ent.FieldString("id") (varchar(21), NanoID)
//   - MemberID -> ent.FieldString("member_id") (FK members.id)
//   - Embedding -> ent.FieldJSON("embedding") (jsonb, 512D float64 vector)
//   - SampleImageURL -> ent.FieldString("sample_image_url")
//   - QualityScore -> ent.FieldFloat("quality_score")
//   - Yaw -> ent.FieldFloat("yaw")
//   - Pitch -> ent.FieldFloat("pitch")
//   - BlurScore -> ent.FieldFloat("blur_score")
//   - IsActive -> ent.FieldBool("is_active")
//   - CreatedAt -> ent.FieldTime("created_at")
//   - Member -> ent.EdgeFrom("member", Member)
//
// 7. Notification (table "notifications"):
//   - ID -> ent.FieldString("id") (varchar(21), NanoID)
//   - CameraID -> ent.FieldString("camera_id")
//   - Type -> ent.FieldString("type")
//   - Title -> ent.FieldString("title")
//   - Body -> ent.FieldString("body")
//   - Category -> ent.FieldString("category")
//   - MemberID -> ent.FieldString("member_id")
//   - ThumbnailURL -> ent.FieldString("thumbnail_url")
//   - IsRead -> ent.FieldBool("is_read") (no omitempty)
//   - CreatedAt -> ent.FieldTime("created_at")
//
// 8. PushSubscription (table "push_subscriptions"):
//   - ID -> ent.FieldString("id") (varchar(21), NanoID)
//   - UserID -> ent.FieldString("user_id") (FK users.id)
//   - Endpoint -> ent.FieldString("endpoint") (unique)
//   - P256dh -> ent.FieldString("p256dh")
//   - Auth -> ent.FieldString("auth")
//   - UserAgent -> ent.FieldString("user_agent")
//   - CreatedAt -> ent.FieldTime("created_at")
//   - User -> ent.EdgeFrom("user", User)
//
// 9. RecognitionLog (table "recognition_logs"):
//   - ID -> ent.FieldString("id") (varchar(21), NanoID)
//   - CameraID -> ent.FieldString("camera_id")
//   - Type -> ent.FieldString("type")
//   - Category -> ent.FieldString("category")
//   - MemberID -> ent.FieldString("member_id")
//   - TrackID -> ent.FieldInt("track_id")
//   - MessageKey -> ent.FieldString("message_key")
//   - MessageParams -> ent.FieldJSON("message_params") (jsonb)
//   - CreatedAt -> ent.FieldTime("created_at")
//   - Composite Index -> (camera_id, created_at)
//
// 10. Setting (table "settings"):
//   - ID -> ent.FieldString("id") (varchar(21), NanoID)
//   - NvrStatus -> ent.FieldBool("nvr_status") (no omitempty)
//   - StorageQuotaGB -> ent.FieldInt("storage_quota_gb")
//   - RetentionDays -> ent.FieldInt("retention_days")
//   - (Singleton record, no CreatedAt or UpdatedAt)
package models
