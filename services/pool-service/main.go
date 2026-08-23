package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cctv/pool-service/pkg/events"
	"cctv/pool-service/pkg/pool"
	"cctv/pool-service/pkg/webrtc"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

type CameraSyncItem struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	IsActive bool   `json:"is_active"`
	EnableAI bool   `json:"enable_ai"`
}

func syncCamerasFromCore(ctx context.Context, mgr *pool.Manager, coreURL, secret string) error {
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/internal/pool/cameras", coreURL), nil)
	if err != nil {
		return err
	}
	if secret != "" {
		req.Header.Set("X-Service-Key", secret)
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("core service returned status %d", resp.StatusCode)
	}

	var cameras []CameraSyncItem
	if err := json.NewDecoder(resp.Body).Decode(&cameras); err != nil {
		return err
	}

	log.Printf("[Pool Sync] Loaded %d cameras from Core Service on startup", len(cameras))
	for _, cam := range cameras {
		_ = mgr.UpsertCamera(ctx, cam.ID, cam.Name, cam.Host, cam.IsActive, cam.EnableAI)
	}
	return nil
}

func main() {
	log.Println("Starting CCTV Camera Connection Pool Microservice (:8085)...")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8085"
	}

	coreURL := os.Getenv("CORE_SERVICE_URL")
	if coreURL == "" {
		coreURL = "http://core-service:8080"
	}

	m2mSecret := os.Getenv("M2M_SECRET")
	if m2mSecret == "" {
		m2mSecret = "cctv-internal-m2m-secret"
	}

	go2rtcClient := webrtc.NewGo2RTCClient()
	poolMgr := pool.NewManager(go2rtcClient)

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
			if err := syncCamerasFromCore(ctx, poolMgr, coreURL, m2mSecret); err == nil {
				break
			} else {
				log.Printf("[Pool Init] Retrying camera sync from Core Service (%d/5): %v", i+1, err)
			}
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

			if err := syncCamerasFromCore(c.Request.Context(), poolMgr, coreURL, m2mSecret); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "synced", "summary": poolMgr.GetStatusSummary()})
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
