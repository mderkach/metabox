package route

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

// fakeSource отдаёт заранее заданные ответы Clash API.
type fakeSource struct {
	bodies map[string]string
	err    error
	calls  []string
}

func (f *fakeSource) Snapshot(_ context.Context, path string) (json.RawMessage, error) {
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
		{"маршрут прерывает перебор", "route(proxy)", true},
		{"отказ прерывает перебор", "reject", true},
		{"отказ с методом прерывает перебор", "reject(drop)", true},
		{"перехват DNS прерывает перебор", "hijack-dns", true},
		{"bypass с outbound прерывает перебор", "bypass(direct)", true},
		{"bypass без outbound не прерывает", "bypass()", false},
		{"sniff не прерывает", "sniff", false},
		{"resolve не прерывает", "resolve(prefer_ipv4)", false},
		{"direct не прерывает", "direct", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := terminates(tt.action); got != tt.want {
				t.Errorf("действие %q: получили %v, ожидали %v", tt.action, got, tt.want)
			}
		})
	}
}

func TestMatchRuleFinal(t *testing.T) {
	match := matchRule("final", nil)

	if match.Kind != KindFinal {
		t.Errorf("вид совпадения: получили %q, ожидали %q", match.Kind, KindFinal)
	}
	if match.Origin != OriginObserved {
		t.Errorf("происхождение: получили %q, ожидали %q — отсутствие совпадения core сообщает прямо", match.Origin, OriginObserved)
	}
	if match.Index != nil {
		t.Error("у route.final нет узла в route.rules, индекс отдавать нельзя")
	}
}

// Пустое поле правила gRPC значит то же, что `final` у Clash API: подбирать
// по нему первое правило без условий нельзя.
func TestMatchRuleEmpty(t *testing.T) {
	rules := []Rule{{Origin: OriginObserved, Index: 0, Conditions: "", Action: "route(direct)"}}

	match := matchRule("", rules)

	if match.Kind != KindFinal {
		t.Errorf("вид совпадения: получили %q, ожидали %q", match.Kind, KindFinal)
	}
	if match.Index != nil {
		t.Error("индекс у выхода по умолчанию не отдаётся")
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
		{"действие сужает выбор из двух одинаковых условий", "rule_set=google-ip => route(proxy)", KindRule, 3},
		{"первое подходящее при совпавшем действии", "rule_set=google-ip => route(alt-fallback)", KindRule, 2},
		{"пустые условия без прерывающего правила остаются неизвестностью", " => hijack-dns", KindUnknown, 0},
		{"перехват DNS находится по условиям", "inbound=dns-in => hijack-dns", KindRule, 1},
		{"незнакомое правило остаётся неизвестным", "domain=example.org => route(proxy)", KindUnknown, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			match := matchRule(tt.rule, rules)

			if match.Kind != tt.kind {
				t.Fatalf("вид совпадения: получили %q, ожидали %q", match.Kind, tt.kind)
			}

			if tt.kind != KindRule {
				if match.Origin != OriginUnknown {
					t.Errorf("происхождение: получили %q, ожидали %q", match.Origin, OriginUnknown)
				}
				if match.Reason == "" {
					t.Error("неизвестность без причины на экран не уходит")
				}

				return
			}

			if match.Index == nil {
				t.Fatal("у найденного правила обязан быть индекс узла")
			}
			if *match.Index != tt.index {
				t.Errorf("индекс правила: получили %d, ожидали %d", *match.Index, tt.index)
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
		t.Errorf("правило с sniff перебор не прерывает, записанным становится следующее: получили %v", match.Index)
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

	explainer := NewExplainer(source)

	explanation, err := explainer.Explain(t.Context(), "c-1")
	if err != nil {
		t.Fatal(err)
	}

	if explanation.ConnectionID != "c-1" {
		t.Errorf("соединение: получили %q, ожидали %q", explanation.ConnectionID, "c-1")
	}
	if explanation.Match.Index == nil || *explanation.Match.Index != 3 {
		t.Errorf("индекс сработавшего правила: получили %v, ожидали 3", explanation.Match.Index)
	}
	if explanation.Chain.Origin != OriginObserved {
		t.Errorf("цепочка приходит от core: получили %q", explanation.Chain.Origin)
	}
	if len(explanation.Rules) != 5 {
		t.Errorf("правил в ответе: получили %d, ожидали 5 — панель сверяет длину с route.rules", len(explanation.Rules))
	}

	for _, rule := range explanation.Rules {
		if rule.Origin == "" {
			t.Fatalf("правило %d ушло без происхождения", rule.Index)
		}
	}
}

func TestExplainUnknownConnection(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       rulesBody,
		"/connections": `{"connections":[]}`,
	}}

	_, err := NewExplainer(source).Explain(t.Context(), "c-1")

	if !errors.Is(err, ErrNoConnection) {
		t.Errorf("получили %v, ожидали ErrNoConnection", err)
	}
}

// Молчащий рантайм — отказ источника, а не внутренняя ошибка демона: панель
// обязана отличать «данных нет» от «демон сломался».
func TestExplainRuntimeUnavailable(t *testing.T) {
	source := &fakeSource{err: errors.New("соединение отклонено")}

	_, err := NewExplainer(source).Explain(t.Context(), "c-1")

	if !errors.Is(err, ErrRuntimeUnavailable) {
		t.Errorf("получили %v, ожидали ErrRuntimeUnavailable", err)
	}
}

func TestExplainBrokenSnapshot(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{"/connections": `{`}}

	_, err := NewExplainer(source).Explain(t.Context(), "c-1")

	if err == nil {
		t.Fatal("неразобранный снапшот обязан стать ошибкой")
	}
	if errors.Is(err, ErrNoConnection) {
		t.Error("сломанный ответ core — не отсутствие соединения")
	}
}
