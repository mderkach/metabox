package apply_test

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"strconv"
	"sync"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/clashapi"
	"metabox/internal/dataplane"
)

// fakePlane is the dataplane model and the interception flag. applied holds the Applied answers in
// call order: before the restart and after; the last one repeats.
type fakePlane struct {
	model  dataplane.Model
	reason dataplane.AppliedReason

	mu      sync.Mutex
	applied []bool
	calls   int
}

func (p *fakePlane) Model(context.Context) (dataplane.Model, error) {
	return p.model, nil
}

func (p *fakePlane) Applied(context.Context) (bool, dataplane.AppliedReason, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.reason != "" {
		return false, p.reason, nil
	}

	i := min(p.calls, len(p.applied)-1)
	p.calls++

	return p.applied[i], "", nil
}

type fakeProber struct {
	mu    sync.Mutex
	calls []clashapi.DNSInbound
}

func (p *fakeProber) Probe(_ context.Context, in clashapi.DNSInbound) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.calls = append(p.calls, in)

	return nil
}

func newProbeHarness(t *testing.T, plane apply.Dataplane, dns apply.DNSProber) *harness {
	t.Helper()

	h := newHarness(t)
	h.manager = apply.New(h.store, h.service, h.health, h.clock, slog.New(slog.DiscardHandler), apply.Options{
		Window:          window,
		ClashPort:       clashPort,
		CycleTimeout:    cycleTimeout,
		ConfigDir:       configDir,
		ConfigName:      configName,
		ProcessInterval: time.Millisecond,
		Dataplane:       plane,
		DNS:             dns,
	})
	t.Cleanup(h.manager.Close)

	return h
}

// planeWith is the default model with the given interception and dns-in port.
func planeWith(enabled bool, dnsPort int) dataplane.Model {
	model := dataplane.Defaults()
	model.Enabled = enabled
	model.DNSPort = dnsPort

	return model
}

func configWithDNSIn(port int) string {
	return fmt.Sprintf(`{"inbounds":[{"type":"direct","tag":"dns-in","listen":"127.0.0.1","listen_port":%d}]}`, port)
}

// waitOutcome waits for the end of the cycle: the confirmation window or the rollback. failed is not
// included here, since the rollback goes through it. The DNS probe goes to the network, so the timeout is
// longer than that of waitPhase.
func waitOutcome(t *testing.T, h *harness) apply.Transaction {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		tx := h.manager.Current()
		if tx.Phase == apply.PhaseAwaitingConfirm || tx.Phase == apply.PhaseRolledBack {
			return tx
		}

		time.Sleep(time.Millisecond)
	}

	t.Fatalf("cycle did not finish: phase %q", h.manager.Current().Phase)

	return apply.Transaction{}
}

// silentDNSPort is a dns-in that never answers, the port of a UDP socket nobody reads.
func silentDNSPort(t *testing.T) int {
	t.Helper()

	silent, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = silent.Close() })

	_, portText, err := net.SplitHostPort(silent.LocalAddr().String())
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}

	return port
}

// A broken dns section crashes neither the process nor the Clash API: only a query to dns-in
// catches it. The config is rolled back the usual way.
func TestBrokenDNSRollsBack(t *testing.T) {
	port := silentDNSPort(t)

	probe := clashapi.NewDNSProbe("example.com", 30*time.Millisecond, time.Millisecond, 2)
	h := newProbeHarness(t, &fakePlane{model: planeWith(false, port)}, probe)

	if _, err := h.manager.Start(t.Context(), []byte(configWithDNSIn(port)), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}

	tx := waitOutcome(t, h)

	if tx.Phase != apply.PhaseRolledBack {
		t.Fatalf("phase %q, expected rollback", tx.Phase)
	}
	if tx.ReasonCode != apply.ReasonDNSProbeFailed {
		t.Errorf("reason code %q, expected %q", tx.ReasonCode, apply.ReasonDNSProbeFailed)
	}
	if h.rec.index("Restore") < 0 {
		t.Error("previous config not restored")
	}
}

// All provider nodes are dead while the uplink is alive: the process is new, the Clash API answers
// and the interception chains stay. A dns-in whose upstream goes through a dead node answers
// nothing: the fork's HijackDNSPacket writes no response when the exchange fails. So the healthcheck
// rolls the config back, although the previous one goes through the same nodes. A probe name
// resolved by a direct server or by FakeIP does not reach the nodes and passes.
func TestAllNodesDeadRollsBackOnDNSProbe(t *testing.T) {
	port := silentDNSPort(t)

	probe := clashapi.NewDNSProbe("example.com", 30*time.Millisecond, time.Millisecond, 2)
	plane := &fakePlane{model: planeWith(true, port), applied: []bool{true}}
	h := newProbeHarness(t, plane, probe)

	if _, err := h.manager.Start(t.Context(), []byte(configWithDNSIn(port)), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}

	tx := waitOutcome(t, h)

	if tx.Phase != apply.PhaseRolledBack {
		t.Fatalf("phase %q, expected rollback", tx.Phase)
	}
	if tx.ReasonCode != apply.ReasonDNSProbeFailed {
		t.Errorf("reason code %q, expected %q: the Clash API and interception must pass with dead nodes", tx.ReasonCode, apply.ReasonDNSProbeFailed)
	}
	if h.rec.index("Restore") < 0 {
		t.Error("previous config not restored")
	}
}

func TestDNSProbeTargetsDNSIn(t *testing.T) {
	tests := []struct {
		name   string
		config string
		want   []clashapi.DNSInbound
	}{
		{"dns-in present: the probe goes to it", configWithDNSIn(5333), []clashapi.DNSInbound{{Address: "127.0.0.1:5333"}}},
		{"no dns-in: the probe is not called", validConfig, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prober := &fakeProber{}
			h := newProbeHarness(t, &fakePlane{model: planeWith(false, 5333)}, prober)

			if _, err := h.manager.Start(t.Context(), []byte(tt.config), apply.Lists{}, "", ""); err != nil {
				t.Fatalf("apply: %v", err)
			}

			if tx := waitOutcome(t, h); tx.Phase != apply.PhaseAwaitingConfirm {
				t.Fatalf("phase %q, expected awaiting confirmation: %s", tx.Phase, tx.Reason)
			}

			prober.mu.Lock()
			defer prober.mu.Unlock()

			if fmt.Sprint(prober.calls) != fmt.Sprint(tt.want) {
				t.Errorf("probes %+v, expected %+v", prober.calls, tt.want)
			}
		})
	}
}

func TestInterceptionCheck(t *testing.T) {
	tests := []struct {
		name      string
		plane     *fakePlane
		wantPhase apply.Phase
		wantCode  apply.ReasonCode
	}{
		{
			name:      "interception vanished after the restart: rollback",
			plane:     &fakePlane{model: planeWith(true, 5333), applied: []bool{true, false}},
			wantPhase: apply.PhaseRolledBack,
			wantCode:  apply.ReasonInterceptionMissing,
		},
		{
			name:      "interception in place",
			plane:     &fakePlane{model: planeWith(true, 5333), applied: []bool{true}},
			wantPhase: apply.PhaseAwaitingConfirm,
		},
		{
			name:      "nft unavailable: skip",
			plane:     &fakePlane{model: planeWith(true, 5333), reason: dataplane.NFTUnavailable},
			wantPhase: apply.PhaseAwaitingConfirm,
		},
		{
			name:      "interception was absent before the restart too: skip",
			plane:     &fakePlane{model: planeWith(true, 5333), applied: []bool{false}},
			wantPhase: apply.PhaseAwaitingConfirm,
		},
		{
			name:      "dataplane disabled: skip",
			plane:     &fakePlane{model: planeWith(false, 5333), applied: []bool{false}},
			wantPhase: apply.PhaseAwaitingConfirm,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newProbeHarness(t, tt.plane, nil)

			if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
				t.Fatalf("apply: %v", err)
			}

			tx := waitOutcome(t, h)

			if tx.Phase != tt.wantPhase {
				t.Errorf("phase %q, expected %q", tx.Phase, tt.wantPhase)
			}
			if tx.ReasonCode != tt.wantCode {
				t.Errorf("reason code %q, expected %q", tx.ReasonCode, tt.wantCode)
			}
		})
	}
}
