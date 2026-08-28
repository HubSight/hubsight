package auth

import (
	"cctv/shared/ent"
	"cctv/shared/ent/user"
	"cctv/shared/pkg/database"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func LoginHandler(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	session, token, refreshToken, err := Login(c.Request.Context(), req.Username, req.Password, req.IsPWA)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	c.SetCookie("session", token, int(time.Until(session.ExpiresAt).Seconds()), "/", "", false, true)

	resp := gin.H{"status": "ok"}
	if req.IsPWA && refreshToken != "" {
		resp["refresh_token"] = refreshToken
	}

	c.JSON(http.StatusOK, resp)
}

func RefreshHandler(c *gin.Context) {
	var req RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.RefreshToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Refresh token required"})
		return
	}

	session, newToken, newRefreshToken, err := RefreshPWASession(c.Request.Context(), req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired refresh token"})
		return
	}

	c.SetCookie("session", newToken, int(time.Until(session.ExpiresAt).Seconds()), "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{
		"status":        "ok",
		"refresh_token": newRefreshToken,
	})
}

func LogoutHandler(c *gin.Context) {
	cookie, err := c.Cookie("session")
	if err == nil {
		Logout(c.Request.Context(), cookie)
	}

	c.SetCookie("session", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func MeHandler(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	c.JSON(http.StatusOK, user)
}

func ChangePasswordHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*ent.User)

	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if err := ChangePassword(c.Request.Context(), u, req.OldPassword, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "Password updated successfully"})
}

func VerifyPasswordHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u, ok := userObj.(*ent.User)
	if !ok || u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req VerifyPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password is required"})
		return
	}

	match, err := verifyPassword(req.Password, u.PasswordHash)
	if err != nil || !match {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Incorrect password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func UpdateLocaleHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*ent.User)

	var req UpdateLocaleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if req.Locale != "vi" && req.Locale != "en" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid locale. Must be 'vi' or 'en'"})
		return
	}

	updated, err := database.Client.User.UpdateOneID(u.ID).
		SetLocale(user.Locale(req.Locale)).
		Save(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update locale"})
		return
	}

	c.JSON(http.StatusOK, updated)
}

func UpdateTimezoneHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*ent.User)

	var req UpdateTimezoneRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Timezone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Timezone is required"})
		return
	}

	updated, err := database.Client.User.UpdateOneID(u.ID).
		SetTimezone(req.Timezone).
		Save(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update timezone in database"})
		return
	}

	c.JSON(http.StatusOK, updated)
}

func UpdatePreferencesHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*ent.User)

	var req UpdatePreferencesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	updateQuery := database.Client.User.UpdateOneID(u.ID)
	if req.Locale != nil && (*req.Locale == "vi" || *req.Locale == "en") {
		updateQuery.SetLocale(user.Locale(*req.Locale))
	}
	if req.Timezone != nil && *req.Timezone != "" {
		updateQuery.SetTimezone(*req.Timezone)
	}
	if req.PushPreferences != nil {
		updateQuery.SetPushPreferences(req.PushPreferences)
	}

	updated, err := updateQuery.Save(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update preferences in database"})
		return
	}

	c.JSON(http.StatusOK, updated)
}
