package member

import (
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"cctv/shared/ent"
	"cctv/shared/ent/member"
	"cctv/shared/ent/memberface"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/nanoid"
	"cctv/shared/pkg/storage"

	"github.com/gin-gonic/gin"
)

type CreateMemberInput struct {
	Name      string `json:"name" binding:"required"`
	Role      string `json:"role"` // family, guest, neighbor, staff
	AvatarURL string `json:"avatar_url"`
}

type UpdateMemberInput struct {
	Name      string  `json:"name"`
	Role      string  `json:"role"`
	AvatarURL *string `json:"avatar_url"`
	IsActive  *bool   `json:"is_active"`
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

type PaginatedMembersResponse struct {
	Data        []MemberDTO `json:"data"`
	Total       int         `json:"total"`
	Page        int         `json:"page"`
	Limit       int         `json:"limit"`
	TotalPages  int         `json:"total_pages"`
	FamilyCount int         `json:"family_count"`
	GuestCount  int         `json:"guest_count"`
}

// ListMembersHandler returns all members with optional pagination, search, and role filter
func ListMembersHandler(c *gin.Context) {
	ctx := c.Request.Context()

	query := database.Client.Member.Query().Where(member.IsActive(true))

	// Global category counts
	familyCount, _ := database.Client.Member.Query().
		Where(member.IsActive(true), member.RoleEQ(member.RoleFamily)).
		Count(ctx)
	guestCount, _ := database.Client.Member.Query().
		Where(member.IsActive(true), member.RoleNEQ(member.RoleFamily)).
		Count(ctx)

	// Optional search filter
	if search := strings.TrimSpace(c.Query("search")); search != "" {
		query = query.Where(member.NameContainsFold(search))
	}

	// Optional role filter
	if role := strings.TrimSpace(c.Query("role")); role != "" && role != "all" {
		if role == "family" {
			query = query.Where(member.RoleEQ(member.RoleFamily))
		} else if role == "neighbor" {
			query = query.Where(member.RoleNEQ(member.RoleFamily))
		} else {
			query = query.Where(member.RoleEQ(member.Role(role)))
		}
	}

	pageStr := c.Query("page")
	limitStr := c.Query("limit")

	// If pagination parameters are provided, perform paginated query
	if pageStr != "" || limitStr != "" || c.Query("search") != "" || c.Query("role") != "" {
		page, _ := strconv.Atoi(pageStr)
		if page <= 0 {
			page = 1
		}
		limit, _ := strconv.Atoi(limitStr)
		if limit <= 0 {
			limit = 10
		}

		total, err := query.Count(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count members: " + err.Error()})
			return
		}

		members, err := query.
			WithFaces(func(q *ent.MemberFaceQuery) {
				q.Where(memberface.IsActive(true)).Order(ent.Desc(memberface.FieldCreatedAt))
			}).
			Order(ent.Asc(member.FieldCreatedAt)).
			Offset((page - 1) * limit).
			Limit(limit).
			All(ctx)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch members: " + err.Error()})
			return
		}

		result := make([]MemberDTO, 0, len(members))
		for _, m := range members {
			avatarURL := m.AvatarURL
			if strings.HasPrefix(avatarURL, "blob:") {
				avatarURL = ""
			}

			// If avatar is empty but member has face samples, use the first valid face sample
			if avatarURL == "" && len(m.Edges.Faces) > 0 {
				for _, f := range m.Edges.Faces {
					if f.SampleImageURL != "" && !strings.HasPrefix(f.SampleImageURL, "blob:") {
						avatarURL = f.SampleImageURL
						break
					}
				}
			}

			dto := MemberDTO{
				ID:        m.ID,
				Name:      m.Name,
				Role:      string(m.Role),
				AvatarURL: avatarURL,
				IsActive:  m.IsActive,
				FaceCount: len(m.Edges.Faces),
				CreatedAt: m.CreatedAt,
				UpdatedAt: m.UpdatedAt,
			}

			faces := make([]FaceItemDTO, 0, len(m.Edges.Faces))
			for _, f := range m.Edges.Faces {
				sampleURL := f.SampleImageURL
				if strings.HasPrefix(sampleURL, "blob:") {
					sampleURL = ""
				}
				faces = append(faces, FaceItemDTO{
					ID:             f.ID,
					MemberID:       f.MemberID,
					SampleImageURL: sampleURL,
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

		totalPages := (total + limit - 1) / limit
		if totalPages <= 0 {
			totalPages = 1
		}

		c.JSON(http.StatusOK, PaginatedMembersResponse{
			Data:        result,
			Total:       total,
			Page:        page,
			Limit:       limit,
			TotalPages:  totalPages,
			FamilyCount: familyCount,
			GuestCount:  guestCount,
		})
		return
	}

	// Legacy / Unpaginated Fallback: Return raw array
	members, err := query.
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
		avatarURL := m.AvatarURL
		if strings.HasPrefix(avatarURL, "blob:") {
			avatarURL = ""
		}

		if avatarURL == "" && len(m.Edges.Faces) > 0 {
			for _, f := range m.Edges.Faces {
				if f.SampleImageURL != "" && !strings.HasPrefix(f.SampleImageURL, "blob:") {
					avatarURL = f.SampleImageURL
					break
				}
			}
		}

		dto := MemberDTO{
			ID:        m.ID,
			Name:      m.Name,
			Role:      string(m.Role),
			AvatarURL: avatarURL,
			IsActive:  m.IsActive,
			FaceCount: len(m.Edges.Faces),
			CreatedAt: m.CreatedAt,
			UpdatedAt: m.UpdatedAt,
		}

		faces := make([]FaceItemDTO, 0, len(m.Edges.Faces))
		for _, f := range m.Edges.Faces {
			sampleURL := f.SampleImageURL
			if strings.HasPrefix(sampleURL, "blob:") {
				sampleURL = ""
			}
			faces = append(faces, FaceItemDTO{
				ID:             f.ID,
				MemberID:       f.MemberID,
				SampleImageURL: sampleURL,
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

	avatarURL := input.AvatarURL
	if strings.HasPrefix(avatarURL, "blob:") {
		avatarURL = ""
	}

	m, err := database.Client.Member.Create().
		SetName(input.Name).
		SetRole(role).
		SetAvatarURL(avatarURL).
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
	if input.AvatarURL != nil {
		avatarURL := *input.AvatarURL
		if strings.HasPrefix(avatarURL, "blob:") {
			avatarURL = ""
		}
		updater.SetAvatarURL(avatarURL)
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

// UploadFaceImage uploads an image file to S3 and returns the presigned URL
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

	return storage.UploadObject(ctx, objName, src, file.Size, file.Header.Get("Content-Type"))
}

// UploadImageHandler handles multipart image uploads (avatars, face portraits) to S3 and returns presigned S3 URL
func UploadImageHandler(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		file, err = c.FormFile("avatar")
		if err != nil {
			file, err = c.FormFile("image")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Image file is required"})
				return
			}
		}
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to open image file: " + err.Error()})
		return
	}
	defer src.Close()

	ext := filepath.Ext(file.Filename)
	if ext == "" {
		ext = ".jpg"
	}

	folder := c.DefaultQuery("folder", "avatars")
	objName := fmt.Sprintf("%s/%s%s", folder, nanoid.New(), ext)

	presignedURL, err := storage.UploadObject(c.Request.Context(), objName, src, file.Size, file.Header.Get("Content-Type"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload to S3: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"url":         presignedURL,
		"object_name": objName,
	})
}

// GetPresignedUploadURLHandler returns a presigned PUT URL for client-side direct upload to S3
func GetPresignedUploadURLHandler(c *gin.Context) {
	ext := c.DefaultQuery("ext", ".jpg")
	folder := c.DefaultQuery("folder", "avatars")
	objName := fmt.Sprintf("%s/%s%s", folder, nanoid.New(), ext)

	uploadURL, err := storage.PresignedPutObjectURL(c.Request.Context(), objName, time.Minute*15)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate presigned upload URL: " + err.Error()})
		return
	}

	getURL, err := storage.PresignedGetObjectURL(c.Request.Context(), objName, time.Hour*24*7)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate presigned get URL: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"upload_url":  uploadURL,
		"get_url":     getURL,
		"object_name": objName,
	})
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

// ListMemberFacesHandler returns paginated faces for a specific member
func ListMemberFacesHandler(c *gin.Context) {
	memberID := c.Param("id")
	if memberID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid member ID"})
		return
	}

	pageStr := c.DefaultQuery("page", "1")
	limitStr := c.DefaultQuery("limit", "20")
	sortBy := c.DefaultQuery("sort_by", "created_at")
	order := c.DefaultQuery("order", "desc")

	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(limitStr)
	if limit < 1 {
		limit = 20
	}

	ctx := c.Request.Context()
	query := database.Client.MemberFace.Query().
		Where(memberface.MemberID(memberID), memberface.IsActive(true))

	// Sorting
	if sortBy == "quality_score" {
		if order == "asc" {
			query = query.Order(ent.Asc(memberface.FieldQualityScore))
		} else {
			query = query.Order(ent.Desc(memberface.FieldQualityScore))
		}
	} else { // default to created_at
		if order == "asc" {
			query = query.Order(ent.Asc(memberface.FieldCreatedAt))
		} else {
			query = query.Order(ent.Desc(memberface.FieldCreatedAt))
		}
	}

	total, err := query.Count(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count faces: " + err.Error()})
		return
	}

	faces, err := query.
		Offset((page - 1) * limit).
		Limit(limit).
		All(ctx)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch faces: " + err.Error()})
		return
	}

	result := make([]FaceItemDTO, 0, len(faces))
	for _, f := range faces {
		sampleURL := f.SampleImageURL
		if strings.HasPrefix(sampleURL, "blob:") {
			sampleURL = ""
		}
		result = append(result, FaceItemDTO{
			ID:             f.ID,
			MemberID:       f.MemberID,
			SampleImageURL: sampleURL,
			QualityScore:   f.QualityScore,
			Yaw:            f.Yaw,
			Pitch:          f.Pitch,
			BlurScore:      f.BlurScore,
			CreatedAt:      f.CreatedAt,
		})
	}

	totalPages := (total + limit - 1) / limit
	if totalPages == 0 {
		totalPages = 1
	}

	c.JSON(http.StatusOK, gin.H{
		"data":        result,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
}

// BatchDeleteMemberFacesInput represents the request body for batch delete
type BatchDeleteMemberFacesInput struct {
	FaceIDs []string `json:"face_ids" binding:"required"`
}

// BatchDeleteMemberFacesHandler deletes multiple face samples at once
func BatchDeleteMemberFacesHandler(c *gin.Context) {
	memberID := c.Param("id")
	if memberID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid member ID"})
		return
	}

	var input BatchDeleteMemberFacesInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	if len(input.FaceIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No face IDs provided"})
		return
	}

	ctx := c.Request.Context()

	// Soft delete or hard delete depending on schema. Currently using hard delete.
	_, err := database.Client.MemberFace.Delete().
		Where(
			memberface.MemberID(memberID),
			memberface.IDIn(input.FaceIDs...),
		).Exec(ctx)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete faces: " + err.Error()})
		return
	}

	// Notify vision-service to reload embeddings for this member
	_ = mq.PublishEvent("member.face.updated", gin.H{"action": "batch_delete_faces", "member_id": memberID})

	c.JSON(http.StatusOK, gin.H{
		"message": "Face samples deleted successfully",
		"count":   len(input.FaceIDs),
	})
}

