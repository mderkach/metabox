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

func (c *fakeCache) Drop(_ context.Context, path, cacheID, tag string) error {
	c.rec.add("Drop")

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

func TestWatchRecoversAStartFromThePanel(t *testing.T) {
	h := newCacheHarness(t, cycleTimeout)

	err := h.manager.Watch(t.Context(), func(ctx context.Context) error {
		h.crash(poisonedLine("sub"))

		return h.service.Restart(ctx)
	})
	if err != nil {
		t.Fatalf("watch: %v", err)
	}

	if got := h.cache.dropped(); !slices.Equal(got, []string{"sub"}) {
		t.Errorf("dropped %v, want sub", got)
	}
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

func TestRecoverAtStart(t *testing.T) {
	t.Run("a core crashing on its cache is repaired", func(t *testing.T) {
		h := newCacheHarness(t, cycleTimeout)
		h.crash(poisonedLine("sub"))

		h.manager.RecoverAtStart(t.Context())

		if got := h.cache.dropped(); !slices.Equal(got, []string{"sub"}) {
			t.Errorf("dropped %v, want sub", got)
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
