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
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/dataplane"
	"metabox/internal/locale"
)

// ErrDataplaneModified means the UCI section was changed after the client read
// the model; an SSH edit would otherwise be silently overwritten.
var ErrDataplaneModified = locale.New("dataplane model changed outside metabox")

// PlaneEditor is the dataplane model in UCI: a section snapshot, writing the model, restoring
// the snapshot, and the chains in nft.
type PlaneEditor interface {
	Snapshot(ctx context.Context) (dataplane.Snapshot, error)
	Write(ctx context.Context, m dataplane.Model) error
	Restore(ctx context.Context, snap dataplane.Snapshot) error
	Chains(ctx context.Context) ([]string, dataplane.AppliedReason, error)
}

// PlaneService is the service that brings the dataplane to the model. Reload restarts the
// core, so the rollback checks the process the same way as the config rollback.
type PlaneService interface {
	Reload(ctx context.Context) error
	CheckDataplane(ctx context.Context) error
	PID(ctx context.Context) (int, error)
	Crash(ctx context.Context) (string, error)
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
	window

	editor  PlaneEditor
	service PlaneService
	store   PlaneStore
	health  Health
	opts    PlaneOptions

	// previous and token are guarded by mu.
	previous dataplane.Snapshot
	token    uint64
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

	p := &Plane{
		window: window{gate: gate, clock: clock, log: log, lang: opts.Lang, span: opts.Window, text: planeLog},
		editor: editor, service: service, store: store, health: health, opts: opts,
	}
	p.subject = p

	return p
}

var planeLog = windowLog{
	opened:             "dataplane model applied, confirmation window open",
	notSaved:           "dataplane confirmation window state not saved",
	interrupted:        "dataplane confirmation window interrupted by daemon shutdown",
	restoredStopped:    "restored dataplane window interrupted by daemon shutdown",
	expired:            "no confirmation, restoring the previous dataplane model",
	confirmed:          "dataplane model change confirmed",
	confirmedKept:      "state of the confirmed dataplane change not removed, the terminal phase is written",
	unwritten:          "dataplane change interrupted before the model write, no rollback needed",
	interruptedApply:   "dataplane change interrupted, restoring the previous model",
	windowExpired:      "dataplane confirmation window expired, restoring the previous model",
	rollbackUnfinished: "dataplane rollback interrupted in the confirmation window, finishing it",
	windowRestored:     "dataplane confirmation window restored",
	clearUnwritten:     "clear interrupted dataplane state",
	clearFinished:      "clear finished dataplane state",
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
// listed mode does not list it or excludes it. MAC is not compared here: it cannot be learned
// from the request address.
func leavesClient(prev, next dataplane.Model, client netip.Addr) bool {
	if !client.IsValid() || !prev.Enabled || !next.Enabled || next.AccessMode != dataplane.AccessListed {
		return false
	}

	client = client.Unmap()
	before := prev.AccessMode == dataplane.AccessAll || listed(prev, client)

	return before && !listed(next, client)
}

func listed(m dataplane.Model, addr netip.Addr) bool {
	return covers(m.SourceIP, addr) && !covers(m.SourceIPExclude, addr)
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
		// Cancelled by Close: see Manager.interrupted.
		if ctx.Err() != nil {
			log.Warn("dataplane model change interrupted by daemon shutdown, the transaction is replayed at the next start")

			return
		}

		log.Error("dataplane model change did not go through", "err", err)
		p.release(PhaseFailed, err)
		p.rollback(context.WithoutCancel(ctx), log)

		return
	}

	p.await(ctx, log, confirmed)
}

// apply writes the model, makes the service reread it and checks the result: the interception
// chains stand exactly when the model is enabled, with it enabled the service finds its
// fwmark rule, route and dnsmasq fragment in place, and on a dns-in port change
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

	if next.Enabled {
		if err := p.service.CheckDataplane(ctx); err != nil {
			return stepFailed(ReasonInterceptionMissing, err)
		}
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

// rollback restores the section snapshot and makes the service reread it. A failure leaves
// the state on disk: the next daemon start will try the rollback again.
func (p *Plane) rollback(ctx context.Context, log *slog.Logger) {
	ctx, cancel := context.WithTimeout(ctx, p.opts.CycleTimeout)
	defer cancel()

	p.mu.Lock()
	previous := p.previous
	p.mu.Unlock()

	restoreErr := p.editor.Restore(ctx, previous)

	var (
		reloadErr, upErr error
		dropped          []string
	)
	if restoreErr == nil {
		before, pidErr := p.service.PID(ctx)

		reloadErr = p.service.Reload(ctx)
		if reloadErr == nil {
			upErr = coreUp(ctx, log, p.service, p.health, p.store, p.gate.opts.ProcessInterval, before, pidErr)
		}

		if poisoned, ok := errors.AsType[*poisonedError](upErr); ok {
			dropped, upErr = p.gate.recover(context.WithoutCancel(ctx), log, poisoned)
		}
	}

	if err := errors.Join(restoreErr, reloadErr, upErr); err != nil {
		log.Error("dataplane model rollback did not go through", "err", err)
		p.release(PhaseFailed, stepFailed(ReasonRollbackFailed, err))

		return
	}

	p.mu.Lock()
	p.current.Phase = PhaseRolledBack
	p.current.Reason = recovered(p.lang, p.current.Reason, dropped)
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

func (p *Plane) readState(ctx context.Context) (Transaction, error) {
	data, err := p.store.ReadPlaneState(ctx)
	if err != nil {
		return Transaction{}, fmt.Errorf("read dataplane state: %w", err)
	}

	var state planeRecord
	if err := json.Unmarshal(data, &state); err != nil {
		return Transaction{}, fmt.Errorf("parse dataplane state: %w", err)
	}

	p.mu.Lock()
	p.previous = state.Previous
	p.mu.Unlock()

	return state.Transaction, nil
}

func (p *Plane) writeState(ctx context.Context, tx Transaction) error {
	p.mu.Lock()
	previous := p.previous
	p.mu.Unlock()

	return p.persist(ctx, tx, previous)
}

func (p *Plane) clearState(ctx context.Context) error { return p.store.ClearPlaneState(ctx) }

// written: a section that matches the snapshot means the write did not happen, and the
// service stands on the previous model. A failed read counts as written.
func (p *Plane) written(ctx context.Context, _ Transaction) bool {
	p.mu.Lock()
	previous := p.previous
	p.mu.Unlock()

	current, err := p.editor.Snapshot(ctx)

	return err != nil || !current.Equal(previous)
}

func (p *Plane) reverted(ctx context.Context, _ Transaction) bool {
	p.mu.Lock()
	previous := p.previous
	p.mu.Unlock()

	return p.rolledBackInUCI(ctx, previous)
}

func (p *Plane) restored(_ Transaction, token uint64) { p.token = token }

func (p *Plane) free() { p.gate.unreserve(p.token) }

// rolledBackInUCI reports whether the section already holds the snapshot the transaction
// rolls back to. The record keeps no target model, so a change that left the section as it
// was also counts: finishing its rollback writes back the same section. A failed read counts
// as not rolled back: the restored window still ends in a rollback without confirmation.
func (p *Plane) rolledBackInUCI(ctx context.Context, previous dataplane.Snapshot) bool {
	current, err := p.editor.Snapshot(ctx)
	if err != nil {
		p.log.Warn("dataplane section comparison on replay did not go through", "err", err)

		return false
	}

	return current.Equal(previous)
}

func (p *Plane) persist(ctx context.Context, tx Transaction, previous dataplane.Snapshot) error {
	data, err := json.Marshal(planeRecord{Transaction: tx, Previous: previous})
	if err != nil {
		return fmt.Errorf("encode dataplane state: %w", err)
	}

	return p.store.WritePlaneState(ctx, data)
}
