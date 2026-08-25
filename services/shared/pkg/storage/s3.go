package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Backend is one S3-compatible bucket (archive MinIO or OCI faces).
type Backend struct {
	Client    *minio.Client
	Bucket    string
	Region    string
	Namespace string
	Public    bool
}

var S3Client *minio.Client
var S3Bucket string

// Archive holds NVR recordings (existing MinIO). Faces holds member samples/avatars (OCI).
var Archive *Backend
var Faces *Backend

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
	Archive = &Backend{Client: client, Bucket: bucket}

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

type FacesOptions struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
	Region    string
	Namespace string
	Public    bool
}

// ConnectFaces attaches the dedicated OCI Object Storage bucket for member faces/avatars.
func ConnectFaces(opts FacesOptions) error {
	if opts.Endpoint == "" || opts.AccessKey == "" || opts.Bucket == "" {
		return fmt.Errorf("faces storage endpoint, access key, and bucket are required")
	}

	client, err := minio.New(opts.Endpoint, &minio.Options{
		Creds:        credentials.NewStaticV4(opts.AccessKey, opts.SecretKey, ""),
		Secure:       opts.UseSSL,
		Region:       opts.Region,
		BucketLookup: minio.BucketLookupPath,
	})
	if err != nil {
		return fmt.Errorf("failed to init OCI faces client: %w", err)
	}

	ctx := context.Background()
	exists, err := client.BucketExists(ctx, opts.Bucket)
	if err != nil {
		if resp := minio.ToErrorResponse(err); resp.Code != "" {
			return fmt.Errorf("OCI faces bucket check failed: %s (%s)", resp.Code, resp.Message)
		}
		return fmt.Errorf("OCI faces bucket check failed: %w", err)
	}
	if !exists {
		return fmt.Errorf("OCI faces bucket %q does not exist", opts.Bucket)
	}

	Faces = &Backend{
		Client:    client,
		Bucket:    opts.Bucket,
		Region:    opts.Region,
		Namespace: opts.Namespace,
		Public:    opts.Public,
	}
	log.Printf("Connected to OCI faces storage (bucket=%s region=%s public=%v)", opts.Bucket, opts.Region, opts.Public)
	return nil
}

func faceBackend() *Backend {
	if Faces != nil && Faces.Client != nil {
		return Faces
	}
	return nil
}

// PresignedGetObjectURL generates a presigned GET URL for an archive object (valid for 7 days by default)
func PresignedGetObjectURL(ctx context.Context, objectName string, expiry time.Duration) (string, error) {
	if S3Client == nil {
		return "", fmt.Errorf("S3 client not initialized")
	}
	if expiry <= 0 {
		expiry = time.Hour * 24 * 7
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
		expiry = time.Minute * 15
	}

	u, err := S3Client.PresignedPutObject(ctx, S3Bucket, objectName, expiry)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// UploadObject uploads reader content to archive S3 and returns the presigned GET URL
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

func (b *Backend) ObjectURL(ctx context.Context, objectName string) (string, error) {
	if b == nil || b.Client == nil {
		return "", fmt.Errorf("storage client not initialized")
	}
	if b.Public && b.Region != "" && b.Namespace != "" {
		return PublicObjectURL(b.Region, b.Namespace, b.Bucket, objectName), nil
	}
	u, err := b.Client.PresignedGetObject(ctx, b.Bucket, objectName, time.Hour*24*7, nil)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// PublicObjectURL is the permanent OCI native URL for a public bucket object.
func PublicObjectURL(region, namespace, bucket, objectName string) string {
	return fmt.Sprintf(
		"https://objectstorage.%s.oraclecloud.com/n/%s/b/%s/o/%s",
		region, namespace, bucket, url.PathEscape(objectName),
	)
}

// UploadFaceObject stores a member face/avatar on OCI Object Storage only.
func UploadFaceObject(ctx context.Context, objectName string, reader io.Reader, size int64, contentType string) (string, error) {
	b := faceBackend()
	if b == nil {
		return "", fmt.Errorf("OCI faces storage not initialized")
	}
	if contentType == "" {
		contentType = "image/jpeg"
	}
	_, err := b.Client.PutObject(ctx, b.Bucket, objectName, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", err
	}
	return b.ObjectURL(ctx, objectName)
}

// PresignedFacePutURL returns a presigned PUT URL on the faces backend.
func PresignedFacePutURL(ctx context.Context, objectName string, expiry time.Duration) (string, error) {
	b := faceBackend()
	if b == nil {
		return "", fmt.Errorf("faces storage not initialized")
	}
	if expiry <= 0 {
		expiry = time.Minute * 15
	}
	u, err := b.Client.PresignedPutObject(ctx, b.Bucket, objectName, expiry)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// FaceObjectURL returns the stored GET URL for a faces object (public OCI URL when configured).
func FaceObjectURL(ctx context.Context, objectName string) (string, error) {
	b := faceBackend()
	if b == nil {
		return "", fmt.Errorf("faces storage not initialized")
	}
	return b.ObjectURL(ctx, objectName)
}

func (b *Backend) deleteObject(ctx context.Context, objectName string) error {
	if b == nil || b.Client == nil {
		return fmt.Errorf("storage client not initialized")
	}
	objectName = strings.TrimSpace(objectName)
	if objectName == "" {
		return nil
	}

	var lastErr error
	removed := 0
	for obj := range b.Client.ListObjects(ctx, b.Bucket, minio.ListObjectsOptions{
		Prefix:       objectName,
		Recursive:    false,
		WithVersions: true,
	}) {
		if obj.Err != nil {
			lastErr = obj.Err
			break
		}
		if obj.Key != objectName {
			continue
		}
		if err := b.Client.RemoveObject(ctx, b.Bucket, obj.Key, minio.RemoveObjectOptions{
			VersionID: obj.VersionID,
		}); err != nil {
			lastErr = err
			continue
		}
		removed++
	}
	if removed > 0 {
		return lastErr
	}
	return b.Client.RemoveObject(ctx, b.Bucket, objectName, minio.RemoveObjectOptions{})
}

// ObjectNameFromURL extracts the bucket-relative object key from a stored S3/MinIO
// or OCI Object Storage URL (presigned GET, path-style, virtual-hosted, native /n/b/o).
func ObjectNameFromURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" || rawURL == "/placeholder.jpg" || strings.HasPrefix(rawURL, "blob:") {
		return ""
	}

	if !strings.Contains(rawURL, "://") {
		key := strings.TrimPrefix(rawURL, "/")
		if i := strings.IndexByte(key, '?'); i >= 0 {
			key = key[:i]
		}
		return stripBucketPrefix(key)
	}

	u, err := url.Parse(rawURL)
	if err != nil || u.Path == "" || u.Path == "/" {
		return ""
	}
	path := strings.TrimPrefix(u.Path, "/")
	if key := objectNameFromOCINative(path); key != "" {
		return key
	}
	return stripBucketPrefix(path)
}

func objectNameFromOCINative(path string) string {
	const marker = "/o/"
	i := strings.Index(path, marker)
	if i < 0 {
		return ""
	}
	if !strings.Contains(path, "/n/") && !strings.HasPrefix(path, "n/") {
		return ""
	}
	if !strings.Contains(path, "/b/") {
		return ""
	}
	return path[i+len(marker):]
}

func stripBucketPrefix(key string) string {
	for _, bucket := range knownBuckets() {
		if bucket != "" && strings.HasPrefix(key, bucket+"/") {
			return strings.TrimPrefix(key, bucket+"/")
		}
	}
	return key
}

func knownBuckets() []string {
	seen := map[string]struct{}{}
	var out []string
	add := func(b string) {
		if b == "" {
			return
		}
		if _, ok := seen[b]; ok {
			return
		}
		seen[b] = struct{}{}
		out = append(out, b)
	}
	add(S3Bucket)
	if Archive != nil {
		add(Archive.Bucket)
	}
	if Faces != nil {
		add(Faces.Bucket)
	}
	return out
}

// DeleteObject removes an archive object from the bucket. Empty names are a no-op.
func DeleteObject(ctx context.Context, objectName string) error {
	if Archive != nil {
		return Archive.deleteObject(ctx, objectName)
	}
	if S3Client == nil {
		return fmt.Errorf("S3 client not initialized")
	}
	objectName = strings.TrimSpace(objectName)
	if objectName == "" {
		return nil
	}
	return S3Client.RemoveObject(ctx, S3Bucket, objectName, minio.RemoveObjectOptions{})
}

// DeleteFaceObject removes a member face/avatar from OCI, then archive MinIO for leftover keys.
func DeleteFaceObject(ctx context.Context, objectName string) error {
	objectName = strings.TrimSpace(objectName)
	if objectName == "" {
		return nil
	}

	ok := false
	var lastErr error
	try := func(b *Backend) {
		if b == nil {
			return
		}
		if err := b.deleteObject(ctx, objectName); err != nil {
			lastErr = err
			return
		}
		ok = true
	}

	try(Faces)
	if Archive != nil && (Faces == nil || Archive.Client != Faces.Client || Archive.Bucket != Faces.Bucket) {
		try(Archive)
	}
	if ok {
		return nil
	}
	if lastErr != nil {
		return lastErr
	}
	return DeleteObject(ctx, objectName)
}
