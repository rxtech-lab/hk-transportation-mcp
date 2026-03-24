package models

import "time"

// BusStop represents a bus stop with its location and name in multiple languages.
type BusStop struct {
	StopID   string  `json:"stop_id"`
	NameEn   string  `json:"name_en"`
	NameTc   string  `json:"name_tc"`
	NameSc   string  `json:"name_sc"`
	Lat      float64 `json:"lat"`
	Lon      float64 `json:"lon"`
	Operator string  `json:"operator"`
}

// Route represents a bus route.
type Route struct {
	RouteID      string `json:"route_id"`
	Route        string `json:"route"`
	Bound        string `json:"bound"`
	ServiceType  string `json:"service_type"`
	OrigEn       string `json:"orig_en"`
	DestEn       string `json:"dest_en"`
	DestTc       string `json:"dest_tc"`
	DestSc       string `json:"dest_sc"`
	Operator     string `json:"operator"`
	GmbNumericID int64  `json:"gmb_numeric_id,omitempty"`
}

// RouteStop represents the association between a route and a stop.
type RouteStop struct {
	RouteID  string `json:"route_id"`
	StopID   string `json:"stop_id"`
	StopSeq  int    `json:"stop_seq"`
	Operator string `json:"operator"`
}

// ETAArrival represents an estimated time of arrival at a bus stop.
type ETAArrival struct {
	Route       string     `json:"route"`
	Direction   string     `json:"direction"`
	Destination string     `json:"destination"`
	DestTc      string     `json:"dest_tc"`
	DestSc      string     `json:"dest_sc"`
	StopName    string     `json:"stop_name"`
	StopID      string     `json:"stop_id"`
	StopSeq     int        `json:"stop_seq"`
	ETA         *time.Time `json:"eta"`
	Operator    string     `json:"operator"`
	Remark      string     `json:"remark"`
}
