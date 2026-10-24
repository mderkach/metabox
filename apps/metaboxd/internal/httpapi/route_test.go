package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"metabox/internal/httpapi"
	"metabox/internal/route"
)

// fakeExplainer replaces the route explanation: rule matching is checked in
// internal/route, here the response codes and the fact that the origin reaches
// the client matter.
type fakeExplainer struct {
	explanation route.Explanation
	err         error
	calls       []string
}

func (f *fakeExplainer) Explain(_ context.Context, id string) (route.Explanation, error) {
	f.calls = append(f.calls, id)

	if f.err != nil {
		return route.Explanation{}, f.err
	}

	return f.explanation, nil
}

func newExplainServer(t *testing.T, explainer httpapi.Explainer) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{Version: "test", Explain: explainer},
	))
	t.Cleanup(srv.Close)

	return srv
}

func matchedExplanation() route.Explanation {
	index := 2

	return route.Explanation{
		ConnectionID: "c-1",
		Match: route.Match{
			Origin:     route.OriginObserved,
			Kind:       route.KindRule,
			Index:      &index,
			Conditions: "rule_set=google-ip",
			Action:     "route(proxy)",
		},
		Chain: route.Chain{Origin: route.OriginObserved, Nodes: []string{"hk-01", "proxy"}},
		Rules: []route.Rule{
			{Origin: route.OriginObserved, Index: 0, Conditions: "", Action: "sniff"},
			{Origin: route.OriginObserved, Index: 1, Conditions: "port=53", Action: "hijack-dns"},
			{Origin: route.OriginObserved, Index: 2, Conditions: "rule_set=google-ip", Action: "route(proxy)"},
		},
	}
}

func TestExplainRoute(t *testing.T) {
	explainer := &fakeExplainer{explanation: matchedExplanation()}
	srv := newExplainServer(t, explainer)

	got := request(t, srv, http.MethodGet, "/api/connections/c-1/route", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusOK)
	}
	if len(explainer.calls) != 1 || explainer.calls[0] != "c-1" {
		t.Errorf("connection identifier from the address: got %v", explainer.calls)
	}

	var body struct {
		ConnectionID string `json:"connection_id"`
		Match        struct {
			Origin string `json:"origin"`
			Kind   string `json:"kind"`
			Index  *int   `json:"index"`
		} `json:"match"`
		Chain struct {
			Origin string   `json:"origin"`
			Nodes  []string `json:"nodes"`
		} `json:"chain"`
		Rules []struct {
			Origin string `json:"origin"`
			Index  int    `json:"index"`
		} `json:"rules"`
	}

	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatalf("parsing the response: %v", err)
	}

	if body.Match.Index == nil || *body.Match.Index != 2 {
		t.Errorf("route.rules node index: got %v, expected 2", body.Match.Index)
	}

	// The handler does not return statements without an origin.
	if body.Match.Origin == "" {
		t.Error("the matched rule went out without an origin")
	}
	if body.Chain.Origin == "" {
		t.Error("the chain went out without an origin")
	}
	for _, rule := range body.Rules {
		if rule.Origin == "" {
			t.Errorf("rule %d went out without an origin", rule.Index)
		}
	}
}

func TestExplainRouteUnknown(t *testing.T) {
	srv := newExplainServer(t, &fakeExplainer{
		explanation: route.Explanation{
			ConnectionID: "c-1",
			Match:        route.Match{Origin: route.OriginUnknown, Kind: route.KindUnknown, Reason: "core исполняет другой конфиг"},
			Chain:        route.Chain{Origin: route.OriginObserved, Nodes: []string{"direct"}},
		},
	})

	got := request(t, srv, http.MethodGet, "/api/connections/c-1/route", "", nil)

	var body struct {
		Match struct {
			Origin string `json:"origin"`
			Kind   string `json:"kind"`
			Index  *int   `json:"index"`
			Reason string `json:"reason"`
		} `json:"match"`
	}

	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatalf("parsing the response: %v", err)
	}

	if body.Match.Index != nil {
		t.Error("an index into a foreign document must not be shown")
	}
	if body.Match.Origin != string(route.OriginUnknown) {
		t.Errorf("origin: got %q, expected %q", body.Match.Origin, route.OriginUnknown)
	}
	if body.Match.Reason == "" {
		t.Error("an unknown without a reason does not go outside")
	}
}

func TestExplainRouteMissingConnection(t *testing.T) {
	srv := newExplainServer(t, &fakeExplainer{err: route.ErrNoConnection})

	got := request(t, srv, http.MethodGet, "/api/connections/c-1/route", "", nil)

	if got.status != http.StatusNotFound {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusNotFound)
	}

	var body struct {
		Code string `json:"code"`
	}

	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatalf("parsing the response: %v", err)
	}
	if body.Code != "connection_missing" {
		t.Errorf("rejection code: got %q, expected %q", body.Code, "connection_missing")
	}
}

// A down sing-box answers with the same text as the Clash API proxy: the controller
// address and the transport error stay in the log.
func TestExplainRouteRuntimeUnavailable(t *testing.T) {
	const cause = `Get "http://127.0.0.1:9090/connections": dial tcp 127.0.0.1:9090: connect: connection refused`

	srv := newExplainServer(t, &fakeExplainer{
		err: fmt.Errorf("%w: connections: %w", route.ErrRuntimeUnavailable, errors.New(cause)),
	})

	got := request(t, srv, http.MethodGet, "/api/connections/c-1/route", "", nil)

	if got.status != http.StatusBadGateway {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusBadGateway)
	}

	var body struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}

	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatalf("parsing the response: %v", err)
	}
	if body.Code != "runtime_unavailable" {
		t.Errorf("rejection code: got %q, expected runtime_unavailable", body.Code)
	}
	if strings.Contains(body.Message, "connection refused") {
		t.Errorf("message %q carries the reason, expected a fixed text without it", body.Message)
	}
	if strings.Contains(got.body, "127.0.0.1") {
		t.Errorf("body %q carries the controller address outside", got.body)
	}
}

// Without a runtime source there is no explanation handler: the panel opens, and the
// connections screen stays without an explanation.
func TestExplainRouteAbsent(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{Version: "test"},
	))
	t.Cleanup(srv.Close)

	got := request(t, srv, http.MethodGet, "/api/connections/c-1/route", "", nil)

	if got.status != http.StatusNotFound {
		t.Errorf("response code: got %d, expected %d", got.status, http.StatusNotFound)
	}
}

// The upgrade to WebSocket on the proxy branch is closed: the runtime goes as a single stream
// `/api/events`, and there must be no second path to the same data.
func TestClashProxyRejectsUpgrade(t *testing.T) {
	var proxied int

	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{
			Version: "test",
			Clash: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				proxied++
				w.WriteHeader(http.StatusOK)
			}),
		},
	))
	t.Cleanup(srv.Close)

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, srv.URL+"/api/clash/traffic", nil)
	if err != nil {
		t.Fatalf("building the request: %v", err)
	}
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")

	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("response code: got %d, expected %d", resp.StatusCode, http.StatusBadRequest)
	}
	if proxied != 0 {
		t.Error("the upgrade went to the proxy but had to stop at the boundary")
	}
}

// An ordinary request to the same proxy handlers passes: rules, groups and a DNS query
// stay passthrough.
func TestClashProxyPassesRequests(t *testing.T) {
	var proxied int

	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{
			Version: "test",
			Clash: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				proxied++
				w.WriteHeader(http.StatusOK)
			}),
		},
	))
	t.Cleanup(srv.Close)

	got := request(t, srv, http.MethodGet, "/api/clash/rules", "", nil)

	if got.status != http.StatusOK || proxied != 1 {
		t.Errorf("a request-response must pass into the proxy: code %d, calls %d", got.status, proxied)
	}
}
