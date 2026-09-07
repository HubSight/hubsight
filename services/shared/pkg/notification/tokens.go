package notification

import "strings"

const (
	FCMEndpointPrefix = "fcm:"
	fcmPlaceholder    = "fcm"
)

func IsFCMEndpoint(endpoint string) bool {
	return strings.HasPrefix(endpoint, FCMEndpointPrefix)
}

func FCMTokenFromEndpoint(endpoint string) string {
	return strings.TrimPrefix(endpoint, FCMEndpointPrefix)
}

func fcmEndpointFromToken(token string) string {
	return FCMEndpointPrefix + token
}
