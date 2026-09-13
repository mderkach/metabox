package events

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"
)

// Sink принимает объёмы, которые копит учёт. Интерфейс объявлен здесь, у
// потребителя: сам учёт не знает, кто и как хранит накопленное.
type Sink interface {
	// AddProxy прибавляет байты, прошедшие через sing-box за интервал.
	AddProxy(bytes int64)
	// SampleUplink снимает счётчики интерфейса наружу.
	SampleUplink()
}

// Recorder принимает сэмпл потока для истории. nil означает, что историю никто
// не копит.
type Recorder interface {
	Record(up, down int64)
}

// Accounting копит объём канала и объём через sing-box с запуска демона.
//
// Работает независимо от того, открыта ли панель. Это исключение из правила
// «фоновых опросов без потребителя нет»: потребитель здесь — сама величина.
// Доля за всё время не восстанавливается задним числом — счётчик интерфейса
// идёт с подъёма линка, счётчик sing-box с запуска процесса, и приращения,
// не снятые вовремя, теряются навсегда.
//
// Цена в простое: одно постоянное соединение к Clash API, по которому форк шлёт
// две цифры в секунду, и чтение `/proc/net/dev` раз в интервал.
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

// NewAccounting собирает учёт. Опросов он не начинает: их поднимает Start.
func NewAccounting(source Source, sink Sink, recorder Recorder, log *slog.Logger, opts Options) *Accounting {
	return &Accounting{source: source, sink: sink, recorder: recorder, log: log, opts: opts}
}

// Start поднимает учёт на всё время работы демона.
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

// Close останавливает учёт и дожидается горутин.
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

// countProxy держит поток `/traffic`, переподключаясь после обрыва: sing-box
// перезапускают, и поток на этом заканчивается.
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

	a.sink.SampleUplink()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.sink.SampleUplink()
		}
	}
}
