package route

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"metabox/internal/locale"
)

// fakeSource returns preset Clash API responses.
type fakeSource struct {
	// mu protects the fields from the counter polling goroutine: pacing tests read
	// the call count while the polling runs.
	mu     sync.Mutex
	bodies map[string]string
	err    error
	calls  []string
}

func (f *fakeSource) Snapshot(_ context.Context, path string) (json.RawMessage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.calls = append(f.calls, path)

	if f.err != nil {
		return nil, f.err
	}

	body, ok := f.bodies[path]
	if !ok {
		return nil, errors.New("нет ответа на " + path)
	}

	return json.RawMessage(body), nil
}

func (f *fakeSource) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()

	return len(f.calls)
}

func (f *fakeSource) setErr(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.err = err
}

const rulesBody = `{"rules":[
	{"type":"default","payload":"","proxy":"sniff"},
	{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"},
	{"type":"default","payload":"rule_set=google-ip","proxy":"route(alt-fallback)"},
	{"type":"default","payload":"rule_set=google-ip","proxy":"route(proxy)"},
	{"type":"logical","payload":"clash_mode=Direct","proxy":"route(direct)"}
]}`

func TestTerminates(t *testing.T) {
	tests := []struct {
		name   string
		action string
		want   bool
	}{
		{"route interrupts the iteration", "route(proxy)", true},
		{"reject interrupts the iteration", "reject", true},
		{"reject with a method interrupts the iteration", "reject(drop)", true},
		{"DNS hijack interrupts the iteration", "hijack-dns", true},
		{"bypass with an outbound interrupts the iteration", "bypass(direct)", true},
		{"bypass without an outbound does not interrupt", "bypass()", false},
		{"sniff does not interrupt", "sniff", false},
		{"resolve does not interrupt", "resolve(prefer_ipv4)", false},
		{"direct does not interrupt", "direct", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := terminates(tt.action); got != tt.want {
				t.Errorf("action %q: got %v, expected %v", tt.action, got, tt.want)
			}
		})
	}
}

func TestMatchRuleFinal(t *testing.T) {
	match := matchRule("final", nil)

	if match.Kind != KindFinal {
		t.Errorf("match kind: got %q, expected %q", match.Kind, KindFinal)
	}
	if match.Origin != OriginObserved {
		t.Errorf("origin: got %q, expected %q: the absence of a match is reported by core directly", match.Origin, OriginObserved)
	}
	if match.Index != nil {
		t.Error("route.final has no node in route.rules, the index must not be returned")
	}
}

// An empty gRPC rule field means the same as `final` in the Clash API: the first
// rule without conditions cannot be picked by it.
func TestMatchRuleEmpty(t *testing.T) {
	rules := []Rule{{Origin: OriginObserved, Index: 0, Conditions: "", Action: "route(direct)"}}

	match := matchRule("", rules)

	if match.Kind != KindFinal {
		t.Errorf("match kind: got %q, expected %q", match.Kind, KindFinal)
	}
	if match.Index != nil {
		t.Error("the index of the default outbound is not returned")
	}
}

func TestMatchRule(t *testing.T) {
	var list clashRules
	if err := json.Unmarshal([]byte(rulesBody), &list); err != nil {
		t.Fatal(err)
	}

	rules := make([]Rule, 0, len(list.Rules))
	for index, rule := range list.Rules {
		rules = append(rules, Rule{Origin: OriginObserved, Index: index, Conditions: rule.Payload, Action: rule.Proxy})
	}

	tests := []struct {
		name  string
		rule  string
		kind  Kind
		index int
	}{
		{"the action narrows the choice of two identical conditions", "rule_set=google-ip => route(proxy)", KindRule, 3},
		{"the first suitable one with a matching action", "rule_set=google-ip => route(alt-fallback)", KindRule, 2},
		{"empty conditions without an interrupting rule stay unknown", " => hijack-dns", KindUnknown, 0},
		{"DNS hijack is found by conditions", "inbound=dns-in => hijack-dns", KindRule, 1},
		{"an unfamiliar rule stays unknown", "domain=example.org => route(proxy)", KindUnknown, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			match := matchRule(tt.rule, rules)

			if match.Kind != tt.kind {
				t.Fatalf("match kind: got %q, expected %q", match.Kind, tt.kind)
			}

			if tt.kind != KindRule {
				if match.Origin != OriginUnknown {
					t.Errorf("origin: got %q, expected %q", match.Origin, OriginUnknown)
				}
				if match.Reason == "" {
					t.Error("an unknown without a reason does not go on screen")
				}

				return
			}

			if match.Index == nil {
				t.Fatal("a found rule must have a node index")
			}
			if *match.Index != tt.index {
				t.Errorf("rule index: got %d, expected %d", *match.Index, tt.index)
			}
		})
	}
}

func TestMatchRuleSkipsNonTerminating(t *testing.T) {
	rules := []Rule{
		{Origin: OriginObserved, Index: 0, Conditions: "domain=example.com", Action: "sniff"},
		{Origin: OriginObserved, Index: 1, Conditions: "domain=example.com", Action: "route(proxy)"},
	}

	match := matchRule("domain=example.com", rules)

	if match.Index == nil || *match.Index != 1 {
		t.Errorf("a rule with sniff does not break the iteration, the recorded one becomes the next: got %v", match.Index)
	}
}

func TestExplain(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules": rulesBody,
		"/connections": `{"connections":[
			{"id":"c-1","rule":"rule_set=google-ip => route(proxy)","chains":["hk-01","proxy"]},
			{"id":"c-2","rule":"final","chains":["direct"]}
		]}`,
	}}

	explainer := NewExplainer(source, locale.English)

	explanation, err := explainer.Explain(t.Context(), "c-1")
	if err != nil {
		t.Fatal(err)
	}

	if explanation.ConnectionID != "c-1" {
		t.Errorf("connection: got %q, expected %q", explanation.ConnectionID, "c-1")
	}
	if explanation.Match.Index == nil || *explanation.Match.Index != 3 {
		t.Errorf("index of the matched rule: got %v, expected 3", explanation.Match.Index)
	}
	if explanation.Chain.Origin != OriginObserved {
		t.Errorf("the chain comes from core: got %q", explanation.Chain.Origin)
	}
	if len(explanation.Rules) != 5 {
		t.Errorf("rules in the response: got %d, expected 5: the panel compares the length with route.rules", len(explanation.Rules))
	}

	for _, rule := range explanation.Rules {
		if rule.Origin == "" {
			t.Fatalf("rule %d went out without an origin", rule.Index)
		}
	}
}

func TestExplainReasonFollowsLang(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       rulesBody,
		"/connections": `{"connections":[{"id":"c-1","rule":"domain=gone.example => route(proxy)","chains":["proxy"]}]}`,
	}}

	tests := []struct {
		lang locale.Lang
		want string
	}{
		{locale.English, "the connection rule is not in the rule list of the running process"},
		{locale.Russian, "правила соединения нет в списке правил работающего процесса"},
	}

	for _, tt := range tests {
		explanation, err := NewExplainer(source, tt.lang).Explain(t.Context(), "c-1")
		if err != nil {
			t.Fatal(err)
		}

		if got := explanation.Match; got.ReasonCode != ReasonNotInProcessList || got.Reason != tt.want {
			t.Errorf("%s: got %q %q, want %q %q", tt.lang, got.ReasonCode, got.Reason, ReasonNotInProcessList, tt.want)
		}
	}
}

func TestExplainUnknownConnection(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       rulesBody,
		"/connections": `{"connections":[]}`,
	}}

	_, err := NewExplainer(source, locale.English).Explain(t.Context(), "c-1")

	if !errors.Is(err, ErrNoConnection) {
		t.Errorf("got %v, expected ErrNoConnection", err)
	}
}

// A silent runtime is a source failure, not an internal daemon error: the panel
// must tell "no data" from "the daemon is broken".
func TestExplainRuntimeUnavailable(t *testing.T) {
	source := &fakeSource{err: errors.New("соединение отклонено")}

	_, err := NewExplainer(source, locale.English).Explain(t.Context(), "c-1")

	if !errors.Is(err, ErrRuntimeUnavailable) {
		t.Errorf("got %v, expected ErrRuntimeUnavailable", err)
	}
}

func TestExplainBrokenSnapshot(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{"/connections": `{`}}

	_, err := NewExplainer(source, locale.English).Explain(t.Context(), "c-1")

	if err == nil {
		t.Fatal("an unparsed snapshot must become an error")
	}
	if errors.Is(err, ErrNoConnection) {
		t.Error("a broken core response is not an absent connection")
	}
}
