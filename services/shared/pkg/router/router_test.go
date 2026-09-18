package router

import (
	"testing"

	"github.com/gin-gonic/gin"
)

func TestNewRegistersNotificationBatchDeleteRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	routes := New().Routes()

	registered := make(map[string]struct{}, len(routes))
	for _, route := range routes {
		registered[route.Method+" "+route.Path] = struct{}{}
	}

	for _, want := range []string{
		"DELETE /api/notifications/batch",
		"DELETE /api/app/v1/notifications/batch",
		"GET /api/admin/v1/system/status",
		"GET /api/admin/v1/system/capabilities",
		"GET /api/admin/v1/cameras",
	} {
		if _, exists := registered[want]; !exists {
			t.Errorf("route %q is not registered", want)
		}
	}
}
