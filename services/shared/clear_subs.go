package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"cctv/shared/pkg/database"
)

func main() {
	godotenv.Load("../../.env")
	dbUrl := os.Getenv("DATABASE_URL")
	database.Connect(dbUrl)
	deleted, _ := database.Client.PushSubscription.Delete().Exec(context.Background())
	fmt.Printf("Deleted %d push subscriptions\n", deleted)
}
