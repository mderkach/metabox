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

// fakePlane — модель обвязки и признак перехвата. applied — ответы Applied по
// порядку вызовов: до рестарта и после; последний повторяется.
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

// planeWith — модель по умолчанию с заданными перехватом и портом dns-in.
func planeWith(enabled bool, dnsPort int) dataplane.Model {
	model := dataplane.Defaults()
	model.Enabled = enabled
	model.DNSPort = dnsPort

	return model
}

func configWithDNSIn(port int) string {
	return fmt.Sprintf(`{"inbounds":[{"type":"direct","tag":"dns-in","listen":"127.0.0.1","listen_port":%d}]}`, port)
}

// waitOutcome ждёт конца цикла: окна подтверждения или отката. failed сюда не
// входит — откат проходит через неё. DNS-проба ходит в сеть, поэтому срок
// длиннее, чем у waitPhase.
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

	t.Fatalf("цикл не закончился: фаза %q", h.manager.Current().Phase)

	return apply.Transaction{}
}

// Сломанный раздел dns не роняет ни процесс, ни Clash API: его ловит только
// запрос в dns-in. Конфиг откатывается обычным путём.
func TestBrokenDNSRollsBack(t *testing.T) {
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

	probe := clashapi.NewDNSProbe("example.com", 30*time.Millisecond, time.Millisecond, 2)
	h := newProbeHarness(t, &fakePlane{model: planeWith(false, port)}, probe)

	if _, err := h.manager.Start(t.Context(), []byte(configWithDNSIn(port)), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}

	tx := waitOutcome(t, h)

	if tx.Phase != apply.PhaseRolledBack {
		t.Fatalf("фаза %q, ожидали откат", tx.Phase)
	}
	if tx.ReasonCode != apply.ReasonDNSProbeFailed {
		t.Errorf("код причины %q, ожидали %q", tx.ReasonCode, apply.ReasonDNSProbeFailed)
	}
	if h.rec.index("Restore") < 0 {
		t.Error("предыдущий конфиг не восстановлен")
	}
}

func TestDNSProbeTargetsDNSIn(t *testing.T) {
	tests := []struct {
		name   string
		config string
		want   []clashapi.DNSInbound
	}{
		{"dns-in есть — проба идёт в него", configWithDNSIn(5333), []clashapi.DNSInbound{{Address: "127.0.0.1:5333"}}},
		{"dns-in нет — проба не вызывается", validConfig, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prober := &fakeProber{}
			h := newProbeHarness(t, &fakePlane{model: planeWith(false, 5333)}, prober)

			if _, err := h.manager.Start(t.Context(), []byte(tt.config), apply.Lists{}, "", ""); err != nil {
				t.Fatalf("применение: %v", err)
			}

			if tx := waitOutcome(t, h); tx.Phase != apply.PhaseAwaitingConfirm {
				t.Fatalf("фаза %q, ожидали ожидание подтверждения: %s", tx.Phase, tx.Reason)
			}

			prober.mu.Lock()
			defer prober.mu.Unlock()

			if fmt.Sprint(prober.calls) != fmt.Sprint(tt.want) {
				t.Errorf("пробы %+v, ожидали %+v", prober.calls, tt.want)
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
			name:      "перехват пропал после рестарта — откат",
			plane:     &fakePlane{model: planeWith(true, 5333), applied: []bool{true, false}},
			wantPhase: apply.PhaseRolledBack,
			wantCode:  apply.ReasonInterceptionMissing,
		},
		{
			name:      "перехват на месте",
			plane:     &fakePlane{model: planeWith(true, 5333), applied: []bool{true}},
			wantPhase: apply.PhaseAwaitingConfirm,
		},
		{
			name:      "nft недоступен — пропуск",
			plane:     &fakePlane{model: planeWith(true, 5333), reason: dataplane.NFTUnavailable},
			wantPhase: apply.PhaseAwaitingConfirm,
		},
		{
			name:      "перехвата не было и до рестарта — пропуск",
			plane:     &fakePlane{model: planeWith(true, 5333), applied: []bool{false}},
			wantPhase: apply.PhaseAwaitingConfirm,
		},
		{
			name:      "обвязка выключена — пропуск",
			plane:     &fakePlane{model: planeWith(false, 5333), applied: []bool{false}},
			wantPhase: apply.PhaseAwaitingConfirm,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newProbeHarness(t, tt.plane, nil)

			if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
				t.Fatalf("применение: %v", err)
			}

			tx := waitOutcome(t, h)

			if tx.Phase != tt.wantPhase {
				t.Errorf("фаза %q, ожидали %q", tx.Phase, tt.wantPhase)
			}
			if tx.ReasonCode != tt.wantCode {
				t.Errorf("код причины %q, ожидали %q", tx.ReasonCode, tt.wantCode)
			}
		})
	}
}
