package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/auth"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/busapi"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/cache"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/config"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/database"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/geo"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/osm"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/service"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/tools"
)

func main() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Open PostgreSQL database
	db, err := database.NewConnection(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Connect Redis cache (optional — continue without if unavailable)
	var redisCache *cache.Cache
	if !cfg.CacheEnabled {
		log.Println("Cache disabled via CACHE_ENABLED=false")
	} else {
		redisCache, err = cache.New(cfg.RedisURL)
		if err != nil {
			log.Printf("Redis unavailable, running without cache: %v", err)
			redisCache = nil
		} else {
			defer redisCache.Close()
		}
	}

	// Create HTTP client and bus API clients
	httpClient := busapi.NewHTTPClient()
	kmbClient := busapi.NewKMBClient(httpClient)
	citybusClient := busapi.NewCitybusClient(httpClient)
	clients := []busapi.BusAPIClient{kmbClient, citybusClient}

	// Create geo index and load from database
	index := geo.NewStopIndex(db)

	if err := index.LoadFromDB(); err != nil {
		log.Printf("Warning: failed to load index from database: %v", err)
		log.Println("Run 'go run ./cmd/sync' to populate the database first")
	} else {
		log.Printf("Geo index loaded: %d stops", index.StopCount())
	}

	// Create services
	nominatim := osm.NewNominatimClient(httpClient, redisCache)
	overpass := osm.NewOverpassClient(httpClient, redisCache)

	nearbyService := service.NewNearbyArrivalsService(index, clients, redisCache)
	routeService := service.NewRouteArrivalsService(index, clients, redisCache)
	searchService := service.NewSearchLocationService(index, nominatim, overpass)

	// Create MCP server
	mcpServer := server.NewMCPServer(
		"HK Transportation MCP Server",
		"1.0.0",
		server.WithToolCapabilities(true),
	)

	// Register tools
	tools.Register(mcpServer, nearbyService, routeService, searchService)

	// Create Streamable HTTP server
	streamableServer := server.NewStreamableHTTPServer(mcpServer)

	// Build the HTTP handler — optionally wrap with OAuth middleware
	var handler http.Handler = streamableServer
	var authenticator *auth.OAuthAuthenticator

	if cfg.OAuthServerURL != "" {
		jwksEndpoint := cfg.OAuthServerURL + "/.well-known/jwks.json"
		authenticator, err = auth.NewOAuthAuthenticator(auth.OAuthConfig{
			JWKSEndpoint: jwksEndpoint,
			Issuer:       cfg.OAuthIssuer,
			Audience:     cfg.OAuthAudience,
		})
		if err != nil {
			log.Printf("Warning: Failed to initialize OAuth: %v", err)
		} else {
			handler = authenticator.Middleware(streamableServer)
			log.Printf("OAuth authentication enabled (JWKS: %s)", jwksEndpoint)
			defer authenticator.Close()
		}
	} else {
		log.Println("OAuth not configured, running without authentication")
	}

	// Setup HTTP mux
	mux := http.NewServeMux()
	mux.Handle("/mcp", handler)
	mux.Handle("/mcp/", handler)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Handle graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down...")
		os.Exit(0)
	}()

	// Start server
	addr := ":" + cfg.Port
	log.Printf("Starting MCP server on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// Ensure mcp package is used (for the tool parameter types).
var _ = mcp.LATEST_PROTOCOL_VERSION
