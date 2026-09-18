package auth

import (
	"testing"

	"cctv/shared/pkg/models"
)

func TestHasAdminAPIAccess(t *testing.T) {
	tests := []struct {
		name string
		user *models.User
		want bool
	}{
		{name: "admin role", user: &models.User{Role: models.RoleAdmin, IsActive: true}, want: true},
		{name: "inactive admin", user: &models.User{Role: models.RoleAdmin, IsActive: false}, want: false},
		{name: "viewer denied", user: &models.User{Role: models.RoleViewer, IsActive: true, Permissions: []string{"cameras:view"}}, want: false},
		{name: "explicit permission", user: &models.User{Role: models.RoleOperator, IsActive: true, Permissions: []string{AdminAPIAccessPermission}}, want: true},
		{name: "wildcard permission", user: &models.User{Role: models.RoleOperator, IsActive: true, Permissions: []string{"*"}}, want: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := HasAdminAPIAccess(test.user); got != test.want {
				t.Fatalf("HasAdminAPIAccess() = %v, want %v", got, test.want)
			}
		})
	}
}
