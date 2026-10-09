// Package events сводит рантайм-данные в один поток к панели.
//
// Источники у форка разные — посекундные строки `/traffic` и `/memory`,
// снапшот `/connections`, опрос службы, — а панель получает один конверт и не
// знает, какой источник сработал. SSE выбран потому, что сервера WebSocket в
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
	// ServiceState отдаёт состояние службы в том же виде, что и ручка.
	ServiceState(ctx context.Context) (json.RawMessage, error)
	// SystemState отдаёт показания устройства. Источник у них не Clash API, но
	// ходит он туда же, куда и остальные: Hub не должен знать, кто и откуда
	// читает — он владеет только подписками.
	SystemState(ctx context.Context) (json.RawMessage, error)
}

// Options задаёт периоды опроса тех источников, которые сами ничего не шлют.
// Снапшот соединений Hub не снимает: его приносит счётчик срабатываний через
// PublishConnections, и частоту задаёт он.
type Options struct {
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
	// WriteTimeout — дедлайн каждой записи в поток. Глобального WriteTimeout
	// у сервера нет, и без него клиент, который держит сокет и не читает,
	// держал бы хендлер до TCP-таймаута ретрансмиссий.
	WriteTimeout time.Duration
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
	// gen — поколение комплекта источников, растёт на каждой остановке.
	// Горутины комплекта публикуют со своим номером, и всё, что ушедший
	// комплект присылает, пока досыпает до отмены, отбрасывается: остановка
	// ждёт его без мьютекса, и в это окно новый читатель успевает поднять
	// следующий комплект.
	gen uint64
	// closed — Hub закрыт остановкой демона: источники больше не поднимаются,
	// а читатель, пришедший после Close, сразу получает закрытый канал.
	closed bool
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
	if h.closed {
		h.mu.Unlock()
		close(sub.ch)

		return sub, nil, func() {}
	}

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

	h.closed = true

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
	gen := h.gen

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
			h.runStream(ctx, gen, s.topic, s.path)
		}()
	}

	wg.Add(1)

	go func() {
		defer wg.Done()
		h.runPoll(ctx, gen, TopicService, h.opts.ServiceInterval, h.source.ServiceState)
	}()

	wg.Add(1)

	go func() {
		defer wg.Done()
		h.runPoll(ctx, gen, TopicSystem, h.opts.SystemInterval, h.source.SystemState)
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

	// Поколение сменяется до того, как мьютекс отпущен: горутина, не
	// успевшая завершиться, состояние уже не запишет, и чистить его можно
	// сразу. Данные умершего апстрима не должны достаться следующему
	// читателю как текущие.
	h.gen++
	h.last = make(map[string]json.RawMessage)
	h.order = nil

	// Ожидание идёт без мьютекса: горутины публикуют события и взяли бы его.
	// Комплект, поднятый за это время новым читателем, после возврата не
	// трогается.
	h.mu.Unlock()
	stop()
	<-done
	h.mu.Lock()
}

// runStream держит построчный источник, переподключаясь после обрыва. Обрыв
// штатен: sing-box перезапускают, и поток на этом заканчивается.
func (h *Hub) runStream(ctx context.Context, gen uint64, topic, path string) {
	for ctx.Err() == nil {
		err := h.source.Stream(ctx, path, func(line json.RawMessage) {
			h.publish(gen, topic, line)
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
	gen uint64,
	topic string,
	interval time.Duration,
	read func(context.Context) (json.RawMessage, error),
) {
	for {
		data, err := read(ctx)
		if err == nil {
			h.publish(gen, topic, data)
		} else if ctx.Err() == nil {
			h.log.Debug("опрос рантайма не удался", "topic", topic, "err", err)
		}

		if !sleep(ctx, interval) {
			return
		}
	}
}

// PublishConnections принимает сырой снапшот Clash API — его снимает счётчик
// срабатываний, и второй опрос `/connections` демону не нужен. Без читателей
// снапшот отбрасывается до разбора: форма соединений принадлежит демону, но
// цена перевода в контракт не платится, пока панель закрыта.
func (h *Hub) PublishConnections(raw json.RawMessage) {
	h.mu.Lock()
	idle := len(h.subscribers) == 0
	gen := h.gen
	h.mu.Unlock()

	if idle {
		return
	}

	body, _, err := connectionsSnapshot(raw)
	if err != nil {
		h.log.Debug("опрос рантайма не удался", "topic", TopicConnections, "err", err)

		return
	}

	h.publish(gen, TopicConnections, body)
}

// publish раздаёт событие комплекта gen. Событие ушедшего комплекта
// отбрасывается: его данные к текущему апстриму не относятся.
func (h *Hub) publish(gen uint64, topic string, data json.RawMessage) {
	// Проверка стоит здесь, в единственной точке публикации: невалидные данные
	// осели бы в последнем состоянии топика, и тогда сборка конверта падала бы
	// у каждого подключающегося читателя — вышел бы шторм переподключений.
	if !json.Valid(data) {
		h.log.Debug("источник отдал не JSON", "topic", topic)

		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if gen != h.gen {
		return
	}

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
	if !SupportsFlush(w) {
		http.Error(w, "поток не поддерживается", http.StatusInternalServerError)

		return
	}

	// Сбрасывает контроллер, а не приведение к http.Flusher: middleware
	// оборачивает ResponseWriter, и у обёртки метода нет — она отдаёт исходный
	// writer через Unwrap, по которому контроллер и ходит.
	control := http.NewResponseController(w)

	// Дедлайн ставится перед каждой записью и сдвигается следующей: поток
	// живёт сколько угодно, а одна запись — не дольше WriteTimeout. Отказ
	// контроллера не мешает потоку: без дедлайна он работает как раньше.
	arm := func() { _ = control.SetWriteDeadline(time.Now().Add(h.writeTimeout())) }

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	// Ответ идёт до конца соединения, поэтому промежуточные прокси не должны
	// его буферизовать.
	w.Header().Set("X-Accel-Buffering", "no")
	arm()
	w.WriteHeader(http.StatusOK)
	_ = control.Flush()

	sub, recent, cancel := h.subscribe()
	defer cancel()

	arm()

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
			arm()

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

			arm()

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

// writeTimeout отдаёт дедлайн записи; ноль означает значение по умолчанию,
// чтобы собранный без него Hub не обрывал каждую запись сразу.
func (h *Hub) writeTimeout() time.Duration {
	const fallback = 10 * time.Second

	if h.opts.WriteTimeout <= 0 {
		return fallback
	}

	return h.opts.WriteTimeout
}

// SupportsFlush отвечает, доберётся ли контроллер до writer со сбросом. Обход
// повторяет то, что делает http.NewResponseController, но без записи в ответ.
func SupportsFlush(w http.ResponseWriter) bool {
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

// maxLineBytes — потолок на строку потока. Строки `/traffic` и `/memory` —
// десятки байт; потолок с запасом перекрывает их и не даёт процессу, занявшему
// порт контроллера при лежащем sing-box, кормить демона бесконечной строкой.
const maxLineBytes = 64 << 10

// lines разбирает построчный ответ источника. Вынесено сюда, чтобы адаптер
// источника не повторял разбор для каждого потока. Строка длиннее
// maxLineBytes обрывает поток ошибкой bufio.ErrTooLong.
func lines(r io.Reader, sink func(json.RawMessage)) error {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(nil, maxLineBytes)

	for scanner.Scan() {
		// Буфер сканера переиспользуется, а строка оседает в состоянии
		// топика, поэтому уходит копией.
		if trimmed := bytes.TrimSpace(scanner.Bytes()); len(trimmed) > 0 {
			sink(json.RawMessage(bytes.Clone(trimmed)))
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("чтение потока: %w", err)
	}

	// Конец ответа для потока — обрыв, а не штатное завершение: у потока
	// рантайма конца нет, его обрывает только перезапуск sing-box.
	return io.EOF
}
