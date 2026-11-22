package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"maps"
	"net/http"
	"net/http/httptest"
	"testing"

	"metabox/internal/contract"
	"metabox/internal/httpapi"
	"metabox/internal/ruleset"
)

type fakeRuleSets struct {
	catalog ruleset.Catalog
}

func (f fakeRuleSets) Catalog() ruleset.Catalog {
	return f.catalog
}

func TestRuleSetsCatalog(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{
		Version: "test",
		RuleSets: fakeRuleSets{catalog: ruleset.Catalog{Providers: []ruleset.Provider{{
			ID:    "runetfreedom",
			Name:  "Runet Freedom",
			Lists: []ruleset.List{{Kind: ruleset.KindGeosite, Categories: []string{"ru-blocked"}, UpdatedAt: 42}},
		}}}},
	}))
	t.Cleanup(srv.Close)

	got := request(t, srv, http.MethodGet, "/api/rule-sets/catalog", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusOK)
	}

	var body ruleset.Catalog
	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatalf("parsing the response: %v", err)
	}

	if len(body.Providers) != 1 || body.Providers[0].Lists[0].UpdatedAt != 42 {
		t.Errorf("body %+v", body)
	}
}

func TestRuleSetsCatalogAbsent(t *testing.T) {
	srv := newTestServer(t, &fakeApplier{}, "")

	if got := request(t, srv, http.MethodGet, "/api/rule-sets/catalog", "", nil); got.status != http.StatusNotFound {
		t.Errorf("without a directory the handler answered %d, expected 404", got.status)
	}
}

type fakeCachedRuleSets struct {
	rows []contract.CachedRuleSet
	err  error
}

func (f fakeCachedRuleSets) Read(context.Context) ([]contract.CachedRuleSet, error) {
	return f.rows, f.err
}

func TestCachedRuleSets(t *testing.T) {
	checkedAt, size := int64(1_757_550_000), int64(0)
	reader := fakeCachedRuleSets{rows: []contract.CachedRuleSet{
		{Tag: "old-address", State: contract.CachedRuleSetStateCached, CheckedAt: &checkedAt, Size: &size, OtherAddress: true},
		{Tag: "new", State: contract.CachedRuleSetStateNotDownloaded},
	}}
	server := httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{CachedRuleSets: reader})
	w := httptest.NewRecorder()
	server.ServeHTTP(w, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "http://localhost/api/rule-sets/cached", nil))

	if w.Code != http.StatusOK || w.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("got status %d and Content-Type %q, want 200 and application/json", w.Code, w.Header().Get("Content-Type"))
	}

	var rows []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &rows); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d rows, want 2", len(rows))
	}
	want := []map[string]any{
		{"tag": "old-address", "state": "cached", "checked_at": float64(checkedAt), "size": float64(size), "other_address": true},
		{"tag": "new", "state": "not_downloaded", "other_address": false},
	}
	for i, row := range rows {
		if !maps.Equal(row, want[i]) {
			t.Errorf("row %d: got %v, want %v", i, row, want[i])
		}
	}
}

func TestCachedRuleSetsEmptyAndFailedReads(t *testing.T) {
	for _, tt := range []struct {
		name string
		err  error
		code int
	}{
		{name: "empty result is an array", code: http.StatusOK},
		{name: "read error is an internal failure", err: errors.New("read failure"), code: http.StatusInternalServerError},
	} {
		t.Run(tt.name, func(t *testing.T) {
			server := httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{
				CachedRuleSets: fakeCachedRuleSets{err: tt.err},
			})
			w := httptest.NewRecorder()
			server.ServeHTTP(w, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "http://localhost/api/rule-sets/cached", nil))
			if w.Code != tt.code {
				t.Fatalf("status: got %d, want %d", w.Code, tt.code)
			}
			if tt.err != nil {
				var body contract.Error
				if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Code != contract.ErrInternal {
					t.Errorf("got body %s, want internal error", w.Body.String())
				}

				return
			}

			var rows []contract.CachedRuleSet
			if err := json.Unmarshal(w.Body.Bytes(), &rows); err != nil || rows == nil || len(rows) != 0 {
				t.Errorf("got body %s, want an empty array", w.Body.String())
			}
		})
	}
}
