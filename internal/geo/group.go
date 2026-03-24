package geo

import (
	"math"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

// GroupDistanceM is the maximum distance in metres between two stops
// to consider them the same physical stop (from different operators).
const GroupDistanceM = 50.0

// GroupedStop represents a group of physical stops that are co-located
// but operated by different companies.
type GroupedStop struct {
	// Primary stop (first/closest in group)
	models.BusStop
	// All stop IDs in this group
	StopIDs []string
	// All operators in this group
	Operators []string
}

// GroupStopsByProximity merges stops that are within GroupDistanceM of each
// other into a single GroupedStop. The first stop encountered in each group
// is used as the representative.
func GroupStopsByProximity(stops []models.BusStop) []GroupedStop {
	if len(stops) == 0 {
		return nil
	}

	merged := make([]bool, len(stops))
	var result []GroupedStop

	for i := range stops {
		if merged[i] {
			continue
		}

		g := GroupedStop{
			BusStop:   stops[i],
			StopIDs:   []string{stops[i].StopID},
			Operators: []string{stops[i].Operator},
		}

		for j := i + 1; j < len(stops); j++ {
			if merged[j] {
				continue
			}
			dist := HaversineMetres(g.Lat, g.Lon, stops[j].Lat, stops[j].Lon)
			if dist <= GroupDistanceM {
				g.StopIDs = append(g.StopIDs, stops[j].StopID)
				// Track unique operators
				found := false
				for _, op := range g.Operators {
					if op == stops[j].Operator {
						found = true
						break
					}
				}
				if !found {
					g.Operators = append(g.Operators, stops[j].Operator)
				}
				merged[j] = true
			}
		}

		result = append(result, g)
	}

	return result
}

// HaversineMetres returns the great-circle distance in metres between two lat/lon points.
func HaversineMetres(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusM = 6_371_000.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return earthRadiusM * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}
