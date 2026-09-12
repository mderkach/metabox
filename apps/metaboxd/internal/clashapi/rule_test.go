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
		{"условия и действие", "rule_set=github => route(proxy)", "rule_set=github", "route(proxy)", true},
		{"правило без условий", " => route(direct)", "", "route(direct)", true},
		{"только условия: действие отдаёт не всякий источник", "domain=example.com", "domain=example.com", "", false},
		{"пустая строка", "", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conditions, action, hasAction := clashapi.SplitRule(tt.rule)

			if conditions != tt.wantConditions {
				t.Errorf("условия: получили %q, ожидали %q", conditions, tt.wantConditions)
			}
			if action != tt.wantAction {
				t.Errorf("действие: получили %q, ожидали %q", action, tt.wantAction)
			}
			if hasAction != tt.wantHasAction {
				t.Errorf("наличие действия: получили %v, ожидали %v", hasAction, tt.wantHasAction)
			}
		})
	}
}
