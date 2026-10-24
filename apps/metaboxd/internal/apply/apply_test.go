package apply_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io/fs"
	"log/slog"
	"maps"
	"slices"
	"sync"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/locale"
	"metabox/internal/procd"
)

const (
	window       = time.Minute
	cycleTimeout = 30 * time.Second
	clashPort    = 9090
	configDir    = "/etc/sing-box"
	configName   = "config.json"
)

// recorder stores the call order: the apply protocol sets not only the set
// of steps but also their order: the state must reach the disk before the config.
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
	stateErr   error
	lists      map[string][]byte
	listsErr   error
	backupErr  error
	restoreErr error
	writeErr   error
	readErr    error
	clearErr   error
	// backup and backupLists are what Backup took and Restore brings back: the
	// replay tests check which transaction's backup a rollback restores.
	backup      []byte
	backupLists map[string][]byte

	// Gates for race tests: started closes on entering the step, release
	// holds the step until the test lets it go.
	restoreStarted chan struct{}
	restoreRelease chan struct{}
	clearStarted   chan struct{}
	clearRelease   chan struct{}
	backupStarted  chan struct{}
	backupRelease  chan struct{}
}

// gate closes started and holds the step until release; a nil gate lets the step through.
func gate(started, release chan struct{}) {
	if started != nil {
		close(started)
	}
	if release != nil {
		<-release
	}
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
	gate(s.backupStarted, s.backupRelease)

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.backupErr != nil {
		return s.backupErr
	}
	s.backup = s.written
	s.backupLists = maps.Clone(s.lists)

	return nil
}

func (s *fakeStore) Restore(context.Context) error {
	s.rec.add("Restore")
	gate(s.restoreStarted, s.restoreRelease)

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.restoreErr != nil {
		return s.restoreErr
	}
	s.written = s.backup
	s.lists = maps.Clone(s.backupLists)

	return nil
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

	if s.stateErr != nil {
		return s.stateErr
	}
	s.state = data

	return nil
}

func (s *fakeStore) ClearState(context.Context) error {
	s.rec.add("ClearState")
	gate(s.clearStarted, s.clearRelease)

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
	// checked holds the arguments of the last Check: directory, config file, working
	// directory.
	checked [3]string
	// launch is what procd starts the service with; empty means unknown.
	launch    procd.Launch
	launchErr error

	mu         sync.Mutex
	restartErr error
	// pid is the service process as procd sees it: each restart brings up
	// a new one.
	pid    int
	pidErr error
	// lag is how many polls after a restart procd still returns the old pid;
	// negative means the old one is always returned. stale is the remainder of the current
	// restart.
	lag   int
	stale int
}

func (s *fakeService) Check(_ context.Context, dir, config, workdir string) error {
	s.rec.add("Check")

	s.mu.Lock()
	s.checked = [3]string{dir, config, workdir}
	s.mu.Unlock()

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

func (s *fakeService) Launch(context.Context) (procd.Launch, error) {
	return s.launch, s.launchErr
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

// fakeClock gives the confirmation window under test control: the test must not
// wait a real minute.
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

// fire gives the deadline and returns only after it was accepted: an unbuffered
// channel makes the send a synchronization point. With a buffer the test managed to
// close the manager before the goroutine entered the select, where
// two branches were ready at once, and Go chose between the rollback and the stop randomly.
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

// newHarnessWith is the same test bench with a given cycle ceiling and logger: the timeout
// failure tests do not wait half a minute, and the log tests read the records.
func newHarnessWith(t *testing.T, timeout time.Duration, log *slog.Logger) *harness {
	t.Helper()

	return newHarnessIn(t, timeout, log, locale.English)
}

func newHarnessIn(t *testing.T, timeout time.Duration, log *slog.Logger, lang locale.Lang) *harness {
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
		ConfigName:      configName,
		ProcessInterval: time.Millisecond,
		Lang:            lang,
	})

	t.Cleanup(h.manager.Close)

	return h
}

// waitWindow waits until the apply reaches the confirmation window.
func (h *harness) waitWindow(t *testing.T) time.Duration {
	t.Helper()

	select {
	case d := <-h.clock.called:
		return d
	case <-time.After(5 * time.Second):
		t.Fatal("apply did not reach the confirmation window")

		return 0
	}
}

const validConfig = `{"log":{"level":"info"}}`

func TestApplyFollowsProtocolOrder(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if tx.ID == "" {
		t.Error("transaction without an identifier")
	}

	if got := h.waitWindow(t); got != window {
		t.Errorf("window %v, expected %v", got, window)
	}

	// The state follows the backup: a state record on disk means the backup is this
	// transaction's. SaveVersion stands between them and the write: the history holds what
	// was applied before this cycle. The service pid is taken before the restart and compared
	// after it, before the API poll.
	want := []string{
		"StageCandidate", "Check", "Backup", "WriteState", "SaveVersion", "WriteLists", "Write",
		"PID", "Restart", "PID", "Wait", "WriteState",
	}
	if got := h.rec.snapshot(); !slices.Equal(got, want) {
		t.Errorf("step order %v, expected %v", got, want)
	}

	if h.manager.Current().Phase != apply.PhaseAwaitingConfirm {
		t.Errorf("phase %q, expected awaiting confirmation", h.manager.Current().Phase)
	}
}

// The panel shows the window remainder to the user: the full duration after
// a page reload would be a promise the daemon does not make.
func TestCurrentReportsRemainingWindow(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	left := h.manager.Current().Window

	if left <= 0 || left > window {
		t.Fatalf("window remainder %v, expected a value within %v", left, window)
	}
	if later := h.manager.Current().Window; later > left {
		t.Errorf("remainder grew: was %v, now %v", left, later)
	}
}

// The state must reach the disk after the backup and before the config: a power loss
// between the write and the timer start would otherwise leave the device without an
// automatic rollback, and a state written before the backup would send the replay to
// the backup of an earlier transaction.
func TestStateIsWrittenBetweenBackupAndConfig(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	backup, state, write := h.rec.index("Backup"), h.rec.index("WriteState"), h.rec.index("Write")
	if backup < 0 || state < backup || write < state {
		t.Errorf("backup %dth, state %dth, config %dth", backup, state, write)
	}
}

// A check failure must stop the apply before anything is written.
func TestCheckFailureWritesNothing(t *testing.T) {
	h := newHarness(t)
	h.service.checkErr = &singboxCheckError{}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err == nil {
		t.Fatal("broken config accepted")
	}

	if got := h.rec.snapshot(); slices.Contains(got, "Write") || slices.Contains(got, "WriteState") {
		t.Errorf("something written after check refused: %v", got)
	}
	if got := h.manager.Current(); got.Phase != "" {
		t.Errorf("transaction %+v created: there was no apply", got)
	}

	// A failure must release the apply, otherwise the very first broken config
	// wedges the daemon until a restart.
	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); errors.Is(err, apply.ErrBusy) {
		t.Error("apply stayed busy after check refused")
	}
}

// Between the reservation and the transaction appearing a second Start must not
// slip through: the config has one owner.
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
		t.Errorf("applies accepted: %d, expected one", accepted)
	}
}

type singboxCheckError struct{}

func (*singboxCheckError) Error() string { return "sing-box check: код 1" }

func TestConfirmClosesWindow(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	confirmed, err := h.manager.Confirm(t.Context(), tx.ID)
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	if confirmed.Phase != apply.PhaseConfirmed {
		t.Errorf("phase %q, expected confirmation", confirmed.Phase)
	}

	h.manager.Close()

	if slices.Contains(h.rec.snapshot(), "Restore") {
		t.Error("confirmed apply was rolled back anyway")
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("state of the confirmed transaction stayed on disk")
	}
}

// Without confirmation in time the config must return.
func TestRollbackWithoutConfirmation(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	h.clock.fire()
	h.manager.Close()

	if !slices.Contains(h.rec.snapshot(), "Restore") {
		t.Fatalf("there was no rollback: %v", h.rec.snapshot())
	}
	if got := h.manager.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("phase %q, expected rollback", got)
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("state of the rolled back transaction stayed on disk")
	}
}

func TestConfirmRejectsForeignTransaction(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), "чужой"); !errors.Is(err, apply.ErrUnknownTransaction) {
		t.Errorf("got %v, expected ErrUnknownTransaction", err)
	}

	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("confirm: %v", err)
	}
	if _, err := h.manager.Confirm(t.Context(), tx.ID); !errors.Is(err, apply.ErrNothingToConfirm) {
		t.Errorf("repeated confirm: got %v, expected ErrNothingToConfirm", err)
	}
}

// A second apply with an active transaction is a contract error, not a race for the
// file: the config has one owner.
func TestSecondApplyIsRejected(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("first apply: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("got %v, expected ErrBusy", err)
	}
}

// Confirm releases the apply immediately: a client that confirmed and immediately
// applied again must not get a refusal because of a still living goroutine.
func TestApplyIsFreeRightAfterConfirm(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("first apply: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("confirm: %v", err)
	}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); errors.Is(err, apply.ErrBusy) {
		t.Error("apply stayed busy after confirm")
	}
}

// A rollback also releases the apply immediately: otherwise after an automatic rollback the owner cannot
// apply a fixed config until the goroutine exits.
func TestApplyIsFreeRightAfterRollback(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("first apply: %v", err)
	}
	h.waitWindow(t)

	h.clock.fire()
	h.manager.Close()

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); errors.Is(err, apply.ErrBusy) {
		t.Error("apply stayed busy after rollback")
	}
}

// The owner could have changed the config over SSH: overwriting it silently is not allowed.
func TestExternalEditIsDetected(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)
	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("confirm: %v", err)
	}

	h.store.mu.Lock()
	h.store.sum = "правка мимо демона"
	h.store.mu.Unlock()

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrConfigModified) {
		t.Errorf("got %v, expected ErrConfigModified", err)
	}
}

func TestClashAPIIsGuaranteed(t *testing.T) {
	h := newHarness(t)

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	if !tx.ClashAPIAdded {
		t.Error("section addition is not marked in the transaction: the user would not see it")
	}

	settings, err := clashapi.Read(h.store.config())
	if err != nil {
		t.Fatalf("reading the section: %v", err)
	}
	if settings.Address == "" {
		t.Error("config written without a working clash_api")
	}
}

// The failure reason goes to the panel as a step code: the panel takes the text in the user's
// language by it and does not show the daemon error as is.
func TestFailureCarriesStepCode(t *testing.T) {
	tests := []struct {
		name  string
		setup func(h *harness)
		want  apply.ReasonCode
	}{
		{
			name:  "config was not written",
			setup: func(h *harness) { h.store.writeErr = errors.New("диск переполнен") },
			want:  apply.ReasonWriteFailed,
		},
		{
			name:  "runtime did not answer",
			setup: func(h *harness) { h.health.err = errors.New("порт молчит") },
			want:  apply.ReasonHealthcheckFailed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)
			tt.setup(h)

			if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
				t.Fatalf("apply: %v", err)
			}

			tx := waitPhase(t, h, apply.PhaseRolledBack)

			if tx.ReasonCode != tt.want {
				t.Errorf("reason code %q, expected %q", tx.ReasonCode, tt.want)
			}
			if tx.Reason == "" {
				t.Error("step detail lost: nothing to fix the failure by")
			}
		})
	}
}

// The step detail is in the operator's language, while the original OS error under it is
// passed on as it is.
func TestReasonFollowsLang(t *testing.T) {
	tests := []struct {
		lang locale.Lang
		want string
	}{
		{locale.English, "write lists: no space left on device"},
		{locale.Russian, "запись списков: no space left on device"},
	}

	for _, tt := range tests {
		t.Run(string(tt.lang), func(t *testing.T) {
			h := newHarnessIn(t, cycleTimeout, slog.New(slog.DiscardHandler), tt.lang)
			h.store.writeErr = errors.New("no space left on device")

			if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
				t.Fatalf("apply: %v", err)
			}

			if tx := waitPhase(t, h, apply.PhaseRolledBack); tx.Reason != tt.want {
				t.Errorf("reason %q, want %q", tx.Reason, tt.want)
			}
		})
	}
}

// A confirmation in the last seconds of the window: the timer was first, the rollback already
// touches the disk. Confirm must get a refusal and not return success against the background
// of the rollback, and a new Start is not let in at that moment either.
func TestConfirmDuringRollbackIsRejected(t *testing.T) {
	h := newHarness(t)
	h.store.restoreStarted = make(chan struct{})
	h.store.restoreRelease = make(chan struct{})

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	h.clock.fire()
	<-h.store.restoreStarted

	if _, err := h.manager.Confirm(t.Context(), tx.ID); !errors.Is(err, apply.ErrNothingToConfirm) {
		t.Errorf("confirm during rollback: got %v, expected ErrNothingToConfirm", err)
	}
	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("apply during rollback: got %v, expected ErrBusy", err)
	}

	close(h.store.restoreRelease)
	h.manager.Close()

	if got := h.manager.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("phase %q, expected rollback", got)
	}
}

// While Confirm has not removed the state from disk, a new Start is not let in: otherwise
// ClearState would erase the state file of the next transaction, and a power loss in its
// window would not be replayed.
func TestConfirmHoldsApplyUntilStateCleared(t *testing.T) {
	h := newHarness(t)
	h.store.clearStarted = make(chan struct{})
	h.store.clearRelease = make(chan struct{})

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	done := make(chan struct{})

	go func() {
		defer close(done)

		if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
			t.Errorf("confirm: %v", err)
		}
	}()

	<-h.store.clearStarted

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("apply during state cleanup: got %v, expected ErrBusy", err)
	}

	close(h.store.clearRelease)
	<-done

	// After the confirmation the outside edit check is live: the fake is given the sha
	// of the written config as the real Store would compute it.
	digest := sha256.Sum256(h.store.config())
	h.store.mu.Lock()
	h.store.sum = hex.EncodeToString(digest[:])
	h.store.mu.Unlock()

	// Ownership is held by the second apply; the exit of the first background goroutine must not
	// release it.
	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply after confirm: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("third apply with an active transaction: got %v, expected ErrBusy", err)
	}
}

// The client base is compared with the file on disk and outranks the internal check: it
// survives a daemon restart and unblocks the apply when the client
// reread the file edited over SSH.
func TestStartChecksClientBase(t *testing.T) {
	t.Run("a matching base lets the apply over a foreign edit", func(t *testing.T) {
		h := newHarness(t)

		tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
		if err != nil {
			t.Fatalf("apply: %v", err)
		}
		h.waitWindow(t)
		if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
			t.Fatalf("confirm: %v", err)
		}

		// An SSH edit: the disk has a sum the daemon did not write, but the client
		// reread the file and named it the base.
		h.store.mu.Lock()
		h.store.sum = "правка мимо демона"
		h.store.mu.Unlock()

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "правка мимо демона", ""); err != nil {
			t.Errorf("apply with a matching base: %v", err)
		}
	})

	t.Run("a diverged base is rejected", func(t *testing.T) {
		h := newHarness(t)
		h.store.mu.Lock()
		h.store.sum = "на диске"
		h.store.mu.Unlock()

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "у клиента", ""); !errors.Is(err, apply.ErrConfigModified) {
			t.Errorf("got %v, expected ErrConfigModified", err)
		}
	})

	t.Run("a base without a file on disk is rejected", func(t *testing.T) {
		h := newHarness(t)
		h.store.mu.Lock()
		h.store.sumErr = fs.ErrNotExist
		h.store.mu.Unlock()

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "у клиента", ""); !errors.Is(err, apply.ErrConfigModified) {
			t.Errorf("got %v, expected ErrConfigModified", err)
		}
	})
}

// A failed rollback must not wedge the apply: the disk has an unknown
// something, and a check against the old sum would give a false "config modified outside
// metabox" on every next Start.
func TestFailedRollbackDoesNotJamApply(t *testing.T) {
	h := newHarness(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	h.service.setRestartErr(errors.New("procd завис"))
	h.clock.fire()
	h.manager.Close()

	tx := h.manager.Current()
	if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonRollbackFailed {
		t.Fatalf("phase %q with code %q, expected rollback failure", tx.Phase, tx.ReasonCode)
	}

	h.service.setRestartErr(nil)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); errors.Is(err, apply.ErrConfigModified) {
		t.Error("after a failed rollback the apply got stuck on a false outside edit")
	}
}

// waitPhase waits until the cycle reaches the phase: the steps run in their own goroutine.
func waitPhase(t *testing.T, h *harness, phase apply.Phase) apply.Transaction {
	t.Helper()

	for range 100 {
		if tx := h.manager.Current(); tx.Phase == phase {
			return tx
		}

		time.Sleep(time.Millisecond)
	}

	t.Fatalf("phase %q did not occur: current %q", phase, h.manager.Current().Phase)

	return apply.Transaction{}
}
