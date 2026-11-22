package apply

import (
	"context"
	"errors"
	"log/slog"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"metabox/internal/cachefile"
	"metabox/internal/clashapi"
	"metabox/internal/locale"
)

// Cache is the sing-box cache file the recovery edits. The interface is declared here, at the
// consumer.
type Cache interface {
	// Drop deletes the cached subscription of tag from the file at path, in the bucket of
	// cacheID. It returns cachefile.ErrNoEntry, ErrLocked or ErrUnreadable when it cannot.
	Drop(ctx context.Context, path, cacheID, tag string) error
	// MoveAside renames the whole file next to itself and returns the new path.
	MoveAside(ctx context.Context, path string) (string, error)
}

// serviceWatch is how long a start from the panel is watched, counted from the request: the
// panel gives up on a request after 15 seconds, and the core reads its cache before anything
// else and fails within a second or two.
const serviceWatch = 8 * time.Second

// repair is what the recovery changed in the cache file.
type repair struct {
	// dropped are the subscriptions whose entries were deleted.
	dropped []string
	// movedTo is where the whole file went when it did not open; empty when it stayed.
	movedTo string
}

// repairCache drops the cached subscription the core crashed on and starts the core again. A core
// that crashes on another provider gets the same treatment; the same provider twice ends the
// recovery, so the rounds stop when the bucket has no more keys the core names. Called with the
// apply held; returns what was changed even when the recovery failed later.
func (m *Manager) repairCache(ctx context.Context, log *slog.Logger, poisoned *poisonedError) (repair, error) {
	m.mu.Lock()
	m.pending = nil
	m.mu.Unlock()

	if m.opts.Cache == nil {
		return repair{}, locale.Errorf("sing-box exits on the saved subscription %q: %s", poisoned.tag, poisoned.reason)
	}

	ctx, cancel := context.WithTimeout(ctx, m.opts.CycleTimeout)
	defer cancel()

	data, err := m.store.Read(ctx)
	if err != nil {
		return repair{}, locale.Errorf("read the config for the cache file: %w", err)
	}

	cache, err := clashapi.ReadCacheFile(data)
	if err != nil {
		return repair{}, err
	}

	if !cache.Enabled || !cache.StoreSubscriptions {
		return repair{}, locale.Errorf("sing-box exits on the saved subscription %q, but subscriptions are not cached in this config (store_subscriptions is off), so the daemon cannot repair it", poisoned.tag)
	}

	path := m.CachePath(ctx, cache.Path)

	var done repair

	for {
		if slices.Contains(done.dropped, poisoned.tag) {
			return done, locale.Errorf("sing-box still exits on the saved subscription %q: %s", poisoned.tag, poisoned.reason)
		}

		from := snapshot(ctx, m.service)

		movedTo, err := m.dropEntry(ctx, log, path, cache.CacheID, poisoned.tag)
		if err != nil {
			return done, err
		}

		done.dropped = append(done.dropped, poisoned.tag)
		if movedTo != "" {
			done.movedTo = movedTo
		} else {
			log.Warn("cached subscription dropped: sing-box exited on it", "provider", poisoned.tag, "cache_file", path)
		}

		// The core was halted: any process that comes up is the new one.
		from.pid = 0

		upErr := coreUp(ctx, log, m.service, m.health, m.store, m.opts.ProcessInterval, from, false)

		next, ok := errors.AsType[*poisonedError](upErr)
		if !ok || movedTo != "" {
			return done, upErr
		}

		poisoned = next
	}
}

// dropEntry stops the sing-box process, deletes the entry and starts the process again. A file
// that is not a bbolt database goes aside whole and its new path is returned: the core cannot
// have read the entry from it either, unless the two bbolt implementations disagree, and then
// nothing short of a fresh file brings the core back. The start runs even when the delete did
// not: the core must not stay stopped because of the daemon, and it runs detached so a daemon
// shutdown does not leave it so either.
func (m *Manager) dropEntry(ctx context.Context, log *slog.Logger, path, cacheID, tag string) (string, error) {
	if err := m.service.Halt(ctx); err != nil {
		return "", locale.Errorf("stop sing-box before editing the cache file: %w", err)
	}

	m.awaitDown(ctx)

	var movedTo string

	dropErr := m.opts.Cache.Drop(ctx, path, cacheID, tag)
	if errors.Is(dropErr, cachefile.ErrUnreadable) {
		aside, err := m.opts.Cache.MoveAside(ctx, path)
		if err == nil {
			movedTo = aside
			log.Warn("cache file renamed: it does not open as a database", "cache_file", path, "moved_to", aside, "err", dropErr)
		}

		dropErr = err
	}

	if dropErr != nil {
		dropErr = locale.Errorf("could not remove subscription %q from the cache file (the subscription stays in the config): %w", tag, dropErr)
	}

	startCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), stateTimeout)
	defer cancel()

	if err := m.service.Start(startCtx); err != nil {
		return movedTo, errors.Join(dropErr, locale.Errorf("sing-box did not start after the cache file was repaired: %w", err))
	}

	return movedTo, dropErr
}

// awaitDown waits until procd reports no process. Without procd there is nothing to ask: the
// lock timeout of the cache file covers a process that is still exiting.
func (m *Manager) awaitDown(ctx context.Context) {
	ticker := time.NewTicker(m.opts.ProcessInterval)
	defer ticker.Stop()

	for {
		pid, err := m.service.PID(ctx)
		if err != nil || pid == 0 {
			return
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// CachePath resolves the cache file the way the fork does: a relative path from the working
// directory of the service, which the metabox service sets to the config directory.
func (m *Manager) CachePath(ctx context.Context, path string) string {
	if filepath.IsAbs(path) {
		return path
	}

	workdir := m.opts.ConfigDir

	if launch, err := m.service.Launch(ctx); err == nil && launch.Workdir != "" {
		workdir = launch.Workdir
	}

	return filepath.Join(workdir, path)
}

// recovered is the transaction reason after a rollback that changed the cache file: the user
// sees what the daemon changed on the device without being asked.
func recovered(l locale.Lang, reason string, done repair) string {
	if len(done.dropped) == 0 {
		return reason
	}

	quoted := make([]string, len(done.dropped))
	for i, tag := range done.dropped {
		quoted[i] = strconv.Quote(tag)
	}

	tags := strings.Join(quoted, ", ")

	var note string
	if done.movedTo != "" {
		note = locale.Sprintf(l, "sing-box could not start on the saved subscription %s, and the cache file did not open. The daemon renamed the file to %s; sing-box downloads subscriptions and rule sets again", tags, done.movedTo)
	} else {
		note = locale.Sprintf(l, "sing-box could not start on the saved subscription %s. The daemon deleted its entry from the cache file; the next subscription update downloads it again", tags)
	}

	if reason == "" {
		return note
	}

	return reason + "\n" + note
}

// Watch runs a start or restart of the service from the panel and watches the core for a
// crash on a cached subscription. It returns only the error of start, within the time the
// panel waits for a request: the panel reads the state after it. The repair runs in the
// background under the apply, so it neither holds the request nor ends with it; a healthy or
// stopped service never refuses an Apply.
func (m *Manager) Watch(ctx context.Context, start func(context.Context) error) error {
	watchCtx, cancel := context.WithTimeout(ctx, serviceWatch)
	defer cancel()

	from := snapshot(watchCtx, m.service)

	if err := start(ctx); err != nil {
		return err
	}

	upErr := coreUp(watchCtx, m.log, m.service, m.health, m.store, m.opts.ProcessInterval, from, true)
	if poisoned, ok := errors.AsType[*poisonedError](upErr); ok {
		m.repairLater(poisoned, from.mark)
	}

	return nil
}

// RecoverAtStart repairs a core that crashes on a cached subscription when the daemon starts,
// after the replays: the router may have rebooted into the crash loop. A service procd does not
// know, stopped by the user or never started, is left alone. A service procd knows with no
// process is started first: a daemon killed in the middle of a repair leaves the core halted,
// and procd stops respawning a core that keeps crashing; the start gives a fresh crash to
// read, since the one left in the log may be older than the last repair.
func (m *Manager) RecoverAtStart(ctx context.Context) {
	from := snapshot(ctx, m.service)
	if from.pidErr != nil {
		return
	}

	if from.pid == 0 {
		// An Apply right after boot writes the config and restarts the core: a start in the
		// middle of it would race its health check, and the Apply brings the core up anyway.
		token, err := m.reserveExclusive()
		if err != nil {
			return
		}

		m.log.Warn("sing-box is known to procd but has no process, starting it")

		startErr := m.service.Start(ctx)
		m.unreserve(token)

		if startErr != nil {
			m.log.Error("sing-box not started", "err", startErr)

			return
		}
	}

	waitCtx, cancel := context.WithTimeout(ctx, m.opts.CycleTimeout)
	defer cancel()

	from.pid = 0

	upErr := coreUp(waitCtx, m.log, m.service, m.health, m.store, m.opts.ProcessInterval, from, false)
	if poisoned, ok := errors.AsType[*poisonedError](upErr); ok {
		m.recoverHeld(ctx, poisoned, from.mark)
	}
}

// Settle replays the unfinished transaction and dataplane change from the previous daemon
// lifetime and then checks the core for a crash on its cache file. It returns at once and
// works in the background: a rollback waits for the core up to the cycle timeout, and the
// panel must answer while sing-box is down. The apply is taken before Settle returns, so no
// Start gets in ahead of a replay; a window raised from the journal takes it over. The
// channel closes when the work is done; cancelling ctx ends it early and leaves the journals
// for the next start.
func (m *Manager) Settle(ctx context.Context, plane *Plane) <-chan struct{} {
	token := m.reserveRestored()
	done := make(chan struct{})

	go func() {
		defer close(done)

		if err := m.Replay(ctx); err != nil {
			m.log.Error("unfinished transaction not replayed", "err", err)
		}

		if err := plane.Replay(ctx); err != nil {
			m.log.Error("unfinished dataplane change not replayed", "err", err)
		}

		m.unreserve(token)
		m.RecoverAtStart(ctx)
	}()

	return done
}

// pendingRepair is a crash on a cached subscription seen while an Apply or a dataplane change
// held the apply. Its rollback repairs the core; its Confirm leaves the crash, so the repair
// runs after it.
type pendingRepair struct {
	poisoned *poisonedError
	mark     string
}

// recoverHeld takes the apply for the repair and runs it. While an Apply or a dataplane change
// holds the apply the crash is kept for after its Confirm.
func (m *Manager) recoverHeld(ctx context.Context, poisoned *poisonedError, mark string) {
	token, ok := m.holdForRepair(poisoned, mark)
	if !ok {
		return
	}
	defer m.unreserve(token)

	if _, err := m.repairCache(ctx, m.log, poisoned); err != nil {
		m.log.Error("sing-box not repaired after a crash on a cached subscription", "err", err)
	}
}

// repairLater is recoverHeld in the background: the apply is taken before it returns, and
// Close cancels the repair and waits for it.
func (m *Manager) repairLater(poisoned *poisonedError, mark string) {
	token, ok := m.holdForRepair(poisoned, mark)
	if !ok {
		return
	}

	m.repairs.Add(1)

	go func() {
		defer m.repairs.Done()
		defer m.unreserve(token)

		if _, err := m.repairCache(m.repairCtx, m.log, poisoned); err != nil {
			m.log.Error("sing-box not repaired after a crash on a cached subscription", "err", err)
		}
	}()
}

func (m *Manager) holdForRepair(poisoned *poisonedError, mark string) (uint64, bool) {
	token, err := m.reserveExclusive()
	if err == nil {
		return token, true
	}

	m.log.Warn("cached subscription not repaired yet: an apply is running", "provider", poisoned.tag)

	m.mu.Lock()
	m.pending = &pendingRepair{poisoned: poisoned, mark: mark}
	m.mu.Unlock()

	return 0, false
}

// dropPending forgets a kept crash: a rollback restarts the core and repairs it itself, and a
// kept mark older than that restart would take an old crash line for a new one.
func (m *Manager) dropPending() {
	m.mu.Lock()
	m.pending = nil
	m.mu.Unlock()
}

// afterConfirm runs the repair kept while the confirmed transaction held the apply, if the
// core still crashes on the cache: the core is watched again from the same log mark.
func (m *Manager) afterConfirm() {
	m.mu.Lock()
	pending := m.pending
	m.pending = nil
	m.mu.Unlock()

	if pending == nil {
		return
	}

	m.repairs.Add(1)

	go func() {
		defer m.repairs.Done()

		ctx, cancel := context.WithTimeout(m.repairCtx, serviceWatch)
		defer cancel()

		upErr := coreUp(ctx, m.log, m.service, m.health, m.store, m.opts.ProcessInterval, since{mark: pending.mark}, false)
		if poisoned, ok := errors.AsType[*poisonedError](upErr); ok {
			m.recoverHeld(m.repairCtx, poisoned, pending.mark)
		}
	}()
}
