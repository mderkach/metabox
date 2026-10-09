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

// fakeEditor — секция UCI: запись подменяет её, восстановление возвращает
// снимок.
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

// previousSection — секция до смены: перехват включён, listed, админ на
// 192.168.1.10, dns-in на 5333.
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
	return apply.NewPlane(h.manager, h.editor, h.reloader, h.pstore, h.health, h.clock, log, apply.PlaneOptions{
		Window:       window,
		CycleTimeout: cycleTimeout,
		DNS:          dns,
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

	t.Fatalf("смена обвязки не дошла до %v: фаза %q", phases, h.plane.Current().Phase)

	return apply.Transaction{}
}

// aclChange — та же модель без адреса администратора.
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
		t.Fatalf("смена обвязки: %v", err)
	}

	if got := h.waitWindow(t); got != window {
		t.Errorf("окно %v, ожидали %v", got, window)
	}

	h.waitPlane(t, apply.PhaseAwaitingConfirm)

	confirmed, err := h.plane.Confirm(t.Context(), tx.ID)
	if err != nil {
		t.Fatalf("подтверждение: %v", err)
	}

	if confirmed.Phase != apply.PhaseConfirmed {
		t.Errorf("фаза %q, ожидали подтверждение", confirmed.Phase)
	}

	h.plane.Close()

	if written, restored := h.editor.counts(); written != 1 || restored != 0 {
		t.Errorf("записей %d, откатов %d; ожидали одну запись без отката", written, restored)
	}
	if got := h.reloader.count(); got != 1 {
		t.Errorf("reload %d раз, ожидали один", got)
	}
	if h.pstore.saved() != nil {
		t.Error("состояние подтверждённой смены осталось на диске")
	}
}

// Смена, которая выводит адрес администратора из перехвата, применяется, а
// без подтверждения откатывается по окну: дольше окна она его не отрезает.
func TestPlaneRollbackWithoutConfirmation(t *testing.T) {
	var logs bytes.Buffer

	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(h.plane.Close)

	if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); err != nil {
		t.Fatalf("смена обвязки: %v", err)
	}

	h.waitWindow(t)
	h.waitPlane(t, apply.PhaseAwaitingConfirm)
	h.clock.fire()
	h.plane.Close()

	if got := h.plane.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("фаза %q, ожидали откат", got)
	}

	h.editor.mu.Lock()
	restored := h.editor.restored
	section := h.editor.section
	h.editor.mu.Unlock()

	if len(restored) != 1 || !restored[0].Equal(previousSection()) || !section.Equal(previousSection()) {
		t.Errorf("откат вернул %+v, ожидали прежнюю секцию", restored)
	}
	if got := h.reloader.count(); got != 2 {
		t.Errorf("reload %d раз, ожидали два: смена и откат", got)
	}
	if h.pstore.saved() != nil {
		t.Error("состояние откаченной смены осталось на диске")
	}
	if !strings.Contains(logs.String(), "выводит адрес запроса из перехвата") {
		t.Errorf("вывод администратора из перехвата не отмечен в логе:\n%s", logs.String())
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
		{"dns-in на новом порту не отвечает", cfg},
		{"dns-in на новом порту в конфиге нет", configWithDNSIn(5333)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newPlaneHarness(t, failingProber{}, tt.cfg, slog.New(slog.DiscardHandler))
			t.Cleanup(h.plane.Close)

			if _, err := h.plane.Start(t.Context(), m, "", admin); err != nil {
				t.Fatalf("смена обвязки: %v", err)
			}

			tx := h.waitPlane(t, apply.PhaseRolledBack)
			h.plane.Close()

			if tx.ReasonCode != apply.ReasonDNSProbeFailed {
				t.Errorf("код %q, ожидали %q", tx.ReasonCode, apply.ReasonDNSProbeFailed)
			}
			if _, restored := h.editor.counts(); restored != 1 {
				t.Errorf("откатов %d, ожидали один", restored)
			}
			if got := h.reloader.count(); got != 2 {
				t.Errorf("reload %d раз, ожидали два", got)
			}
		})
	}
}

func TestPlaneMissingChainsRollBack(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)
	h.editor.chains = []string{"metabox_redirect"}

	if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); err != nil {
		t.Fatalf("смена обвязки: %v", err)
	}

	if tx := h.waitPlane(t, apply.PhaseRolledBack); tx.ReasonCode != apply.ReasonInterceptionMissing {
		t.Errorf("код %q, ожидали %q", tx.ReasonCode, apply.ReasonInterceptionMissing)
	}
}

func TestPlaneInvalidModelReservesNothing(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)

	m := aclChange()
	m.SourceIP = []string{"not-an-ip"}

	_, err := h.plane.Start(t.Context(), m, "", admin)
	if _, ok := errors.AsType[*dataplane.InvalidError](err); !ok {
		t.Fatalf("получили %v, ожидали InvalidError", err)
	}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Errorf("после отвергнутой модели применение конфига занято: %v", err)
	}
}

// Секцию правили по SSH после того, как панель прочитала модель: смена от
// устаревшей базы отклоняется до записи и применение не занимает.
func TestPlaneStaleBase(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)

	stale := previousSection().Sum()

	h.editor.mu.Lock()
	h.editor.section.Options["source_ip"] = []string{"192.168.1.30"}
	edited := h.editor.section.Sum()
	h.editor.mu.Unlock()

	if _, err := h.plane.Start(t.Context(), aclChange(), stale, admin); !errors.Is(err, apply.ErrDataplaneModified) {
		t.Fatalf("получили %v, ожидали ErrDataplaneModified", err)
	}

	if written, _ := h.editor.counts(); written != 0 {
		t.Errorf("записей в UCI %d после отказа, ожидали ни одной", written)
	}
	if h.pstore.saved() != nil {
		t.Error("отклонённая смена оставила состояние на диске")
	}

	if _, err := h.plane.Start(t.Context(), aclChange(), edited, admin); err != nil {
		t.Fatalf("смена от свежей базы: %v", err)
	}

	h.waitPlane(t, apply.PhaseAwaitingConfirm)

	if written, _ := h.editor.counts(); written != 1 {
		t.Errorf("записей в UCI %d, ожидали одну", written)
	}
}

func TestPlaneAndApplyAreExclusive(t *testing.T) {
	t.Run("обвязка при идущем применении конфига", func(t *testing.T) {
		h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
		t.Cleanup(h.plane.Close)

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Fatalf("применение: %v", err)
		}
		h.waitWindow(t)

		if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); !errors.Is(err, apply.ErrBusy) {
			t.Errorf("получили %v, ожидали ErrBusy", err)
		}
		if written, _ := h.editor.counts(); written != 0 {
			t.Error("модель записана при идущем применении конфига")
		}
	})

	t.Run("конфиг при идущей смене обвязки", func(t *testing.T) {
		h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))
		t.Cleanup(h.plane.Close)

		tx, err := h.plane.Start(t.Context(), aclChange(), "", admin)
		if err != nil {
			t.Fatalf("смена обвязки: %v", err)
		}
		h.waitWindow(t)
		h.waitPlane(t, apply.PhaseAwaitingConfirm)

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
			t.Errorf("получили %v, ожидали ErrBusy", err)
		}

		if _, err := h.plane.Confirm(t.Context(), tx.ID); err != nil {
			t.Fatalf("подтверждение: %v", err)
		}

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Errorf("после подтверждения применение конфига занято: %v", err)
		}
	})
}

// Демон упал в окне: на диске awaiting_confirm. Следующий старт поднимает окно
// заново, и без подтверждения прежняя модель возвращается.
func TestPlaneReplayAfterCrashInWindow(t *testing.T) {
	h := newPlaneHarness(t, nil, validConfig, slog.New(slog.DiscardHandler))

	if _, err := h.plane.Start(t.Context(), aclChange(), "", admin); err != nil {
		t.Fatalf("смена обвязки: %v", err)
	}
	h.waitWindow(t)
	h.waitPlane(t, apply.PhaseAwaitingConfirm)
	h.plane.Close()

	if h.pstore.saved() == nil {
		t.Fatal("остановка демона в окне не оставила состояния")
	}

	// Новая жизнь демона: свой Manager, тот же диск и та же UCI.
	h.harness = newHarness(t)
	h.plane = h.newPlane(nil, slog.New(slog.DiscardHandler))
	t.Cleanup(h.plane.Close)

	if err := h.plane.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	if got := h.waitWindow(t); got != window {
		t.Errorf("восстановленное окно %v, ожидали %v", got, window)
	}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); !errors.Is(err, apply.ErrBusy) {
		t.Errorf("в восстановленном окне применение конфига не занято: %v", err)
	}

	h.clock.fire()
	h.plane.Close()

	if got := h.plane.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("фаза %q, ожидали откат", got)
	}
	if _, restored := h.editor.counts(); restored != 1 {
		t.Errorf("откатов %d, ожидали один", restored)
	}
	if h.pstore.saved() != nil {
		t.Error("состояние после отката осталось на диске")
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
			name:         "окно истекло",
			state:        `{"id":"x","phase":"awaiting_confirm","window":0,"previous":{"exists":false}}`,
			section:      previousSection(),
			wantRestored: 1,
		},
		{
			name:         "оборвано после записи",
			state:        `{"id":"x","phase":"applying","window":60000000000,"previous":{"exists":false}}`,
			section:      previousSection(),
			wantRestored: 1,
		},
		{
			name:         "оборвано до записи",
			state:        `{"id":"x","phase":"applying","window":60000000000,"previous":{"exists":false}}`,
			section:      dataplane.Snapshot{},
			wantRestored: 0,
		},
		{
			name:         "завершённая фаза",
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
				t.Fatalf("доигрывание: %v", err)
			}

			if _, restored := h.editor.counts(); restored != tt.wantRestored {
				t.Errorf("откатов %d, ожидали %d", restored, tt.wantRestored)
			}
			if h.reloader.count() != tt.wantRestored {
				t.Errorf("reload %d раз, ожидали %d", h.reloader.count(), tt.wantRestored)
			}
			if h.pstore.saved() != nil {
				t.Error("состояние осталось на диске")
			}
			if h.plane.Current().Active() {
				t.Errorf("после доигрывания транзакция активна: %+v", h.plane.Current())
			}
		})
	}
}
