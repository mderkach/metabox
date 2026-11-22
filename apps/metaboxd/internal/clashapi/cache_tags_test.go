package clashapi_test

import (
	"errors"
	"testing"

	"metabox/internal/clashapi"
)

func TestCheckSubscriptionTags(t *testing.T) {
	for _, tt := range []struct {
		name     string
		config   string
		conflict bool
	}{
		{
			name: "rule set in JSONC",
			config: `{
				// Shared cache key
				"providers": [{"type":"remote","tag":"shared"},],
				"route":{"rule_set":[{"type":"remote","tag":"shared"},],},
			}`,
			conflict: true,
		},
		{
			name:     "endpoint",
			config:   `{"providers":[{"tag":"shared"}],"endpoints":[{"tag":"shared"}]}`,
			conflict: true,
		},
		{
			name:     "implicit provider tag",
			config:   `{"providers":[{"tag":"first"},{}],"route":{"rule_set":[{"tag":"1"}]}}`,
			conflict: true,
		},
		{
			name:     "implicit endpoint tag",
			config:   `{"providers":[{"tag":"1"}],"endpoints":[{"tag":"first"},{"tag":""}]}`,
			conflict: true,
		},
		{
			name:   "same URL, distinct tags",
			config: `{"providers":[{"tag":"first","url":"https://example.test/sub"},{"tag":"second","url":"https://example.test/sub"}]}`,
		},
		{
			name:   "literal case and unrelated outbounds",
			config: `{"providers":[{"tag":"shared"}],"outbounds":[{"tag":"shared"}],"endpoints":[{"tag":"Shared"}]}`,
		},
		{
			name:   "malformed section is left to the core",
			config: `{"providers":{},"route":{"rule_set":[{"tag":"1"}]}}`,
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := clashapi.CheckSubscriptionTags([]byte(tt.config))
			if tt.conflict && !errors.Is(err, clashapi.ErrSubscriptionTagConflict) {
				t.Fatalf("got %v, want a subscription tag conflict", err)
			}
			if !tt.conflict && err != nil {
				t.Fatalf("got %v, want no conflict", err)
			}
		})
	}
}
