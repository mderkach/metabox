package apply_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/httpapi"
	"metabox/internal/procd"
	"metabox/internal/singbox"
)

// The Apply transaction end to end: HTTP handlers, the manager and the real Store on a
// temporary device, with the service and `sing-box check` scripted. A daemon instance is
// interrupted at a step and a fresh one on the same directories runs Replay, the way the
// daemon starts after a power loss.

const (
	runningConfig = `{"log":{"level":"warn"}}`
	nextConfig    = `{"log":{"level":"info"}}`
	// rejectedMarker makes the scripted check refuse a candidate.
	rejectedMarker = "rejected-by-check"
)

// errPowerLoss is what a daemon instance gets from the device once its power is cut: no
// step of it reaches the disk or the service any more.
var errPowerLoss = errors.New("power lost")

// device is the directories that outlive a daemon instance.
type device struct {
	configDir  string
	serviceDir string
}

func newDevice(t *testing.T) device {
	t.Helper()

	root := t.TempDir()
	dev := device{configDir: filepath.Join(root, "sing-box"), serviceDir: filepath.Join(root, "metabox")}

	// The init script creates both directories before the daemon starts.
	for _, dir := range []string{dev.configDir, dev.serviceDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(dev.configDir, configName), []byte(runningConfig), 0o644); err != nil {
		t.Fatal(err)
	}

	return dev
}

// deviceStore is the real Store with gates on the steps that change the disk, and a power
// switch: after cut the instance changes nothing.
type deviceStore struct {
	*config.Store
	gates

	rec *recorder

	mu  sync.Mutex
	off bool
}

func (s *deviceStore) cut() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.off = true
}

func (s *deviceStore) step(ctx context.Context, name string) error {
	s.rec.add(name)

	if err := s.pass(ctx, name); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.off {
		return errPowerLoss
	}

	return nil
}

func (s *deviceStore) Backup(ctx context.Context) error {
	if err := s.step(ctx, "Backup"); err != nil {
		return err
	}

	return s.Store.Backup(ctx)
}

func (s *deviceStore) SaveVersion(ctx context.Context, data []byte) error {
	if err := s.step(ctx, "SaveVersion"); err != nil {
		return err
	}

	return s.Store.SaveVersion(ctx, data)
}

func (s *deviceStore) WriteLists(ctx context.Context, put map[string][]byte, remove []string) error {
	if err := s.step(ctx, "WriteLists"); err != nil {
		return err
	}

	return s.Store.WriteLists(ctx, put, remove)
}

func (s *deviceStore) Write(ctx context.Context, data []byte) error {
	if err := s.step(ctx, "Write"); err != nil {
		return err
	}

	return s.Store.Write(ctx, data)
}

func (s *deviceStore) Restore(ctx context.Context) error {
	if err := s.step(ctx, "Restore"); err != nil {
		return err
	}

	return s.Store.Restore(ctx)
}

func (s *deviceStore) WriteState(ctx context.Context, data []byte) error {
	if err := s.step(ctx, "WriteState"); err != nil {
		return err
	}

	return s.Store.WriteState(ctx, data)
}

func (s *deviceStore) ClearState(ctx context.Context) error {
	if err := s.step(ctx, "ClearState"); err != nil {
		return err
	}

	return s.Store.ClearState(ctx)
}

// scriptedService stands in for the binary and the init script: the check reads the staged
// candidate the way `sing-box check -c <file> -D <dir>` would, a restart brings up a new
// process.
type scriptedService struct {
	gates

	rec *recorder

	mu  sync.Mutex
	pid int
	off bool
}

func (s *scriptedService) cut() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.off = true
}

func (s *scriptedService) Check(_ context.Context, file, workdir string) error {
	s.rec.add("Check")

	data, err := os.ReadFile(file)
	if err != nil {
		return fmt.Errorf("read candidate: %w", err)
	}

	if workdir != filepath.Dir(file) {
		return fmt.Errorf("candidate %s checked from %s", file, workdir)
	}

	if !json.Valid(data) || bytes.Contains(data, []byte(rejectedMarker)) {
		return &singbox.CheckError{Stderr: "FATAL[0000] decode config: " + rejectedMarker, ExitCode: 1}
	}

	return nil
}

func (s *scriptedService) Restart(ctx context.Context) error {
	s.rec.add("Restart")

	if err := s.pass(ctx, "Restart"); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.off {
		return errPowerLoss
	}

	s.pid++

	return nil
}

func (s *scriptedService) Launch(context.Context) (procd.Launch, error) {
	return procd.Launch{}, nil
}

func (s *scriptedService) PID(context.Context) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.pid, nil
}

// daemon is one lifetime of metaboxd on the device.
type daemon struct {
	dev     device
	rec     *recorder
	store   *deviceStore
	service *scriptedService
	health  *fakeHealth
	clock   *fakeClock
	manager *apply.Manager
	srv     *httptest.Server
}

// boot starts a daemon instance the way main does: Replay first, then the API.
func boot(t *testing.T, dev device) *daemon {
	t.Helper()

	store, err := config.NewStore(dev.configDir, configName, dev.serviceDir)
	if err != nil {
		t.Fatal(err)
	}

	rec := &recorder{}
	d := &daemon{
		dev:     dev,
		rec:     rec,
		store:   &deviceStore{Store: store, rec: rec},
		service: &scriptedService{rec: rec},
		health:  &fakeHealth{rec: rec},
		clock:   newClock(),
	}

	log := slog.New(slog.DiscardHandler)
	d.manager = apply.New(d.store, d.service, d.health, d.clock, log, apply.Options{
		Window:          window,
		ClashPort:       clashPort,
		CycleTimeout:    cycleTimeout,
		ConfigDir:       dev.configDir,
		ConfigName:      configName,
		ProcessInterval: time.Millisecond,
	})
	t.Cleanup(d.manager.Close)

	if err := d.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	d.srv = httptest.NewServer(httpapi.NewServer(d.manager, store, log, httpapi.Options{}))
	t.Cleanup(d.srv.Close)

	return d
}

// crash cuts the power: the store and the service stop taking effect, a held request step
// is let go so its response comes back, and the instance is stopped. What the cycle left on
// disk stays as it is.
func (d *daemon) crash(release chan struct{}) {
	d.store.cut()
	d.service.cut()

	if release != nil {
		close(release)
	}

	d.manager.Close()
	d.srv.Close()
}

type reply struct {
	status int
	header http.Header
	body   []byte
}

func (r reply) decode(t *testing.T, v any) {
	t.Helper()

	if err := json.Unmarshal(r.body, v); err != nil {
		t.Fatalf("response %d %q: %v", r.status, r.body, err)
	}
}

func (d *daemon) call(t *testing.T, method, path string, body []byte, header http.Header) reply {
	t.Helper()

	got, err := d.request(t.Context(), method, path, body, header)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}

	return got
}

// request is call without the test: it is safe in a goroutine of its own.
func (d *daemon) request(ctx context.Context, method, path string, body []byte, header http.Header) (reply, error) {
	req, err := http.NewRequestWithContext(ctx, method, d.srv.URL+path, bytes.NewReader(body))
	if err != nil {
		return reply{}, err
	}

	for key, values := range header {
		req.Header[key] = values
	}
	if method != http.MethodGet {
		req.Header.Set("Origin", d.srv.URL)
	}

	resp, err := d.srv.Client().Do(req)
	if err != nil {
		return reply{}, err
	}
	defer func() { _ = resp.Body.Close() }()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return reply{}, err
	}

	return reply{status: resp.StatusCode, header: resp.Header, body: data}, nil
}

// start applies cfg over HTTP on top of the config the panel read, as the panel does.
func (d *daemon) start(t *testing.T, cfg string) apply.Transaction {
	t.Helper()

	read := d.call(t, http.MethodGet, "/api/config", nil, nil)
	if read.status != http.StatusOK {
		t.Fatalf("read config: code %d", read.status)
	}

	got := d.call(t, http.MethodPost, "/api/apply", []byte(cfg), http.Header{"If-Match": {read.header.Get("ETag")}})
	if got.status != http.StatusAccepted {
		t.Fatalf("apply: code %d, body %s", got.status, got.body)
	}

	var tx apply.Transaction
	got.decode(t, &tx)

	if tx.Phase != apply.PhaseApplying {
		t.Errorf("apply answered with phase %q, expected applying", tx.Phase)
	}

	return tx
}

// phase is what GET /api/apply/{id} reports; empty means the daemon does not know the
// transaction.
func (d *daemon) phase(t *testing.T, id string) apply.Phase {
	t.Helper()

	got := d.call(t, http.MethodGet, "/api/apply/"+id, nil, nil)

	switch got.status {
	case http.StatusOK:
		var tx apply.Transaction
		got.decode(t, &tx)

		return tx.Phase
	case http.StatusNotFound:
		return ""
	default:
		t.Fatalf("transaction state: code %d, body %s", got.status, got.body)

		return ""
	}
}

func (d *daemon) confirm(t *testing.T, id string) reply {
	t.Helper()

	return d.call(t, http.MethodPost, "/api/apply/"+id+"/confirm", nil, nil)
}

// waitWindow gives the cycle its whole ceiling instead of the five seconds of the in-memory
// fakes: every step of the real Store ends in fsync, and on a loaded runner a few of them
// take seconds.
func (d *daemon) waitWindow(t *testing.T) {
	t.Helper()

	select {
	case <-d.clock.called:
	case <-time.After(cycleTimeout):
		t.Fatal("apply did not reach the confirmation window")
	}
}

// reached is entered with the ceiling of waitWindow.
func reached(t *testing.T, started <-chan struct{}) {
	t.Helper()

	select {
	case <-started:
	case <-time.After(cycleTimeout):
		t.Fatal("the held step was not entered")
	}
}

// config is the config file on the device.
func (dev device) config(t *testing.T) []byte {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(dev.configDir, configName))
	if err != nil {
		t.Fatal(err)
	}

	return data
}

// journal is the transaction state on disk; an empty phase means there is none.
func (dev device) journal(t *testing.T) apply.Transaction {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(dev.serviceDir, "apply.json"))
	if errors.Is(err, fs.ErrNotExist) {
		return apply.Transaction{}
	}
	if err != nil {
		t.Fatal(err)
	}

	var tx apply.Transaction
	if err := json.Unmarshal(data, &tx); err != nil {
		t.Fatalf("journal %q: %v", data, err)
	}

	return tx
}

// expectConfig checks which generation is on disk: the running config or the one tx wrote.
func expectConfig(t *testing.T, dev device, tx apply.Transaction, written bool) {
	t.Helper()

	got := dev.config(t)

	switch {
	case written && config.Sum(got) != tx.Sum:
		t.Errorf("config on disk %s, expected the one the transaction wrote", got)
	case !written && string(got) != runningConfig:
		t.Errorf("config on disk %s, expected the running one %s", got, runningConfig)
	}
}

func TestHTTPApplyConfirm(t *testing.T) {
	dev := newDevice(t)
	d := boot(t, dev)

	rejected := d.call(t, http.MethodPost, "/api/apply", []byte(`{"log":{"level":"`+rejectedMarker+`"}}`), nil)
	if rejected.status != http.StatusUnprocessableEntity {
		t.Fatalf("rejected candidate: code %d, expected %d", rejected.status, http.StatusUnprocessableEntity)
	}

	var apiErr struct {
		Code    contract.ErrorCode    `json:"code"`
		Details contract.CheckDetails `json:"details"`
	}
	rejected.decode(t, &apiErr)

	if apiErr.Code != contract.ErrCheckFailed || !bytes.Contains([]byte(apiErr.Details.Stderr), []byte(rejectedMarker)) {
		t.Errorf("rejection %+v, expected check_failed with the binary output", apiErr)
	}
	expectConfig(t, dev, apply.Transaction{}, false)
	if j := dev.journal(t); j.Phase != "" {
		t.Errorf("journal %q after a rejected candidate", j.Phase)
	}

	tx := d.start(t, nextConfig)
	d.waitWindow(t)

	if got := d.phase(t, tx.ID); got != apply.PhaseAwaitingConfirm {
		t.Errorf("phase %q, expected awaiting_confirm", got)
	}
	expectConfig(t, dev, tx, true)
	if j := dev.journal(t); j.Phase != apply.PhaseAwaitingConfirm || j.Window != window || j.Sum != tx.Sum {
		t.Errorf("journal %+v, expected the window record of the transaction", j)
	}
	if backup, err := os.ReadFile(d.store.BackupPath()); err != nil || string(backup) != runningConfig {
		t.Errorf("backup %q (%v), expected the running config", backup, err)
	}

	got := d.confirm(t, tx.ID)
	if got.status != http.StatusOK {
		t.Fatalf("confirm: code %d, body %s", got.status, got.body)
	}

	var confirmed apply.Transaction
	got.decode(t, &confirmed)

	if confirmed.Phase != apply.PhaseConfirmed {
		t.Errorf("confirm answered with phase %q", confirmed.Phase)
	}
	if again := d.confirm(t, tx.ID); again.status != http.StatusConflict {
		t.Errorf("second confirm: code %d, expected %d", again.status, http.StatusConflict)
	}
	expectConfig(t, dev, tx, true)
	if j := dev.journal(t); j.Phase != "" {
		t.Errorf("journal %q stayed after confirmation", j.Phase)
	}
}

func TestHTTPApplyRollsBackByWindow(t *testing.T) {
	dev := newDevice(t)
	d := boot(t, dev)

	tx := d.start(t, nextConfig)
	d.waitWindow(t)
	expectConfig(t, dev, tx, true)

	d.clock.fire()
	// The rollback runs detached from the daemon context: Close waits for it to finish.
	d.manager.Close()

	if got := d.phase(t, tx.ID); got != apply.PhaseRolledBack {
		t.Errorf("phase %q, expected rolled_back", got)
	}
	if got := d.confirm(t, tx.ID); got.status != http.StatusConflict {
		t.Errorf("confirm after the rollback: code %d, expected %d", got.status, http.StatusConflict)
	}
	expectConfig(t, dev, tx, false)
	if j := dev.journal(t); j.Phase != "" {
		t.Errorf("journal %q stayed after the rollback", j.Phase)
	}
	if got := countOf(d.rec.snapshot(), "Restart"); got != 2 {
		t.Errorf("restarts %d, expected two: the apply and the rollback", got)
	}
}

// The daemon loses power at a step of the cycle; the next instance replays what the disk
// holds.
func TestHTTPApplyInterruptedAtEveryStep(t *testing.T) {
	tests := []struct {
		name string
		// interrupt drives the instance to the step and cuts the power there.
		interrupt func(t *testing.T, d *daemon) apply.Transaction
		// journal and written are the disk after the power cut.
		journal apply.Phase
		written bool
		// After Replay: what the API reports, whether the config on disk is the written one,
		// whether the journal stays, how many times Replay restarted the service and whether
		// a new apply is busy.
		phase        apply.Phase
		writtenAfter bool
		keptJournal  bool
		restarts     int
		applyRefused bool
	}{
		{
			name: "after the backup",
			interrupt: func(t *testing.T, d *daemon) apply.Transaction {
				started, _ := d.store.hold("WriteState")
				tx := d.start(t, nextConfig)
				reached(t, started)
				d.crash(nil)

				if backup, err := os.ReadFile(d.store.BackupPath()); err != nil || string(backup) != runningConfig {
					t.Errorf("backup %q (%v), expected the running config", backup, err)
				}

				return tx
			},
		},
		{
			name: "after the journal",
			interrupt: func(t *testing.T, d *daemon) apply.Transaction {
				started, _ := d.store.hold("Write")
				tx := d.start(t, nextConfig)
				reached(t, started)
				d.crash(nil)

				return tx
			},
			journal: apply.PhaseApplying,
		},
		{
			name: "after the write",
			interrupt: func(t *testing.T, d *daemon) apply.Transaction {
				started, _ := d.service.hold("Restart")
				tx := d.start(t, nextConfig)
				reached(t, started)
				d.crash(nil)

				if got := countOf(d.rec.snapshot(), "Write"); got != 1 {
					t.Errorf("config writes before the cut %d, expected one", got)
				}

				return tx
			},
			journal:  apply.PhaseApplying,
			written:  true,
			phase:    apply.PhaseRolledBack,
			restarts: 1,
		},
		{
			name: "after the restart",
			interrupt: func(t *testing.T, d *daemon) apply.Transaction {
				started, _ := d.health.hold("Wait")
				tx := d.start(t, nextConfig)
				reached(t, started)
				d.crash(nil)

				if got := countOf(d.rec.snapshot(), "Restart"); got != 1 {
					t.Errorf("restarts before the cut %d, expected one", got)
				}

				return tx
			},
			journal:  apply.PhaseApplying,
			written:  true,
			phase:    apply.PhaseRolledBack,
			restarts: 1,
		},
		{
			name: "inside the window before confirm",
			interrupt: func(t *testing.T, d *daemon) apply.Transaction {
				tx := d.start(t, nextConfig)
				d.waitWindow(t)
				d.crash(nil)

				return tx
			},
			journal:      apply.PhaseAwaitingConfirm,
			written:      true,
			phase:        apply.PhaseAwaitingConfirm,
			writtenAfter: true,
			keptJournal:  true,
			applyRefused: true,
		},
		{
			name: "during confirm",
			interrupt: func(t *testing.T, d *daemon) apply.Transaction {
				tx := d.start(t, nextConfig)
				d.waitWindow(t)

				started, release := d.store.hold("ClearState")
				answer := make(chan reply, 1)
				failure := make(chan error, 1)

				go func() {
					got, err := d.request(t.Context(), http.MethodPost, "/api/apply/"+tx.ID+"/confirm", nil, nil)
					answer <- got
					failure <- err
				}()

				reached(t, started)
				d.crash(release)

				// Neither the removal nor the terminal record reached the disk: the
				// confirmation did not take, and the client is told so.
				got := <-answer
				if err := <-failure; err != nil {
					t.Fatalf("confirm: %v", err)
				}
				if got.status != http.StatusInternalServerError {
					t.Errorf("confirm cut by the power loss: code %d, expected %d", got.status, http.StatusInternalServerError)
				}

				return tx
			},
			journal:      apply.PhaseAwaitingConfirm,
			written:      true,
			phase:        apply.PhaseAwaitingConfirm,
			writtenAfter: true,
			keptJournal:  true,
			applyRefused: true,
		},
		{
			name: "after confirm",
			interrupt: func(t *testing.T, d *daemon) apply.Transaction {
				tx := d.start(t, nextConfig)
				d.waitWindow(t)

				if got := d.confirm(t, tx.ID); got.status != http.StatusOK {
					t.Fatalf("confirm: code %d", got.status)
				}

				d.crash(nil)

				return tx
			},
			written:      true,
			writtenAfter: true,
		},
		{
			name: "inside the rollback by the window",
			interrupt: func(t *testing.T, d *daemon) apply.Transaction {
				tx := d.start(t, nextConfig)
				d.waitWindow(t)

				started, release := d.service.hold("Restart")
				d.clock.fire()
				reached(t, started)
				d.crash(release)

				return tx
			},
			// The backup is already back on disk, the journal still holds the window: the
			// next instance opens it again, and its expiry restores the same backup.
			journal:      apply.PhaseAwaitingConfirm,
			phase:        apply.PhaseAwaitingConfirm,
			keptJournal:  true,
			applyRefused: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dev := newDevice(t)
			tx := tt.interrupt(t, boot(t, dev))

			if j := dev.journal(t); j.Phase != tt.journal {
				t.Errorf("journal after the power cut %q, expected %q", j.Phase, tt.journal)
			}
			expectConfig(t, dev, tx, tt.written)

			next := boot(t, dev)

			if got := next.phase(t, tx.ID); got != tt.phase {
				t.Errorf("phase after replay %q, expected %q", got, tt.phase)
			}
			expectConfig(t, dev, tx, tt.writtenAfter)
			if j := dev.journal(t); (j.Phase != "") != tt.keptJournal {
				t.Errorf("journal after replay %q, expected kept: %v", j.Phase, tt.keptJournal)
			}
			if got := countOf(next.rec.snapshot(), "Restart"); got != tt.restarts {
				t.Errorf("restarts on replay %d, expected %d", got, tt.restarts)
			}

			want := http.StatusAccepted
			if tt.applyRefused {
				want = http.StatusConflict
			}
			got := next.call(t, http.MethodPost, "/api/apply", []byte(nextConfig), nil)
			if got.status != want {
				t.Errorf("apply after replay: code %d, expected %d, body %s", got.status, want, got.body)
			}
		})
	}
}

// The window restored by Replay closes the same way as the first one: by Confirm over the
// API or by a rollback when it expires.
func TestHTTPApplyWindowAfterRestart(t *testing.T) {
	interrupted := func(t *testing.T) (device, apply.Transaction, *daemon) {
		t.Helper()

		dev := newDevice(t)
		d := boot(t, dev)
		tx := d.start(t, nextConfig)
		d.waitWindow(t)
		d.crash(nil)

		next := boot(t, dev)
		next.waitWindow(t)

		return dev, tx, next
	}

	t.Run("confirmed", func(t *testing.T) {
		dev, tx, next := interrupted(t)

		if got := next.confirm(t, tx.ID); got.status != http.StatusOK {
			t.Fatalf("confirm of the restored window: code %d, body %s", got.status, got.body)
		}
		if got := next.phase(t, tx.ID); got != apply.PhaseConfirmed {
			t.Errorf("phase %q, expected confirmed", got)
		}
		expectConfig(t, dev, tx, true)
		if j := dev.journal(t); j.Phase != "" {
			t.Errorf("journal %q stayed after confirmation", j.Phase)
		}

		next.crash(nil)
		third := boot(t, dev)
		expectConfig(t, dev, tx, true)
		if got := countOf(third.rec.snapshot(), "Restart"); got != 0 {
			t.Errorf("restarts on replay of a confirmed apply %d, expected none", got)
		}
	})

	t.Run("expired", func(t *testing.T) {
		dev, tx, next := interrupted(t)

		next.clock.fire()
		next.manager.Close()

		if got := next.phase(t, tx.ID); got != apply.PhaseRolledBack {
			t.Errorf("phase %q, expected rolled_back", got)
		}
		expectConfig(t, dev, tx, false)
		if j := dev.journal(t); j.Phase != "" {
			t.Errorf("journal %q stayed after the rollback", j.Phase)
		}
		if got := countOf(next.rec.snapshot(), "Restart"); got != 1 {
			t.Errorf("restarts %d, expected one: the rollback", got)
		}
	})
}
