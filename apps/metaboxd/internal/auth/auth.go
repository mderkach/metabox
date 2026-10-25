// Package auth guards the panel with an optional password: it keeps the password hash
// in the daemon service directory, issues sessions and locks out guessing by client
// network.
//
// Sessions are saved next to the hash and survive a daemon restart; failed attempts live
// only in memory, and a restart forgets the lockouts.
package auth

import (
	"context"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/netip"
	"sync"
	"time"
	"unicode/utf8"

	"metabox/internal/locale"
)

const (
	// SessionIdle is how long a session lives since its last request.
	SessionIdle = 24 * time.Hour

	// maxSessions bounds the session table: the daemon runs for months, and every login
	// from a forgotten browser would otherwise stay in memory for a day.
	maxSessions = 64

	failLimit  = 5
	failWindow = 15 * time.Minute
	lockFor    = 5 * time.Minute

	// globalFailKeys is the global attempt budget: once this many lockout keys have a
	// wrong password within failWindow, login is locked for every address for lockFor.
	// It stops guessing spread over many addresses, at the price of locking the owner out
	// while such guessing goes on.
	globalFailKeys = 10

	// revokeRetryPause separates the two tries of the session write after a revocation: a
	// transient failure of the flash does not surface to the user.
	revokeRetryPause = 500 * time.Millisecond

	// maxHashing bounds the PBKDF2 computations running at once; the rest wait for a slot.
	// The router has four cores, and the other two keep routing while guesses arrive from
	// many addresses.
	maxHashing = 2

	// ipv6LockBits is the IPv6 prefix the lockout counts by: a LAN device picks new
	// addresses inside its /64 at will.
	ipv6LockBits = 64

	minPasswordRunes = 8
	maxPasswordRunes = 128

	algorithm = "pbkdf2-sha256"
	// defaultIterations follows the OWASP recommendation for PBKDF2-HMAC-SHA256.
	defaultIterations = 600_000
	saltBytes         = 16
	keyBytes          = 32
)

var (
	// ErrWrongPassword means the password does not match the stored one.
	ErrWrongPassword = locale.New("wrong password")
	// ErrPasswordInvalid means the new password is shorter or longer than allowed.
	ErrPasswordInvalid = locale.New("password rejected")
	// ErrNotSet means a login was attempted while the panel has no password.
	ErrNotSet = locale.New("panel password is not set")
	// ErrNoSession means a password change on a protected panel came without a valid
	// session.
	ErrNoSession = locale.New("sign-in required")
	// ErrSessionNotRevoked means logout closed the session in memory, but the session file
	// could not be written: a daemon restart would bring the session back.
	ErrSessionNotRevoked = locale.New("session revocation not saved")
)

// LockedError means login is locked out: the client address made too many wrong
// attempts, or too many addresses did.
type LockedError struct {
	RetryAfter time.Duration
}

func (e *LockedError) Error() string {
	return e.text().Error()
}

// In returns the text in the language l: the lockout reaches the panel login form.
func (e *LockedError) In(l locale.Lang) string {
	return e.text().In(l)
}

func (e *LockedError) text() *locale.Error {
	return locale.Errorf("too many wrong passwords, retry in %s", e.RetryAfter.Round(time.Second))
}

// Store keeps the password hash file and the session file. ReadAuth and ReadSessions
// return an error for which errors.Is(err, fs.ErrNotExist) holds when the file was never
// written.
type Store interface {
	ReadAuth(ctx context.Context) ([]byte, error)
	WriteAuth(ctx context.Context, data []byte) error
	ReadSessions(ctx context.Context) ([]byte, error)
	WriteSessions(ctx context.Context, data []byte) error
}

// Options are the guard settings that tests replace.
type Options struct {
	// Now is the clock. nil means time.Now.
	Now func() time.Time
	// Iterations is the PBKDF2 iteration count for a new password. Zero means the
	// production value; tests set a small one, otherwise each hash takes a CPU slice.
	Iterations int
	// Hashing is called in every PBKDF2 computation after it takes a slot and before it
	// hashes; tests block in it to hold a check midway.
	Hashing func()
	// Log receives the session file failures: they do not refuse a login. nil means
	// discard.
	Log *slog.Logger
}

// record is the hash file. The algorithm and the iteration count are stored with the key,
// so the count can be raised without breaking passwords already set. An empty record
// means no password.
type record struct {
	Algorithm  string `json:"algorithm,omitempty"`
	Iterations int    `json:"iterations,omitempty"`
	Salt       []byte `json:"salt,omitempty"`
	Key        []byte `json:"key,omitempty"`
}

func (r *record) matches(password string) bool {
	key, err := pbkdf2.Key(sha256.New, password, r.Salt, r.Iterations, len(r.Key))
	if err != nil {
		return false
	}

	return subtle.ConstantTimeCompare(key, r.Key) == 1
}

// session is a live login. ended closes when the session ends, so that a stream opened
// with it stops.
type session struct {
	seen  time.Time
	ended chan struct{}
}

// sessionFile is the session file: the SHA-256 of each token, so that a copy of the file
// does not open the panel, and the time of its last request known at the last write.
// Generation is the SHA-256 of the password salt the sessions were opened under: a file
// left behind by a failed write after a password change does not bring its sessions
// back.
type sessionFile struct {
	Generation string         `json:"generation"`
	Sessions   []savedSession `json:"sessions"`
}

type savedSession struct {
	Key  string    `json:"key"`
	Seen time.Time `json:"seen"`
}

type attempts struct {
	times       []time.Time
	lockedUntil time.Time
	// lastFailed is the last wrong password from the key, as opposed to an attempt still
	// being checked: the global budget counts keys that failed within failWindow.
	lastFailed time.Time
}

// Guard owns the password, the sessions and the failed attempts.
type Guard struct {
	store      Store
	now        func() time.Time
	iterations int
	log        *slog.Logger
	hashing    func()
	slots      chan struct{}

	// change serializes password changes: the check of the current password and the
	// write must not interleave with another change.
	change sync.Mutex

	// save serializes session file writes: each one takes the table after the previous
	// one is written, so an older table never overwrites a newer one.
	save sync.Mutex

	mu       sync.Mutex
	password *record
	// sessions is keyed by tokenKey of the token.
	sessions map[string]*session
	failures map[netip.Prefix]*attempts
	// lockedUntil is the global lockout set by the attempt budget.
	lockedUntil time.Time
}

// New reads the hash file. A file that cannot be parsed is an error, not an open panel:
// the owner who set a password must not lose the protection silently.
func New(ctx context.Context, store Store, opts Options) (*Guard, error) {
	g := &Guard{
		store:      store,
		now:        opts.Now,
		iterations: opts.Iterations,
		log:        opts.Log,
		hashing:    opts.Hashing,
		slots:      make(chan struct{}, maxHashing),
		sessions:   map[string]*session{},
		failures:   map[netip.Prefix]*attempts{},
	}

	if g.now == nil {
		g.now = time.Now
	}

	if g.log == nil {
		g.log = slog.New(slog.DiscardHandler)
	}

	if g.iterations == 0 {
		g.iterations = defaultIterations
	}

	data, err := store.ReadAuth(ctx)
	if errors.Is(err, fs.ErrNotExist) {
		return g, nil
	}
	if err != nil {
		return nil, err
	}

	var rec record
	if err := json.Unmarshal(data, &rec); err != nil {
		return nil, fmt.Errorf("parse password file: %w", err)
	}

	switch {
	case rec.Algorithm == "" && len(rec.Key) == 0:
		return g, nil
	case rec.Algorithm != algorithm:
		return nil, fmt.Errorf("password file: algorithm %q is not supported", rec.Algorithm)
	case rec.Iterations <= 0 || len(rec.Salt) == 0 || len(rec.Key) == 0:
		return nil, errors.New("password file: no iteration count, salt or key")
	}

	g.password = &rec
	g.restoreSessions(ctx)

	return g, nil
}

// restoreSessions reads the session file. A missing or broken file is not an error:
// the panel stays protected, and its users log in again.
func (g *Guard) restoreSessions(ctx context.Context) {
	data, err := g.store.ReadSessions(ctx)
	if errors.Is(err, fs.ErrNotExist) {
		return
	}

	var file sessionFile
	if err == nil {
		err = json.Unmarshal(data, &file)
	}

	if err != nil {
		g.log.Warn("panel sessions not restored", "err", err)

		return
	}

	if file.Generation != saltKey(g.password) {
		return
	}

	now := g.now()

	for _, saved := range file.Sessions {
		seen := saved.Seen
		// The router has no real-time clock: after a reboot it may run behind the time
		// the session was saved at.
		if seen.After(now) {
			seen = now
		}

		if now.Sub(seen) >= SessionIdle || len(g.sessions) >= maxSessions {
			continue
		}

		g.sessions[saved.Key] = &session{seen: seen, ended: make(chan struct{})}
	}
}

// Check reports whether the panel has a password and, if it does, whether the token
// belongs to a live session. A live session is extended by SessionIdle.
func (g *Guard) Check(token string) (enabled, valid bool) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.password == nil {
		return false, false
	}

	key := tokenKey(token)

	live, ok := g.sessions[key]
	if !ok {
		return true, false
	}

	now := g.now()
	if now.Sub(live.seen) >= SessionIdle {
		g.endSession(key)

		return true, false
	}

	live.seen = now

	return true, true
}

// Ended returns a channel that closes when the session of the token ends: logout,
// password change, eviction, or expiry noticed by Check. For a token without a live
// session the channel is already closed.
func (g *Guard) Ended(token string) <-chan struct{} {
	g.mu.Lock()
	defer g.mu.Unlock()

	if live, ok := g.sessions[tokenKey(token)]; ok {
		return live.ended
	}

	ended := make(chan struct{})
	close(ended)

	return ended
}

// Login checks the password and opens a session. The attempt counts against the address
// before the check: parallel guesses from one address do not get past the limit while
// the hash is being computed. Waiting for a hashing slot ends with ctx.
func (g *Guard) Login(ctx context.Context, addr netip.Addr, password string) (string, error) {
	g.mu.Lock()
	rec := g.password
	g.mu.Unlock()

	if rec == nil {
		return "", ErrNotSet
	}

	if err := g.verify(ctx, addr, rec, password); err != nil {
		return "", err
	}

	g.mu.Lock()
	// The hash is computed outside the lock: a password changed meanwhile has closed every
	// session, and a login checked against the old one must not open a new one.
	if g.password != rec {
		g.mu.Unlock()

		return "", ErrWrongPassword
	}

	token := g.openSession()
	g.mu.Unlock()

	g.saveSessionsOrWarn(ctx)

	return token, nil
}

// Logout closes the session. An unknown token is not an error. The session file is
// written before the call returns, with one more try after revokeRetryPause: a failure
// means the revocation lives only until the daemon restarts, and the caller must hear
// that.
func (g *Guard) Logout(ctx context.Context, token string) error {
	key := tokenKey(token)

	g.mu.Lock()
	_, ok := g.sessions[key]
	if ok {
		g.endSession(key)
	}
	g.mu.Unlock()

	if !ok {
		return nil
	}

	err := g.saveSessions(ctx)
	if err != nil {
		time.Sleep(revokeRetryPause)
		err = g.saveSessions(ctx)
	}

	if err != nil {
		return fmt.Errorf("%w: %w", ErrSessionNotRevoked, err)
	}

	return nil
}

// SetPassword sets, changes or, with an empty next, removes the password. While the panel
// has no password, anyone may set the first one. Otherwise the token must belong to a
// live session and current must match. A successful change closes every session and
// returns a new one for the caller; removal closes every session and returns an empty
// token. The file is written before the password changes in memory: a write failure
// leaves the old password in force.
func (g *Guard) SetPassword(ctx context.Context, addr netip.Addr, token, current, next string) (string, error) {
	g.change.Lock()
	defer g.change.Unlock()

	g.mu.Lock()
	rec := g.password
	g.mu.Unlock()

	if rec != nil {
		if _, valid := g.Check(token); !valid {
			return "", ErrNoSession
		}

		if err := g.verify(ctx, addr, rec, current); err != nil {
			return "", err
		}
	}

	if next == "" {
		if rec == nil {
			return "", nil
		}

		if err := g.store.WriteAuth(ctx, []byte("{}")); err != nil {
			return "", err
		}

		g.mu.Lock()
		g.password = nil
		g.endSessions()
		g.mu.Unlock()

		g.saveSessionsOrWarn(ctx)

		return "", nil
	}

	if n := utf8.RuneCountInString(next); n < minPasswordRunes || n > maxPasswordRunes {
		return "", locale.Errorf("%w: %d to %d characters", ErrPasswordInvalid, minPasswordRunes, maxPasswordRunes)
	}

	fresh, err := g.derive(ctx, next)
	if err != nil {
		return "", err
	}

	data, err := json.Marshal(fresh)
	if err != nil {
		return "", fmt.Errorf("encode password file: %w", err)
	}

	if err := g.store.WriteAuth(ctx, data); err != nil {
		return "", err
	}

	g.mu.Lock()
	g.password = fresh
	g.endSessions()
	opened := g.openSession()
	g.mu.Unlock()

	g.saveSessionsOrWarn(ctx)

	return opened, nil
}

func (g *Guard) derive(ctx context.Context, password string) (*record, error) {
	salt := make([]byte, saltBytes)
	_, _ = rand.Read(salt) // crypto/rand.Read never fails since Go 1.24

	var (
		key     []byte
		hashErr error
	)

	if err := g.hash(ctx, func() {
		key, hashErr = pbkdf2.Key(sha256.New, password, salt, g.iterations, keyBytes)
	}); err != nil {
		return nil, err
	}

	if hashErr != nil {
		return nil, fmt.Errorf("hash password: %w", hashErr)
	}

	return &record{Algorithm: algorithm, Iterations: g.iterations, Salt: salt, Key: key}, nil
}

// hash runs one PBKDF2 computation in a free slot, waiting for one while ctx lives.
func (g *Guard) hash(ctx context.Context, compute func()) error {
	select {
	case g.slots <- struct{}{}:
	case <-ctx.Done():
		return ctx.Err()
	}

	defer func() { <-g.slots }()

	if g.hashing != nil {
		g.hashing()
	}

	compute()

	return nil
}

// verify counts the attempt, computes the hash outside the lock and forgets the
// address on success.
func (g *Guard) verify(ctx context.Context, addr netip.Addr, rec *record, password string) error {
	key := lockKey(addr)

	g.mu.Lock()
	now := g.now()
	g.pruneFailures(now)

	if now.Before(g.lockedUntil) {
		g.mu.Unlock()

		return &LockedError{RetryAfter: g.lockedUntil.Sub(now)}
	}

	entry := g.failures[key]
	if entry != nil && now.Before(entry.lockedUntil) {
		g.mu.Unlock()

		return &LockedError{RetryAfter: entry.lockedUntil.Sub(now)}
	}

	if entry == nil {
		entry = &attempts{}
		g.failures[key] = entry
	}

	entry.times = append(entry.times, now)
	if len(entry.times) >= failLimit {
		entry.lockedUntil = now.Add(lockFor)
		entry.times = nil
	}
	g.mu.Unlock()

	var ok bool
	if err := g.hash(ctx, func() { ok = rec.matches(password) }); err != nil {
		return err
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	// A check that waited for a slot may finish after the global lockout fired, and its
	// answer must not get past it.
	now = g.now()
	if now.Before(g.lockedUntil) {
		return &LockedError{RetryAfter: g.lockedUntil.Sub(now)}
	}

	if ok {
		delete(g.failures, key)

		return nil
	}

	// The entry may have been dropped meanwhile by a success from the same key.
	entry = g.failures[key]
	if entry == nil {
		entry = &attempts{}
		g.failures[key] = entry
	}

	entry.lastFailed = now
	g.countGlobal(now)

	return ErrWrongPassword
}

// countGlobal is called under mu after a wrong password and locks every address once
// globalFailKeys keys have failed within the window.
func (g *Guard) countGlobal(now time.Time) {
	failed := 0

	for _, entry := range g.failures {
		if now.Sub(entry.lastFailed) < failWindow {
			failed++
		}
	}

	if failed >= globalFailKeys {
		g.lockedUntil = now.Add(lockFor)
	}
}

// lockKey is what the lockout counts by: an IPv4 address as is, an IPv6 address by its
// /64.
func lockKey(addr netip.Addr) netip.Prefix {
	bits := addr.BitLen()
	if addr.Is6() {
		bits = ipv6LockBits
	}

	key, err := addr.Prefix(bits)
	if err != nil {
		return netip.Prefix{}
	}

	return key
}

// pruneFailures drops attempts older than the window and expired lockouts, so the table
// holds only addresses active in the last quarter of an hour.
func (g *Guard) pruneFailures(now time.Time) {
	for key, entry := range g.failures {
		kept := entry.times[:0]

		for _, at := range entry.times {
			if now.Sub(at) < failWindow {
				kept = append(kept, at)
			}
		}

		entry.times = kept

		if len(kept) == 0 && !now.Before(entry.lockedUntil) && now.Sub(entry.lastFailed) >= failWindow {
			delete(g.failures, key)
		}
	}
}

// openSession is called under mu. Expired sessions go first; if the table is still full,
// the session idle the longest is evicted.
func (g *Guard) openSession() string {
	now := g.now()

	for key, live := range g.sessions {
		if now.Sub(live.seen) >= SessionIdle {
			g.endSession(key)
		}
	}

	if len(g.sessions) >= maxSessions {
		var (
			oldest   string
			oldestAt time.Time
		)

		for key, live := range g.sessions {
			if oldest == "" || live.seen.Before(oldestAt) {
				oldest, oldestAt = key, live.seen
			}
		}

		g.endSession(oldest)
	}

	token := rand.Text() + rand.Text()
	g.sessions[tokenKey(token)] = &session{seen: now, ended: make(chan struct{})}

	return token
}

// endSession is called under mu.
func (g *Guard) endSession(key string) {
	close(g.sessions[key].ended)
	delete(g.sessions, key)
}

// endSessions is called under mu.
func (g *Guard) endSessions() {
	for key := range g.sessions {
		g.endSession(key)
	}
}

// saveSessionsOrWarn is the write after a login or a password change: a failure does not
// refuse them, the table in memory is right until the daemon restarts.
func (g *Guard) saveSessionsOrWarn(ctx context.Context) {
	if err := g.saveSessions(ctx); err != nil {
		g.log.Warn("panel sessions not saved", "err", err)
	}
}

// saveSessions writes the session table. The write is not cancelled with the request: a
// client that drops a logout must not keep its session on disk, and a password change
// ends the session of its own request. A stale file after a failed write is harmless for
// a password change, since it does not match the new password generation; after a logout
// it is not, and Logout answers for it.
func (g *Guard) saveSessions(ctx context.Context) error {
	g.save.Lock()
	defer g.save.Unlock()

	g.mu.Lock()
	file := sessionFile{Generation: saltKey(g.password), Sessions: make([]savedSession, 0, len(g.sessions))}
	for key, live := range g.sessions {
		file.Sessions = append(file.Sessions, savedSession{Key: key, Seen: live.seen})
	}
	g.mu.Unlock()

	data, err := json.Marshal(file)
	if err != nil {
		return fmt.Errorf("encode session file: %w", err)
	}

	return g.store.WriteSessions(context.WithoutCancel(ctx), data)
}

// saltKey identifies the password the sessions belong to; no password gives an empty
// key.
func saltKey(rec *record) string {
	if rec == nil {
		return ""
	}

	sum := sha256.Sum256(rec.Salt)

	return hex.EncodeToString(sum[:])
}

func tokenKey(token string) string {
	sum := sha256.Sum256([]byte(token))

	return hex.EncodeToString(sum[:])
}
