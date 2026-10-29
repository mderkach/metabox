package apply_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"testing/synctest"
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
	synctest.Test(t, func(t *testing.T) {
		h := newHarnessWith(t, 20*time.Millisecond, slog.New(slog.DiscardHandler))
		h.service.pid = 100
		h.service.lag = -1

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Fatalf("apply: %v", err)
		}

		// The bubble clock moves only while this goroutine sleeps too: the cycle ceiling
		// passes here.
		time.Sleep(time.Second)

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
	})
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
		synctest.Test(t, func(t *testing.T) {
			h := newHarness(t)
			h.store.restoreErr = config.ErrNoBackup
			h.health.err = errors.New("порт молчит")

			if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
				t.Fatalf("apply: %v", err)
			}

			tx := waitPhase(t, h, apply.PhaseFailed)
			h.manager.Close()

			if tx.ReasonCode != apply.ReasonNoBackup {
				t.Errorf("phase %q with code %q, expected failure with reason no_backup", tx.Phase, tx.ReasonCode)
			}
			if !strings.Contains(tx.Reason, "порт молчит") {
				t.Errorf("detail %q lost the step failure", tx.Reason)
			}
			if got := countOf(h.rec.snapshot(), "Restart"); got != 1 {
				t.Errorf("restarts %d, expected one: from the apply itself", got)
			}
		})
	})
}

// The backup failed: there was no write yet, the disk has the previous config. A rollback from
// the backup of a previous transaction would lose what works: the transaction
// is closed with a failure without Restore and a restart.
func TestBackupFailureSkipsRollback(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		h := newHarness(t)
		h.store.backupErr = errors.New("диск переполнен")

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Fatalf("apply: %v", err)
		}

		tx := waitPhase(t, h, apply.PhaseFailed)
		h.manager.Close()

		if tx.ReasonCode != apply.ReasonBackupFailed {
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
	})
}

// The journal did not reach the disk after the backup: nothing is written, the disk has
// the previous config, and the transaction is closed without a rollback or a restart. The
// apply is released: the owner retries once the disk is back.
func TestJournalFailureSkipsRollback(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		h := newHarness(t)
		h.store.stateErr = errors.New("файловая система только для чтения")

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Fatalf("apply: %v", err)
		}

		tx := waitPhase(t, h, apply.PhaseFailed)
		h.manager.Close()

		if tx.ReasonCode != apply.ReasonWriteFailed {
			t.Errorf("phase %q with code %q, expected failure with reason write_failed", tx.Phase, tx.ReasonCode)
		}
		if !strings.Contains(tx.Reason, "файловая система только для чтения") {
			t.Errorf("detail %q lost the journal failure", tx.Reason)
		}

		calls := h.rec.snapshot()
		if !slices.Contains(calls, "Backup") {
			t.Errorf("journal written without a backup: steps %v", calls)
		}
		for _, step := range []string{"Restore", "WriteLists", "Write", "Restart"} {
			if slices.Contains(calls, step) {
				t.Errorf("%s called after journal failure: steps %v", step, calls)
			}
		}

		h.store.stateErr = nil

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Errorf("apply after journal failure: %v", err)
		}
	})
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

// No config on the device, but list files are there: the rollback returns the lists alone.
// The phase does not lie about a rollback, the service is not restarted, and the returned
// lists are not taken for an outside edit by the next apply.
func TestRollbackReturnsListsWithoutConfig(t *testing.T) {
	h := newHarness(t)
	h.store.backupErr = config.ErrNoConfig
	h.store.restoreErr = config.ErrListsOnly

	lists := apply.Lists{Put: map[string][]byte{"my.json": []byte(`{"rules":[]}`)}}
	if _, err := h.manager.Start(t.Context(), []byte(validConfig), lists, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}
	h.waitWindow(t)

	h.clock.fire()
	h.manager.Close()

	tx := h.manager.Current()
	if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonListsRestored {
		t.Errorf("phase %q with code %q, expected failure with reason lists_restored", tx.Phase, tx.ReasonCode)
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

	// Restore put the previous lists back, and the config written by the daemon stays.
	h.store.mu.Lock()
	h.store.sum = config.Sum(h.store.written)
	h.store.lists = map[string][]byte{"my.json": []byte(`{"rules":[{"domain":["example.com"]}]}`)}
	h.store.mu.Unlock()

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Errorf("apply after returning the lists: %v", err)
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

			warned := strings.Contains(logs.String(), "level=WARN msg=\"config not read, version not saved to the history\"")
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

// The daemon stops in the middle of a step: Close cancels the cycle, and the dying process
// neither rolls back nor closes the transaction. The journal stays on disk, and the next
// start replays it: a write that did not happen is cleared, a written config is rolled back.
func TestCloseDuringStepLeavesReplayableState(t *testing.T) {
	tests := []struct {
		name string
		hold func(h *harness) (started, release chan struct{})
		// written: the config reached the disk before the stop, so the replay rolls back.
		written bool
	}{
		{"write", func(h *harness) (chan struct{}, chan struct{}) { return h.store.hold("Write") }, false},
		{"restart", func(h *harness) (chan struct{}, chan struct{}) { return h.service.hold("Restart") }, true},
		{"healthcheck", func(h *harness) (chan struct{}, chan struct{}) { return h.health.hold("Wait") }, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)
			started, _ := tt.hold(h)

			tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
			if err != nil {
				t.Fatalf("apply: %v", err)
			}
			entered(t, started)

			h.manager.Close()

			calls := h.rec.snapshot()
			for _, step := range []string{"Restore", "ClearState"} {
				if slices.Contains(calls, step) {
					t.Errorf("%s called in the stopping daemon: steps %v", step, calls)
				}
			}
			if got := h.manager.Current().Phase; got != apply.PhaseApplying {
				t.Errorf("phase %q after the stop, expected applying", got)
			}

			data, err := h.store.ReadState(t.Context())
			if err != nil {
				t.Fatalf("state after the stop: %v", err)
			}

			var saved apply.Transaction
			if err := json.Unmarshal(data, &saved); err != nil {
				t.Fatalf("parsing state: %v", err)
			}
			if saved.ID != tx.ID || saved.Phase != apply.PhaseApplying {
				t.Fatalf("state on disk %+v, expected the applying transaction %s", saved, tx.ID)
			}

			// The next daemon lifetime over the same disk.
			h.rec.mu.Lock()
			h.rec.calls = nil
			h.rec.mu.Unlock()

			if tt.written {
				h.store.mu.Lock()
				h.store.sum = config.Sum(h.store.written)
				h.store.mu.Unlock()
			}

			restarted := apply.New(h.store, h.service, h.health, h.clock, slog.New(slog.DiscardHandler),
				apply.Options{Window: window, ClashPort: clashPort, CycleTimeout: cycleTimeout, ProcessInterval: time.Millisecond})
			t.Cleanup(restarted.Close)

			if err := restarted.Replay(t.Context()); err != nil {
				t.Fatalf("replay: %v", err)
			}

			calls = h.rec.snapshot()
			if rolledBack := slices.Contains(calls, "Restore") && slices.Contains(calls, "Restart"); rolledBack != tt.written {
				t.Errorf("replay rolled back: %v, expected %v; steps %v", rolledBack, tt.written, calls)
			}
			if state, _ := h.store.ReadState(t.Context()); state != nil {
				t.Error("state stayed on disk after the replay")
			}
			if restarted.Current().Active() {
				t.Errorf("after the replay the transaction is active: %+v", restarted.Current())
			}
		})
	}
}
