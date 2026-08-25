package recognitionlog

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"cctv/shared/ent"
	entlog "cctv/shared/ent/recognitionlog"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/mq"

	"github.com/gin-gonic/gin"
)

type IngestInput struct {
	CameraID      string            `json:"camera_id" binding:"required"`
	CameraName    string            `json:"camera_name"`
	Type          string            `json:"type" binding:"required"`
	Category      string            `json:"category"`
	MemberID      string            `json:"member_id"`
	TrackID       int               `json:"track_id"`
	MessageKey    string            `json:"message_key" binding:"required"`
	MessageParams map[string]string `json:"message_params"`
}

type LogDTO struct {
	ID            string            `json:"id"`
	CameraID      string            `json:"camera_id"`
	Type          string            `json:"type"`
	Category      string            `json:"category"`
	MemberID      string            `json:"member_id"`
	TrackID       int               `json:"track_id"`
	MessageKey    string            `json:"message_key"`
	MessageParams map[string]string `json:"message_params"`
	CreatedAt     time.Time         `json:"created_at"`
}

func toDTO(item *ent.RecognitionLog) LogDTO {
	params := item.MessageParams
	if params == nil {
		params = map[string]string{}
	}
	return LogDTO{
		ID:            item.ID,
		CameraID:      item.CameraID,
		Type:          item.Type,
		Category:      item.Category,
		MemberID:      item.MemberID,
		TrackID:       item.TrackID,
		MessageKey:    item.MessageKey,
		MessageParams: params,
		CreatedAt:     item.CreatedAt,
	}
}

// IngestHandler persists a recognition log then broadcasts to relay.
// Persist happens first so MQ failure cannot drop the 24/7 record.
func IngestHandler(c *gin.Context) {
	var input IngestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if input.Category == "" {
		input.Category = "member"
	}
	if input.MessageParams == nil {
		input.MessageParams = map[string]string{}
	}
	if input.CameraName != "" && input.MessageParams["camera"] == "" {
		input.MessageParams["camera"] = input.CameraName
	}

	item, err := database.Client.RecognitionLog.Create().
		SetCameraID(input.CameraID).
		SetType(input.Type).
		SetCategory(input.Category).
		SetMemberID(input.MemberID).
		SetTrackID(input.TrackID).
		SetMessageKey(input.MessageKey).
		SetMessageParams(input.MessageParams).
		Save(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to persist recognition log: " + err.Error()})
		return
	}

	dto := toDTO(item)
	if pubErr := mq.PublishEvent("vision.log.new", dto); pubErr != nil {
		log.Printf("[RecognitionLog] persisted %s but MQ publish failed: %v", item.ID, pubErr)
	}

	c.JSON(http.StatusOK, dto)
}

// ListHandler returns newest-first logs for a camera. Optional cursor: ?before=<RFC3339>&limit=50
func ListHandler(c *gin.Context) {
	camID := c.Param("id")
	if camID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid camera ID"})
		return
	}

	limit := 50
	if raw := c.Query("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	query := database.Client.RecognitionLog.Query().
		Where(entlog.CameraID(camID)).
		Order(ent.Desc(entlog.FieldCreatedAt)).
		Limit(limit)

	if before := c.Query("before"); before != "" {
		if ts, err := time.Parse(time.RFC3339, before); err == nil {
			query = query.Where(entlog.CreatedAtLT(ts))
		} else if ts, err := time.Parse(time.RFC3339Nano, before); err == nil {
			query = query.Where(entlog.CreatedAtLT(ts))
		}
	}

	items, err := query.All(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch recognition logs: " + err.Error()})
		return
	}

	dtos := make([]LogDTO, 0, len(items))
	for _, item := range items {
		dtos = append(dtos, toDTO(item))
	}
	c.JSON(http.StatusOK, dtos)
}
