package apply_test

import (
	"errors"
	"log/slog"
	"slices"
	"strings"
	"testing"

	"metabox/internal/apply"
)

// controlledConfig carries a controller address, so the rollback waits for its Clash API.
const controlledConfig = `{"experimental":{"clash_api":{"external_controller":"127.0.0.1:9090"}}}`

const crashLine = "FATAL[0000] start service: initialize cache-file: open cache.db: permission denied"

// seedConfig puts a running config on the device before the apply: the rollback restores it.
func seedConfig(h *harness, cfg string) {
	h.store.mu.Lock()
	defer h.store.mu.Unlock()

	h.store.written = []byte(cfg)
}

// breakCore makes the core fail from now on: the Clash API does not answer and the service
// leaves a crash line.
func breakCore(h *harness) {
	h.health.err = errors.New("connection refused")

	h.service.mu.Lock()
	defer h.service.mu.Unlock()

	h.service.crash = crashLine
}

func TestRollbackWaitsForRestoredCore(t *testing.T) {
	h := newHarness(t)
	seedConfig(h, controlledConfig)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	h.clock.fire()
	h.manager.Close()

	steps := h.rec.snapshot()
	restore := slices.Index(steps, "Restore")
	if restore < 0 || !slices.Contains(steps[restore:], "Wait") {
		t.Errorf("steps %v: the rollback did not wait for the Clash API after the restart", steps)
	}
	if got := h.manager.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("phase %q, expected rollback", got)
	}
}

func TestRollbackReportsCoreThatDidNotComeUp(t *testing.T) {
	h := newHarness(t)
	seedConfig(h, controlledConfig)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	breakCore(h)
	h.clock.fire()
	h.manager.Close()

	tx := h.manager.Current()
	if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonRollbackFailed {
		t.Fatalf("phase %q, code %q: want failed with rollback_failed", tx.Phase, tx.ReasonCode)
	}
	if !strings.Contains(tx.Reason, crashLine) {
		t.Errorf("reason %q does not carry the crash reason of the service", tx.Reason)
	}
}

func TestReplayedRollbackReportsCoreThatDidNotComeUp(t *testing.T) {
	h := newHarness(t)
	seedConfig(h, controlledConfig)
	h.store.mu.Lock()
	h.store.backup = []byte(controlledConfig)
	h.store.mu.Unlock()
	seedState(t, h, apply.Transaction{ID: "истёкшая", Phase: apply.PhaseAwaitingConfirm, Window: 0})
	breakCore(h)

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if tx := h.manager.Current(); tx.ReasonCode != apply.ReasonRollbackFailed {
		t.Errorf("phase %q, code %q: want rollback_failed", tx.Phase, tx.ReasonCode)
	}
	if state, _ := h.store.ReadState(t.Context()); state == nil {
		t.Error("a failed rollback removed its state: the next start would not retry it")
	}
}

func TestPlaneRollbackReportsCoreThatDidNotComeUp(t *testing.T) {
	h := newPlaneHarness(t, nil, controlledConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)

	if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); err != nil {
		t.Fatalf("dataplane change: %v", err)
	}

	h.waitWindow(t)
	h.waitPlane(t, apply.PhaseAwaitingConfirm)
	h.health.err = errors.New("connection refused")
	h.clock.fire()
	h.plane.Close()

	if tx := h.plane.Current(); tx.ReasonCode != apply.ReasonRollbackFailed {
		t.Errorf("phase %q, code %q: want rollback_failed", tx.Phase, tx.ReasonCode)
	}
}
