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
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/config"
)

// check раскладывает кандидата во временный каталог и отдаёт его бинарю.
// Проверяется каталог, а не файл: сервис поднимется на слиянии всех .json, а
// изменения списков ложатся в кандидата теми же путями, какими лягут на диск.
func (m *Manager) check(ctx context.Context, data []byte, putLists map[string][]byte, removeLists []string) error {
	dir, err := os.MkdirTemp("", "metabox-candidate-")
	if err != nil {
		return fmt.Errorf("каталог кандидата: %w", err)
	}
	defer func() {
		if err := os.RemoveAll(dir); err != nil {
			m.log.Error("каталог кандидата не убран", "err", err, "dir", dir)
		}
	}()

	if err := m.store.StageCandidate(ctx, dir, data, putLists, removeLists); err != nil {
		return err
	}

	return m.service.Check(ctx, dir)
}

// run уводит применение в фоновую горутину: цикл переживает запрос, а окно
// подтверждения тянется до минуты. Останавливает горутину
// Close, ошибки уходят в лог и в состояние транзакции, дожидается — wg.
func (m *Manager) run(data []byte, putLists map[string][]byte, removeLists []string, settings clashapi.Settings, token uint64) {
	ctx, cancel := context.WithCancel(context.Background())

	m.mu.Lock()
	m.cancel = cancel
	confirmed := m.confirmed
	m.mu.Unlock()

	m.wg.Add(1)

	go func() {
		defer m.wg.Done()
		defer cancel()
		defer m.unreserve(token)

		m.cycle(ctx, data, putLists, removeLists, settings, confirmed)
	}()
}

func (m *Manager) cycle(
	ctx context.Context,
	data []byte,
	putLists map[string][]byte,
	removeLists []string,
	settings clashapi.Settings,
	confirmed <-chan struct{},
) {
	id := m.Current().ID
	log := m.log.With("transaction_id", id)

	log.Info("применение начато",
		"sha256", short(sum(data)), "size", len(data),
		"lists_put", len(putLists), "lists_removed", len(removeLists))

	if err := m.apply(ctx, data, putLists, removeLists, settings); err != nil {
		log.Error("применение не прошло", "err", err)
		m.release(PhaseFailed, err)

		if reasonOf(err) == ReasonBackupFailed {
			m.closeUnwritten(context.WithoutCancel(ctx), log)

			return
		}

		m.rollback(context.WithoutCancel(ctx), log)

		return
	}

	m.await(ctx, log, confirmed)
}

// apply выполняет шаги 4–7 протокола: бэкап, запись, рестарт, healthcheck.
// Файлы списков пишутся до конфига: конфиг — точка фиксации транзакции, и
// доигрывание судит о начатой записи по нему и по изменяемым файлам.
func (m *Manager) apply(
	ctx context.Context,
	data []byte,
	putLists map[string][]byte,
	removeLists []string,
	settings clashapi.Settings,
) error {
	ctx, cancel := context.WithTimeout(ctx, m.opts.CycleTimeout)
	defer cancel()

	if err := m.store.Backup(ctx); err != nil {
		// Конфига может не быть — до первого применения или после удаления
		// владельцем. Откатываться тогда не на что, но и применение это не
		// останавливает.
		if !errors.Is(err, config.ErrNoConfig) {
			return stepFailed(ReasonBackupFailed, fmt.Errorf("бэкап: %w", err))
		}
		m.log.Warn("конфига на устройстве нет, бэкапа нет")
	}

	// История надстроена над бэкапом и к откату отношения не имеет: её отказ
	// применение не останавливает.
	previous, err := m.store.Read(ctx)
	switch {
	case err == nil:
		if err := m.store.SaveVersion(ctx, previous); err != nil {
			m.log.Warn("версия не сохранена в историю", "err", err)
		}
	case errors.Is(err, config.ErrNoConfig):
		// Первое применение: сохранять в историю нечего.
	default:
		m.log.Warn("конфиг не прочитан, версия в историю не сохранена", "err", err)
	}

	if err := m.store.WriteLists(ctx, putLists, removeLists); err != nil {
		return stepFailed(ReasonWriteFailed, fmt.Errorf("запись списков: %w", err))
	}

	if err := m.store.Write(ctx, data); err != nil {
		return stepFailed(ReasonWriteFailed, fmt.Errorf("запись конфига: %w", err))
	}

	lastLists, err := m.store.ListSums(ctx)
	if err != nil {
		// Сверять следующее применение будет не с чем — как после перезапуска.
		m.log.Warn("отпечаток списков после записи не снят", "err", err)
	}

	m.mu.Lock()
	m.lastSum = sum(data)
	m.lastListsSum = ""
	if err == nil {
		m.lastListsSum = ListsEtag(lastLists)
	}
	m.mu.Unlock()

	// pid до рестарта — граница, по которой ответ API засчитывается только
	// новому процессу. Без procd или когда procd службы не знает, сверять не с
	// чем: healthcheck остаётся на одном опросе API, а итог по-прежнему
	// страхует окно подтверждения.
	before, pidErr := m.service.PID(ctx)
	if pidErr != nil {
		m.log.Warn("pid службы до рестарта не прочитан, healthcheck без сверки процесса", "err", pidErr)
	}

	if err := m.service.Restart(ctx); err != nil {
		return stepFailed(ReasonRestartFailed, err)
	}

	if pidErr == nil {
		if err := m.awaitProcess(ctx, before); err != nil {
			return stepFailed(ReasonHealthcheckFailed, err)
		}
	}

	if err := m.health.Wait(ctx, settings); err != nil {
		return stepFailed(ReasonHealthcheckFailed, err)
	}

	return nil
}

// awaitProcess ждёт, пока procd отчитается о новом процессе службы. Init-скрипт
// возвращается раньше, чем procd заменит процесс, и первые запросы к API мог
// бы обслужить прежний — healthcheck засчитал бы новому конфигу чужой ответ.
// Новым считается поднятый процесс с pid, отличным от прежнего: before = 0
// означает, что до рестарта служба лежала, и годится любой поднятый.
func (m *Manager) awaitProcess(ctx context.Context, before int) error {
	ticker := time.NewTicker(m.opts.ProcessInterval)
	defer ticker.Stop()

	var last error
	for {
		pid, err := m.service.PID(ctx)

		switch {
		case err != nil:
			last = err
		case pid > 0 && pid != before:
			return nil
		case pid == 0:
			last = errors.New("служба не поднята")
		default:
			last = fmt.Errorf("procd отдаёт прежний pid %d", pid)
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("ожидание нового процесса службы: %w, последняя попытка: %w", ctx.Err(), last)
		case <-ticker.C:
		}
	}
}

// await держит окно подтверждения. Без подтверждения в срок конфиг
// возвращается на предыдущий.
func (m *Manager) await(ctx context.Context, log *slog.Logger, confirmed <-chan struct{}) {
	m.mu.Lock()
	m.current.Phase = PhaseAwaitingConfirm
	m.windowEndsAt = time.Now().Add(m.opts.Window)
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
		if !m.beginRollback() {
			return
		}

		log.Warn("подтверждения не было, возвращаем предыдущий конфиг")
		m.rollback(context.WithoutCancel(ctx), log)
	}
}

// beginRollback закрывает окно перед тем, как откат тронет диск: с этого
// момента Confirm получает отказ. Ложь означает, что подтверждение успело
// раньше таймера и откатывать нечего.
func (m *Manager) beginRollback() bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.current.Phase != PhaseAwaitingConfirm {
		return false
	}

	m.rollingBack = true

	return true
}

// rollback возвращает предыдущий конфиг и поднимает на нём сервис. Обе
// половины отката отчитываются вместе: откат, не сделавший ни того ни другого,
// обязан рассказать про оба отказа.
func (m *Manager) rollback(ctx context.Context, log *slog.Logger) {
	ctx, cancel := context.WithTimeout(ctx, m.opts.CycleTimeout)
	defer cancel()

	restoreErr := m.store.Restore(ctx)

	// Бэкапа нет — до применения конфига на устройстве не было. Рестарт ничего
	// бы не вернул, а rolled_back соврал бы, что прежний конфиг на месте:
	// транзакция закрывается отказом со своей причиной.
	noBackup := errors.Is(restoreErr, config.ErrNoBackup)
	if noBackup {
		log.Warn("откатываться не на что: бэкапа нет, служба остаётся на записанном")
		restoreErr = nil
	}

	var restartErr error
	if restoreErr == nil && !noBackup {
		restartErr = m.service.Restart(ctx)
	}

	if err := errors.Join(restoreErr, restartErr); err != nil {
		log.Error("откат не прошёл", "err", err)
		m.release(PhaseFailed, stepFailed(ReasonRollbackFailed, err))

		// Что легло на диск, неизвестно: Restore мог и успеть, и упасть на
		// середине. Сверка со старым lastSum давала бы ложное «конфиг изменён
		// вне metabox» на каждый следующий Start — панель нельзя лишать
		// возможности применить исправленный конфиг.
		m.mu.Lock()
		m.lastSum = ""
		m.lastListsSum = ""
		m.mu.Unlock()

		return
	}

	m.mu.Lock()
	m.current.Window = 0
	m.windowEndsAt = time.Time{}
	m.rollingBack = false

	if noBackup {
		// Отказ шага, если он был, остаётся подробностью: по нему видно, почему
		// понадобился откат. lastSum не трогается: отката не было, и на диске
		// ровно то, что оставил цикл.
		m.current.Phase = PhaseFailed
		m.current.ReasonCode = ReasonNoBackup
		if m.current.Reason == "" {
			m.current.Reason = config.ErrNoBackup.Error()
		}
	} else {
		m.current.Phase = PhaseRolledBack
		m.lastSum = ""
		m.lastListsSum = ""
	}
	m.mu.Unlock()

	// Состояние убирается до освобождения busy: снятый раньше busy впускает
	// следующий Start, и ClearState стирал бы уже его файл состояния.
	if err := m.store.ClearState(ctx); err != nil {
		log.Error("состояние откаченной транзакции не убрано", "err", err)
	}

	m.mu.Lock()
	m.busy = false
	m.mu.Unlock()

	if !noBackup {
		log.Info("предыдущий конфиг возвращён")
	}
}

// closeUnwritten закрывает транзакцию, вставшую на бэкапе. Записи ещё не было,
// на диске прежний конфиг, а бэкап остался от прошлой транзакции или
// недописан: откат по нему потерял бы то, что сейчас работает. Поэтому ни
// Restore, ни рестарта; lastSum не трогается — на диске ровно то, что было до
// применения.
func (m *Manager) closeUnwritten(ctx context.Context, log *slog.Logger) {
	ctx, cancel := context.WithTimeout(ctx, m.opts.CycleTimeout)
	defer cancel()

	m.mu.Lock()
	m.current.Window = 0
	m.windowEndsAt = time.Time{}
	m.mu.Unlock()

	// Состояние убирается до освобождения busy — по той же причине, что в
	// rollback. Оставшееся на диске applying доигрывание закроет без отката:
	// writeHappened записи не найдёт.
	if err := m.store.ClearState(ctx); err != nil {
		log.Error("состояние транзакции без записи не убрано", "err", err)
	}

	m.mu.Lock()
	m.busy = false
	m.mu.Unlock()
}

// Replay доигрывает транзакцию, оставшуюся от прошлой жизни демона. Вызывается
// на старте: без него питание, снятое в окне подтверждения, оставило бы
// устройство на неподтверждённом конфиге навсегда.
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
		// Цикл оборвался, не дойдя до окна подтверждения. Откат нужен, только
		// если конфиг успел записаться: иначе на диске лежит прежний конфиг,
		// а бэкап может остаться от прошлой транзакции — восстановление по
		// нему молча потеряло бы уже подтверждённую версию.
		if !m.writeHappened(ctx, tx) {
			log.Warn("применение оборвано до записи конфига, откат не нужен")

			if err := m.store.ClearState(ctx); err != nil {
				return fmt.Errorf("очистка оборванного состояния: %w", err)
			}

			return nil
		}

		log.Warn("применение оборвано, возвращаем предыдущий конфиг")
		m.begin(tx)
		m.rollback(ctx, log)

	case tx.Phase == PhaseAwaitingConfirm && tx.Window <= 0:
		log.Warn("окно подтверждения истекло, возвращаем предыдущий конфиг")
		m.begin(tx)
		m.rollback(ctx, log)

	case tx.Phase == PhaseAwaitingConfirm:
		log.Warn("окно подтверждения восстановлено", "window", tx.Window)
		m.restoreWindow(tx, m.reserveRestored())

	default:
		if err := m.store.ClearState(ctx); err != nil {
			return fmt.Errorf("очистка завершённого состояния: %w", err)
		}
	}

	return nil
}

// writeHappened отвечает, успел ли оборванный цикл тронуть диск: sha конфига
// сверяется с суммой из состояния, а следом — изменяемые файлы списков.
// Транзакция несёт только реально меняемые, поэтому совпадение любого из них
// означает начатую запись, а не файл, который и не менялся.
func (m *Manager) writeHappened(ctx context.Context, tx Transaction) bool {
	current, err := m.store.Sum(ctx)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		// Сверить не вышло — считаем, что запись случилась: лишний откат
		// вернёт бэкап, а пропущенный оставил бы устройство без автоотката.
		m.log.Warn("сверка конфига при доигрывании не прошла", "err", err)

		return true
	}
	if err == nil && current == tx.Sum {
		return true
	}

	if len(tx.Lists) == 0 && len(tx.RemovedLists) == 0 {
		return false
	}

	sums, err := m.store.ListSums(ctx)
	if err != nil {
		m.log.Warn("сверка списков при доигрывании не прошла", "err", err)

		return true
	}

	for name, target := range tx.Lists {
		if sums[name] == target {
			return true
		}
	}

	for _, name := range tx.RemovedLists {
		if _, ok := sums[name]; !ok {
			return true
		}
	}

	return false
}

// restoreWindow поднимает таймер заново на срок из состояния. Сколько его
// прошло до перезагрузки, узнать неоткуда: часов реального времени у роутера
// нет. Свойство «нет подтверждения — откат» это сохраняет, а пользователю
// достаётся ещё одно окно, чтобы подтвердить связь.
func (m *Manager) restoreWindow(tx Transaction, token uint64) {
	ctx, cancel := context.WithCancel(context.Background())

	// Транзакция и её отмена выставляются под одним замком: между двумя
	// участками остановка демона увидела бы новое окно со старой отменой и
	// прервала бы не то.
	m.mu.Lock()
	m.current = tx
	m.windowEndsAt = time.Now().Add(tx.Window)
	m.lastSum = tx.Sum
	m.confirmed = make(chan struct{})
	confirmed := m.confirmed
	m.cancel = cancel
	m.mu.Unlock()

	m.wg.Add(1)

	go func() {
		defer m.wg.Done()
		defer cancel()
		defer m.unreserve(token)

		log := m.log.With("transaction_id", tx.ID)

		select {
		case <-confirmed:
		case <-ctx.Done():
			log.Warn("восстановленное окно прервано остановкой демона")
		case <-m.clock.After(tx.Window):
			if !m.beginRollback() {
				return
			}

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
// Возвращает номер владения для unreserve.
func (m *Manager) reserveRestored() uint64 {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.hold()
}
