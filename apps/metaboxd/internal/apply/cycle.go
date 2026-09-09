package apply

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"

	"metabox/internal/clashapi"
	"metabox/internal/config"
)

// check раскладывает кандидата во временный каталог и отдаёт его бинарю.
// Проверяется каталог, а не файл: сервис поднимется на слиянии всех .json.
func (m *Manager) check(ctx context.Context, data []byte) error {
	dir, err := os.MkdirTemp("", "metabox-candidate-")
	if err != nil {
		return fmt.Errorf("каталог кандидата: %w", err)
	}
	defer func() {
		if err := os.RemoveAll(dir); err != nil {
			m.log.Error("каталог кандидата не убран", "err", err, "dir", dir)
		}
	}()

	if err := m.store.StageCandidate(ctx, dir, data); err != nil {
		return err
	}

	return m.service.Check(ctx, dir)
}

// run уводит применение в фоновую горутину: цикл переживает запрос, а окно
// подтверждения тянется до минуты (ADR-0002, NFR-5). Останавливает горутину
// Close, ошибки уходят в лог и в состояние транзакции, дожидается — wg.
func (m *Manager) run(data []byte, settings clashapi.Settings) {
	ctx, cancel := context.WithCancel(context.Background())

	m.mu.Lock()
	m.cancel = cancel
	confirmed := m.confirmed
	m.mu.Unlock()

	m.wg.Add(1)

	go func() {
		defer m.wg.Done()
		defer cancel()
		defer m.unreserve()

		m.cycle(ctx, data, settings, confirmed)
	}()
}

func (m *Manager) cycle(ctx context.Context, data []byte, settings clashapi.Settings, confirmed <-chan struct{}) {
	id := m.Current().ID
	log := m.log.With("transaction_id", id)

	log.Info("применение начато", "sha256", short(sum(data)), "size", len(data))

	if err := m.apply(ctx, data, settings); err != nil {
		log.Error("применение не прошло", "err", err)
		m.release(PhaseFailed, err.Error())
		m.rollback(context.WithoutCancel(ctx), log)

		return
	}

	m.await(ctx, log, confirmed)
}

// apply выполняет шаги 4–7 протокола: бэкап, запись, рестарт, healthcheck.
func (m *Manager) apply(ctx context.Context, data []byte, settings clashapi.Settings) error {
	ctx, cancel := context.WithTimeout(ctx, m.opts.CycleTimeout)
	defer cancel()

	if err := m.store.Backup(ctx); err != nil {
		// До первого применения конфига может не быть — откатываться тогда не
		// на что, но и применение это не останавливает.
		if !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("бэкап: %w", err)
		}
		m.log.Warn("бэкапа нет: конфига на устройстве ещё не было")
	}

	if err := m.store.Write(ctx, data); err != nil {
		return fmt.Errorf("запись конфига: %w", err)
	}

	m.mu.Lock()
	m.lastSum = sum(data)
	m.mu.Unlock()

	if err := m.service.Restart(ctx); err != nil {
		return err
	}

	return m.health.Wait(ctx, settings)
}

// await держит окно подтверждения. Без подтверждения в срок конфиг
// возвращается на предыдущий (AC-14).
func (m *Manager) await(ctx context.Context, log *slog.Logger, confirmed <-chan struct{}) {
	m.mu.Lock()
	m.current.Phase = PhaseAwaitingConfirm
	tx := m.current
	m.mu.Unlock()

	if err := m.persist(ctx, tx); err != nil {
		log.Error("состояние окна подтверждения не сохранено", "err", err)
	}

	log.Info("сервис поднялся, идёт окно подтверждения", "window", m.opts.Window)

	select {
	case <-confirmed:
		return
	case <-ctx.Done():
		// Демон останавливают. Состояние остаётся на диске, окно доиграется
		// при следующем старте.
		log.Warn("окно подтверждения прервано остановкой демона")

		return
	case <-m.clock.After(m.opts.Window):
		log.Warn("подтверждения не было, возвращаем предыдущий конфиг")
		m.rollback(context.WithoutCancel(ctx), log)
	}
}

// rollback возвращает предыдущий конфиг и поднимает на нём сервис. Обе
// половины отката отчитываются вместе: откат, не сделавший ни того ни другого,
// обязан рассказать про оба отказа.
func (m *Manager) rollback(ctx context.Context, log *slog.Logger) {
	ctx, cancel := context.WithTimeout(ctx, m.opts.CycleTimeout)
	defer cancel()

	restoreErr := m.store.Restore(ctx)
	if errors.Is(restoreErr, config.ErrNoBackup) {
		log.Warn("откатываться не на что: бэкапа нет")
		restoreErr = nil
	}

	var restartErr error
	if restoreErr == nil {
		restartErr = m.service.Restart(ctx)
	}

	if err := errors.Join(restoreErr, restartErr); err != nil {
		log.Error("откат не прошёл", "err", err)
		m.release(PhaseFailed, err.Error())

		return
	}

	m.mu.Lock()
	m.current.Phase = PhaseRolledBack
	m.current.Window = 0
	m.lastSum = ""
	m.busy = false
	m.mu.Unlock()

	if err := m.store.ClearState(ctx); err != nil {
		log.Error("состояние откаченной транзакции не убрано", "err", err)
	}

	log.Info("предыдущий конфиг возвращён")
}

// Replay доигрывает транзакцию, оставшуюся от прошлой жизни демона. Вызывается
// на старте: без него питание, снятое в окне подтверждения, оставило бы
// устройство на неподтверждённом конфиге навсегда (ADR-0002).
func (m *Manager) Replay(ctx context.Context) error {
	data, err := m.store.ReadState(ctx)
	if errors.Is(err, config.ErrNoState) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("чтение состояния: %w", err)
	}

	var tx Transaction
	if err := json.Unmarshal(data, &tx); err != nil {
		return fmt.Errorf("разбор состояния: %w", err)
	}

	log := m.log.With("transaction_id", tx.ID)

	switch {
	case tx.Phase == PhaseApplying:
		// Цикл оборвался, не дойдя до окна подтверждения: что именно успело
		// записаться, неизвестно, поэтому возвращаем предыдущий конфиг.
		log.Warn("применение оборвано, возвращаем предыдущий конфиг")
		m.begin(tx)
		m.rollback(ctx, log)

	case tx.Phase == PhaseAwaitingConfirm && tx.Window <= 0:
		log.Warn("окно подтверждения истекло, возвращаем предыдущий конфиг")
		m.begin(tx)
		m.rollback(ctx, log)

	case tx.Phase == PhaseAwaitingConfirm:
		log.Warn("окно подтверждения восстановлено", "window", tx.Window)
		m.reserveRestored()
		m.restoreWindow(tx)

	default:
		if err := m.store.ClearState(ctx); err != nil {
			return fmt.Errorf("очистка завершённого состояния: %w", err)
		}
	}

	return nil
}

// restoreWindow поднимает таймер заново на срок из состояния. Сколько его
// прошло до перезагрузки, узнать неоткуда: часов реального времени у роутера
// нет. Свойство «нет подтверждения — откат» это сохраняет, а пользователю
// достаётся ещё одно окно, чтобы подтвердить связь.
func (m *Manager) restoreWindow(tx Transaction) {
	m.mu.Lock()
	m.current = tx
	m.lastSum = tx.Sum
	m.confirmed = make(chan struct{})
	confirmed := m.confirmed
	m.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())

	m.mu.Lock()
	m.cancel = cancel
	m.mu.Unlock()

	m.wg.Add(1)

	go func() {
		defer m.wg.Done()
		defer cancel()
		defer m.unreserve()

		log := m.log.With("transaction_id", tx.ID)

		select {
		case <-confirmed:
		case <-ctx.Done():
			log.Warn("восстановленное окно прервано остановкой демона")
		case <-m.clock.After(tx.Window):
			log.Warn("подтверждения не было, возвращаем предыдущий конфиг")
			m.rollback(context.WithoutCancel(ctx), log)
		}
	}()
}

func sum(data []byte) string {
	digest := sha256.Sum256(data)

	return hex.EncodeToString(digest[:])
}

// short укорачивает хэш для лога: полный там не нужен, а строка длиннее.
func short(s string) string {
	const n = 12
	if len(s) <= n {
		return s
	}

	return s[:n]
}

// reserveRestored закрывает применение на время восстановленного окна: пока
// оно идёт, новый Start обязан получить отказ так же, как при своём.
func (m *Manager) reserveRestored() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.busy = true
}
