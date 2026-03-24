package service

import "testing"

func TestExtractRouteName(t *testing.T) {
	tests := []struct {
		routeID string
		want    string
	}{
		// KMB
		{"KMB-1A-O-1", "1A"},
		{"KMB-91M-O-1", "91M"},
		{"KMB-960-I-1", "960"},
		// CTB
		{"CTB-N969-O-1", "N969"},
		{"CTB-6X-I-1", "6X"},
		// GMB (has extra region segment)
		{"GMB-NT-11-O-1", "11"},
		{"GMB-HKI-1-I-1", "1"},
		{"GMB-KLN-2A-O-1", "2A"},
		// Edge cases
		{"UNKNOWN", "UNKNOWN"},
	}

	for _, tt := range tests {
		t.Run(tt.routeID, func(t *testing.T) {
			got := extractRouteName(tt.routeID)
			if got != tt.want {
				t.Errorf("extractRouteName(%q) = %q, want %q", tt.routeID, got, tt.want)
			}
		})
	}
}
