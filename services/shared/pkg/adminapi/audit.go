package adminapi

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AdminAuditMiddleware records mutating Admin API requests after their
// handlers finish. It records a safe route/action envelope only; request
// bodies are never persisted. High-frequency lease heartbeats and QoE reports
// have their own bounded telemetry path and are excluded from the audit log.
func AdminAuditMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		if !shouldAuditAdminRequest(c) || database.DB == nil {
			return
		}
		if err := persistAdminAuditEvent(c); err != nil {
			// Auditing must not turn a successful business operation into a 500,
			// but the failure remains visible to operators through the service log.
			log.Printf("[Admin Audit] failed to persist event: %v", err)
		}
	}
}

func shouldAuditAdminRequest(c *gin.Context) bool {
	switch c.Request.Method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
	default:
		return false
	}
	path := strings.ToLower(c.Request.URL.Path)
	return !strings.Contains(path, ":heartbeat") &&
		!strings.Contains(path, ":qoe") &&
		!strings.HasSuffix(path, "/heartbeat")
}

func persistAdminAuditEvent(c *gin.Context) error {
	event := &models.AdminAuditEvent{
		Action:     c.Request.Method + " " + c.FullPath(),
		Method:     c.Request.Method,
		Path:       c.Request.URL.Path,
		RequestID:  c.GetString("request_id"),
		StatusCode: c.Writer.Status(),
		IPAddress:  c.ClientIP(),
		UserAgent:  c.Request.UserAgent(),
		TargetType: auditTargetType(c),
		TargetID:   auditTargetID(c),
		Metadata: map[string]any{
			"outcome": auditOutcome(c.Writer.Status()),
		},
	}
	if user, ok := c.Get("user"); ok {
		if value, ok := user.(*models.User); ok && value != nil {
			event.ActorID = value.ID
			event.ActorName = value.FullName
			if event.ActorName == "" {
				event.ActorName = value.Username
			}
		}
	}
	if client, ok := adminClient(c); ok {
		event.ClientID = client.ClientID
	}
	return database.DB.WithContext(c.Request.Context()).Create(event).Error
}

func auditOutcome(status int) string {
	if status >= http.StatusOK && status < http.StatusMultipleChoices {
		return "success"
	}
	return "failure"
}

func auditTargetType(c *gin.Context) string {
	path := c.FullPath()
	path = strings.Trim(path, "/")
	parts := strings.Split(path, "/")
	for i, part := range parts {
		if part == "admin" && i+2 < len(parts) {
			return parts[i+2]
		}
	}
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return "admin_api"
}

func auditTargetID(c *gin.Context) string {
	for _, key := range []string{"camera_id", "recording_id", "member_id", "face_id", "notification_id", "user_id", "role_id", "client_id", "config_id", "id", "session_id", "operation_id"} {
		if value := strings.TrimSpace(c.Param(key)); value != "" {
			return value
		}
	}
	return ""
}

type auditCursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        string    `json:"id"`
}

func encodeAuditCursor(event *models.AdminAuditEvent) string {
	if event == nil {
		return ""
	}
	raw, err := json.Marshal(auditCursor{CreatedAt: event.CreatedAt, ID: event.ID})
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeAuditCursor(value string) (*auditCursor, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil, err
	}
	var cursor auditCursor
	if err := json.Unmarshal(raw, &cursor); err != nil || cursor.ID == "" || cursor.CreatedAt.IsZero() {
		return nil, fmt.Errorf("invalid cursor")
	}
	return &cursor, nil
}

// AdminAuditEventsHandler lists durable Admin API audit events with bounded
// cursor pagination and actor/client/action/time filters.
func AdminAuditEventsHandler(c *gin.Context) {
	limit := 50
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
			return
		}
		if parsed > 100 {
			parsed = 100
		}
		limit = parsed
	}

	query := database.DB.WithContext(c.Request.Context()).Model(&models.AdminAuditEvent{}).
		Order("created_at DESC").Order("id DESC")
	for key, column := range map[string]string{
		"actor_id": "actor_id", "client_id": "client_id", "action": "action", "target_type": "target_type",
	} {
		if value := strings.TrimSpace(c.Query(key)); value != "" {
			query = query.Where(column+" = ?", value)
		}
	}
	if value := strings.TrimSpace(c.Query("status")); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 100 || parsed > 599 {
			adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
			return
		}
		query = query.Where("status_code = ?", parsed)
	}
	for key, operator := range map[string]string{"from": ">=", "to": "<="} {
		if value := strings.TrimSpace(c.Query(key)); value != "" {
			parsed, err := time.Parse(time.RFC3339, value)
			if err != nil {
				adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
				return
			}
			query = query.Where("created_at "+operator+" ?", parsed)
		}
	}
	cursor, err := decodeAuditCursor(c.Query("cursor"))
	if err != nil {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	if cursor != nil {
		query = query.Where("created_at < ? OR (created_at = ? AND id < ?)", cursor.CreatedAt, cursor.CreatedAt, cursor.ID)
	}

	var events []models.AdminAuditEvent
	if err := query.Limit(limit + 1).Find(&events).Error; err != nil && err != gorm.ErrRecordNotFound {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	next := ""
	if len(events) > limit {
		next = encodeAuditCursor(&events[limit-1])
		events = events[:limit]
	}
	c.JSON(http.StatusOK, gin.H{
		"status":     "ok",
		"data":       gin.H{"items": events, "next_cursor": next},
		"request_id": c.GetString("request_id"),
	})
}
