package apply_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io/fs"
	"log/slog"
	"slices"
	"sync"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/clashapi"
	"metabox/internal/config"
)

const (
	window       = time.Minute
	cycleTimeout = 30 * time.Second
	clashPort    = 9090
	configDir    = "/etc/sing-box"
)

// recorder хранит порядок вызовов: протокол применения задаёт не только набор
// шагов, но и их очерёдность — состояние обязано лечь на диск до конфига.
type recorder struct {
	mu    sync.Mutex
	calls []string
}

func (r *recorder) add(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.calls = append(r.calls, name)
}

func (r *recorder) snapshot() []string {
	r.mu.Lock()
	defer r.mu.Unlock()

	return slices.Clone(r.calls)
}

func (r *recorder) index(name string) int {
	return slices.Index(r.snapshot(), name)
}

type fakeStore struct {
	rec *recorder

	mu         sync.Mutex
	sum        string
	sumErr     error
	written    []byte
	state      []byte
	lists      map[string][]byte
	listsErr   error
	backupErr  error
	restoreErr error
	writeErr   error
	readErr    error
	clearErr   error

	// Ворота для тестов гонок: started закрывается на входе в шаг, release
	// держит шаг, пока тест не отпустит.
	restoreStarted chan struct{}
	restoreRelease chan struct{}
	clearStarted   chan struct{}
	clearRelease   chan struct{}
}

func (s *fakeStore) Sum(context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.sum, s.sumErr
}

func (s *fakeStore) Write(_ context.Context, data []byte) error {
	s.rec.add("Write")

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.writeErr != nil {
		return s.writeErr
	}
	s.written = data

	return nil
}

func (s *fakeStore) Read(context.Context) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.readErr != nil {
		return nil, s.readErr
	}

	return s.written, nil
}

func (s *fakeStore) SaveVersion(_ context.Context, _ []byte) error {
	s.rec.add("SaveVersion")

	return nil
}

func (s *fakeStore) Backup(context.Context) error {
	s.rec.add("Backup")

	return s.backupErr
}

func (s *fakeStore) Restore(context.Context) error {
	s.rec.add("Restore")

	if s.restoreStarted != nil {
		close(s.restoreStarted)
	}
	if s.restoreRelease != nil {
		<-s.restoreRelease
	}

	return s.restoreErr
}

func (s *fakeStore) StageCandidate(context.Context, string, []byte, map[string][]byte, []string) error {
	s.rec.add("StageCandidate")

	return nil
}

func (s *fakeStore) ListSums(context.Context) (map[string]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.listsErr != nil {
		return nil, s.listsErr
	}

	sums := make(map[string]string, len(s.lists))
	for name, data := range s.lists {
		sums[name] = config.Sum(data)
	}

	return sums, nil
}

func (s *fakeStore) WriteLists(_ context.Context, put map[string][]byte, remove []string) error {
	s.rec.add("WriteLists")

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.writeErr != nil {
		return s.writeErr
	}

	if s.lists == nil {
		s.lists = map[string][]byte{}
	}

	for name, data := range put {
		s.lists[name] = data
	}

	for _, name := range remove {
		delete(s.lists, name)
	}

	return nil
}

func (s *fakeStore) ReadState(context.Context) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.state == nil {
		return nil, config.ErrNoState
	}

	return s.state, nil
}

func (s *fakeStore) WriteState(_ context.Context, data []byte) error {
	s.rec.add("WriteState")

	s.mu.Lock()
	defer s.mu.Unlock()
	s.state = data

	return nil
}

func (s *fakeStore) ClearState(context.Context) error {
	s.rec.add("ClearState")

	if s.clearStarted != nil {
		close(s.clearStarted)
	}
	if s.clearRelease != nil {
		<-s.clearRelease
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.clearErr != nil {
		return s.clearErr
	}
	s.state = nil

	return nil
}

func (s *fakeStore) config() []byte {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.written
}

type fakeService struct {
	rec      *recorder
	checkErr error
	// workdir — рабочий каталог службы; пусто — неизвестен.
	workdir    string
	workdirErr error

	mu         sync.Mutex
	restartErr error
	// pid — процесс службы, как его видит procd: каждый рестарт поднимает
	// новый.
	pid    int
	pidErr error
	// lag — сколько опросов после рестарта procd ещё отдаёт прежний pid;
	// отрицательный — прежний отдаётся всегда. stale — остаток текущего
	// рестарта.
	lag   int
	stale int
}

func (s *fakeService) Check(context.Context, string) error {
	s.rec.add("Check")

	return s.checkErr
}

func (s *fakeService) Restart(context.Context) error {
	s.rec.add("Restart")

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.restartErr != nil {
		return s.restartErr
	}

	s.pid++
	s.stale = s.lag

	return nil
}

func (s *fakeService) PID(context.Context) (int, error) {
	s.rec.add("PID")

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.pidErr != nil {
		return 0, s.pidErr
	}

	if s.stale != 0 {
		if s.stale > 0 {
			s.stale--
		}

		return s.pid - 1, nil
	}

	return s.pid, nil
}

func (s *fakeService) Workdir(context.Context) (string, error) {
	return s.workdir, s.workdirErr
}

func (s *fakeService) setRestartErr(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.restartErr = err
}

type fakeHealth struct {
	rec *recorder
	err error
}

func (h *fakeHealth) Wait(context.Context, clashapi.Settings) error {
	h.rec.add("Wait")

	return h.err
}

// fakeClock отдаёт окно подтверждения под управлением теста: ждать минуту
// по-настоящему тест не должен.
type fakeClock struct {
	fired  chan time.Time
	called chan time.Duration
}

func newClock() *fakeClock {
	return &fakeClock{fired: make(chan time.Time), called: make(chan time.Duration, 4)}
}

func (c *fakeClock) After(d time.Duration) <-chan time.Time {
	c.called <- d

	return c.fired
}

// fire отдаёт срок и возвращается только после того, как его приняли: канал
// без буфера делает отправку точкой синхронизации. С буфером тест успевал
// закрыть менеджер до того, как горутина войдёт в select, — в нём оказывались
// готовы сразу две ветви, и Go выбирал между откатом и остановкой случайно.
func (c *fakeClock) fire() {
	c.fired <- time.Time{}
}

type harness struct {
	manager *apply.Manager
	store   *fakeStore
	service *fakeService
	health  *fakeHealth
	clock   *fakeClock
	rec     *recorder
}

func newHarness(t *testing.T) *harness {
	t.Helper()

	return newHarnessWith(t, cycleTimeout, slog.New(slog.DiscardHandler))
}

// newHarnessWith — тот же стенд с заданным потолком цикла и логгером: тесты
// отказа по таймауту не ждут полминуты, а тесты логов читают записи.
func newHarnessWith(t *testing.T, timeout time.Duration, log *slog.Logger) *harness {
	t.Helper()

	rec := &recorder{}
	h := &harness{
		rec:     rec,
		store:   &fakeStore{rec: rec},
		service: &fakeService{rec: rec},
		health:  &fakeHealth{rec: rec},
		clock:   newClock(),
	}
	h.manager = apply.New(h.store, h.service, h.health, h.clock, log, apply.Options{
		Window:          window,
		ClashPort:       clashPort,
		CycleTimeout:    timeout,
		ConfigDir:       configDir,
		ProcessInterval: time.Millisecond,
	})

	t.Cleanup(h.manager.Close)

	return h
}

// waitWindow дожидается, пока применение дойдёт до окна подтверждения.
func (h *harness) waitWindow(t *testing.T) time.Duration {
	t.Helper()

	select {
	case d := <-h.clock.called:
		return d
	case <-time.After(5 * time.Second):
		t.Fatal("применение не дошло до окна подтверждения")

		return 0
	}
}

const validConfig = `{"log":{"level":"info"}}`

func TestApplyFollowsProtocolOrder(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("применение: %v", err)
	}
	if tx.ID == "" {
		t.Error("транзакция без идентификатора")
	}

	if got := h.waitWindow(t); got != window {
		t.Errorf("окно %v, ожидали %v", got, window)
	}

	// SaveVersion стоит между бэкапом и записью: история хранит то, что было
	// применено до этого цикла. pid службы снимается до рестарта и сверяется
	// после него, до опроса API.
	want := []string{
		"StageCandidate", "Check", "WriteState", "Backup", "SaveVersion", "WriteLists", "Write",
		"PID", "Restart", "PID", "Wait", "WriteState",
	}
	if got := h.rec.snapshot(); !slices.Equal(got, want) {
		t.Errorf("порядок шагов %v, ожидали %v", got, want)
	}

	if h.manager.Current().Phase != apply.PhaseAwaitingConfirm {
		t.Errorf("фаза %q, ожидали ожидание подтверждения", h.manager.Current().Phase)
	}
}

// Панель показывает остаток окна пользователю: полная длительность после
// перезагрузки страницы была бы обещанием, которого демон не даёт.
func TestCurrentReportsRemainingWindow(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	left := h.manager.Current().Window

	if left <= 0 || left > window {
		t.Fatalf("остаток окна %v, ожидали значение в пределах %v", left, window)
	}
	if later := h.manager.Current().Window; later > left {
		t.Errorf("остаток вырос: было %v, стало %v", left, later)
	}
}

// Состояние обязано лечь на диск раньше конфига: питание, снятое между
// записью и стартом таймера, иначе оставило бы устройство без автоотката.
func TestStateIsWrittenBeforeConfig(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	if state, write := h.rec.index("WriteState"), h.rec.index("Write"); state > write || state < 0 {
		t.Errorf("состояние записано %d-м, конфиг %d-м", state, write)
	}
}

// Отказ check обязан остановить применение до того, как что-либо записано.
func TestCheckFailureWritesNothing(t *testing.T) {
	h := newHarness(t)
	h.service.checkErr = &singboxCheckError{}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err == nil {
		t.Fatal("битый конфиг принят")
	}

	if got := h.rec.snapshot(); slices.Contains(got, "Write") || slices.Contains(got, "WriteState") {
		t.Errorf("после отказа check что-то записано: %v", got)
	}
	if got := h.manager.Current(); got.Phase != "" {
		t.Errorf("заведена транзакция %+v: применения не было", got)
	}

	// Отказ обязан освободить применение, иначе первый же битый конфиг
	// заклинивает демон до перезапуска.
	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); errors.Is(err, apply.ErrBusy) {
		t.Error("после отказа check применение осталось занятым")
	}
}

// Между резервированием и появлением транзакции второй Start не должен
// проскакивать: у конфига один владелец.
func TestConcurrentStartsAreSerialised(t *testing.T) {
	h := newHarness(t)

	const attempts = 8

	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		accepted int
	)

	for range attempts {
		wg.Add(1)

		go func() {
			defer wg.Done()

			if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err == nil {
				mu.Lock()
				accepted++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if accepted != 1 {
		t.Errorf("принято применений: %d, ожидали одно", accepted)
	}
}

type singboxCheckError struct{}

func (*singboxCheckError) Error() string { return "sing-box check: код 1" }

func TestConfirmClosesWindow(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	confirmed, err := h.manager.Confirm(t.Context(), tx.ID)
	if err != nil {
		t.Fatalf("подтверждение: %v", err)
	}
	if confirmed.Phase != apply.PhaseConfirmed {
		t.Errorf("фаза %q, ожидали подтверждение", confirmed.Phase)
	}

	h.manager.Close()

	if slices.Contains(h.rec.snapshot(), "Restore") {
		t.Error("подтверждённое применение всё равно откатилось")
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("состояние подтверждённой транзакции осталось на диске")
	}
}

// Без подтверждения в срок конфиг обязан вернуться.
func TestRollbackWithoutConfirmation(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	h.clock.fire()
	h.manager.Close()

	if !slices.Contains(h.rec.snapshot(), "Restore") {
		t.Fatalf("отката не было: %v", h.rec.snapshot())
	}
	if got := h.manager.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("фаза %q, ожидали откат", got)
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("состояние откаченной транзакции осталось на диске")
	}
}

func TestConfirmRejectsForeignTransaction(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), "чужой"); !errors.Is(err, apply.ErrUnknownTransaction) {
		t.Errorf("получили %v, ожидали ErrUnknownTransaction", err)
	}

	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("подтверждение: %v", err)
	}
	if _, err := h.manager.Confirm(t.Context(), tx.ID); !errors.Is(err, apply.ErrNothingToConfirm) {
		t.Errorf("повторное подтверждение: получили %v, ожидали ErrNothingToConfirm", err)
	}
}

// Второе применение при активной транзакции — ошибка контракта, а не гонка за
// файл: у конфига один владелец.
func TestSecondApplyIsRejected(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("первое применение: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("получили %v, ожидали ErrBusy", err)
	}
}

// Подтверждение освобождает применение сразу: клиент, подтвердивший и тут же
// применивший снова, не должен получать отказ из-за ещё живой горутины.
func TestApplyIsFreeRightAfterConfirm(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("первое применение: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("подтверждение: %v", err)
	}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); errors.Is(err, apply.ErrBusy) {
		t.Error("после подтверждения применение осталось занятым")
	}
}

// Откат тоже освобождает применение сразу: иначе после автоотката владелец не
// может применить исправленный конфиг, пока не выйдет горутина.
func TestApplyIsFreeRightAfterRollback(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("первое применение: %v", err)
	}
	h.waitWindow(t)

	h.clock.fire()
	h.manager.Close()

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); errors.Is(err, apply.ErrBusy) {
		t.Error("после отката применение осталось занятым")
	}
}

// Конфиг мог поправить владелец по SSH — затирать это молча нельзя.
func TestExternalEditIsDetected(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)
	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("подтверждение: %v", err)
	}

	h.store.mu.Lock()
	h.store.sum = "правка мимо демона"
	h.store.mu.Unlock()

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrConfigModified) {
		t.Errorf("получили %v, ожидали ErrConfigModified", err)
	}
}

func TestClashAPIIsGuaranteed(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	if !tx.ClashAPIAdded {
		t.Error("добавление секции не отмечено в транзакции: пользователь его не увидит")
	}

	settings, err := clashapi.Read(h.store.config())
	if err != nil {
		t.Fatalf("чтение секции: %v", err)
	}
	if settings.Address == "" {
		t.Error("записан конфиг без работающего clash_api")
	}
}

// Причина отказа уходит панели кодом шага: по нему она берёт текст на языке
// пользователя, а не показывает ошибку демона как есть.
func TestFailureCarriesStepCode(t *testing.T) {
	tests := []struct {
		name  string
		setup func(h *harness)
		want  apply.ReasonCode
	}{
		{
			name:  "конфиг не записался",
			setup: func(h *harness) { h.store.writeErr = errors.New("диск переполнен") },
			want:  apply.ReasonWriteFailed,
		},
		{
			name:  "рантайм не ответил",
			setup: func(h *harness) { h.health.err = errors.New("порт молчит") },
			want:  apply.ReasonHealthcheckFailed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)
			tt.setup(h)

			if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
				t.Fatalf("применение: %v", err)
			}

			tx := waitPhase(t, h, apply.PhaseRolledBack)

			if tx.ReasonCode != tt.want {
				t.Errorf("код причины %q, ожидали %q", tx.ReasonCode, tt.want)
			}
			if tx.Reason == "" {
				t.Error("подробность шага потеряна: чинить отказ будет не по чему")
			}
		})
	}
}

// Подтверждение на последних секундах окна: таймер успел первым, откат уже
// трогает диск. Confirm обязан получить отказ, а не вернуть успех на фоне
// отката, и новый Start в этот момент тоже не пускается.
func TestConfirmDuringRollbackIsRejected(t *testing.T) {
	h := newHarness(t)
	h.store.restoreStarted = make(chan struct{})
	h.store.restoreRelease = make(chan struct{})

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	h.clock.fire()
	<-h.store.restoreStarted

	if _, err := h.manager.Confirm(t.Context(), tx.ID); !errors.Is(err, apply.ErrNothingToConfirm) {
		t.Errorf("подтверждение во время отката: получили %v, ожидали ErrNothingToConfirm", err)
	}
	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("применение во время отката: получили %v, ожидали ErrBusy", err)
	}

	close(h.store.restoreRelease)
	h.manager.Close()

	if got := h.manager.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("фаза %q, ожидали откат", got)
	}
}

// Пока Confirm не убрал состояние с диска, новый Start не пускается: иначе
// ClearState стёр бы файл состояния уже следующей транзакции, и питание в её
// окне не доиграется.
func TestConfirmHoldsApplyUntilStateCleared(t *testing.T) {
	h := newHarness(t)
	h.store.clearStarted = make(chan struct{})
	h.store.clearRelease = make(chan struct{})

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	done := make(chan struct{})

	go func() {
		defer close(done)

		if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
			t.Errorf("подтверждение: %v", err)
		}
	}()

	<-h.store.clearStarted

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("применение во время очистки состояния: получили %v, ожидали ErrBusy", err)
	}

	close(h.store.clearRelease)
	<-done

	// После подтверждения сверка внешних правок живая: фейку отдаётся sha
	// записанного конфига, как его посчитал бы настоящий Store.
	digest := sha256.Sum256(h.store.config())
	h.store.mu.Lock()
	h.store.sum = hex.EncodeToString(digest[:])
	h.store.mu.Unlock()

	// Владение занято вторым применением; выход фоновой горутины первого не
	// должен его снимать.
	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение после подтверждения: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("третье применение при активной транзакции: получили %v, ожидали ErrBusy", err)
	}
}

// База клиента сверяется с файлом на диске и главнее внутренней сверки: она
// переживает перезапуск демона и разблокирует применение, когда клиент
// перечитал файл, правленный по SSH.
func TestStartChecksClientBase(t *testing.T) {
	t.Run("совпавшая база пускает применение поверх чужой правки", func(t *testing.T) {
		h := newHarness(t)

		tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
		if err != nil {
			t.Fatalf("применение: %v", err)
		}
		h.waitWindow(t)
		if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
			t.Fatalf("подтверждение: %v", err)
		}

		// Правка по SSH: на диске сумма, которой демон не писал, но клиент
		// файл перечитал и назвал её базой.
		h.store.mu.Lock()
		h.store.sum = "правка мимо демона"
		h.store.mu.Unlock()

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "правка мимо демона", ""); err != nil {
			t.Errorf("применение с совпавшей базой: %v", err)
		}
	})

	t.Run("разошедшаяся база отклоняется", func(t *testing.T) {
		h := newHarness(t)
		h.store.mu.Lock()
		h.store.sum = "на диске"
		h.store.mu.Unlock()

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "у клиента", ""); !errors.Is(err, apply.ErrConfigModified) {
			t.Errorf("получили %v, ожидали ErrConfigModified", err)
		}
	})

	t.Run("база без файла на диске отклоняется", func(t *testing.T) {
		h := newHarness(t)
		h.store.mu.Lock()
		h.store.sumErr = fs.ErrNotExist
		h.store.mu.Unlock()

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "у клиента", ""); !errors.Is(err, apply.ErrConfigModified) {
			t.Errorf("получили %v, ожидали ErrConfigModified", err)
		}
	})
}

// Проваленный откат не должен заклинивать применение: на диске неизвестно
// что, и сверка со старой суммой давала бы ложное «конфиг изменён вне
// metabox» на каждый следующий Start.
func TestFailedRollbackDoesNotJamApply(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	h.service.setRestartErr(errors.New("procd завис"))
	h.clock.fire()
	h.manager.Close()

	tx := h.manager.Current()
	if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonRollbackFailed {
		t.Fatalf("фаза %q с кодом %q, ожидали отказ отката", tx.Phase, tx.ReasonCode)
	}

	h.service.setRestartErr(nil)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); errors.Is(err, apply.ErrConfigModified) {
		t.Error("после проваленного отката применение заклинило ложной внешней правкой")
	}
}

// waitPhase ждёт, пока цикл дойдёт до фазы: шаги идут в своей горутине.
func waitPhase(t *testing.T, h *harness, phase apply.Phase) apply.Transaction {
	t.Helper()

	for range 100 {
		if tx := h.manager.Current(); tx.Phase == phase {
			return tx
		}

		time.Sleep(time.Millisecond)
	}

	t.Fatalf("фаза %q не наступила: текущая %q", phase, h.manager.Current().Phase)

	return apply.Transaction{}
}
