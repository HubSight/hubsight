package storage

import "testing"

func TestObjectNameFromURL(t *testing.T) {
	prevBucket := S3Bucket
	prevFaces := Faces
	S3Bucket = "cctv"
	Faces = &Backend{Bucket: "bucket-faces-cctv", Region: "ap-singapore-1", Namespace: "axyalcmd4cit"}
	t.Cleanup(func() {
		S3Bucket = prevBucket
		Faces = prevFaces
	})

	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "empty", in: "", want: ""},
		{name: "placeholder", in: "/placeholder.jpg", want: ""},
		{name: "blob", in: "blob:http://localhost/abc", want: ""},
		{name: "raw key", in: "faces/m1/abc.jpg", want: "faces/m1/abc.jpg"},
		{name: "path-style presigned", in: "https://dl.learncurv.space/cctv/faces/m1/abc.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=604800", want: "faces/m1/abc.jpg"},
		{name: "virtual-hosted", in: "https://cctv.example.com/faces/m1/abc.jpg", want: "faces/m1/abc.jpg"},
		{name: "leading slash key", in: "/faces/m1/abc.jpg", want: "faces/m1/abc.jpg"},
		{name: "avatars key", in: "avatars/xyz.png", want: "avatars/xyz.png"},
		{name: "oci native public", in: "https://objectstorage.ap-singapore-1.oraclecloud.com/n/axyalcmd4cit/b/bucket-faces-cctv/o/faces%2Fm1%2Fabc.jpg", want: "faces/m1/abc.jpg"},
		{name: "oci s3 compat", in: "https://axyalcmd4cit.compat.objectstorage.ap-singapore-1.oraclecloud.com/bucket-faces-cctv/faces/m1/abc.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256", want: "faces/m1/abc.jpg"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ObjectNameFromURL(tt.in)
			if got != tt.want {
				t.Fatalf("ObjectNameFromURL(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestPublicObjectURL(t *testing.T) {
	got := PublicObjectURL("ap-singapore-1", "axyalcmd4cit", "bucket-faces-cctv", "faces/m1/abc.jpg")
	want := "https://objectstorage.ap-singapore-1.oraclecloud.com/n/axyalcmd4cit/b/bucket-faces-cctv/o/faces%2Fm1%2Fabc.jpg"
	if got != want {
		t.Fatalf("PublicObjectURL = %q, want %q", got, want)
	}
}
