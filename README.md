# hk-transportation-mcp

Go server built with Fiber, GORM, and Wire.

## Getting Started

### Prerequisites

- Go 1.24 or higher
- PostgreSQL database
- Docker (optional, for running postgres via docker-compose)

### Environment Setup

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Update the `.env` file with your configuration:
```env
DATABASE_URL=postgres://user:password@localhost:5432/dbname?sslmode=disable
PORT=8080
```

### Installation

1. Install dependencies:
```bash
make install
```

2. Generate code:
```bash
make generate
```

### Running the Server

#### Using Docker Compose (Recommended)

Start the database and server:
```bash
docker compose up
```

#### Local Development

1. Start PostgreSQL (if not using Docker)

2. Run the server:
```bash
make run
```

The server will start on `http://localhost:8080` (or the port specified in your `.env` file).

### Building

Build the server binary:
```bash
make build
```

The binary will be created in `bin/server`.

### Testing

Run tests:
```bash
make test
```

### API Documentation

The API is documented using OpenAPI 3.0. View the specification at:
- File: `api/openapi.yaml`
- Swagger UI: `http://localhost:8080/swagger` (when server is running)

### Available Endpoints

- `GET /health` - Health check endpoint
- `GET /api/v1/examples` - List all examples
- `POST /api/v1/examples` - Create a new example
- `GET /api/v1/examples/{id}` - Get an example by ID

### Project Structure

```
.
├── api/                  # OpenAPI specifications
├── cmd/                  # Application entry points
│   └── server/          # Main server application
├── internal/            # Private application code
│   ├── api/            # Generated API code
│   ├── config/         # Configuration management
│   ├── database/       # Database connections and migrations
│   ├── dto/            # Data transfer objects
│   ├── models/         # Database models
│   ├── server/         # HTTP server implementation
│   ├── service/        # Business logic
│   ├── testutil/       # Testing utilities
│   └── utils/          # Utility functions
├── k8s/                 # Kubernetes manifests
└── tools/               # Build tools and generators
```

### Development

#### Adding a New Endpoint

1. Update the OpenAPI specification in `api/openapi.yaml`
2. Run `make generate` to regenerate the API code
3. Implement the endpoint in `internal/server/server.go`
4. Add business logic in `internal/service/`

#### Database Migrations

Migrations are automatically run on server startup using GORM AutoMigrate.
Add new models in `internal/models/` and update the `Migrate` function in `internal/database/database.go`.

## Deployment


### Kubernetes

Deploy to Kubernetes:
```bash
make deploy
```

This will apply the manifests in the `k8s/` directory.


### Docker

Build and tag the Docker image:
```bash
make docker
```

## License

Add your license information here.

