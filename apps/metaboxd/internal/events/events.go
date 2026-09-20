// Package events сводит рантайм-данные в один поток к панели.
//
// Источники у форка разные — посекундные строки `/traffic` и `/memory`,
// снапшот `/connections`, опрос службы, — а панель получает один конверт и не
// знает, какой источник сработал (ADR-0006). Транспорт, конверт и владение
// подписками заданы ADR-0010: SSE выбран потому, что сервера WebSocket в
// стандартной библиотеке нет, а зависимость в демоне требует отдельного
// решения.
package events

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	TopicSystem      = "system"
)

// Event — конверт. Seq считается для каждого читателя отдельно и растёт без
// пропусков, пока события доходят: разрыв в номерах означает, что читатель не
// успевал и событие было отброшено.
type Event struct {
	Topic string          `json:"topic"`
	Seq   uint64          `json:"seq"`
	Data  json.RawMessage `json:"data"`
}

// subscriber — один читатель потока со своим счётчиком. Общий счётчик на всех
// не годится: повтор состояния при подключении ушёл бы со старыми номерами и
// выглядел бы для панели пропуском.
type subscriber struct {
	ch  chan Event
	seq uint64
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
	// SystemState отдаёт показания устройства. Источник у них не Clash API, но
	// ходит он туда же, куда и остальные: Hub не должен знать, кто и откуда
	// читает — он владеет только подписками.
	SystemState(ctx context.Context) (json.RawMessage, error)
}

// Options задаёт периоды опроса тех источников, которые сами ничего не шлют.
type Options struct {
	// ConnectionsInterval — период снапшота соединений. Clash API отдаёт их
	// только целиком, поэтому частота здесь напрямую превращается в трафик
	// между sing-box и демоном.
	ConnectionsInterval time.Duration
	// ServiceInterval — период опроса службы. Он дороже остальных: это запуск
	// внешних процессов, поэтому реже.
	ServiceInterval time.Duration
	// SystemInterval — период съёма показаний устройства. Загрузка и
	// температура меняются медленнее трафика, а чтение procfs не бесплатно.
	SystemInterval time.Duration
	// RetryInterval — пауза перед повторной попыткой после обрыва источника.
	RetryInterval time.Duration
	// KeepAlive — период комментария в поток, когда источники молчат. Без него
	// оборванное соединение не обнаруживает ни одна из сторон: в сокет ничего
	// не пишется, и ошибка не возникает.
	KeepAlive time.Duration
}

// Hub держит один набор подписок на источники, пока есть хоть один читатель,
// и раздаёт события всем сразу. Второй читатель не удваивает нагрузку на
// sing-box: апстрим остаётся один.
type Hub struct {
	source Source
	log    *slog.Logger
	opts   Options

	mu          sync.Mutex
	subscribers map[*subscriber]struct{}
	// last хранит последние данные каждого топика: подключившийся читатель
	// получает текущее состояние сразу, а не через период опроса. Сбрасывается
	// вместе с остановкой источников, иначе следующий читатель принял бы
	// данные умершего апстрима за текущие.
	last map[string]json.RawMessage
	// order задаёт порядок повтора: карта его не хранит, а читателю состояние
	// должно приходить в том же порядке, в каком публиковалось.
	order []string
	stop  context.CancelFunc
	done  chan struct{}
}

// New собирает Hub. Опросов он не начинает: фоновый опрос без потребителя на
// устройстве, которое месяцами простаивает, — это расход батареи процессора
// впустую (DeviceIO).
func New(source Source, log *slog.Logger, opts Options) *Hub {
	return &Hub{
		source:      source,
		log:         log,
		opts:        opts,
		subscribers: make(map[*subscriber]struct{}),
		last:        make(map[string]json.RawMessage),
	}
}

// subscribe добавляет читателя и поднимает источники, если он первый. Вторым
// значением возвращается снимок последних событий по каждому топику.
func (h *Hub) subscribe() (*subscriber, []Event, func()) {
	// Буфер читателя. Медленный читатель не должен блокировать рассылку
	// остальным, поэтому очередь конечна и переполнение теряет событие.
	const buffer = 16

	sub := &subscriber{ch: make(chan Event, buffer)}

	h.mu.Lock()
	h.subscribers[sub] = struct{}{}

	recent := make([]Event, 0, len(h.order))
	for _, topic := range h.order {
		sub.seq++
		recent = append(recent, Event{Topic: topic, Seq: sub.seq, Data: h.last[topic]})
	}

	if len(h.subscribers) == 1 {
		h.start()
	}
	h.mu.Unlock()

	return sub, recent, func() { h.unsubscribe(sub) }
}

func (h *Hub) unsubscribe(sub *subscriber) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.removeLocked(sub)

	if len(h.subscribers) == 0 {
		h.stopLocked()
	}
}

func (h *Hub) removeLocked(sub *subscriber) {
	if _, ok := h.subscribers[sub]; !ok {
		return
	}

	delete(h.subscribers, sub)
	close(sub.ch)
}

// Close закрывает всех читателей и останавливает источники. Нужен на остановке
// демона: http.Server.Shutdown ждёт завершения запросов и контексты им не
// отменяет, а хендлер потока живёт до ухода клиента — без Close остановка
// упиралась бы в таймаут и демон выходил бы с ошибкой.
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()

	for sub := range h.subscribers {
		h.removeLocked(sub)
	}

	h.stopLocked()
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
			// Форма соединений принадлежит демону, а не источнику: панель не
			// должна знать, каким API они прочитаны (ADR-0006).
			raw, err := h.source.Snapshot(ctx, "/connections")
			if err != nil {
				return nil, err
			}

			body, _, err := connectionsSnapshot(raw)

			return body, err
		})
	}()

	wg.Add(1)

	go func() {
		defer wg.Done()
		h.runPoll(ctx, TopicService, h.opts.ServiceInterval, h.source.ServiceState)
	}()

	wg.Add(1)

	go func() {
		defer wg.Done()
		h.runPoll(ctx, TopicSystem, h.opts.SystemInterval, h.source.SystemState)
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

	// Чистится после ожидания, а не до: горутина, не успевшая завершиться,
	// записала бы состояние заново. Данные умершего апстрима не должны
	// достаться следующему читателю как текущие.
	h.last = make(map[string]json.RawMessage)
	h.order = nil
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
	// Проверка стоит здесь, в единственной точке публикации: невалидные данные
	// осели бы в последнем состоянии топика, и тогда сборка конверта падала бы
	// у каждого подключающегося читателя — вышел бы шторм переподключений.
	if !json.Valid(data) {
		h.log.Debug("источник отдал не JSON", "topic", topic)

		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if _, seen := h.last[topic]; !seen {
		h.order = append(h.order, topic)
	}

	h.last[topic] = data

	for sub := range h.subscribers {
		// Номер тратится и на отброшенное событие: иначе пропуск не был бы
		// виден читателю разрывом в нумерации.
		sub.seq++

		select {
		case sub.ch <- Event{Topic: topic, Seq: sub.seq, Data: data}:
		default:
			// Читатель не успевает. Событие теряется намеренно: очередь в
			// памяти демона, который живёт месяцами, опаснее пропуска сэмпла.
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

	sub, recent, cancel := h.subscribe()
	defer cancel()

	for _, event := range recent {
		if !writeEvent(w, event) {
			return
		}
	}

	_ = control.Flush()

	keepAlive := time.NewTicker(h.keepAlive())
	defer keepAlive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepAlive.C:
			// Комментарий SSE: панель его игнорирует, а запись в сокет
			// обнаруживает обрыв.
			if _, err := io.WriteString(w, ": keep-alive\n\n"); err != nil {
				return
			}

			if err := control.Flush(); err != nil {
				return
			}
		case event, ok := <-sub.ch:
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

// keepAlive отдаёт период поддержки соединения; ноль означает значение по
// умолчанию, чтобы собранный без него Hub не слал комментарии непрерывно.
func (h *Hub) keepAlive() time.Duration {
	const fallback = 20 * time.Second

	if h.opts.KeepAlive <= 0 {
		return fallback
	}

	return h.opts.KeepAlive
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
		if trimmed := bytes.TrimSpace(line); len(trimmed) > 0 {
			sink(json.RawMessage(trimmed))
		}

		if err != nil {
			return err
		}
	}
}
