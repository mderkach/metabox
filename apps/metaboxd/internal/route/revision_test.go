package route

import (
	"context"
	"strconv"
	"testing"

	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/locale"
	"metabox/internal/singbox"
)

type revisionFixture struct {
	data []byte
	sum  string
}

func (r revisionFixture) Read(context.Context) ([]byte, error) { return r.data, nil }
func (r revisionFixture) Sum(context.Context) (string, error) {
	if r.sum != "" {
		return r.sum, nil
	}

	return config.Sum(r.data), nil
}

const namedRules = `{
  "experimental":{"clash_api":{"external_controller":"127.0.0.1:9090"}},
  "route":{"rules":[
    // Media
    {"domain":"media.example","outbound":"proxy"},
    {"domain":"local.example","outbound":"direct"}
  ]}
}`

const reorderedRules = `{
  "experimental":{"clash_api":{"external_controller":"127.0.0.1:9090"}},
  "route":{"rules":[
    {"domain":"local.example","outbound":"direct"},
    // Media
    {"domain":"media.example","outbound":"proxy"}
  ]}
}`

const observedRules = `{"rules":[
  {"type":"default","payload":"domain=media.example","proxy":"route(proxy)"},
  {"type":"default","payload":"domain=local.example","proxy":"route(direct)"}
]}`

const duplicateRules = `{"rules":[
  {"type":"default","payload":"domain=media.example","proxy":"route(proxy)"},
  {"type":"default","payload":"domain=media.example","proxy":"route(proxy)"}
]}`

func TestRuleReferenceRequiresLoadedRevisionAndUniquePosition(t *testing.T) {
	loaded := config.Sum([]byte(namedRules))
	cases := []struct {
		name        string
		config      string
		postSum     string
		rules       string
		listeners   []string
		switchPID   bool
		wantApplied bool
	}{
		{"same revision and unique position", namedRules, "", observedRules, []string{"100", "100"}, false, true},
		{"same length reordered on disk", reorderedRules, "", observedRules, []string{"100", "100"}, false, false},
		{"same revision but ambiguous position", namedRules, "", duplicateRules, []string{"100", "100"}, false, false},
		{"disk changed while reading runtime", namedRules, config.Sum([]byte(reorderedRules)), observedRules, []string{"100", "100"}, false, false},
		{"managed process restarted", namedRules, "", observedRules, []string{"100", "100"}, true, false},
		{"controller listener changed", namedRules, "", observedRules, []string{"100", "101"}, false, false},
		{"listener ownership missing", namedRules, "", observedRules, []string{"", ""}, false, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			source := &fakeSource{bodies: map[string]string{
				"/connections": `{"connections":[{"id":"c-1","rule":"domain=media.example => route(proxy)"}]}`,
				"/rules":       tc.rules,
			}}
			newExplainer := func() *Explainer {
				pid := 41
				index := 0
				verifier := NewRuleVerifier(
					revisionFixture{data: []byte(tc.config), sum: tc.postSum},
					func(context.Context) (singbox.RevisionIdentity, error) {
						identity := singbox.RevisionIdentity{PID: pid, Start: 9, SHA256: loaded}
						if tc.switchPID {
							pid++
						}

						return identity, nil
					},
					func(_ context.Context, _, port int) string {
						if port != 9090 {
							t.Errorf("listener port: got %d, want 9090", port)
						}
						listener := tc.listeners[index]
						index++

						return listener
					},
					func(clashapi.Settings) (Source, error) { return source, nil },
				)

				return NewExplainer(source, locale.English).WithRuleVerification(verifier)
			}

			explanation, err := newExplainer().Explain(t.Context(), "c-1")
			if err != nil {
				t.Fatal(err)
			}
			match := explanation.Match
			if match.Conditions != "domain=media.example" || match.Action != "route(proxy)" {
				t.Errorf("lost observed condition or action: %+v", match)
			}
			if tc.wantApplied {
				if match.AppliedRule == nil || match.AppliedRule.Index != 0 || match.AppliedRule.ETag != strconv.Quote(loaded) {
					t.Errorf("confirmed reference: %+v", match.AppliedRule)
				}
			} else if match.AppliedRule != nil {
				t.Errorf("unconfirmed reference: %+v", match.AppliedRule)
			}

			raw, names, err := newExplainer().ConnectionsWithRuleNames(t.Context())
			if err != nil || len(raw) == 0 {
				t.Fatalf("live snapshot: %q %v", raw, err)
			}
			if name := names["c-1"]; (name == "Media") != tc.wantApplied || (!tc.wantApplied && name != "") {
				t.Errorf("verified name %q, want confirmed=%t", name, tc.wantApplied)
			}
		})
	}
}
