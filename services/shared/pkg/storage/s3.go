package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var S3Client *minio.Client
var S3Bucket string

func ConnectS3(endpoint, accessKey, secretKey, bucket string, useSSL bool) error {
	if endpoint == "" {
		endpoint = "dl.learncurv.space"
		useSSL = true
		accessKey = "admin"
		secretKey = "MinIO123@!"
		bucket = "cctv"
	}

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

// PresignedGetObjectURL generates a presigned GET URL for an object (valid for 7 days by default)
func PresignedGetObjectURL(ctx context.Context, objectName string, expiry time.Duration) (string, error) {
	if S3Client == nil {
		return "", fmt.Errorf("S3 client not initialized")
	}
	if expiry <= 0 {
		expiry = time.Hour * 24 * 7 // 7 days default
	}

	u, err := S3Client.PresignedGetObject(ctx, S3Bucket, objectName, expiry, nil)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// PresignedPutObjectURL generates a presigned PUT URL for client-side direct upload to S3
func PresignedPutObjectURL(ctx context.Context, objectName string, expiry time.Duration) (string, error) {
	if S3Client == nil {
		return "", fmt.Errorf("S3 client not initialized")
	}
	if expiry <= 0 {
		expiry = time.Minute * 15 // 15 mins default
	}

	u, err := S3Client.PresignedPutObject(ctx, S3Bucket, objectName, expiry)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// UploadObject uploads reader content to S3 and returns the presigned GET URL
func UploadObject(ctx context.Context, objectName string, reader io.Reader, size int64, contentType string) (string, error) {
	if S3Client == nil {
		return "", fmt.Errorf("S3 client not initialized")
	}
	if contentType == "" {
		contentType = "image/jpeg"
	}

	_, err := S3Client.PutObject(ctx, S3Bucket, objectName, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", err
	}

	return PresignedGetObjectURL(ctx, objectName, time.Hour*24*7)
}

