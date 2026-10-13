package clashapi_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"metabox/internal/clashapi"
)

func resolver(address, secret string) clashapi.Resolver {
	return func(context.Context) (clashapi.Settings, error) {
		return clashapi.Settings{Address: address, Secret: secret}, nil
	}
}

func TestProxyForwardsToController(t *testing.T) {
	tests := []struct {
		name     string
		request  string
		secret   string
		wantPath string
		wantAuth string
	}{
		{"prefix is stripped", clashapi.Prefix + "/rules", "", "/rules", ""},
		{"nested path", clashapi.Prefix + "/providers/proxies", "", "/providers/proxies", ""},
		{"the daemon sets the secret", clashapi.Prefix + "/version", "s3cret", "/version", "Bearer s3cret"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotPath, gotAuth string

			controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.Path
				gotAuth = r.Header.Get("Authorization")
				w.WriteHeader(http.StatusOK)
			}))
			defer controller.Close()

			proxy, err := clashapi.NewProxy(
				resolver(strings.TrimPrefix(controller.URL, "http://"), tt.secret),
				func(w http.ResponseWriter, _ *http.Request, _ error) { w.WriteHeader(http.StatusBadGateway) },
			)
			if err != nil {
				t.Fatalf("proxy build: %v", err)
			}

			rec := httptest.NewRecorder()
			proxy.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.request, nil))

			if rec.Code != http.StatusOK {
				t.Fatalf("response code: got %d, expected %d", rec.Code, http.StatusOK)
			}

			if gotPath != tt.wantPath {
				t.Errorf("controller path: got %q, expected %q", gotPath, tt.wantPath)
			}

			if gotAuth != tt.wantAuth {
				t.Errorf("authorization header: got %q, expected %q", gotAuth, tt.wantAuth)
			}
		})
	}
}

// A header that came from the browser must not reach the controller: the secret
// is set by the daemon and cannot be forged from a page.
func TestProxyDropsClientCredentials(t *testing.T) {
	var gotAuth, gotCookie string

	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotCookie = r.Header.Get("Cookie")
		w.WriteHeader(http.StatusOK)
	}))
	defer controller.Close()

	proxy, err := clashapi.NewProxy(
		resolver(strings.TrimPrefix(controller.URL, "http://"), ""),
		func(w http.ResponseWriter, _ *http.Request, _ error) { w.WriteHeader(http.StatusBadGateway) },
	)
	if err != nil {
		t.Fatalf("proxy build: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, clashapi.Prefix+"/version", nil)
	request.Header.Set("Authorization", "Bearer подделка")
	request.Header.Set("Cookie", "session=1")

	proxy.ServeHTTP(httptest.NewRecorder(), request)

	if gotAuth != "" {
		t.Errorf("client authorization reached the controller: %q", gotAuth)
	}

	if gotCookie != "" {
		t.Errorf("client cookie reached the controller: %q", gotCookie)
	}
}

// A controller with an unset access_control_allow_origin answers
// Access-Control-Allow-Origin: * to everything. These headers must not go outside:
// the proxy authorizes requests with the secret, and with them the /api/clash/* branch
// would be readable by any site in the user's browser.
func TestProxyStripsUpstreamCORS(t *testing.T) {
	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
		w.WriteHeader(http.StatusOK)
	}))
	defer controller.Close()

	proxy, err := clashapi.NewProxy(
		resolver(strings.TrimPrefix(controller.URL, "http://"), ""),
		func(w http.ResponseWriter, _ *http.Request, _ error) { w.WriteHeader(http.StatusBadGateway) },
	)
	if err != nil {
		t.Fatalf("proxy build: %v", err)
	}

	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, clashapi.Prefix+"/connections", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("response code: got %d, expected %d", rec.Code, http.StatusOK)
	}

	for name := range rec.Header() {
		if strings.HasPrefix(name, "Access-Control-") {
			t.Errorf("%s reached the client: %q", name, rec.Header().Get(name))
		}
	}
}

func TestProxyReportsUnreachableController(t *testing.T) {
	tests := []struct {
		name    string
		resolve clashapi.Resolver
	}{
		{
			"settings not read",
			func(context.Context) (clashapi.Settings, error) {
				return clashapi.Settings{}, errors.New("нет конфига")
			},
		},
		{
			"controller address empty",
			resolver("", ""),
		},
		{
			"controller does not answer",
			// Nobody listens on port 0: the connection is refused at once.
			resolver("127.0.0.1:0", ""),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			proxy, err := clashapi.NewProxy(tt.resolve, func(w http.ResponseWriter, _ *http.Request, _ error) {
				w.WriteHeader(http.StatusBadGateway)
			})
			if err != nil {
				t.Fatalf("proxy build: %v", err)
			}

			rec := httptest.NewRecorder()
			proxy.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, clashapi.Prefix+"/version", nil))

			if rec.Code != http.StatusBadGateway {
				t.Errorf("response code: got %d, expected %d", rec.Code, http.StatusBadGateway)
			}
		})
	}
}

// The stream is passed on as it arrives: buffering would turn per-second
// traffic samples into one batch.
func TestProxyStreamsWithoutBuffering(t *testing.T) {
	released := make(chan struct{})

	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "{\"up\":1}\n")
		w.(http.Flusher).Flush()
		<-released
	}))
	defer controller.Close()

	proxy, err := clashapi.NewProxy(
		resolver(strings.TrimPrefix(controller.URL, "http://"), ""),
		func(w http.ResponseWriter, _ *http.Request, _ error) { w.WriteHeader(http.StatusBadGateway) },
	)
	if err != nil {
		t.Fatalf("proxy build: %v", err)
	}

	front := httptest.NewServer(proxy)
	defer front.Close()

	response, err := http.Get(front.URL + clashapi.Prefix + "/traffic") //nolint:noctx // the deadline is set by the test t.Deadline
	if err != nil {
		t.Fatalf("stream request: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	buf := make([]byte, len("{\"up\":1}\n"))
	if _, err := io.ReadFull(response.Body, buf); err != nil {
		t.Fatalf("first sample did not arrive before the end of the response: %v", err)
	}

	close(released)

	if got := string(buf); got != "{\"up\":1}\n" {
		t.Errorf("first sample: got %q", got)
	}
}
