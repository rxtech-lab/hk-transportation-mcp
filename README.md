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

## Architecture Overview

This project is made up of three components that work together:

```
┌─────────────────────────────────────────────────────────────┐
│                        Users                                 │
│         (Browser)              (iOS / Android)               │
└───────────┬─────────────────────────┬───────────────────────┘
            │                         │
            ▼                         ▼
┌───────────────────────┐   ┌─────────────────────────────────┐
│   Frontend (Next.js)  │   │    Mobile App (Expo / RN)        │
│   /frontend           │   │    /mobile                       │
│                       │   │                                  │
│  • Chat UI            │   │  • Chat UI (iOS & Android)       │
│  • Mapbox map         │   │  • Native maps                   │
│  • /api/chat route    │   │  • Live Activity (iOS)           │
│    (AI SDK streaming) │   │  • Chat history (SQLite)         │
└──────────┬────────────┘   └──────────────┬──────────────────┘
           │                               │
           │  POST /api/chat               │  POST /api/chat
           │  (AI SDK streaming)           │  (AI SDK streaming)
           └──────────────┬────────────────┘
                          │
                          ▼
            ┌─────────────────────────┐
            │   Backend (Go MCP)      │
            │   /cmd/server           │
            │                         │
            │  • MCP tools over HTTP  │
            │  • KMB / Citybus APIs   │
            │  • PostgreSQL + PostGIS │
            │  • Redis cache          │
            └─────────────────────────┘
```

### How Each Component Works

#### Backend (Go MCP Server)
The Go server exposes MCP tools over HTTP at `/mcp`. It handles:
- **Bus data sync** — periodically fetches all stops and routes from KMB and Citybus APIs and stores them in PostgreSQL with PostGIS spatial data.
- **Real-time ETAs** — fetches live arrival times on demand from operator APIs and caches results in Redis (30 s TTL).
- **Spatial queries** — finds nearby stops using PostGIS, and plans multi-transfer routes via pgRouting.

#### Frontend (Next.js)
The Next.js app under `frontend/` is a chat-based web UI. It:
- Renders a streaming AI chat interface backed by the [Vercel AI SDK](https://sdk.vercel.ai/).
- Hosts a `/api/chat` route that connects to the Go backend via the MCP protocol to fetch real-time bus data.
- Displays bus stops and routes on an interactive Mapbox map alongside the chat.
- Stores and restores conversation history in `localStorage`.
- Rate-limits API calls with Upstash Redis (optional).

#### Mobile App (Expo / React Native)
The Expo app under `mobile/` is an iOS and Android app. It:
- Provides the same AI chat experience as the web frontend, using the same `/api/chat` endpoint on the Next.js server.
- Renders bus stops and routes on a native map (React Native Maps).
- Persists full chat session history locally using Expo SQLite.
- Supports iOS **Live Activities** — lets users track a specific bus on their Lock Screen.
- Uses Expo Router for file-based navigation with four main tabs: Nearby, Chat, History, and Settings.

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
- Node.js 20+ and [Bun](https://bun.sh/) (for frontend and mobile)
- Expo CLI (`npm install -g expo-cli`) and Xcode / Android Studio (for mobile)

### 1. Backend

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

### 2. Frontend

The Next.js app talks to the Go backend via MCP and to an AI model via an AI gateway.

1. Install dependencies:

```bash
cd frontend
bun install
```

2. Create a local environment file:

```bash
cp .env.example .env.local   # or create .env.local from scratch
```

3. Start the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

#### Frontend Environment Variables

| Variable                    | Description                                                        | Default                                       |
| --------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| `MCP_URL`                   | URL of the Go MCP server                                           | `http://localhost:8080/mcp`                   |
| `NEXT_PUBLIC_BACKEND_URL`   | Public URL of the Go backend (used by the browser for ETA refresh) | Derived from `MCP_URL`                        |
| `AI_MODEL`                  | AI model to use for the chat                                       | `google/gemini-3.1-flash-lite-preview`        |
| `AI_GATEWAY_URL`            | AI gateway base URL                                                | `https://ai-gateway.vercel.sh/v1`             |
| `AI_GATEWAY_API_KEY`        | API key for the AI gateway                                         | _(empty)_                                     |
| `NEXT_PUBLIC_MAPBOX_TOKEN`  | Mapbox public access token (for the interactive map)               | _(empty)_                                     |
| `MCP_ADMIN_KEY`             | Optional admin key sent to the MCP server as `X-Authenticated-Subject` | _(empty)_                                 |
| `KV_REST_API_URL`           | Upstash Redis REST URL (for rate limiting)                         | _(empty — rate limiting disabled if not set)_ |
| `KV_REST_API_TOKEN`         | Upstash Redis REST token                                           | _(empty)_                                     |

### 3. Mobile App

The mobile app connects to the Next.js frontend for AI chat and to the Go backend for direct ETA queries.

1. Install dependencies:

```bash
cd mobile
bun install
```

2. Create a local environment file (`.env.local` or set `EXPO_PUBLIC_*` vars):

```bash
# .env.local
EXPO_PUBLIC_FRONTEND_URL=http://localhost:3000   # Next.js dev server
EXPO_PUBLIC_BACKEND_URL=http://localhost:8080    # Go MCP server
```

3. Start the Expo development server:

```bash
bun start
```

4. Run on a specific platform:

```bash
# iOS simulator (requires Xcode on macOS)
bun ios

# Android emulator (requires Android Studio)
bun android
```

#### Building for production

```bash
# iOS development build (local)
bun build:ios:dev

# Android development build (local)
bun build:android:dev

# iOS production build (local)
bun build:ios:prod

# Android production build (local)
bun build:android:prod
```

#### Mobile Environment Variables

| Variable                    | Description                                                          | Default                    |
| --------------------------- | -------------------------------------------------------------------- | -------------------------- |
| `EXPO_PUBLIC_FRONTEND_URL`  | URL of the Next.js frontend (used for `/api/chat` AI streaming)      | `http://localhost:3001`    |
| `EXPO_PUBLIC_BACKEND_URL`   | URL of the Go MCP server (used for direct ETA refresh calls)         | `http://localhost:3000`    |

### Using with Claude Desktop

You can also connect any MCP-compatible AI client directly to the Go backend:

```json
{
  "mcpServers": {
    "hk-transportation": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

### Backend Environment Variables

| Variable           | Description                                   | Default          |
| ------------------ | --------------------------------------------- | ---------------- |
| `DATABASE_URL`     | PostgreSQL connection string                  | _(required)_     |
| `REDIS_URL`        | Redis connection string                       | `localhost:6379` |
| `PORT`             | HTTP server port                              | `8080`           |
| `CACHE_ENABLED`    | Enable/disable Redis caching                  | `true`           |
| `OAUTH_SERVER_URL` | OIDC server URL (leave empty to disable auth) | _(empty)_        |
| `OAUTH_ISSUER`     | Expected JWT issuer                           | _(empty)_        |
| `OAUTH_AUDIENCE`   | Expected JWT audience                         | _(empty)_        |

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
├── frontend/            # Next.js web chat UI
│   ├── app/             # Next.js App Router pages and /api/chat route
│   ├── components/      # React UI components (chat, map, arrivals)
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Config, MCP client, AI tools, i18n, rate limiting
├── mobile/              # Expo (React Native) iOS/Android app
│   ├── src/
│   │   ├── app/         # Expo Router screens (chat, nearby, history, settings)
│   │   ├── components/  # Native UI components
│   │   ├── contexts/    # React contexts (ChatStream, etc.)
│   │   ├── hooks/       # Custom hooks (arrivals refresh, map data, etc.)
│   │   └── lib/         # Config, SQLite DB, i18n, Live Activity
│   └── targets/         # iOS app extensions (widgets, Live Activity)
├── k8s/                 # Kubernetes deployment manifests
└── docker-compose.yaml
```

## Deployment

### Docker

```bash
make docker
```

### Kubernetes

The `k8s/` folder contains a complete Kustomize-based deployment for:
- `Deployment` + `Service` for `hk-transportation-mcp`
- `Deployment` + `Service` for Redis
- `CronJob` for periodic data sync (`hk-transportation-mcp-sync`)
- `HorizontalPodAutoscaler` for the backend deployment
- `Ingress` with TLS annotations for NGINX + cert-manager
- `ConfigMap` for non-secret runtime configuration

Before deploying:

1. Create the namespace (if needed):

```bash
kubectl create namespace hk-transportation-mcp
```

2. Create the app secret used by both backend and sync job:

```bash
kubectl -n hk-transportation-mcp create secret generic hk-transportation-mcp-secret \
  --from-literal=DATABASE_URL='postgres://...' \
  --from-literal=WASENDER_API_KEY='...' \
  --from-literal=AI_GATEWAY_API_KEY='...' \
  --from-literal=OAUTH_SERVER_URL='...' \
  --from-literal=OAUTH_ISSUER='...' \
  --from-literal=OAUTH_AUDIENCE='...'
```

3. Ensure container image references in `k8s/deployment.yaml` and `k8s/cronjob.yaml` are set to images your cluster can pull.

Deploy all resources:

```bash
make deploy
```

Or directly with Kustomize:

```bash
kubectl apply -k k8s/
```

Verify rollout and runtime status:

```bash
kubectl -n hk-transportation-mcp get pods,svc,ingress,cronjob,hpa
kubectl -n hk-transportation-mcp rollout status deployment/hk-transportation-mcp
kubectl -n hk-transportation-mcp logs deployment/hk-transportation-mcp --tail=100
```

For one-off sync debugging, run:

```bash
kubectl -n hk-transportation-mcp create job --from=cronjob/hk-transportation-mcp-sync manual-sync-$(date +%s)
```

## License

MIT
