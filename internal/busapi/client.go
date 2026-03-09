package busapi

import (
	"context"
	"net/http"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

// BusAPIClient defines the interface for fetching bus data from operator APIs.
type BusAPIClient interface {
	FetchAllStops(ctx context.Context) ([]models.BusStop, error)
	FetchAllRoutes(ctx context.Context) ([]models.Route, error)
	FetchRouteStops(ctx context.Context, route, bound, serviceType string) ([]models.RouteStop, error)
	FetchETA(ctx context.Context, stopID, route string) ([]models.ETAArrival, error)
	Operator() string
}

// NewHTTPClient creates a shared HTTP client with a 10-second timeout.
func NewHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 10 * time.Second,
	}
}
