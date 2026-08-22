package config

import (
	"os"
)

type Config struct {
	DatabaseURL  string
	RTSPURL      string
	Port         string
	S3Endpoint   string
	S3Bucket     string
	S3AccessKey  string
	S3SecretKey  string
	S3UseSSL     bool
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	return &Config{
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		RTSPURL:      os.Getenv("RTSP_URL"),
		Port:         port,
		S3Endpoint:   os.Getenv("S3_ENDPOINT"),
		S3Bucket:     os.Getenv("S3_BUCKET"),
		S3AccessKey:  os.Getenv("S3_ACCESS_KEY"),
		S3SecretKey:  os.Getenv("S3_SECRET_KEY"),
		S3UseSSL:     os.Getenv("S3_USE_SSL") == "true",
	}
}
