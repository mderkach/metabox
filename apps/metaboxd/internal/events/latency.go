package events

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/history"
)

const latencyInterval = time.Minute

// LatencyMonitor collects passive samples and binds manual probe responses to
// the same controller process before publishing them.
type LatencyMonitor struct {
	source  *ClashSource
	resolve clashapi.Resolver
	epoch   func(context.Context, int) string
	ring    *history.Latency
	log     *slog.Logger
	norms   func() map[string]int

	mu      sync.Mutex
	core    string
	servers map[string]struct{}
	pending map[string]int
}

// NewLatencyMonitor never initiates a probe: only the browser delay request does.
func NewLatencyMonitor(
	source *ClashSource, resolve clashapi.Resolver, epoch func(context.Context, int) string,
	norms func() map[string]int, log *slog.Logger,
) *LatencyMonitor {
	return &LatencyMonitor{source: source, resolve: resolve, epoch: epoch, ring: history.NewLatency(), log: log, norms: norms}
}

// Start runs a bounded snapshot poll independently of subscribers. Cancelling
// ctx stops it, and the caller waits on the returned channel.
func (m *LatencyMonitor) Start(ctx context.Context) <-chan struct{} {
	done := make(chan struct{})

	go func() {
		defer close(done)
		ticker := time.NewTicker(latencyInterval)
		defer ticker.Stop()

		for {
			m.poll(ctx)

			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()

	return done
}

// Snapshot rechecks the controller before exposing a current measurement,
// including in the minute between passive polls.
func (m *LatencyMonitor) Snapshot(ctx context.Context) (bool, []history.ServerLatency) {
	m.mu.Lock()
	defer m.mu.Unlock()

	controller := m.current(ctx)
	var norms map[string]int
	if m.norms != nil {
		norms = m.norms()
	}

	return controller.port != 0, m.ring.Snapshot(time.Now(), norms)
}

// ObserveDelay is attached to the panel's existing user-requested delay route.
func (m *LatencyMonitor) ObserveDelay(
	ctx context.Context, settings clashapi.Settings, tag string,
) (clashapi.Settings, *clashapi.DelayObservation) {
	m.mu.Lock()
	controller := m.current(ctx)
	_, known := m.servers[tag]
	m.mu.Unlock()

	if controller.epoch == "" || controller.settings != settings {
		return clashapi.Settings{}, nil
	}
	if !known && !m.confirmServer(ctx, controller, tag) {
		return clashapi.Settings{}, nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if m.current(ctx) != controller || (m.pending[tag] == 0 && len(m.pending) >= history.MaxLatencyServers) {
		return clashapi.Settings{}, nil
	}
	if m.pending == nil {
		m.pending = make(map[string]int)
	}
	m.pending[tag]++

	return controller.pinned, &clashapi.DelayObservation{
		Record: func(ctx context.Context, delay int, success bool) {
			finished := time.Now()

			m.mu.Lock()
			defer m.mu.Unlock()
			if m.current(ctx) == controller {
				m.ring.RecordManual(controller.epoch, tag, finished, delay, success)
			}
		},
		Done: func() { m.finishProbe(controller.epoch, tag) },
	}
}

func (m *LatencyMonitor) finishProbe(epoch, tag string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.core != epoch {
		return
	}
	if m.pending[tag] <= 1 {
		delete(m.pending, tag)
	} else {
		m.pending[tag]--
	}
}

type latencyController struct {
	settings clashapi.Settings
	pinned   clashapi.Settings
	port     int
	epoch    string
}

func (m *LatencyMonitor) current(ctx context.Context) latencyController {
	var controller latencyController
	settings, err := m.resolve(ctx)
	if err == nil {
		controller.settings = settings
		controller.pinned, controller.port = settings.PinLocalController(ctx)
		if controller.port != 0 {
			controller.epoch = m.epoch(ctx, controller.port)
		}
	}

	if controller.epoch != "" && controller.epoch != m.core {
		m.core = controller.epoch
		m.servers = nil
		m.pending = nil
	}
	m.ring.SetEpoch(controller.epoch)

	return controller
}

func (m *LatencyMonitor) confirmServer(ctx context.Context, controller latencyController, tag string) bool {
	source, err := m.source.WithController(controller.pinned)
	if err != nil {
		return false
	}
	server, err := clashapi.IsLatencyServer(ctx, source, tag)
	if err != nil || !server {
		return false
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if m.current(ctx) != controller {
		return false
	}
	if m.servers == nil {
		m.servers = make(map[string]struct{})
	}
	if len(m.servers) < history.MaxLatencyServers {
		m.servers[tag] = struct{}{}
	}

	return true
}

func (m *LatencyMonitor) poll(ctx context.Context) {
	m.mu.Lock()
	controller := m.current(ctx)
	m.mu.Unlock()

	if controller.epoch == "" {
		return
	}

	source, err := m.source.WithController(controller.pinned)
	if err != nil {
		return
	}

	now := time.Now()
	values, err := clashapi.ReadLatency(ctx, source)
	if err != nil {
		if ctx.Err() == nil {
			m.log.Debug("server latency snapshot unavailable", "err", err)
		}

		return
	}

	samples := make(map[string]*history.LatencySample, len(values))
	known := make(map[string]struct{}, min(len(values), history.MaxLatencyServers))
	for _, value := range values {
		if len(known) < history.MaxLatencyServers {
			known[value.Tag] = struct{}{}
		}
		if value.At.IsZero() {
			samples[value.Tag] = nil
		} else {
			samples[value.Tag] = &history.LatencySample{At: value.At, DelayMS: int(value.Millis)}
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.current(ctx) == controller {
		m.servers = known
		for tag := range m.pending {
			if _, listed := samples[tag]; listed {
				samples[tag] = &history.LatencySample{Pending: true}
			}
		}
		m.ring.Observe(controller.epoch, now, samples)
	}
}
