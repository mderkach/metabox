package httpapi_test

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"metabox/internal/contract"
	"metabox/internal/diag"
	"metabox/internal/httpapi"
	"metabox/internal/logs"
)

type fakeLogs struct {
	snapshot logs.Snapshot
	err      error
	level    logs.Level
	lines    int
	stream   []logs.Entry
	cleared  time.Time
}

func (f *fakeLogs) Tail(_ context.Context, n int, level logs.Level) (logs.Snapshot, error) {
	f.lines, f.level = n, level

	return f.snapshot, f.err
}

// Follow отдаёт заготовленные строки и держит поток до отмены, как logread -f.
func (f *fakeLogs) Follow(ctx context.Context, _ logs.Level, emit func(logs.Entry)) (<-chan error, error) {
	if f.err != nil {
		return nil, f.err
	}

	done := make(chan error, 1)

	go func() {
		for _, e := range f.stream {
			emit(e)
		}

		<-ctx.Done()
		done <- nil
	}()

	return done, nil
}

func (f *fakeLogs) Clear(context.Context) (time.Time, error) { return f.cleared, f.err }

type fakeDiag struct {
	proxy string
}

func (f *fakeDiag) Run(_ context.Context, proxy string) (diag.Report, error) {
	f.proxy = proxy

	return diag.Report{Checks: []diag.Check{{Name: diag.NameChains, Status: diag.StatusFail, Reason: diag.ReasonChainsMissing, Missing: []string{"metabox_redirect"}}}}, nil
}

func newLogsServer(t *testing.T, reader httpapi.LogReader, diagnoser httpapi.Diagnoser) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{
		Version: "test",
		Logs:    reader,
		Diag:    diagnoser,
	}))
	t.Cleanup(srv.Close)

	return srv
}

func TestLogsTail(t *testing.T) {
	since := time.Date(2026, 10, 9, 20, 0, 0, 0, time.UTC)
	reader := &fakeLogs{snapshot: logs.Snapshot{
		Source:  logs.SourceLogread,
		Since:   since,
		Entries: []logs.Entry{{Level: logs.LevelWarn, Message: "legacy option"}},
	}}
	srv := newLogsServer(t, reader, nil)

	got := request(t, srv, http.MethodGet, "/api/logs?lines=50&level=WARN", "", nil)
	if got.status != http.StatusOK {
		t.Fatalf("код %d, тело %s", got.status, got.body)
	}

	var body contract.Logs
	got.decode(t, &body)

	if body.Source != logs.SourceLogread || body.Since != "2026-10-09T20:00:00Z" || len(body.Entries) != 1 {
		t.Errorf("ответ %+v", body)
	}

	if reader.lines != 50 || reader.level != logs.LevelWarn {
		t.Errorf("запрошено %d строк уровня %q", reader.lines, reader.level)
	}
}

func TestLogsQueryInvalid(t *testing.T) {
	srv := newLogsServer(t, &fakeLogs{}, nil)

	for _, path := range []string{"/api/logs?level=verbose", "/api/logs?lines=0", "/api/logs?lines=5000", "/api/logs/stream?level=x"} {
		got := request(t, srv, http.MethodGet, path, "", nil)

		var body contract.Error
		got.decode(t, &body)

		if got.status != http.StatusBadRequest || body.Code != contract.ErrLogQueryInvalid {
			t.Errorf("%s: код %d, отказ %+v", path, got.status, body)
		}
	}
}

func TestLogsErrors(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		method string
		path   string
		status int
		code   contract.ErrorCode
	}{
		{"лог недоступен", logs.ErrUnavailable, http.MethodGet, "/api/logs", http.StatusServiceUnavailable, contract.ErrLogUnavailable},
		{"потоков слишком много", logs.ErrTooManyStreams, http.MethodGet, "/api/logs/stream", http.StatusTooManyRequests, contract.ErrLogStreamLimit},
		{"файл вне разрешённых каталогов", logs.ErrClearForbidden, http.MethodPost, "/api/logs/clear", http.StatusConflict, contract.ErrLogClearForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newLogsServer(t, &fakeLogs{err: tt.err}, nil)

			got := request(t, srv, tt.method, tt.path, srv.URL, nil)

			var body contract.Error
			got.decode(t, &body)

			if got.status != tt.status || body.Code != tt.code {
				t.Errorf("код %d, отказ %+v", got.status, body)
			}
		})
	}
}

func TestLogsClear(t *testing.T) {
	srv := newLogsServer(t, &fakeLogs{cleared: time.Date(2026, 10, 9, 20, 0, 0, 0, time.UTC)}, nil)

	got := request(t, srv, http.MethodPost, "/api/logs/clear", srv.URL, nil)
	if got.status != http.StatusOK {
		t.Fatalf("код %d, тело %s", got.status, got.body)
	}

	var body contract.LogsCleared
	got.decode(t, &body)

	if body.Since != "2026-10-09T20:00:00Z" {
		t.Errorf("отметка %q", body.Since)
	}
}

func TestLogsStream(t *testing.T) {
	reader := &fakeLogs{stream: []logs.Entry{
		{Level: logs.LevelInfo, Message: "первая"},
		{Level: logs.LevelError, Message: "вторая"},
	}}
	srv := newLogsServer(t, reader, nil)

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL+"/api/logs/stream?level=info", nil)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("тип ответа %q", resp.Header.Get("Content-Type"))
	}

	scanner := bufio.NewScanner(resp.Body)

	var events []contract.LogEvent

	for len(events) < 2 && scanner.Scan() {
		data, ok := strings.CutPrefix(scanner.Text(), "data: ")
		if !ok {
			continue
		}

		var event contract.LogEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			t.Fatal(err)
		}

		events = append(events, event)
	}

	if len(events) != 2 || events[0].Seq != 1 || events[1].Seq != 2 || events[1].Entry.Message != "вторая" {
		t.Errorf("события %+v", events)
	}
}

func TestDiag(t *testing.T) {
	d := &fakeDiag{}
	srv := newLogsServer(t, nil, d)

	got := request(t, srv, http.MethodGet, "/api/diag?proxy=node%20A", "", nil)
	if got.status != http.StatusOK {
		t.Fatalf("код %d, тело %s", got.status, got.body)
	}

	var body diag.Report
	got.decode(t, &body)

	if d.proxy != "node A" || len(body.Checks) != 1 || body.Checks[0].Missing[0] != "metabox_redirect" {
		t.Errorf("узел %q, отчёт %+v", d.proxy, body)
	}

	if got := request(t, srv, http.MethodGet, "/api/logs", "", nil); got.status != http.StatusNotFound {
		t.Errorf("без читателя лога ручка ответила %d", got.status)
	}
}
