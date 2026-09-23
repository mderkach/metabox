package route

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// RuleHits — срабатывания одного правила работающего процесса.
type RuleHits struct {
	Index int    `json:"index"`
	Hits  uint64 `json:"hits"`
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
	// объяснения маршрута (ADR-0007).
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
// встретилось правило, которого в запомненном списке нет.
//
// Счёт ведётся по условиям и действию правила, а не по номеру: после
// применения, которое переставило правила, счёт остаётся за своим правилом.
type Counter struct {
	source   Source
	log      *slog.Logger
	interval time.Duration

	seen  map[string]struct{}
	rules []Rule

	mu      sync.Mutex
	started time.Time
	hits    map[string]uint64
	final   uint64

	stop context.CancelFunc
	done chan struct{}
}

// NewCounter собирает счётчик. Опроса он не начинает: его поднимает Start.
func NewCounter(source Source, log *slog.Logger, interval time.Duration) *Counter {
	return &Counter{
		source:   source,
		log:      log,
		interval: interval,
		seen:     map[string]struct{}{},
		hits:     map[string]uint64{},
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
	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	for {
		if err := c.observe(ctx); err != nil && ctx.Err() == nil {
			c.log.Debug("снапшот для счёта правил не снят", "err", err)
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
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

		out.Rules = append(out.Rules, RuleHits{Index: rule.Index, Hits: hits})
	}

	return out, nil
}

func hitKey(conditions, action string) string {
	return conditions + "\x00" + action
}
