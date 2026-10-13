package clashapi_test

import (
	"testing"

	"metabox/internal/clashapi"
)

func TestSplitRule(t *testing.T) {
	tests := []struct {
		name           string
		rule           string
		wantConditions string
		wantAction     string
		wantHasAction  bool
	}{
		{"conditions and action", "rule_set=github => route(proxy)", "rule_set=github", "route(proxy)", true},
		{"rule without conditions", " => route(direct)", "", "route(direct)", true},
		{"conditions only: not every source returns the action", "domain=example.com", "domain=example.com", "", false},
		{"empty string", "", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conditions, action, hasAction := clashapi.SplitRule(tt.rule)

			if conditions != tt.wantConditions {
				t.Errorf("conditions: got %q, expected %q", conditions, tt.wantConditions)
			}
			if action != tt.wantAction {
				t.Errorf("action: got %q, expected %q", action, tt.wantAction)
			}
			if hasAction != tt.wantHasAction {
				t.Errorf("action presence: got %v, expected %v", hasAction, tt.wantHasAction)
			}
		})
	}
}
