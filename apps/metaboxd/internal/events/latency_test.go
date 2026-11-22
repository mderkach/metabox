package events

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/history"
)

func TestLatencyMonitorRecordsManualProbeWithoutRevivingOldCore(t *testing.T) {
	var epoch atomic.Value
	epoch.Store("first")
	var status atomic.Int32
	status.Store(http.StatusOK)
	var replaceDuringProbe atomic.Bool

	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.EscapedPath() {
		case "/proxies":
			data := map[string]any{"proxies": map[string]any{"vpn/edge": map[string]any{
				"type": "Shadowsocks", "history": []map[string]any{{"time": time.Now().Add(-time.Second), "delay": 120}},
			}}}
			_ = json.NewEncoder(w).Encode(data)
		case "/proxies/vpn%2Fedge":
			_, _ = io.WriteString(w, `{"name":"vpn/edge","type":"Shadowsocks","history":[]}`)
		case "/proxies/vpn%2Fedge/delay":
			if replaceDuringProbe.Load() {
				epoch.Store("third")
			}
			w.WriteHeader(int(status.Load()))
			_, _ = io.WriteString(w, `{"delay":142}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer core.Close()

	settings := clashapi.Settings{Address: strings.TrimPrefix(core.URL, "http://")}
	resolve := func(context.Context) (clashapi.Settings, error) { return settings, nil }
	source := NewClashSource(ClashSettings(resolve), nil, nil, time.Second)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	monitor := NewLatencyMonitor(source, resolve, func(context.Context, int) string {
		return epoch.Load().(string)
	}, log)
	proxy, err := clashapi.NewProxy(resolve, func(w http.ResponseWriter, r *http.Request, err error) {
		t.Errorf("forward delay %s: %v", r.URL, err)
		w.WriteHeader(http.StatusBadGateway)
	})
	if err != nil {
		t.Fatal(err)
	}
	proxy.WithDelayObserver(monitor.ObserveDelay)

	probe := func(want int) {
		t.Helper()

		rec := httptest.NewRecorder()
		req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/clash/proxies/vpn%2Fedge/delay", nil)
		proxy.ServeHTTP(rec, req)
		if rec.Code != want || rec.Body.String() != `{"delay":142}` {
			t.Errorf("forwarded delay: got %d %q, want %d and original body", rec.Code, rec.Body.String(), want)
		}
	}
	row := func() history.ServerLatency {
		t.Helper()
		_, rows := monitor.Snapshot(t.Context())
		if len(rows) != 1 || rows[0].Tag != "vpn/edge" {
			t.Fatalf("server rows: %+v", rows)
		}

		return rows[0]
	}

	monitor.poll(t.Context())
	if got := row(); got.Current != nil || len(got.Recent) != 1 {
		t.Fatalf("before manual check: %+v", got)
	}

	probe(http.StatusOK)
	if got := row(); got.Current == nil || got.Current.DelayMS == nil || *got.Current.DelayMS != 142 {
		t.Errorf("manual success: %+v", got)
	}
	status.Store(http.StatusServiceUnavailable)
	probe(http.StatusServiceUnavailable)
	if got := row(); got.Current == nil || got.Current.DelayMS != nil || string(got.Level) != "no_answer" {
		t.Errorf("manual failure: %+v", got)
	}

	epoch.Store("second")
	if got := row(); got.Current != nil || len(got.Recent) < 2 {
		t.Errorf("after restart, before the next poll: %+v", got)
	}

	monitor.poll(t.Context())
	if got := row(); got.Current != nil || len(got.Recent) < 2 {
		t.Errorf("automatic result after restart: %+v", got)
	}

	replaceDuringProbe.Store(true)
	status.Store(http.StatusOK)
	probe(http.StatusOK)
	if got := row(); got.Current != nil {
		t.Errorf("old probe revived current delay across a restart: %+v", got)
	}

	replaceDuringProbe.Store(false)
	probe(http.StatusOK)
	if got := row(); got.Current == nil || got.Current.DelayMS == nil || *got.Current.DelayMS != 142 {
		t.Errorf("first manual probe before a periodic poll in a new core: %+v", got)
	}
}

func TestLatencyMonitorCountsProbeOnceWhenCacheUpdatesBeforeResponse(t *testing.T) {
	var cachedAt atomic.Int64
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/proxies" {
			http.NotFound(w, r)
			return
		}

		samples := []map[string]any{}
		if at := cachedAt.Load(); at != 0 {
			samples = append(samples, map[string]any{"time": time.Unix(0, at), "delay": 142})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"proxies": map[string]any{"edge": map[string]any{
			"type": "Shadowsocks", "history": samples,
		}}})
	}))
	defer core.Close()

	settings := clashapi.Settings{Address: strings.TrimPrefix(core.URL, "http://")}
	resolve := func(context.Context) (clashapi.Settings, error) { return settings, nil }
	source := NewClashSource(ClashSettings(resolve), nil, nil, time.Second)
	monitor := NewLatencyMonitor(source, resolve, func(context.Context, int) string { return "core" },
		slog.New(slog.NewTextHandler(io.Discard, nil)))
	monitor.poll(t.Context())

	_, probe := monitor.ObserveDelay(t.Context(), settings, "edge")
	if probe == nil {
		t.Fatal("known server should be observed")
	}
	cachedAt.Store(time.Now().Add(-time.Millisecond).UnixNano())
	monitor.poll(t.Context())
	_, rows := monitor.Snapshot(t.Context())
	if len(rows) != 1 || rows[0].Current != nil || len(rows[0].Recent) != 0 {
		t.Fatalf("cache while the response is pending: %+v", rows)
	}

	probe.Record(t.Context(), 142, true)
	probe.Done()
	monitor.poll(t.Context())
	_, rows = monitor.Snapshot(t.Context())
	if len(rows) != 1 || len(rows[0].Recent) != 1 || rows[0].Current == nil ||
		rows[0].Current.DelayMS == nil || *rows[0].Current.DelayMS != 142 {
		t.Fatalf("manual response and its cached copy: %+v", rows)
	}

	_, abandoned := monitor.ObserveDelay(t.Context(), settings, "edge")
	if abandoned == nil {
		t.Fatal("following probe should be observed")
	}
	abandoned.Done()
	cachedAt.Store(time.Now().UnixNano())
	monitor.poll(t.Context())
	_, rows = monitor.Snapshot(t.Context())
	if len(rows) != 1 || len(rows[0].Recent) != 2 {
		t.Fatalf("passive observation after a probe without a response: %+v", rows)
	}
}
