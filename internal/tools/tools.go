package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/geo"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/service"
)

// Register adds all MCP tools to the server.
func Register(s *server.MCPServer, nearby *service.NearbyArrivalsService, route *service.RouteArrivalsService, search *service.SearchLocationService, index *geo.StopIndex, backendURL ...string) {
	baseURL := "http://localhost:8080"
	if len(backendURL) > 0 && backendURL[0] != "" {
		baseURL = backendURL[0]
	}
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
				mcp.Description("Search radius in meters (default: 150)"),
				mcp.DefaultNumber(150),
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
			radius := req.GetFloat("radius", 150)

			result, err := nearby.Execute(ctx, lat, lon, radius)
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Error: %v", err)), nil
			}
			// Wrap result with display_url for frontend direct fetch
			wrapped := map[string]interface{}{
				"stops":       result.Stops,
				"display_url": fmt.Sprintf("%s/api/arrivals/nearby?lat=%v&lon=%v&radius=%v", baseURL, lat, lon, radius),
			}
			data, err := json.Marshal(wrapped)
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
			// Wrap result with display_url for frontend direct fetch
			wrapped := map[string]interface{}{
				"candidate_routes": result.CandidateRoutes,
				"transfer_routes":  result.TransferRoutes,
				"display_url":      fmt.Sprintf("%s/api/arrivals/nearby?lat=%v&lon=%v&radius=%v", baseURL, lat, lon, radiusOrigin),
			}
			data, err := json.Marshal(wrapped)
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

	// search_route
	s.AddTool(
		mcp.NewTool("search_route",
			mcp.WithDescription("Search for a bus route by number and get its stops and details. Returns route information including origin, destination, operator, and ordered stop list."),
			mcp.WithString("route_number",
				mcp.Required(),
				mcp.Description("Bus route number (e.g., '1A', '960', 'N969')"),
			),
			mcp.WithString("operator",
				mcp.Description("Filter by operator: 'KMB', 'CTB', 'GMB'"),
			),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			routeNumber, err := req.RequireString("route_number")
			if err != nil {
				return mcp.NewToolResultError("route_number is required"), nil
			}
			operator := req.GetString("operator", "")

			routes, err := index.GetRoutesByName(routeNumber, operator)
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Error: %v", err)), nil
			}

			type stopDetail struct {
				StopID string  `json:"stop_id"`
				NameEn string  `json:"name_en"`
				NameTc string  `json:"name_tc"`
				Lat    float64 `json:"lat"`
				Lon    float64 `json:"lon"`
				Seq    int     `json:"seq"`
			}
			type routeDetail struct {
				RouteID     string       `json:"route_id"`
				Route       string       `json:"route"`
				Bound       string       `json:"bound"`
				ServiceType string       `json:"service_type"`
				OrigEn      string       `json:"orig_en"`
				DestEn      string       `json:"dest_en"`
				Operator    string       `json:"operator"`
				Stops       []stopDetail `json:"stops"`
			}

			var results []routeDetail
			for _, r := range routes {
				rd := routeDetail{
					RouteID:     r.RouteID,
					Route:       r.Route,
					Bound:       r.Bound,
					ServiceType: r.ServiceType,
					OrigEn:      r.OrigEn,
					DestEn:      r.DestEn,
					Operator:    r.Operator,
				}
				for _, rs := range index.StopsForRoute(r.RouteID) {
					if stop, ok := index.GetStop(rs.StopID); ok {
						rd.Stops = append(rd.Stops, stopDetail{
							StopID: stop.StopID,
							NameEn: stop.NameEn,
							NameTc: stop.NameTc,
							Lat:    stop.Lat,
							Lon:    stop.Lon,
							Seq:    rs.StopSeq,
						})
					}
				}
				results = append(results, rd)
			}

			data, err := json.Marshal(map[string]interface{}{"routes": results})
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Error: %v", err)), nil
			}
			return mcp.NewToolResultText(string(data)), nil
		},
	)

	// search_stops
	s.AddTool(
		mcp.NewTool("search_stops",
			mcp.WithDescription("Search for bus stops by name or location. Returns stop details including serving route IDs."),
			mcp.WithString("query",
				mcp.Description("Stop name to search for (English, Traditional Chinese, or Simplified Chinese)"),
			),
			mcp.WithNumber("latitude",
				mcp.Description("Latitude for location-based search (WGS84)"),
			),
			mcp.WithNumber("longitude",
				mcp.Description("Longitude for location-based search (WGS84)"),
			),
			mcp.WithNumber("radius",
				mcp.Description("Search radius in meters for location-based search (default: 300)"),
				mcp.DefaultNumber(300),
			),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			query := req.GetString("query", "")
			lat := req.GetFloat("latitude", 0)
			lon := req.GetFloat("longitude", 0)
			radius := req.GetFloat("radius", 300)

			if query == "" && (lat == 0 && lon == 0) {
				return mcp.NewToolResultError("Either 'query' or 'latitude'+'longitude' is required"), nil
			}

			type stopWithRoutes struct {
				StopID    string   `json:"stop_id"`
				StopIDs   []string `json:"stop_ids"`
				NameEn    string   `json:"name_en"`
				NameTc    string   `json:"name_tc"`
				NameSc    string   `json:"name_sc"`
				Lat       float64  `json:"lat"`
				Lon       float64  `json:"lon"`
				Operators []string `json:"operators"`
				RouteIDs  []string `json:"route_ids"`
			}

			var rawStops []models.BusStop

			if lat != 0 || lon != 0 {
				rawStops = index.FindNearby(lat, lon, radius)
			} else {
				found, err := index.SearchStopsByName(query, 20)
				if err != nil {
					return mcp.NewToolResultError(fmt.Sprintf("Error: %v", err)), nil
				}
				rawStops = found
			}

			grouped := geo.GroupStopsByProximity(rawStops)
			var stops []stopWithRoutes
			for _, g := range grouped {
				// Collect route IDs from all stops in the group
				var routeIDs []string
				seen := make(map[string]struct{})
				for _, sid := range g.StopIDs {
					for _, rid := range index.RoutesForStop(sid) {
						if _, ok := seen[rid]; !ok {
							seen[rid] = struct{}{}
							routeIDs = append(routeIDs, rid)
						}
					}
				}
				stops = append(stops, stopWithRoutes{
					StopID:    g.StopID,
					StopIDs:   g.StopIDs,
					NameEn:    g.NameEn,
					NameTc:    g.NameTc,
					NameSc:    g.NameSc,
					Lat:       g.Lat,
					Lon:       g.Lon,
					Operators: g.Operators,
					RouteIDs:  routeIDs,
				})
			}

			data, err := json.Marshal(map[string]interface{}{"stops": stops})
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Error: %v", err)), nil
			}
			return mcp.NewToolResultText(string(data)), nil
		},
	)
}
