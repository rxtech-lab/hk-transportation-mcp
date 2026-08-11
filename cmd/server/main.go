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

	"github.com/rxtech-lab/hk-transportation-mcp/internal/api"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/auth"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/busapi"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/cache"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/chat"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/config"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/database"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/geo"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/osm"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/ratelimit"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/service"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/tools"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/whatsapp"
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

	// Connect Redis (required for rate limiting, optionally used for caching)
	redisConn, err := cache.New(cfg.RedisURL)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisConn.Close()

	var redisCache *cache.Cache
	if cfg.CacheEnabled {
		redisCache = redisConn
	} else {
		log.Println("Cache disabled via CACHE_ENABLED=false")
	}

	// Create HTTP client and bus API clients
	httpClient := busapi.NewHTTPClient()
	kmbClient := busapi.NewKMBClient(httpClient)
	citybusClient := busapi.NewCitybusClient(httpClient)
	gmbClient := busapi.NewGMBClient(httpClient)
	clients := []busapi.BusAPIClient{kmbClient, citybusClient, gmbClient}

	// Create geo index and load from database
	index := geo.NewStopIndex(db)

	if err := index.LoadFromDB(); err != nil {
		log.Printf("Warning: failed to load index from database: %v", err)
		log.Println("Run 'go run ./cmd/sync' to populate the database first")
	} else {
		log.Printf("Geo index loaded: %d stops", index.StopCount())
		if err := index.BuildTransitGraph(); err != nil {
			log.Printf("Warning: failed to build transit graph: %v", err)
		}
	}

	// Load GMB route mappings from database so FetchETA doesn't need to call the API
	if err := gmbClient.LoadRouteMappings(db); err != nil {
		log.Printf("Warning: failed to load GMB route mappings: %v", err)
	}

	// Create services
	nominatim := osm.NewNominatimClient(httpClient, redisCache)
	overpass := osm.NewOverpassClient(httpClient, redisCache)

	nearbyService := service.NewNearbyArrivalsService(index, clients, redisCache)
	routeService := service.NewRouteArrivalsService(index, clients, redisCache, overpass)
	searchService := service.NewSearchLocationService(index, nominatim, overpass)

	// Create MCP server
	mcpServer := server.NewMCPServer(
		"HK Transportation MCP Server",
		"1.0.0",
		server.WithToolCapabilities(true),
	)

	// Register tools
	tools.Register(mcpServer, nearbyService, routeService, searchService, index, cfg.BackendURL)

	// Create Streamable HTTP server
	streamableServer := server.NewStreamableHTTPServer(mcpServer)

	// Build the HTTP handler chain: OAuth (optional) -> rate limit -> streamableServer
	// OAuth must run first so it sets X-Authenticated-Subject before the rate limiter checks it.
	var handler http.Handler = streamableServer

	// Rate limiting (Redis-backed): 1 req/s for unauthenticated users; authenticated users bypass rate limiting
	rl := ratelimit.New(ratelimit.DefaultConfig(), redisConn.Client())
	handler = rl.Middleware(handler)

	if cfg.OAuthServerURL != "" {
		jwksEndpoint := cfg.OAuthServerURL + "/.well-known/jwks.json"
		authenticator, err := auth.NewOAuthAuthenticator(auth.OAuthConfig{
			JWKSEndpoint: jwksEndpoint,
			Issuer:       cfg.OAuthIssuer,
			Audience:     cfg.OAuthAudience,
		})
		if err != nil {
			log.Printf("Warning: Failed to initialize OAuth: %v", err)
		} else {
			handler = authenticator.Middleware(handler)
			log.Printf("OAuth enabled — authenticated users bypass rate limiting (JWKS: %s)", jwksEndpoint)
			defer authenticator.Close()
		}
	} else {
		log.Println("OAuth not configured, all requests use default rate limit")
	}

	// Setup HTTP mux
	mux := http.NewServeMux()
	mux.Handle("/mcp", handler)
	mux.Handle("/mcp/", handler)

	// WhatsApp chatbot (optional — only enabled when WASENDER_API_KEY is set)
	if cfg.WasenderAPIKey != "" && cfg.AIGatewayAPIKey != "" {
		chatRepo := chat.NewRepository(db, 20)
		toolExecutor := &chat.ToolExecutor{
			Nearby: nearbyService,
			Route:  routeService,
			Search: searchService,
			Index:  index,
		}
		aiClient := chat.NewAIClient(cfg.AIGatewayURL, cfg.AIGatewayAPIKey, cfg.AIModel, toolExecutor)
		waSender := whatsapp.NewSender(cfg.WasenderBaseURL, cfg.WasenderAPIKey, redisConn.Client())
		waSender.Start()
		defer waSender.Close()
		waHandler := whatsapp.NewHandler(chatRepo, aiClient, waSender)
		mux.Handle("/webhook/whatsapp", waHandler)
		log.Println("WhatsApp chatbot enabled")
	}
	mux.HandleFunc("/api/arrivals", api.ArrivalsHandler(nearbyService))
	mux.HandleFunc("/api/arrivals/nearby", api.NearbyArrivalsGETHandler(nearbyService))
	mux.HandleFunc("/api/arrivals/route", api.RouteArrivalsGETHandler(routeService))
	mux.HandleFunc("/api/route-stops", api.RouteStopsHandler(index))
	mux.HandleFunc("/api/route-info", api.RouteInfoHandler(index))
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HK Transportation MCP Server</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { text-align: center; background: #fff; padding: 3rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { margin: 0 0 0.5rem; font-size: 1.5rem; }
    p { color: #666; margin: 0 0 1.5rem; }
    a { display: inline-block; padding: 0.75rem 2rem; background: #0070f3; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 500; }
    a:hover { background: #005bb5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>HK Transportation MCP Server</h1>
    <p>Real-time Hong Kong public transit data via MCP</p>
    <a href="/mcp">Go to MCP Endpoint &rarr;</a>
  </div>
</body>
</html>`))
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
