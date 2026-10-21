package httpapi

import (
	"crypto/tls"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"metabox/internal/contract"
)

func TestOriginAllowed(t *testing.T) {
	tests := []struct {
		name   string
		origin string
		host   string
		want   bool
	}{
		{"own origin", "http://192.168.1.1", "192.168.1.1", true},
		{"own origin with a port", "http://192.168.1.1:8080", "192.168.1.1:8080", true},
		{"foreign origin", "http://evil.example", "192.168.1.1", false},
		{"origin absent", "", "192.168.1.1", false},
		{"port mismatch", "http://192.168.1.1:5173", "192.168.1.1:8080", false},
		{"origin null", "null", "192.168.1.1", false},
		{"origin without a host", "http://", "192.168.1.1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := originAllowed(tt.origin, tt.host); got != tt.want {
				t.Errorf("origin %q with host %q: got %v, expected %v", tt.origin, tt.host, got, tt.want)
			}
		})
	}
}

func TestHostAllowed(t *testing.T) {
	tests := []struct {
		name          string
		host          string
		allowedOrigin string
		want          bool
	}{
		{"IP with a port", "192.168.1.1:8080", "", true},
		{"IP without a port", "192.168.1.1", "", true},
		{"IPv6 with a port", "[fe80::1]:8080", "", true},
		{"IPv6 without a port", "[fe80::1]", "", true},
		{"localhost", "localhost:5173", "", true},
		{"localhost without a port", "localhost", "", true},
		{"foreign name", "evil.test:8080", "", false},
		{"router name without the flag", "router.lan:8080", "", false},
		{"name from -allowed-origin", "panel.lan:8080", "http://panel.lan:5173", true},
		{"another name with the flag set", "evil.test:8080", "http://panel.lan:5173", false},
		{"empty Host", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := hostAllowed(tt.host, tt.allowedOrigin); got != tt.want {
				t.Errorf("host %q with -allowed-origin %q: got %v, expected %v", tt.host, tt.allowedOrigin, got, tt.want)
			}
		})
	}
}

// An Origin↔Host pair agreed by the attacker through DNS rebinding must not
// pass: a Host with a foreign name is rejected regardless of Origin and the method.
func TestCheckHostRejectsForeignName(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	for _, method := range []string{http.MethodGet, http.MethodPost} {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/api/config", nil)
			req.Host = "evil.test"
			req.Header.Set("Origin", "http://evil.test")

			rec := httptest.NewRecorder()
			checkHost(testLogger(t), "", next).ServeHTTP(rec, req)

			if rec.Code != http.StatusForbidden {
				t.Errorf("code %d, expected %d", rec.Code, http.StatusForbidden)
			}
		})
	}
}

func TestCheckHostPassesPanelAddress(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	req.Host = "192.168.1.1:8080"

	rec := httptest.NewRecorder()
	checkHost(testLogger(t), "", next).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("code %d, expected %d", rec.Code, http.StatusOK)
	}
}

func TestMutating(t *testing.T) {
	tests := []struct {
		method string
		want   bool
	}{
		{http.MethodGet, false},
		{http.MethodHead, false},
		{http.MethodOptions, false},
		{http.MethodPost, true},
		{http.MethodPut, true},
		{http.MethodPatch, true},
		{http.MethodDelete, true},
	}

	for _, tt := range tests {
		t.Run(tt.method, func(t *testing.T) {
			if got := mutating(tt.method); got != tt.want {
				t.Errorf("%s: got %v, expected %v", tt.method, got, tt.want)
			}
		})
	}
}

func TestRecoverPanic(t *testing.T) {
	panicking := http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		panic("обработчик упал")
	})

	rec := httptest.NewRecorder()
	recoverPanic(testLogger(t), panicking).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("code %d, expected %d", rec.Code, http.StatusInternalServerError)
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "application/json") {
		t.Errorf("response type %q, expected application/json", got)
	}

	var body contract.Error
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body %q is not in the contract format: %v", rec.Body.String(), err)
	}
	if body.Code != contract.ErrInternal {
		t.Errorf("rejection code %q, expected %q", body.Code, contract.ErrInternal)
	}
	if strings.Contains(body.Message, "обработчик упал") {
		t.Errorf("message %q: internal details do not go outside", body.Message)
	}
}

func TestRecoverPanicPassesAbortHandler(t *testing.T) {
	aborting := http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		panic(http.ErrAbortHandler)
	})

	defer func() {
		rec := recover()
		if err, ok := rec.(error); !ok || !errors.Is(err, http.ErrAbortHandler) {
			t.Errorf("recovered %v, expected http.ErrAbortHandler to be passed through", rec)
		}
	}()

	recoverPanic(testLogger(t), aborting).ServeHTTP(
		httptest.NewRecorder(),
		httptest.NewRequest(http.MethodGet, "/api/status", nil),
	)
}

func TestLogRequestsKeepsStatus(t *testing.T) {
	teapot := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	})

	rec := httptest.NewRecorder()
	logRequests(testLogger(t), teapot).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusTeapot {
		t.Errorf("code %d, expected %d", rec.Code, http.StatusTeapot)
	}
}

func TestStatusRecorderUnwraps(t *testing.T) {
	inner := httptest.NewRecorder()
	rec := &statusRecorder{ResponseWriter: inner, status: http.StatusOK}

	if err := http.NewResponseController(rec).Flush(); err != nil {
		t.Fatalf("Flush through the controller: %v", err)
	}
	if !inner.Flushed {
		t.Error("Flush did not reach the underlying writer: streaming responses would lose buffering")
	}
}

func TestRedirectToTLS(t *testing.T) {
	served := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	tests := []struct {
		name     string
		enabled  bool
		tls      bool
		target   string
		want     int
		location string
	}{
		{"plain request is sent to https", true, false, "/api/status?x=1", http.StatusPermanentRedirect, "https://192.168.1.1:8088/api/status?x=1"},
		{"tls request passes", true, true, "/api/status", http.StatusNoContent, ""},
		{"health check stays on plain http", true, false, "/healthz", http.StatusNoContent, ""},
		{"root certificate stays on plain http", true, false, "/metabox-ca.crt", http.StatusNoContent, ""},
		{"disabled passes everything", false, false, "/api/status", http.StatusNoContent, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "http://192.168.1.1:8088"+tt.target, nil)
			if tt.tls {
				req.TLS = &tls.ConnectionState{}
			}

			rec := httptest.NewRecorder()
			redirectToTLS(tt.enabled, served).ServeHTTP(rec, req)

			if rec.Code != tt.want {
				t.Fatalf("status %d, want %d", rec.Code, tt.want)
			}

			if got := rec.Header().Get("Location"); got != tt.location {
				t.Errorf("Location %q, want %q", got, tt.location)
			}
		})
	}
}
