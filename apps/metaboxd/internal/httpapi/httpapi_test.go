package httpapi_test

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"metabox/internal/httpapi"
)

func testLogger(t *testing.T) *slog.Logger {
	t.Helper()

	return slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

type testWriter struct {
	t *testing.T
}

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Helper()
	w.t.Log(string(p))

	return len(p), nil
}

func newTestServer(t *testing.T, allowedOrigin string) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(testLogger(t), httpapi.Options{
		Version:       "test",
		AllowedOrigin: allowedOrigin,
	}))
	t.Cleanup(srv.Close)

	return srv
}

type response struct {
	status      int
	contentType string
	body        string
}

func request(t *testing.T, srv *httptest.Server, method, path, origin string) response {
	t.Helper()

	req, err := http.NewRequestWithContext(t.Context(), method, srv.URL+path, nil)
	if err != nil {
		t.Fatalf("сборка запроса %s %s: %v", method, path, err)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}

	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("запрос %s %s: %v", method, path, err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			t.Errorf("закрытие тела ответа: %v", err)
		}
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("чтение ответа %s %s: %v", method, path, err)
	}

	return response{
		status:      resp.StatusCode,
		contentType: resp.Header.Get("Content-Type"),
		body:        string(body),
	}
}

func TestHealth(t *testing.T) {
	got := request(t, newTestServer(t, ""), http.MethodGet, "/healthz", "")

	if got.status != http.StatusOK {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusOK)
	}
	if !strings.HasPrefix(got.contentType, "application/json") {
		t.Errorf("Content-Type %q, ожидали application/json", got.contentType)
	}

	var health struct {
		Status  string `json:"status"`
		Version string `json:"version"`
	}
	if err := json.Unmarshal([]byte(got.body), &health); err != nil {
		t.Fatalf("разбор ответа %q: %v", got.body, err)
	}
	if health.Status != "ok" || health.Version != "test" {
		t.Errorf("получили %+v, ожидали status ok и version test", health)
	}
}

func TestAPINotFound(t *testing.T) {
	got := request(t, newTestServer(t, ""), http.MethodGet, "/api/nope", "")

	if got.status != http.StatusNotFound {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusNotFound)
	}

	var apiErr httpapi.APIError
	if err := json.Unmarshal([]byte(got.body), &apiErr); err != nil {
		t.Fatalf("под /api/ ожидали JSON-ошибку, получили %q: %v", got.body, err)
	}
	if apiErr.Code != "not_found" {
		t.Errorf("код ошибки %q, ожидали not_found", apiErr.Code)
	}
}

func TestMutatingRequestChecksOrigin(t *testing.T) {
	const devOrigin = "http://localhost:5173"

	tests := []struct {
		name string
		// ownOrigin подставляет адрес самого тестового сервера.
		ownOrigin     bool
		origin        string
		allowedOrigin string
		// 404 означает, что запрос прошёл проверку и дошёл до маршрутизации.
		want int
	}{
		{name: "свой origin проходит", ownOrigin: true, want: http.StatusNotFound},
		{name: "дев-стенд по флагу проходит", origin: devOrigin, allowedOrigin: devOrigin, want: http.StatusNotFound},
		{name: "чужой origin отклонён", origin: "http://evil.example", want: http.StatusForbidden},
		{name: "без origin отклонён", want: http.StatusForbidden},
		{name: "флаг не открывает чужой origin", origin: "http://evil.example", allowedOrigin: devOrigin, want: http.StatusForbidden},
		{name: "дев-origin без флага отклонён", origin: devOrigin, want: http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, tt.allowedOrigin)

			origin := tt.origin
			if tt.ownOrigin {
				origin = srv.URL
			}

			got := request(t, srv, http.MethodPost, "/api/apply", origin)
			if got.status != tt.want {
				t.Errorf("origin %q: код %d, ожидали %d", origin, got.status, tt.want)
			}
		})
	}
}

func TestMutatingMethodsAllChecked(t *testing.T) {
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		t.Run(method, func(t *testing.T) {
			got := request(t, newTestServer(t, ""), method, "/api/apply", "http://evil.example")
			if got.status != http.StatusForbidden {
				t.Errorf("код %d, ожидали %d", got.status, http.StatusForbidden)
			}
		})
	}
}

func TestReadRequestSkipsOriginCheck(t *testing.T) {
	got := request(t, newTestServer(t, ""), http.MethodGet, "/healthz", "http://evil.example")

	if got.status != http.StatusOK {
		t.Errorf("код %d, ожидали %d: проверка источника не касается чтения", got.status, http.StatusOK)
	}
}
