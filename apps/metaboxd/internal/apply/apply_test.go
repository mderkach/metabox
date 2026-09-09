package apply_test

import (
	"context"
	"errors"
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
)

// recorder хранит порядок вызовов: протокол ADR-0002 задаёт не только набор
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
	backupErr  error
	restoreErr error
	writeErr   error
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

func (s *fakeStore) Backup(context.Context) error {
	s.rec.add("Backup")

	return s.backupErr
}

func (s *fakeStore) Restore(context.Context) error {
	s.rec.add("Restore")

	return s.restoreErr
}

func (s *fakeStore) StageCandidate(context.Context, string, []byte) error {
	s.rec.add("StageCandidate")

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

	s.mu.Lock()
	defer s.mu.Unlock()
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
}

func (s *fakeService) Check(context.Context, string) error {
	s.rec.add("Check")

	return s.checkErr
}

func (s *fakeService) Restart(context.Context) error {
	s.rec.add("Restart")

	return nil
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
	return &fakeClock{fired: make(chan time.Time, 1), called: make(chan time.Duration, 4)}
}

func (c *fakeClock) After(d time.Duration) <-chan time.Time {
	c.called <- d

	return c.fired
}

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

	rec := &recorder{}
	h := &harness{
		rec:     rec,
		store:   &fakeStore{rec: rec},
		service: &fakeService{rec: rec},
		health:  &fakeHealth{rec: rec},
		clock:   newClock(),
	}
	h.manager = apply.New(h.store, h.service, h.health, h.clock,
		slog.New(slog.DiscardHandler),
		apply.Options{Window: window, ClashPort: clashPort, CycleTimeout: cycleTimeout})

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

	tx, err := h.manager.Start(t.Context(), []byte(validConfig))
	if err != nil {
		t.Fatalf("применение: %v", err)
	}
	if tx.ID == "" {
		t.Error("транзакция без идентификатора")
	}

	if got := h.waitWindow(t); got != window {
		t.Errorf("окно %v, ожидали %v", got, window)
	}

	want := []string{"StageCandidate", "Check", "WriteState", "Backup", "Write", "Restart", "Wait", "WriteState"}
	if got := h.rec.snapshot(); !slices.Equal(got, want) {
		t.Errorf("порядок шагов %v, ожидали %v", got, want)
	}

	if h.manager.Current().Phase != apply.PhaseAwaitingConfirm {
		t.Errorf("фаза %q, ожидали ожидание подтверждения", h.manager.Current().Phase)
	}
}

// Состояние обязано лечь на диск раньше конфига: питание, снятое между
// записью и стартом таймера, иначе оставило бы устройство без автоотката.
func TestStateIsWrittenBeforeConfig(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig)); err != nil {
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

	if _, err := h.manager.Start(t.Context(), []byte(validConfig)); err == nil {
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
	if _, err := h.manager.Start(t.Context(), []byte(validConfig)); errors.Is(err, apply.ErrBusy) {
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

			if _, err := h.manager.Start(t.Context(), []byte(validConfig)); err == nil {
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

	tx, err := h.manager.Start(t.Context(), []byte(validConfig))
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

// Без подтверждения в срок конфиг обязан вернуться (AC-14).
func TestRollbackWithoutConfirmation(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig)); err != nil {
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

	tx, err := h.manager.Start(t.Context(), []byte(validConfig))
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

	if _, err := h.manager.Start(t.Context(), []byte(validConfig)); err != nil {
		t.Fatalf("первое применение: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig)); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("получили %v, ожидали ErrBusy", err)
	}
}

// Подтверждение освобождает применение сразу: клиент, подтвердивший и тут же
// применивший снова, не должен получать отказ из-за ещё живой горутины.
func TestApplyIsFreeRightAfterConfirm(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig))
	if err != nil {
		t.Fatalf("первое применение: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("подтверждение: %v", err)
	}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig)); errors.Is(err, apply.ErrBusy) {
		t.Error("после подтверждения применение осталось занятым")
	}
}

// Откат тоже освобождает применение сразу: иначе после автоотката владелец не
// может применить исправленный конфиг, пока не выйдет горутина.
func TestApplyIsFreeRightAfterRollback(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig)); err != nil {
		t.Fatalf("первое применение: %v", err)
	}
	h.waitWindow(t)

	h.clock.fire()
	h.manager.Close()

	if _, err := h.manager.Start(t.Context(), []byte(validConfig)); errors.Is(err, apply.ErrBusy) {
		t.Error("после отката применение осталось занятым")
	}
}

// Конфиг мог поправить владелец по SSH — затирать это молча нельзя.
func TestExternalEditIsDetected(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig))
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

	if _, err := h.manager.Start(t.Context(), []byte(validConfig)); !errors.Is(err, apply.ErrConfigModified) {
		t.Errorf("получили %v, ожидали ErrConfigModified", err)
	}
}

func TestClashAPIIsGuaranteed(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig))
	if err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	if !tx.ClashAPIAdded {
		t.Error("добавление секции не отмечено в транзакции: пользователь его не увидит (AC-32)")
	}

	settings, err := clashapi.Read(h.store.config())
	if err != nil {
		t.Fatalf("чтение секции: %v", err)
	}
	if settings.Address == "" {
		t.Error("записан конфиг без работающего clash_api (AC-31)")
	}
}
