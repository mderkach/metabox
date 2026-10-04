package httpapi

import (
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
		{"свой origin", "http://192.168.1.1", "192.168.1.1", true},
		{"свой origin с портом", "http://192.168.1.1:8080", "192.168.1.1:8080", true},
		{"чужой origin", "http://evil.example", "192.168.1.1", false},
		{"origin отсутствует", "", "192.168.1.1", false},
		{"порт не совпадает", "http://192.168.1.1:5173", "192.168.1.1:8080", false},
		{"origin null", "null", "192.168.1.1", false},
		{"origin без хоста", "http://", "192.168.1.1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := originAllowed(tt.origin, tt.host); got != tt.want {
				t.Errorf("origin %q при host %q: получили %v, ожидали %v", tt.origin, tt.host, got, tt.want)
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
		{"IP с портом", "192.168.1.1:8080", "", true},
		{"IP без порта", "192.168.1.1", "", true},
		{"IPv6 с портом", "[fe80::1]:8080", "", true},
		{"IPv6 без порта", "[fe80::1]", "", true},
		{"localhost", "localhost:5173", "", true},
		{"localhost без порта", "localhost", "", true},
		{"чужое имя", "evil.test:8080", "", false},
		{"имя роутера без флага", "router.lan:8080", "", false},
		{"имя из -allowed-origin", "panel.lan:8080", "http://panel.lan:5173", true},
		{"другое имя при заданном флаге", "evil.test:8080", "http://panel.lan:5173", false},
		{"пустой Host", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := hostAllowed(tt.host, tt.allowedOrigin); got != tt.want {
				t.Errorf("host %q при -allowed-origin %q: получили %v, ожидали %v", tt.host, tt.allowedOrigin, got, tt.want)
			}
		})
	}
}

// Пара Origin↔Host, согласованная атакующим через DNS rebinding, не должна
// проходить: Host с чужим именем отклоняется независимо от Origin и метода.
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
				t.Errorf("код %d, ожидали %d", rec.Code, http.StatusForbidden)
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
		t.Errorf("код %d, ожидали %d", rec.Code, http.StatusOK)
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
				t.Errorf("%s: получили %v, ожидали %v", tt.method, got, tt.want)
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
		t.Errorf("код %d, ожидали %d", rec.Code, http.StatusInternalServerError)
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "application/json") {
		t.Errorf("тип ответа %q, ожидали application/json", got)
	}

	var body contract.Error
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("тело %q не в формате контракта: %v", rec.Body.String(), err)
	}
	if body.Code != contract.ErrInternal {
		t.Errorf("код отказа %q, ожидали %q", body.Code, contract.ErrInternal)
	}
	if strings.Contains(body.Message, "обработчик упал") {
		t.Errorf("сообщение %q: внутренние подробности наружу не идут", body.Message)
	}
}

func TestRecoverPanicPassesAbortHandler(t *testing.T) {
	aborting := http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		panic(http.ErrAbortHandler)
	})

	defer func() {
		rec := recover()
		if err, ok := rec.(error); !ok || !errors.Is(err, http.ErrAbortHandler) {
			t.Errorf("восстановлено %v, ожидали проброс http.ErrAbortHandler", rec)
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
		t.Errorf("код %d, ожидали %d", rec.Code, http.StatusTeapot)
	}
}

func TestStatusRecorderUnwraps(t *testing.T) {
	inner := httptest.NewRecorder()
	rec := &statusRecorder{ResponseWriter: inner, status: http.StatusOK}

	if err := http.NewResponseController(rec).Flush(); err != nil {
		t.Fatalf("Flush через контроллер: %v", err)
	}
	if !inner.Flushed {
		t.Error("Flush не дошёл до нижележащего writer'а: потоковые ответы потеряют буферизацию")
	}
}
