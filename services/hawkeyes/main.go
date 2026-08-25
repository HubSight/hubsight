package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"cctv/hawkeyes/pkg/job"
	"github.com/gin-gonic/gin"
)

type startBody struct {
	ExtraCIDRs   []string `json:"extra_cidrs"`
	ExcludeHosts []string `json:"exclude_hosts"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8091"
	}
	bind := os.Getenv("BIND")
	if bind == "" {
		bind = "0.0.0.0"
	}

	mgr := job.NewManager()
	r := gin.Default()

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "hawkeyes-service"})
	})

	internal := r.Group("/internal")
	internal.POST("/scan", func(c *gin.Context) {
		var body startBody
		_ = c.ShouldBindJSON(&body)
		exclude := map[string]bool{}
		for _, h := range body.ExcludeHosts {
			h = strings.TrimSpace(strings.ToLower(h))
			if h != "" {
				exclude[h] = true
			}
		}
		j := mgr.Start(body.ExtraCIDRs, exclude)
		snap, _ := mgr.Snapshot(j.ID)
		c.JSON(http.StatusAccepted, snap)
	})

	internal.GET("/scan/:id", func(c *gin.Context) {
		snap, ok := mgr.Snapshot(c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "scan job not found"})
			return
		}
		c.JSON(http.StatusOK, snap)
	})

	internal.POST("/scan/:id/cancel", func(c *gin.Context) {
		if !mgr.Cancel(c.Param("id")) {
			c.JSON(http.StatusNotFound, gin.H{"error": "scan job not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	addr := bind + ":" + port
	log.Printf("Hawkeyes scan service listening on %s (RTSP-verified streams only)", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}
