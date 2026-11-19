package apply_test

import (
	"encoding/json"
	"errors"
	"log/slog"
	"slices"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/dataplane"
)

// seedPlaneState puts the dataplane state the way the previous daemon lifetime would have
// left it.
func seedPlaneState(t *testing.T, h *planeHarness, tx apply.Transaction, previous dataplane.Snapshot) {
	t.Helper()

	data, err := json.Marshal(struct {
		apply.Transaction
		Previous dataplane.Snapshot `json:"previous"`
	}{tx, previous})
	if err != nil {
		t.Fatalf("state serialization: %v", err)
	}

	h.pstore.mu.Lock()
	h.pstore.state = data
	h.pstore.mu.Unlock()
}

// changedSection is the section after aclChange was written: it differs from
// previousSection, so a replay does not take the window for an interrupted rollback.
func changedSection() dataplane.Snapshot {
	return dataplane.Snapshot{Exists: true, Type: "dataplane", Options: map[string][]string{
		"source_ip": {"192.168.1.20"},
	}}
}

func stateOnDisk(t *testing.T, data []byte) apply.Transaction {
	t.Helper()

	var saved apply.Transaction
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatalf("parsing state: %v", err)
	}

	return saved
}

// A restored window holds the apply like a live one, and its sum is what the next apply
// compares the disk with: a confirmed window does not hide an outside edit.
func TestReplayRestoredWindowHoldsApply(t *testing.T) {
	h := newHarness(t)
	h.store.mu.Lock()
	h.store.sum = "сумма-из-состояния"
	h.store.mu.Unlock()
	seedState(t, h, apply.Transaction{ID: "живая", Phase: apply.PhaseAwaitingConfirm, Window: 30 * time.Second, Sum: "сумма-из-состояния"})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("apply in the restored window: got %v, expected ErrBusy", err)
	}

	if _, err := h.manager.Confirm(t.Context(), "живая"); err != nil {
		t.Fatalf("confirm of the restored transaction: %v", err)
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("state of the confirmed transaction stayed on disk")
	}

	h.store.mu.Lock()
	h.store.sum = "правка-по-ssh"
	h.store.mu.Unlock()

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrConfigModified) {
		t.Errorf("apply over an outside edit after the restored window: got %v, expected ErrConfigModified", err)
	}

	h.store.mu.Lock()
	h.store.sum = "сумма-из-состояния"
	h.store.mu.Unlock()

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Errorf("apply after the restored window was confirmed: %v", err)
	}
}

// A daemon stop inside a restored window leaves the window on disk for the next start,
// without a rollback in the dying process.
func TestReplayRestoredWindowSurvivesClose(t *testing.T) {
	h := newHarness(t)
	h.store.mu.Lock()
	h.store.sum = "сумма-из-состояния"
	h.store.mu.Unlock()
	seedState(t, h, apply.Transaction{ID: "живая", Phase: apply.PhaseAwaitingConfirm, Window: 30 * time.Second, Sum: "сумма-из-состояния"})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}
	h.waitWindow(t)
	h.manager.Close()

	if slices.Contains(h.rec.snapshot(), "Restore") {
		t.Error("the stopping daemon rolled back the restored window")
	}

	data, err := h.store.ReadState(t.Context())
	if err != nil {
		t.Fatalf("reading state: %v", err)
	}
	if saved := stateOnDisk(t, data); saved.Phase != apply.PhaseAwaitingConfirm || saved.Window != 30*time.Second {
		t.Errorf("state on disk %+v, expected the restored window as it was", saved)
	}
}

// A failed rollback leaves the state on disk, so the next start tries it again, and does
// not keep the apply taken.
func TestFailedRollbackKeepsState(t *testing.T) {
	t.Run("window expired", func(t *testing.T) {
		h := newHarness(t)

		tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
		if err != nil {
			t.Fatalf("apply: %v", err)
		}
		h.waitWindow(t)

		h.service.setRestartErr(errors.New("procd завис"))
		h.clock.fire()
		h.manager.Close()

		data, err := h.store.ReadState(t.Context())
		if err != nil {
			t.Fatalf("reading state: %v", err)
		}
		if saved := stateOnDisk(t, data); saved.ID != tx.ID || saved.Phase != apply.PhaseAwaitingConfirm {
			t.Errorf("state on disk %+v, expected the window of %s kept for the next start", saved, tx.ID)
		}
	})

	t.Run("replay", func(t *testing.T) {
		h := newHarness(t)
		h.service.setRestartErr(errors.New("procd завис"))
		seedState(t, h, apply.Transaction{ID: "истёкшая", Phase: apply.PhaseAwaitingConfirm, Window: 0})

		if err := h.manager.Replay(t.Context()); err != nil {
			t.Fatalf("replay: %v", err)
		}

		if tx := h.manager.Current(); tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonRollbackFailed {
			t.Errorf("phase %q with code %q, expected rollback failure", tx.Phase, tx.ReasonCode)
		}
		if state, _ := h.store.ReadState(t.Context()); state == nil {
			t.Error("state of the failed rollback was removed")
		}

		h.service.setRestartErr(nil)

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Errorf("apply after a failed replay rollback: %v", err)
		}
	})
}

func TestReplayRejectsCorruptState(t *testing.T) {
	h := newHarness(t)
	if err := h.store.WriteState(t.Context(), []byte("{оборвано")); err != nil {
		t.Fatalf("state preparation: %v", err)
	}

	if err := h.manager.Replay(t.Context()); err == nil {
		t.Error("a corrupt state was replayed without an error")
	}
	if slices.Contains(h.rec.snapshot(), "Restore") {
		t.Error("a corrupt state led to a rollback")
	}
}

// A restored dataplane window holds the config apply and is closed by Confirm without a
// rollback.
func TestPlaneReplayConfirmsRestoredWindow(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)
	h.editor.section = changedSection()
	seedPlaneState(t, h, apply.Transaction{ID: "живая", Phase: apply.PhaseAwaitingConfirm, Window: 30 * time.Second}, previousSection())

	if err := h.plane.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}
	if got := h.waitWindow(t); got != 30*time.Second {
		t.Errorf("window %v, expected 30s from the state", got)
	}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("config apply in the restored dataplane window: got %v, expected ErrBusy", err)
	}

	confirmed, err := h.plane.Confirm(t.Context(), "живая")
	if err != nil {
		t.Fatalf("confirm of the restored change: %v", err)
	}
	if confirmed.Phase != apply.PhaseConfirmed {
		t.Errorf("phase %q, expected confirmation", confirmed.Phase)
	}

	// Before Close: the window goroutine also releases the apply on its exit, and
	// only Confirm itself must be what frees it here.
	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Errorf("config apply right after the restored dataplane window was confirmed: %v", err)
	}

	h.plane.Close()

	if _, restored := h.editor.counts(); restored != 0 {
		t.Errorf("rollbacks %d, the confirmed change was rolled back", restored)
	}
	if h.pstore.saved() != nil {
		t.Error("state of the confirmed change stayed on disk")
	}
}

// Both journals carry a live window at start: a failed config rollback keeps its state, and
// a dataplane change could follow it. Confirming the config window must not release the
// apply while the dataplane window still holds it.
func TestConfirmLeavesApplyHeldByOtherWindow(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)
	h.store.mu.Lock()
	h.store.sum = "сумма-из-состояния"
	h.store.mu.Unlock()
	seedState(t, h.harness, apply.Transaction{ID: "конфиг", Phase: apply.PhaseAwaitingConfirm, Window: 30 * time.Second, Sum: "сумма-из-состояния"})
	h.editor.section = changedSection()
	seedPlaneState(t, h, apply.Transaction{ID: "плоскость", Phase: apply.PhaseAwaitingConfirm, Window: 30 * time.Second}, previousSection())

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("config replay: %v", err)
	}
	if err := h.plane.Replay(t.Context()); err != nil {
		t.Fatalf("dataplane replay: %v", err)
	}
	h.waitWindow(t)
	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), "конфиг"); err != nil {
		t.Fatalf("confirm of the config window: %v", err)
	}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("config apply inside the open dataplane window: got %v, expected ErrBusy", err)
	}
	if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("dataplane change inside the open dataplane window: got %v, expected ErrBusy", err)
	}

	if _, err := h.plane.Confirm(t.Context(), "плоскость"); err != nil {
		t.Fatalf("confirm of the dataplane window: %v", err)
	}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Errorf("config apply after both windows were confirmed: %v", err)
	}
}

func TestPlaneReplayRestoredWindowSurvivesClose(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	h.editor.section = changedSection()
	seedPlaneState(t, h, apply.Transaction{ID: "живая", Phase: apply.PhaseAwaitingConfirm, Window: 30 * time.Second}, previousSection())

	if err := h.plane.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}
	h.waitWindow(t)
	h.plane.Close()

	if _, restored := h.editor.counts(); restored != 0 {
		t.Errorf("rollbacks %d in the stopping daemon, expected none", restored)
	}
	if saved := stateOnDisk(t, h.pstore.saved()); saved.Phase != apply.PhaseAwaitingConfirm {
		t.Errorf("state on disk in phase %q, expected the restored window", saved.Phase)
	}
}

func TestPlaneFailedRollbackKeepsState(t *testing.T) {
	t.Run("window expired", func(t *testing.T) {
		h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
		t.Cleanup(h.plane.Close)
		h.editor.restoreErr = errors.New("uci commit не прошёл")

		if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); err != nil {
			t.Fatalf("dataplane change: %v", err)
		}
		h.waitWindow(t)
		h.waitPlane(t, apply.PhaseAwaitingConfirm)
		h.clock.fire()
		h.plane.Close()

		if tx := h.plane.Current(); tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonRollbackFailed {
			t.Errorf("phase %q with code %q, expected rollback failure", tx.Phase, tx.ReasonCode)
		}
		if saved := stateOnDisk(t, h.pstore.saved()); saved.Phase != apply.PhaseAwaitingConfirm {
			t.Errorf("state on disk in phase %q, expected the window kept for the next start", saved.Phase)
		}
		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Errorf("config apply after a failed dataplane rollback: %v", err)
		}
	})

	t.Run("replay", func(t *testing.T) {
		h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
		t.Cleanup(h.plane.Close)
		h.editor.restoreErr = errors.New("uci commit не прошёл")
		seedPlaneState(t, h, apply.Transaction{ID: "истёкшая", Phase: apply.PhaseAwaitingConfirm}, previousSection())

		if err := h.plane.Replay(t.Context()); err != nil {
			t.Fatalf("replay: %v", err)
		}

		if tx := h.plane.Current(); tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonRollbackFailed {
			t.Errorf("phase %q with code %q, expected rollback failure", tx.Phase, tx.ReasonCode)
		}
		if h.pstore.saved() == nil {
			t.Error("state of the failed rollback was removed")
		}
		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Errorf("config apply after a failed dataplane replay: %v", err)
		}
	})
}

func TestPlaneReplayRejectsCorruptState(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)
	h.pstore.state = []byte("{оборвано")

	if err := h.plane.Replay(t.Context()); err == nil {
		t.Error("a corrupt dataplane state was replayed without an error")
	}
	if _, restored := h.editor.counts(); restored != 0 {
		t.Errorf("rollbacks %d on a corrupt state, expected none", restored)
	}
}
