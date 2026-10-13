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
	"path/filepath"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/dataplane"
)

// check lays the candidate out in a temporary directory and gives it to the binary in the same
// mode the service will start in. The candidate carries the whole layout of the config
// directory: in -C mode the service merges its .json, and list changes
// land in the candidate by the same paths they will take on disk.
func (m *Manager) check(
	ctx context.Context,
	data []byte,
	putLists map[string][]byte,
	removeLists []string,
	target checkTarget,
) error {
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

	config := filepath.Join(dir, m.opts.ConfigName)
	if target.directory {
		config = ""
	}

	workdir := dir
	if target.workdir != "" {
		workdir = target.workdir
	}

	return m.service.Check(ctx, dir, config, workdir)
}

// run moves the apply into a background goroutine: the cycle outlives the request, and the confirmation
// window lasts up to a minute. The goroutine is stopped by
// Close, errors go to the log and to the transaction state, and wg waits for it.
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

// apply performs steps 4–7 of the protocol: backup, write, restart, healthcheck.
// List files are written before the config: the config is the commit point of the transaction, and
// the replay judges a started write by it and by the changing files.
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
		// The config may be absent: before the first apply or after the owner
		// removed it. There is then nothing to roll back to, but the apply is not
		// stopped either.
		if !errors.Is(err, config.ErrNoConfig) {
			return stepFailed(ReasonBackupFailed, fmt.Errorf("бэкап: %w", err))
		}
		m.log.Warn("конфига на устройстве нет, бэкапа нет")
	}

	// The history is built on top of the backup and has nothing to do with the rollback: its failure does not
	// stop the apply.
	previous, err := m.store.Read(ctx)
	switch {
	case err == nil:
		if err := m.store.SaveVersion(ctx, previous); err != nil {
			m.log.Warn("история версий не обновлена", "err", err)
		}
	case errors.Is(err, config.ErrNoConfig):
		// The first apply: nothing to save into the history.
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
		// There will be nothing to compare the next apply with, as after a restart.
		m.log.Warn("отпечаток списков после записи не снят", "err", err)
	}

	m.mu.Lock()
	m.lastSum = sum(data)
	m.lastListsSum = ""
	if err == nil {
		m.lastListsSum = config.ListsEtag(lastLists)
	}
	m.mu.Unlock()

	// The pid before the restart is the boundary by which an API answer is counted only for
	// the new process. Without procd or when procd does not know the service there is nothing to compare
	// with: the healthcheck stays on a single API poll, and the result is still
	// insured by the confirmation window.
	before, pidErr := m.service.PID(ctx)
	if pidErr != nil {
		m.log.Warn("pid службы до рестарта не прочитан, healthcheck без сверки процесса", "err", pidErr)
	}

	plane, planeRead := m.planeBefore(ctx)

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

	if !planeRead {
		return nil
	}

	if err := m.checkInterception(ctx, plane); err != nil {
		return stepFailed(ReasonInterceptionMissing, err)
	}

	if err := m.probeDNS(ctx, data, plane.model.DNSPort); err != nil {
		return stepFailed(ReasonDNSProbeFailed, err)
	}

	return nil
}

// planeState is the dataplane model and the interception flag before the restart.
type planeState struct {
	model dataplane.Model
	// intercepted: the dataplane chains were in place; reason is why the flag was not
	// observed. Both are read only when the model is enabled.
	intercepted bool
	reason      dataplane.AppliedReason
}

// planeBefore takes the dataplane model before the restart. False means there is no model, and the checks
// after the restart are skipped: the dns-in port is taken from it, and interception has nothing to
// compare with without it. A model error does not stop the apply, because the init script
// also leaves the dataplane as is on it.
func (m *Manager) planeBefore(ctx context.Context) (planeState, bool) {
	if m.opts.Dataplane == nil {
		return planeState{}, false
	}

	model, err := m.opts.Dataplane.Model(ctx)
	if err != nil {
		m.log.Warn("модель обвязки не прочитана, DNS-проба и проверка перехвата пропущены", "err", err)

		return planeState{}, false
	}

	state := planeState{model: model}
	if !model.Enabled {
		return state, true
	}

	state.intercepted, state.reason, err = m.opts.Dataplane.Applied(ctx)
	if err != nil {
		state.reason = dataplane.NFTUnavailable
	}

	return state, true
}

// checkInterception compares interception after the restart with what stood before it.
// A failure only when the chains were there and vanished: interception that was absent even before
// the restart was not removed by the config apply and the rollback will not bring it back. Likewise
// skipped is a service that installs interception with foreign chains, homeproxy in
// the transitional mode.
func (m *Manager) checkInterception(ctx context.Context, before planeState) error {
	switch {
	case !before.model.Enabled:
		return nil
	case before.reason != "":
		m.log.Warn("перехват не проверен: nft недоступен", "applied_reason", before.reason)

		return nil
	case !before.intercepted:
		m.log.Warn("перехват включён, но его цепочек не было и до рестарта; проверка пропущена")

		return nil
	}

	applied, reason, err := m.opts.Dataplane.Applied(ctx)

	switch {
	case err != nil:
		return fmt.Errorf("проверка перехвата: %w", err)
	case reason != "":
		m.log.Warn("перехват после рестарта не проверен: nft недоступен", "applied_reason", reason)

		return nil
	case !applied:
		return errors.New("цепочек перехвата в nft после рестарта нет")
	}

	return nil
}

// probeDNS sends a probe query to the candidate dns-in. No probe or no dns-in in
// the config is a skip: without dns-in the network DNS does not go through sing-box, and there is
// nothing to check.
func (m *Manager) probeDNS(ctx context.Context, data []byte, port int) error {
	if m.opts.DNS == nil {
		return nil
	}

	inbound, ok, err := clashapi.ReadDNSInbound(data, port)
	if err != nil {
		return err
	}

	if !ok {
		m.log.Debug("dns-in в конфиге нет, DNS-проба пропущена", "dns_port", port)

		return nil
	}

	return m.opts.DNS.Probe(ctx, inbound)
}

// awaitProcess waits until procd reports a new service process. The init script
// returns before procd replaces the process, and the first API requests could
// be served by the old one: the healthcheck would credit the new config with a foreign answer.
// A new process is an up process with a pid different from the previous one: before = 0
// means the service was down before the restart, and any up one will do.
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

// await holds the confirmation window. Without confirmation in time the config
// is returned to the previous one.
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
		// The daemon is being stopped. The state stays on disk, the window is replayed
		// at the next start.
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

// beginRollback closes the window before the rollback touches the disk: from this
// moment Confirm gets a refusal. False means the confirmation got in
// before the timer and there is nothing to roll back.
func (m *Manager) beginRollback() bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.current.Phase != PhaseAwaitingConfirm {
		return false
	}

	m.rollingBack = true

	return true
}

// rollback returns the previous config and brings the service up on it. Both
// halves of the rollback report together: a rollback that did neither
// must tell about both failures.
func (m *Manager) rollback(ctx context.Context, log *slog.Logger) {
	ctx, cancel := context.WithTimeout(ctx, m.opts.CycleTimeout)
	defer cancel()

	restoreErr := m.store.Restore(ctx)

	// There is no backup: the device had no config before the apply. A restart would return
	// nothing, and rolled_back would lie that the previous config is in place:
	// the transaction is closed with a failure with its own reason.
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

		// What landed on disk is unknown: Restore could have both finished and failed in
		// the middle. A check against the old lastSum would give a false "config modified
		// outside metabox" on every next Start, and the panel must not be deprived of
		// the ability to apply a fixed config.
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
		// A step failure, if there was one, stays a detail: it shows why
		// the rollback was needed. lastSum is not touched: there was no rollback, and the disk has
		// exactly what the cycle left.
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

	// The state is removed before busy is released: busy released earlier lets in
	// the next Start, and ClearState would erase its state file.
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

// closeUnwritten closes a transaction that stopped at the backup. There was no write yet,
// the disk has the previous config, and the backup is left from a previous transaction or
// is incomplete: a rollback from it would lose what works now. So neither
// Restore nor a restart; lastSum is not touched: the disk has exactly what it had before
// the apply.
func (m *Manager) closeUnwritten(ctx context.Context, log *slog.Logger) {
	ctx, cancel := context.WithTimeout(ctx, m.opts.CycleTimeout)
	defer cancel()

	m.mu.Lock()
	m.current.Window = 0
	m.windowEndsAt = time.Time{}
	m.mu.Unlock()

	// The state is removed before busy is released, for the same reason as in
	// rollback. An applying left on disk will be closed by the replay without a rollback:
	// writeHappened finds no write.
	if err := m.store.ClearState(ctx); err != nil {
		log.Error("состояние транзакции без записи не убрано", "err", err)
	}

	m.mu.Lock()
	m.busy = false
	m.mu.Unlock()
}

// Replay replays a transaction left from the previous daemon lifetime. Called
// at start: without it, a power loss within the confirmation window would leave
// the device on the unconfirmed config forever.
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
		// The cycle broke off before reaching the confirmation window. A rollback is needed only
		// if the config managed to be written: otherwise the disk has the previous config,
		// and the backup may be left from a previous transaction, and restoring from
		// it would silently lose an already confirmed version.
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

// writeHappened reports whether a broken cycle managed to touch the disk: the config sha
// is compared with the sum from the state, and then the changing list files.
// The transaction carries only the really changing ones, so a match of any of them
// means a started write, not a file that did not change.
func (m *Manager) writeHappened(ctx context.Context, tx Transaction) bool {
	current, err := m.store.Sum(ctx)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		// The comparison failed: we assume the write happened, since an extra rollback
		// returns the backup, while a skipped one would leave the device without an automatic rollback.
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

// restoreWindow raises the timer again for the period from the state. How much of it
// passed before the reboot cannot be learned: the router has no real-time clock.
// The property "no confirmation, rollback" is preserved, and the user
// gets one more window to confirm the connection.
func (m *Manager) restoreWindow(tx Transaction, token uint64) {
	ctx, cancel := context.WithCancel(context.Background())

	// The transaction and its cancel are set under one lock: between two
	// sections a daemon stop would see the new window with the old cancel and
	// interrupt the wrong thing.
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

// short shortens a hash for the log: the full one is not needed there, and the line is longer.
func short(s string) string {
	const n = 12
	if len(s) <= n {
		return s
	}

	return s[:n]
}

// reserveRestored closes the apply for the duration of the restored window: while
// it runs, a new Start must get a refusal just as it does for its own.
// Returns the ownership number for unreserve.
func (m *Manager) reserveRestored() uint64 {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.hold()
}
