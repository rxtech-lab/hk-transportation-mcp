package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/busapi"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/config"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/database"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/geo"
	datasync "github.com/rxtech-lab/hk-transportation-mcp/internal/sync"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.NewConnection(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	httpClient := busapi.NewHTTPClient()
	kmbClient := busapi.NewKMBClient(httpClient)
	citybusClient := busapi.NewCitybusClient(httpClient)
	gmbClient := busapi.NewGMBClient(httpClient)
	clients := []busapi.BusAPIClient{kmbClient, citybusClient, gmbClient}

	index := geo.NewStopIndex(db)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Interrupted, cancelling sync...")
		cancel()
	}()

	syncer := datasync.NewSyncer(db, index, clients...)
	if err := syncer.FullSync(ctx); err != nil {
		log.Fatalf("Sync failed: %v", err)
	}

	log.Printf("Sync complete: %d stops loaded", index.StopCount())
}
