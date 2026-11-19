package clashapi

import (
	"encoding/json"
	"fmt"
)

// CacheFile is what the daemon needs from experimental.cache_file to find a cached
// subscription: the fork keeps them only with the section enabled and store_subscriptions on.
type CacheFile struct {
	Enabled            bool
	StoreSubscriptions bool
	// Path is the file as written in the config, relative to the working directory of the
	// service; the fork's default cache.db when the config names none.
	Path string
	// CacheID selects the bucket the core reads; empty means the top level.
	CacheID string
}

// ReadCacheFile extracts the cache file settings. The config is not changed.
func ReadCacheFile(data []byte) (CacheFile, error) {
	var cfg struct {
		Experimental struct {
			CacheFile struct {
				Enabled            bool   `json:"enabled"`
				Path               string `json:"path"`
				CacheID            string `json:"cache_id"`
				StoreSubscriptions bool   `json:"store_subscriptions"`
			} `json:"cache_file"`
		} `json:"experimental"`
	}

	if err := json.Unmarshal(mask(data), &cfg); err != nil {
		return CacheFile{}, fmt.Errorf("read cache_file: %w", err)
	}

	section := cfg.Experimental.CacheFile

	path := section.Path
	if path == "" {
		path = "cache.db"
	}

	return CacheFile{
		Enabled:            section.Enabled,
		StoreSubscriptions: section.StoreSubscriptions,
		Path:               path,
		CacheID:            section.CacheID,
	}, nil
}
