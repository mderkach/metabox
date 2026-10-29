package events

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func testLogger(t *testing.T) *slog.Logger {
	t.Helper()

	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// fakeSource counts subscriptions and returns preset data.
type fakeSource struct {
	mu sync.Mutex

	streams atomic.Int64
	service json.RawMessage
	system  json.RawMessage

	// lines are sent into the stream one per subscription.
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

func (f *fakeSource) ServiceState(context.Context) (json.RawMessage, error) {
	if f.service == nil {
		return nil, errors.New("состояния нет")
	}

	return f.service, nil
}

func (f *fakeSource) SystemState(context.Context) (json.RawMessage, error) {
	if f.system == nil {
		return nil, errors.New("показаний нет")
	}

	return f.system, nil
}

func fastOptions() Options {
	return Options{
		ServiceInterval: 10 * time.Millisecond,
		SystemInterval:  10 * time.Millisecond,
		RetryInterval:   10 * time.Millisecond,
	}
}

// pushConnections feeds the Hub snapshots at the counter frequency while the test runs.
func pushConnections(t *testing.T, hub *Hub, raw string) {
	t.Helper()

	stop := make(chan struct{})
	done := make(chan struct{})

	go func() {
		defer close(done)

		for {
			select {
			case <-stop:
				return
			case <-time.After(2 * time.Millisecond):
				hub.PublishConnections(json.RawMessage(raw))
			}
		}
	}()

	t.Cleanup(func() {
		close(stop)
		<-done
	})
}

func readEvents(t *testing.T, body io.Reader, want int) []Event {
	t.Helper()

	events := make([]Event, 0, want)
	reader := newSSEReader(body)
	for len(events) < want {
		event, err := reader.next()
		if err != nil {
			t.Fatalf("reading event %d of %d: %v", len(events)+1, want, err)
		}

		events = append(events, event)
	}

	return events
}

// The stream does not come up while there is no reader: the device idles most of the time,
// and background polling without a consumer is not needed there.
func TestHubIdleWithoutSubscribers(t *testing.T) {
	source := &fakeSource{service: json.RawMessage(`{}`)}
	New(source, testLogger(t), fastOptions())

	time.Sleep(50 * time.Millisecond)

	if got := source.streams.Load(); got != 0 {
		t.Errorf("source polled without readers: %d subscriptions", got)
	}
}

// A snapshot in the Clash API shape: the daemon translates it into its own contract, and the mock must
// arrive in the same shape as the real source.
const clashSnapshotBody = `{"connections":[{"id":"a","rule":"domain=example.com => route(proxy)",` +
	`"chains":["hk-01","proxy"],"metadata":{"host":"example.com","destinationPort":"443"}}],"memory":1024}`

func TestHubStreamsToSubscriber(t *testing.T) {
	source := &fakeSource{
		service: json.RawMessage(`{"status":"running"}`),
		lines:   []json.RawMessage{json.RawMessage(`{"up":1,"down":2}`)},
	}

	hub := New(source, testLogger(t), fastOptions())
	pushConnections(t, hub, clashSnapshotBody)

	srv := httptest.NewServer(hub)
	defer srv.Close()

	response, err := srv.Client().Get(srv.URL) //nolint:noctx // the connection is closed below
	if err != nil {
		t.Fatalf("connecting to the stream: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	if got := response.Header.Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("response type %q, expected text/event-stream", got)
	}

	want := []string{TopicTraffic, TopicMemory, TopicConnections, TopicService}
	seen := make(map[string]bool)
	reader := newSSEReader(response.Body)

	// The topic order is undefined: reading goes until the full set, not exactly
	// as many events as there are topics.
	for range 100 {
		event, err := reader.next()
		if err != nil {
			t.Fatalf("reading an event: %v", err)
		}

		if event.Seq == 0 {
			t.Errorf("event without a number: %+v", event)
		}

		seen[event.Topic] = true

		if len(seen) == len(want) {
			break
		}
	}

	for _, topic := range want {
		if !seen[topic] {
			t.Errorf("topic %q did not appear in the stream, got %v", topic, seen)
		}
	}
}

// A second reader does not double the load on sing-box: the upstream stays single.
func TestHubSharesUpstream(t *testing.T) {
	source := &fakeSource{service: json.RawMessage(`{}`)}
	hub := New(source, testLogger(t), fastOptions())

	srv := httptest.NewServer(hub)
	defer srv.Close()

	first, err := srv.Client().Get(srv.URL) //nolint:noctx // the connection is closed below
	if err != nil {
		t.Fatalf("first reader: %v", err)
	}
	defer func() { _ = first.Body.Close() }()

	// We wait until both line-by-line subscriptions are up: a counter snapshot right
	// after the first event would catch the moment when some goroutines had not
	// started yet, and the test would flake.
	const wantStreams = 2
	waitStreams(t, source, wantStreams)

	second, err := srv.Client().Get(srv.URL) //nolint:noctx // the connection is closed below
	if err != nil {
		t.Fatalf("second reader: %v", err)
	}
	defer func() { _ = second.Body.Close() }()

	readEvents(t, second.Body, 1)

	if got := source.streams.Load(); got != wantStreams {
		t.Errorf("subscriptions to the source %d, expected %d: upstream is not shared", got, wantStreams)
	}
}

// A reader that connects gets the current state at once and not after the polling
// period: otherwise the screen after a page reload would be empty for up to a second.
func TestHubReplaysLastState(t *testing.T) {
	source := &fakeSource{service: json.RawMessage(`{"status":"running"}`)}
	hub := New(source, testLogger(t), fastOptions())

	srv := httptest.NewServer(hub)
	defer srv.Close()

	warmup, err := srv.Client().Get(srv.URL) //nolint:noctx // the connection is closed below
	if err != nil {
		t.Fatalf("warm-up: %v", err)
	}

	readEvents(t, warmup.Body, 2)

	late, err := srv.Client().Get(srv.URL) //nolint:noctx // the connection is closed below
	if err != nil {
		t.Fatalf("late reader: %v", err)
	}
	defer func() { _ = late.Body.Close() }()

	// The very first event arrives without waiting for the polling period.
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
			t.Fatal("nothing reached the late reader")
		}

		if event.Seq == 0 {
			t.Errorf("state repeat without a number: %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("state not repeated to the reader that connected")
	}

	_ = warmup.Body.Close()
}

// The last reader leaving stops the polling: goroutines are not left hanging.
func TestHubStopsWithLastSubscriber(t *testing.T) {
	source := &fakeSource{service: json.RawMessage(`{}`)}
	hub := New(source, testLogger(t), fastOptions())

	sub, _, cancel, _ := hub.subscribe()

	select {
	case <-sub.ch:
	case <-time.After(time.Second):
		t.Fatal("events did not flow")
	}

	cancel()

	hub.mu.Lock()
	running := hub.stop != nil
	hub.mu.Unlock()

	if running {
		t.Error("source polling continues without readers")
	}
}

// Without the ability to flush the buffer there is nothing to serve the stream with: the event would stay
// at the server until the end of the response, which a stream does not have.
func TestHubRequiresFlusher(t *testing.T) {
	hub := New(&fakeSource{}, testLogger(t), fastOptions())

	writer := &noFlushWriter{header: make(http.Header)}
	hub.ServeHTTP(writer, httptest.NewRequest(http.MethodGet, "/api/events", nil))

	if writer.code != http.StatusInternalServerError {
		t.Errorf("response code %d, expected %d", writer.code, http.StatusInternalServerError)
	}
}

// noFlushWriter implements only http.ResponseWriter. Embedding
// httptest.ResponseRecorder is not allowed: it would promote its Flush, and the writer
// would again be an http.Flusher.
type noFlushWriter struct {
	header http.Header
	code   int
}

func (w *noFlushWriter) Header() http.Header         { return w.header }
func (w *noFlushWriter) Write(b []byte) (int, error) { return len(b), nil }
func (w *noFlushWriter) WriteHeader(code int)        { w.code = code }

func waitStreams(t *testing.T, source *fakeSource, want int64) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if source.streams.Load() >= want {
			return
		}

		time.Sleep(5 * time.Millisecond)
	}

	t.Fatalf("subscriptions to the source %d, expected %d", source.streams.Load(), want)
}

// Numbers for a reader go in sequence from one, including the state repeat on
// connect: otherwise the panel would take the start of the stream for a gap.
func TestHubNumbersPerSubscriber(t *testing.T) {
	source := &fakeSource{
		service: json.RawMessage(`{}`),
		lines:   []json.RawMessage{json.RawMessage(`{"up":1}`)},
	}

	srv := httptest.NewServer(New(source, testLogger(t), fastOptions()))
	defer srv.Close()

	first, err := srv.Client().Get(srv.URL) //nolint:noctx // the connection is closed below
	if err != nil {
		t.Fatalf("first reader: %v", err)
	}
	defer func() { _ = first.Body.Close() }()

	for i, event := range readEvents(t, first.Body, 5) {
		if want := uint64(i + 1); event.Seq != want {
			t.Fatalf("event number %d: got %d, expected %d", i, event.Seq, want)
		}
	}

	// One that connected later starts from one, not from the shared counter number.
	late, err := srv.Client().Get(srv.URL) //nolint:noctx // the connection is closed below
	if err != nil {
		t.Fatalf("late reader: %v", err)
	}
	defer func() { _ = late.Body.Close() }()

	if got := readEvents(t, late.Body, 1)[0]; got.Seq != 1 {
		t.Errorf("first number of the late reader %d, expected 1", got.Seq)
	}
}

// A broken source line must not settle in the topic state.
func TestHubSkipsInvalidLines(t *testing.T) {
	source := &fakeSource{
		service: json.RawMessage(`{}`),
		lines:   []json.RawMessage{json.RawMessage("не json"), json.RawMessage(`{"up":7}`)},
	}

	srv := httptest.NewServer(New(source, testLogger(t), fastOptions()))
	defer srv.Close()

	response, err := srv.Client().Get(srv.URL) //nolint:noctx // the connection is closed below
	if err != nil {
		t.Fatalf("connection: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	for _, event := range readEvents(t, response.Body, 6) {
		if event.Topic == TopicTraffic && string(event.Data) != `{"up":7}` {
			t.Errorf("%q got into the traffic topic", event.Data)
		}
	}
}

// The upstream leaving must not leave a new reader with the data of a dead stream.
func TestHubForgetsStateAfterStop(t *testing.T) {
	source := &fakeSource{service: json.RawMessage(`{}`)}
	hub := New(source, testLogger(t), fastOptions())

	sub, _, cancel, _ := hub.subscribe()

	select {
	case <-sub.ch:
	case <-time.After(time.Second):
		t.Fatal("events did not flow")
	}

	cancel()

	hub.mu.Lock()
	remembered := len(hub.last)
	hub.mu.Unlock()

	if remembered != 0 {
		t.Errorf("after stop %d topics are remembered, expected 0", remembered)
	}
}

// Close closes the readers: without it the daemon stop would wait for them to leave.
func TestHubCloseReleasesSubscribers(t *testing.T) {
	hub := New(&fakeSource{service: json.RawMessage(`{}`)}, testLogger(t), fastOptions())

	sub, _, _, _ := hub.subscribe()
	hub.Close()

	for range sub.ch { //nolint:revive // drain the rest of the queue until it closes
	}

	hub.mu.Lock()
	left := len(hub.subscribers)
	hub.mu.Unlock()

	if left != 0 {
		t.Errorf("readers left after Close: %d", left)
	}
}

// A counter snapshot is translated into the daemon contract and reaches the reader.
func TestHubPublishesCounterSnapshot(t *testing.T) {
	hub := New(&fakeSource{service: json.RawMessage(`{}`)}, testLogger(t), fastOptions())

	sub, _, cancel, _ := hub.subscribe()
	defer cancel()

	hub.PublishConnections(json.RawMessage(clashSnapshotBody))

	deadline := time.After(time.Second)

	for {
		select {
		case event := <-sub.ch:
			if event.Topic != TopicConnections {
				continue
			}

			if !strings.Contains(string(event.Data), `"host":"example.com:443"`) {
				t.Errorf("snapshot not translated into the contract: %s", event.Data)
			}

			return
		case <-deadline:
			t.Fatal("counter snapshot did not reach the reader")
		}
	}
}

// Without readers the snapshot is dropped and does not settle in the topic state: the data
// of an upstream that died by the time of subscription must not look current.
func TestHubDropsConnectionsWithoutReaders(t *testing.T) {
	hub := New(&fakeSource{service: json.RawMessage(`{}`)}, testLogger(t), fastOptions())

	hub.PublishConnections(json.RawMessage(clashSnapshotBody))

	hub.mu.Lock()
	remembered := len(hub.last)
	hub.mu.Unlock()

	if remembered != 0 {
		t.Errorf("without readers %d topics settled in the state", remembered)
	}
}

// fakeSink counts what the accounting accumulated.
type fakeSink struct {
	proxy   atomic.Int64
	samples atomic.Int64
}

func (f *fakeSink) AddProxy(bytes int64)         { f.proxy.Add(bytes) }
func (f *fakeSink) SampleDevice(context.Context) { f.samples.Add(1) }

// fakeRecorder counts the samples that went into the history.
type fakeRecorder struct {
	records atomic.Int64
}

func (f *fakeRecorder) Record(int64, int64) { f.records.Add(1) }

// The channel share is counted over the whole daemon runtime, so the accounting runs even without
// a single stream reader.
func TestAccountingCountsWithoutReaders(t *testing.T) {
	source := &fakeSource{lines: []json.RawMessage{
		json.RawMessage(`{"up":100,"down":900}`),
		json.RawMessage(`{"up":50,"down":450}`),
	}}
	sink := &fakeSink{}
	recorder := &fakeRecorder{}

	accounting := NewAccounting(source, sink, recorder, testLogger(t), fastOptions())

	accounting.Start()
	t.Cleanup(accounting.Close)

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if sink.proxy.Load() == 1500 && sink.samples.Load() > 0 && recorder.records.Load() == 2 {
			return
		}

		time.Sleep(5 * time.Millisecond)
	}

	t.Errorf(
		"accounting accumulated %d bytes over %d readings, %d samples went into the history",
		sink.proxy.Load(), sink.samples.Load(), recorder.records.Load(),
	)
}

// stallSource holds the goroutines of the first set after cancellation until the test
// closes release: the window in which the stop waits for them without the mutex stays
// open as long as needed.
type stallSource struct {
	fakeSource

	calls   atomic.Int64
	release chan struct{}
}

func (s *stallSource) Stream(ctx context.Context, path string, sink func(json.RawMessage)) error {
	// The first set brings up two streams, /traffic and /memory.
	first := s.calls.Add(1) <= 2

	err := s.fakeSource.Stream(ctx, path, sink)
	if first {
		<-s.release
	}

	return err
}

func newStallSource() *stallSource {
	return &stallSource{
		fakeSource: fakeSource{
			service: json.RawMessage(`{}`),
			lines:   []json.RawMessage{json.RawMessage(`{"up":1}`)},
		},
		release: make(chan struct{}),
	}
}

// slowOptions publishes each topic once per set: the state that
// remained after the join is not overwritten by the next polling period.
func slowOptions() Options {
	return Options{
		ServiceInterval: time.Hour,
		SystemInterval:  time.Hour,
		RetryInterval:   time.Hour,
	}
}

// waitStopping waits until the stop releases the mutex and goes to wait for the goroutines.
func waitStopping(t *testing.T, hub *Hub) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		hub.mu.Lock()
		stopping := hub.stop == nil
		hub.mu.Unlock()

		if stopping {
			return
		}

		time.Sleep(time.Millisecond)
	}

	t.Fatal("stopping the sources did not start")
}

func readTopics(t *testing.T, ch <-chan Event, want int) {
	t.Helper()

	for range want {
		select {
		case <-ch:
		case <-time.After(2 * time.Second):
			t.Fatal("the source set did not send state")
		}
	}
}

// The last reader left, the first came while the stop waits for the goroutines:
// the returned stop does not erase the state of the already new set.
func TestHubStopKeepsNextGeneration(t *testing.T) {
	source := newStallSource()
	hub := New(source, testLogger(t), slowOptions())

	first, _, leave, _ := hub.subscribe()
	readTopics(t, first.ch, 3)

	left := make(chan struct{})

	go func() {
		defer close(left)
		leave()
	}()

	waitStopping(t, hub)

	next, _, cancel, _ := hub.subscribe()
	defer cancel()

	// traffic, memory and service of the new set.
	readTopics(t, next.ch, 3)

	close(source.release)
	<-left

	hub.mu.Lock()
	remembered, running := len(hub.last), hub.stop != nil
	hub.mu.Unlock()

	if !running {
		t.Error("a returned stop shut down the new set")
	}
	if remembered != 3 {
		t.Errorf("after the join %d topics are remembered, expected 3 of the new set", remembered)
	}
}

// A reader that came while Close waits for the goroutines gets a closed channel:
// otherwise its handler would hold the daemon stop until the timeout.
func TestHubCloseRejectsLateSubscriber(t *testing.T) {
	source := newStallSource()
	hub := New(source, testLogger(t), slowOptions())

	first, _, _, _ := hub.subscribe()
	readTopics(t, first.ch, 3)

	closed := make(chan struct{})

	go func() {
		defer close(closed)
		hub.Close()
	}()

	waitStopping(t, hub)

	late, recent, cancel, _ := hub.subscribe()
	defer cancel()

	if len(recent) != 0 {
		t.Errorf("after Close %d events repeated", len(recent))
	}

	select {
	case _, ok := <-late.ch:
		if ok {
			t.Error("a reader after Close receives events")
		}
	case <-time.After(time.Second):
		t.Error("reader channel after Close is not closed")
	}

	close(source.release)
	<-closed

	hub.mu.Lock()
	running := hub.stop != nil
	hub.mu.Unlock()

	if running {
		t.Error("after Close the sources were started again")
	}
}

// floodSource sends lines without pauses while the subscription is alive.
type floodSource struct {
	fakeSource
}

func (s *floodSource) Stream(ctx context.Context, _ string, sink func(json.RawMessage)) error {
	line := json.RawMessage(`{"pad":"` + strings.Repeat("x", 32<<10) + `"}`)

	for ctx.Err() == nil {
		sink(line)
	}

	return ctx.Err()
}

// A client that holds the socket and does not read releases the handler by the write
// deadline, not by the TCP retransmission timeout.
func TestHubWriteDeadline(t *testing.T) {
	opts := fastOptions()
	opts.WriteTimeout = 50 * time.Millisecond

	hub := New(&floodSource{}, testLogger(t), opts)
	returned := make(chan struct{})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(returned)
		hub.ServeHTTP(w, r)
	}))
	defer srv.Close()

	conn, err := net.Dial("tcp", srv.Listener.Addr().String())
	if err != nil {
		t.Fatalf("connection: %v", err)
	}
	defer func() { _ = conn.Close() }()

	// The request goes out, the response is not read: the socket buffers fill, and the handler
	// write stalls.
	if _, err := io.WriteString(conn, "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"); err != nil {
		t.Fatalf("request: %v", err)
	}

	select {
	case <-returned:
	case <-time.After(10 * time.Second):
		t.Fatal("the handler holds a non-reading client: the write deadline did not fire")
	}
}

// A line longer than the ceiling breaks the stream and does not pile up in memory.
func TestLinesLimit(t *testing.T) {
	long := `{"pad":"` + strings.Repeat("x", maxLineBytes) + `"}`

	var got []string

	err := lines(strings.NewReader("{\"up\":1}\n"+long+"\n{\"up\":2}\n"), func(line json.RawMessage) {
		got = append(got, string(line))
	})

	if !errors.Is(err, bufio.ErrTooLong) {
		t.Errorf("error %v, expected bufio.ErrTooLong", err)
	}
	if len(got) != 1 || got[0] != `{"up":1}` {
		t.Errorf("before the break lines %q were returned, expected only the first", got)
	}
}

// The end of a response is a stream break: the source reconnects after a pause.
func TestLinesEOF(t *testing.T) {
	var got []string

	err := lines(strings.NewReader("{\"up\":1}\r\n\n  {\"up\":2}"), func(line json.RawMessage) {
		got = append(got, string(line))
	})

	if !errors.Is(err, io.EOF) {
		t.Errorf("error %v, expected io.EOF", err)
	}
	if len(got) != 2 || got[0] != `{"up":1}` || got[1] != `{"up":2}` {
		t.Errorf("lines %q returned, expected two lines without edge spaces", got)
	}
}

// frameWriter drops the stream body and reports every flushed connections frame.
type frameWriter struct {
	header http.Header
	frames chan struct{}
	seen   bool
}

func (w *frameWriter) Header() http.Header { return w.header }

func (w *frameWriter) WriteHeader(int) {}

func (w *frameWriter) Write(p []byte) (int, error) {
	if strings.Contains(string(p[:min(len(p), 64)]), "event: "+TopicConnections) {
		w.seen = true
	}

	return len(p), nil
}

func (w *frameWriter) Flush() {
	if w.seen {
		w.seen = false
		w.frames <- struct{}{}
	}
}

// The benchmark is the price of one connections tick of five thousand entries
// delivered to MaxSubscribers readers: translation plus the write to every stream.
func BenchmarkHubFanOut5000(b *testing.B) {
	const readers = 8

	hub := New(&fakeSource{}, slog.New(slog.NewTextHandler(io.Discard, nil)), Options{
		ServiceInterval: time.Hour,
		SystemInterval:  time.Hour,
		RetryInterval:   time.Hour,
		KeepAlive:       time.Hour,
	})
	raw := clashSnapshot5000()

	ctx, cancel := context.WithCancel(context.Background())
	frames := make(chan struct{}, readers)

	var wg sync.WaitGroup

	for range readers {
		wg.Add(1)

		go func() {
			defer wg.Done()

			w := &frameWriter{header: make(http.Header), frames: frames}
			hub.ServeHTTP(w, httptest.NewRequestWithContext(ctx, http.MethodGet, "/", nil))
		}()
	}

	for {
		hub.mu.Lock()
		n := len(hub.subscribers)
		hub.mu.Unlock()

		if n == readers {
			break
		}

		time.Sleep(time.Millisecond)
	}

	b.ReportAllocs()

	for b.Loop() {
		hub.PublishConnections(raw)

		for range readers {
			<-frames
		}
	}

	b.StopTimer()
	cancel()
	wg.Wait()
}

// Beyond MaxSubscribers a reader is refused with a status it can retry on, and a
// departed reader frees its slot.
func TestHubLimitsSubscribers(t *testing.T) {
	hub := New(&fakeSource{}, testLogger(t), fastOptions())
	defer hub.Close()

	leave := make([]func(), 0, MaxSubscribers)

	for range MaxSubscribers {
		_, _, cancel, err := hub.subscribe()
		if err != nil {
			t.Fatalf("a reader within the limit was refused: %v", err)
		}

		leave = append(leave, cancel)
	}

	recorder := httptest.NewRecorder()
	hub.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

	if recorder.Code != http.StatusTooManyRequests {
		t.Errorf("code %d, expected %d", recorder.Code, http.StatusTooManyRequests)
	}
	if recorder.Header().Get("Retry-After") == "" {
		t.Error("the refusal does not say when to retry")
	}

	leave[0]()

	_, _, cancel, err := hub.subscribe()
	if err != nil {
		t.Fatalf("the slot of a departed reader is not freed: %v", err)
	}

	cancel()

	for _, cancel := range leave[1:] {
		cancel()
	}
}

// The envelope written by hand is the one json.Marshal gives for the same event.
func TestWriteEventMatchesMarshal(t *testing.T) {
	event := Event{Topic: TopicConnections, Seq: 42, Data: json.RawMessage(`{"connections":[{"id":"a"}],"memory":1}`)}

	body, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	recorder := httptest.NewRecorder()
	if !writeEvent(recorder, event) {
		t.Fatal("write failed")
	}

	want := "event: " + TopicConnections + "\ndata: " + string(body) + "\n\n"
	if got := recorder.Body.String(); got != want {
		t.Errorf("frame %q, expected %q", got, want)
	}
}

// Data is compacted once at publication: a reader gets it without the source whitespace.
func TestHubCompactsOnce(t *testing.T) {
	hub := New(&fakeSource{}, testLogger(t), fastOptions())
	defer hub.Close()

	sub, _, cancel, err := hub.subscribe()
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer cancel()

	hub.mu.Lock()
	gen := hub.gen
	hub.mu.Unlock()

	hub.publish(gen, TopicTraffic, json.RawMessage("{ \"up\" : 1,\n \"down\": 2 }"))

	deadline := time.After(time.Second)

	for {
		select {
		case event := <-sub.ch:
			if event.Topic != TopicTraffic {
				continue
			}

			if got := string(event.Data); got != `{"up":1,"down":2}` {
				t.Errorf("data %q, expected the compact form", got)
			}

			return
		case <-deadline:
			t.Fatal("the event did not reach the reader")
		}
	}
}
