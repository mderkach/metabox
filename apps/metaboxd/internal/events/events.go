// Package events reduces runtime data into one stream to the panel.
//
// The fork sources differ: per-second `/traffic` and `/memory` lines, the
// `/connections` snapshot, service polling, but the panel gets one envelope and does not
// know which source fired. SSE is chosen because the standard library has no WebSocket
// server, and a dependency in the daemon needs a separate
// decision.
package events

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"

	"metabox/internal/locale"
)

// Stream topics. The panel subscribes to all at once: a separate subscription for
// each would bring us back to several connections.
const (
	TopicTraffic     = "traffic"
	TopicMemory      = "memory"
	TopicConnections = "connections"
	TopicService     = "service"
	TopicSystem      = "system"
)

// MaxSubscribers is how many streams the Hub holds at once. A browser gives an origin six
// HTTP/1.1 connections, and a panel needs at least two of them for requests and the log
// stream, so one client holds at most four streams; the ceiling covers two such clients.
// Every reader gets each connections frame of up to ~10 MB written to its socket, and on
// a router an unbounded count turns into an unbounded write load.
const MaxSubscribers = 8

// RetryAfter is after how many seconds a reader refused with ErrTooManySubscribers retries.
const RetryAfter = "5"

var (
	// ErrTooManySubscribers means MaxSubscribers streams are open, a new one is refused.
	ErrTooManySubscribers = locale.New("too many runtime streams open")

	errNoFlush = errors.New("streaming not supported")
)

// Event is an envelope. Seq is counted for each reader separately and grows without
// gaps while events arrive: a gap in numbers means the reader could not
// keep up and an event was dropped.
type Event struct {
	Topic string          `json:"topic"`
	Seq   uint64          `json:"seq"`
	Data  json.RawMessage `json:"data"`
}

// subscriber is one stream reader with its own counter. A shared counter for everyone
// does not fit: the state repeat on connect would go with old numbers and
// look like a gap to the panel.
type subscriber struct {
	ch  chan Event
	seq uint64
}

// Source is where the Hub takes data from. The interface is declared here, at the
// consumer: the Hub knows neither the Clash API nor the init script.
type Source interface {
	// Stream reads a line-by-line stream and gives each line to the sink. A return
	// without an error means the stream ended normally.
	Stream(ctx context.Context, path string, sink func(json.RawMessage)) error
	// ServiceState returns the service state in the same form as the handler.
	ServiceState(ctx context.Context) (json.RawMessage, error)
	// SystemState returns the device readings. Their source is not the Clash API, but
	// it goes to the same place as the others: the Hub must not know who and from where
	// reads, it owns only the subscriptions.
	SystemState(ctx context.Context) (json.RawMessage, error)
}

// Options sets the polling periods of the sources that send nothing themselves.
// The Hub does not take the connections snapshot: it is brought by the hit counter through
// PublishConnections, and the counter sets the frequency.
type Options struct {
	// ServiceInterval is the service polling period. It is more expensive than the others: it launches
	// external processes, hence less often.
	ServiceInterval time.Duration
	// SystemInterval is the device readings period. Load and
	// temperature change more slowly than traffic, and reading procfs is not free.
	SystemInterval time.Duration
	// RetryInterval is the pause before retrying after a source break.
	RetryInterval time.Duration
	// KeepAlive is the period of a comment into the stream when the sources are silent. Without it
	// a broken connection is detected by neither side: nothing is written to the
	// socket, and no error occurs.
	KeepAlive time.Duration
	// WriteTimeout is the deadline of each write into the stream. The server has no global
	// WriteTimeout, and without it a client that holds the socket and does not read
	// would hold the handler until the TCP retransmission timeout.
	WriteTimeout time.Duration
}

// Hub holds one set of source subscriptions while there is at least one reader,
// and distributes events to all at once. A second reader does not double the load on
// sing-box: the upstream stays single.
type Hub struct {
	source Source
	log    *slog.Logger
	opts   Options

	mu          sync.Mutex
	subscribers map[*subscriber]struct{}
	// last holds the latest data of each topic: a reader that connects
	// gets the current state at once and not after a polling period. Reset
	// together with the source stop, otherwise the next reader would take
	// the data of a dead upstream for current.
	last map[string]json.RawMessage
	// order sets the repeat order: the map does not keep it, and the state
	// must reach the reader in the same order it was published.
	order []string
	stop  context.CancelFunc
	done  chan struct{}
	// gen is the generation of the source set, grows on every stop.
	// The set goroutines publish with their number, and everything a departed
	// set sends while finishing up to the cancellation is dropped: the stop
	// waits for it without the mutex, and in this window a new reader manages to bring up
	// the next set.
	gen uint64
	// closed: the Hub is closed by the daemon stop: sources are no longer started,
	// and a reader that came after Close gets a closed channel at once.
	closed bool
}

// New assembles the Hub. It starts no polling: background polling without a consumer on
// a device that idles for months is a waste of processor battery
// (DeviceIO).
func New(source Source, log *slog.Logger, opts Options) *Hub {
	return &Hub{
		source:      source,
		log:         log,
		opts:        opts,
		subscribers: make(map[*subscriber]struct{}),
		last:        make(map[string]json.RawMessage),
	}
}

// subscribe adds a reader and brings up the sources if it is the first. The second
// return value is a snapshot of the latest events for each topic. Beyond MaxSubscribers
// readers it returns ErrTooManySubscribers.
func (h *Hub) subscribe() (*subscriber, []Event, func(), error) {
	// The reader buffer. A slow reader must not block the broadcast to
	// the others, so the queue is finite and an overflow loses the event.
	const buffer = 16

	sub := &subscriber{ch: make(chan Event, buffer)}

	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		close(sub.ch)

		return sub, nil, func() {}, nil
	}

	if len(h.subscribers) >= MaxSubscribers {
		h.mu.Unlock()

		return nil, nil, nil, ErrTooManySubscribers
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

	return sub, recent, func() { h.unsubscribe(sub) }, nil
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

// Close closes all readers and stops the sources. Needed at the daemon
// stop: http.Server.Shutdown waits for requests to finish and does not cancel their contexts,
// while the stream handler lives until the client leaves; without Close the stop
// would run into the timeout and the daemon would exit with an error.
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.closed = true

	for sub := range h.subscribers {
		h.removeLocked(sub)
	}

	h.stopLocked()
}

// start brings up the source polling. Called under h.mu.
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

// stopLocked stops the polling and waits for the goroutines. Called under h.mu.
func (h *Hub) stopLocked() {
	if h.stop == nil {
		return
	}

	stop, done := h.stop, h.done
	h.stop, h.done = nil, nil

	// The generation changes before the mutex is released: a goroutine that has not
	// managed to finish will no longer write the state, and it can be cleared
	// at once. The data of a dead upstream must not go to the next
	// reader as current.
	h.gen++
	h.last = make(map[string]json.RawMessage)
	h.order = nil

	// The wait goes without the mutex: the goroutines publish events and would take it.
	// The set brought up by a new reader in the meantime is not touched
	// after the return.
	h.mu.Unlock()
	stop()
	<-done
	h.mu.Lock()
}

// runStream holds a line-by-line source, reconnecting after a break. A break
// is regular: sing-box is restarted, and the stream ends with it.
func (h *Hub) runStream(ctx context.Context, gen uint64, topic, path string) {
	for ctx.Err() == nil {
		err := h.source.Stream(ctx, path, func(line json.RawMessage) {
			h.publish(gen, topic, line)
		})
		if err != nil && ctx.Err() == nil {
			h.log.Debug("runtime stream broke", "topic", topic, "err", err)
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
			h.log.Debug("runtime not polled", "topic", topic, "err", err)
		}

		if !sleep(ctx, interval) {
			return
		}
	}
}

// PublishConnections accepts the raw Clash API snapshot: it is taken by the hit
// counter, and the daemon does not need a second `/connections` poll. Without readers the
// snapshot is dropped before parsing: the connection shape belongs to the daemon, but
// the cost of translating into the contract is not paid while the panel is closed.
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
		h.log.Debug("runtime not polled", "topic", TopicConnections, "err", err)

		return
	}

	h.publish(gen, TopicConnections, body)
}

// publish distributes an event of set gen. An event of a departed set
// is dropped: its data does not belong to the current upstream.
func (h *Hub) publish(gen uint64, topic string, raw json.RawMessage) {
	// The check stands here, at the single publication point: invalid data
	// would settle in the topic's last state, and then envelope building would fail
	// for every connecting reader, causing a reconnect storm. The compact form is
	// built once here and shared by all readers: writeEvent puts it into the
	// envelope as is instead of re-encoding a frame of up to ~10 MB per reader.
	var compact bytes.Buffer
	if err := json.Compact(&compact, raw); err != nil {
		h.log.Debug("source returned non-JSON", "topic", topic)

		return
	}

	data := json.RawMessage(compact.Bytes())

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
		// The number is spent on a dropped event too: otherwise the gap would not be
		// visible to the reader as a break in numbering.
		sub.seq++

		select {
		case sub.ch <- Event{Topic: topic, Seq: sub.seq, Data: data}:
		default:
			// The reader cannot keep up. The event is lost deliberately: a queue in the
			// memory of a daemon that lives for months is more dangerous than a skipped sample.
		}
	}
}

// ServeHTTP serves the stream like Serve and refuses in plain text.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	err := h.Serve(w, r)

	switch {
	case errors.Is(err, ErrTooManySubscribers):
		w.Header().Set("Retry-After", RetryAfter)
		http.Error(w, err.Error(), http.StatusTooManyRequests)
	case err != nil:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// Serve serves the stream in the SSE format until the client leaves. An error is
// returned only before anything is written, so the caller can still answer with a
// status: ErrTooManySubscribers beyond MaxSubscribers readers, or a writer without flush.
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request) error {
	// Support is checked before the first write: the flush attempt itself would send
	// the header, and there would be no way to refuse after that.
	if !SupportsFlush(w) {
		return errNoFlush
	}

	sub, recent, cancel, err := h.subscribe()
	if err != nil {
		return err
	}
	defer cancel()

	// The controller flushes, not a cast to http.Flusher: middleware
	// wraps ResponseWriter, and the wrapper has no such method; it returns the original
	// writer through Unwrap, which the controller follows.
	control := http.NewResponseController(w)

	// The deadline is set before each write and moved by the next one: the stream
	// lives as long as needed, and a single write no longer than WriteTimeout. A controller
	// failure does not hinder the stream: without a deadline it works as before.
	arm := func() { _ = control.SetWriteDeadline(time.Now().Add(h.writeTimeout())) }

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	// The response goes to the end of the connection, so intermediate proxies must not
	// buffer it.
	w.Header().Set("X-Accel-Buffering", "no")
	arm()
	w.WriteHeader(http.StatusOK)
	_ = control.Flush()

	arm()

	for _, event := range recent {
		if !writeEvent(w, event) {
			return nil
		}
	}

	_ = control.Flush()

	keepAlive := time.NewTicker(h.keepAlive())
	defer keepAlive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return nil
		case <-keepAlive.C:
			// An SSE comment: the panel ignores it, and the write to the socket
			// detects a break.
			arm()

			if _, err := io.WriteString(w, ": keep-alive\n\n"); err != nil {
				return nil
			}

			if err := control.Flush(); err != nil {
				return nil
			}
		case event, ok := <-sub.ch:
			if !ok {
				return nil
			}

			arm()

			if !writeEvent(w, event) {
				return nil
			}

			if err := control.Flush(); err != nil {
				return nil
			}
		}
	}
}

// writeEvent writes the envelope by hand, in the field order of json.Marshal: Data is
// already compact JSON shared by all readers, and Topic is one of the package constants,
// which need no escaping.
func writeEvent(w http.ResponseWriter, event Event) bool {
	head := make([]byte, 0, 64)
	head = append(head, "event: "...)
	head = append(head, event.Topic...)
	head = append(head, "\ndata: {\"topic\":\""...)
	head = append(head, event.Topic...)
	head = append(head, "\",\"seq\":"...)
	head = strconv.AppendUint(head, event.Seq, 10)
	head = append(head, ",\"data\":"...)

	if _, err := w.Write(head); err != nil {
		return false
	}

	if _, err := w.Write(event.Data); err != nil {
		return false
	}

	_, err := io.WriteString(w, "}\n\n")

	return err == nil
}

// keepAlive returns the connection keep-alive period; zero means the default
// value so that a Hub built without it does not send comments continuously.
func (h *Hub) keepAlive() time.Duration {
	const fallback = 20 * time.Second

	if h.opts.KeepAlive <= 0 {
		return fallback
	}

	return h.opts.KeepAlive
}

// writeTimeout returns the write deadline; zero means the default value
// so that a Hub built without it does not cut off every write at once.
func (h *Hub) writeTimeout() time.Duration {
	const fallback = 10 * time.Second

	if h.opts.WriteTimeout <= 0 {
		return fallback
	}

	return h.opts.WriteTimeout
}

// SupportsFlush reports whether the controller can reach a writer with flush. The walk
// repeats what http.NewResponseController does, but without writing to the response.
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

// sleep waits for the period and reports whether to continue.
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

// maxLineBytes is the ceiling for a stream line. The `/traffic` and `/memory` lines are
// tens of bytes; the ceiling covers them with a margin and does not let a process that took
// the controller port while sing-box is down feed the daemon an endless line.
const maxLineBytes = 64 << 10

// lines parses a line-by-line source response. Extracted here so the source adapter
// does not repeat the parsing for each stream. A line longer than
// maxLineBytes aborts the stream with a bufio.ErrTooLong error.
func lines(r io.Reader, sink func(json.RawMessage)) error {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(nil, maxLineBytes)

	for scanner.Scan() {
		// The scanner buffer is reused, and the line settles in the topic
		// state, so it goes out as a copy.
		if trimmed := bytes.TrimSpace(scanner.Bytes()); len(trimmed) > 0 {
			sink(json.RawMessage(bytes.Clone(trimmed)))
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read stream: %w", err)
	}

	// The end of a response for a stream is a break, not a normal finish: the runtime
	// stream has no end, it is broken only by a sing-box restart.
	return io.EOF
}
