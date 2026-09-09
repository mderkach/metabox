package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealth(t *testing.T) {
	rec := httptest.NewRecorder()
	testServer("").Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("код %d, ожидали %d", rec.Code, http.StatusOK)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type %q, ожидали application/json", ct)
	}

	var got healthResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("разбор ответа: %v", err)
	}
	if got.Status != "ok" || got.Version != "test" {
		t.Errorf("получили %+v, ожидали status ok и version test", got)
	}
}

func TestAPINotFound(t *testing.T) {
	rec := httptest.NewRecorder()
	testServer("").Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/nope", nil))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("код %d, ожидали %d", rec.Code, http.StatusNotFound)
	}

	var got APIError
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("под /api/ ожидали JSON-ошибку, разбор не прошёл: %v", err)
	}
	if got.Code != "not_found" {
		t.Errorf("код ошибки %q, ожидали not_found", got.Code)
	}
}

func TestMutatingRequestChecksOrigin(t *testing.T) {
	tests := []struct {
		name          string
		origin        string
		allowedOrigin string
		want          int
	}{
		// 404 означает, что запрос прошёл проверку и дошёл до маршрутизации.
		{"свой origin проходит", "http://192.168.1.1:8080", "", http.StatusNotFound},
		{"дев-стенд по флагу проходит", "http://localhost:5173", "http://localhost:5173", http.StatusNotFound},
		{"чужой origin отклонён", "http://evil.example", "", http.StatusForbidden},
		{"без origin отклонён", "", "", http.StatusForbidden},
		{"флаг не открывает чужой origin", "http://evil.example", "http://localhost:5173", http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/api/apply", nil)
			r.Host = "192.168.1.1:8080"
			if tt.origin != "" {
				r.Header.Set("Origin", tt.origin)
			}

			rec := httptest.NewRecorder()
			testServer(tt.allowedOrigin).Handler().ServeHTTP(rec, r)

			if rec.Code != tt.want {
				t.Errorf("origin %q: код %d, ожидали %d", tt.origin, rec.Code, tt.want)
			}
		})
	}
}

func TestReadRequestSkipsOriginCheck(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	r.Header.Set("Origin", "http://evil.example")

	rec := httptest.NewRecorder()
	testServer("").Handler().ServeHTTP(rec, r)

	if rec.Code != http.StatusOK {
		t.Errorf("код %d, ожидали %d: проверка источника не касается чтения", rec.Code, http.StatusOK)
	}
}
