package main

import (
	"crypto/rand"
	"flag"
	"fmt"
	"log"
	"math/big"
	"strings"

	"cctv/shared/pkg/auth"
	"cctv/shared/pkg/config"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
)

func generateRandomPassword(length int) (string, error) {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*"
	b := make([]byte, length)
	for i := range b {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", err
		}
		b[i] = charset[idx.Int64()]
	}
	return string(b), nil
}

// handleCLI processes administrative command-line operations.
// Returns true if a CLI command was executed, exiting the application.
func handleCLI(args []string) bool {
	cmd := args[0]
	switch cmd {
	case "reset-admin-password", "reset-password", "admin:reset":
		runResetAdminPassword(args[1:])
		return true
	case "help", "--help", "-h":
		printCLIHelp()
		return true
	default:
		return false
	}
}

func printCLIHelp() {
	fmt.Println("=================================================================")
	fmt.Println("HubSight CCTV - Administrative CLI")
	fmt.Println("=================================================================")
	fmt.Println("Usage:")
	fmt.Println("  auth reset-admin-password [options]")
	fmt.Println()
	fmt.Println("Options:")
	fmt.Println("  -u, --username <name>    Username to reset (default: admin)")
	fmt.Println("  -p, --password <pass>    New password (if omitted, generates random 12-char password)")
	fmt.Println("      --force-change       Force user to change password on next login (default: true)")
	fmt.Println("  -h, --help               Show this help message")
	fmt.Println("=================================================================")
}

func runResetAdminPassword(args []string) {
	fs := flag.NewFlagSet("reset-admin-password", flag.ExitOnError)
	var (
		username    string
		password    string
		forceChange bool
	)

	fs.StringVar(&username, "u", "admin", "Target username")
	fs.StringVar(&username, "username", "admin", "Target username")
	fs.StringVar(&password, "p", "", "New password")
	fs.StringVar(&password, "password", "", "New password")
	fs.BoolVar(&forceChange, "force-change", true, "Force change password on next login")

	_ = fs.Parse(args)

	username = strings.TrimSpace(username)
	if username == "" {
		username = "admin"
	}

	generated := false
	if strings.TrimSpace(password) == "" {
		var err error
		password, err = generateRandomPassword(12)
		if err != nil {
			log.Fatalf("[ERROR] Failed to generate secure random password: %v", err)
		}
		generated = true
	}

	if len(password) < 6 {
		log.Fatalf("[ERROR] Password must be at least 6 characters long")
	}

	cfg := config.Load()
	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("[ERROR] Database connection failed: %v", err)
	}
	defer database.Close()

	hash, err := auth.HashPassword(password)
	if err != nil {
		log.Fatalf("[ERROR] Failed to hash password using Argon2id: %v", err)
	}

	var user models.User
	if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
		// User does not exist, create admin account
		log.Printf("[INFO] User '%s' not found. Creating new administrator account...", username)
		user = models.User{
			Username:           username,
			FullName:           "Administrator",
			PasswordHash:       hash,
			Role:               models.RoleAdmin,
			IsActive:           true,
			MustChangePassword: forceChange,
		}
		if err := database.DB.Create(&user).Error; err != nil {
			log.Fatalf("[ERROR] Failed to create administrator account: %v", err)
		}
	} else {
		// User exists, update credentials and reactivate
		updates := map[string]any{
			"password_hash":        hash,
			"is_active":            true,
			"role":                 models.RoleAdmin,
			"must_change_password": forceChange,
		}
		if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
			log.Fatalf("[ERROR] Failed to update user credentials: %v", err)
		}

		// Terminate all existing sessions
		_ = database.DB.Where("user_id = ?", user.ID).Delete(&models.Session{}).Error
	}

	fmt.Println()
	fmt.Println("=================================================================")
	fmt.Println("       HubSight CCTV - Disaster Recovery Password Reset")
	fmt.Println("=================================================================")
	fmt.Printf(" [SUCCESS] Password reset completed successfully!\n")
	fmt.Printf(" - Username:               %s\n", username)
	fmt.Printf(" - New Password:           %s\n", password)
	if generated {
		fmt.Printf("   (Generated automatically via cryptographically secure RNG)\n")
	}
	fmt.Printf(" - Force Change on Login:  %t\n", forceChange)
	fmt.Printf(" - Account Status:         Active (Reactivated)\n")
	fmt.Printf(" - Active Sessions:        Cleared (All revoked)\n")
	fmt.Println("=================================================================")
	fmt.Println(" You can now log in via the HubSight Web UI.")
	fmt.Println("=================================================================")
	fmt.Println()
}
