package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/httpapi"
)

func TestOutboundsUsesAppliedAndRuntimeInventory(t *testing.T) {
	store, _ := newOutboundsStore(t)
	registry, err := config.NewOutboundRegistry(t.Context(), store)
	if err != nil {
		t.Fatal(err)
	}
	for _, tag := range []string{"applied", "provider/edge", "gone"} {
		if err := registry.Set(t.Context(), tag, config.OutboundMetadata{Label: tag}); err != nil {
			t.Fatal(err)
		}
	}

	for _, unavailable := range []string{"", "configured", "runtime"} {
		t.Run("unavailable "+unavailable, func(t *testing.T) {
			srv := httpapi.NewServer(nil, nil, testLogger(t), httpapi.Options{
				Outbounds: registry,
				ConfiguredOutbounds: func(context.Context) (map[string]struct{}, error) {
					if unavailable == "configured" {
						return nil, errors.New("applied inventory unreadable")
					}

					return map[string]struct{}{"applied": {}}, nil
				},
				RuntimeOutbounds: func(context.Context) (map[string]string, error) {
					if unavailable == "runtime" {
						return nil, errors.New("runtime inventory unreadable")
					}

					return map[string]string{"provider/edge": "VLESS"}, nil
				},
			})

			got := outboundRequest(t, srv, http.MethodGet, "/api/outbounds", "")
			data := decodeOutbounds(t, got)
			if len(data) != 3 || data["applied"].Unused || data["provider/edge"].Unused ||
				data["gone"].Unused != (unavailable == "") {
				t.Errorf("outbound inventory projection: %+v", data)
			}
		})
	}
}

func TestOutboundsEditsEscapedTagsWithoutRequiringInventoryMembership(t *testing.T) {
	store, _ := newOutboundsStore(t)
	registry, err := config.NewOutboundRegistry(t.Context(), store)
	if err != nil {
		t.Fatal(err)
	}
	srv := httpapi.NewServer(nil, nil, testLogger(t), httpapi.Options{Outbounds: registry})
	for _, tag := range []string{"provider/edge", " provider/%2F "} {
		path := "/api/outbounds/" + url.PathEscape(tag)
		out := decodeOutbounds(t, outboundRequest(t, srv, http.MethodPut, path, `{"label":"Home","norm_ms":175}`))
		entry := out[tag]
		if entry.Label != "Home" || entry.NormMS == nil || *entry.NormMS != 175 || len(out) != 1 {
			t.Fatalf("saved tag %q: %+v", tag, out)
		}
		out = decodeOutbounds(t, outboundRequest(t, srv, http.MethodPut, path, `{"norm_ms":175}`))
		if out[tag].Label != "" || out[tag].NormMS == nil {
			t.Errorf("cleared label: %+v", out)
		}
		out = decodeOutbounds(t, outboundRequest(t, srv, http.MethodPut, path, `{"label":"","norm_ms":null}`))
		if len(out) != 0 {
			t.Errorf("cleared tag still appears: %+v", out)
		}
	}
}

func TestOutboundsRejectsMalformedOrOversizedEdits(t *testing.T) {
	store, _ := newOutboundsStore(t)
	registry, err := config.NewOutboundRegistry(t.Context(), store)
	if err != nil {
		t.Fatal(err)
	}
	srv := httpapi.NewServer(nil, nil, testLogger(t), httpapi.Options{Outbounds: registry})
	const path = "/api/outbounds/edge"
	decodeOutbounds(t, outboundRequest(t, srv, http.MethodPut, path, `{"label":"Before"}`))
	for _, tc := range []struct {
		body string
		want int
	}{
		{`null`, http.StatusBadRequest},
		{`{"norm_ms":1.5}`, http.StatusBadRequest},
		{`{"norm_ms":0}`, http.StatusBadRequest},
		{`{"typo":true}`, http.StatusBadRequest},
		{`{"label":"` + "\xff" + `"}`, http.StatusBadRequest},
		{`{}{}`, http.StatusBadRequest},
		{strings.Repeat(" ", 4096) + "{}", http.StatusRequestEntityTooLarge},
	} {
		rec := outboundRequest(t, srv, http.MethodPut, path, tc.body)
		if rec.Code != tc.want {
			t.Errorf("edit returned %d, want %d: %s", rec.Code, tc.want, rec.Body)
		}
	}
	if got := registry.Entries()["edge"].Label; got != "Before" {
		t.Errorf("label after rejected edits: %q", got)
	}
}

func TestBrokenOutboundMetadataDisablesEndpointsAndPreservesFile(t *testing.T) {
	for _, tc := range []struct {
		name    string
		corrupt string
	}{
		{"invalid JSON field type", `{"provider/edge":{"label":42}}`},
		{"invalid UTF-8", `{"provider/edge":{"label":"` + "\xff" + `"}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store, stateDir := newOutboundsStore(t)
			path := filepath.Join(stateDir, "outbounds.json")
			if err := os.WriteFile(path, []byte(tc.corrupt), 0o600); err != nil {
				t.Fatal(err)
			}
			registry, err := config.NewOutboundRegistry(t.Context(), store)
			if err == nil || registry != nil {
				t.Fatal("damaged file was loaded as writable metadata")
			}
			srv := httpapi.NewServer(nil, nil, testLogger(t), httpapi.Options{})
			for method, route := range map[string]string{"GET": "/api/outbounds", "PUT": "/api/outbounds/edge"} {
				if rec := outboundRequest(t, srv, method, route, `{"label":"replacement"}`); rec.Code != http.StatusNotFound {
					t.Errorf("disabled %s route: %d %s", method, rec.Code, rec.Body)
				}
			}
			after, err := os.ReadFile(path)
			if err != nil || string(after) != tc.corrupt {
				t.Errorf("damaged file changed: %s, %v", after, err)
			}
		})
	}
}

func outboundRequest(t *testing.T, srv http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), method, "http://localhost"+path, strings.NewReader(body))
	req.Header.Set("Origin", "http://localhost")
	srv.ServeHTTP(rec, req)

	return rec
}

func decodeOutbounds(t *testing.T, rec *httptest.ResponseRecorder) contract.Outbounds {
	t.Helper()

	if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("outbounds response: %d %v %s", rec.Code, rec.Header(), rec.Body)
	}
	var out contract.Outbounds
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || out == nil {
		t.Fatalf("outbounds map: %s, %v", rec.Body, err)
	}

	return out
}

func newOutboundsStore(t *testing.T) (*config.Store, string) {
	t.Helper()

	stateDir := t.TempDir()
	store, err := config.NewStore(filepath.Join(t.TempDir(), "sing-box"), "config.json", stateDir)
	if err != nil {
		t.Fatal(err)
	}

	return store, stateDir
}
