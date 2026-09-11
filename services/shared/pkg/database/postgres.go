package database

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"time"

	"cctv/shared/pkg/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB is the global GORM database handle.
var DB *gorm.DB

// Connect establishes the PostgreSQL database connection for GORM,
// configures connection pool limits, runs schema auto-migrations, and exposes the DB client.
func Connect(dbURL string) error {
	if dbURL == "" {
		dbURL = os.Getenv("DATABASE_URL")
	}
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL is not set")
	}

	// 1. Initialize GORM with pgx driver
	gormDB, err := gorm.Open(postgres.Open(dbURL), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		Logger:                                   logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return fmt.Errorf("failed opening connection to postgres with gorm: %w", err)
	}

	sqlDB, err := gormDB.DB()
	if err != nil {
		return fmt.Errorf("failed getting underlying sql.DB from gorm: %w", err)
	}

	// Sane pool limits for Aiven PostgreSQL (shared multi-service environment)
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)

	// Serialize AutoMigrate and RBAC seeding across microservices using a PostgreSQL advisory lock
	const migrationLockKey int64 = 839210492810
	var acquired bool
	if err := gormDB.Raw("SELECT pg_try_advisory_lock(?)", migrationLockKey).Scan(&acquired).Error; err == nil && acquired {
		defer gormDB.Exec("SELECT pg_advisory_unlock(?)", migrationLockKey)

		// Run AutoMigrate with a silent logger to suppress the hundreds of
		// pg_catalog inspection queries GORM issues per table (each takes ~250-780ms
		// on Aiven). These are expected and not errors — we only want runtime query
		// warnings after startup is complete.
		migrateDB := gormDB.Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent)})
		if err := migrateDB.AutoMigrate(
			&models.User{},
			&models.Session{},
			&models.Role{},
			&models.Permission{},
			&models.Camera{},
			&models.Recording{},
			&models.Member{},
			&models.MemberFace{},
			&models.Notification{},
			&models.PushSubscription{},
			&models.RecognitionLog{},
			&models.Setting{},
			&models.PasskeyCredential{},
			&models.ApiClient{},
			&models.GoogleServiceAccount{},
			&models.AppConfig{},
			&models.KnownDevice{},
		); err != nil {
			return fmt.Errorf("failed running gorm automigrate: %w", err)
		}

		// Ensure smooth migration from mobile_configs to app_configs if old table exists
		_ = gormDB.Exec("DO $$ BEGIN IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mobile_configs') AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'app_configs') THEN ALTER TABLE mobile_configs RENAME TO app_configs; END IF; END $$;").Error

		// Seed RBAC permissions and default roles
		if err := SeedDefaultRolesAndPermissions(gormDB); err != nil {
			log.Printf("Warning: failed seeding RBAC: %v", err)
		}

		// ── Full-Text Search & Performance Indexes ────────────────────────────
		// pg_trgm enables GIN trigram indexes that make ILIKE '%keyword%' use an
		// index instead of a sequential scan. This is the correct approach for
		// Vietnamese (tonal language — diacritics are semantically meaningful, so
		// unaccent is wrong) and also works for Korean, Japanese, Chinese, Thai
		// since all scripts produce distinct trigrams per character.
		_ = gormDB.Exec("CREATE EXTENSION IF NOT EXISTS pg_trgm").Error

		// GIN trigram indexes for ILIKE text search (idempotent)
		_ = gormDB.Exec("CREATE INDEX IF NOT EXISTS idx_members_name_trgm ON members USING GIN (name gin_trgm_ops)").Error
		_ = gormDB.Exec("CREATE INDEX IF NOT EXISTS idx_cameras_name_trgm ON cameras USING GIN (name gin_trgm_ops)").Error
		_ = gormDB.Exec("CREATE INDEX IF NOT EXISTS idx_users_fullname_trgm ON users USING GIN (full_name gin_trgm_ops)").Error
	} else {
		// Another service is running migration; wait until it finishes
		gormDB.Exec("SELECT pg_advisory_lock(?)", migrationLockKey)
		gormDB.Exec("SELECT pg_advisory_unlock(?)", migrationLockKey)
	}

	DB = gormDB

	log.Printf("Connected to PostgreSQL (%s) and ran GORM migrations successfully.", redactDatabaseURL(dbURL))
	return nil
}

// Close gracefully terminates the GORM database connection pool.
func Close() {
	if DB != nil {
		if sqlDB, err := DB.DB(); err == nil && sqlDB != nil {
			_ = sqlDB.Close()
		}
	}
}

func redactDatabaseURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return "(unparseable DATABASE_URL)"
	}
	return u.Redacted()
}
