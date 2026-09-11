package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cctv/pool/pkg/events"
	"cctv/pool/pkg/pool"
	"cctv/pool/pkg/webrtc"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/pb"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type CameraSyncItem struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	IsActive bool   `json:"is_active"`
	EnableAI bool   `json:"enable_ai"`
}

func syncCamerasFromCore(ctx context.Context, mgr *pool.Manager, coreGrpcURL string) error {
	conn, err := grpc.Dial(coreGrpcURL, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("failed to connect to core-service gRPC: %w", err)
	}
	defer conn.Close()

	client := pb.NewCoreServiceClient(conn)
	resp, err := client.GetCameras(ctx, &pb.GetCamerasRequest{OnlyActive: false, OnlyAiEnabled: false})
	if err != nil {
		return fmt.Errorf("core service GetCameras failed: %w", err)
	}

	cameras := resp.Cameras
	log.Printf("[Pool Sync] Loaded %d cameras from Core Service on startup via gRPC", len(cameras))
	for _, cam := range cameras {
		_ = mgr.UpsertCamera(ctx, cam.Id, cam.Name, cam.Host, cam.IsActive, cam.EnableAi)
	}
	return nil
}

func main() {
	log.Println("Starting CCTV Camera Connection Pool Microservice (:8085)...")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8085"
	}

	coreGrpcURL := os.Getenv("CORE_GRPC_URL")
	if coreGrpcURL == "" {
		coreGrpcURL = "core-service:50053"
	}

	m2mSecret := os.Getenv("M2M_SECRET")
	if m2mSecret == "" {
		m2mSecret = "cctv-internal-m2m-secret"
	}

	go2rtcClient := webrtc.NewGo2RTCClient()
	poolMgr := pool.NewManager(go2rtcClient)

	if err := mq.Init(); err != nil {
		log.Printf("[Pool Service] RabbitMQ publisher unavailable: %v", err)
	} else {
		poolMgr.SetOnChange(events.PublishStatusSnapshot)
		log.Println("[Pool Service] Real-time pool.status.update publisher enabled")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start Background Garbage Collector (checks every 10s, reaps live connections idle > 30s)
	poolMgr.StartGarbageCollector(ctx, 10*time.Second, 30*time.Second)

	// Start RabbitMQ Event Subscriber
	subscriber := events.NewSubscriber(poolMgr)
	subscriber.StartListening(ctx)

	// Initial Sync from Core Service (with retry)
	go func() {
		for i := 0; i < 5; i++ {
			time.Sleep(time.Duration(i*2) * time.Second)
			if err := syncCamerasFromCore(ctx, poolMgr, coreGrpcURL); err == nil {
				events.PublishStatusSnapshot(poolMgr.GetStatusSummary())
				break
			} else {
				log.Printf("[Pool Init] Retrying camera sync from Core Service (%d/5): %v", i+1, err)
			}
		}
	}()

	// Start gRPC server
	go func() {
		lis, err := net.Listen("tcp", ":50052")
		if err != nil {
			log.Fatalf("Failed to listen on gRPC port 50052: %v", err)
		}
		s := grpc.NewServer()
		pb.RegisterPoolServiceServer(s, &grpcPoolServer{
			poolMgr:      poolMgr,
			go2rtcClient: go2rtcClient,
		})
		log.Printf("[Pool Service] gRPC listening on :50052")
		if err := s.Serve(lis); err != nil {
			log.Fatalf("Failed to serve gRPC: %v", err)
		}
	}()

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return true
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With", "X-Service-Key"},
		ExposeHeaders:    []string{"Content-Length", "X-Pool-Stream-Name", "X-Pool-Conn-Index"},
		AllowCredentials: true,
	}))

	// Health check
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "pool-service",
			"time":    time.Now().Unix(),
		})
	})

	api := r.Group("/api/pool")
	{
		// Status Summary
		api.GET("/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, poolMgr.GetStatusSummary())
		})

		// Get Dedicated CV Stream (Connection #0)
		api.GET("/cameras/:id/cv", func(c *gin.Context) {
			camID := c.Param("id")
			streamName, err := poolMgr.GetCVStream(camID)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"camera_id":   camID,
				"stream_name": streamName,
				"purpose":     "cv",
				"conn_index":  0,
			})
		})

		// Get Persistent 640p 15FPS Thumbnail Stream
		api.GET("/cameras/:id/thumb", func(c *gin.Context) {
			camID := c.Param("id")
			streamName, err := poolMgr.GetThumbStream(camID)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"camera_id":   camID,
				"stream_name": streamName,
				"purpose":     "thumb",
				"conn_index":  -1,
			})
		})

		// WebRTC Signaling with Dynamic Pool Allocation (Max 5 clients per live stream)
		api.POST("/cameras/:id/webrtc", func(c *gin.Context) {
			camID := c.Param("id")
			if camID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Camera ID is required"})
				return
			}

			// Read SDP Offer from body
			offerSDP, err := io.ReadAll(c.Request.Body)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read SDP offer body"})
				return
			}

			// 1. Acquire Live Stream from Pool (<= 5 clients/conn)
			result, err := poolMgr.AcquireLiveStream(c.Request.Context(), camID)
			if err != nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
				return
			}

			// 2. Forward WebRTC offer to go2rtc for the assigned stream
			answerSDP, statusCode, err := go2rtcClient.ForwardWebRTCOffer(
				c.Request.Context(),
				result.StreamName,
				offerSDP,
				c.Request.Header.Get("Content-Type"),
			)
			if err != nil {
				// Rollback allocation if signaling failed
				poolMgr.ReleaseLiveStream(camID, result.StreamName)
				c.JSON(statusCode, gin.H{"error": err.Error()})
				return
			}

			// Add custom headers to let client know allocated pool stream
			c.Header("X-Pool-Stream-Name", result.StreamName)
			c.Header("X-Pool-Conn-Index", fmt.Sprintf("%d", result.ConnIndex))

			c.Data(statusCode, c.Request.Header.Get("Content-Type"), answerSDP)
		})

		// Release Live Stream connection when client disconnects
		api.POST("/cameras/:id/release", func(c *gin.Context) {
			camID := c.Param("id")
			streamName := c.Query("stream_name")
			if streamName == "" {
				streamName = c.PostForm("stream_name")
			}

			if streamName != "" {
				poolMgr.ReleaseLiveStream(camID, streamName)
			}
			c.JSON(http.StatusOK, gin.H{"status": "released"})
		})

		// Heartbeat to keep live connection alive
		api.POST("/cameras/:id/heartbeat", func(c *gin.Context) {
			camID := c.Param("id")
			streamName := c.Query("stream_name")
			if streamName != "" {
				poolMgr.Heartbeat(camID, streamName)
			}
			c.JSON(http.StatusOK, gin.H{"status": "alive"})
		})

		// Manual Sync Endpoint
		api.POST("/sync", func(c *gin.Context) {
			secret := c.GetHeader("X-Service-Key")
			if m2mSecret != "" && secret != m2mSecret {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized internal access"})
				return
			}

			if err := syncCamerasFromCore(c.Request.Context(), poolMgr, coreGrpcURL); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			summary := poolMgr.GetStatusSummary()
			events.PublishStatusSnapshot(summary)
			c.JSON(http.StatusOK, gin.H{"status": "synced", "summary": summary})
		})
	}

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	go func() {
		log.Printf("[Pool Service] Listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Pool Service] Server failed: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[Pool Service] Shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
	log.Println("[Pool Service] Server exited cleanly.")
}

// gRPC Implementation
type grpcPoolServer struct {
	pb.UnimplementedPoolServiceServer
	poolMgr      *pool.Manager
	go2rtcClient *webrtc.Go2RTCClient
}

func (s *grpcPoolServer) SignalWebRTC(ctx context.Context, req *pb.SignalWebRTCRequest) (*pb.SignalWebRTCResponse, error) {
	if req.CameraId == "" {
		return nil, fmt.Errorf("camera ID is required")
	}

	result, err := s.poolMgr.AcquireLiveStream(ctx, req.CameraId)
	if err != nil {
		return nil, err
	}

	answerSDP, statusCode, err := s.go2rtcClient.ForwardWebRTCOffer(
		ctx,
		result.StreamName,
		[]byte(req.SdpOffer),
		req.ContentType,
	)

	if err != nil {
		s.poolMgr.ReleaseLiveStream(req.CameraId, result.StreamName)
		return nil, fmt.Errorf("go2rtc error %d: %v", statusCode, err)
	}

	return &pb.SignalWebRTCResponse{
		SdpAnswer:      string(answerSDP),
		PoolStreamName: result.StreamName,
		PoolConnIndex:  fmt.Sprintf("%d", result.ConnIndex),
	}, nil
}

func (s *grpcPoolServer) ReleaseStream(ctx context.Context, req *pb.ReleaseStreamRequest) (*pb.ReleaseStreamResponse, error) {
	if req.StreamName != "" {
		s.poolMgr.ReleaseLiveStream(req.CameraId, req.StreamName)
	}
	return &pb.ReleaseStreamResponse{Success: true}, nil
}

func (s *grpcPoolServer) HeartbeatStream(ctx context.Context, req *pb.HeartbeatStreamRequest) (*pb.HeartbeatStreamResponse, error) {
	if req.StreamName != "" {
		s.poolMgr.Heartbeat(req.CameraId, req.StreamName)
	}
	return &pb.HeartbeatStreamResponse{Success: true}, nil
}

func (s *grpcPoolServer) GetStatusSummary(ctx context.Context, req *pb.GetStatusSummaryRequest) (*pb.GetStatusSummaryResponse, error) {
	status := s.poolMgr.GetStatusSummary()

	return &pb.GetStatusSummaryResponse{
		Summary: &pb.PoolSummary{
			TotalCameras:       int32(status.TotalCameras),
			TotalActiveStreams: int32(status.TotalLiveStreams),
			TotalViewers:       int32(status.TotalActiveViewers),
		},
	}, nil
}
