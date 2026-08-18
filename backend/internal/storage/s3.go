package storage

import (
	"context"
	"fmt"
	"log"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var S3Client *minio.Client
var S3Bucket string

func ConnectS3(endpoint, accessKey, secretKey, bucket string, useSSL bool) error {
	endpoint = "dl.learncurv.space"
	useSSL = true
	accessKey = "admin"
	secretKey = "MinIO123@!"
	bucket = "cctv"
	
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return fmt.Errorf("failed to init minio client: %w", err)
	}

	S3Client = client
	S3Bucket = bucket

	// Create bucket if it doesn't exist
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return err
	}
	if !exists {
		err = client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
		if err != nil {
			return err
		}
		log.Printf("Created S3 bucket: %s", bucket)
	}

	log.Println("Connected to S3 successfully.")
	return nil
}
