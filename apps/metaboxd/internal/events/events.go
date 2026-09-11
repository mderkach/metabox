// Package events сводит рантайм-данные в один поток к панели.
//
// Источники у форка разные — посекундные строки `/traffic` и `/memory`,
// снапшот `/connections`, опрос службы, — а панель получает один конверт и не
// знает, какой источник сработал (ADR-0006). Транспорт наружу — SSE: сервера
// WebSocket в стандартной библиотеке нет, а зависимость в демоне требует
// отдельного решения.
package events

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// Топики потока. Панель подписывается на все сразу: отдельная подписка на
// каждый вернула бы нас к нескольким соединениям.
const (
	TopicTraffic     = "traffic"
	TopicMemory      = "memory"
	TopicConnections = "connections"
	TopicService     = "service"
)

// Event — конверт. Seq растёт сквозным счётчиком: по разрыву в номерах панель
// видит, что пропустила сообщения, и перезапрашивает состояние.
type Event struct {
	Topic string          `json:"topic"`
	Seq   uint64          `json:"seq"`
	Data  json.RawMessage `json:"data"`
}

// Source — то, откуда Hub берёт данные. Интерфейс объявлен здесь, у
// потребителя: сам Hub не знает ни про Clash API, ни про init-скрипт.
type Source interface {
	// Stream читает построчный поток и отдаёт каждую строку в sink. Возврат
	// без ошибки означает, что поток закончился штатно.
	Stream(ctx context.Context, path string, sink func(json.RawMessage)) error
	// Snapshot читает разовый ответ.
	Snapshot(ctx context.Context, path string) (json.RawMessage, error)
	// ServiceState отдаёт состояние службы в том же виде, что и ручка.
	ServiceState(ctx context.Context) (json.RawMessage, error)
}

// Options задаёт периоды опроса тех источников, которые сами ничего не шлют.
type Options struct {
	// ConnectionsInterval — период снапшота соединений. Clash API отдаёт их
	// только целиком, поэтому частота здесь напрямую превращается в трафик
	// между sing-box и демоном (NFR-2).
	ConnectionsInterval time.Duration
	// ServiceInterval — период опроса службы. Он дороже остальных: это запуск
	// внешних процессов, поэтому реже.
	ServiceInterval time.Duration
	// RetryInterval — пауза перед повторной попыткой после обрыва источника.
	RetryInterval time.Duration
}

// Hub держит один набор подписок на источники, пока есть хоть один читатель,
// и раздаёт события всем сразу. Второй читатель не удваивает нагрузку на
// sing-box: апстрим остаётся один.
type Hub struct {
	source Source
	log    *slog.Logger
	opts   Options

	mu          sync.Mutex
	subscribers map[chan Event]struct{}
	seq         uint64
	// last хранит последнее событие каждого топика: подключившийся читатель
	// получает текущее состояние сразу, а не через период опроса.
	last map[string]Event
	stop context.CancelFunc
	done chan struct{}
}

// New собирает Hub. Опросов он не начинает: фоновый опрос без потребителя на
// устройстве, которое месяцами простаивает, — это расход батареи процессора
// впустую (DeviceIO).
func New(source Source, log *slog.Logger, opts Options) *Hub {
	return &Hub{
		source:      source,
		log:         log,
		opts:        opts,
		subscribers: make(map[chan Event]struct{}),
		last:        make(map[string]Event),
	}
}

// subscribe добавляет читателя и поднимает источники, если он первый. Вторым
// значением возвращается снимок последних событий по каждому топику.
func (h *Hub) subscribe() (chan Event, []Event, func()) {
	// Буфер на топик с запасом: медленный читатель не должен блокировать
	// рассылку остальным.
	const buffer = 16

	ch := make(chan Event, buffer)

	h.mu.Lock()
	h.subscribers[ch] = struct{}{}

	recent := make([]Event, 0, len(h.last))
	for _, event := range h.last {
		recent = append(recent, event)
	}

	if len(h.subscribers) == 1 {
		h.start()
	}
	h.mu.Unlock()

	return ch, recent, func() { h.unsubscribe(ch) }
}

func (h *Hub) unsubscribe(ch chan Event) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.subscribers[ch]; !ok {
		return
	}

	delete(h.subscribers, ch)
	close(ch)

	if len(h.subscribers) == 0 {
		h.stopLocked()
	}
}

// start поднимает опрос источников. Вызывается под h.mu.
func (h *Hub) start() {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	h.stop = cancel
	h.done = done

	var wg sync.WaitGroup

	streams := []struct {
		topic string
		path  string
	}{
		{TopicTraffic, "/traffic"},
		{TopicMemory, "/memory"},
	}

	for _, s := range streams {
		wg.Add(1)

		go func() {
			defer wg.Done()
			h.runStream(ctx, s.topic, s.path)
		}()
	}

	wg.Add(1)

	go func() {
		defer wg.Done()
		h.runPoll(ctx, TopicConnections, h.opts.ConnectionsInterval, func(ctx context.Context) (json.RawMessage, error) {
			return h.source.Snapshot(ctx, "/connections")
		})
	}()

	wg.Add(1)

	go func() {
		defer wg.Done()
		h.runPoll(ctx, TopicService, h.opts.ServiceInterval, h.source.ServiceState)
	}()

	go func() {
		wg.Wait()
		close(done)
	}()
}

// stopLocked останавливает опрос и дожидается горутин. Вызывается под h.mu.
func (h *Hub) stopLocked() {
	if h.stop == nil {
		return
	}

	stop, done := h.stop, h.done
	h.stop, h.done = nil, nil

	// Ожидание идёт без мьютекса: горутины публикуют события и взяли бы его.
	h.mu.Unlock()
	stop()
	<-done
	h.mu.Lock()
}

// runStream держит построчный источник, переподключаясь после обрыва. Обрыв
// штатен: sing-box перезапускают, и поток на этом заканчивается.
func (h *Hub) runStream(ctx context.Context, topic, path string) {
	for ctx.Err() == nil {
		err := h.source.Stream(ctx, path, func(line json.RawMessage) {
			h.publish(topic, line)
		})
		if err != nil && ctx.Err() == nil {
			h.log.Debug("поток рантайма оборван", "topic", topic, "err", err)
		}

		if !sleep(ctx, h.opts.RetryInterval) {
			return
		}
	}
}

func (h *Hub) runPoll(
	ctx context.Context,
	topic string,
	interval time.Duration,
	read func(context.Context) (json.RawMessage, error),
) {
	for {
		data, err := read(ctx)
		if err == nil {
			h.publish(topic, data)
		} else if ctx.Err() == nil {
			h.log.Debug("опрос рантайма не удался", "topic", topic, "err", err)
		}

		if !sleep(ctx, interval) {
			return
		}
	}
}

func (h *Hub) publish(topic string, data json.RawMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.seq++
	event := Event{Topic: topic, Seq: h.seq, Data: data}
	h.last[topic] = event

	for ch := range h.subscribers {
		select {
		case ch <- event:
		default:
			// Читатель не успевает. Событие теряется намеренно: очередь в
			// памяти демона, который живёт месяцами, опаснее пропуска сэмпла.
			// Разрыв в Seq панель увидит сама.
		}
	}
}

// ServeHTTP отдаёт поток в формате SSE.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Поддержка проверяется до первой записи: сама попытка сброса отправила бы
	// заголовок, и отказать после этого было бы уже нечем.
	if !supportsFlush(w) {
		http.Error(w, "поток не поддерживается", http.StatusInternalServerError)

		return
	}

	// Сбрасывает контроллер, а не приведение к http.Flusher: middleware
	// оборачивает ResponseWriter, и у обёртки метода нет — она отдаёт исходный
	// writer через Unwrap, по которому контроллер и ходит.
	control := http.NewResponseController(w)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	// Ответ идёт до конца соединения, поэтому промежуточные прокси не должны
	// его буферизовать.
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	_ = control.Flush()

	ch, recent, cancel := h.subscribe()
	defer cancel()

	for _, event := range recent {
		if !writeEvent(w, event) {
			return
		}
	}

	_ = control.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-ch:
			if !ok {
				return
			}

			if !writeEvent(w, event) {
				return
			}

			if err := control.Flush(); err != nil {
				return
			}
		}
	}
}

func writeEvent(w http.ResponseWriter, event Event) bool {
	body, err := json.Marshal(event)
	if err != nil {
		return false
	}

	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Topic, body)

	return err == nil
}

// supportsFlush отвечает, доберётся ли контроллер до writer со сбросом. Обход
// повторяет то, что делает http.NewResponseController, но без записи в ответ.
func supportsFlush(w http.ResponseWriter) bool {
	for {
		if _, ok := w.(http.Flusher); ok {
			return true
		}

		unwrapper, ok := w.(interface{ Unwrap() http.ResponseWriter })
		if !ok {
			return false
		}

		w = unwrapper.Unwrap()
	}
}

// sleep ждёт период и сообщает, стоит ли продолжать.
func sleep(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

// lines разбирает построчный ответ источника. Вынесено сюда, чтобы адаптер
// источника не повторял разбор для каждого потока.
func lines(r *bufio.Reader, sink func(json.RawMessage)) error {
	for {
		line, err := r.ReadBytes('\n')
		if len(line) > 0 {
			if trimmed := json.RawMessage(trimSpace(line)); len(trimmed) > 0 {
				sink(trimmed)
			}
		}

		if err != nil {
			return err
		}
	}
}

func trimSpace(b []byte) []byte {
	start := 0
	for start < len(b) && isSpace(b[start]) {
		start++
	}

	end := len(b)
	for end > start && isSpace(b[end-1]) {
		end--
	}

	return b[start:end]
}

func isSpace(b byte) bool {
	return b == ' ' || b == '\t' || b == '\r' || b == '\n'
}
