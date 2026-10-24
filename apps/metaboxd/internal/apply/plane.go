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
	"metabox/internal/locale"
)

// ErrDataplaneModified means the UCI section was changed after the client read
// the model; an SSH edit would otherwise be silently overwritten.
var ErrDataplaneModified = locale.New("dataplane model changed outside metabox")

// ErrDataplaneForeignService means the daemon manages a service other than the one whose init script
// reads the model; the change is rejected before the write.
var ErrDataplaneForeignService = locale.Errorf("the dataplane model is read only by the service %s", dataplane.Service)

// PlaneEditor is the dataplane model in UCI: a section snapshot, writing the model, restoring
// the snapshot, and the chains in nft.
type PlaneEditor interface {
	Snapshot(ctx context.Context) (dataplane.Snapshot, error)
	Write(ctx context.Context, m dataplane.Model) error
	Restore(ctx context.Context, snap dataplane.Snapshot) error
	Chains(ctx context.Context) ([]string, dataplane.AppliedReason, error)
}

// PlaneService is the service that brings the dataplane to the model.
type PlaneService interface {
	Reload(ctx context.Context) error
}

// PlaneStore is the applied config in which dns-in is looked up, and the state file
// of the dataplane transaction.
type PlaneStore interface {
	Read(ctx context.Context) ([]byte, error)
	ReadPlaneState(ctx context.Context) ([]byte, error)
	WritePlaneState(ctx context.Context, data []byte) error
	ClearPlaneState(ctx context.Context) error
}

// PlaneOptions are the settings of a dataplane model change.
type PlaneOptions struct {
	// Window is the confirmation window, the same as for a config apply.
	Window time.Duration
	// CycleTimeout limits the write, reload and checks, and the rollback separately.
	CycleTimeout time.Duration
	// DNS is the dns-in probe; nil means disabled.
	DNS DNSProber
	// Service is the name of the service the daemon manages: the name of its init script.
	// A model change goes only with dataplane.Service.
	Service string
	// Lang is the language of Transaction.Reason; the zero value is English.
	Lang locale.Lang
}

// planeRecord is the dataplane transaction state file: the transaction and the section snapshot
// to roll back to.
type planeRecord struct {
	Transaction
	Previous dataplane.Snapshot `json:"previous"`
}

// Plane is the owner of the dataplane model change transaction. The protocol is the same as for
// a config apply: model check, snapshot of the previous UCI section, write,
// service reload, check, confirmation window, and without confirmation the snapshot
// is restored and the service reloaded again. The apply is taken from Manager: one
// transaction runs at a time, of the config or of the dataplane.
//
// Every change has a confirmation window, without exceptions. So an ACL change
// that takes the administrator's own address out of interception is applied the same way
// and rolled back by the window without confirmation: it cuts the administrator off for no longer than the window.
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
	// confirming and confirmDone: see Manager.
	confirming  bool
	confirmDone chan struct{}
	// windowEndsAt is the monotonic stamp of the window end, in memory only; see Manager.
	windowEndsAt time.Time
	confirmed    chan struct{}
	cancel       context.CancelFunc

	wg sync.WaitGroup
}

// NewPlane assembles the dataplane transaction on top of the config apply gate. The clock
// may be omitted, then the system one is used.
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

// ForeignService means the daemon manages a service other than the one whose init script reads
// the model: Start will refuse, and the panel learns of this from GET /api/dataplane before
// the change.
func (p *Plane) ForeignService() bool {
	return p.opts.Service != dataplane.Service
}

// Current returns a snapshot of the dataplane transaction; Window is the remainder of the window.
func (p *Plane) Current() Transaction {
	p.mu.Lock()
	defer p.mu.Unlock()

	tx := p.current
	if tx.Phase == PhaseAwaitingConfirm && !p.windowEndsAt.IsZero() {
		tx.Window = max(0, time.Until(p.windowEndsAt))
	}

	return tx
}

// Start checks the model, takes the apply and moves the change into a background
// goroutine. base is the Snapshot.Sum of the section the model was built from; empty means
// a change without a check. client is the address the request came from: a change that
// takes it out of interception is noted in the log but goes through the same protocol.
func (p *Plane) Start(ctx context.Context, model dataplane.Model, base string, client netip.Addr) (Transaction, error) {
	next, err := dataplane.Normalize(model)
	if err != nil {
		return Transaction{}, err
	}

	if p.ForeignService() {
		return Transaction{}, ErrDataplaneForeignService
	}

	token, err := p.gate.reserveExclusive()
	if err != nil {
		return Transaction{}, err
	}

	previous, err := p.editor.Snapshot(ctx)
	if err != nil {
		p.gate.unreserve(token)

		return Transaction{}, fmt.Errorf("dataplane model snapshot: %w", err)
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
		log.Warn("the ACL change takes the request address out of interception; without confirmation it rolls back when the window ends",
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

// leavesClient: before the change the client address went through sing-box, and after it the
// listed mode does not list it. MAC is not compared here: it cannot be learned from the request
// address.
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
	log.Info("dataplane model change started",
		"enabled", next.Enabled, "acl_mode", next.AccessMode, "dns_port", next.DNSPort)

	if err := p.apply(ctx, log, previous, next); err != nil {
		log.Error("dataplane model change did not go through", "err", err)
		p.release(PhaseFailed, err)
		p.rollback(context.WithoutCancel(ctx), log)

		return
	}

	p.await(ctx, log, confirmed)
}

// apply writes the model, makes the service reread it and checks the result: the interception
// chains stand exactly when the model is enabled, and on a dns-in port change
// or dataplane enabling, dnsmasq got an answer from dns-in on the new port.
func (p *Plane) apply(ctx context.Context, log *slog.Logger, previous dataplane.Snapshot, next dataplane.Model) error {
	ctx, cancel := context.WithTimeout(ctx, p.opts.CycleTimeout)
	defer cancel()

	if err := p.editor.Write(ctx, next); err != nil {
		return stepFailed(ReasonWriteFailed, locale.Errorf("write dataplane model: %w", err))
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

// checkChains compares the chains in nft with the model. nft unavailable means a skip with
// a warning, as in the config apply healthcheck. Chains left
// after disabling are a reload failure: the service did not bring the dataplane to the model.
func (p *Plane) checkChains(ctx context.Context, log *slog.Logger, enabled bool) error {
	chains, reason, err := p.editor.Chains(ctx)

	switch {
	case err != nil:
		return stepFailed(ReasonInterceptionMissing, locale.Errorf("check interception: %w", err))
	case reason != "":
		log.Warn("interception not checked after reload: nft unavailable", "applied_reason", reason)

		return nil
	case !enabled && len(chains) > 0:
		return stepFailed(ReasonRestartFailed, locale.New("interception chains remain after the dataplane was turned off"))
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
		return stepFailed(ReasonInterceptionMissing, locale.Errorf("interception chains missing in nft: %v", missing))
	}

	return nil
}

// probeDNS waits until sing-box is up (the service reload restarts it)
// and sends a probe query to dns-in on the model port. No dns-in on this port in
// the config is a failure: dnsmasq sends queries to an empty port.
func (p *Plane) probeDNS(ctx context.Context, port int) error {
	cfg, err := p.store.Read(ctx)
	if err != nil {
		return locale.Errorf("config for the DNS probe: %w", err)
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
		return locale.Errorf("no dns-in on port %d in the config", port)
	}

	return p.opts.DNS.Probe(ctx, inbound)
}

// await opens the confirmation window; the window record reaches the disk before the
// phase does, for the reason given in Manager.await.
func (p *Plane) await(ctx context.Context, log *slog.Logger, confirmed <-chan struct{}) {
	p.mu.Lock()
	tx := p.current
	previous := p.previous
	p.mu.Unlock()

	tx.Phase = PhaseAwaitingConfirm
	if err := p.persist(ctx, tx, previous); err != nil {
		log.Error("dataplane confirmation window state not saved", "err", err)
	}

	p.mu.Lock()
	p.current.Phase = PhaseAwaitingConfirm
	p.windowEndsAt = time.Now().Add(p.opts.Window)
	p.mu.Unlock()

	log.Info("dataplane model applied, confirmation window open", "window", p.opts.Window)

	p.wait(ctx, log, confirmed, p.opts.Window)
}

// wait holds the window: confirmation, daemon stop or a timer rollback.
func (p *Plane) wait(ctx context.Context, log *slog.Logger, confirmed <-chan struct{}, window time.Duration) {
	select {
	case <-confirmed:
	case <-ctx.Done():
		// The state stays on disk, the window is replayed at the next start.
		log.Warn("dataplane confirmation window interrupted by daemon shutdown")
	case <-p.clock.After(window):
		if !p.beginRollback() {
			return
		}

		log.Warn("no confirmation, restoring the previous dataplane model")
		p.rollback(context.WithoutCancel(ctx), log)
	}
}

// beginRollback is Manager.beginRollback for the dataplane change.
func (p *Plane) beginRollback() bool {
	for {
		p.mu.Lock()

		if p.current.Phase != PhaseAwaitingConfirm {
			p.mu.Unlock()

			return false
		}

		if !p.confirming {
			p.rollingBack = true
			p.mu.Unlock()

			return true
		}

		done := p.confirmDone
		p.mu.Unlock()

		<-done
	}
}

// rollback restores the section snapshot and makes the service reread it. A failure leaves
// the state on disk: the next daemon start will try the rollback again.
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
		log.Error("dataplane model rollback did not go through", "err", err)
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
		log.Error("state of the rolled back dataplane change not removed", "err", err)
	}

	p.gate.unreserve(token)

	log.Info("previous dataplane model restored")
}

// Confirm closes the dataplane change confirmation window. The state on disk is made
// terminal before the call returns, as in Manager.Confirm; ErrConfirmNotSaved leaves the
// window open.
func (p *Plane) Confirm(ctx context.Context, id string) (Transaction, error) {
	p.mu.Lock()

	if p.current.ID != id {
		p.mu.Unlock()

		return Transaction{}, ErrUnknownTransaction
	}

	if p.current.Phase != PhaseAwaitingConfirm || p.rollingBack || p.confirming {
		p.mu.Unlock()

		return Transaction{}, ErrNothingToConfirm
	}

	p.confirming = true
	done := make(chan struct{})
	p.confirmDone = done
	tx := p.current
	tx.Phase = PhaseConfirmed
	tx.Window = 0
	previous := p.previous
	p.mu.Unlock()

	// The order is the same as in Manager.Confirm: the state is removed before
	// the apply is released, and an unremoved one is replaced by the terminal phase.
	kept, err := settleState(ctx, p.store.ClearPlaneState, func(ctx context.Context) error {
		return p.persist(ctx, tx, previous)
	})

	p.mu.Lock()
	p.confirming = false

	if err != nil {
		p.mu.Unlock()
		close(done)

		return Transaction{}, err
	}

	p.current = tx
	token := p.token
	confirmed := p.confirmed
	p.confirmed = nil
	p.mu.Unlock()
	close(done)

	p.gate.unreserve(token)

	if confirmed != nil {
		close(confirmed)
	}

	if kept != nil {
		p.log.Warn("state of the confirmed dataplane change not removed, the terminal phase is written",
			"err", kept, "transaction_id", id)
	}

	p.log.Info("dataplane model change confirmed", "transaction_id", id)

	return tx, nil
}

// Close stops the window and waits for the background goroutine. The state stays
// on disk.
func (p *Plane) Close() {
	p.mu.Lock()
	cancel := p.cancel
	p.mu.Unlock()

	if cancel != nil {
		cancel()
	}

	p.wg.Wait()
}

// Replay replays a dataplane change left from the previous daemon lifetime. On
// router boot the service has already raised the dataplane by the unconfirmed model from
// UCI, and without a rollback it would stay forever.
func (p *Plane) Replay(ctx context.Context) error {
	data, err := p.store.ReadPlaneState(ctx)
	if errors.Is(err, config.ErrNoState) {
		return nil
	}

	if err != nil {
		return fmt.Errorf("read dataplane state: %w", err)
	}

	var state planeRecord
	if err := json.Unmarshal(data, &state); err != nil {
		return fmt.Errorf("parse dataplane state: %w", err)
	}

	tx := state.Transaction
	log := p.log.With("transaction_id", tx.ID)

	switch {
	case tx.Phase == PhaseApplying:
		// The section matched the snapshot: the write did not happen, and the service stands on
		// the previous model: nothing to roll back.
		if current, err := p.editor.Snapshot(ctx); err == nil && current.Equal(state.Previous) {
			log.Warn("dataplane change interrupted before the model write, no rollback needed")

			return p.store.ClearPlaneState(ctx)
		}

		log.Warn("dataplane change interrupted, restoring the previous model")
		p.begin(tx, state.Previous)
		p.rollback(ctx, log)

	case tx.Phase == PhaseAwaitingConfirm && tx.Window <= 0:
		log.Warn("dataplane confirmation window expired, restoring the previous model")
		p.begin(tx, state.Previous)
		p.rollback(ctx, log)

	case tx.Phase == PhaseAwaitingConfirm:
		log.Warn("dataplane confirmation window restored", "window", tx.Window)
		p.begin(tx, state.Previous)
		p.restoreWindow(tx, p.gate.reserveRestored())

	default:
		if err := p.store.ClearPlaneState(ctx); err != nil {
			return fmt.Errorf("clear finished dataplane state: %w", err)
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

// restoreWindow raises the window again for the period from the state: how much of it passed
// before the reboot cannot be learned, as with Manager.restoreWindow.
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
	p.current.Reason = locale.Message(p.opts.Lang, err)
	p.rollingBack = false
}

func (p *Plane) persist(ctx context.Context, tx Transaction, previous dataplane.Snapshot) error {
	data, err := json.Marshal(planeRecord{Transaction: tx, Previous: previous})
	if err != nil {
		return fmt.Errorf("encode dataplane state: %w", err)
	}

	return p.store.WritePlaneState(ctx, data)
}
