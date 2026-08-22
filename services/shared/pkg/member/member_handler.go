package member

import (
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"cctv/shared/ent"
	"cctv/shared/ent/member"
	"cctv/shared/ent/memberface"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/nanoid"
	"cctv/shared/pkg/storage"

	"github.com/gin-gonic/gin"
	"github.com/minio/minio-go/v7"
)

type CreateMemberInput struct {
	Name      string `json:"name" binding:"required"`
	Role      string `json:"role"` // family, guest, neighbor, staff
	AvatarURL string `json:"avatar_url"`
}

type UpdateMemberInput struct {
	Name      string `json:"name"`
	Role      string `json:"role"`
	AvatarURL string `json:"avatar_url"`
	IsActive  *bool  `json:"is_active"`
}

type AddFaceInput struct {
	Embedding      []float64 `json:"embedding"`
	SampleImageURL string    `json:"sample_image_url"`
	QualityScore   float64   `json:"quality_score"`
	Yaw            float64   `json:"yaw"`
	Pitch          float64   `json:"pitch"`
	BlurScore      float64   `json:"blur_score"`
}

type FaceItemDTO struct {
	ID             string    `json:"id"`
	MemberID       string    `json:"member_id"`
	SampleImageURL string    `json:"sample_image_url"`
	QualityScore   float64   `json:"quality_score"`
	Yaw            float64   `json:"yaw"`
	Pitch          float64   `json:"pitch"`
	BlurScore      float64   `json:"blur_score"`
	CreatedAt      time.Time `json:"created_at"`
}

type MemberDTO struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Role      string        `json:"role"`
	AvatarURL string        `json:"avatar_url"`
	IsActive  bool          `json:"is_active"`
	FaceCount int           `json:"face_count"`
	Faces     []FaceItemDTO `json:"faces,omitempty"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
}

// ListMembersHandler returns all members with their face sample counts
func ListMembersHandler(c *gin.Context) {
	ctx := c.Request.Context()
	members, err := database.Client.Member.Query().
		Where(member.IsActive(true)).
		WithFaces(func(q *ent.MemberFaceQuery) {
			q.Where(memberface.IsActive(true)).Order(ent.Desc(memberface.FieldCreatedAt))
		}).
		Order(ent.Asc(member.FieldCreatedAt)).
		All(ctx)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch members: " + err.Error()})
		return
	}

	result := make([]MemberDTO, 0, len(members))
	for _, m := range members {
		dto := MemberDTO{
			ID:        m.ID,
			Name:      m.Name,
			Role:      string(m.Role),
			AvatarURL: m.AvatarURL,
			IsActive:  m.IsActive,
			FaceCount: len(m.Edges.Faces),
			CreatedAt: m.CreatedAt,
			UpdatedAt: m.UpdatedAt,
		}

		faces := make([]FaceItemDTO, 0, len(m.Edges.Faces))
		for _, f := range m.Edges.Faces {
			faces = append(faces, FaceItemDTO{
				ID:             f.ID,
				MemberID:       f.MemberID,
				SampleImageURL: f.SampleImageURL,
				QualityScore:   f.QualityScore,
				Yaw:            f.Yaw,
				Pitch:          f.Pitch,
				BlurScore:      f.BlurScore,
				CreatedAt:      f.CreatedAt,
			})
		}
		dto.Faces = faces
		result = append(result, dto)
	}

	c.JSON(http.StatusOK, result)
}

// CreateMemberHandler creates a new member entity
func CreateMemberHandler(c *gin.Context) {
	var input CreateMemberInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	role := member.RoleFamily
	switch input.Role {
	case "guest":
		role = member.RoleGuest
	case "neighbor":
		role = member.RoleNeighbor
	case "staff":
		role = member.RoleStaff
	}

	m, err := database.Client.Member.Create().
		SetName(input.Name).
		SetRole(role).
		SetAvatarURL(input.AvatarURL).
		Save(c.Request.Context())

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create member: " + err.Error()})
		return
	}

	_ = mq.PublishEvent("member.face.updated", gin.H{"action": "create", "member_id": m.ID})

	c.JSON(http.StatusCreated, MemberDTO{
		ID:        m.ID,
		Name:      m.Name,
		Role:      string(m.Role),
		AvatarURL: m.AvatarURL,
		IsActive:  m.IsActive,
		FaceCount: 0,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	})
}

// UpdateMemberHandler updates an existing member
func UpdateMemberHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid member ID"})
		return
	}

	var input UpdateMemberInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	updater := database.Client.Member.UpdateOneID(id)
	if input.Name != "" {
		updater.SetName(input.Name)
	}
	if input.Role != "" {
		switch input.Role {
		case "family":
			updater.SetRole(member.RoleFamily)
		case "guest":
			updater.SetRole(member.RoleGuest)
		case "neighbor":
			updater.SetRole(member.RoleNeighbor)
		case "staff":
			updater.SetRole(member.RoleStaff)
		}
	}
	if input.AvatarURL != "" {
		updater.SetAvatarURL(input.AvatarURL)
	}
	if input.IsActive != nil {
		updater.SetIsActive(*input.IsActive)
	}

	m, err := updater.Save(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update member: " + err.Error()})
		return
	}

	_ = mq.PublishEvent("member.face.updated", gin.H{"action": "update", "member_id": m.ID})

	c.JSON(http.StatusOK, MemberDTO{
		ID:        m.ID,
		Name:      m.Name,
		Role:      string(m.Role),
		AvatarURL: m.AvatarURL,
		IsActive:  m.IsActive,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	})
}

// DeleteMemberHandler deletes a member and associated face embeddings
func DeleteMemberHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid member ID"})
		return
	}

	ctx := c.Request.Context()
	// Delete faces first
	_, _ = database.Client.MemberFace.Delete().Where(memberface.MemberID(id)).Exec(ctx)

	err := database.Client.Member.DeleteOneID(id).Exec(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete member: " + err.Error()})
		return
	}

	_ = mq.PublishEvent("member.face.updated", gin.H{"action": "delete", "member_id": id})

	c.JSON(http.StatusOK, gin.H{"message": "Member deleted successfully"})
}

// UploadFaceImageHandler uploads an image file to S3 and returns the URL
func UploadFaceImage(ctx context.Context, file *multipart.FileHeader, memberID string) (string, error) {
	if storage.S3Client == nil {
		return "", fmt.Errorf("S3 client not initialized")
	}

	src, err := file.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	ext := filepath.Ext(file.Filename)
	if ext == "" {
		ext = ".jpg"
	}
	objName := fmt.Sprintf("faces/%s/%s%s", memberID, nanoid.New(), ext)

	_, err = storage.S3Client.PutObject(ctx, storage.S3Bucket, objName, src, file.Size, minio.PutObjectOptions{
		ContentType: file.Header.Get("Content-Type"),
	})
	if err != nil {
		return "", err
	}

	// Generate clean public or internal URL
	return fmt.Sprintf("/api/archive/faces/%s", objName), nil
}

// AddMemberFaceHandler adds a new face sample embedding
func AddMemberFaceHandler(c *gin.Context) {
	memberID := c.Param("id")
	if memberID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid member ID"})
		return
	}

	var input AddFaceInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	if len(input.Embedding) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Embedding vector is required"})
		return
	}

	face, err := database.Client.MemberFace.Create().
		SetMemberID(memberID).
		SetEmbedding(input.Embedding).
		SetSampleImageURL(input.SampleImageURL).
		SetQualityScore(input.QualityScore).
		SetYaw(input.Yaw).
		SetPitch(input.Pitch).
		SetBlurScore(input.BlurScore).
		Save(c.Request.Context())

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save member face: " + err.Error()})
		return
	}

	// Update member avatar if not set yet
	if input.SampleImageURL != "" {
		m, err := database.Client.Member.Get(c.Request.Context(), memberID)
		if err == nil && (m.AvatarURL == "" || m.AvatarURL == "/placeholder.jpg") {
			_ = database.Client.Member.UpdateOneID(memberID).SetAvatarURL(input.SampleImageURL).Exec(c.Request.Context())
		}
	}

	_ = mq.PublishEvent("member.face.updated", gin.H{"action": "add_face", "member_id": memberID, "face_id": face.ID})

	c.JSON(http.StatusCreated, FaceItemDTO{
		ID:             face.ID,
		MemberID:       face.MemberID,
		SampleImageURL: face.SampleImageURL,
		QualityScore:   face.QualityScore,
		Yaw:            face.Yaw,
		Pitch:          face.Pitch,
		BlurScore:      face.BlurScore,
		CreatedAt:      face.CreatedAt,
	})
}

// DeleteMemberFaceHandler deletes a specific face sample
func DeleteMemberFaceHandler(c *gin.Context) {
	faceID := c.Param("face_id")
	if faceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid face ID"})
		return
	}

	ctx := c.Request.Context()
	face, err := database.Client.MemberFace.Get(ctx, faceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Face not found"})
		return
	}

	memberID := face.MemberID
	err = database.Client.MemberFace.DeleteOneID(faceID).Exec(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete face: " + err.Error()})
		return
	}

	_ = mq.PublishEvent("member.face.updated", gin.H{"action": "delete_face", "member_id": memberID, "face_id": faceID})

	c.JSON(http.StatusOK, gin.H{"message": "Face sample deleted successfully"})
}

// EmbeddingSyncDTO represents vector dataset for vision-service
type EmbeddingSyncDTO struct {
	MemberID  string      `json:"member_id"`
	Name      string      `json:"name"`
	Role      string      `json:"role"`
	Embedding []float64   `json:"embedding"`
	FaceID    string      `json:"face_id"`
}

// ListAllEmbeddingsInternalHandler is called by vision-service to load embeddings into RAM
func ListAllEmbeddingsInternalHandler(c *gin.Context) {
	secret := c.GetHeader("X-Service-Key")
	expected := os.Getenv("M2M_SECRET")
	if expected != "" && secret != expected {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized internal access"})
		return
	}

	ctx := c.Request.Context()
	faces, err := database.Client.MemberFace.Query().
		Where(memberface.IsActive(true)).
		WithMember().
		All(ctx)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch embeddings: " + err.Error()})
		return
	}

	result := make([]EmbeddingSyncDTO, 0, len(faces))
	for _, f := range faces {
		if f.Edges.Member != nil && f.Edges.Member.IsActive {
			result = append(result, EmbeddingSyncDTO{
				MemberID:  f.MemberID,
				Name:      f.Edges.Member.Name,
				Role:      string(f.Edges.Member.Role),
				Embedding: f.Embedding,
				FaceID:    f.ID,
			})
		}
	}

	c.JSON(http.StatusOK, result)
}
