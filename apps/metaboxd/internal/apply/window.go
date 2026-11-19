package apply

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"metabox/internal/config"
	"metabox/internal/locale"
)

// subject is what a transaction changes: the config with its list files, or the dataplane
// model. window runs the confirmation protocol and asks the subject about everything that
// touches the disk.
type subject interface {
	// readState reads the journal; config.ErrNoState under the error means there is none.
	readState(ctx context.Context) (Transaction, error)
	writeState(ctx context.Context, tx Transaction) error
	clearState(ctx context.Context) error
	// written reports whether an applying transaction from the journal managed to touch the
	// disk; reverted, whether an awaiting one is already back on its rollback target.
	written(ctx context.Context, tx Transaction) bool
	reverted(ctx context.Context, tx Transaction) bool
	rollback(ctx context.Context, log *slog.Logger)
	// restored and free run under window.mu: restored when a window from the journal is
	// raised again under the apply ownership token, free when Confirm closes the window.
	// For Manager window.mu is the gate's own mutex, so they must not lock it; Plane takes
	// the gate's mutex inside its own, the only nesting order between them.
	restored(tx Transaction, token uint64)
	free()
}

// windowLog is the subject's wording of the protocol events in the log and of the replay
// error prefixes.
type windowLog struct {
	opened             string
	notSaved           string
	interrupted        string
	restoredStopped    string
	expired            string
	confirmed          string
	confirmedKept      string
	unwritten          string
	interruptedApply   string
	windowExpired      string
	rollbackUnfinished string
	windowRestored     string
	clearUnwritten     string
	clearFinished      string
}

// window is the confirmation half of a transaction shared by the config apply and the
// dataplane change: the transaction snapshot, the window with its timer rollback,
// Confirm, Close and the replay of the journal. One transaction runs at a time: gate is
// the apply ownership both subjects take.
type window struct {
	subject subject
	gate    *Manager
	clock   Clock
	log     *slog.Logger
	lang    locale.Lang
	span    time.Duration
	text    windowLog

	mu sync.Mutex
	// rollingBack closes Confirm for the duration of the rollback: the phase stays
	// awaiting_confirm until the rollback ends, and without this flag a confirmation
	// would wedge into a rollback already in progress.
	rollingBack bool
	// confirming closes a second Confirm and holds the timer rollback while the
	// terminal state is being written: the outcome of that write decides whether
	// there is anything left to roll back. confirmDone closes when it is known.
	confirming  bool
	confirmDone chan struct{}
	current     Transaction
	// windowEndsAt is when the confirmation window closes. Stored as a Go monotonic
	// stamp and in memory only: the disk gets the duration, because the
	// router has no real-time clock and between daemon lifetimes there is nothing to compare
	// the stamp with.
	windowEndsAt time.Time
	confirmed    chan struct{}
	cancel       context.CancelFunc

	wg sync.WaitGroup
}

// Current returns a snapshot of the current transaction. An empty phase means that
// there were no transactions in this daemon lifetime.
//
// Window in the snapshot is the remainder of the window, not its duration: the panel shows this
// number to the user, and after a page reload a full sixty seconds
// would be a promise the daemon does not make.
func (w *window) Current() Transaction {
	w.mu.Lock()
	defer w.mu.Unlock()

	tx := w.current
	if tx.Phase == PhaseAwaitingConfirm && !w.windowEndsAt.IsZero() {
		tx.Window = max(0, time.Until(w.windowEndsAt))
	}

	return tx
}

// Confirm closes the confirmation window: the connection is alive, no rollback is needed.
// The state on disk is made terminal before the call returns, under a context detached
// from the request: a client that drops the request must not leave awaiting_confirm on
// disk, which Replay would roll back after a restart. ErrConfirmNotSaved means the disk
// refused both the removal and the terminal record; the window stays open.
func (w *window) Confirm(ctx context.Context, id string) (Transaction, error) {
	w.mu.Lock()

	if w.current.ID != id {
		w.mu.Unlock()

		return Transaction{}, ErrUnknownTransaction
	}
	if w.current.Phase != PhaseAwaitingConfirm || w.rollingBack || w.confirming {
		w.mu.Unlock()

		return Transaction{}, ErrNothingToConfirm
	}

	w.confirming = true
	done := make(chan struct{})
	w.confirmDone = done
	tx := w.current
	tx.Phase = PhaseConfirmed
	tx.Window = 0
	w.mu.Unlock()

	// The state is removed before the apply is released: released earlier, it lets in
	// the next Start, and the removal would erase its state file. The response
	// goes after the cleanup, so "confirmed and immediately applied" does not
	// run into a busy apply.
	kept, err := settleState(ctx, w.subject.clearState, func(ctx context.Context) error {
		return w.subject.writeState(ctx, tx)
	})

	w.mu.Lock()
	w.confirming = false

	if err != nil {
		w.mu.Unlock()
		close(done)

		return Transaction{}, err
	}

	w.current = tx
	confirmed := w.confirmed
	w.confirmed = nil
	w.subject.free()
	w.mu.Unlock()
	close(done)

	if confirmed != nil {
		close(confirmed)
	}

	if kept != nil {
		w.log.Warn(w.text.confirmedKept, "err", kept, "transaction_id", id)
	}

	w.log.Info(w.text.confirmed, "transaction_id", id)

	return tx, nil
}

// settleState makes the state file of a confirmed transaction terminal: removed, or
// rewritten with the terminal phase when the removal fails, since Replay only removes a
// terminal phase while a leftover awaiting_confirm would roll back the confirmed config.
// kept is the removal failure when the terminal record stands in its place. The write
// runs detached from the request with its own ceiling: it must finish even when the
// client is gone.
func settleState(ctx context.Context, remove, persist func(context.Context) error) (kept, err error) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), stateTimeout)
	defer cancel()

	clearErr := remove(ctx)
	if clearErr == nil {
		return nil, nil
	}

	if err := persist(ctx); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrConfirmNotSaved, errors.Join(clearErr, err))
	}

	return clearErr, nil
}

// Close cancels the cycle at once and waits for the background goroutine. It does not
// give the current step time to finish: procd sends SIGKILL five seconds after SIGTERM,
// while a step may take the whole cycle timeout, so a grace period would only move the
// kill into the step. Whatever the cycle was doing, the state stays on disk as it is: an
// interrupted step or an unclosed window is replayed at the next start.
func (w *window) Close() {
	w.mu.Lock()
	cancel := w.cancel
	w.mu.Unlock()

	if cancel != nil {
		cancel()
	}

	w.wg.Wait()
}

func (w *window) begin(tx Transaction) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.current = tx
	w.confirmed = make(chan struct{})
}

// replayRollback shows a replayed transaction already rolling back: Confirm gets a refusal while
// the replay runs beside the server.
func (w *window) replayRollback(tx Transaction) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.current = tx
	w.confirmed = make(chan struct{})
	w.rollingBack = true
}

func (w *window) release(phase Phase, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.current.Phase = phase
	w.current.ReasonCode = reasonOf(err)
	w.current.Reason = locale.Message(w.lang, err)
	w.rollingBack = false
}

// await opens the confirmation window and holds it. Without confirmation in time the
// subject is rolled back.
func (w *window) await(ctx context.Context, log *slog.Logger, confirmed <-chan struct{}) {
	w.mu.Lock()
	tx := w.current
	w.mu.Unlock()

	// The window record reaches the disk before the phase opens Confirm: a Confirm that
	// slipped in between would make the state terminal, and this write would then
	// put awaiting_confirm back over it for the replay to roll back.
	tx.Phase = PhaseAwaitingConfirm
	if err := w.subject.writeState(ctx, tx); err != nil && ctx.Err() == nil {
		log.Error(w.text.notSaved, "err", err)
	}

	w.mu.Lock()
	w.current.Phase = PhaseAwaitingConfirm
	w.windowEndsAt = time.Now().Add(w.span)
	w.mu.Unlock()

	log.Info(w.text.opened, "window", w.span)

	w.wait(ctx, log, confirmed, w.span, w.text.interrupted)
}

// wait waits for confirmation, a daemon stop or the end of the window. A stop leaves the
// state on disk, and the window is replayed at the next start.
func (w *window) wait(ctx context.Context, log *slog.Logger, confirmed <-chan struct{}, d time.Duration, stopped string) {
	select {
	case <-confirmed:
	case <-ctx.Done():
		log.Warn(stopped)
	case <-w.clock.After(d):
		if !w.beginRollback() {
			return
		}

		log.Warn(w.text.expired)
		w.subject.rollback(context.WithoutCancel(ctx), log)
	}
}

// beginRollback closes the window before the rollback touches the disk: from this
// moment Confirm gets a refusal. False means the confirmation got in
// before the timer and there is nothing to roll back. A Confirm caught writing the
// terminal state is waited for: its outcome decides.
func (w *window) beginRollback() bool {
	for {
		w.mu.Lock()

		if w.current.Phase != PhaseAwaitingConfirm {
			w.mu.Unlock()

			return false
		}

		if !w.confirming {
			w.rollingBack = true
			w.mu.Unlock()

			return true
		}

		done := w.confirmDone
		w.mu.Unlock()

		<-done
	}
}

// Replay replays a transaction left from the previous daemon lifetime. Called
// at start: without it, a power loss within the confirmation window would leave
// the device on the unconfirmed change forever.
func (w *window) Replay(ctx context.Context) error {
	tx, err := w.subject.readState(ctx)
	if errors.Is(err, config.ErrNoState) {
		return nil
	}
	if err != nil {
		return err
	}

	log := w.log.With("transaction_id", tx.ID)

	switch {
	case tx.Phase == PhaseApplying:
		// The cycle broke off before reaching the confirmation window. A rollback is needed only
		// if the change managed to be written: otherwise the device has the previous one, and
		// the rollback target may be left from a previous transaction.
		if !w.subject.written(ctx, tx) {
			log.Warn(w.text.unwritten)

			return wrap(w.text.clearUnwritten, w.subject.clearState(ctx))
		}

		log.Warn(w.text.interruptedApply)
		w.replayRollback(tx)
		w.subject.rollback(ctx, log)

	case tx.Phase == PhaseAwaitingConfirm && tx.Window <= 0:
		log.Warn(w.text.windowExpired)
		w.replayRollback(tx)
		w.subject.rollback(ctx, log)

	case tx.Phase == PhaseAwaitingConfirm && w.subject.reverted(ctx, tx):
		// A window rollback broke off after the restore and before the state was cleared:
		// a restored window would let Confirm keep the previous state as the change.
		log.Warn(w.text.rollbackUnfinished)
		w.replayRollback(tx)
		w.subject.rollback(ctx, log)

	case tx.Phase == PhaseAwaitingConfirm:
		log.Warn(w.text.windowRestored, "window", tx.Window)
		w.restoreWindow(tx, w.gate.reserveRestored())

	default:
		return wrap(w.text.clearFinished, w.subject.clearState(ctx))
	}

	return nil
}

func wrap(prefix string, err error) error {
	if err == nil {
		return err
	}

	return fmt.Errorf("%s: %w", prefix, err)
}

// restoreWindow raises the timer again for the period from the state. How much of it
// passed before the reboot cannot be learned: the router has no real-time clock.
// The property "no confirmation, rollback" is preserved, and the user
// gets one more window to confirm the connection.
func (w *window) restoreWindow(tx Transaction, token uint64) {
	ctx, cancel := context.WithCancel(context.Background())

	// The transaction and its cancel are set under one lock: between two
	// sections a daemon stop would see the new window with the old cancel and
	// interrupt the wrong thing.
	w.mu.Lock()
	w.current = tx
	w.windowEndsAt = time.Now().Add(tx.Window)
	w.subject.restored(tx, token)
	w.confirmed = make(chan struct{})
	confirmed := w.confirmed
	w.cancel = cancel
	w.mu.Unlock()

	w.wg.Add(1)

	go func() {
		defer w.wg.Done()
		defer cancel()
		defer w.gate.unreserve(token)

		w.wait(ctx, w.log.With("transaction_id", tx.ID), confirmed, tx.Window, w.text.restoredStopped)
	}()
}
