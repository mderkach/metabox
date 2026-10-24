package apply_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/dataplane"
)

// fakeEditor is a UCI section: a write replaces it, a restore returns
// the snapshot.
type fakeEditor struct {
	mu       sync.Mutex
	section  dataplane.Snapshot
	written  []dataplane.Model
	restored []dataplane.Snapshot
	chains   []string
}

func (e *fakeEditor) Snapshot(context.Context) (dataplane.Snapshot, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	return e.section, nil
}

func (e *fakeEditor) Write(_ context.Context, m dataplane.Model) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.written = append(e.written, m)
	e.section = dataplane.Snapshot{Exists: true, Type: "dataplane", Options: map[string][]string{
		"source_ip": m.SourceIP,
		"dns_port":  {strconv.Itoa(m.DNSPort)},
	}}

	return nil
}

func (e *fakeEditor) Restore(_ context.Context, snap dataplane.Snapshot) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.restored = append(e.restored, snap)
	e.section = snap

	return nil
}

func (e *fakeEditor) Chains(context.Context) ([]string, dataplane.AppliedReason, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	return e.chains, "", nil
}

func (e *fakeEditor) counts() (int, int) {
	e.mu.Lock()
	defer e.mu.Unlock()

	return len(e.written), len(e.restored)
}

type fakeReloader struct {
	mu    sync.Mutex
	calls int
}

func (r *fakeReloader) Reload(context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.calls++

	return nil
}

func (r *fakeReloader) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.calls
}

type fakePlaneStore struct {
	cfg []byte

	mu    sync.Mutex
	state []byte
}

func (s *fakePlaneStore) Read(context.Context) ([]byte, error) { return s.cfg, nil }

func (s *fakePlaneStore) ReadPlaneState(context.Context) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.state == nil {
		return nil, config.ErrNoState
	}

	return s.state, nil
}

func (s *fakePlaneStore) WritePlaneState(_ context.Context, data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.state = data

	return nil
}

func (s *fakePlaneStore) ClearPlaneState(context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.state = nil

	return nil
}

func (s *fakePlaneStore) saved() []byte {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.state
}

type failingProber struct{}

func (failingProber) Probe(context.Context, clashapi.DNSInbound) error {
	return errors.New("dns-in не ответил")
}

type planeHarness struct {
	*harness
	plane    *apply.Plane
	editor   *fakeEditor
	reloader *fakeReloader
	pstore   *fakePlaneStore
}

// previousSection is the section before the change: interception enabled, listed, admin at
// 192.168.1.10, dns-in on 5333.
func previousSection() dataplane.Snapshot {
	return dataplane.Snapshot{Exists: true, Type: "dataplane", Options: map[string][]string{
		"enabled":       {"1"},
		"acl_mode":      {"listed"},
		"source_ip":     {"192.168.1.10", "192.168.1.20"},
		"lan_interface": {"br-lan"},
	}}
}

func newPlaneHarness(t *testing.T, dns apply.DNSProber, cfg string, log *slog.Logger) *planeHarness {
	t.Helper()

	h := &planeHarness{
		harness:  newHarness(t),
		editor:   &fakeEditor{section: previousSection(), chains: dataplane.ExpectedChains()},
		reloader: &fakeReloader{},
		pstore:   &fakePlaneStore{cfg: []byte(cfg)},
	}
	h.plane = h.newPlane(dns, log)

	return h
}

func (h *planeHarness) newPlane(dns apply.DNSProber, log *slog.Logger) *apply.Plane {
	return h.newPlaneFor(dataplane.Service, dns, log)
}

func (h *planeHarness) newPlaneFor(service string, dns apply.DNSProber, log *slog.Logger) *apply.Plane {
	return apply.NewPlane(h.manager, h.editor, h.reloader, h.pstore, h.health, h.clock, log, apply.PlaneOptions{
		Window:       window,
		CycleTimeout: cycleTimeout,
		DNS:          dns,
		Service:      service,
	})
}

func (h *planeHarness) waitPlane(t *testing.T, phases ...apply.Phase) apply.Transaction {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		tx := h.plane.Current()
		for _, phase := range phases {
			if tx.Phase == phase {
				return tx
			}
		}

		time.Sleep(time.Millisecond)
	}

	t.Fatalf("dataplane change did not reach %v: phase %q", phases, h.plane.Current().Phase)

	return apply.Transaction{}
}

// aclChange is the same model without the administrator address.
func aclChange() dataplane.Model {
	m := dataplane.Defaults()
	m.SourceIP = []string{"192.168.1.20"}

	return m
}

var admin = netip.MustParseAddr("192.168.1.10")

func TestPlaneConfirm(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)

	tx, err := h.plane.Start(t.Context(), aclChange(), "", admin)
	if err != nil {
		t.Fatalf("dataplane change: %v", err)
	}

	if got := h.waitWindow(t); got != window {
		t.Errorf("window %v, expected %v", got, window)
	}

	h.waitPlane(t, apply.PhaseAwaitingConfirm)

	confirmed, err := h.plane.Confirm(t.Context(), tx.ID)
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}

	if confirmed.Phase != apply.PhaseConfirmed {
		t.Errorf("phase %q, expected confirmation", confirmed.Phase)
	}

	h.plane.Close()

	if written, restored := h.editor.counts(); written != 1 || restored != 0 {
		t.Errorf("writes %d, rollbacks %d; expected one write without a rollback", written, restored)
	}
	if got := h.reloader.count(); got != 1 {
		t.Errorf("reload %d times, expected one", got)
	}
	if h.pstore.saved() != nil {
		t.Error("state of the confirmed change stayed on disk")
	}
}

// A change that takes the administrator address out of interception is applied and
// rolled back by the window without confirmation: it cuts the administrator off for no longer than the window.
func TestPlaneRollbackWithoutConfirmation(t *testing.T) {
	var logs bytes.Buffer

	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(h.plane.Close)

	if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); err != nil {
		t.Fatalf("dataplane change: %v", err)
	}

	h.waitWindow(t)
	h.waitPlane(t, apply.PhaseAwaitingConfirm)
	h.clock.fire()
	h.plane.Close()

	if got := h.plane.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("phase %q, expected rollback", got)
	}

	h.editor.mu.Lock()
	restored := h.editor.restored
	section := h.editor.section
	h.editor.mu.Unlock()

	if len(restored) != 1 || !restored[0].Equal(previousSection()) || !section.Equal(previousSection()) {
		t.Errorf("rollback returned %+v, expected the previous section", restored)
	}
	if got := h.reloader.count(); got != 2 {
		t.Errorf("reload %d times, expected two: change and rollback", got)
	}
	if h.pstore.saved() != nil {
		t.Error("state of the rolled back change stayed on disk")
	}
	if !strings.Contains(logs.String(), "takes the request address out of interception") {
		t.Errorf("taking the administrator out of interception is not noted in the log:\n%s", logs.String())
	}
}

func TestPlaneDNSPortProbeFailureRollsBack(t *testing.T) {
	m := aclChange()
	m.DNSPort = 5444

	cfg := `{"inbounds":[{"type":"direct","tag":"dns-in","listen":"127.0.0.1","listen_port":5444}],` +
		`"experimental":{"clash_api":{"external_controller":"127.0.0.1:9090"}}}`

	tests := []struct {
		name string
		cfg  string
	}{
		{"dns-in on the new port does not answer", cfg},
		{"no dns-in on the new port in the config", configWithDNSIn(5333)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newPlaneHarness(t, failingProber{}, tt.cfg, slog.New(slog.DiscardHandler))
			t.Cleanup(h.plane.Close)

			if _, err := h.plane.Start(t.Context(), m, "", admin); err != nil {
				t.Fatalf("dataplane change: %v", err)
			}

			tx := h.waitPlane(t, apply.PhaseRolledBack)
			h.plane.Close()

			if tx.ReasonCode != apply.ReasonDNSProbeFailed {
				t.Errorf("code %q, expected %q", tx.ReasonCode, apply.ReasonDNSProbeFailed)
			}
			if _, restored := h.editor.counts(); restored != 1 {
				t.Errorf("rollbacks %d, expected one", restored)
			}
			if got := h.reloader.count(); got != 2 {
				t.Errorf("reload %d times, expected two", got)
			}
		})
	}
}

func TestPlaneMissingChainsRollBack(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)
	h.editor.chains = []string{"metabox_redirect"}

	if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); err != nil {
		t.Fatalf("dataplane change: %v", err)
	}

	if tx := h.waitPlane(t, apply.PhaseRolledBack); tx.ReasonCode != apply.ReasonInterceptionMissing {
		t.Errorf("code %q, expected %q", tx.ReasonCode, apply.ReasonInterceptionMissing)
	}
}

func TestPlaneInvalidModelReservesNothing(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)

	m := aclChange()
	m.SourceIP = []string{"not-an-ip"}

	_, err := h.plane.Start(t.Context(), m, "", admin)
	if _, ok := errors.AsType[*dataplane.InvalidError](err); !ok {
		t.Fatalf("got %v, expected InvalidError", err)
	}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Errorf("after the rejected model the config apply is busy: %v", err)
	}
}

// The section was edited over SSH after the panel read the model: a change from a
// stale base is rejected before the write and does not take the apply.
func TestPlaneStaleBase(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)

	stale := previousSection().Sum()

	h.editor.mu.Lock()
	h.editor.section.Options["source_ip"] = []string{"192.168.1.30"}
	edited := h.editor.section.Sum()
	h.editor.mu.Unlock()

	if _, err := h.plane.Start(t.Context(), aclChange(), stale, admin); !errors.Is(err, apply.ErrDataplaneModified) {
		t.Fatalf("got %v, expected ErrDataplaneModified", err)
	}

	if written, _ := h.editor.counts(); written != 0 {
		t.Errorf("UCI writes %d after the failure, expected none", written)
	}
	if h.pstore.saved() != nil {
		t.Error("the rejected change left state on disk")
	}

	if _, err := h.plane.Start(t.Context(), aclChange(), edited, admin); err != nil {
		t.Fatalf("change from a fresh base: %v", err)
	}

	h.waitPlane(t, apply.PhaseAwaitingConfirm)

	if written, _ := h.editor.counts(); written != 1 {
		t.Errorf("UCI writes %d, expected one", written)
	}
}

func TestPlaneForeignServiceReservesNothing(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)

	plane := h.newPlaneFor("homeproxy", nil, slog.New(slog.DiscardHandler))
	t.Cleanup(plane.Close)

	if _, err := plane.Start(t.Context(), aclChange(), "", admin); !errors.Is(err, apply.ErrDataplaneForeignService) {
		t.Fatalf("got %v, expected ErrDataplaneForeignService", err)
	}

	if written, _ := h.editor.counts(); written != 0 {
		t.Errorf("UCI writes %d after the failure, expected none", written)
	}
	if h.pstore.saved() != nil {
		t.Error("the rejected change left state on disk")
	}
	if h.reloader.count() != 0 {
		t.Error("the rejected change pulled the service reload")
	}

	if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); err != nil {
		t.Fatalf("change on the metabox-singbox service: %v", err)
	}
}

func TestPlaneAndApplyAreExclusive(t *testing.T) {
	t.Run("dataplane during a running config apply", func(t *testing.T) {
		h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
		t.Cleanup(h.plane.Close)

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Fatalf("apply: %v", err)
		}
		h.waitWindow(t)

		if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); !errors.Is(err, apply.ErrBusy) {
			t.Errorf("got %v, expected ErrBusy", err)
		}
		if written, _ := h.editor.counts(); written != 0 {
			t.Error("model written during a running config apply")
		}
	})

	t.Run("config during a running dataplane change", func(t *testing.T) {
		h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
		t.Cleanup(h.plane.Close)

		tx, err := h.plane.Start(t.Context(), aclChange(), "", admin)
		if err != nil {
			t.Fatalf("dataplane change: %v", err)
		}
		h.waitWindow(t)
		h.waitPlane(t, apply.PhaseAwaitingConfirm)

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
			t.Errorf("got %v, expected ErrBusy", err)
		}

		if _, err := h.plane.Confirm(t.Context(), tx.ID); err != nil {
			t.Fatalf("confirm: %v", err)
		}

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Errorf("after confirm the config apply is busy: %v", err)
		}
	})
}

// The daemon crashed in the window: awaiting_confirm is on disk. The next start raises the window
// again, and without confirmation the previous model returns.
func TestPlaneReplayAfterCrashInWindow(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))

	if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); err != nil {
		t.Fatalf("dataplane change: %v", err)
	}
	h.waitWindow(t)
	h.waitPlane(t, apply.PhaseAwaitingConfirm)
	h.plane.Close()

	if h.pstore.saved() == nil {
		t.Fatal("daemon stop within the window left no state")
	}

	// A new daemon lifetime: its own Manager, the same disk and the same UCI.
	h.harness = newHarness(t)
	h.plane = h.newPlane(nil, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)

	if err := h.plane.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if got := h.waitWindow(t); got != window {
		t.Errorf("restored window %v, expected %v", got, window)
	}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("in the restored window the config apply is not busy: %v", err)
	}

	h.clock.fire()
	h.plane.Close()

	if got := h.plane.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("phase %q, expected rollback", got)
	}
	if _, restored := h.editor.counts(); restored != 1 {
		t.Errorf("rollbacks %d, expected one", restored)
	}
	if h.pstore.saved() != nil {
		t.Error("state stayed on disk after rollback")
	}
}

func TestPlaneReplay(t *testing.T) {
	tests := []struct {
		name         string
		state        string
		section      dataplane.Snapshot
		wantRestored int
	}{
		{
			name:         "window expired",
			state:        `{"id":"x","phase":"awaiting_confirm","window":0,"previous":{"exists":false}}`,
			section:      previousSection(),
			wantRestored: 1,
		},
		{
			name:         "interrupted after the write",
			state:        `{"id":"x","phase":"applying","window":60000000000,"previous":{"exists":false}}`,
			section:      previousSection(),
			wantRestored: 1,
		},
		{
			name:         "interrupted before the write",
			state:        `{"id":"x","phase":"applying","window":60000000000,"previous":{"exists":false}}`,
			section:      dataplane.Snapshot{},
			wantRestored: 0,
		},
		{
			name:         "finished phase",
			state:        `{"id":"x","phase":"confirmed","window":0,"previous":{"exists":false}}`,
			section:      previousSection(),
			wantRestored: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
			t.Cleanup(h.plane.Close)
			h.editor.section = tt.section
			h.pstore.state = []byte(tt.state)

			if err := h.plane.Replay(t.Context()); err != nil {
				t.Fatalf("replay: %v", err)
			}

			if _, restored := h.editor.counts(); restored != tt.wantRestored {
				t.Errorf("rollbacks %d, expected %d", restored, tt.wantRestored)
			}
			if h.reloader.count() != tt.wantRestored {
				t.Errorf("reload %d times, expected %d", h.reloader.count(), tt.wantRestored)
			}
			if h.pstore.saved() != nil {
				t.Error("state stayed on disk")
			}
			if h.plane.Current().Active() {
				t.Errorf("after the replay the transaction is active: %+v", h.plane.Current())
			}
		})
	}
}
