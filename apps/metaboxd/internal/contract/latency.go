package contract

import "time"

// LatencyLevel describes the current reading against the server's usual latency.
type LatencyLevel string

// Latency levels distinguish an unavailable reading from a failed attempt.
const (
	LatencyNoMeasurement LatencyLevel = "no_measurement"
	LatencyNoAnswer      LatencyLevel = "no_answer"
	LatencyWithinNorm    LatencyLevel = "within_norm"
	LatencyAboveNorm     LatencyLevel = "above_norm"
	LatencyAboveCeiling  LatencyLevel = "above_ceiling"
)

// LatencyResult represents a successful measurement or an attempt with no answer.
type LatencyResult struct {
	At      time.Time `json:"at"`
	DelayMS *int      `json:"delay_ms,omitempty"`
}

// LatencyMedian is the median of the retained successful readings of a completed UTC hour.
type LatencyMedian struct {
	Hour    time.Time `json:"hour"`
	DelayMS int       `json:"delay_ms"`
}

// ServerLatency separates the current process reading from the daemon's history.
type ServerLatency struct {
	Tag             string          `json:"tag"`
	Current         *LatencyResult  `json:"current,omitempty"`
	Recent          []LatencyResult `json:"recent"`
	Hourly          []LatencyMedian `json:"hourly"`
	UsualMS         *int            `json:"usual_ms,omitempty"`
	ComputedUsualMS *int            `json:"computed_usual_ms,omitempty"`
	Level           LatencyLevel    `json:"level"`
	Origin          string          `json:"origin"`
}
