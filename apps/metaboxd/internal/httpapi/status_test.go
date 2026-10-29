package httpapi_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"metabox/internal/contract"
	"metabox/internal/events"
	"metabox/internal/httpapi"
)

// refusingStream is an event stream that refuses every reader with err.
type refusingStream struct{ err error }

func (s refusingStream) Serve(http.ResponseWriter, *http.Request) error { return s.err }

func newStatusServer(t *testing.T, opts httpapi.Options) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), opts))
	t.Cleanup(srv.Close)

	return srv
}

// The panel must tell "another source" from "no data", so the source composition
// goes by the contract and is not guessed from the presence of data.
func TestStatusReportsRuntimeSources(t *testing.T) {
	stub := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	stream := refusingStream{}

	tests := []struct {
		name        string
		opts        httpapi.Options
		sources     []contract.RuntimeSource
		connections contract.RuntimeSource
	}{
		{
			name:        "stream assembled",
			opts:        httpapi.Options{Events: stream, Clash: stub},
			sources:     []contract.RuntimeSource{contract.SourceClashAPI},
			connections: contract.SourceClashAPI,
		},
		{
			name:    "proxy only",
			opts:    httpapi.Options{Clash: stub},
			sources: []contract.RuntimeSource{contract.SourceClashAPI},
		},
		{
			name:    "no runtime",
			opts:    httpapi.Options{},
			sources: []contract.RuntimeSource{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := request(t, newStatusServer(t, tt.opts), http.MethodGet, "/api/status", "", nil)

			if got.status != http.StatusOK {
				t.Fatalf("response code: got %d, expected %d", got.status, http.StatusOK)
			}

			var body contract.Status
			got.decode(t, &body)

			if len(body.Runtime.Sources) != len(tt.sources) {
				t.Fatalf("sources %v, expected %v", body.Runtime.Sources, tt.sources)
			}

			for i, want := range tt.sources {
				if body.Runtime.Sources[i] != want {
					t.Errorf("source %d: got %q, expected %q", i, body.Runtime.Sources[i], want)
				}
			}

			if body.Runtime.Connections != tt.connections {
				t.Errorf("connections source %q, expected %q", body.Runtime.Connections, tt.connections)
			}
		})
	}
}

func TestStatusSourcesAreListEvenWhenEmpty(t *testing.T) {
	got := request(t, newStatusServer(t, httpapi.Options{}), http.MethodGet, "/api/status", "", nil)

	var body struct {
		Runtime struct {
			Sources []contract.RuntimeSource `json:"sources"`
		} `json:"runtime"`
	}
	got.decode(t, &body)

	if body.Runtime.Sources == nil {
		t.Error("the source list came as null, expected an empty array")
	}
}

// The stream refusal goes in the error format: the panel reads every failure by its code.
func TestEventsWithoutFlushAnswersWithCode(t *testing.T) {
	hub := events.New(nil, testLogger(t), events.Options{})
	server := httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{Events: hub})

	writer := &noFlushWriter{header: make(http.Header)}
	req := httptest.NewRequest(http.MethodGet, "/api/events", nil)
	req.Host = "192.168.1.1"
	server.ServeHTTP(writer, req)

	if writer.code != http.StatusInternalServerError {
		t.Fatalf("response code: got %d, expected %d", writer.code, http.StatusInternalServerError)
	}

	var body contract.Error
	if err := json.Unmarshal(writer.body.Bytes(), &body); err != nil {
		t.Fatalf("body %q is not the error envelope: %v", writer.body.String(), err)
	}
	if body.Code != contract.ErrInternal {
		t.Errorf("code: got %q, expected %q", body.Code, contract.ErrInternal)
	}
}

// A stream over its reader limit is refused with a code and a time to retry: the panel
// reopens it after a pause instead of a reconnect storm.
func TestEventsOverLimitAnswersWithCode(t *testing.T) {
	stream := refusingStream{err: events.ErrTooManySubscribers}
	server := httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{Events: stream})

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/events", nil)
	req.Host = "192.168.1.1"
	server.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("response code: got %d, expected %d", recorder.Code, http.StatusTooManyRequests)
	}
	if got := recorder.Header().Get("Retry-After"); got != events.RetryAfter {
		t.Errorf("Retry-After: got %q, expected %q", got, events.RetryAfter)
	}

	var body contract.Error
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("body %q is not the error envelope: %v", recorder.Body.String(), err)
	}
	if body.Code != contract.ErrEventStreamLimit {
		t.Errorf("code: got %q, expected %q", body.Code, contract.ErrEventStreamLimit)
	}
}

// noFlushWriter implements only http.ResponseWriter: embedding httptest.ResponseRecorder
// would promote its Flush.
type noFlushWriter struct {
	header http.Header
	body   bytes.Buffer
	code   int
}

func (w *noFlushWriter) Header() http.Header         { return w.header }
func (w *noFlushWriter) Write(b []byte) (int, error) { return w.body.Write(b) }
func (w *noFlushWriter) WriteHeader(code int)        { w.code = code }
