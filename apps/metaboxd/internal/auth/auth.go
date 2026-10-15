// Package auth guards the panel with an optional password: it keeps the password hash
// in the daemon service directory, issues sessions and locks out guessing by client
// address.
//
// Sessions and failed attempts live only in memory: a daemon restart logs everybody out
// and forgets the lockouts.
package auth

import (
	"context"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/netip"
	"sync"
	"time"
	"unicode/utf8"
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
	ErrWrongPassword = errors.New("пароль не подошёл")
	// ErrPasswordInvalid means the new password is shorter or longer than allowed.
	ErrPasswordInvalid = errors.New("пароль не принят")
	// ErrNotSet means a login was attempted while the panel has no password.
	ErrNotSet = errors.New("пароль панели не задан")
	// ErrNoSession means a password change on a protected panel came without a valid
	// session.
	ErrNoSession = errors.New("нужен вход в панель")
)

// LockedError means the client address made too many wrong attempts and is locked out.
type LockedError struct {
	RetryAfter time.Duration
}

func (e *LockedError) Error() string {
	return fmt.Sprintf("слишком много неверных паролей, повтор через %s", e.RetryAfter.Round(time.Second))
}

// Store keeps the password hash file. ReadAuth returns an error for which
// errors.Is(err, fs.ErrNotExist) holds when no password was ever set.
type Store interface {
	ReadAuth(ctx context.Context) ([]byte, error)
	WriteAuth(ctx context.Context, data []byte) error
}

// Options are the guard settings that tests replace.
type Options struct {
	// Now is the clock. nil means time.Now.
	Now func() time.Time
	// Iterations is the PBKDF2 iteration count for a new password. Zero means the
	// production value; tests set a small one, otherwise each hash takes a CPU slice.
	Iterations int
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

type attempts struct {
	times       []time.Time
	lockedUntil time.Time
}

// Guard owns the password, the sessions and the failed attempts.
type Guard struct {
	store      Store
	now        func() time.Time
	iterations int

	// change serializes password changes: the check of the current password and the
	// write must not interleave with another change.
	change sync.Mutex

	mu       sync.Mutex
	password *record
	sessions map[string]time.Time
	failures map[netip.Addr]*attempts
}

// New reads the hash file. A file that cannot be parsed is an error, not an open panel:
// the owner who set a password must not lose the protection silently.
func New(ctx context.Context, store Store, opts Options) (*Guard, error) {
	g := &Guard{
		store:      store,
		now:        opts.Now,
		iterations: opts.Iterations,
		sessions:   map[string]time.Time{},
		failures:   map[netip.Addr]*attempts{},
	}

	if g.now == nil {
		g.now = time.Now
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
		return nil, fmt.Errorf("разбор файла пароля: %w", err)
	}

	switch {
	case rec.Algorithm == "" && len(rec.Key) == 0:
		return g, nil
	case rec.Algorithm != algorithm:
		return nil, fmt.Errorf("файл пароля: алгоритм %q не поддерживается", rec.Algorithm)
	case rec.Iterations <= 0 || len(rec.Salt) == 0 || len(rec.Key) == 0:
		return nil, errors.New("файл пароля: нет числа итераций, соли или ключа")
	}

	g.password = &rec

	return g, nil
}

// Check reports whether the panel has a password and, if it does, whether the token
// belongs to a live session. A live session is extended by SessionIdle.
func (g *Guard) Check(token string) (enabled, valid bool) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.password == nil {
		return false, false
	}

	seen, ok := g.sessions[token]
	if !ok {
		return true, false
	}

	now := g.now()
	if now.Sub(seen) >= SessionIdle {
		delete(g.sessions, token)

		return true, false
	}

	g.sessions[token] = now

	return true, true
}

// Login checks the password and opens a session. The attempt counts against the address
// before the check: parallel guesses from one address do not get past the limit while
// the hash is being computed.
func (g *Guard) Login(addr netip.Addr, password string) (string, error) {
	g.mu.Lock()
	rec := g.password
	g.mu.Unlock()

	if rec == nil {
		return "", ErrNotSet
	}

	if err := g.verify(addr, rec, password); err != nil {
		return "", err
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	// The hash is computed outside the lock: a password changed meanwhile has closed every
	// session, and a login checked against the old one must not open a new one.
	if g.password != rec {
		return "", ErrWrongPassword
	}

	return g.openSession(), nil
}

// Logout closes the session. An unknown token is not an error.
func (g *Guard) Logout(token string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	delete(g.sessions, token)
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

		if err := g.verify(addr, rec, current); err != nil {
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
		defer g.mu.Unlock()

		g.password = nil
		clear(g.sessions)

		return "", nil
	}

	if n := utf8.RuneCountInString(next); n < minPasswordRunes || n > maxPasswordRunes {
		return "", fmt.Errorf("%w: от %d до %d символов", ErrPasswordInvalid, minPasswordRunes, maxPasswordRunes)
	}

	fresh, err := g.derive(next)
	if err != nil {
		return "", err
	}

	data, err := json.Marshal(fresh)
	if err != nil {
		return "", fmt.Errorf("файл пароля в JSON: %w", err)
	}

	if err := g.store.WriteAuth(ctx, data); err != nil {
		return "", err
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	g.password = fresh
	clear(g.sessions)

	return g.openSession(), nil
}

func (g *Guard) derive(password string) (*record, error) {
	salt := make([]byte, saltBytes)
	_, _ = rand.Read(salt) // crypto/rand.Read never fails since Go 1.24

	key, err := pbkdf2.Key(sha256.New, password, salt, g.iterations, keyBytes)
	if err != nil {
		return nil, fmt.Errorf("хеш пароля: %w", err)
	}

	return &record{Algorithm: algorithm, Iterations: g.iterations, Salt: salt, Key: key}, nil
}

// verify counts the attempt, computes the hash outside the lock and forgets the
// address on success.
func (g *Guard) verify(addr netip.Addr, rec *record, password string) error {
	g.mu.Lock()
	now := g.now()
	g.pruneFailures(now)

	entry := g.failures[addr]
	if entry != nil && now.Before(entry.lockedUntil) {
		g.mu.Unlock()

		return &LockedError{RetryAfter: entry.lockedUntil.Sub(now)}
	}

	if entry == nil {
		entry = &attempts{}
		g.failures[addr] = entry
	}

	entry.times = append(entry.times, now)
	if len(entry.times) >= failLimit {
		entry.lockedUntil = now.Add(lockFor)
		entry.times = nil
	}
	g.mu.Unlock()

	if !rec.matches(password) {
		return ErrWrongPassword
	}

	g.mu.Lock()
	delete(g.failures, addr)
	g.mu.Unlock()

	return nil
}

// pruneFailures drops attempts older than the window and expired lockouts, so the table
// holds only addresses active in the last quarter of an hour.
func (g *Guard) pruneFailures(now time.Time) {
	for addr, entry := range g.failures {
		kept := entry.times[:0]

		for _, at := range entry.times {
			if now.Sub(at) < failWindow {
				kept = append(kept, at)
			}
		}

		entry.times = kept

		if len(kept) == 0 && !now.Before(entry.lockedUntil) {
			delete(g.failures, addr)
		}
	}
}

// openSession is called under mu. Expired sessions go first; if the table is still full,
// the session idle the longest is evicted.
func (g *Guard) openSession() string {
	now := g.now()

	for token, seen := range g.sessions {
		if now.Sub(seen) >= SessionIdle {
			delete(g.sessions, token)
		}
	}

	if len(g.sessions) >= maxSessions {
		var (
			oldest   string
			oldestAt time.Time
		)

		for token, seen := range g.sessions {
			if oldest == "" || seen.Before(oldestAt) {
				oldest, oldestAt = token, seen
			}
		}

		delete(g.sessions, oldest)
	}

	token := rand.Text() + rand.Text()
	g.sessions[token] = now

	return token
}
