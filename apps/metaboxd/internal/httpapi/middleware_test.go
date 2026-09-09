package httpapi

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
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
	if body := rec.Body.String(); body != "" {
		t.Errorf("тело %q, ожидали пустое: внутренние подробности наружу не идут", body)
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
