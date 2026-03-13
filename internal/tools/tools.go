package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/service"
)

// Register adds all MCP tools to the server.
func Register(s *server.MCPServer, nearby *service.NearbyArrivalsService, route *service.RouteArrivalsService, search *service.SearchLocationService) {
	// nearby_arrivals
	s.AddTool(
		mcp.NewTool("nearby_arrivals",
			mcp.WithDescription("Find bus stops near a location and get real-time arrival times. Returns upcoming bus arrivals sorted by ETA for all routes serving nearby stops."),
			mcp.WithNumber("latitude",
				mcp.Required(),
				mcp.Description("Latitude of the location (WGS84)"),
			),
			mcp.WithNumber("longitude",
				mcp.Required(),
				mcp.Description("Longitude of the location (WGS84)"),
			),
			mcp.WithNumber("radius",
				mcp.Description("Search radius in meters (default: 300)"),
				mcp.DefaultNumber(300),
			),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			lat, err := req.RequireFloat("latitude")
			if err != nil {
				return mcp.NewToolResultError("latitude is required"), nil
			}
			lon, err := req.RequireFloat("longitude")
			if err != nil {
				return mcp.NewToolResultError("longitude is required"), nil
			}
			radius := req.GetFloat("radius", 300)

			result, err := nearby.Execute(ctx, lat, lon, radius)
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Error: %v", err)), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Error: %v", err)), nil
			}
			return mcp.NewToolResultText(string(data)), nil
		},
	)

	// route_arrivals
	s.AddTool(
		mcp.NewTool("route_arrivals",
			mcp.WithDescription("Find bus routes connecting an origin to a destination and get real-time arrival times. Returns direct routes and transfer routes supporting multiple transfers via pgRouting shortest-path search."),
			mcp.WithNumber("latitude",
				mcp.Required(),
				mcp.Description("Latitude of the origin location (WGS84)"),
			),
			mcp.WithNumber("longitude",
				mcp.Required(),
				mcp.Description("Longitude of the origin location (WGS84)"),
			),
			mcp.WithNumber("dest_lat",
				mcp.Required(),
				mcp.Description("Latitude of the destination (WGS84)"),
			),
			mcp.WithNumber("dest_lon",
				mcp.Required(),
				mcp.Description("Longitude of the destination (WGS84)"),
			),
			mcp.WithNumber("radius_origin",
				mcp.Description("Search radius around origin in meters (default: 300)"),
				mcp.DefaultNumber(300),
			),
			mcp.WithNumber("radius_dest",
				mcp.Description("Search radius around destination in meters (default: 300)"),
				mcp.DefaultNumber(300),
			),
			mcp.WithNumber("max_transfers",
				mcp.Description("Maximum number of transfers allowed for transfer routes (default: 2)"),
				mcp.DefaultNumber(2),
			),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			lat, err := req.RequireFloat("latitude")
			if err != nil {
				return mcp.NewToolResultError("latitude is required"), nil
			}
			lon, err := req.RequireFloat("longitude")
			if err != nil {
				return mcp.NewToolResultError("longitude is required"), nil
			}
			destLat, err := req.RequireFloat("dest_lat")
			if err != nil {
				return mcp.NewToolResultError("dest_lat is required"), nil
			}
			destLon, err := req.RequireFloat("dest_lon")
			if err != nil {
				return mcp.NewToolResultError("dest_lon is required"), nil
			}
			radiusOrigin := req.GetFloat("radius_origin", 300)
			radiusDest := req.GetFloat("radius_dest", 300)
			maxTransfers := req.GetInt("max_transfers", 2)

			result, err := route.Execute(ctx, lat, lon, destLat, destLon, radiusOrigin, radiusDest, maxTransfers)
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Error: %v", err)), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Error: %v", err)), nil
			}
			return mcp.NewToolResultText(string(data)), nil
		},
	)

	// search_location
	s.AddTool(
		mcp.NewTool("search_location",
			mcp.WithDescription("Search for a location in Hong Kong by name and find nearby bus stops. Uses geocoding to resolve the location, then finds bus stops within walking distance."),
			mcp.WithString("query",
				mcp.Required(),
				mcp.Description("Location name or address to search for in Hong Kong"),
			),
			mcp.WithNumber("limit",
				mcp.Description("Maximum number of location results (default: 5)"),
				mcp.DefaultNumber(5),
			),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			query, err := req.RequireString("query")
			if err != nil {
				return mcp.NewToolResultError("query is required"), nil
			}
			limit := req.GetInt("limit", 5)

			result, err := search.Execute(ctx, query, limit)
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Error: %v", err)), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Error: %v", err)), nil
			}
			return mcp.NewToolResultText(string(data)), nil
		},
	)
}
