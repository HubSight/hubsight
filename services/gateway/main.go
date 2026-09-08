package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func resolvePublicDir() string {
	candidates := []string{}
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "public"))
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(wd, "public"))
	}
	candidates = append(candidates, "/app/public", "./public")
	for _, dir := range candidates {
		if info, err := os.Stat(filepath.Join(dir, "index.html")); err == nil && !info.IsDir() {
			return dir
		}
	}
	if len(candidates) > 0 {
		return candidates[0]
	}
	return "./public"
}

func createReverseProxy(targetURL string) (*httputil.ReverseProxy, *url.URL) {
	target, err := url.Parse(targetURL)
	if err != nil {
		log.Fatalf("Invalid target URL %s: %v", targetURL, err)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.FlushInterval = -1 * time.Millisecond // Zero latency: flush immediately after each write to client
	return proxy, target
}

func main() {
	log.Println("Starting Pure CCTV API Gateway (Unified REST, Relay & WebRTC Entrypoint)...")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	authServiceURL := os.Getenv("AUTH_SERVICE_URL")
	if authServiceURL == "" {
		authServiceURL = "http://auth-service:8081"
	}

	coreServiceURL := os.Getenv("CORE_SERVICE_URL")
	if coreServiceURL == "" {
		coreServiceURL = "http://core-service:8080"
	}

	relayServiceURL := os.Getenv("RELAY_SERVICE_URL")
	if relayServiceURL == "" {
		relayServiceURL = "http://relay-service:3001"
	}

	webrtcServiceURL := os.Getenv("WEBRTC_SERVICE_URL")
	if webrtcServiceURL == "" {
		webrtcServiceURL = "http://webrtc-service:1984"
	}

	authProxy, authTarget := createReverseProxy(authServiceURL)
	coreProxy, coreTarget := createReverseProxy(coreServiceURL)
	relayProxy, relayTarget := createReverseProxy(relayServiceURL)
	webrtcProxy, webrtcTarget := createReverseProxy(webrtcServiceURL)

	r := gin.Default()

	// Global CORS Setup
	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		}
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Service-Key, X-API-Key, X-Client-ID")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "Content-Length, X-Pool-Stream-Name, X-Pool-Conn-Index")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, PATCH, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// Gateway Health Check
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "api-gateway",
			"routes": gin.H{
				"rest":   "/api/*",
				"auth":   "/api/auth/*",
				"relay":  "/relay/*",
				"webrtc": "/webrtc/*",
			},
		})
	})

	// 1. Relay Service & Real-time WebSocket Proxy (/relay and /relay/*)
	forwardRelay := func(c *gin.Context) {
		c.Request.Host = relayTarget.Host
		relayProxy.ServeHTTP(c.Writer, c.Request)
	}
	r.Any("/relay", forwardRelay)
	r.Any("/relay/*action", forwardRelay)

	// 2. WebRTC Signaling / WHEP / Stream Proxy (/webrtc and /webrtc/* -> webrtc-service:1984/*)
	forwardWebRTC := func(c *gin.Context) {
		c.Request.URL.Path = strings.TrimPrefix(c.Request.URL.Path, "/webrtc")
		if c.Request.URL.Path == "" {
			c.Request.URL.Path = "/"
		}
		c.Request.URL.RawPath = ""
		c.Request.Host = webrtcTarget.Host
		webrtcProxy.ServeHTTP(c.Writer, c.Request)
	}
	r.Any("/webrtc", forwardWebRTC)
	r.Any("/webrtc/*action", forwardWebRTC)

	// 3. REST API Dispatcher: Routes Auth, Core, and Services
	r.Any("/api/*action", func(c *gin.Context) {
		path := c.Request.URL.Path

		// Dispatch Auth requests to Standalone Auth Service (/api/auth/... -> /auth/...)
		if strings.HasPrefix(path, "/api/auth") {
			c.Request.URL.Path = strings.TrimPrefix(path, "/api")
			c.Request.Host = authTarget.Host
			authProxy.ServeHTTP(c.Writer, c.Request)
			return
		}

		// Dispatch all other /api/... requests to Core CCTV Service
		c.Request.Host = coreTarget.Host
		coreProxy.ServeHTTP(c.Writer, c.Request)
	})

	// 4. Serve Frontend Static Files & SPA Fallback
	publicDir := resolvePublicDir()
	log.Printf("Serving SPA from %s", publicDir)

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		// If the request is for an API route that wasn't matched, return 404 JSON
		if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/relay") || strings.HasPrefix(path, "/webrtc") {
			c.JSON(http.StatusNotFound, gin.H{"error": "route not found in gateway"})
			return
		}

		// Check if it's a direct file request (e.g. /assets/style.css)
		file := filepath.Join(publicDir, path)
		if info, err := os.Stat(file); err == nil && !info.IsDir() {
			c.File(file)
			return
		}

		// Fallback to index.html for SPA routing (React/Vite)
		index := filepath.Join(publicDir, "index.html")
		if _, err := os.Stat(index); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "frontend not found", "public_dir": publicDir})
			return
		}
		c.File(index)
	})

	log.Printf("API Gateway listening on :%s (Auth: %s, Core: %s, Relay: %s, WebRTC: %s)",
		port, authServiceURL, coreServiceURL, relayServiceURL, webrtcServiceURL)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("API Gateway failed: %v", err)
	}
}
