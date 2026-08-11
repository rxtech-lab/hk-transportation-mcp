package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/geo"
)

type routeInfoStop struct {
	StopID  string  `json:"id"`
	Name    string  `json:"name"`
	NameEn  string  `json:"name_en"`
	NameTc  string  `json:"name_tc"`
	NameSc  string  `json:"name_sc"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	StopSeq int     `json:"seq"`
}

// routeInfoVariant is one direction/service-type variant of a route number.
// A route number like "A11" typically has an outbound and an inbound variant,
// each with its own ordered stop list.
type routeInfoVariant struct {
	RouteID     string `json:"route_id"`
	Route       string `json:"route"`
	Bound       string `json:"bound"`
	ServiceType string `json:"service_type"`
	Operator    string `json:"operator"`
	// Origin/Destination are the first and last stop of this variant's ordered
	// stop list, so they always agree with the stops a client lists or draws.
	// They are NOT taken from the routes table: CTB stores a single orig/dest
	// pair per route number, which mislabels the reverse direction (an inbound
	// A11 running Airport → North Point is recorded as ending at the Airport).
	Origin        string `json:"origin"`
	OriginTc      string `json:"origin_tc,omitempty"`
	OriginSc      string `json:"origin_sc,omitempty"`
	Destination   string `json:"destination"`
	DestinationTc string `json:"destination_tc,omitempty"`
	DestinationSc string `json:"destination_sc,omitempty"`
	// The operator's published labels, kept for reference. They often carry
	// routing detail the terminus name lacks ("Airport (via HZMB Hong Kong
	// Port)"), but may describe the opposite direction — see above.
	PublishedOrigin      string          `json:"published_origin,omitempty"`
	PublishedDestination string          `json:"published_destination,omitempty"`
	StopCount            int             `json:"stop_count"`
	Stops                []routeInfoStop `json:"stops"`
}

type routeInfoResponse struct {
	Route  string             `json:"route"`
	Routes []routeInfoVariant `json:"routes"`
}

// RouteInfoHandler returns every direction variant of a bus route together with
// its full ordered stop list. Unlike /api/route-stops it does not need a stop to
// anchor on, so it can answer "show me the A11 route" directly.
//
// GET /api/route-info?route=A11&operator=CTB&bound=O
func RouteInfoHandler(index *geo.StopIndex) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		routeName := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("route")))
		if routeName == "" {
			http.Error(w, `{"error":"route required"}`, http.StatusBadRequest)
			return
		}
		operator := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("operator")))
		bound := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("bound")))

		log.Printf("[/api/route-info] route=%s operator=%s bound=%s", routeName, operator, bound)

		routes, err := index.GetRoutesByName(routeName, operator)
		if err != nil {
			log.Printf("[/api/route-info] lookup failed: %v", err)
			http.Error(w, `{"error":"route lookup failed"}`, http.StatusInternalServerError)
			return
		}

		variants := make([]routeInfoVariant, 0, len(routes))
		for _, rt := range routes {
			if bound != "" && !strings.EqualFold(rt.Bound, bound) {
				continue
			}

			routeStops := index.StopsForRoute(rt.RouteID)
			stops := make([]routeInfoStop, 0, len(routeStops))
			for _, rs := range routeStops {
				stop, ok := index.GetStop(rs.StopID)
				if !ok {
					continue
				}
				stops = append(stops, routeInfoStop{
					StopID:  stop.StopID,
					Name:    stop.NameEn,
					NameEn:  stop.NameEn,
					NameTc:  stop.NameTc,
					NameSc:  stop.NameSc,
					Lat:     stop.Lat,
					Lng:     stop.Lon,
					StopSeq: rs.StopSeq,
				})
			}
			// A variant with no resolvable stops can't be drawn or listed.
			if len(stops) == 0 {
				continue
			}

			first, last := stops[0], stops[len(stops)-1]

			variants = append(variants, routeInfoVariant{
				RouteID:              rt.RouteID,
				Route:                rt.Route,
				Bound:                rt.Bound,
				ServiceType:          rt.ServiceType,
				Operator:             rt.Operator,
				Origin:               first.NameEn,
				OriginTc:             first.NameTc,
				OriginSc:             first.NameSc,
				Destination:          last.NameEn,
				DestinationTc:        last.NameTc,
				DestinationSc:        last.NameSc,
				PublishedOrigin:      rt.OrigEn,
				PublishedDestination: rt.DestEn,
				StopCount:            len(stops),
				Stops:                stops,
			})
		}

		log.Printf("[/api/route-info] route=%s returned %d variants", routeName, len(variants))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(routeInfoResponse{Route: routeName, Routes: variants})
	}
}
