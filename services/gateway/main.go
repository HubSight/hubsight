package main

import (
	"bytes"
	"embed"
	"encoding/json"
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

//go:embed docs/*
var docsFS embed.FS

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
		webrtcServiceURL = "http://webrtc-service:80"
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
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Service-Key, X-API-Key, X-Client-ID, X-Device-Fingerprint, X-Device-Label, X-Client-Type, X-Screen-Resolution, X-Device-Model")
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
				"docs":   "/docs",
			},
		})
	})

	// Swagger UI & OpenAPI 3.0 Documentation Routes (/docs, /docs/*, /openapi.json)
	serveSwaggerUI := func(c *gin.Context) {
		indexData, err := docsFS.ReadFile("docs/index.html")
		if err != nil {
			c.String(http.StatusInternalServerError, "Documentation UI not found")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexData)
	}

	serveOpenAPISpec := func(c *gin.Context) {
		specData, err := docsFS.ReadFile("docs/openapi.json")
		if err != nil {
			c.String(http.StatusInternalServerError, "OpenAPI specification not found")
			return
		}
		c.Data(http.StatusOK, "application/json; charset=utf-8", specData)
	}

	docMethods := []string{"GET", "HEAD"}
	r.Match(docMethods, "/docs", serveSwaggerUI)
	r.Match(docMethods, "/openapi.json", serveOpenAPISpec)
	r.Match(docMethods, "/docs/*filepath", func(c *gin.Context) {
		param := strings.TrimPrefix(c.Param("filepath"), "/")
		if param == "" || param == "index.html" {
			serveSwaggerUI(c)
			return
		}
		if param == "openapi.json" {
			serveOpenAPISpec(c)
			return
		}
		c.String(http.StatusNotFound, "Asset not found")
	})

	// 1. Relay Service & Real-time WebSocket Proxy (/relay and /relay/*)
	forwardRelay := func(c *gin.Context) {
		c.Request.Host = relayTarget.Host
		relayProxy.ServeHTTP(c.Writer, c.Request)
	}
	r.Any("/relay", forwardRelay)
	r.Any("/relay/*action", forwardRelay)

	m2mSecret := os.Getenv("M2M_SECRET")
	if m2mSecret == "" {
		m2mSecret = "cctv-internal-m2m-secret"
	}
	gatewayHttpClient := &http.Client{Timeout: 5 * time.Second}

	// 2. WebRTC Signaling / Stream Proxy (/webrtc/* -> webrtc-service:80/*)
	forwardWebRTC := func(c *gin.Context) {
		// Only the JSON API namespace may reach ZLMediaKit through this public
		// gateway. Its bundled demo/test pages (webrtc/index.html, webassist,
		// swagger UI, etc.) and static JS client have no legitimate use here —
		// nothing in this codebase's own frontend/backend calls them (every
		// internal service reaches webrtc-service directly on the Docker
		// network; scripts/webrtc-check.sh talks to it directly too, never
		// through this gateway) — and must never be reachable in
		// staging/production, regardless of auth, so this check runs first.
		if !strings.HasPrefix(c.Request.URL.Path, "/webrtc/index/api/") {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}

		// Bypass if valid M2M internal service key is present
		serviceKey := c.GetHeader("X-Service-Key")
		if serviceKey == "" {
			serviceKey = c.GetHeader("X-Internal-Key")
		}
		if serviceKey != "" && serviceKey == m2mSecret {
			c.Request.URL.Path = strings.TrimPrefix(c.Request.URL.Path, "/webrtc")
			if c.Request.URL.Path == "" {
				c.Request.URL.Path = "/"
			}
			c.Request.URL.RawPath = ""
			c.Request.Host = webrtcTarget.Host
			webrtcProxy.ServeHTTP(c.Writer, c.Request)
			return
		}

		// 1. Verify Client API Key (or Client ID)
		apiKey := c.GetHeader("X-API-Key")
		if apiKey == "" {
			apiKey = c.GetHeader("X-Client-ID")
		}
		if apiKey == "" {
			apiKey = c.Query("api_key")
		}
		if apiKey == "" {
			apiKey = c.Query("client_id")
		}

		if apiKey == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Missing client API key or client ID",
				"code":  "CLIENT_KEY_REQUIRED",
			})
			return
		}

		keyReqBody, _ := json.Marshal(map[string]string{"api_key": apiKey})
		keyResp, err := gatewayHttpClient.Post(authServiceURL+"/auth/clients/verify", "application/json", bytes.NewBuffer(keyReqBody))
		if err != nil || keyResp.StatusCode != http.StatusOK {
			if keyResp != nil {
				keyResp.Body.Close()
			}
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Invalid or deactivated client API key",
				"code":  "INVALID_CLIENT_KEY",
			})
			return
		}
		keyResp.Body.Close()

		// 2. Verify User Authentication Token
		token := ""
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		} else if authHeader != "" {
			token = authHeader
		} else if cookie, err := c.Cookie("session"); err == nil && cookie != "" {
			token = cookie
		} else if qToken := c.Query("token"); qToken != "" {
			token = qToken
		}

		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required. Missing auth token",
				"code":  "AUTH_REQUIRED",
			})
			return
		}

		tokReqBody, _ := json.Marshal(map[string]string{"token": token})
		tokResp, err := gatewayHttpClient.Post(authServiceURL+"/auth/validate-token", "application/json", bytes.NewBuffer(tokReqBody))
		if err != nil || tokResp.StatusCode != http.StatusOK {
			if tokResp != nil {
				tokResp.Body.Close()
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Unauthorized: Session invalid or expired",
				"code":  "INVALID_TOKEN",
			})
			return
		}

		var valResp struct {
			Valid bool `json:"valid"`
		}
		if err := json.NewDecoder(tokResp.Body).Decode(&valResp); err != nil || !valResp.Valid {
			tokResp.Body.Close()
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Unauthorized: Session invalid or expired",
				"code":  "INVALID_TOKEN",
			})
			return
		}
		tokResp.Body.Close()

		// Both authentications passed -> forward to webrtc-service
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
		if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/relay") || strings.HasPrefix(path, "/webrtc") || strings.HasPrefix(path, "/docs") {
			c.JSON(http.StatusNotFound, gin.H{"error": "route not found in gateway"})
			return
		}

		// Check if it's a direct file request (e.g. /assets/style.css, /sw.js, /favicon.svg)
		file := filepath.Join(publicDir, path)
		if info, err := os.Stat(file); err == nil && !info.IsDir() {
			// PWA Service Worker, manifest, and HTML files must NEVER be cached
			if path == "/sw.js" || path == "/custom-sw.js" || path == "/manifest.webmanifest" || strings.HasSuffix(path, ".html") {
				c.Writer.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
				c.Writer.Header().Set("Pragma", "no-cache")
				c.Writer.Header().Set("Expires", "0")
			} else if strings.HasPrefix(path, "/assets/") {
				// Vite hashed assets (JS/CSS) have immutable content hashes
				c.Writer.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			c.File(file)
			return
		}

		// DO NOT fall back to index.html for missing static assets (JS, CSS, images, maps, fonts)
		// Returning HTML for a .js request causes "SyntaxError: Unexpected token '<'" and a white blank page!
		if strings.HasPrefix(path, "/assets/") ||
			strings.HasSuffix(path, ".js") ||
			strings.HasSuffix(path, ".css") ||
			strings.HasSuffix(path, ".map") ||
			strings.HasSuffix(path, ".ico") ||
			strings.HasSuffix(path, ".png") ||
			strings.HasSuffix(path, ".jpg") ||
			strings.HasSuffix(path, ".jpeg") ||
			strings.HasSuffix(path, ".svg") ||
			strings.HasSuffix(path, ".woff2") ||
			strings.HasSuffix(path, ".woff") ||
			strings.HasSuffix(path, ".json") ||
			strings.HasSuffix(path, ".webmanifest") {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		// Fallback to index.html for SPA routing (React/Vite)
		index := filepath.Join(publicDir, "index.html")
		if _, err := os.Stat(index); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "frontend not found", "public_dir": publicDir})
			return
		}
		// Never cache SPA entrypoint so new bundle hashes are loaded immediately
		c.Writer.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		c.Writer.Header().Set("Pragma", "no-cache")
		c.Writer.Header().Set("Expires", "0")
		c.File(index)
	})


	log.Printf("API Gateway listening on :%s (Auth: %s, Core: %s, Relay: %s, WebRTC: %s)",
		port, authServiceURL, coreServiceURL, relayServiceURL, webrtcServiceURL)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("API Gateway failed: %v", err)
	}
}
