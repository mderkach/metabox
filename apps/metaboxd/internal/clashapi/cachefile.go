package clashapi

import (
	"encoding/json"
	"fmt"
)

// CacheFile locates the core's cache and identifies the remote rule sets of the applied config.
type CacheFile struct {
	Enabled            bool
	StoreSubscriptions bool
	// Path is the file as written in the config, relative to the working directory of the
	// service; the fork's default cache.db when the config names none.
	Path string
	// CacheID selects the bucket the core reads; empty means the top level.
	CacheID string

	RemoteRuleSets []RemoteRuleSet
}

// RemoteRuleSet is a cache lookup by tag. URL is the configured download address,
// kept verbatim for comparison with the address hash in the cached entry.
type RemoteRuleSet struct {
	Tag string
	URL string
}

// ReadCacheFile projects cache settings and remote rule sets without changing the config.
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
		Route struct {
			RuleSets []struct {
				Type string `json:"type"`
				Tag  string `json:"tag"`
				URL  string `json:"url"`
			} `json:"rule_set"`
		} `json:"route"`
	}

	if err := json.Unmarshal(mask(data), &cfg); err != nil {
		return CacheFile{}, fmt.Errorf("read cache_file: %w", err)
	}

	section := cfg.Experimental.CacheFile

	path := section.Path
	if path == "" {
		path = "cache.db"
	}

	var remote []RemoteRuleSet
	for _, entry := range cfg.Route.RuleSets {
		if entry.Type == "remote" {
			remote = append(remote, RemoteRuleSet{Tag: entry.Tag, URL: entry.URL})
		}
	}

	return CacheFile{
		Enabled:            section.Enabled,
		StoreSubscriptions: section.StoreSubscriptions,
		Path:               path,
		CacheID:            section.CacheID,
		RemoteRuleSets:     remote,
	}, nil
}
