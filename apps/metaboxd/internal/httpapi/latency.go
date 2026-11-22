package httpapi

import (
	"net/http"

	"metabox/internal/contract"
	"metabox/internal/history"
)

func (s *Server) handleLatency(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	available, servers := s.latency(r.Context())
	writeJSON(s.log, w, http.StatusOK, contract.LatencyHistory{
		Available: &available,
		Servers:   each(servers, latencyOut),
	})
}

func latencyOut(server history.ServerLatency) contract.ServerLatency {
	return contract.ServerLatency{
		Tag:             server.Tag,
		Current:         (*contract.LatencyResult)(server.Current),
		Recent:          each(server.Recent, func(r history.LatencyResult) contract.LatencyResult { return contract.LatencyResult(r) }),
		Hourly:          each(server.Hourly, func(m history.LatencyMedian) contract.LatencyMedian { return contract.LatencyMedian(m) }),
		UsualMS:         server.UsualMS,
		ComputedUsualMS: server.ComputedUsualMS,
		Level:           contract.LatencyLevel(server.Level),
		Origin:          server.Origin,
	}
}
