package route

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"
)

// RuleHits — срабатывания одного правила работающего процесса.
type RuleHits struct {
	Index int    `json:"index"`
	Hits  uint64 `json:"hits"`
	// Counted — видно ли правило в списке соединений вообще. Clash API пишет у
	// соединения только правило, на котором перебор остановился, и только
	// соединения, ушедшие в outbound: `sniff` и `resolve` не останавливают
	// перебор, перехваченный DNS и отклонённое соединение в список не попадают.
	// У таких правил ноль значил бы не «не срабатывало», а «не видно».
	Counted bool `json:"counted"`
}

// Hits — ответ ручки счётчика срабатываний.
//
// Счёт наблюдаемый, а не точный: соединение, которое открылось и закрылось
// между двумя снапшотами, core уже не покажет, и в счёт оно не попадёт.
type Hits struct {
	// Seconds — сколько идёт счёт. Он живёт в памяти демона и начинается с его
	// запуска: у роутера нет часов реального времени, поэтому отдаётся
	// длительность, а не момент начала.
	Seconds int64 `json:"seconds"`
	// Rules — по записи на каждое правило работающего процесса, в его порядке.
	// Длину панель сверяет с route.rules применённого документа, как и у
	// объяснения маршрута.
	Rules []RuleHits `json:"rules"`
	// Final — соединения, которые не совпали ни с одним правилом и ушли в
	// route.final.
	Final uint64 `json:"final"`
}

// Counter считает, сколько соединений пришлось на каждое правило, по снапшотам
// `/connections`.
//
// Работает всё время жизни демона, открыта панель или нет, — второе исключение
// из правила «фоновых опросов без потребителя нет» после учёта трафика:
// соединение, не замеченное вовремя, задним числом не восстанавливается.
// Цена в простое — один снапшот соединений в интервал и список правил, когда
// встретилось правило, которого в запомненном списке нет. Этот же снапшот
// через Snapshots читает поток рантайма: второго опроса `/connections` у
// демона нет.
//
// Счёт ведётся по условиям и действию правила, а не по номеру: после
// применения, которое переставило правила, счёт остаётся за своим правилом.
type Counter struct {
	source Source
	log    *slog.Logger
	opts   CounterOptions

	seen  map[string]struct{}
	rules []Rule

	mu      sync.Mutex
	started time.Time
	hits    map[string]uint64
	final   uint64

	stop context.CancelFunc
	done chan struct{}
}

// SizeRecorder принимает число живых соединений снимка. Снимок счётчик и так
// снимает раз в секунду, поэтому историю числа соединений ведёт он же, а не
// второй опрос.
type SizeRecorder interface {
	Record(count int)
}

// CounterOptions задаёт период опроса и потребителей снятого снапшота.
type CounterOptions struct {
	// Interval — период снапшота `/connections`.
	Interval time.Duration
	// Retry — пауза после неудачного снапшота, тот же смысл, что RetryInterval
	// у потока рантайма: при лежащем sing-box постоянные опросы демона ждут
	// одинаково. Ноль — Interval.
	Retry time.Duration
	// Sizes принимает число живых соединений каждого снимка; nil — не нужно.
	Sizes SizeRecorder
	// Snapshots принимает сырой снапшот каждого удачного опроса — так поток
	// рантайма получает соединения без собственного похода в Clash API.
	// nil — не нужно.
	Snapshots func(json.RawMessage)
}

// NewCounter собирает счётчик. Опроса он не начинает: его поднимает Start.
func NewCounter(source Source, log *slog.Logger, opts CounterOptions) *Counter {
	return &Counter{
		source: source,
		log:    log,
		opts:   opts,
		seen:   map[string]struct{}{},
		hits:   map[string]uint64{},
	}
}

// Start поднимает опрос на всё время работы демона.
func (c *Counter) Start() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.stop != nil {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	c.stop, c.done = cancel, make(chan struct{})
	c.started = time.Now()

	go func(done chan struct{}) {
		defer close(done)
		c.run(ctx)
	}(c.done)
}

// Close останавливает опрос и дожидается его.
func (c *Counter) Close() {
	c.mu.Lock()
	stop, done := c.stop, c.done
	c.stop, c.done = nil, nil
	c.mu.Unlock()

	if stop == nil {
		return
	}

	stop()
	<-done
}

func (c *Counter) run(ctx context.Context) {
	for {
		err := c.observe(ctx)
		if err != nil && ctx.Err() == nil {
			c.log.Debug("снапшот для счёта правил не снят", "err", err)
		}

		pause := c.opts.Interval
		if err != nil && c.opts.Retry > 0 {
			pause = c.opts.Retry
		}

		timer := time.NewTimer(pause)

		select {
		case <-ctx.Done():
			timer.Stop()

			return
		case <-timer.C:
		}
	}
}

// observe засчитывает соединения, которых не было в прошлом снапшоте.
func (c *Counter) observe(ctx context.Context) error {
	body, err := c.source.Snapshot(ctx, "/connections")
	if err != nil {
		return fmt.Errorf("соединения: %w", err)
	}

	var snapshot clashConnections
	if err := json.Unmarshal(body, &snapshot); err != nil {
		return fmt.Errorf("разбор снапшота соединений: %w", err)
	}

	if c.opts.Sizes != nil {
		c.opts.Sizes.Record(len(snapshot.Connections))
	}

	if c.opts.Snapshots != nil {
		c.opts.Snapshots(body)
	}

	// seen и rules трогает только горутина опроса, под мьютексом лежит лишь
	// то, что читает Hits.
	rules := c.rules
	current := make(map[string]struct{}, len(snapshot.Connections))
	var fresh []clashConnection

	for _, connection := range snapshot.Connections {
		current[connection.ID] = struct{}{}
		if _, ok := c.seen[connection.ID]; !ok {
			fresh = append(fresh, connection)
		}
	}

	matches := make([]Match, len(fresh))
	refreshed := false

	for i, connection := range fresh {
		matches[i] = matchRule(connection.Rule, rules)

		// Правило, которого нет в запомненном списке, значит, что процесс
		// перезапустился на другом конфиге. Список перечитывается один раз за
		// снапшот: соединение, не найденное и в свежем, так и останется неизвестным.
		if matches[i].Kind == KindUnknown && !refreshed {
			refreshed = true

			if next, err := readRules(ctx, c.source); err == nil {
				rules = next
				matches[i] = matchRule(connection.Rule, rules)
			}
		}
	}

	c.rules = rules
	c.seen = current

	c.mu.Lock()
	defer c.mu.Unlock()

	for _, match := range matches {
		switch match.Kind {
		case KindFinal:
			c.final++
		case KindRule:
			c.hits[hitKey(match.Conditions, match.Action)]++
		case KindUnknown:
		}
	}

	return nil
}

// Hits отдаёт счёт по правилам работающего процесса. Список правил читается
// заново: номер правила определяется тем, что загружено сейчас.
func (c *Counter) Hits(ctx context.Context) (Hits, error) {
	rules, err := readRules(ctx, c.source)
	if err != nil {
		return Hits{}, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	counted := map[string]bool{}
	out := Hits{
		Seconds: int64(time.Since(c.started) / time.Second),
		Rules:   make([]RuleHits, 0, len(rules)),
		Final:   c.final,
	}

	for _, rule := range rules {
		key := hitKey(rule.Conditions, rule.Action)
		hits := uint64(0)

		// Правило с теми же условиями и действием ниже по списку не
		// срабатывает никогда: роутер останавливается на первом.
		if !counted[key] {
			counted[key] = true
			hits = c.hits[key]
		}

		out.Rules = append(out.Rules, RuleHits{Index: rule.Index, Hits: hits, Counted: countable(rule.Action)})
	}

	return out, nil
}

// countable отвечает, может ли соединение с этим действием оказаться в списке
// соединений с этим правилом: только маршрут в outbound, `route(...)` или
// `bypass(...)` с outbound.
func countable(action string) bool {
	name, arguments, _ := strings.Cut(action, "(")

	switch name {
	case "route":
		return true
	case "bypass":
		return strings.TrimSuffix(arguments, ")") != ""
	default:
		return false
	}
}

func hitKey(conditions, action string) string {
	return conditions + "\x00" + action
}
