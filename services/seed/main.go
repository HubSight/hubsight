package main

import (
	"context"
	"encoding/base64"
	"encoding/csv"
	"fmt"
	"log"
	"os"

	"cctv/shared/ent/user"
	"cctv/shared/pkg/config"
	"cctv/shared/pkg/database"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/argon2"
)

type SeedUser struct {
	Username string
	FullName string
	Password string
}

var usersToSeed = []SeedUser{
	{Username: "giangttt", FullName: "Trần Thị Thuỳ Giang", Password: "cWJsT8"},
	{Username: "huyenltt", FullName: "Lê Thị Thanh Huyền", Password: "NuUgsf"},
	{Username: "quynhttn", FullName: "Trần Thị Như Quỳnh", Password: "FNZHTi"},
	{Username: "quocta", FullName: "Trần Anh Quốc", Password: "x9bdRc"},
	{Username: "quangt", FullName: "Trần Quang", Password: "XJq76y"},
	{Username: "thupt", FullName: "Phạm Thị Thứ", Password: "xtRPW4"},
	{Username: "tamdnm", FullName: "Đào Ngọc Minh Tâm", Password: "z7ceZF"},
	{Username: "longdvp", FullName: "Đào Vũ Phi Long", Password: "6sbvJ6"},
}

const (
	timeCost = 1
	memory   = 64 * 1024
	threads  = 4
	keyLen   = 32
	saltLen  = 16
)

func hashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	hash := argon2.IDKey([]byte(password), salt, timeCost, memory, threads, keyLen)
	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encodedHash := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, memory, timeCost, threads, b64Salt, b64Hash)

	return encodedHash, nil
}

func main() {
	cfg := config.Load()
	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	ctx := context.Background()

	// 1. Update admin full_name
	_ = database.Client.User.Update().
		Where(user.Username("admin")).
		SetFullName("Administrator").
		SetRole(user.RoleAdmin).
		Exec(ctx)

	// 2. Prepare CSV data
	csvRecords := [][]string{
		{"Username", "Full Name", "Role", "Password"},
	}

	for _, u := range usersToSeed {
		hash, err := hashPassword(u.Password)
		if err != nil {
			log.Fatalf("Failed to hash password for %s: %v", u.Username, err)
		}

		exists, err := database.Client.User.Query().
			Where(user.Username(u.Username)).
			Exist(ctx)
		if err != nil {
			log.Fatalf("Database query error for %s: %v", u.Username, err)
		}

		if exists {
			// Update existing user with full_name, role, password
			err = database.Client.User.Update().
				Where(user.Username(u.Username)).
				SetFullName(u.FullName).
				SetPasswordHash(hash).
				SetRole(user.RoleViewer).
				SetIsActive(true).
				Exec(ctx)
			if err != nil {
				log.Fatalf("Failed to update user %s: %v", u.Username, err)
			}
			log.Printf("Updated user: %s (%s) - Role: viewer", u.Username, u.FullName)
		} else {
			// Create new user
			_, err = database.Client.User.Create().
				SetUsername(u.Username).
				SetFullName(u.FullName).
				SetPasswordHash(hash).
				SetRole(user.RoleViewer).
				SetIsActive(true).
				Save(ctx)
			if err != nil {
				log.Fatalf("Failed to create user %s: %v", u.Username, err)
			}
			log.Printf("Created user: %s (%s) - Role: viewer", u.Username, u.FullName)
		}

		csvRecords = append(csvRecords, []string{u.Username, u.FullName, "viewer", u.Password})
	}

	// Write CSV file to d:\cctv\users_credentials.csv
	csvPath := "d:/cctv/users_credentials.csv"
	file, err := os.Create(csvPath)
	if err != nil {
		log.Fatalf("Failed to create CSV file: %v", err)
	}
	defer file.Close()

	// Write UTF-8 BOM
	file.Write([]byte{0xEF, 0xBB, 0xBF})

	writer := csv.NewWriter(file)
	if err := writer.WriteAll(csvRecords); err != nil {
		log.Fatalf("Failed to write CSV: %v", err)
	}
	writer.Flush()

	log.Printf("Successfully updated %d users with full names and saved %s", len(usersToSeed), csvPath)
}
