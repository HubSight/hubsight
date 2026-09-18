package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Standard Machine-Readable Error Codes (Zero human-readable text)
const (
	// Generic & HTTP
	ErrInvalidInput       = "INVALID_INPUT"
	ErrUnauthorized       = "UNAUTHORIZED"
	ErrForbidden          = "FORBIDDEN"
	ErrNotFound           = "NOT_FOUND"
	ErrConflict           = "CONFLICT"
	ErrInternalServer     = "INTERNAL_SERVER_ERROR"
	ErrInternalError      = "INTERNAL_SERVER_ERROR"
	ErrDatabaseError      = "DATABASE_ERROR"
	ErrTooManyRequests    = "TOO_MANY_REQUESTS"
	ErrServiceUnavailable = "SERVICE_UNAVAILABLE"

	// Auth & Sessions
	ErrInvalidCredentials   = "INVALID_CREDENTIALS"
	ErrTwoFactorRequired    = "TWO_FACTOR_REQUIRED"
	ErrTwoFactorInvalid     = "TWO_FACTOR_INVALID"
	ErrTwoFactorExpired     = "TWO_FACTOR_EXPIRED"
	ErrMustChangePassword   = "MUST_CHANGE_PASSWORD"
	ErrClientKeyRequired    = "CLIENT_KEY_REQUIRED"
	ErrInvalidClientKey     = "INVALID_CLIENT_KEY"
	ErrAppKeyRequired       = "APP_KEY_REQUIRED"
	ErrInvalidAppKey        = "INVALID_APP_KEY"
	ErrAppApiDisabled       = "APP_API_DISABLED"
	ErrAdminApiDisabled     = "ADMIN_API_DISABLED"
	ErrAdminKeyRequired     = "ADMIN_API_KEY_REQUIRED"
	ErrInvalidAdminKey      = "INVALID_ADMIN_API_KEY"
	ErrInvalidAdminJWT      = "INVALID_ADMIN_JWT"
	ErrAdminAccessRequired  = "ADMIN_ACCESS_REQUIRED"
	ErrSessionNotFound      = "SESSION_NOT_FOUND"
	ErrCannotRevokeCurrent  = "CANNOT_REVOKE_CURRENT_SESSION"
	ErrInvalidRefreshToken  = "INVALID_REFRESH_TOKEN"
	ErrRefreshTokenRequired = "REFRESH_TOKEN_REQUIRED"
	ErrPasswordRequired     = "PASSWORD_REQUIRED"
	ErrIncorrectPassword    = "INCORRECT_PASSWORD"
	ErrInvalidLocale        = "INVALID_LOCALE"
	ErrTimezoneRequired     = "TIMEZONE_REQUIRED"
	ErrInvalidTheme         = "INVALID_THEME"
	ErrPasskeyFailed        = "PASSKEY_VERIFICATION_FAILED"

	// Devices & Cameras
	ErrDeviceNotFound       = "DEVICE_NOT_FOUND"
	ErrInvalidDeviceID      = "INVALID_DEVICE_ID"
	ErrDeviceCreateFailed   = "DEVICE_CREATE_FAILED"
	ErrDeviceUpdateFailed   = "DEVICE_UPDATE_FAILED"
	ErrDeviceDeleteFailed   = "DEVICE_DELETE_FAILED"
	ErrStreamNotFound       = "STREAM_NOT_FOUND"
	ErrPoolUnavailable      = "POOL_UNAVAILABLE"
	ErrOnvifProbeFailed     = "ONVIF_PROBE_FAILED"
	ErrOnvifNotEnabled      = "ONVIF_NOT_ENABLED"
	ErrOnvifPtzNotSupported = "ONVIF_PTZ_NOT_SUPPORTED"
	ErrOnvifActionFailed    = "ONVIF_ACTION_FAILED"

	// Members & Faces
	ErrMemberNotFound     = "MEMBER_NOT_FOUND"
	ErrFaceSampleNotFound = "FACE_SAMPLE_NOT_FOUND"

	// Notifications
	ErrNotificationNotFound = "NOTIFICATION_NOT_FOUND"
	ErrPushTokenRequired    = "PUSH_TOKEN_REQUIRED"

	// App Config & Settings
	ErrConfigNotFound         = "CONFIG_NOT_FOUND"
	ErrServiceAccountNotFound = "SERVICE_ACCOUNT_NOT_FOUND"
	ErrRecordingNotFound      = "RECORDING_NOT_FOUND"
	ErrStorageError           = "STORAGE_ERROR"
	ErrStorageUnavailable     = "STORAGE_UNAVAILABLE"
	ErrInvalidPinLength       = "INVALID_PIN_LENGTH"
	ErrInvalidPinFormat       = "INVALID_PIN_FORMAT"
	ErrClientNotFound         = "CLIENT_NOT_FOUND"
	ErrConfigPackFailed       = "CONFIG_PACK_FAILED"
	ErrFirebaseInspectFailed  = "FIREBASE_INSPECT_FAILED"
)

// Error writes a standardized machine-readable error response.
// Note: Sets both "code" and "error" to the same error code to guarantee backwards compatibility
// with clients expecting either field, while completely eliminating any human-readable message text.
func Error(c *gin.Context, httpStatus int, code string, details ...map[string]any) {
	resp := gin.H{
		"status": "error",
		"code":   code,
		"error":  code,
	}
	if len(details) > 0 && details[0] != nil {
		resp["details"] = details[0]
	}
	c.JSON(httpStatus, resp)
}

// AbortError writes a standardized machine-readable error response and aborts middleware chain.
func AbortError(c *gin.Context, httpStatus int, code string, details ...map[string]any) {
	resp := gin.H{
		"status": "error",
		"code":   code,
		"error":  code,
	}
	if len(details) > 0 && details[0] != nil {
		resp["details"] = details[0]
	}
	c.AbortWithStatusJSON(httpStatus, resp)
}

// OK writes a standardized success response without friendly message text.
func OK(c *gin.Context, data ...any) {
	if len(data) > 0 && data[0] != nil {
		c.JSON(http.StatusOK, data[0])
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
