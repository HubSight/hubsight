package database

import (
	"log"

	"cctv/shared/pkg/models"
	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SystemPermissions lists all standard capabilities defined by the HubSight platform.
var SystemPermissions = []models.Permission{
	// Cameras
	{Code: "cameras:view", Name: "Xem Camera & Live", Description: "Xem danh sách camera và theo dõi luồng trực tiếp WebRTC", Module: "cameras"},
	{Code: "cameras:manage", Name: "Quản lý Camera", Description: "Thêm, sửa, xóa, quét mạng RTSP và điều khiển luồng camera", Module: "cameras"},

	// Members (AI Face Recognition)
	{Code: "members:view", Name: "Xem Thành viên & AI", Description: "Xem danh sách nhận diện khuôn mặt và nhật ký AI", Module: "members"},
	{Code: "members:manage", Name: "Quản lý Thành viên", Description: "Thêm/sửa/xóa thành viên, tải ảnh và trích xuất vector khuôn mặt", Module: "members"},

	// Recordings & Playback
	{Code: "recordings:view", Name: "Xem lại Video", Description: "Truy cập dòng thời gian NVR và phát video lưu trữ", Module: "recordings"},
	{Code: "recordings:delete", Name: "Xóa Video lưu trữ", Description: "Xóa bản ghi và phân đoạn video đã lưu", Module: "recordings"},

	// System & Monitoring
	{Code: "system:monitor", Name: "Giám sát Hệ thống", Description: "Xem trạng thái NVR recorder và Connection Pool", Module: "system"},
	{Code: "system:settings", Name: "Cài đặt Hệ thống", Description: "Cấu hình lưu trữ và dọn dẹp dung lượng đĩa", Module: "system"},

	// Access Control
	{Code: "users:view", Name: "Xem Người dùng", Description: "Xem danh sách tài khoản người dùng và trạng thái", Module: "access"},
	{Code: "users:manage", Name: "Quản lý Người dùng", Description: "Tạo tài khoản, gán vai trò, đặt lại mật khẩu và khóa tài khoản", Module: "access"},
	{Code: "roles:manage", Name: "Quản lý Vai trò", Description: "Tạo mới, chỉnh sửa ma trận quyền và xóa vai trò tùy chỉnh", Module: "access"},
	{Code: "clients:manage", Name: "Quản lý Ứng dụng & API Keys", Description: "Tạo, sửa, đổi mã key, bật/tắt và xóa các client ứng dụng kết nối", Module: "access"},
	{Code: "app_configs:manage", Name: "Quản lý Cấu hình Ứng dụng (.hscfg)", Description: "Tạo, tải về, sinh mã QR và xóa file cấu hình bảo mật cho ứng dụng Mobile & Desktop", Module: "access"},
	{Code: "mobile_configs:manage", Name: "Quản lý Cấu hình Ứng dụng (.hscfg) [Legacy]", Description: "Quyền kế thừa tương thích cho cấu hình ứng dụng", Module: "access"},
}

// SeedDefaultRolesAndPermissions ensures permissions, default roles, and user associations are synced.
func SeedDefaultRolesAndPermissions(db *gorm.DB) error {
	// 1. Seed or update all system permissions
	permMap := make(map[string]*models.Permission)
	for _, p := range SystemPermissions {
		var existing models.Permission
		if err := db.Where("code = ?", p.Code).First(&existing).Error; err != nil {
			// Create new permission
			newP := p
			newP.ID = nanoid.New()
			if err := db.Create(&newP).Error; err != nil {
				log.Printf("Warning: failed to seed permission %s: %v", p.Code, err)
				continue
			}
			permMap[p.Code] = &newP
		} else {
			// Update name/desc if changed
			existing.Name = p.Name
			existing.Description = p.Description
			existing.Module = p.Module
			_ = db.Save(&existing).Error
			permMap[p.Code] = &existing
		}
	}

	// Helper to resolve permissions by codes
	getPerms := func(codes ...string) []*models.Permission {
		var list []*models.Permission
		for _, c := range codes {
			if p, ok := permMap[c]; ok {
				list = append(list, p)
			}
		}
		return list
	}

	allPerms := make([]*models.Permission, 0, len(permMap))
	for _, p := range permMap {
		allPerms = append(allPerms, p)
	}

	// 2. Ensure default roles exist
	type defaultRoleDef struct {
		Code        string
		Name        string
		Description string
		IsSystem    bool
		Perms       []*models.Permission
	}

	defaultRoles := []defaultRoleDef{
		{
			Code:        "admin",
			Name:        "Quản trị viên",
			Description: "Toàn quyền quản trị hệ thống, thiết bị, người dùng và phân quyền",
			IsSystem:    true,
			Perms:       allPerms,
		},
		{
			Code:        "operator",
			Name:        "Điều hành viên",
			Description: "Quản lý camera, thành viên AI, xem lại video và giám sát hệ thống",
			IsSystem:    false,
			Perms: getPerms(
				"cameras:view", "cameras:manage",
				"members:view", "members:manage",
				"recordings:view", "system:monitor",
			),
		},
		{
			Code:        "viewer",
			Name:        "Người xem",
			Description: "Chỉ có quyền xem trực tiếp camera và phát lại video",
			IsSystem:    true,
			Perms: getPerms(
				"cameras:view", "recordings:view",
			),
		},
	}

	roleMap := make(map[string]*models.Role)
	for _, dr := range defaultRoles {
		var role models.Role
		if err := db.Where("code = ?", dr.Code).First(&role).Error; err != nil {
			role = models.Role{
				ID:          nanoid.New(),
				Code:        dr.Code,
				Name:        dr.Name,
				Description: dr.Description,
				IsSystem:    dr.IsSystem,
			}
			if err := db.Create(&role).Error; err != nil {
				log.Printf("Warning: failed to seed role %s: %v", dr.Code, err)
				continue
			}
		} else {
			// Keep system flag synced
			if role.IsSystem != dr.IsSystem {
				role.IsSystem = dr.IsSystem
				_ = db.Model(&role).Update("is_system", dr.IsSystem).Error
			}
		}

		// Sync permissions for system roles if empty or default
		var count int64
		_ = db.Table("role_permissions").Where("role_id = ?", role.ID).Count(&count).Error
		if count == 0 || role.Code == "admin" {
			_ = db.Model(&role).Association("Permissions").Replace(dr.Perms)
		}
		roleMap[dr.Code] = &role
	}

	// 3. Migrate existing users who lack role_id
	if adminRole, ok := roleMap["admin"]; ok {
		_ = db.Model(&models.User{}).
			Where("(role_id IS NULL OR role_id = '') AND role = ?", models.RoleAdmin).
			Update("role_id", adminRole.ID).Error
	}
	if viewerRole, ok := roleMap["viewer"]; ok {
		_ = db.Model(&models.User{}).
			Where("(role_id IS NULL OR role_id = '') AND (role = ? OR role IS NULL OR role = '')", models.RoleViewer).
			Update("role_id", viewerRole.ID).Error
	}

	// 4. Seed default system API clients (Web Portal & Flutter Mobile)
	if err := SeedDefaultApiClients(db); err != nil {
		log.Printf("Warning: failed seeding default API clients: %v", err)
	}

	return nil
}

// SeedDefaultApiClients ensures standard system clients exist and are active.
func SeedDefaultApiClients(db *gorm.DB) error {
	defaultClients := []models.ApiClient{
		{
			ClientID:     "hs_web_client_core",
			APIKey:       "hs_web_client_core",
			Name:         "HubSight Web Portal",
			Platform:     models.PlatformWebSPA,
			ClientType:   models.ClientTypePublic,
			IsActive:     true,
			IsSystem:     true,
			RateLimitRPS: 0,
		},
		{
			ClientID:     "hs_mob_client_default",
			APIKey:       "hs_mob_client_default",
			Name:         "HubSight Mobile App",
			Platform:     models.PlatformMobile,
			ClientType:   models.ClientTypePublic,
			IsActive:     true,
			IsSystem:     true,
			RateLimitRPS: 0,
		},
	}

	for _, dc := range defaultClients {
		var existing models.ApiClient
		if err := db.Where("client_id = ?", dc.ClientID).First(&existing).Error; err != nil {
			newClient := dc
			newClient.ID = nanoid.New()
			if err := db.Create(&newClient).Error; err != nil {
				log.Printf("Warning: failed to seed client %s: %v", dc.ClientID, err)
			}
		} else {
			// Keep system flag, name and platform synced
			updates := map[string]interface{}{}
			if !existing.IsSystem {
				updates["is_system"] = true
			}
			if existing.Name != dc.Name {
				updates["name"] = dc.Name
			}
			if existing.Platform != dc.Platform {
				updates["platform"] = dc.Platform
			}
			if len(updates) > 0 {
				_ = db.Model(&existing).Updates(updates).Error
			}
		}
	}
	return nil
}

// Suppress unused clause import warning if compiler complains
var _ = clause.OnConflict{}
