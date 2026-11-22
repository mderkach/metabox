package clashapi_test

import (
	"bytes"
	"slices"
	"testing"

	"metabox/internal/clashapi"
)

func TestReadCacheFile(t *testing.T) {
	tests := []struct {
		name   string
		config string
		want   clashapi.CacheFile
	}{
		{
			"subscriptions kept under a cache id",
			`{"experimental": {"cache_file": {"enabled": true, "path": "/tmp/box.db", "cache_id": "router", "store_subscriptions": true}}}`,
			clashapi.CacheFile{Enabled: true, StoreSubscriptions: true, Path: "/tmp/box.db", CacheID: "router"},
		},
		{
			"default path in a config with a comment",
			"{\n// кеш\n\"experimental\": {\"cache_file\": {\"enabled\": true,},},}",
			clashapi.CacheFile{Enabled: true, Path: "cache.db"},
		},
		{
			"remote rule sets in JSONC with other kinds interleaved",
			`{
				"experimental": {
					"cache_file": {"enabled": true, "cache_id": "router",},
				},
				"route": {
					// Match only remote sets, preserving the full configured address.
					"rule_set": [
						{"type": "remote", "tag": "geo", "url": "https://example.test/catalog/geo.srs?revision=1", "format": "binary",},
						{"type": "local", "tag": "allow", "path": "allow.json"},
						{"type": "inline", "tag": "deny", "rules": [{"domain_suffix": ["example.test"]}]},
						{"type": "remote", "tag": "source", "url": "https://example.test/catalog/source.json"},
					],
				},
			}`,
			clashapi.CacheFile{
				Enabled: true,
				Path:    "cache.db",
				CacheID: "router",
				RemoteRuleSets: []clashapi.RemoteRuleSet{
					{Tag: "geo", URL: "https://example.test/catalog/geo.srs?revision=1"},
					{Tag: "source", URL: "https://example.test/catalog/source.json"},
				},
			},
		},
		{"no section", `{}`, clashapi.CacheFile{Path: "cache.db"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data := []byte(tt.config)
			original := bytes.Clone(data)

			got, err := clashapi.ReadCacheFile(data)
			if err != nil {
				t.Fatalf("reading: %v", err)
			}
			if got.Enabled != tt.want.Enabled || got.StoreSubscriptions != tt.want.StoreSubscriptions ||
				got.Path != tt.want.Path || got.CacheID != tt.want.CacheID ||
				!slices.Equal(got.RemoteRuleSets, tt.want.RemoteRuleSets) {
				t.Errorf("got %+v, expected %+v", got, tt.want)
			}
			if !bytes.Equal(data, original) {
				t.Error("reading changed the config bytes")
			}
		})
	}
}
