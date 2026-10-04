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

// fakeSource считает подписки и отдаёт заранее заданные данные.
type fakeSource struct {
	mu sync.Mutex

	streams atomic.Int64
	service json.RawMessage
	system  json.RawMessage

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

// pushConnections кормит Hub снапшотами с частотой счётчика, пока тест идёт.
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
			t.Fatalf("чтение события %d из %d: %v", len(events)+1, want, err)
		}

		events = append(events, event)
	}

	return events
}

// Поток не поднимается, пока нет читателя: устройство большую часть времени
// простаивает, и фоновый опрос без потребителя там не нужен.
func TestHubIdleWithoutSubscribers(t *testing.T) {
	source := &fakeSource{service: json.RawMessage(`{}`)}
	New(source, testLogger(t), fastOptions())

	time.Sleep(50 * time.Millisecond)

	if got := source.streams.Load(); got != 0 {
		t.Errorf("источник опрошен без читателей: %d подписок", got)
	}
}

// Снапшот в форме Clash API: демон переводит его в свой контракт, и мок обязан
// приходить в той же форме, что и настоящий источник.
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

	response, err := srv.Client().Get(srv.URL) //nolint:noctx // соединение закрывается ниже
	if err != nil {
		t.Fatalf("подключение к потоку: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	if got := response.Header.Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("тип ответа %q, ожидали text/event-stream", got)
	}

	want := []string{TopicTraffic, TopicMemory, TopicConnections, TopicService}
	seen := make(map[string]bool)
	reader := newSSEReader(response.Body)

	// Порядок топиков не определён: читается до полного набора, а не ровно
	// столько событий, сколько топиков.
	for range 100 {
		event, err := reader.next()
		if err != nil {
			t.Fatalf("чтение события: %v", err)
		}

		if event.Seq == 0 {
			t.Errorf("событие без номера: %+v", event)
		}

		seen[event.Topic] = true

		if len(seen) == len(want) {
			break
		}
	}

	for _, topic := range want {
		if !seen[topic] {
			t.Errorf("топик %q в потоке не появился, пришли %v", topic, seen)
		}
	}
}

// Второй читатель не удваивает нагрузку на sing-box: апстрим остаётся один.
func TestHubSharesUpstream(t *testing.T) {
	source := &fakeSource{service: json.RawMessage(`{}`)}
	hub := New(source, testLogger(t), fastOptions())

	srv := httptest.NewServer(hub)
	defer srv.Close()

	first, err := srv.Client().Get(srv.URL) //nolint:noctx // соединение закрывается ниже
	if err != nil {
		t.Fatalf("первый читатель: %v", err)
	}
	defer func() { _ = first.Body.Close() }()

	// Ждём, пока поднимутся обе построчные подписки: снимок счётчика сразу
	// после первого события ловил бы момент, когда часть горутин ещё не
	// стартовала, и тест мигал бы.
	const wantStreams = 2
	waitStreams(t, source, wantStreams)

	second, err := srv.Client().Get(srv.URL) //nolint:noctx // соединение закрывается ниже
	if err != nil {
		t.Fatalf("второй читатель: %v", err)
	}
	defer func() { _ = second.Body.Close() }()

	readEvents(t, second.Body, 1)

	if got := source.streams.Load(); got != wantStreams {
		t.Errorf("подписок на источник %d, ожидали %d: апстрим не разделён", got, wantStreams)
	}
}

// Подключившийся читатель получает текущее состояние сразу, а не через период
// опроса: иначе экран после перезагрузки страницы был бы пустым до секунды.
func TestHubReplaysLastState(t *testing.T) {
	source := &fakeSource{service: json.RawMessage(`{"status":"running"}`)}
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
	source := &fakeSource{service: json.RawMessage(`{}`)}
	hub := New(source, testLogger(t), fastOptions())

	sub, _, cancel := hub.subscribe()

	select {
	case <-sub.ch:
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

func waitStreams(t *testing.T, source *fakeSource, want int64) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if source.streams.Load() >= want {
			return
		}

		time.Sleep(5 * time.Millisecond)
	}

	t.Fatalf("подписок на источник %d, ожидали %d", source.streams.Load(), want)
}

// Номера у читателя идут подряд с единицы, включая повтор состояния при
// подключении: иначе панель приняла бы начало потока за пропуск.
func TestHubNumbersPerSubscriber(t *testing.T) {
	source := &fakeSource{
		service: json.RawMessage(`{}`),
		lines:   []json.RawMessage{json.RawMessage(`{"up":1}`)},
	}

	srv := httptest.NewServer(New(source, testLogger(t), fastOptions()))
	defer srv.Close()

	first, err := srv.Client().Get(srv.URL) //nolint:noctx // соединение закрывается ниже
	if err != nil {
		t.Fatalf("первый читатель: %v", err)
	}
	defer func() { _ = first.Body.Close() }()

	for i, event := range readEvents(t, first.Body, 5) {
		if want := uint64(i + 1); event.Seq != want {
			t.Fatalf("номер события %d: получили %d, ожидали %d", i, event.Seq, want)
		}
	}

	// Подключившийся позже начинает с единицы, а не с номера общего счётчика.
	late, err := srv.Client().Get(srv.URL) //nolint:noctx // соединение закрывается ниже
	if err != nil {
		t.Fatalf("поздний читатель: %v", err)
	}
	defer func() { _ = late.Body.Close() }()

	if got := readEvents(t, late.Body, 1)[0]; got.Seq != 1 {
		t.Errorf("первый номер у позднего читателя %d, ожидали 1", got.Seq)
	}
}

// Битая строка источника не должна оседать в состоянии топика.
func TestHubSkipsInvalidLines(t *testing.T) {
	source := &fakeSource{
		service: json.RawMessage(`{}`),
		lines:   []json.RawMessage{json.RawMessage("не json"), json.RawMessage(`{"up":7}`)},
	}

	srv := httptest.NewServer(New(source, testLogger(t), fastOptions()))
	defer srv.Close()

	response, err := srv.Client().Get(srv.URL) //nolint:noctx // соединение закрывается ниже
	if err != nil {
		t.Fatalf("подключение: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	for _, event := range readEvents(t, response.Body, 6) {
		if event.Topic == TopicTraffic && string(event.Data) != `{"up":7}` {
			t.Errorf("в топик трафика попало %q", event.Data)
		}
	}
}

// Уход апстрима не должен оставлять новому читателю данные мёртвого потока.
func TestHubForgetsStateAfterStop(t *testing.T) {
	source := &fakeSource{service: json.RawMessage(`{}`)}
	hub := New(source, testLogger(t), fastOptions())

	sub, _, cancel := hub.subscribe()

	select {
	case <-sub.ch:
	case <-time.After(time.Second):
		t.Fatal("события не пошли")
	}

	cancel()

	hub.mu.Lock()
	remembered := len(hub.last)
	hub.mu.Unlock()

	if remembered != 0 {
		t.Errorf("после остановки помнится %d топиков, ожидали 0", remembered)
	}
}

// Close закрывает читателей: без этого остановка демона ждала бы их ухода.
func TestHubCloseReleasesSubscribers(t *testing.T) {
	hub := New(&fakeSource{service: json.RawMessage(`{}`)}, testLogger(t), fastOptions())

	sub, _, _ := hub.subscribe()
	hub.Close()

	for range sub.ch { //nolint:revive // вычитываем остаток очереди до закрытия
	}

	hub.mu.Lock()
	left := len(hub.subscribers)
	hub.mu.Unlock()

	if left != 0 {
		t.Errorf("после Close осталось читателей: %d", left)
	}
}

// Снапшот счётчика переводится в контракт демона и доходит до читателя.
func TestHubPublishesCounterSnapshot(t *testing.T) {
	hub := New(&fakeSource{service: json.RawMessage(`{}`)}, testLogger(t), fastOptions())

	sub, _, cancel := hub.subscribe()
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
				t.Errorf("снапшот не переведён в контракт: %s", event.Data)
			}

			return
		case <-deadline:
			t.Fatal("снапшот счётчика до читателя не дошёл")
		}
	}
}

// Без читателей снапшот отбрасывается и не оседает в состоянии топика: данные
// умершего к моменту подписки апстрима не должны выглядеть текущими.
func TestHubDropsConnectionsWithoutReaders(t *testing.T) {
	hub := New(&fakeSource{service: json.RawMessage(`{}`)}, testLogger(t), fastOptions())

	hub.PublishConnections(json.RawMessage(clashSnapshotBody))

	hub.mu.Lock()
	remembered := len(hub.last)
	hub.mu.Unlock()

	if remembered != 0 {
		t.Errorf("без читателей в состоянии осело %d топиков", remembered)
	}
}

// fakeSink считает, что накопил учёт.
type fakeSink struct {
	proxy   atomic.Int64
	samples atomic.Int64
}

func (f *fakeSink) AddProxy(bytes int64)         { f.proxy.Add(bytes) }
func (f *fakeSink) SampleDevice(context.Context) { f.samples.Add(1) }

// fakeRecorder считает сэмплы, ушедшие в историю.
type fakeRecorder struct {
	records atomic.Int64
}

func (f *fakeRecorder) Record(int64, int64) { f.records.Add(1) }

// Доля канала считается за всё время работы демона, поэтому учёт идёт и без
// единого читателя потока.
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
		"учёт накопил %d байт за %d снятий, в историю ушло %d сэмплов",
		sink.proxy.Load(), sink.samples.Load(), recorder.records.Load(),
	)
}

// stallSource держит горутины первого комплекта после отмены, пока тест не
// закроет release: окно, в котором остановка ждёт их без мьютекса, остаётся
// открытым сколько нужно.
type stallSource struct {
	fakeSource

	calls   atomic.Int64
	release chan struct{}
}

func (s *stallSource) Stream(ctx context.Context, path string, sink func(json.RawMessage)) error {
	// Первый комплект поднимает два потока — /traffic и /memory.
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

// slowOptions публикует каждый топик один раз за комплект: состояние, которое
// осталось после стыка, не перезапишется следующим периодом опроса.
func slowOptions() Options {
	return Options{
		ServiceInterval: time.Hour,
		SystemInterval:  time.Hour,
		RetryInterval:   time.Hour,
	}
}

// waitStopping ждёт, пока остановка отпустит мьютекс и уйдёт ждать горутины.
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

	t.Fatal("остановка источников не началась")
}

func readTopics(t *testing.T, ch <-chan Event, want int) {
	t.Helper()

	for range want {
		select {
		case <-ch:
		case <-time.After(2 * time.Second):
			t.Fatal("комплект источников не прислал состояние")
		}
	}
}

// Последний читатель ушёл, первый пришёл, пока остановка ждёт горутины:
// вернувшаяся остановка не стирает состояние уже нового комплекта.
func TestHubStopKeepsNextGeneration(t *testing.T) {
	source := newStallSource()
	hub := New(source, testLogger(t), slowOptions())

	first, _, leave := hub.subscribe()
	readTopics(t, first.ch, 3)

	left := make(chan struct{})

	go func() {
		defer close(left)
		leave()
	}()

	waitStopping(t, hub)

	next, _, cancel := hub.subscribe()
	defer cancel()

	// traffic, memory и service нового комплекта.
	readTopics(t, next.ch, 3)

	close(source.release)
	<-left

	hub.mu.Lock()
	remembered, running := len(hub.last), hub.stop != nil
	hub.mu.Unlock()

	if !running {
		t.Error("вернувшаяся остановка погасила новый комплект")
	}
	if remembered != 3 {
		t.Errorf("после стыка помнится %d топиков, ожидали 3 нового комплекта", remembered)
	}
}

// Читатель, пришедший, пока Close ждёт горутины, получает закрытый канал:
// иначе его хендлер держал бы остановку демона до таймаута.
func TestHubCloseRejectsLateSubscriber(t *testing.T) {
	source := newStallSource()
	hub := New(source, testLogger(t), slowOptions())

	first, _, _ := hub.subscribe()
	readTopics(t, first.ch, 3)

	closed := make(chan struct{})

	go func() {
		defer close(closed)
		hub.Close()
	}()

	waitStopping(t, hub)

	late, recent, cancel := hub.subscribe()
	defer cancel()

	if len(recent) != 0 {
		t.Errorf("после Close повторено %d событий", len(recent))
	}

	select {
	case _, ok := <-late.ch:
		if ok {
			t.Error("читатель после Close получает события")
		}
	case <-time.After(time.Second):
		t.Error("канал читателя после Close не закрыт")
	}

	close(source.release)
	<-closed

	hub.mu.Lock()
	running := hub.stop != nil
	hub.mu.Unlock()

	if running {
		t.Error("после Close источники подняты заново")
	}
}

// floodSource шлёт строки без пауз, пока подписка жива.
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

// Клиент, который держит сокет и не читает, отпускает хендлер по дедлайну
// записи, а не по TCP-таймауту ретрансмиссий.
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
		t.Fatalf("подключение: %v", err)
	}
	defer func() { _ = conn.Close() }()

	// Запрос уходит, ответ не читается: буферы сокета заполняются, и запись
	// хендлера встаёт.
	if _, err := io.WriteString(conn, "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"); err != nil {
		t.Fatalf("запрос: %v", err)
	}

	select {
	case <-returned:
	case <-time.After(10 * time.Second):
		t.Fatal("хендлер держит нечитающего клиента: дедлайн записи не сработал")
	}
}

// Строка длиннее потолка обрывает поток, а не копится в памяти.
func TestLinesLimit(t *testing.T) {
	long := `{"pad":"` + strings.Repeat("x", maxLineBytes) + `"}`

	var got []string

	err := lines(strings.NewReader("{\"up\":1}\n"+long+"\n{\"up\":2}\n"), func(line json.RawMessage) {
		got = append(got, string(line))
	})

	if !errors.Is(err, bufio.ErrTooLong) {
		t.Errorf("ошибка %v, ожидали bufio.ErrTooLong", err)
	}
	if len(got) != 1 || got[0] != `{"up":1}` {
		t.Errorf("до обрыва отданы строки %q, ожидали только первую", got)
	}
}

// Конец ответа — обрыв потока: источник переподключается после паузы.
func TestLinesEOF(t *testing.T) {
	var got []string

	err := lines(strings.NewReader("{\"up\":1}\r\n\n  {\"up\":2}"), func(line json.RawMessage) {
		got = append(got, string(line))
	})

	if !errors.Is(err, io.EOF) {
		t.Errorf("ошибка %v, ожидали io.EOF", err)
	}
	if len(got) != 2 || got[0] != `{"up":1}` || got[1] != `{"up":2}` {
		t.Errorf("отданы строки %q, ожидали две строки без пробелов по краям", got)
	}
}
