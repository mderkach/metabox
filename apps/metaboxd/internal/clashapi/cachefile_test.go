package clashapi_test

import (
	"bytes"
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
			if got != tt.want {
				t.Errorf("got %+v, expected %+v", got, tt.want)
			}
			if !bytes.Equal(data, original) {
				t.Error("reading changed the config bytes")
			}
		})
	}
}
