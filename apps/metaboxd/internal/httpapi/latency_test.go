package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"metabox/internal/contract"
	"metabox/internal/history"
	"metabox/internal/httpapi"
)

func TestLatencyEndpointKeepsHistoryWithoutCurrentMeasurement(t *testing.T) {
	const delay = 130
	delayMS := delay
	at := time.Unix(1000, 0).UTC()

	srv := httpapi.NewServer(nil, nil, testLogger(t), httpapi.Options{
		Latency: func(context.Context) (bool, []history.ServerLatency) {
			return true, []history.ServerLatency{{
				Tag: "subscription/server", Level: history.LatencyNoMeasurement, Origin: "computed",
				Recent: []history.LatencyResult{{At: at, DelayMS: &delayMS}},
				Hourly: []history.LatencyMedian{},
			}}
		},
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/latency", nil)
	req.Host = "localhost"
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("latency response: %d %v %s", rec.Code, rec.Header(), rec.Body.String())
	}

	var out contract.LatencyHistory
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Servers) != 1 {
		t.Fatalf("latency rows: %+v", out)
	}
	server := out.Servers[0]
	if server.Current != nil || server.UsualMS != nil || server.Level != contract.LatencyNoMeasurement ||
		server.Origin != "computed" || len(server.Recent) != 1 || !server.Recent[0].At.Equal(at) ||
		server.Recent[0].DelayMS == nil || *server.Recent[0].DelayMS != delay {
		t.Errorf("latency row: %+v", server)
	}
}
