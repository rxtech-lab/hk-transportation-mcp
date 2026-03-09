# HK Transportation MCP

![image](./images/HKTransportation.webp)

Realtime Hong Kong Transportation Info for AI Agents — an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that provides real-time bus arrival data, route planning, and location search across Hong Kong's public transit network.

Built with Go, [mcp-go](https://github.com/mark3labs/mcp-go), PostgreSQL + PostGIS, and data from KMB and Citybus APIs.

## Features

- **Real-time bus arrivals** — live ETA data from KMB and Citybus
- **Nearby stop discovery** — find bus stops within walking distance using PostGIS spatial queries
- **Route planning** — find direct bus routes between an origin and destination
- **Location search** — geocode Hong Kong addresses/landmarks via Nominatim, then find nearby stops
- **Streamable HTTP transport** — serves over HTTP at `/mcp` for easy integration
- **Optional OAuth** — JWT-based authentication via configurable OIDC provider
- **Optional Redis caching** — reduce API calls with configurable caching layer

## MCP Tools

| Tool              | Description                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `nearby_arrivals` | Find bus stops near a latitude/longitude and get real-time arrival times for all routes serving those stops.      |
| `route_arrivals`  | Find direct bus routes connecting an origin to a destination and get real-time arrival times at the origin stops. |
| `search_location` | Search for a location in Hong Kong by name, geocode it, and find nearby bus stops.                                |

## Getting Started

### Prerequisites

- Go 1.24+
- PostgreSQL with PostGIS extension
- Redis (optional, for caching)
- Docker (optional)

### Quick Start

1. Clone and configure:

```bash
cp .env.example .env
# Edit .env with your database URL
```

2. Start dependencies with Docker:

```bash
docker compose up -d
```

3. Sync bus stop data into the database:

```bash
go run ./cmd/sync
```

4. Start the MCP server:

```bash
go run ./cmd/server
```

The server will be available at `http://localhost:8080/mcp`.

### Environment Variables

| Variable           | Description                                   | Default          |
| ------------------ | --------------------------------------------- | ---------------- |
| `DATABASE_URL`     | PostgreSQL connection string                  | _(required)_     |
| `REDIS_URL`        | Redis connection string                       | `localhost:6379` |
| `PORT`             | HTTP server port                              | `8080`           |
| `CACHE_ENABLED`    | Enable/disable Redis caching                  | `true`           |
| `OAUTH_SERVER_URL` | OIDC server URL (leave empty to disable auth) | _(empty)_        |
| `OAUTH_ISSUER`     | Expected JWT issuer                           | _(empty)_        |
| `OAUTH_AUDIENCE`   | Expected JWT audience                         | _(empty)_        |

### Using with Claude Desktop

Add this to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "hk-transportation": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

## Development

### Build

```bash
make build
```

### Test

```bash
make test
```

### Project Structure

```
.
├── cmd/
│   ├── server/          # MCP server entry point
│   └── sync/            # Data sync CLI (fetches stops from bus APIs)
├── internal/
│   ├── auth/            # OAuth/JWT authentication middleware
│   ├── busapi/          # KMB and Citybus API clients
│   ├── cache/           # Redis caching layer
│   ├── config/          # Environment-based configuration
│   ├── database/        # PostgreSQL connection and migrations
│   ├── geo/             # PostGIS-backed spatial index for stop lookup
│   ├── models/          # Database models
│   ├── osm/             # Nominatim geocoding & Overpass POI search
│   ├── service/         # Business logic (nearby, route, search)
│   ├── sync/            # Bus stop data synchronization
│   └── tools/           # MCP tool registration and handlers
├── k8s/                 # Kubernetes deployment manifests
└── docker-compose.yaml
```

## Deployment

### Docker

```bash
make docker
```

### Kubernetes

```bash
make deploy
```

## License

MIT
