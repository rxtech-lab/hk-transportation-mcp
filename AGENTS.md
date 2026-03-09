# hk-transportation-mcp - Development Guide for AI Agents

## Project Overview

This is a **Model Context Protocol (MCP) server** for Hong Kong bus transportation data, providing real-time bus arrival information and location search.

**Stack:**
- **Protocol**: MCP over Streamable HTTP (`github.com/mark3labs/mcp-go`)
- **Database**: Turso/libsql (SQLite) for persistent storage
- **Cache**: Redis for ETA (30s TTL) and geocoding (30min TTL) caching
- **Geospatial**: In-memory Haversine index (~20k bus stops)
- **External APIs**: KMB, Citybus, Nominatim, Overpass

## Architecture

```
hk-transportation-mcp/
├── cmd/server/main.go                 # Entry point: config, DI, MCP server
├── internal/
│   ├── config/config.go               # Env config (TURSO_URL, REDIS_URL, PORT, etc.)
│   ├── database/database.go           # Turso/libsql connection + schema migration
│   ├── models/models.go               # BusStop, Route, RouteStop, ETAArrival
│   ├── cache/redis.go                 # Redis wrapper with typed JSON get/set
│   ├── busapi/
│   │   ├── client.go                  # Shared HTTP client, BusAPIClient interface
│   │   ├── kmb.go                     # KMB API client
│   │   └── citybus.go                 # Citybus API client
│   ├── osm/
│   │   ├── nominatim.go               # Nominatim geocoding (HK only)
│   │   └── overpass.go                # Overpass API for OSM bus stops
│   ├── geo/index.go                   # In-memory spatial index (Haversine)
│   ├── sync/sync.go                   # Data sync: full load + periodic refresh (1hr)
│   ├── service/
│   │   ├── nearby_arrivals.go         # nearby_arrivals tool logic
│   │   ├── route_arrivals.go          # route_arrivals tool logic
│   │   └── search_location.go         # search_location tool logic
│   ├── tools/tools.go                 # MCP tool registration and handler wiring
│   └── auth/oauth.go                  # JWKS-based JWT validation
├── docker-compose.yaml                # Redis
├── go.mod / go.sum
├── Makefile
└── k8s/                               # Kubernetes manifests
```

## MCP Tools

### 1. `nearby_arrivals`
Find bus stops near a location and get real-time arrival times.
- **Params**: `latitude` (required), `longitude` (required), `radius` (default 300m)
- **Returns**: Nearby stops with sorted ETA arrivals

### 2. `route_arrivals`
Find direct bus routes connecting origin to destination with ETAs.
- **Params**: `latitude`, `longitude`, `dest_lat`, `dest_lon` (all required), `radius_origin` (300m), `radius_dest` (300m)
- **Returns**: Candidate routes with arrival times at origin stops

### 3. `search_location`
Search for a location in Hong Kong and find nearby bus stops.
- **Params**: `query` (required), `limit` (default 5)
- **Returns**: Geocoded locations with nearby bus stops

## Data Flow

1. On startup, `sync.FullSync` fetches all stops/routes/route-stops from KMB + Citybus
2. Data is persisted to Turso and loaded into the in-memory geo index
3. Periodic sync runs every hour
4. ETA data is fetched on-demand from operator APIs with 30s Redis caching
5. Geocoding uses Nominatim (rate-limited 1 req/s) with 30min Redis caching

## Environment Variables

```bash
TURSO_URL=file:local.db        # Or libsql://your-db.turso.io
TURSO_AUTH_TOKEN=               # Turso auth token (for remote)
REDIS_URL=localhost:6379        # Redis connection
PORT=8080                       # Server port
JWKS_ENDPOINT=                  # Optional JWKS URL for auth
```

## Commands

```bash
make build    # Build binary
make test     # Run tests
make run      # Run server
make docker   # Build Docker image
make deploy   # Deploy to k8s
```

## Key Patterns

- **Manual DI**: All dependencies constructed in `main.go`
- **Interface-based API clients**: `BusAPIClient` interface allows mocking
- **Concurrent data fetching**: Sync and ETA fetches use goroutines
- **Graceful degradation**: Redis is optional; server works without cache
