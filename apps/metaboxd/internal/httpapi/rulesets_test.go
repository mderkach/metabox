package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

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
