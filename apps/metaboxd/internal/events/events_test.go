package events

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func testLogger(t *testing.T) *slog.Logger {
	t.Helper()

	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// fakeSource считает подписки и отдаёт заранее заданные данные.
type fakeSource struct {
	mu sync.Mutex

	streams  atomic.Int64
	snapshot json.RawMessage
	service  json.RawMessage

	// lines шлются в поток по одной на подписку.
	lines []json.RawMessage
}

func (f *fakeSource) Stream(ctx context.Context, _ string, sink func(json.RawMessage)) error {
	f.streams.Add(1)

	f.mu.Lock()
	lines := f.lines
	f.mu.Unlock()

	for _, line := range lines {
		sink(line)
	}

	<-ctx.Done()

	return ctx.Err()
}

func (f *fakeSource) Snapshot(context.Context, string) (json.RawMessage, error) {
	if f.snapshot == nil {
		return nil, errors.New("снапшота нет")
	}

	return f.snapshot, nil
}

func (f *fakeSource) ServiceState(context.Context) (json.RawMessage, error) {
	if f.service == nil {
		return nil, errors.New("состояния нет")
	}

	return f.service, nil
}

func fastOptions() Options {
	return Options{
		ConnectionsInterval: 10 * time.Millisecond,
		ServiceInterval:     10 * time.Millisecond,
		RetryInterval:       10 * time.Millisecond,
	}
}

func readEvents(t *testing.T, body io.Reader, want int) []Event {
	t.Helper()

	events := make([]Event, 0, want)
	reader := newSSEReader(body)
	for len(events) < want {
		event, err := reader.next()
		if err != nil {
			t.Fatalf("чтение события %d из %d: %v", len(events)+1, want, err)
		}

		events = append(events, event)
	}

	return events
}

// Поток не поднимается, пока нет читателя: устройство большую часть времени
// простаивает, и фоновый опрос без потребителя там не нужен.
func TestHubIdleWithoutSubscribers(t *testing.T) {
	source := &fakeSource{snapshot: json.RawMessage(`[]`), service: json.RawMessage(`{}`)}
	New(source, testLogger(t), fastOptions())

	time.Sleep(50 * time.Millisecond)

	if got := source.streams.Load(); got != 0 {
		t.Errorf("источник опрошен без читателей: %d подписок", got)
	}
}

func TestHubStreamsToSubscriber(t *testing.T) {
	source := &fakeSource{
		snapshot: json.RawMessage(`[{"id":"a"}]`),
		service:  json.RawMessage(`{"status":"running"}`),
		lines:    []json.RawMessage{json.RawMessage(`{"up":1,"down":2}`)},
	}

	srv := httptest.NewServer(New(source, testLogger(t), fastOptions()))
	defer srv.Close()

	response, err := srv.Client().Get(srv.URL) //nolint:noctx // соединение закрывается ниже
	if err != nil {
		t.Fatalf("подключение к потоку: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	if got := response.Header.Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("тип ответа %q, ожидали text/event-stream", got)
	}

	seen := make(map[string]bool)
	for _, event := range readEvents(t, response.Body, 6) {
		seen[event.Topic] = true

		if event.Seq == 0 {
			t.Errorf("событие без номера: %+v", event)
		}
	}

	for _, topic := range []string{TopicTraffic, TopicMemory, TopicConnections, TopicService} {
		if !seen[topic] {
			t.Errorf("топик %q в потоке не появился, пришли %v", topic, seen)
		}
	}
}

// Второй читатель не удваивает нагрузку на sing-box: апстрим остаётся один.
func TestHubSharesUpstream(t *testing.T) {
	source := &fakeSource{snapshot: json.RawMessage(`[]`), service: json.RawMessage(`{}`)}
	hub := New(source, testLogger(t), fastOptions())

	srv := httptest.NewServer(hub)
	defer srv.Close()

	first, err := srv.Client().Get(srv.URL) //nolint:noctx // соединение закрывается ниже
	if err != nil {
		t.Fatalf("первый читатель: %v", err)
	}
	defer func() { _ = first.Body.Close() }()

	readEvents(t, first.Body, 1)
	afterFirst := source.streams.Load()

	second, err := srv.Client().Get(srv.URL) //nolint:noctx // соединение закрывается ниже
	if err != nil {
		t.Fatalf("второй читатель: %v", err)
	}
	defer func() { _ = second.Body.Close() }()

	readEvents(t, second.Body, 1)

	if got := source.streams.Load(); got != afterFirst {
		t.Errorf("подписок на источник стало %d, было %d: апстрим не разделён", got, afterFirst)
	}
}

// Подключившийся читатель получает текущее состояние сразу, а не через период
// опроса: иначе экран после перезагрузки страницы был бы пустым до секунды.
func TestHubReplaysLastState(t *testing.T) {
	source := &fakeSource{snapshot: json.RawMessage(`[{"id":"a"}]`), service: json.RawMessage(`{"status":"running"}`)}
	hub := New(source, testLogger(t), fastOptions())

	srv := httptest.NewServer(hub)
	defer srv.Close()

	warmup, err := srv.Client().Get(srv.URL) //nolint:noctx // соединение закрывается ниже
	if err != nil {
		t.Fatalf("прогрев: %v", err)
	}

	readEvents(t, warmup.Body, 2)

	late, err := srv.Client().Get(srv.URL) //nolint:noctx // соединение закрывается ниже
	if err != nil {
		t.Fatalf("поздний читатель: %v", err)
	}
	defer func() { _ = late.Body.Close() }()

	// Первое же событие приходит без ожидания периода опроса.
	done := make(chan Event, 1)

	go func() {
		reader := newSSEReader(late.Body)

		event, readErr := reader.next()
		if readErr == nil {
			done <- event
		}

		close(done)
	}()

	select {
	case event, ok := <-done:
		if !ok {
			t.Fatal("позднему читателю ничего не пришло")
		}

		if event.Seq == 0 {
			t.Errorf("повтор состояния без номера: %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("состояние не повторено подключившемуся читателю")
	}

	_ = warmup.Body.Close()
}

// Уход последнего читателя останавливает опрос: горутины не остаются висеть.
func TestHubStopsWithLastSubscriber(t *testing.T) {
	source := &fakeSource{snapshot: json.RawMessage(`[]`), service: json.RawMessage(`{}`)}
	hub := New(source, testLogger(t), fastOptions())

	ch, _, cancel := hub.subscribe()

	select {
	case <-ch:
	case <-time.After(time.Second):
		t.Fatal("события не пошли")
	}

	cancel()

	hub.mu.Lock()
	running := hub.stop != nil
	hub.mu.Unlock()

	if running {
		t.Error("опрос источников продолжается без читателей")
	}
}

// Без возможности сбросить буфер поток отдавать нечем: событие осталось бы
// у сервера до конца ответа, которого у потока нет.
func TestHubRequiresFlusher(t *testing.T) {
	hub := New(&fakeSource{}, testLogger(t), fastOptions())

	writer := &noFlushWriter{header: make(http.Header)}
	hub.ServeHTTP(writer, httptest.NewRequest(http.MethodGet, "/api/events", nil))

	if writer.code != http.StatusInternalServerError {
		t.Errorf("код ответа %d, ожидали %d", writer.code, http.StatusInternalServerError)
	}
}

// noFlushWriter реализует только http.ResponseWriter. Встраивать
// httptest.ResponseRecorder нельзя: он промотировал бы свой Flush, и writer
// снова оказался бы http.Flusher.
type noFlushWriter struct {
	header http.Header
	code   int
}

func (w *noFlushWriter) Header() http.Header         { return w.header }
func (w *noFlushWriter) Write(b []byte) (int, error) { return len(b), nil }
func (w *noFlushWriter) WriteHeader(code int)        { w.code = code }
