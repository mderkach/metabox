package apply_test

import (
	"context"
	"errors"
	"log/slog"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/cachefile"
	"metabox/internal/dataplane"
	"metabox/internal/procd"
)

// cachedConfig keeps subscriptions in the cache file and answers on the Clash API.
const cachedConfig = `{
	"experimental": {
		"clash_api": {"external_controller": "127.0.0.1:9090"},
		"cache_file": {"enabled": true, "store_subscriptions": true, "cache_id": "router"}
	}
}`

func poisonedLine(tag string) string {
	return "FATAL[0000] start service: start provider/remote[" + tag + "]: restore cached outbound provider: no servers found"
}

type dropCall struct{ path, cacheID, tag string }

type fakeCache struct {
	rec *recorder

	mu    sync.Mutex
	calls []dropCall
	err   error
	moved []string
}

func (c *fakeCache) MoveAside(_ context.Context, path string) (string, error) {
	c.rec.add("MoveAside")

	c.mu.Lock()
	defer c.mu.Unlock()

	c.moved = append(c.moved, path)

	return path + ".broken", nil
}

func (c *fakeCache) Drop(ctx context.Context, path, cacheID, tag string) error {
	c.rec.add("Drop")

	if err := ctx.Err(); err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.calls = append(c.calls, dropCall{path, cacheID, tag})

	return c.err
}

func (c *fakeCache) dropped() []string {
	c.mu.Lock()
	defer c.mu.Unlock()

	var tags []string
	for _, call := range c.calls {
		tags = append(tags, call.tag)
	}

	return tags
}

type cacheHarness struct {
	*harness
	cache *fakeCache
}

func newCacheHarness(t *testing.T, timeout time.Duration) *cacheHarness {
	t.Helper()

	rec := &recorder{}
	h := &cacheHarness{
		harness: &harness{
			rec:     rec,
			store:   &fakeStore{rec: rec},
			service: &fakeService{rec: rec},
			health:  &fakeHealth{rec: rec},
			clock:   newClock(),
		},
		cache: &fakeCache{rec: rec},
	}
	h.manager = apply.New(h.store, h.service, h.health, h.clock, slog.New(slog.DiscardHandler), apply.Options{
		Window:          window,
		ClashPort:       clashPort,
		CycleTimeout:    timeout,
		ConfigDir:       configDir,
		ConfigName:      configName,
		ProcessInterval: time.Millisecond,
		Cache:           h.cache,
	})
	t.Cleanup(h.manager.Close)

	// The Clash API stays silent while the service has a crash to tell.
	h.health.silentWhile = func() bool {
		h.service.mu.Lock()
		defer h.service.mu.Unlock()

		return h.service.crash != ""
	}

	seedConfig(h.harness, cachedConfig)

	return h
}

// crash makes the running core fail with reason; next are the reasons of the starts after it.
func (h *cacheHarness) crash(reason string, next ...string) {
	h.service.mu.Lock()
	defer h.service.mu.Unlock()

	h.service.crash = reason
	h.service.crashes = next
	h.service.relog()
}

// rollBack applies a config and lets its window run out while the core crashes with reason.
func (h *cacheHarness) rollBack(t *testing.T, reason string, next ...string) apply.Transaction {
	t.Helper()

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	h.crash(reason, next...)
	h.clock.fire()
	h.manager.Close()

	return h.manager.Current()
}

func TestRollbackDropsPoisonedSubscription(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)

	tx := h.rollBack(t, poisonedLine("sub"))

	if tx.Phase != apply.PhaseRolledBack {
		t.Fatalf("phase %q, code %q, reason %q: want rolled_back", tx.Phase, tx.ReasonCode, tx.Reason)
	}
	if !strings.Contains(tx.Reason, "sub") {
		t.Errorf("reason %q does not name the dropped subscription", tx.Reason)
	}

	want := dropCall{filepath.Join(configDir, "cache.db"), "router", "sub"}
	if got := h.cache.calls; len(got) != 1 || got[0] != want {
		t.Errorf("drops %+v, want %+v", got, want)
	}

	steps := h.rec.snapshot()
	halt, drop, start := slices.Index(steps, "Halt"), slices.Index(steps, "Drop"), slices.Index(steps, "Start")
	if halt < 0 || halt > drop || drop > start {
		t.Errorf("steps %v: want Halt, Drop, Start in this order", steps)
	}
}

func TestRecoveryFollowsTheNextPoisonedSubscription(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)

	tx := h.rollBack(t, poisonedLine("a"), poisonedLine("b"))

	if tx.Phase != apply.PhaseRolledBack {
		t.Fatalf("phase %q, reason %q: want rolled_back", tx.Phase, tx.Reason)
	}
	if got := h.cache.dropped(); !slices.Equal(got, []string{"a", "b"}) {
		t.Errorf("dropped %v, want a then b", got)
	}
}

func TestRecoveryStopsOnTheSameSubscription(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)

	tx := h.rollBack(t, poisonedLine("sub"), poisonedLine("sub"))

	if tx.ReasonCode != apply.ReasonRollbackFailed {
		t.Errorf("phase %q, code %q: want rollback_failed", tx.Phase, tx.ReasonCode)
	}
	if got := h.cache.dropped(); !slices.Equal(got, []string{"sub"}) {
		t.Errorf("dropped %v, want sub once", got)
	}
	if !strings.Contains(tx.Reason, "deleted its entry") {
		t.Errorf("reason %q does not tell that the cache file was changed", tx.Reason)
	}
}

func TestRecoveryStartsTheCoreWhenTheEntryStays(t *testing.T) {
	for _, err := range []error{cachefile.ErrNoEntry, cachefile.ErrLocked} {
		t.Run(err.Error(), func(t *testing.T) {
			h := newCacheHarness(t, cycleTimeout)
			h.cache.err = err

			tx := h.rollBack(t, poisonedLine("sub"))

			if tx.ReasonCode != apply.ReasonRollbackFailed {
				t.Errorf("phase %q, code %q: want rollback_failed", tx.Phase, tx.ReasonCode)
			}

			h.service.mu.Lock()
			halted := h.service.halted
			h.service.mu.Unlock()

			if halted {
				t.Error("the core stayed stopped after a failed drop")
			}
			if len(h.cache.moved) != 0 {
				t.Errorf("moved %v: a file that opens is never moved", h.cache.moved)
			}
		})
	}
}

func TestRecoveryMovesAnUnreadableFileAside(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)
	h.cache.err = cachefile.ErrUnreadable

	tx := h.rollBack(t, poisonedLine("sub"))

	if tx.Phase != apply.PhaseRolledBack {
		t.Errorf("phase %q, reason %q: want rolled_back", tx.Phase, tx.Reason)
	}
	if want := filepath.Join(configDir, "cache.db"); !slices.Equal(h.cache.moved, []string{want}) {
		t.Errorf("moved %v, want %s", h.cache.moved, want)
	}

	steps := h.rec.snapshot()
	if moved, start := slices.Index(steps, "MoveAside"), slices.Index(steps, "Start"); moved < 0 || moved > start {
		t.Errorf("steps %v: want the file moved before the start", steps)
	}
}

func TestRecoveryLeavesOtherCrashes(t *testing.T) {
	h := newCacheHarness(t, 50*time.Millisecond)

	tx := h.rollBack(t, crashLine)

	if tx.ReasonCode != apply.ReasonRollbackFailed {
		t.Errorf("phase %q, code %q: want rollback_failed", tx.Phase, tx.ReasonCode)
	}
	if steps := h.rec.snapshot(); slices.Contains(steps, "Halt") || slices.Contains(steps, "Drop") {
		t.Errorf("steps %v: an unrelated crash touched the cache file", steps)
	}
}

func TestRecoveryNeedsSubscriptionsInTheCache(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)
	seedConfig(h.harness, controlledConfig)

	tx := h.rollBack(t, poisonedLine("sub"))

	if tx.ReasonCode != apply.ReasonRollbackFailed {
		t.Errorf("phase %q, code %q: want rollback_failed", tx.Phase, tx.ReasonCode)
	}
	if got := h.cache.dropped(); len(got) != 0 {
		t.Errorf("dropped %v from a config that keeps no subscriptions", got)
	}
}

func TestRecoveryResolvesTheCacheFromTheWorkdir(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)
	h.service.launch = procd.Launch{Workdir: "/srv/box"}

	h.rollBack(t, poisonedLine("sub"))

	if got := h.cache.calls; len(got) != 1 || got[0].path != "/srv/box/cache.db" {
		t.Errorf("drops %+v, want the file in the working directory of the service", got)
	}
}

// waitDropped waits for the background repair to drop want.
func (h *cacheHarness) waitDropped(t *testing.T, want ...string) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if slices.Equal(h.cache.dropped(), want) {
			return
		}

		time.Sleep(time.Millisecond)
	}

	t.Fatalf("dropped %v, want %v", h.cache.dropped(), want)
}

func TestWatchRecoversAStartFromThePanel(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)

	err := h.manager.Watch(t.Context(), func(ctx context.Context) error {
		h.crash(poisonedLine("sub"))

		return h.service.Restart(ctx)
	})
	if err != nil {
		t.Fatalf("watch: %v", err)
	}

	h.waitDropped(t, "sub")
}

// The panel gives up on a request after 15 seconds and then reports the action as failed. The
// handler answers as soon as the core crashes for any reason, and the repair goes on after the
// request is gone.
func TestWatchAnswersBeforeThePanelGivesUp(t *testing.T) {
	t.Run("a crash that is not the cache file ends the watch", func(t *testing.T) {
		h := newCacheHarness(t, cycleTimeout)

		begin := time.Now()

		err := h.manager.Watch(t.Context(), func(ctx context.Context) error {
			h.crash(crashLine)

			return h.service.Restart(ctx)
		})
		if err != nil {
			t.Fatalf("watch: %v", err)
		}

		if took := time.Since(begin); took > time.Second {
			t.Errorf("the handler answered after %v, want at once on a crash", took)
		}
	})

	t.Run("the repair outlives the request", func(t *testing.T) {
		h := newCacheHarness(t, cycleTimeout)
		ctx, cancel := context.WithCancel(t.Context())

		err := h.manager.Watch(ctx, func(ctx context.Context) error {
			h.crash(poisonedLine("sub"))

			return h.service.Restart(ctx)
		})
		cancel()

		if err != nil {
			t.Fatalf("watch: %v", err)
		}

		h.waitDropped(t, "sub")
	})
}

func TestWatchLeavesAHealthyStart(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)

	if err := h.manager.Watch(t.Context(), h.service.Restart); err != nil {
		t.Fatalf("watch: %v", err)
	}

	if steps := h.rec.snapshot(); slices.Contains(steps, "Halt") {
		t.Errorf("steps %v: a healthy start was stopped", steps)
	}
	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Errorf("apply after a watched start: %v", err)
	}
}

func TestWatchDoesNotRecoverDuringAnApply(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	err := h.manager.Watch(t.Context(), func(ctx context.Context) error {
		h.crash(poisonedLine("sub"))

		return h.service.Restart(ctx)
	})
	if err != nil {
		t.Fatalf("watch: %v", err)
	}

	if got := h.cache.dropped(); len(got) != 0 {
		t.Errorf("dropped %v while an apply held the service", got)
	}
}

// A crash seen while an Apply holds the service is left to its rollback. A Confirm closes the
// Apply without a rollback, so the repair runs after it.
func TestWatchRepairsAfterTheApplyIsConfirmed(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)

	tx, err := h.manager.Start(t.Context(), []byte(cachedConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	// A core in a crash loop: every start crashes until the entry is gone.
	err = h.manager.Watch(t.Context(), func(ctx context.Context) error {
		h.crash(poisonedLine("sub"))

		return h.service.Restart(ctx)
	})
	if err != nil {
		t.Fatalf("watch: %v", err)
	}

	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("confirm: %v", err)
	}

	// The crash loop goes on after the Confirm: procd respawns the core.
	h.service.mu.Lock()
	h.service.relog()
	h.service.mu.Unlock()

	h.waitDropped(t, "sub")
}

// startsSlowly keeps the Clash API silent for a while, long enough for the crash reason to be
// polled before the core answers.
func startsSlowly() func() bool {
	var once sync.Once

	var begin time.Time

	return func() bool {
		once.Do(func() { begin = time.Now() })

		return time.Since(begin) < 50*time.Millisecond
	}
}

// An older crash on the cache file is still in the log after the repair. A core that comes up
// on the next restart is not taken for a crashing one.
func TestRollbackIgnoresAnOlderCrash(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)
	h.health.silentWhile = nil

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	// The line from an earlier start; this core comes up.
	h.crash(poisonedLine("sub"))
	h.service.mu.Lock()
	h.service.quiet = true
	h.service.mu.Unlock()
	h.health.silentWhile = startsSlowly()

	h.clock.fire()
	h.manager.Close()

	if tx := h.manager.Current(); tx.Phase != apply.PhaseRolledBack {
		t.Errorf("phase %q, reason %q: want rolled_back", tx.Phase, tx.Reason)
	}
	if got := h.cache.dropped(); len(got) != 0 {
		t.Errorf("dropped %v on an older crash", got)
	}
}

// procd may still report the previous process while the new one already crashes: the crash
// is watched from the restart on, not only once a new pid shows.
func TestRollbackSeesACrashBeforeANewProcess(t *testing.T) {
	h := newCacheHarness(t, time.Minute)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	h.service.mu.Lock()
	h.service.lag = -1
	h.service.mu.Unlock()
	h.crash(poisonedLine("sub"))

	begin := time.Now()
	h.clock.fire()
	h.manager.Close()

	tx := h.manager.Current()

	if tx.Phase != apply.PhaseRolledBack {
		t.Errorf("phase %q, reason %q: want rolled_back", tx.Phase, tx.Reason)
	}
	if took := time.Since(begin); took > 10*time.Second {
		t.Errorf("the rollback took %v: the crash was seen only at the deadline", took)
	}
}

func TestRecoverAtStart(t *testing.T) {
	t.Run("a core crashing on its cache is repaired", func(t *testing.T) {
		h := newCacheHarness(t, cycleTimeout)
		// procd gave up respawning; the start the daemon gives crashes again.
		h.crash(poisonedLine("sub"), poisonedLine("sub"))

		h.manager.RecoverAtStart(t.Context())

		if got := h.cache.dropped(); !slices.Equal(got, []string{"sub"}) {
			t.Errorf("dropped %v, want sub", got)
		}
	})

	t.Run("a core left halted is started", func(t *testing.T) {
		h := newCacheHarness(t, cycleTimeout)
		h.service.mu.Lock()
		h.service.halted = true
		h.service.mu.Unlock()

		h.manager.RecoverAtStart(t.Context())

		if !slices.Contains(h.rec.snapshot(), "Start") {
			t.Errorf("steps %v: a halted core stayed down", h.rec.snapshot())
		}
	})

	t.Run("an older crash of a running core is left alone", func(t *testing.T) {
		h := newCacheHarness(t, cycleTimeout)
		h.health.silentWhile = startsSlowly()
		h.crash(poisonedLine("sub"))
		h.service.mu.Lock()
		h.service.pid = 1
		h.service.quiet = true
		h.service.mu.Unlock()

		h.manager.RecoverAtStart(t.Context())

		if got := h.cache.dropped(); len(got) != 0 {
			t.Errorf("dropped %v on a crash written before the daemon started", got)
		}
	})

	t.Run("a service procd does not know is left alone", func(t *testing.T) {
		h := newCacheHarness(t, cycleTimeout)
		h.crash(poisonedLine("sub"))
		h.service.pidErr = errProcdUnknown

		h.manager.RecoverAtStart(t.Context())

		if steps := h.rec.snapshot(); slices.Contains(steps, "Halt") || slices.Contains(steps, "Drop") {
			t.Errorf("steps %v: a stopped service was touched", steps)
		}
	})
}

var errProcdUnknown = errors.New("service not registered in procd")

// cachePlane gives the cache harness a dataplane transaction on the same apply.
func (h *cacheHarness) cachePlane(t *testing.T) (*apply.Plane, *fakeReloader) {
	t.Helper()

	reloader := &fakeReloader{}
	plane := apply.NewPlane(h.manager, &fakeEditor{section: previousSection(), chains: dataplane.ExpectedChains()},
		reloader, &fakePlaneStore{cfg: []byte(cachedConfig)}, h.health, h.clock, slog.New(slog.DiscardHandler),
		apply.PlaneOptions{Window: window, CycleTimeout: cycleTimeout})
	t.Cleanup(plane.Close)

	return plane, reloader
}

func TestPlaneRollbackDropsPoisonedSubscription(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)
	plane, reloader := h.cachePlane(t)

	if _, err := plane.Start(t.Context(), aclChange(), "", admin); err != nil {
		t.Fatalf("dataplane change: %v", err)
	}
	h.waitWindow(t)

	// The reload brings up a core that crashes on its cache until the entry is gone.
	reloader.mu.Lock()
	reloader.crash = poisonedLine("sub")
	reloader.mu.Unlock()
	h.health.silentWhile = func() bool { return len(h.cache.dropped()) == 0 }

	h.clock.fire()
	plane.Close()

	tx := plane.Current()
	if tx.Phase != apply.PhaseRolledBack {
		t.Fatalf("phase %q, code %q, reason %q: want rolled_back", tx.Phase, tx.ReasonCode, tx.Reason)
	}
	if !strings.Contains(tx.Reason, "sub") {
		t.Errorf("reason %q does not name the dropped subscription", tx.Reason)
	}
	if got := h.cache.dropped(); !slices.Equal(got, []string{"sub"}) {
		t.Errorf("dropped %v, want sub", got)
	}
}

// A replay that rolls back waits for the core up to the cycle timeout. The daemon serves the
// panel meanwhile, so Settle returns at once and holds the apply until the replay is done.
func TestSettleReplaysBesideTheServer(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)
	plane, _ := h.cachePlane(t)
	h.health.silentWhile = nil

	h.store.mu.Lock()
	h.store.backup = []byte(cachedConfig)
	h.store.mu.Unlock()
	seedState(t, h.harness, apply.Transaction{ID: "истёкшая", Phase: apply.PhaseAwaitingConfirm, Window: 0})

	// The restored core does not answer until the test lets it.
	started, release := h.health.hold("Wait")

	settled := h.manager.Settle(t.Context(), plane)

	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("the replay did not reach the core check")
	}

	if tx := h.manager.Current(); tx.ID != "истёкшая" || tx.Phase != apply.PhaseAwaitingConfirm {
		t.Errorf("panel sees %q in %q during the replay, want the replayed transaction", tx.ID, tx.Phase)
	}
	if _, err := h.manager.Confirm(t.Context(), "истёкшая"); !errors.Is(err, apply.ErrNothingToConfirm) {
		t.Errorf("confirm during the replayed rollback: %v, want ErrNothingToConfirm", err)
	}
	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("apply during the replay: %v, want ErrBusy", err)
	}
	if _, err := plane.Start(t.Context(), aclChange(), "", admin); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("dataplane change during the replay: %v, want ErrBusy", err)
	}

	close(release)

	select {
	case <-settled:
	case <-time.After(5 * time.Second):
		t.Fatal("settle did not finish")
	}

	if tx := h.manager.Current(); tx.Phase != apply.PhaseRolledBack {
		t.Errorf("phase %q, reason %q: want rolled_back", tx.Phase, tx.Reason)
	}
	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Errorf("apply after the replay: %v", err)
	}
}

// Before the journal is read no Start may get in: the replay would roll back over it.
func TestSettleHoldsTheApplyBeforeTheJournalIsRead(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)
	plane, _ := h.cachePlane(t)
	h.health.silentWhile = nil
	seedState(t, h.harness, apply.Transaction{ID: "прерванная", Phase: apply.PhaseApplying, Window: window, Sum: "новый"})
	// A stopped service: the check of the core after the replay has nothing to watch.
	h.service.pidErr = errProcdUnknown

	started, release := h.store.hold("ReadState")
	settled := h.manager.Settle(t.Context(), plane)
	<-started

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("apply before the journal is read: %v, want ErrBusy", err)
	}

	close(release)
	<-settled
}
