package member

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/storage"

	"github.com/gin-gonic/gin"
)

func avatarObjectName(memberID string) string {
	return "avatars/" + memberID + ".jpg"
}

// DeleteMemberAvatarHandler removes the stored avatar object, clears member.avatar_url,
// and deletes the ArcFace sample that was enrolled from that avatar.
func DeleteMemberAvatarHandler(c *gin.Context) {
	memberID := c.Param("id")
	if memberID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid member ID", "code": "BAD_REQUEST"})
		return
	}
	ctx := c.Request.Context()
	var m models.Member
	if err := database.DB.WithContext(ctx).First(&m, "id = ?", memberID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Member not found", "code": "NOT_FOUND"})
		return
	}
	if err := clearMemberAvatar(ctx, memberID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete avatar: " + err.Error(), "code": "INTERNAL"})
		return
	}
	if err := database.DB.WithContext(ctx).First(&m, "id = ?", memberID).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": true, "avatar_url": ""})
		return
	}
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

func clearMemberAvatar(ctx context.Context, memberID string) error {
	var m models.Member
	if err := database.DB.WithContext(ctx).First(&m, "id = ?", memberID).Error; err != nil {
		return err
	}

	obj := avatarObjectName(memberID)
	if err := storage.DeleteFaceObject(ctx, obj); err != nil {
		log.Printf("[member] failed to delete avatar object %s: %v", obj, err)
	}
	if old := storage.ObjectNameFromURL(m.AvatarURL); old != "" && strings.HasPrefix(old, "avatars/") && old != obj {
		if err := storage.DeleteFaceObject(ctx, old); err != nil {
			log.Printf("[member] failed to delete leftover avatar %s: %v", old, err)
		}
	}

	var faces []models.MemberFace
	if err := database.DB.WithContext(ctx).Where("member_id = ?", memberID).Find(&faces).Error; err != nil {
		return err
	}
	deletedFace := false
	for _, f := range faces {
		sampleObj := storage.ObjectNameFromURL(f.SampleImageURL)
		if sampleObj != obj && !strings.HasPrefix(sampleObj, "avatars/"+memberID) {
			continue
		}
		if sampleObj != "" && sampleObj != obj {
			deleteStoredSampleImage(ctx, f.SampleImageURL)
		}
		if err := database.DB.WithContext(ctx).Delete(&models.MemberFace{}, "id = ?", f.ID).Error; err != nil {
			log.Printf("[member] failed to delete avatar face row %s: %v", f.ID, err)
			continue
		}
		deletedFace = true
	}

	if err := database.DB.WithContext(ctx).Model(&models.Member{}).Where("id = ?", memberID).Update("avatar_url", "").Error; err != nil {
		return err
	}
	if deletedFace {
		mq.PublishMemberEvent("member.face.updated", gin.H{"action": "delete_avatar", "member_id": memberID})
	} else {
		mq.PublishMemberEvent("member.face.updated", gin.H{"action": "update", "member_id": memberID})
	}
	return nil
}

// UpdateMemberAvatarHandler replaces a member avatar: exactly one face, JPEG ≤500KB,
// object key avatars/{memberID}.jpg, and enrolls the photo as an ArcFace sample.
func UpdateMemberAvatarHandler(c *gin.Context) {
	memberID := c.Param("id")
	if memberID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid member ID", "code": "BAD_REQUEST"})
		return
	}

	ctx := c.Request.Context()
	var m models.Member
	if err := database.DB.WithContext(ctx).First(&m, "id = ?", memberID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Member not found", "code": "NOT_FOUND"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		file, err = c.FormFile("avatar")
		if err != nil {
			file, err = c.FormFile("image")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Image file is required", "code": "BAD_REQUEST"})
				return
			}
		}
	}
	if file.Size > maxAvatarUploadBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": avatarTooLargeError, "code": "TOO_LARGE"})
		return
	}
	if !allowedJPEGOrPNG(file.Header.Get("Content-Type"), file.Filename) {
		c.JSON(http.StatusBadRequest, gin.H{"error": jpegPNGOnlyError, "code": "BAD_TYPE"})
		return
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to open image file", "code": "DECODE_ERROR"})
		return
	}
	defer src.Close()
	raw, err := io.ReadAll(io.LimitReader(src, maxAvatarUploadBytes+1))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read image file", "code": "DECODE_ERROR"})
		return
	}
	if int64(len(raw)) > maxAvatarUploadBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": avatarTooLargeError, "code": "TOO_LARGE"})
		return
	}
	if !sniffJPEGOrPNG(raw) {
		c.JSON(http.StatusBadRequest, gin.H{"error": jpegPNGOnlyError, "code": "BAD_TYPE"})
		return
	}

	jpegBytes, err := compressAvatarJPEG(raw)
	if err != nil || len(jpegBytes) == 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "Could not compress avatar under 500KB", "code": "COMPRESS_FAILED"})
		return
	}

	vision, status, err := callVisionEnroll(ctx, jpegBytes, "image/jpeg", false)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Vision service unavailable", "code": "VISION_UNAVAILABLE"})
		return
	}
	if vision == nil || !vision.OK || len(vision.Embedding) != 512 {
		code := "VISION_UNAVAILABLE"
		msg := "Face validation failed"
		if vision != nil {
			if vision.Code != "" {
				code = vision.Code
			}
			if vision.Message != "" {
				msg = vision.Message
			}
		}
		httpStatus := http.StatusUnprocessableEntity
		if status == http.StatusServiceUnavailable || code == "VISION_UNAVAILABLE" {
			httpStatus = http.StatusServiceUnavailable
		}
		c.JSON(httpStatus, gin.H{"error": msg, "code": code})
		return
	}
	if crop, derr := base64.StdEncoding.DecodeString(vision.CropJPEGB64); derr == nil && len(crop) > 0 && len(jpegBytes) > maxAvatarStoredBytes {
		jpegBytes = crop
	}

	objName := avatarObjectName(memberID)
	oldObj := storage.ObjectNameFromURL(m.AvatarURL)

	avatarURL, err := storage.UploadFaceObject(ctx, objName, bytes.NewReader(jpegBytes), int64(len(jpegBytes)), "image/jpeg")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload avatar: " + err.Error(), "code": "STORAGE"})
		return
	}
	avatarURL = withCacheBust(avatarURL)

	if oldObj != "" && oldObj != objName && strings.HasPrefix(oldObj, "avatars/") {
		if err := storage.DeleteFaceObject(ctx, oldObj); err != nil {
			log.Printf("[member] failed to delete old avatar %s: %v", oldObj, err)
		}
	}

	if err := database.DB.WithContext(ctx).Model(&models.Member{}).Where("id = ?", memberID).Update("avatar_url", avatarURL).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update member avatar: " + err.Error(), "code": "INTERNAL"})
		return
	}

	var updated models.Member
	if err := database.DB.WithContext(ctx).First(&updated, "id = ?", memberID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload member: " + err.Error(), "code": "INTERNAL"})
		return
	}

	if err := upsertAvatarFace(ctx, memberID, avatarURL, vision); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to enroll avatar face: " + err.Error(), "code": "INTERNAL"})
		return
	}

	mq.PublishMemberEvent("member.face.updated", gin.H{"action": "avatar", "member_id": memberID})

	c.JSON(http.StatusOK, MemberDTO{
		ID:        updated.ID,
		Name:      updated.Name,
		Role:      string(updated.Role),
		AvatarURL: updated.AvatarURL,
		IsActive:  updated.IsActive,
		CreatedAt: updated.CreatedAt,
		UpdatedAt: updated.UpdatedAt,
	})
}

func withCacheBust(rawURL string) string {
	if rawURL == "" {
		return rawURL
	}
	sep := "?"
	if strings.Contains(rawURL, "?") {
		sep = "&"
	}
	return rawURL + sep + "v=" + fmt.Sprintf("%d", time.Now().Unix())
}

func upsertAvatarFace(ctx context.Context, memberID, sampleURL string, vision *visionEnrollResponse) error {
	obj := storage.ObjectNameFromURL(sampleURL)
	var faces []models.MemberFace
	if err := database.DB.WithContext(ctx).Where("member_id = ?", memberID).Find(&faces).Error; err != nil {
		return err
	}
	for _, f := range faces {
		if storage.ObjectNameFromURL(f.SampleImageURL) == obj {
			return database.DB.WithContext(ctx).Model(&models.MemberFace{}).Where("id = ?", f.ID).Updates(map[string]interface{}{
				"embedding":        vision.Embedding,
				"sample_image_url": sampleURL,
				"quality_score":    vision.QualityScore,
				"yaw":              vision.Yaw,
				"pitch":            vision.Pitch,
				"blur_score":       vision.BlurScore,
				"is_active":        true,
			}).Error
		}
	}
	face := models.MemberFace{
		MemberID:       memberID,
		Embedding:      vision.Embedding,
		SampleImageURL: sampleURL,
		QualityScore:   vision.QualityScore,
		Yaw:            vision.Yaw,
		Pitch:          vision.Pitch,
		BlurScore:      vision.BlurScore,
		IsActive:       true,
	}
	return database.DB.WithContext(ctx).Create(&face).Error
}
