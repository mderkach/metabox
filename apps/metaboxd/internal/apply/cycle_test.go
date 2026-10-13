package apply_test

import (
	"bytes"
	"errors"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/config"
)

// The init script returns before procd replaces the process: the API is polled
// only after procd reported the new pid.
func TestHealthcheckWaitsForNewProcess(t *testing.T) {
	h := newHarness(t)
	h.service.pid = 100
	h.service.lag = 2

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	calls := h.rec.snapshot()
	restart, wait := slices.Index(calls, "Restart"), slices.Index(calls, "Wait")

	if polls := countOf(calls[restart:wait], "PID"); polls != 3 {
		t.Errorf("procd polls between restart and healthcheck: %d, expected 3: two with the old pid and one with the new", polls)
	}
	if got := h.manager.Current().Phase; got != apply.PhaseAwaitingConfirm {
		t.Errorf("phase %q, expected awaiting confirmation", got)
	}
}

// The old process answers: procd never returned the new pid. The API answer is not
// credited to it: the healthcheck does not pass, the cycle stops with healthcheck_failed and
// rolls back.
func TestHealthcheckIgnoresOldProcess(t *testing.T) {
	h := newHarnessWith(t, 20*time.Millisecond, slog.New(slog.DiscardHandler))
	h.service.pid = 100
	h.service.lag = -1

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}

	tx := waitPhase(t, h, apply.PhaseRolledBack)

	if slices.Contains(h.rec.snapshot(), "Wait") {
		t.Error("API polled although procd returns the old pid: the answer was credited to the old process")
	}
	if tx.ReasonCode != apply.ReasonHealthcheckFailed {
		t.Errorf("reason code %q, expected %q", tx.ReasonCode, apply.ReasonHealthcheckFailed)
	}
	if !strings.Contains(tx.Reason, "100") {
		t.Errorf("detail %q does not name the old pid", tx.Reason)
	}
}

// Without procd there is nothing to compare the pid with: the apply is not stopped, the healthcheck
// goes with a single API poll.
func TestHealthcheckWithoutProcd(t *testing.T) {
	h := newHarness(t)
	h.service.pidErr = errors.New("ubus не отвечает")

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	if calls := h.rec.snapshot(); !slices.Contains(calls, "Wait") || countOf(calls, "PID") != 1 {
		t.Errorf("steps %v, expected one procd poll and healthcheck", calls)
	}
}

// The first apply: there is no backup, and the rollback has nothing to restore. The phase does not lie
// about a rollback, the service is not restarted an extra time.
func TestRollbackWithoutBackup(t *testing.T) {
	t.Run("window expired", func(t *testing.T) {
		h := newHarness(t)
		h.store.restoreErr = config.ErrNoBackup

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Fatalf("apply: %v", err)
		}
		h.waitWindow(t)

		h.clock.fire()
		h.manager.Close()

		tx := h.manager.Current()
		if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonNoBackup {
			t.Errorf("phase %q with code %q, expected failure with reason no_backup", tx.Phase, tx.ReasonCode)
		}
		if tx.Reason == "" {
			t.Error("detail is empty")
		}
		if got := countOf(h.rec.snapshot(), "Restart"); got != 1 {
			t.Errorf("restarts %d, expected one: from the apply itself", got)
		}
		if state, _ := h.store.ReadState(t.Context()); state != nil {
			t.Error("state of the closed transaction stayed on disk")
		}

		// The disk has the config written by the daemon itself: the next apply
		// runs into neither busyness nor a false outside edit.
		h.store.mu.Lock()
		h.store.sum = config.Sum(h.store.written)
		h.store.mu.Unlock()

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Errorf("apply after closing without a backup: %v", err)
		}
	})

	t.Run("cycle step failed", func(t *testing.T) {
		h := newHarness(t)
		h.store.restoreErr = config.ErrNoBackup
		h.health.err = errors.New("порт молчит")

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Fatalf("apply: %v", err)
		}
		h.manager.Close()

		tx := h.manager.Current()
		if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonNoBackup {
			t.Errorf("phase %q with code %q, expected failure with reason no_backup", tx.Phase, tx.ReasonCode)
		}
		if !strings.Contains(tx.Reason, "порт молчит") {
			t.Errorf("detail %q lost the step failure", tx.Reason)
		}
		if got := countOf(h.rec.snapshot(), "Restart"); got != 1 {
			t.Errorf("restarts %d, expected one: from the apply itself", got)
		}
	})
}

// The backup failed: there was no write yet, the disk has the previous config. A rollback from
// the backup of a previous transaction would lose what works: the transaction
// is closed with a failure without Restore and a restart.
func TestBackupFailureSkipsRollback(t *testing.T) {
	h := newHarness(t)
	h.store.backupErr = errors.New("диск переполнен")

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.manager.Close()

	tx := h.manager.Current()
	if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonBackupFailed {
		t.Errorf("phase %q with code %q, expected failure with reason backup_failed", tx.Phase, tx.ReasonCode)
	}
	if !strings.Contains(tx.Reason, "диск переполнен") {
		t.Errorf("detail %q lost the backup failure", tx.Reason)
	}

	calls := h.rec.snapshot()
	for _, step := range []string{"Restore", "WriteLists", "Write", "Restart"} {
		if slices.Contains(calls, step) {
			t.Errorf("%s called after backup failure: steps %v", step, calls)
		}
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("state of the closed transaction stayed on disk")
	}

	h.store.backupErr = nil

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Errorf("apply after backup failure: %v", err)
	}
}

// A backup failure and an unremoved state: the apply is released, and the applying phase
// left on disk is closed at the next start without a rollback: there was
// no write, and a rollback from the backup of a previous transaction would lose the working config.
func TestBackupFailureWithStateLeftReplaysWithoutRollback(t *testing.T) {
	h := newHarness(t)
	h.store.backupErr = errors.New("диск переполнен")
	h.store.clearErr = errors.New("файловая система только для чтения")

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.manager.Close()

	if tx := h.manager.Current(); tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonBackupFailed {
		t.Fatalf("phase %q with code %q, expected failure with reason backup_failed", tx.Phase, tx.ReasonCode)
	}

	if state, _ := h.store.ReadState(t.Context()); state == nil {
		t.Fatal("state removed although ClearState refused: nothing to check the replay with")
	}

	// The next daemon lifetime on the same disk.
	h.rec.mu.Lock()
	h.rec.calls = nil
	h.rec.mu.Unlock()

	h.store.backupErr = nil
	h.store.clearErr = nil
	restarted := apply.New(h.store, h.service, h.health, h.clock, slog.New(slog.DiscardHandler),
		apply.Options{Window: window, ClashPort: clashPort, CycleTimeout: cycleTimeout, ProcessInterval: time.Millisecond})
	t.Cleanup(restarted.Close)

	if err := restarted.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	calls := h.rec.snapshot()
	for _, step := range []string{"Restore", "Restart"} {
		if slices.Contains(calls, step) {
			t.Errorf("replay of a transaction without a write called %s: steps %v", step, calls)
		}
	}

	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("replay left the state on disk")
	}
}

// There is no config on the device: first start or removed by the owner. The apply
// is not stopped, and this apply's rollback has nothing to restore.
func TestBackupWithoutConfigContinues(t *testing.T) {
	h := newHarness(t)
	h.store.backupErr = config.ErrNoConfig

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	if !slices.Contains(h.rec.snapshot(), "Write") {
		t.Error("without a config on the device the apply did not reach the write")
	}

	// The backup of the previous transaction is taken together with the config: the rollback has nothing to restore.
	h.store.restoreErr = config.ErrNoBackup
	h.clock.fire()
	h.manager.Close()

	tx := h.manager.Current()
	if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonNoBackup {
		t.Errorf("phase %q with code %q, expected failure with reason no_backup", tx.Phase, tx.ReasonCode)
	}
}

// A failure to read the config before the history does not stop the apply, but it does not
// pass silently either; a missing config is a regular first start without a write.
func TestReadFailureBeforeSaveVersionIsLogged(t *testing.T) {
	tests := []struct {
		name     string
		readErr  error
		wantWarn bool
	}{
		{"reading failed", errors.New("ошибка ввода-вывода"), true},
		{"no config yet", config.ErrNoConfig, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer

			h := newHarnessWith(t, cycleTimeout, slog.New(slog.NewTextHandler(&logs, nil)))
			h.store.readErr = tt.readErr

			if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
				t.Fatalf("apply: %v", err)
			}
			h.waitWindow(t)

			if slices.Contains(h.rec.snapshot(), "SaveVersion") {
				t.Error("a version that was not read went into the history")
			}

			warned := strings.Contains(logs.String(), "level=WARN msg=\"конфиг не прочитан, версия в историю не сохранена\"")
			if warned != tt.wantWarn {
				t.Errorf("warning in the log: %v, expected %v; log:\n%s", warned, tt.wantWarn, logs.String())
			}
		})
	}
}

func countOf(calls []string, name string) int {
	n := 0

	for _, call := range calls {
		if call == name {
			n++
		}
	}

	return n
}
