package main

import (
	"context"
	"log"
	"net"

	"cctv/shared/ent/memberface"
	"cctv/shared/pkg/config"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/nvr"
	"cctv/shared/pkg/pb"
	"cctv/shared/pkg/router"
	"cctv/shared/pkg/storage"
	"google.golang.org/grpc"
)

func main() {
	log.Println("Starting CCTV Core Business Logic Service...")

	cfg := config.Load()

	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer database.Close()

	if err := storage.ConnectS3(cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3Bucket, cfg.S3UseSSL); err != nil {
		log.Fatalf("S3 connection failed: %v", err)
	}

	if err := mq.Init(); err != nil {
		log.Printf("RabbitMQ connection failed: %v (Real-time events may not work)", err)
	} else {
		defer mq.Close()
	}

	// Start Real-time NVR status broadcaster
	nvr.StartNvrStatusBroadcaster()

	// Start gRPC server
	go func() {
		lis, err := net.Listen("tcp", ":50053")
		if err != nil {
			log.Fatalf("Failed to listen on gRPC port 50053: %v", err)
		}
		s := grpc.NewServer()
		pb.RegisterCoreServiceServer(s, &grpcCoreServer{})
		log.Printf("Core Service gRPC listening on :50053")
		if err := s.Serve(lis); err != nil {
			log.Fatalf("Failed to serve gRPC: %v", err)
		}
	}()

	r := router.New()

	log.Printf("CCTV Core Service listening on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Core Service failed: %v", err)
	}
}

// gRPC Implementation
type grpcCoreServer struct {
	pb.UnimplementedCoreServiceServer
}

func (s *grpcCoreServer) GetCameras(ctx context.Context, req *pb.GetCamerasRequest) (*pb.GetCamerasResponse, error) {
	cams, err := database.Client.Camera.Query().All(ctx)
	if err != nil {
		return nil, err
	}

	var pbCams []*pb.CameraData
	for _, c := range cams {
		if req.OnlyActive && !c.IsActive {
			continue
		}
		if req.OnlyAiEnabled && !c.EnableAi {
			continue
		}
		pbCams = append(pbCams, &pb.CameraData{
			Id:       c.ID,
			Name:     c.Name,
			Host:     c.Host,
			IsActive: c.IsActive,
			EnableAi: c.EnableAi,
		})
	}
	return &pb.GetCamerasResponse{Cameras: pbCams}, nil
}

func (s *grpcCoreServer) GetFaces(ctx context.Context, req *pb.GetFacesRequest) (*pb.GetFacesResponse, error) {
	faces, err := database.Client.MemberFace.Query().
		Where(memberface.IsActive(true)).
		WithMember().
		All(ctx)

	if err != nil {
		return nil, err
	}

	var pbFaces []*pb.FaceData
	for _, f := range faces {
		if f.Edges.Member != nil && f.Edges.Member.IsActive {
			pbFaces = append(pbFaces, &pb.FaceData{
				FaceId:    f.ID.String(),
				MemberId:  f.MemberID.String(),
				Name:      f.Edges.Member.Name,
				Role:      string(f.Edges.Member.Role),
				Embedding: f.Embedding,
			})
		}
	}
	return &pb.GetFacesResponse{Faces: pbFaces}, nil
}
