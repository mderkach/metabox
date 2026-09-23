package route

import (
	"io"
	"log/slog"
	"slices"
	"testing"
	"testing/synctest"
	"time"
)

func newTestCounter(source Source) *Counter {
	return NewCounter(source, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Second)
}

func hitsOf(t *testing.T, counter *Counter) []uint64 {
	t.Helper()

	hits, err := counter.Hits(t.Context())
	if err != nil {
		t.Fatalf("счёт: %v", err)
	}

	out := make([]uint64, 0, len(hits.Rules))
	for _, rule := range hits.Rules {
		out = append(out, rule.Hits)
	}

	return out
}

func TestCounterCountsEachConnectionOnce(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules": rulesBody,
		"/connections": `{"connections":[
			{"id":"a","rule":"rule_set=google-ip => route(proxy)"},
			{"id":"b","rule":"inbound=dns-in => hijack-dns"},
			{"id":"c","rule":"final"}
		]}`,
	}}
	counter := newTestCounter(source)

	for range 3 {
		if err := counter.observe(t.Context()); err != nil {
			t.Fatal(err)
		}
	}

	source.bodies["/connections"] = `{"connections":[
		{"id":"a","rule":"rule_set=google-ip => route(proxy)"},
		{"id":"d","rule":"rule_set=google-ip => route(proxy)"}
	]}`
	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	if got, want := hitsOf(t, counter), []uint64{0, 1, 0, 2, 0}; !slices.Equal(got, want) {
		t.Errorf("счёт %v, ожидали %v", got, want)
	}

	hits, err := counter.Hits(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if hits.Final != 1 {
		t.Errorf("в final %d, ожидали 1", hits.Final)
	}
}

// После применения, которое переставило правила, счёт остаётся за своим
// правилом, а не за номером.
func TestCounterFollowsRuleAfterReorder(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       rulesBody,
		"/connections": `{"connections":[{"id":"a","rule":"inbound=dns-in => hijack-dns"}]}`,
	}}
	counter := newTestCounter(source)

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	source.bodies["/rules"] = `{"rules":[
		{"type":"default","payload":"rule_set=google-ip","proxy":"route(proxy)"},
		{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"}
	]}`

	if got, want := hitsOf(t, counter), []uint64{0, 1}; !slices.Equal(got, want) {
		t.Errorf("счёт %v, ожидали %v", got, want)
	}
}

// Правило, которого нет в запомненном списке, значит новый конфиг процесса:
// список перечитывается, и соединение засчитывается его правилу.
func TestCounterRereadsRulesForUnknownRule(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       `{"rules":[{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"}]}`,
		"/connections": `{"connections":[{"id":"a","rule":"inbound=dns-in => hijack-dns"}]}`,
	}}
	counter := newTestCounter(source)

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	source.bodies["/rules"] = `{"rules":[
		{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"},
		{"type":"default","payload":"domain_suffix=example.org","proxy":"route(direct)"}
	]}`
	source.bodies["/connections"] = `{"connections":[{"id":"b","rule":"domain_suffix=example.org => route(direct)"}]}`

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	if got, want := hitsOf(t, counter), []uint64{1, 1}; !slices.Equal(got, want) {
		t.Errorf("счёт %v, ожидали %v", got, want)
	}
}

// Дубль правила ниже по списку не срабатывает никогда: роутер
// останавливается на первом совпадении.
func TestCounterGivesDuplicateNoHits(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules": `{"rules":[
			{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"},
			{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"}
		]}`,
		"/connections": `{"connections":[{"id":"a","rule":"inbound=dns-in => hijack-dns"}]}`,
	}}
	counter := newTestCounter(source)

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	if got, want := hitsOf(t, counter), []uint64{1, 0}; !slices.Equal(got, want) {
		t.Errorf("счёт %v, ожидали %v", got, want)
	}
}

func TestCounterReportsCountingWindow(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		source := &fakeSource{bodies: map[string]string{
			"/rules":       rulesBody,
			"/connections": `{"connections":[]}`,
		}}
		counter := newTestCounter(source)
		counter.Start()
		defer counter.Close()

		time.Sleep(90 * time.Second)
		synctest.Wait()

		hits, err := counter.Hits(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		if hits.Seconds != 90 {
			t.Errorf("счёт идёт %d с, ожидали 90", hits.Seconds)
		}
	})
}
