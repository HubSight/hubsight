package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	DatabaseURL string
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
	loadDotEnv()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	facesPublic := os.Getenv("FACES_S3_PUBLIC")
	return &Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
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

// loadDotEnv reads the nearest .env walking up from cwd / the executable.
// Existing environment variables (Docker Compose, shell) are never overwritten.
func loadDotEnv() {
	seen := map[string]struct{}{}
	for _, dir := range searchDirs() {
		path := filepath.Join(dir, ".env")
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		if err := applyDotEnv(path); err == nil {
			return
		}
	}
}

func searchDirs() []string {
	var dirs []string
	if cwd, err := os.Getwd(); err == nil {
		dirs = append(dirs, walkUp(cwd)...)
	}
	if exe, err := os.Executable(); err == nil {
		dirs = append(dirs, walkUp(filepath.Dir(exe))...)
	}
	return dirs
}

func walkUp(start string) []string {
	dir, err := filepath.Abs(start)
	if err != nil {
		return nil
	}
	var dirs []string
	for i := 0; i < 8; i++ {
		dirs = append(dirs, dir)
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return dirs
}

func applyDotEnv(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		val = strings.TrimSpace(val)
		if len(val) >= 2 {
			if q := val[0]; (q == '"' || q == '\'') && val[len(val)-1] == q {
				val = val[1 : len(val)-1]
			}
		}
		if os.Getenv(key) == "" {
			_ = os.Setenv(key, val)
		}
	}
	return scanner.Err()
}
