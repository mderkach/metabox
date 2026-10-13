package events

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"
)

// Sink accepts the volumes accumulated by the accounting. The interface is declared here, at
// the consumer: the accounting does not know who stores the accumulated amount and how.
type Sink interface {
	// AddProxy adds the bytes that passed through sing-box over an interval.
	AddProxy(bytes int64)
	// SampleDevice takes the device readings and the channel counters.
	SampleDevice(ctx context.Context)
}

// Recorder accepts a stream sample for the history. nil means nobody keeps
// a history.
type Recorder interface {
	Record(up, down int64)
}

// Accounting accumulates the channel volume and the volume through sing-box since the daemon start.
//
// Works independently of whether the panel is open. This is an exception to the rule
// "no background polling without a consumer": the consumer here is the value itself.
// The share over all time cannot be restored retroactively: the interface counter
// counts from the link coming up, the sing-box counter from the process start, and increments
// not taken in time are lost forever.
//
// The price at idle: one persistent connection to the Clash API, over which the fork sends
// two numbers per second, and a read of `/proc/net/dev` once per interval.
type Accounting struct {
	source   Source
	sink     Sink
	recorder Recorder
	log      *slog.Logger
	opts     Options

	mu   sync.Mutex
	stop context.CancelFunc
	done chan struct{}
}

// NewAccounting assembles the accounting. It starts no polling: Start brings it up.
func NewAccounting(source Source, sink Sink, recorder Recorder, log *slog.Logger, opts Options) *Accounting {
	return &Accounting{source: source, sink: sink, recorder: recorder, log: log, opts: opts}
}

// Start brings the accounting up for the whole daemon runtime.
func (a *Accounting) Start() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.stop != nil {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	a.stop, a.done = cancel, done

	var wg sync.WaitGroup

	wg.Add(1)

	go func() {
		defer wg.Done()
		a.countProxy(ctx)
	}()

	wg.Add(1)

	go func() {
		defer wg.Done()
		a.countUplink(ctx)
	}()

	go func() {
		wg.Wait()
		close(done)
	}()
}

// Close stops the accounting and waits for the goroutines.
func (a *Accounting) Close() {
	a.mu.Lock()
	stop, done := a.stop, a.done
	a.stop, a.done = nil, nil
	a.mu.Unlock()

	if stop == nil {
		return
	}

	stop()
	<-done
}

// countProxy holds the `/traffic` stream, reconnecting after a break: sing-box
// is restarted, and the stream ends with it.
func (a *Accounting) countProxy(ctx context.Context) {
	for ctx.Err() == nil {
		err := a.source.Stream(ctx, "/traffic", func(line json.RawMessage) {
			var sample struct {
				Up   int64 `json:"up"`
				Down int64 `json:"down"`
			}

			if err := json.Unmarshal(line, &sample); err != nil {
				return
			}

			a.sink.AddProxy(sample.Up + sample.Down)

			if a.recorder != nil {
				a.recorder.Record(sample.Up, sample.Down)
			}
		})
		if err != nil && ctx.Err() == nil {
			a.log.Debug("учёт трафика оборван", "err", err)
		}

		if !sleep(ctx, a.opts.RetryInterval) {
			return
		}
	}
}

func (a *Accounting) countUplink(ctx context.Context) {
	ticker := time.NewTicker(a.opts.SystemInterval)
	defer ticker.Stop()

	a.sink.SampleDevice(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.sink.SampleDevice(ctx)
		}
	}
}
