package pool

import (
	"log"
	"os"
	"sync"

	"cctv/shared/pkg/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var (
	grpcClient pb.PoolServiceClient
	once       sync.Once
)

func GetGrpcClient() pb.PoolServiceClient {
	once.Do(func() {
		poolGrpcUrl := os.Getenv("POOL_GRPC_URL")
		if poolGrpcUrl == "" {
			poolGrpcUrl = "pool-service:50052"
		}
		conn, err := grpc.Dial(poolGrpcUrl, grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err != nil {
			log.Fatalf("Failed to connect to pool-service gRPC: %v", err)
		}
		grpcClient = pb.NewPoolServiceClient(conn)
	})
	return grpcClient
}
