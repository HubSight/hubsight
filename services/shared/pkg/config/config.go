package config

import (
	"os"
)

type Config struct {
	DatabaseURL string
	RTSPURL     string
	Port        string
	S3Endpoint  string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string
	S3UseSSL    bool

	FacesS3Endpoint  string
	FacesS3Bucket    string
	FacesS3AccessKey string
	FacesS3SecretKey string
	FacesS3UseSSL    bool
	FacesS3Region    string
	FacesS3Namespace string
	FacesS3Public    bool
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	facesPublic := os.Getenv("FACES_S3_PUBLIC")
	return &Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		RTSPURL:     os.Getenv("RTSP_URL"),
		Port:        port,
		S3Endpoint:  os.Getenv("S3_ENDPOINT"),
		S3Bucket:    os.Getenv("S3_BUCKET"),
		S3AccessKey: os.Getenv("S3_ACCESS_KEY"),
		S3SecretKey: os.Getenv("S3_SECRET_KEY"),
		S3UseSSL:    os.Getenv("S3_USE_SSL") == "true",

		FacesS3Endpoint:  os.Getenv("FACES_S3_ENDPOINT"),
		FacesS3Bucket:    os.Getenv("FACES_S3_BUCKET"),
		FacesS3AccessKey: os.Getenv("FACES_S3_ACCESS_KEY"),
		FacesS3SecretKey: os.Getenv("FACES_S3_SECRET_KEY"),
		FacesS3UseSSL:    os.Getenv("FACES_S3_USE_SSL") != "false",
		FacesS3Region:    os.Getenv("FACES_S3_REGION"),
		FacesS3Namespace: os.Getenv("FACES_S3_NAMESPACE"),
		FacesS3Public:    facesPublic != "false",
	}
}
