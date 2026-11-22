package clashapi

import (
	"encoding/json"
	"strconv"

	"metabox/internal/locale"
)

// ErrSubscriptionTagConflict means a provider shares a cache key with a rule set or endpoint.
var ErrSubscriptionTagConflict = locale.New("a subscription tag is already used by a rule set or endpoint")

type taggedEntry struct {
	Tag string `json:"tag"`
}

func (e taggedEntry) effectiveTag(index int) string {
	if e.Tag == "" {
		return strconv.Itoa(index)
	}

	return e.Tag
}

// CheckSubscriptionTags checks only the shared cache keys. The core reports
// malformed sections through its normal config check.
func CheckSubscriptionTags(data []byte) error {
	var cfg struct {
		Providers []taggedEntry `json:"providers"`
		Endpoints []taggedEntry `json:"endpoints"`
		Route     struct {
			RuleSets []taggedEntry `json:"rule_set"`
		} `json:"route"`
	}

	if err := json.Unmarshal(mask(data), &cfg); err != nil || len(cfg.Providers) == 0 {
		return nil
	}

	occupied := make(map[string]struct{}, len(cfg.Endpoints)+len(cfg.Route.RuleSets))
	for index, endpoint := range cfg.Endpoints {
		occupied[endpoint.effectiveTag(index)] = struct{}{}
	}
	for _, set := range cfg.Route.RuleSets {
		occupied[set.Tag] = struct{}{}
	}
	for index, subscription := range cfg.Providers {
		if _, exists := occupied[subscription.effectiveTag(index)]; exists {
			return ErrSubscriptionTagConflict
		}
	}

	return nil
}
