package route

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"testing/synctest"
	"time"
)

func newTestCounter(source Source) *Counter {
	return NewCounter(source, discardLogger(), CounterOptions{Interval: time.Second})
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
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

// Clash API не показывает соединения по правилам, которые не завершают перебор
// или не уводят трафик в outbound: ноль у них значил бы «не видно», а не «не
// срабатывало».
func TestCounterMarksUnobservableRules(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules": `{"rules":[
			{"type":"default","payload":"","proxy":"sniff"},
			{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"},
			{"type":"default","payload":"rule_set=ads","proxy":"reject"},
			{"type":"default","payload":"rule_set=google-ip","proxy":"route(proxy)"},
			{"type":"default","payload":"ip_is_private=true","proxy":"bypass(direct)"}
		]}`,
		"/connections": `{"connections":[]}`,
	}}

	hits, err := newTestCounter(source).Hits(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	got := make([]bool, 0, len(hits.Rules))
	for _, rule := range hits.Rules {
		got = append(got, rule.Counted)
	}

	if want := []bool{false, false, false, true, true}; !slices.Equal(got, want) {
		t.Errorf("видимость правил %v, ожидали %v", got, want)
	}
}

type sizes []int

func (s *sizes) Record(count int) { *s = append(*s, count) }

func TestCounterRecordsSnapshotSize(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       rulesBody,
		"/connections": `{"connections":[{"id":"a","rule":"final"},{"id":"b","rule":"final"}]}`,
	}}
	recorded := &sizes{}
	counter := NewCounter(source, discardLogger(), CounterOptions{Interval: time.Second, Sizes: recorded})

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	if !slices.Equal(*recorded, []int{2}) {
		t.Errorf("число соединений снимков %v, ожидали [2]", *recorded)
	}
}

// Поток рантайма читает соединения из снапшота счётчика: сырое тело уходит в
// Snapshots на каждый удачный опрос и не уходит на неудачный.
func TestCounterFeedsSnapshotSink(t *testing.T) {
	const body = `{"connections":[{"id":"a","rule":"final"}]}`

	source := &fakeSource{bodies: map[string]string{"/rules": rulesBody, "/connections": body}}

	var got []string

	counter := NewCounter(source, discardLogger(), CounterOptions{
		Interval:  time.Second,
		Snapshots: func(raw json.RawMessage) { got = append(got, string(raw)) },
	})

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	source.setErr(errors.New("sing-box лежит"))

	if err := counter.observe(t.Context()); err == nil {
		t.Fatal("опрос лежащего источника прошёл")
	}

	if len(got) != 1 || got[0] != body {
		t.Errorf("в поток ушло %d снапшотов (%v), ожидали один исходный", len(got), got)
	}
}

// При лежащем sing-box счётчик ждёт паузу ретрая, а не стучится каждый
// интервал: постоянные опросы демона ведут себя одинаково.
func TestCounterWaitsRetryAfterFailure(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		source := &fakeSource{}
		counter := NewCounter(source, discardLogger(), CounterOptions{
			Interval: time.Second,
			Retry:    3 * time.Second,
		})

		counter.Start()
		defer counter.Close()

		// Опросы на 0, 3, 6 и 9 секундах: следующего в 9.5 ещё нет.
		time.Sleep(9*time.Second + 500*time.Millisecond)
		synctest.Wait()

		if got := source.callCount(); got != 4 {
			t.Errorf("опросов %d, ожидали 4", got)
		}
	})
}

// Бенчмарк держит потолок NFR-2: пять тысяч живых соединений, цена одного
// опроса счётчика в установившемся режиме — все соединения уже засчитаны.
func BenchmarkCounterObserve5000(b *testing.B) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       rulesBody,
		"/connections": connectionsBody(5000),
	}}
	counter := NewCounter(source, discardLogger(), CounterOptions{Interval: time.Second})

	if err := counter.observe(b.Context()); err != nil {
		b.Fatal(err)
	}

	b.ReportAllocs()

	for b.Loop() {
		if err := counter.observe(b.Context()); err != nil {
			b.Fatal(err)
		}
	}
}

func connectionsBody(count int) string {
	var sb strings.Builder

	sb.WriteString(`{"connections":[`)

	for i := range count {
		if i > 0 {
			sb.WriteByte(',')
		}

		fmt.Fprintf(&sb, `{"id":"c-%d","rule":"rule_set=google-ip => route(proxy)"}`, i)
	}

	sb.WriteString(`]}`)

	return sb.String()
}
