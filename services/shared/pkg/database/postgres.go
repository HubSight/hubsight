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

	// AutoMigrate all 10 domain models
	if err := gormDB.AutoMigrate(
		&models.User{},
		&models.Session{},
		&models.Camera{},
		&models.Recording{},
		&models.Member{},
		&models.MemberFace{},
		&models.Notification{},
		&models.PushSubscription{},
		&models.RecognitionLog{},
		&models.Setting{},
	); err != nil {
		return fmt.Errorf("failed running gorm automigrate: %w", err)
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
