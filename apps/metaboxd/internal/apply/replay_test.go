package apply_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"slices"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/config"
)

// seedState puts the state the way the previous daemon lifetime would have left it.
func seedState(t *testing.T, h *harness, tx apply.Transaction) {
	t.Helper()

	data, err := json.Marshal(tx)
	if err != nil {
		t.Fatalf("state serialization: %v", err)
	}
	if err := h.store.WriteState(t.Context(), data); err != nil {
		t.Fatalf("state preparation: %v", err)
	}

	h.rec.mu.Lock()
	h.rec.calls = nil
	h.rec.mu.Unlock()
}

// The cycle broke after the config write: the sha on disk matched the sum from the
// state, so the previous config is restored.
func TestReplayRollsBackInterruptedApply(t *testing.T) {
	h := newHarness(t)
	h.store.mu.Lock()
	h.store.sum = "записанный"
	h.store.mu.Unlock()
	seedState(t, h, apply.Transaction{ID: "прерванная", Phase: apply.PhaseApplying, Window: window, Sum: "записанный"})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if got := h.rec.snapshot(); !slices.Contains(got, "Restore") || !slices.Contains(got, "Restart") {
		t.Errorf("steps %v, expected rollback and restart", got)
	}
	if got := h.manager.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("phase %q, expected rollback", got)
	}
}

// Power lost between writing the state and the config: the disk has the config of the previous
// generation, and the backup might be left from a previous transaction: a rollback from it
// would silently lose the confirmed version.
func TestReplaySkipsRollbackWhenConfigWasNotWritten(t *testing.T) {
	h := newHarness(t)
	h.store.mu.Lock()
	h.store.sum = "подтверждённый"
	h.store.mu.Unlock()
	seedState(t, h, apply.Transaction{ID: "оборванная", Phase: apply.PhaseApplying, Window: window, Sum: "новый"})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if got := h.rec.snapshot(); slices.Contains(got, "Restore") || slices.Contains(got, "Restart") {
		t.Errorf("steps %v, expected only state cleanup", got)
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("state of the failed write stayed on disk")
	}
}

func TestReplayRollsBackExpiredWindow(t *testing.T) {
	h := newHarness(t)
	seedState(t, h, apply.Transaction{ID: "истёкшая", Phase: apply.PhaseAwaitingConfirm, Window: 0})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if !slices.Contains(h.rec.snapshot(), "Restore") {
		t.Errorf("there was no rollback: %v", h.rec.snapshot())
	}
	if got := h.manager.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("phase %q, expected rollback", got)
	}
}

// An unexpired window is restored by a timer: the user keeps a chance
// to confirm the connection, and without confirmation the rollback still happens.
func TestReplayRestoresLiveWindow(t *testing.T) {
	h := newHarness(t)
	seedState(t, h, apply.Transaction{
		ID:     "живая",
		Phase:  apply.PhaseAwaitingConfirm,
		Window: 30 * time.Second,
		Sum:    "сумма-из-состояния",
	})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if got := h.waitWindow(t); got != 30*time.Second {
		t.Errorf("window %v, expected 30s from the state", got)
	}
	if got := h.manager.Current().Phase; got != apply.PhaseAwaitingConfirm {
		t.Errorf("phase %q, expected awaiting confirmation", got)
	}
	if slices.Contains(h.rec.snapshot(), "Restore") {
		t.Error("the live window rolled back immediately")
	}

	h.clock.fire()
	h.manager.Close()

	if !slices.Contains(h.rec.snapshot(), "Restore") {
		t.Errorf("restored window did not lead to a rollback: %v", h.rec.snapshot())
	}
}

func TestReplayConfirmsRestoredWindow(t *testing.T) {
	h := newHarness(t)
	seedState(t, h, apply.Transaction{ID: "живая", Phase: apply.PhaseAwaitingConfirm, Window: 30 * time.Second})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), "живая"); err != nil {
		t.Fatalf("confirm of the restored transaction: %v", err)
	}

	h.manager.Close()

	if slices.Contains(h.rec.snapshot(), "Restore") {
		t.Error("confirmed transaction was rolled back")
	}
}

func TestReplayClearsFinishedState(t *testing.T) {
	h := newHarness(t)
	seedState(t, h, apply.Transaction{ID: "завершённая", Phase: apply.PhaseConfirmed})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if !slices.Contains(h.rec.snapshot(), "ClearState") {
		t.Errorf("state of the finished transaction stayed: %v", h.rec.snapshot())
	}
}

// The state of the confirmed transaction was not removed: the terminal phase
// stays on disk, and a reboot does not roll back the confirmed config.
func TestReplayKeepsConfirmedWhenStateNotCleared(t *testing.T) {
	h := newHarness(t)
	h.store.clearErr = errors.New("файловая система только для чтения")

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("confirm: %v", err)
	}
	h.manager.Close()

	data, err := h.store.ReadState(t.Context())
	if err != nil {
		t.Fatalf("reading state: %v", err)
	}

	var saved apply.Transaction
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatalf("parsing state: %v", err)
	}
	if saved.Phase != apply.PhaseConfirmed {
		t.Fatalf("phase on disk %q, expected confirmation", saved.Phase)
	}

	// The next daemon lifetime on the same disk.
	h.rec.mu.Lock()
	h.rec.calls = nil
	h.rec.mu.Unlock()

	h.store.clearErr = nil
	restarted := apply.New(h.store, h.service, h.health, h.clock, slog.New(slog.DiscardHandler),
		apply.Options{Window: window, ClashPort: clashPort, CycleTimeout: cycleTimeout, ProcessInterval: time.Millisecond})
	t.Cleanup(restarted.Close)

	if err := restarted.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if got := h.rec.snapshot(); slices.Contains(got, "Restore") || slices.Contains(got, "Restart") {
		t.Errorf("steps %v: the confirmed config was rolled back after reboot", got)
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("terminal state not removed by the replay")
	}
}

// The cycle broke after writing the first config: there is no backup, and the replay
// closes the transaction with its own reason, not with a rollback and an extra restart.
func TestReplayWithoutBackup(t *testing.T) {
	h := newHarness(t)
	h.store.restoreErr = config.ErrNoBackup
	h.store.mu.Lock()
	h.store.sum = "записанный"
	h.store.mu.Unlock()
	seedState(t, h, apply.Transaction{ID: "первая", Phase: apply.PhaseApplying, Window: window, Sum: "записанный"})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if got := h.rec.snapshot(); slices.Contains(got, "Restart") {
		t.Errorf("steps %v: the service was restarted although there was nothing to restore", got)
	}
	if tx := h.manager.Current(); tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonNoBackup {
		t.Errorf("phase %q with code %q, expected failure with reason no_backup", tx.Phase, tx.ReasonCode)
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("state of the closed transaction stayed on disk")
	}
}

// The cycle broke after writing the list files over a device without a config: the config
// is not there, the lists are the transaction's. The replay returns the lists alone and
// closes the transaction with its own reason, without a restart.
func TestReplayReturnsListsWithoutConfig(t *testing.T) {
	h := newHarness(t)
	h.store.restoreErr = config.ErrListsOnly
	written := []byte(`{"rules":[]}`)
	h.store.mu.Lock()
	h.store.sumErr = fs.ErrNotExist
	h.store.lists = map[string][]byte{"my.json": written}
	h.store.mu.Unlock()
	seedState(t, h, apply.Transaction{
		ID:     "без-конфига",
		Phase:  apply.PhaseApplying,
		Window: window,
		Sum:    "записанный",
		Lists:  map[string]string{"my.json": config.Sum(written)},
	})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	got := h.rec.snapshot()
	if !slices.Contains(got, "Restore") {
		t.Errorf("steps %v: the written lists were not returned", got)
	}
	if slices.Contains(got, "Restart") {
		t.Errorf("steps %v: the service was restarted although there was no config to restore", got)
	}
	if tx := h.manager.Current(); tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonListsRestored {
		t.Errorf("phase %q with code %q, expected failure with reason lists_restored", tx.Phase, tx.ReasonCode)
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("state of the closed transaction stayed on disk")
	}
}

func TestReplayWithoutState(t *testing.T) {
	h := newHarness(t)

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("clean start: %v", err)
	}
	if got := h.rec.snapshot(); len(got) != 0 {
		t.Errorf("steps %v executed on a clean start", got)
	}
}

// The same text applied twice, the daemon dies in the backup step: a journal written
// before the backup would describe a target hash the disk already carries, and the
// replay would restore the backup of the earlier transaction, an older config than the
// running one. With the journal after the backup there is nothing to replay, and the
// running config stays.
func TestReplayAfterCrashInBackupKeepsRunningConfig(t *testing.T) {
	tests := []struct {
		name  string
		lists apply.Lists
	}{
		{name: "same config"},
		{name: "list-only apply", lists: apply.Lists{Put: map[string][]byte{"my.json": []byte(`{"rules":[]}`)}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)

			older := []byte(`{"log":{"level":"debug"}}`)
			h.store.mu.Lock()
			h.store.written = older
			h.store.sum = config.Sum(older)
			h.store.mu.Unlock()

			// The section is already in place, as in a config the panel reread after an apply:
			// Ensure would otherwise add a fresh secret and the second text would not be the same.
			const settled = `{"log":{"level":"info"},"experimental":{"clash_api":{"external_controller":"127.0.0.1:9090"}}}`

			tx, err := h.manager.Start(t.Context(), []byte(settled), apply.Lists{}, "", "")
			if err != nil {
				t.Fatalf("first apply: %v", err)
			}
			h.waitWindow(t)
			if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
				t.Fatalf("confirm: %v", err)
			}

			running := h.store.config()
			h.store.mu.Lock()
			h.store.sum = config.Sum(running)
			h.store.mu.Unlock()

			// The backup step returns only when the test is over; the harness Close runs after that.
			backupStarted, backupRelease := h.store.hold("Backup")
			t.Cleanup(func() { close(backupRelease) })

			if _, err := h.manager.Start(t.Context(), []byte(settled), tt.lists, "", ""); err != nil {
				t.Fatalf("second apply: %v", err)
			}
			entered(t, backupStarted)

			// The next daemon lifetime over the same disk.
			h.rec.mu.Lock()
			h.rec.calls = nil
			h.rec.mu.Unlock()

			restarted := apply.New(h.store, h.service, h.health, h.clock, slog.New(slog.DiscardHandler),
				apply.Options{Window: window, ClashPort: clashPort, CycleTimeout: cycleTimeout, ProcessInterval: time.Millisecond})
			t.Cleanup(restarted.Close)

			if err := restarted.Replay(t.Context()); err != nil {
				t.Fatalf("replay: %v", err)
			}

			if got := h.store.config(); !bytes.Equal(got, running) {
				t.Errorf("config after replay %s, expected the running one %s", got, running)
			}
			if got := h.rec.snapshot(); slices.Contains(got, "Restore") || slices.Contains(got, "Restart") {
				t.Errorf("steps %v: the replay rolled back although nothing was written", got)
			}
			if restarted.Current().Active() {
				t.Errorf("after the replay the transaction is active: %+v", restarted.Current())
			}
		})
	}
}
