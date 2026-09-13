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
	} {
		if _, exists := registered[want]; !exists {
			t.Errorf("route %q is not registered", want)
		}
	}
}
