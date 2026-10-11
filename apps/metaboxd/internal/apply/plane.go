package apply

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/netip"
	"slices"
	"sync"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/dataplane"
)

// ErrDataplaneModified — секцию UCI изменили после того, как клиент прочитал
// модель: правка по SSH иначе затёрлась бы молча.
var ErrDataplaneModified = errors.New("модель обвязки изменена вне metabox")

// ErrDataplaneForeignService — демон управляет не той службой, чей init-скрипт
// читает модель: смена отклонена до записи.
var ErrDataplaneForeignService = errors.New("модель обвязки читает только служба " + dataplane.Service)

// PlaneEditor — модель обвязки в UCI: снимок секции, запись модели, возврат
// снимка и цепочки в nft.
type PlaneEditor interface {
	Snapshot(ctx context.Context) (dataplane.Snapshot, error)
	Write(ctx context.Context, m dataplane.Model) error
	Restore(ctx context.Context, snap dataplane.Snapshot) error
	Chains(ctx context.Context) ([]string, dataplane.AppliedReason, error)
}

// PlaneService — служба, которая доводит обвязку до модели.
type PlaneService interface {
	Reload(ctx context.Context) error
}

// PlaneStore — применённый конфиг, по которому ищется dns-in, и файл состояния
// транзакции обвязки.
type PlaneStore interface {
	Read(ctx context.Context) ([]byte, error)
	ReadPlaneState(ctx context.Context) ([]byte, error)
	WritePlaneState(ctx context.Context, data []byte) error
	ClearPlaneState(ctx context.Context) error
}

// PlaneOptions — настройки смены модели обвязки.
type PlaneOptions struct {
	// Window — окно подтверждения, то же, что у применения конфига.
	Window time.Duration
	// CycleTimeout ограничивает запись, reload и проверки, и отдельно — откат.
	CycleTimeout time.Duration
	// DNS — проба dns-in; nil — выключена.
	DNS DNSProber
	// Service — имя службы, которой управляет демон: имя её init-скрипта.
	// Смена модели идёт только при dataplane.Service.
	Service string
}

// planeRecord — файл состояния транзакции обвязки: транзакция и снимок секции,
// к которому откатываться.
type planeRecord struct {
	Transaction
	Previous dataplane.Snapshot `json:"previous"`
}

// Plane — владелец транзакции смены модели обвязки. Протокол тот же, что у
// применения конфига: проверка модели, снимок прежней секции UCI, запись,
// reload службы, проверка, окно подтверждения, без подтверждения — возврат
// снимка и повторный reload. Применение занимается у Manager: одновременно идёт
// одна транзакция, конфига или обвязки.
//
// Окно подтверждения есть у каждой смены без исключений. Поэтому смена ACL,
// которая выводит из перехвата адрес самого администратора, применяется так же
// и без подтверждения откатывается по окну: дольше окна она его не отрезает.
type Plane struct {
	gate    *Manager
	editor  PlaneEditor
	service PlaneService
	store   PlaneStore
	health  Health
	clock   Clock
	log     *slog.Logger
	opts    PlaneOptions

	mu          sync.Mutex
	current     Transaction
	previous    dataplane.Snapshot
	token       uint64
	rollingBack bool
	// windowEndsAt — монотонная метка конца окна, только в памяти; см. Manager.
	windowEndsAt time.Time
	confirmed    chan struct{}
	cancel       context.CancelFunc

	wg sync.WaitGroup
}

// NewPlane собирает транзакцию обвязки поверх применения конфига gate. Часы
// можно не задавать — тогда берутся системные.
func NewPlane(
	gate *Manager,
	editor PlaneEditor,
	service PlaneService,
	store PlaneStore,
	health Health,
	clock Clock,
	log *slog.Logger,
	opts PlaneOptions,
) *Plane {
	if clock == nil {
		clock = SystemClock{}
	}

	return &Plane{
		gate: gate, editor: editor, service: service, store: store,
		health: health, clock: clock, log: log, opts: opts,
	}
}

// Current отдаёт снимок транзакции обвязки; Window — остаток окна.
func (p *Plane) Current() Transaction {
	p.mu.Lock()
	defer p.mu.Unlock()

	tx := p.current
	if tx.Phase == PhaseAwaitingConfirm && !p.windowEndsAt.IsZero() {
		tx.Window = max(0, time.Until(p.windowEndsAt))
	}

	return tx
}

// Start проверяет модель, занимает применение и уводит смену в фоновую
// горутину. base — Snapshot.Sum секции, от которой строилась модель; пустой —
// смена без сверки. client — адрес, с которого пришёл запрос: смена, которая
// выводит его из перехвата, отмечается в логе, но идёт тем же протоколом.
func (p *Plane) Start(ctx context.Context, model dataplane.Model, base string, client netip.Addr) (Transaction, error) {
	next, err := dataplane.Normalize(model)
	if err != nil {
		return Transaction{}, err
	}

	if p.opts.Service != dataplane.Service {
		return Transaction{}, ErrDataplaneForeignService
	}

	token, err := p.gate.reserveExclusive()
	if err != nil {
		return Transaction{}, err
	}

	previous, err := p.editor.Snapshot(ctx)
	if err != nil {
		p.gate.unreserve(token)

		return Transaction{}, fmt.Errorf("снимок модели обвязки: %w", err)
	}

	if base != "" && previous.Sum() != base {
		p.gate.unreserve(token)

		return Transaction{}, ErrDataplaneModified
	}

	tx := Transaction{ID: rand.Text(), Phase: PhaseApplying, Window: p.opts.Window}

	if err := p.persist(ctx, tx, previous); err != nil {
		p.gate.unreserve(token)

		return Transaction{}, err
	}

	log := p.log.With("transaction_id", tx.ID)

	if prev, err := previous.Model(); err == nil && leavesClient(prev, next, client) {
		log.Warn("смена ACL выводит адрес запроса из перехвата, без подтверждения она откатится по окну",
			"client", client.String())
	}

	runCtx, cancel := context.WithCancel(context.Background())

	p.mu.Lock()
	p.current = tx
	p.previous = previous
	p.token = token
	p.confirmed = make(chan struct{})
	confirmed := p.confirmed
	p.cancel = cancel
	p.mu.Unlock()

	p.wg.Add(1)

	go func() {
		defer p.wg.Done()
		defer cancel()
		defer p.gate.unreserve(token)

		p.cycle(runCtx, log, previous, next, confirmed)
	}()

	return tx, nil
}

// leavesClient — до смены адрес клиента шёл через sing-box, а после неё режим
// listed его не перечисляет. MAC здесь не сверяется: по адресу запроса его не
// узнать.
func leavesClient(prev, next dataplane.Model, client netip.Addr) bool {
	if !client.IsValid() || !prev.Enabled || !next.Enabled || next.AccessMode != dataplane.AccessListed {
		return false
	}

	client = client.Unmap()
	before := prev.AccessMode == dataplane.AccessAll || covers(prev.SourceIP, client)

	return before && !covers(next.SourceIP, client)
}

func covers(sources []string, addr netip.Addr) bool {
	return slices.ContainsFunc(sources, func(s string) bool {
		if a, err := netip.ParseAddr(s); err == nil {
			return a == addr
		}

		prefix, err := netip.ParsePrefix(s)

		return err == nil && prefix.Contains(addr)
	})
}

func (p *Plane) cycle(
	ctx context.Context,
	log *slog.Logger,
	previous dataplane.Snapshot,
	next dataplane.Model,
	confirmed <-chan struct{},
) {
	log.Info("смена модели обвязки начата",
		"enabled", next.Enabled, "acl_mode", next.AccessMode, "dns_port", next.DNSPort)

	if err := p.apply(ctx, log, previous, next); err != nil {
		log.Error("смена модели обвязки не прошла", "err", err)
		p.release(PhaseFailed, err)
		p.rollback(context.WithoutCancel(ctx), log)

		return
	}

	p.await(ctx, log, confirmed)
}

// apply пишет модель, перечитывает её службой и проверяет результат: цепочки
// перехвата стоят ровно тогда, когда модель включена, а при смене порта dns-in
// или включении обвязки dnsmasq получил ответ от dns-in на новом порту.
func (p *Plane) apply(ctx context.Context, log *slog.Logger, previous dataplane.Snapshot, next dataplane.Model) error {
	ctx, cancel := context.WithTimeout(ctx, p.opts.CycleTimeout)
	defer cancel()

	if err := p.editor.Write(ctx, next); err != nil {
		return stepFailed(ReasonWriteFailed, fmt.Errorf("запись модели обвязки: %w", err))
	}

	if err := p.service.Reload(ctx); err != nil {
		return stepFailed(ReasonRestartFailed, err)
	}

	if err := p.checkChains(ctx, log, next.Enabled); err != nil {
		return err
	}

	prev, err := previous.Model()
	if !next.Enabled || p.opts.DNS == nil || (err == nil && prev.Enabled && prev.DNSPort == next.DNSPort) {
		return nil
	}

	if err := p.probeDNS(ctx, next.DNSPort); err != nil {
		return stepFailed(ReasonDNSProbeFailed, err)
	}

	return nil
}

// checkChains сверяет цепочки в nft с моделью. nft недоступен — пропуск с
// предупреждением, как в healthcheck применения конфига. Цепочки, оставшиеся
// после выключения, — отказ reload: служба не довела обвязку до модели.
func (p *Plane) checkChains(ctx context.Context, log *slog.Logger, enabled bool) error {
	chains, reason, err := p.editor.Chains(ctx)

	switch {
	case err != nil:
		return stepFailed(ReasonInterceptionMissing, fmt.Errorf("проверка перехвата: %w", err))
	case reason != "":
		log.Warn("перехват после reload не проверен: nft недоступен", "applied_reason", reason)

		return nil
	case !enabled && len(chains) > 0:
		return stepFailed(ReasonRestartFailed, errors.New("цепочки перехвата остались после выключения обвязки"))
	case !enabled:
		return nil
	}

	var missing []string

	for _, name := range dataplane.ExpectedChains() {
		if !slices.Contains(chains, name) {
			missing = append(missing, name)
		}
	}

	if len(missing) > 0 {
		return stepFailed(ReasonInterceptionMissing, fmt.Errorf("цепочек перехвата в nft нет: %v", missing))
	}

	return nil
}

// probeDNS ждёт, пока поднимется sing-box, — reload службы его перезапускает, —
// и шлёт контрольный запрос в dns-in на порту модели. dns-in на этом порту в
// конфиге нет — отказ: dnsmasq отдаёт запросы в пустой порт.
func (p *Plane) probeDNS(ctx context.Context, port int) error {
	cfg, err := p.store.Read(ctx)
	if err != nil {
		return fmt.Errorf("конфиг для DNS-пробы: %w", err)
	}

	settings, err := clashapi.Read(cfg)
	if err != nil {
		return err
	}

	if err := p.health.Wait(ctx, settings); err != nil {
		return err
	}

	inbound, ok, err := clashapi.ReadDNSInbound(cfg, port)
	if err != nil {
		return err
	}

	if !ok {
		return fmt.Errorf("dns-in на порту %d в конфиге нет", port)
	}

	return p.opts.DNS.Probe(ctx, inbound)
}

func (p *Plane) await(ctx context.Context, log *slog.Logger, confirmed <-chan struct{}) {
	p.mu.Lock()
	p.current.Phase = PhaseAwaitingConfirm
	p.windowEndsAt = time.Now().Add(p.opts.Window)
	tx := p.current
	previous := p.previous
	p.mu.Unlock()

	if err := p.persist(ctx, tx, previous); err != nil {
		log.Error("состояние окна подтверждения обвязки не сохранено", "err", err)
	}

	log.Info("модель обвязки применена, идёт окно подтверждения", "window", p.opts.Window)

	p.wait(ctx, log, confirmed, p.opts.Window)
}

// wait держит окно: подтверждение, остановка демона или откат по таймеру.
func (p *Plane) wait(ctx context.Context, log *slog.Logger, confirmed <-chan struct{}, window time.Duration) {
	select {
	case <-confirmed:
	case <-ctx.Done():
		// Состояние остаётся на диске, окно доиграется при следующем старте.
		log.Warn("окно подтверждения обвязки прервано остановкой демона")
	case <-p.clock.After(window):
		if !p.beginRollback() {
			return
		}

		log.Warn("подтверждения не было, возвращаем прежнюю модель обвязки")
		p.rollback(context.WithoutCancel(ctx), log)
	}
}

func (p *Plane) beginRollback() bool {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.current.Phase != PhaseAwaitingConfirm {
		return false
	}

	p.rollingBack = true

	return true
}

// rollback возвращает снимок секции и перечитывает его службой. Отказ оставляет
// состояние на диске: следующий старт демона попробует откат снова.
func (p *Plane) rollback(ctx context.Context, log *slog.Logger) {
	ctx, cancel := context.WithTimeout(ctx, p.opts.CycleTimeout)
	defer cancel()

	p.mu.Lock()
	previous := p.previous
	p.mu.Unlock()

	restoreErr := p.editor.Restore(ctx, previous)

	var reloadErr error
	if restoreErr == nil {
		reloadErr = p.service.Reload(ctx)
	}

	if err := errors.Join(restoreErr, reloadErr); err != nil {
		log.Error("откат модели обвязки не прошёл", "err", err)
		p.release(PhaseFailed, stepFailed(ReasonRollbackFailed, err))

		return
	}

	p.mu.Lock()
	p.current.Phase = PhaseRolledBack
	p.current.Window = 0
	p.windowEndsAt = time.Time{}
	p.rollingBack = false
	token := p.token
	p.mu.Unlock()

	if err := p.store.ClearPlaneState(ctx); err != nil {
		log.Error("состояние откаченной смены обвязки не убрано", "err", err)
	}

	p.gate.unreserve(token)

	log.Info("прежняя модель обвязки возвращена")
}

// Confirm закрывает окно подтверждения смены обвязки.
func (p *Plane) Confirm(ctx context.Context, id string) (Transaction, error) {
	p.mu.Lock()

	if p.current.ID != id {
		p.mu.Unlock()

		return Transaction{}, ErrUnknownTransaction
	}

	if p.current.Phase != PhaseAwaitingConfirm || p.rollingBack {
		p.mu.Unlock()

		return Transaction{}, ErrNothingToConfirm
	}

	p.current.Phase = PhaseConfirmed
	p.current.Window = 0
	tx := p.current
	previous := p.previous
	token := p.token
	confirmed := p.confirmed
	p.confirmed = nil
	p.mu.Unlock()

	// Порядок тот же, что у Manager.Confirm: состояние убирается до
	// освобождения применения, а неубранное заменяется терминальной фазой.
	if err := p.store.ClearPlaneState(ctx); err != nil {
		if persistErr := p.persist(ctx, tx, previous); persistErr != nil {
			p.log.Error("состояние подтверждённой смены обвязки не убрано и не переписано",
				"err", errors.Join(err, persistErr), "transaction_id", id)
		} else {
			p.log.Warn("состояние подтверждённой смены обвязки не убрано, записана терминальная фаза",
				"err", err, "transaction_id", id)
		}
	}

	p.gate.unreserve(token)

	if confirmed != nil {
		close(confirmed)
	}

	p.log.Info("смена модели обвязки подтверждена", "transaction_id", id)

	return tx, nil
}

// Close останавливает окно и дожидается фоновой горутины. Состояние остаётся
// на диске.
func (p *Plane) Close() {
	p.mu.Lock()
	cancel := p.cancel
	p.mu.Unlock()

	if cancel != nil {
		cancel()
	}

	p.wg.Wait()
}

// Replay доигрывает смену обвязки, оставшуюся от прошлой жизни демона. На
// загрузке роутера служба уже подняла обвязку по неподтверждённой модели из
// UCI, и без отката она осталась бы навсегда.
func (p *Plane) Replay(ctx context.Context) error {
	data, err := p.store.ReadPlaneState(ctx)
	if errors.Is(err, config.ErrNoState) {
		return nil
	}

	if err != nil {
		return fmt.Errorf("чтение состояния обвязки: %w", err)
	}

	var state planeRecord
	if err := json.Unmarshal(data, &state); err != nil {
		return fmt.Errorf("разбор состояния обвязки: %w", err)
	}

	tx := state.Transaction
	log := p.log.With("transaction_id", tx.ID)

	switch {
	case tx.Phase == PhaseApplying:
		// Секция совпала со снимком — запись не случилась, и служба стоит на
		// прежней модели: откатывать нечего.
		if current, err := p.editor.Snapshot(ctx); err == nil && current.Equal(state.Previous) {
			log.Warn("смена обвязки оборвана до записи модели, откат не нужен")

			return p.store.ClearPlaneState(ctx)
		}

		log.Warn("смена обвязки оборвана, возвращаем прежнюю модель")
		p.begin(tx, state.Previous)
		p.rollback(ctx, log)

	case tx.Phase == PhaseAwaitingConfirm && tx.Window <= 0:
		log.Warn("окно подтверждения обвязки истекло, возвращаем прежнюю модель")
		p.begin(tx, state.Previous)
		p.rollback(ctx, log)

	case tx.Phase == PhaseAwaitingConfirm:
		log.Warn("окно подтверждения обвязки восстановлено", "window", tx.Window)
		p.begin(tx, state.Previous)
		p.restoreWindow(tx, p.gate.reserveRestored())

	default:
		if err := p.store.ClearPlaneState(ctx); err != nil {
			return fmt.Errorf("очистка завершённого состояния обвязки: %w", err)
		}
	}

	return nil
}

func (p *Plane) begin(tx Transaction, previous dataplane.Snapshot) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.current = tx
	p.previous = previous
}

// restoreWindow поднимает окно заново на срок из состояния: сколько его прошло
// до перезагрузки, узнать неоткуда, как и у Manager.restoreWindow.
func (p *Plane) restoreWindow(tx Transaction, token uint64) {
	ctx, cancel := context.WithCancel(context.Background())

	p.mu.Lock()
	p.current = tx
	p.token = token
	p.windowEndsAt = time.Now().Add(tx.Window)
	p.confirmed = make(chan struct{})
	confirmed := p.confirmed
	p.cancel = cancel
	p.mu.Unlock()

	p.wg.Add(1)

	go func() {
		defer p.wg.Done()
		defer cancel()
		defer p.gate.unreserve(token)

		p.wait(ctx, p.log.With("transaction_id", tx.ID), confirmed, tx.Window)
	}()
}

func (p *Plane) release(phase Phase, err error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.current.Phase = phase
	p.current.ReasonCode = reasonOf(err)
	p.current.Reason = err.Error()
	p.rollingBack = false
}

func (p *Plane) persist(ctx context.Context, tx Transaction, previous dataplane.Snapshot) error {
	data, err := json.Marshal(planeRecord{Transaction: tx, Previous: previous})
	if err != nil {
		return fmt.Errorf("сериализация состояния обвязки: %w", err)
	}

	return p.store.WritePlaneState(ctx, data)
}
