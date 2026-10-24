package ruleset

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"sync"
	"time"
)

//go:embed snapshot.json
var snapshot []byte

// Lister reads the provider tree file names. The interface is declared here, at the
// consumer.
type Lister interface {
	List(ctx context.Context, tree Tree, etag string) (Listing, error)
}

// Store keeps the checked listing between restarts. The service directory is
// owned by config.Store, so the write goes through it. A missing file is an
// error for which errors.Is(err, fs.ErrNotExist).
type Store interface {
	ReadRuleSets(ctx context.Context) ([]byte, error)
	WriteRuleSets(ctx context.Context, data []byte) error
}

// entry is the listing of one list in the cache and snapshot.
type entry struct {
	Categories []string `json:"categories"`
	ETag       string   `json:"etag,omitempty"`
	UpdatedAt  int64    `json:"updated_at"`
	source     ListSource
}

// file is the cache and snapshot format: listings by the key `provider/kind`.
type file struct {
	Lists map[string]entry `json:"lists"`
}

// Updater holds the catalog and checks it with the providers on a timer for the whole
// daemon lifetime, whether the panel is open or not, an exception to the rule "no background
// polling without a consumer".
type Updater struct {
	lister   Lister
	store    Store
	log      *slog.Logger
	interval time.Duration
	retry    time.Duration

	mu    sync.Mutex
	lists map[string]entry

	// saved is the fingerprint of the last written cache. Written only by
	// the check goroutine, and before Start by the constructor.
	saved [sha256.Size]byte

	stop context.CancelFunc
	done chan struct{}
}

// NewUpdater assembles the catalog from the embedded snapshot and the saved listing.
// It starts no checks: Start brings them up. A corrupted cache does not prevent
// the start: the catalog stays on the snapshot, and the next check overwrites it.
//
// A zero interval disables the check. An interval shorter than the retry pause
// is rejected: without a token GitHub gives 60 requests an hour, and frequent checks
// would exhaust the limit without ever reaching the retry.
func NewUpdater(ctx context.Context, lister Lister, store Store, log *slog.Logger, interval, retry time.Duration) (*Updater, error) {
	if interval > 0 && interval < retry {
		return nil, fmt.Errorf("refresh interval %s is shorter than the retry pause %s", interval, retry)
	}

	lists, err := decode(snapshot, ListSourceSnapshot)
	if err != nil {
		return nil, fmt.Errorf("embedded catalog snapshot: %w", err)
	}

	u := &Updater{lister: lister, store: store, log: log, interval: interval, retry: retry, lists: lists}

	cached, err := store.ReadRuleSets(ctx)

	switch {
	case errors.Is(err, fs.ErrNotExist):
	case err != nil:
		log.Warn("rule set catalog cache not read, catalog from the snapshot", "err", err)
	default:
		saved, err := decode(cached, ListSourceProvider)
		if err != nil {
			log.Warn("rule set catalog cache corrupt, catalog from the snapshot", "err", err)

			break
		}

		for name, e := range saved {
			if _, known := u.lists[name]; known {
				u.lists[name] = e
			}
		}

		u.saved = sha256.Sum256(cached)
	}

	return u, nil
}

func decode(data []byte, source ListSource) (map[string]entry, error) {
	var f file
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}

	lists := make(map[string]entry, len(f.Lists))
	for name, e := range f.Lists {
		e.source = source
		lists[name] = e
	}

	return lists, nil
}

// Catalog returns the catalog in the form the panel gets it. The category slices
// are shared with the internal state: the check replaces them whole and does not change them
// in place, so copying four thousand lines per request is pointless.
func (u *Updater) Catalog() Catalog {
	u.mu.Lock()
	defer u.mu.Unlock()

	specs := providers()
	catalog := Catalog{Providers: make([]Provider, 0, len(specs))}

	for _, p := range specs {
		provider := Provider{ID: p.id, Name: p.name, Lists: make([]List, 0, len(p.lists))}

		for _, l := range p.lists {
			e := u.lists[key(p.id, l.kind)]
			categories := e.Categories
			if categories == nil {
				categories = []string{}
			}

			provider.Lists = append(provider.Lists, List{
				Kind:       l.kind,
				Prefix:     l.prefix,
				Mirrors:    l.tree.mirrors(),
				Featured:   l.featured,
				Categories: categories,
				Source:     e.source,
				UpdatedAt:  e.UpdatedAt,
			})
		}

		catalog.Providers = append(catalog.Providers, provider)
	}

	return catalog
}

// Start brings the check up for the whole daemon runtime. A zero interval
// leaves the catalog on the snapshot and cache: the daemon does not touch the network.
func (u *Updater) Start() {
	u.mu.Lock()
	defer u.mu.Unlock()

	if u.stop != nil || u.interval <= 0 {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	u.stop, u.done = cancel, make(chan struct{})

	go func(done chan struct{}) {
		defer close(done)
		u.run(ctx)
	}(u.done)
}

// Close stops the check and waits for it.
func (u *Updater) Close() {
	u.mu.Lock()
	stop, done := u.stop, u.done
	u.stop, u.done = nil, nil
	u.mu.Unlock()

	if stop == nil {
		return
	}

	stop()
	<-done
}

// run checks the catalog as soon as it goes stale, then once per interval.
// A failed check is repeated after retry, not after the interval: at router start
// the network and clock come up later than the daemon, and the first attempt often
// fails.
func (u *Updater) run(ctx context.Context) {
	timer := time.NewTimer(u.untilStale(time.Now()))
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}

		next := u.interval
		if err := u.refresh(ctx); err != nil {
			if ctx.Err() != nil {
				return
			}

			u.log.Warn("rule set catalog not refreshed from the providers", "err", err, "retry", u.retry)
			next = u.retry
		} else {
			u.log.Info("rule set catalog refreshed from the providers", "next", next)
		}

		timer.Reset(next)
	}
}

// untilStale is how long to wait before a check. A snapshot and a listing dated in the future
// are checked at once: the second means the router clock is not yet synchronized, and
// the age cannot be computed by it.
func (u *Updater) untilStale(now time.Time) time.Duration {
	u.mu.Lock()
	defer u.mu.Unlock()

	wait := u.interval

	for _, e := range u.lists {
		updated := time.Unix(e.UpdatedAt, 0)
		if e.source == ListSourceSnapshot || updated.After(now) {
			return 0
		}

		wait = min(wait, max(0, u.interval-now.Sub(updated)))
	}

	return wait
}

// refresh checks each list with the provider and saves the result. A list
// that did not check stays as it was; errors of all lists are collected together.
func (u *Updater) refresh(ctx context.Context) error {
	var errs []error

	for _, p := range providers() {
		for _, l := range p.lists {
			name := key(p.id, l.kind)

			u.mu.Lock()
			etag := u.lists[name].ETag
			u.mu.Unlock()

			listing, err := u.lister.List(ctx, l.tree, etag)
			if err != nil {
				errs = append(errs, fmt.Errorf("%s: %w", name, err))

				continue
			}

			if err := u.apply(name, l.prefix, listing, time.Now()); err != nil {
				errs = append(errs, fmt.Errorf("%s: %w", name, err))
			}
		}
	}

	if err := u.save(ctx); err != nil {
		errs = append(errs, err)
	}

	return errors.Join(errs...)
}

func (u *Updater) apply(name, prefix string, listing Listing, now time.Time) error {
	u.mu.Lock()
	defer u.mu.Unlock()

	e := u.lists[name]

	if !listing.NotModified {
		found := categories(listing.Names, prefix)
		if len(found) == 0 {
			return errEmpty
		}

		e.Categories = found
	}

	e.ETag = listing.ETag
	e.UpdatedAt = now.Unix()
	e.source = ListSourceProvider
	u.lists[name] = e

	return nil
}

// save writes the checked lists. Lists not yet checked even once do not get
// into the cache: otherwise the snapshot after a restart would pass itself off as checked.
// Content matching what is written is not rewritten: a check that
// failed entirely is repeated every hour and would otherwise write the same
// file to flash.
func (u *Updater) save(ctx context.Context) error {
	u.mu.Lock()
	f := file{Lists: map[string]entry{}}
	for name, e := range u.lists {
		if e.source == ListSourceProvider {
			f.Lists[name] = e
		}
	}
	u.mu.Unlock()

	if len(f.Lists) == 0 {
		return nil
	}

	data, err := json.Marshal(f)
	if err != nil {
		return fmt.Errorf("catalog cache: %w", err)
	}

	sum := sha256.Sum256(data)
	if sum == u.saved {
		return nil
	}

	if err := u.store.WriteRuleSets(ctx, data); err != nil {
		return fmt.Errorf("catalog cache: %w", err)
	}

	u.saved = sum

	return nil
}

// Snapshot checks all lists with the providers and returns them in the snapshot format.
// It builds `snapshot.json`, which is embedded into the binary.
func Snapshot(ctx context.Context, lister Lister, now time.Time) ([]byte, error) {
	f := file{Lists: map[string]entry{}}

	for _, p := range providers() {
		for _, l := range p.lists {
			listing, err := lister.List(ctx, l.tree, "")
			if err != nil {
				return nil, fmt.Errorf("%s: %w", key(p.id, l.kind), err)
			}

			found := categories(listing.Names, l.prefix)
			if len(found) == 0 {
				return nil, fmt.Errorf("%s: %w", key(p.id, l.kind), errEmpty)
			}

			f.Lists[key(p.id, l.kind)] = entry{Categories: found, ETag: listing.ETag, UpdatedAt: now.Unix()}
		}
	}

	return json.MarshalIndent(f, "", "  ")
}
