package apply

import (
	"context"
	"errors"
	"log/slog"
	"path/filepath"
	"slices"
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

// serviceWatch is how long a start from the panel is watched for a crash on the cache file:
// the core reads the cache before anything else and fails within a second or two.
const serviceWatch = 15 * time.Second

// repairCache drops the cached subscription the core crashed on and starts the core again. A core
// that crashes on another provider gets the same treatment; the same provider twice ends the
// recovery, so the rounds stop when the bucket has no more keys the core names. Called with the
// apply held; returns the dropped providers even when the recovery failed later.
func (m *Manager) repairCache(ctx context.Context, log *slog.Logger, poisoned *poisonedError) ([]string, error) {
	if m.opts.Cache == nil {
		return nil, locale.Errorf("sing-box crashed on the cached subscription %q: %s", poisoned.tag, poisoned.reason)
	}

	ctx, cancel := context.WithTimeout(ctx, m.opts.CycleTimeout)
	defer cancel()

	data, err := m.store.Read(ctx)
	if err != nil {
		return nil, locale.Errorf("read the config for the cache file: %w", err)
	}

	cache, err := clashapi.ReadCacheFile(data)
	if err != nil {
		return nil, err
	}

	if !cache.Enabled || !cache.StoreSubscriptions {
		return nil, locale.Errorf("sing-box crashed on the cached subscription %q, but the config keeps no subscriptions in the cache file", poisoned.tag)
	}

	path := m.cachePath(ctx, cache.Path)

	var dropped []string

	for {
		if slices.Contains(dropped, poisoned.tag) {
			return dropped, locale.Errorf("sing-box still crashes on the cached subscription %q: %s", poisoned.tag, poisoned.reason)
		}

		if err := m.dropEntry(ctx, log, path, cache.CacheID, poisoned.tag); err != nil {
			return dropped, err
		}

		dropped = append(dropped, poisoned.tag)
		log.Warn("cached subscription dropped: sing-box crashed on it", "provider", poisoned.tag, "cache_file", path)

		_, pidErr := m.service.PID(ctx)
		upErr := coreUp(ctx, log, m.service, m.health, m.store, m.opts.ProcessInterval, 0, pidErr)

		next, ok := errors.AsType[*poisonedError](upErr)
		if !ok {
			return dropped, upErr
		}

		poisoned = next
	}
}

// dropEntry stops the sing-box process, deletes the entry and starts the process again. A file
// the daemon cannot open as a database goes aside whole: the core cannot have read the entry
// from it either, unless the two bbolt implementations disagree, and then nothing short of a
// fresh file brings the core back. A held lock never counts as such a file. The start runs
// even when the delete did not: the core must not stay stopped because of the daemon, and it
// runs detached so a daemon shutdown does not leave it so either.
func (m *Manager) dropEntry(ctx context.Context, log *slog.Logger, path, cacheID, tag string) error {
	if err := m.service.Halt(ctx); err != nil {
		return locale.Errorf("stop sing-box for the cache file: %w", err)
	}

	m.awaitDown(ctx)

	dropErr := m.opts.Cache.Drop(ctx, path, cacheID, tag)
	if errors.Is(dropErr, cachefile.ErrUnreadable) {
		aside, err := m.opts.Cache.MoveAside(ctx, path)
		if err == nil {
			log.Warn("cache file moved aside: it does not open as a database", "cache_file", path, "moved_to", aside, "err", dropErr)
		}

		dropErr = err
	}

	if dropErr != nil {
		dropErr = locale.Errorf("drop the cached subscription %q: %w", tag, dropErr)
	}

	startCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), stateTimeout)
	defer cancel()

	if err := m.service.Start(startCtx); err != nil {
		return errors.Join(dropErr, locale.Errorf("start sing-box after the cache file: %w", err))
	}

	return dropErr
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

// cachePath resolves the cache file the way the fork does: a relative path from the working
// directory of the service, which the metabox service sets to the config directory.
func (m *Manager) cachePath(ctx context.Context, path string) string {
	if filepath.IsAbs(path) {
		return path
	}

	workdir := m.opts.ConfigDir

	if launch, err := m.service.Launch(ctx); err == nil && launch.Workdir != "" {
		workdir = launch.Workdir
	}

	return filepath.Join(workdir, path)
}

// recovered is the transaction reason after a rollback that dropped cached subscriptions:
// the user sees what the daemon changed on the device without being asked.
func recovered(l locale.Lang, reason string, dropped []string) string {
	if len(dropped) == 0 {
		return reason
	}

	note := locale.Sprintf(l, "sing-box crashed on the cached subscription %s, its entry was dropped from the cache file", strings.Join(dropped, ", "))
	if reason == "" {
		return note
	}

	return reason + "\n" + note
}

// Watch runs a start or restart of the service from the panel and repairs a core that then
// crashes on a cached subscription. It returns only the error of start: the panel reads the
// state after it. The apply is taken only for the repair, so a healthy or stopped service
// never refuses an Apply.
func (m *Manager) Watch(ctx context.Context, start func(context.Context) error) error {
	before, pidErr := m.service.PID(ctx)

	if err := start(ctx); err != nil {
		return err
	}

	watchCtx, cancel := context.WithTimeout(ctx, serviceWatch)
	defer cancel()

	upErr := coreUp(watchCtx, m.log, m.service, m.health, m.store, m.opts.ProcessInterval, before, pidErr)
	if poisoned, ok := errors.AsType[*poisonedError](upErr); ok {
		m.recoverHeld(ctx, poisoned)
	}

	return nil
}

// RecoverAtStart repairs a core that crashes on a cached subscription when the daemon starts,
// after the replays: the router may have rebooted into the crash loop. A service procd does
// not know, stopped by the user or never started, is left alone.
func (m *Manager) RecoverAtStart(ctx context.Context) {
	if _, err := m.service.PID(ctx); err != nil {
		return
	}

	waitCtx, cancel := context.WithTimeout(ctx, m.opts.CycleTimeout)
	defer cancel()

	// The service may have crashed for good before the daemon started: the crash reason is
	// watched from the start, not only after a new process.
	err := watch(waitCtx, m.service, m.opts.ProcessInterval, func(ctx context.Context) error {
		return coreUp(ctx, m.log, m.service, m.health, m.store, m.opts.ProcessInterval, 0, nil)
	})
	if poisoned, ok := errors.AsType[*poisonedError](err); ok {
		m.recoverHeld(ctx, poisoned)
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

// recoverHeld takes the apply for the repair. An Apply already running owns the service, and
// its own rollback repairs the core.
func (m *Manager) recoverHeld(ctx context.Context, poisoned *poisonedError) {
	token, err := m.reserveExclusive()
	if err != nil {
		m.log.Warn("cached subscription not repaired: an apply is running", "provider", poisoned.tag)

		return
	}
	defer m.unreserve(token)

	if _, err := m.repairCache(ctx, m.log, poisoned); err != nil {
		m.log.Error("sing-box not repaired after a crash on a cached subscription", "err", err)
	}
}
