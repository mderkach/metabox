package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"metabox/internal/httpapi"
	"metabox/internal/route"
)

type fakeHits struct {
	hits route.Hits
	err  error
}

func (f fakeHits) Hits(context.Context) (route.Hits, error) {
	return f.hits, f.err
}

func newHitsServer(t *testing.T, hits httpapi.HitsReader) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{Version: "test", Hits: hits},
	))
	t.Cleanup(srv.Close)

	return srv
}

func TestRuleHits(t *testing.T) {
	srv := newHitsServer(t, fakeHits{hits: route.Hits{
		Seconds: 120,
		Rules:   []route.RuleHits{{Index: 0, Hits: 0}, {Index: 1, Hits: 7}},
		Final:   3,
	}})

	got := request(t, srv, http.MethodGet, "/api/rules/hits", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusOK)
	}

	var body route.Hits
	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatalf("parsing the response: %v", err)
	}
	if body.Seconds != 120 || len(body.Rules) != 2 || body.Rules[1].Hits != 7 || body.Final != 3 {
		t.Errorf("body %+v, expected a count for 120 s with 7 hits of the second rule", body)
	}
}

// A down sing-box is a source failure, not the panel's: the code is the same as for
// the route explanation.
func TestRuleHitsRuntimeUnavailable(t *testing.T) {
	srv := newHitsServer(t, fakeHits{err: fmt.Errorf("%w: список правил: %w", route.ErrRuntimeUnavailable, errors.New("connection refused"))})

	got := request(t, srv, http.MethodGet, "/api/rules/hits", "", nil)

	if got.status != http.StatusBadGateway {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusBadGateway)
	}

	var body struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatalf("parsing the response: %v", err)
	}
	if body.Code != "runtime_unavailable" {
		t.Errorf("rejection code: got %q, expected runtime_unavailable", body.Code)
	}
}
