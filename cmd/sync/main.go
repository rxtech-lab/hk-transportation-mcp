package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/joho/godotenv"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/busapi"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/cache"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/config"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/database"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/geo"
	datasync "github.com/rxtech-lab/hk-transportation-mcp/internal/sync"
)

func main() {
	operators := flag.String("operators", "", "comma-separated list of operators to sync (kmb,citybus,gmb). If empty, syncs all.")
	flag.Parse()

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

	// Connect to Redis for GMB failed-stop retry queue.
	redisCache, err := cache.New(cfg.RedisURL)
	if err != nil {
		log.Printf("Warning: Redis unavailable, GMB failed-stop retries disabled: %v", err)
	}
	if redisCache != nil {
		defer redisCache.Close()
	}

	httpClient := busapi.NewHTTPClient()
	kmbClient := busapi.NewKMBClient(httpClient)
	citybusClient := busapi.NewCitybusClient(httpClient)
	var gmbClient *busapi.GMBClient
	if redisCache != nil {
		gmbClient = busapi.NewGMBClient(httpClient, redisCache.Client())
	} else {
		gmbClient = busapi.NewGMBClient(httpClient)
	}

	// Build operator filter set
	selected := make(map[string]bool)
	if *operators != "" {
		for _, op := range strings.Split(*operators, ",") {
			selected[strings.TrimSpace(strings.ToLower(op))] = true
		}
	}

	var clients []busapi.BusAPIClient
	if len(selected) == 0 {
		clients = []busapi.BusAPIClient{kmbClient, citybusClient, gmbClient}
	} else {
		if selected["kmb"] {
			clients = append(clients, kmbClient)
		}
		if selected["citybus"] {
			clients = append(clients, citybusClient)
		}
		if selected["gmb"] {
			clients = append(clients, gmbClient)
		}
		if len(clients) == 0 {
			log.Fatalf("No valid operators specified. Use: kmb, citybus, gmb")
		}
	}

	log.Printf("Syncing operators: %s", operatorNames(clients))

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

func operatorNames(clients []busapi.BusAPIClient) string {
	names := make([]string, len(clients))
	for i, c := range clients {
		names[i] = c.Operator()
	}
	return strings.Join(names, ", ")
}
