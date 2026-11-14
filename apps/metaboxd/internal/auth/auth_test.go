package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"net/netip"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"metabox/internal/auth"
)

type fakeStore struct {
	data     []byte
	writeErr error
	writes   int

	sessions        []byte
	sessionsReadErr error
	sessionWriteErr error
	// sessionWriteFailsOnce clears sessionWriteErr after the first failed write.
	sessionWriteFailsOnce bool
}

func (f *fakeStore) ReadAuth(context.Context) ([]byte, error) {
	if f.data == nil {
		return nil, fs.ErrNotExist
	}

	return f.data, nil
}

func (f *fakeStore) WriteAuth(_ context.Context, data []byte) error {
	f.writes++
	if f.writeErr != nil {
		return f.writeErr
	}

	f.data = data

	return nil
}

func (f *fakeStore) ReadSessions(context.Context) ([]byte, error) {
	if f.sessionsReadErr != nil {
		return nil, f.sessionsReadErr
	}

	if f.sessions == nil {
		return nil, fs.ErrNotExist
	}

	return f.sessions, nil
}

func (f *fakeStore) WriteSessions(_ context.Context, data []byte) error {
	if err := f.sessionWriteErr; err != nil {
		if f.sessionWriteFailsOnce {
			f.sessionWriteErr = nil
		}

		return err
	}

	f.sessions = data

	return nil
}

type clock struct{ at time.Time }

func (c *clock) now() time.Time { return c.at }

func (c *clock) advance(d time.Duration) { c.at = c.at.Add(d) }

// owner and stranger sit in different /24: the lockout counts an IPv4 network as one key.
var (
	owner    = netip.MustParseAddr("192.168.1.10")
	stranger = netip.MustParseAddr("192.168.2.66")
)

const password = "correct horse"

func newGuard(t *testing.T, store *fakeStore) (*auth.Guard, *clock) {
	t.Helper()

	c := &clock{at: time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)}

	g, err := auth.New(t.Context(), store, auth.Options{Now: c.now, Iterations: 1000})
	if err != nil {
		t.Fatalf("new guard: %v", err)
	}

	return g, c
}

// protected returns a guard with the password already set and the session of the caller
// who set it.
func protected(t *testing.T) (*auth.Guard, *clock, *fakeStore, string) {
	t.Helper()

	store := &fakeStore{}
	g, c := newGuard(t, store)

	token, err := g.SetPassword(t.Context(), owner, "", "", password)
	if err != nil {
		t.Fatalf("set first password: %v", err)
	}

	return g, c, store, token
}

func TestWithoutPasswordThePanelIsOpen(t *testing.T) {
	g, _ := newGuard(t, &fakeStore{})

	if enabled, _ := g.Check("anything"); enabled {
		t.Error("guard without a password reports protection")
	}

	if _, err := g.Login(t.Context(), owner, password); !errors.Is(err, auth.ErrNotSet) {
		t.Errorf("login without a password: got %v, want ErrNotSet", err)
	}
}

func TestFirstPasswordOpensASessionAndBothSurviveRestart(t *testing.T) {
	g, c, store, token := protected(t)

	if enabled, valid := g.Check(token); !enabled || !valid {
		t.Fatalf("caller session after setting the password: enabled %v, valid %v", enabled, valid)
	}

	var rec map[string]any
	if err := json.Unmarshal(store.data, &rec); err != nil {
		t.Fatalf("stored file is not JSON: %v", err)
	}

	if rec["algorithm"] != "pbkdf2-sha256" {
		t.Errorf("stored algorithm %v", rec["algorithm"])
	}

	restarted, err := auth.New(t.Context(), store, auth.Options{Now: c.now, Iterations: 1000})
	if err != nil {
		t.Fatalf("restart: %v", err)
	}

	if _, valid := restarted.Check(token); !valid {
		t.Error("session did not survive a daemon restart")
	}

	if _, err := restarted.Login(t.Context(), owner, password); err != nil {
		t.Errorf("login after restart: %v", err)
	}
}

func TestLoginRejectsAWrongPassword(t *testing.T) {
	g, _, _, _ := protected(t)

	if _, err := g.Login(t.Context(), stranger, "wrong password"); !errors.Is(err, auth.ErrWrongPassword) {
		t.Fatalf("wrong password: got %v, want ErrWrongPassword", err)
	}

	token, err := g.Login(t.Context(), owner, password)
	if err != nil {
		t.Fatalf("right password: %v", err)
	}

	if _, valid := g.Check(token); !valid {
		t.Error("session from login is not valid")
	}
}

func TestFiveWrongPasswordsLockTheAddress(t *testing.T) {
	g, c, _, _ := protected(t)

	for range 5 {
		if _, err := g.Login(t.Context(), stranger, "wrong password"); !errors.Is(err, auth.ErrWrongPassword) {
			t.Fatalf("wrong password before the limit: %v", err)
		}
	}

	_, err := g.Login(t.Context(), stranger, password)

	locked, ok := errors.AsType[*auth.LockedError](err)
	if !ok {
		t.Fatalf("right password from a locked address: got %v, want LockedError", err)
	}

	if locked.RetryAfter != 5*time.Minute {
		t.Errorf("retry after %v, want 5m", locked.RetryAfter)
	}

	if _, err := g.Login(t.Context(), owner, password); err != nil {
		t.Errorf("another network is locked too: %v", err)
	}

	c.advance(5 * time.Minute)

	if _, err := g.Login(t.Context(), stranger, password); err != nil {
		t.Errorf("login after the lockout expired: %v", err)
	}
}

func TestOldFailuresDoNotCount(t *testing.T) {
	g, c, _, _ := protected(t)

	for range 4 {
		_, _ = g.Login(t.Context(), stranger, "wrong password")
	}

	c.advance(16 * time.Minute)

	for range 4 {
		_, _ = g.Login(t.Context(), stranger, "wrong password")
	}

	if _, err := g.Login(t.Context(), stranger, password); err != nil {
		t.Errorf("failures outside the window locked the address: %v", err)
	}
}

func TestSuccessResetsTheFailures(t *testing.T) {
	g, _, _, _ := protected(t)

	for range 4 {
		_, _ = g.Login(t.Context(), stranger, "wrong password")
	}

	if _, err := g.Login(t.Context(), stranger, password); err != nil {
		t.Fatalf("right password: %v", err)
	}

	for range 4 {
		_, _ = g.Login(t.Context(), stranger, "wrong password")
	}

	if _, err := g.Login(t.Context(), stranger, password); err != nil {
		t.Errorf("failures before a success still count: %v", err)
	}
}

func TestSessionExpiresAfterIdleAndSlidesOnUse(t *testing.T) {
	g, c, _, token := protected(t)

	c.advance(23 * time.Hour)

	if _, valid := g.Check(token); !valid {
		t.Fatal("session expired before the idle limit")
	}

	c.advance(23 * time.Hour)

	if _, valid := g.Check(token); !valid {
		t.Fatal("use did not extend the session")
	}

	c.advance(auth.SessionIdle)

	if _, valid := g.Check(token); valid {
		t.Error("idle session is still valid")
	}
}

func TestSessionTableIsBounded(t *testing.T) {
	g, c, _, first := protected(t)

	for range 64 {
		c.advance(time.Second)

		if _, err := g.Login(t.Context(), owner, password); err != nil {
			t.Fatalf("login: %v", err)
		}
	}

	if _, valid := g.Check(first); valid {
		t.Error("the longest idle session was not evicted")
	}
}

func TestLogoutClosesTheSession(t *testing.T) {
	g, _, _, token := protected(t)

	if err := g.Logout(t.Context(), token); err != nil {
		t.Fatalf("logout: %v", err)
	}

	if _, valid := g.Check(token); valid {
		t.Error("session is valid after logout")
	}
}

func TestChangeNeedsASessionAndTheCurrentPassword(t *testing.T) {
	g, _, store, token := protected(t)
	writes := store.writes

	if _, err := g.SetPassword(t.Context(), owner, "", password, "new password"); !errors.Is(err, auth.ErrNoSession) {
		t.Errorf("change without a session: got %v, want ErrNoSession", err)
	}

	if _, err := g.SetPassword(t.Context(), owner, token, "wrong password", "new password"); !errors.Is(err, auth.ErrWrongPassword) {
		t.Errorf("change with a wrong current password: got %v, want ErrWrongPassword", err)
	}

	if store.writes != writes {
		t.Error("a rejected change wrote the file")
	}
}

func TestChangeClosesOtherSessions(t *testing.T) {
	g, _, _, token := protected(t)

	other, err := g.Login(t.Context(), stranger, password)
	if err != nil {
		t.Fatalf("second login: %v", err)
	}

	fresh, err := g.SetPassword(t.Context(), owner, token, password, "new password")
	if err != nil {
		t.Fatalf("change: %v", err)
	}

	for name, old := range map[string]string{"caller": token, "other": other} {
		if _, valid := g.Check(old); valid {
			t.Errorf("%s session survived the password change", name)
		}
	}

	if _, valid := g.Check(fresh); !valid {
		t.Error("the caller did not get a new session")
	}

	if _, err := g.Login(t.Context(), owner, password); !errors.Is(err, auth.ErrWrongPassword) {
		t.Errorf("old password after the change: got %v, want ErrWrongPassword", err)
	}
}

func TestRemovalOpensThePanel(t *testing.T) {
	g, _, store, token := protected(t)

	fresh, err := g.SetPassword(t.Context(), owner, token, password, "")
	if err != nil {
		t.Fatalf("remove: %v", err)
	}

	if fresh != "" {
		t.Error("removal returned a session")
	}

	if enabled, _ := g.Check(token); enabled {
		t.Error("panel is still protected after removal")
	}

	restarted, err := auth.New(t.Context(), store, auth.Options{})
	if err != nil {
		t.Fatalf("restart after removal: %v", err)
	}

	if enabled, _ := restarted.Check(""); enabled {
		t.Error("removal did not survive a restart")
	}
}

func TestWriteFailureKeepsTheOldPassword(t *testing.T) {
	g, _, store, token := protected(t)
	store.writeErr = errors.New("disk full")

	if _, err := g.SetPassword(t.Context(), owner, token, password, "new password"); err == nil {
		t.Fatal("change succeeded with a failing write")
	}

	if _, valid := g.Check(token); !valid {
		t.Error("a failed change closed the session")
	}

	if _, err := g.Login(t.Context(), owner, password); err != nil {
		t.Errorf("old password after a failed change: %v", err)
	}
}

func TestPasswordLength(t *testing.T) {
	tests := []struct {
		name     string
		password string
		ok       bool
	}{
		{"seven characters", "1234567", false},
		{"eight characters", "12345678", true},
		{"eight cyrillic characters", "пароль12", true},
		{"129 characters", string(make([]byte, 129)), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g, _ := newGuard(t, &fakeStore{})

			_, err := g.SetPassword(t.Context(), owner, "", "", tt.password)
			if tt.ok && err != nil {
				t.Errorf("rejected: %v", err)
			}

			if !tt.ok && !errors.Is(err, auth.ErrPasswordInvalid) {
				t.Errorf("got %v, want ErrPasswordInvalid", err)
			}
		})
	}
}

func TestBrokenFileKeepsTheDaemonDown(t *testing.T) {
	tests := []struct {
		name string
		data string
	}{
		{"not JSON", "{"},
		{"unknown algorithm", `{"algorithm":"md5","iterations":1,"salt":"AA==","key":"AA=="}`},
		{"no key", `{"algorithm":"pbkdf2-sha256","iterations":1,"salt":"AA=="}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := auth.New(t.Context(), &fakeStore{data: []byte(tt.data)}, auth.Options{}); err == nil {
				t.Error("a broken password file opened the panel")
			}
		})
	}
}

func TestOneIPv6NetworkSharesTheLockout(t *testing.T) {
	g, _, _, _ := protected(t)

	for i := range 5 {
		addr := netip.AddrFrom16([16]byte{0x20, 0x01, 0x0d, 0xb8, 15: byte(i + 1)})

		if _, err := g.Login(t.Context(), addr, "wrong password"); !errors.Is(err, auth.ErrWrongPassword) {
			t.Fatalf("wrong password %d before the limit: %v", i+1, err)
		}
	}

	sixth := netip.MustParseAddr("2001:db8::ffff:1234")
	if _, err := g.Login(t.Context(), sixth, password); !isLocked(err) {
		t.Fatalf("sixth address of the same /64: got %v, want LockedError", err)
	}

	other := netip.MustParseAddr("2001:db8:0:1::1")
	if _, err := g.Login(t.Context(), other, password); err != nil {
		t.Errorf("another /64 is locked too: %v", err)
	}
}

func TestOneIPv4NetworkSharesTheLockout(t *testing.T) {
	g, _, _, _ := protected(t)

	for i := range 5 {
		addr := netip.AddrFrom4([4]byte{192, 168, 2, byte(i + 1)})

		if _, err := g.Login(t.Context(), addr, "wrong password"); !errors.Is(err, auth.ErrWrongPassword) {
			t.Fatalf("wrong password %d before the limit: %v", i+1, err)
		}
	}

	if _, err := g.Login(t.Context(), stranger, password); !isLocked(err) {
		t.Fatalf("sixth address of the same /24: got %v, want LockedError", err)
	}

	other := netip.MustParseAddr("192.168.3.1")
	if _, err := g.Login(t.Context(), other, password); err != nil {
		t.Errorf("another /24 is locked too: %v", err)
	}
}

// failFrom sends one wrong password from the first address of n different /24.
func failFrom(t *testing.T, g *auth.Guard, n int) {
	t.Helper()

	for i := range n {
		addr := netip.AddrFrom4([4]byte{10, 0, byte(i + 1), 1})

		if _, err := g.Login(t.Context(), addr, "wrong password"); !errors.Is(err, auth.ErrWrongPassword) {
			t.Fatalf("wrong password from network %d: %v", i+1, err)
		}
	}
}

// timedLogin returns how long a correct login from the owner took on the bubble clock.
func timedLogin(t *testing.T, g *auth.Guard) time.Duration {
	t.Helper()

	started := time.Now()

	if _, err := g.Login(t.Context(), owner, password); err != nil {
		t.Fatalf("owner login: %v", err)
	}

	return time.Since(started)
}

// The slowdown tests run in a synctest bubble: the delay passes on the fake clock.
func TestGlobalBudgetSlowsEveryNetworkInsteadOfLocking(t *testing.T) {
	store := withPassword(t)

	synctest.Test(t, func(t *testing.T) {
		g, err := auth.New(t.Context(), store, auth.Options{Iterations: 1000})
		if err != nil {
			t.Fatalf("restart: %v", err)
		}

		failFrom(t, g, 9)

		if d := timedLogin(t, g); d != 0 {
			t.Errorf("login slowed below the budget by %v", d)
		}

		failFrom(t, g, 10)

		if d := timedLogin(t, g); d != 2*time.Second {
			t.Errorf("login after ten networks failed took %v, want the 2s slowdown", d)
		}

		time.Sleep(15 * time.Minute)

		if d := timedLogin(t, g); d != 0 {
			t.Errorf("login slowed after the window passed by %v", d)
		}
	})
}

func TestLockedKeysStillCountTowardsTheBudget(t *testing.T) {
	store := withPassword(t)

	synctest.Test(t, func(t *testing.T) {
		g, err := auth.New(t.Context(), store, auth.Options{Iterations: 1000})
		if err != nil {
			t.Fatalf("restart: %v", err)
		}

		for range 5 {
			failFrom(t, g, 9)
		}

		time.Sleep(6 * time.Minute)

		failFrom(t, g, 10)

		if d := timedLogin(t, g); d != 2*time.Second {
			t.Errorf("keys whose lockout expired inside the window were not counted: login took %v", d)
		}
	})
}

func TestSlowedLoginEndsWithItsContext(t *testing.T) {
	store := withPassword(t)

	synctest.Test(t, func(t *testing.T) {
		g, err := auth.New(t.Context(), store, auth.Options{Iterations: 1000})
		if err != nil {
			t.Fatalf("restart: %v", err)
		}

		failFrom(t, g, 10)

		ctx, cancel := context.WithCancel(t.Context())
		login := make(chan error, 1)
		started := time.Now()

		go func() {
			_, err := g.Login(ctx, owner, password)
			login <- err
		}()

		// The login is blocked in the wait when every goroutine of the bubble is idle.
		synctest.Wait()
		cancel()

		if err := <-login; !errors.Is(err, context.Canceled) {
			t.Errorf("slowed login cancelled while waiting: got %v, want context.Canceled", err)
		}

		if d := time.Since(started); d != 0 {
			t.Errorf("the cancelled login still waited %v", d)
		}
	})
}

func TestHashingIsBounded(t *testing.T) {
	const logins = 50

	store := withPassword(t)

	synctest.Test(t, func(t *testing.T) {
		var (
			mu       sync.Mutex
			inFlight int
			peak     int
		)

		release := make(chan struct{})

		g, err := auth.New(t.Context(), store, auth.Options{Hashing: func() {
			mu.Lock()
			inFlight++
			peak = max(peak, inFlight)
			mu.Unlock()

			<-release

			mu.Lock()
			inFlight--
			mu.Unlock()
		}})
		if err != nil {
			t.Fatalf("restart: %v", err)
		}

		errs := make(chan error, logins)

		for i := range logins {
			addr := netip.AddrFrom4([4]byte{10, 1, byte(i + 1), 1})

			go func() {
				_, err := g.Login(t.Context(), addr, password)
				errs <- err
			}()
		}

		synctest.Wait()

		mu.Lock()
		waiting := inFlight
		mu.Unlock()

		if waiting != 2 {
			t.Errorf("%d hash checks in flight while 50 logins wait, want 2", waiting)
		}

		close(release)

		for range logins {
			if err := <-errs; err != nil {
				t.Errorf("login: %v", err)
			}
		}

		if peak > 2 {
			t.Errorf("%d hash checks ran at once, want at most 2", peak)
		}
	})
}

func TestLoginDuringPasswordChangeIsRefused(t *testing.T) {
	paused := make(chan struct{})
	resume := make(chan struct{})

	g := pausedOnce(t, paused, resume)

	type result struct {
		token string
		err   error
	}

	login := make(chan result, 1)

	go func() {
		token, err := g.Login(t.Context(), stranger, password)
		login <- result{token, err}
	}()

	<-paused

	token, err := g.Login(t.Context(), owner, password)
	if err != nil {
		t.Fatalf("owner login: %v", err)
	}

	if _, err := g.SetPassword(t.Context(), owner, token, password, "new password"); err != nil {
		t.Fatalf("change while a login is checked: %v", err)
	}

	close(resume)

	got := <-login
	if !errors.Is(got.err, auth.ErrWrongPassword) {
		t.Errorf("login checked against the old password: got %v, want ErrWrongPassword", got.err)
	}

	if got.token != "" {
		if _, valid := g.Check(got.token); valid {
			t.Error("login checked against the old password opened a session")
		}
	}
}

// withPassword returns a store holding a password set with few iterations.
func withPassword(t *testing.T) *fakeStore {
	t.Helper()

	store := &fakeStore{}

	g, err := auth.New(t.Context(), store, auth.Options{Iterations: 1000})
	if err != nil {
		t.Fatalf("new guard: %v", err)
	}

	if _, err := g.SetPassword(t.Context(), owner, "", "", password); err != nil {
		t.Fatalf("set first password: %v", err)
	}

	return store
}

// pausedOnce returns a guard with a password whose first hash computation closes paused
// and waits for resume.
func pausedOnce(t *testing.T, paused chan<- struct{}, resume <-chan struct{}) *auth.Guard {
	t.Helper()

	var first atomic.Bool

	g, err := auth.New(t.Context(), withPassword(t), auth.Options{Iterations: 1000, Hashing: func() {
		if first.CompareAndSwap(false, true) {
			close(paused)
			<-resume
		}
	}})
	if err != nil {
		t.Fatalf("restart: %v", err)
	}

	return g
}

func isLocked(err error) bool {
	_, ok := errors.AsType[*auth.LockedError](err)

	return ok
}

func TestSessionFileHoldsNoTokens(t *testing.T) {
	_, _, store, token := protected(t)

	if bytes.Contains(store.sessions, []byte(token)) {
		t.Error("session file holds the token itself")
	}
}

func TestLogoutAndChangeSurviveRestart(t *testing.T) {
	g, c, store, token := protected(t)

	other, err := g.Login(t.Context(), stranger, password)
	if err != nil {
		t.Fatalf("second login: %v", err)
	}

	if err := g.Logout(t.Context(), other); err != nil {
		t.Fatalf("logout: %v", err)
	}

	restarted, err := auth.New(t.Context(), store, auth.Options{Now: c.now, Iterations: 1000})
	if err != nil {
		t.Fatalf("restart: %v", err)
	}

	if _, valid := restarted.Check(other); valid {
		t.Error("a session closed by logout came back after a restart")
	}

	if _, valid := restarted.Check(token); !valid {
		t.Fatal("a live session did not survive the restart")
	}

	if _, err := restarted.SetPassword(t.Context(), owner, token, password, "new password"); err != nil {
		t.Fatalf("change: %v", err)
	}

	again, err := auth.New(t.Context(), store, auth.Options{Now: c.now, Iterations: 1000})
	if err != nil {
		t.Fatalf("second restart: %v", err)
	}

	if _, valid := again.Check(token); valid {
		t.Error("a session closed by the password change came back after a restart")
	}
}

func TestIdleSessionExpiresAcrossRestart(t *testing.T) {
	_, c, store, token := protected(t)

	c.advance(auth.SessionIdle)

	restarted, err := auth.New(t.Context(), store, auth.Options{Now: c.now, Iterations: 1000})
	if err != nil {
		t.Fatalf("restart: %v", err)
	}

	if _, valid := restarted.Check(token); valid {
		t.Error("a session idle past the limit came back after a restart")
	}
}

func TestBrokenSessionFileStartsWithoutSessions(t *testing.T) {
	tests := []struct {
		name  string
		setup func(store *fakeStore)
	}{
		{"missing", func(store *fakeStore) { store.sessions = nil }},
		{"not JSON", func(store *fakeStore) { store.sessions = []byte("{") }},
		{"unreadable", func(store *fakeStore) { store.sessionsReadErr = errors.New("permission denied") }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, c, store, token := protected(t)
			tt.setup(store)

			restarted, err := auth.New(t.Context(), store, auth.Options{Now: c.now, Iterations: 1000})
			if err != nil {
				t.Fatalf("a broken session file kept the daemon down: %v", err)
			}

			if enabled, valid := restarted.Check(token); !enabled || valid {
				t.Errorf("enabled %v, valid %v; want a protected panel without sessions", enabled, valid)
			}

			if _, err := restarted.Login(t.Context(), owner, password); err != nil {
				t.Errorf("login after a broken session file: %v", err)
			}
		})
	}
}

func TestSessionWriteFailureDoesNotRefuseLogin(t *testing.T) {
	g, _, store, _ := protected(t)
	store.sessionWriteErr = errors.New("disk full")

	token, err := g.Login(t.Context(), owner, password)
	if err != nil {
		t.Fatalf("login with a failing session write: %v", err)
	}

	if _, valid := g.Check(token); !valid {
		t.Error("session from login is not valid")
	}
}

// TestLogoutReportsAFailedSessionWrite runs in a synctest bubble: the retry pause between
// the two writes passes on the fake clock.
func TestLogoutReportsAFailedSessionWrite(t *testing.T) {
	store := withPassword(t)

	synctest.Test(t, func(t *testing.T) {
		g, err := auth.New(t.Context(), store, auth.Options{Iterations: 1000})
		if err != nil {
			t.Fatalf("restart: %v", err)
		}

		token, err := g.Login(t.Context(), owner, password)
		if err != nil {
			t.Fatalf("login: %v", err)
		}

		store.sessionWriteErr = errors.New("disk full")

		if err := g.Logout(t.Context(), token); !errors.Is(err, auth.ErrSessionNotRevoked) {
			t.Errorf("logout with a failing session write: got %v, want ErrSessionNotRevoked", err)
		}

		if _, valid := g.Check(token); valid {
			t.Error("session is valid after a logout whose write failed")
		}

		if err := g.Logout(t.Context(), token); err != nil {
			t.Errorf("logout of an unknown token: %v", err)
		}
	})
}

func TestLogoutRetriesTheSessionWriteOnce(t *testing.T) {
	store := withPassword(t)

	synctest.Test(t, func(t *testing.T) {
		g, err := auth.New(t.Context(), store, auth.Options{Iterations: 1000})
		if err != nil {
			t.Fatalf("restart: %v", err)
		}

		token, err := g.Login(t.Context(), owner, password)
		if err != nil {
			t.Fatalf("login: %v", err)
		}

		store.sessionWriteErr = errors.New("disk full")
		store.sessionWriteFailsOnce = true

		if err := g.Logout(t.Context(), token); err != nil {
			t.Fatalf("logout with a write that fails once: %v", err)
		}

		restarted, err := auth.New(t.Context(), store, auth.Options{Iterations: 1000})
		if err != nil {
			t.Fatalf("restart: %v", err)
		}

		if _, valid := restarted.Check(token); valid {
			t.Error("a session closed by logout came back after a restart")
		}
	})
}

func TestEndedClosesOnLogoutAndChange(t *testing.T) {
	g, _, _, token := protected(t)

	other, err := g.Login(t.Context(), stranger, password)
	if err != nil {
		t.Fatalf("second login: %v", err)
	}

	otherEnded := g.Ended(other)
	callerEnded := g.Ended(token)

	if err := g.Logout(t.Context(), other); err != nil {
		t.Fatalf("logout: %v", err)
	}

	select {
	case <-otherEnded:
	default:
		t.Error("logout did not end the session")
	}

	select {
	case <-callerEnded:
		t.Fatal("logout of another session ended the caller's")
	default:
	}

	if _, err := g.SetPassword(t.Context(), owner, token, password, "new password"); err != nil {
		t.Fatalf("change: %v", err)
	}

	select {
	case <-callerEnded:
	default:
		t.Error("password change did not end the session")
	}

	select {
	case <-g.Ended("unknown"):
	default:
		t.Error("a token without a session is not ended")
	}
}

func TestSessionSurvivesAClockBehindTheSaveTime(t *testing.T) {
	_, _, store, token := protected(t)

	booted := &clock{at: time.Unix(0, 0).UTC()}

	restarted, err := auth.New(t.Context(), store, auth.Options{Now: booted.now, Iterations: 1000})
	if err != nil {
		t.Fatalf("restart: %v", err)
	}

	if _, valid := restarted.Check(token); !valid {
		t.Error("a router clock behind the save time dropped the session")
	}
}

func TestFailedSaveAfterAChangeDoesNotBringSessionsBack(t *testing.T) {
	g, c, store, token := protected(t)
	store.sessionWriteErr = errors.New("disk full")

	if _, err := g.SetPassword(t.Context(), owner, token, password, "new password"); err != nil {
		t.Fatalf("change: %v", err)
	}

	restarted, err := auth.New(t.Context(), store, auth.Options{Now: c.now, Iterations: 1000})
	if err != nil {
		t.Fatalf("restart: %v", err)
	}

	if _, valid := restarted.Check(token); valid {
		t.Error("a session closed by the password change came back from a stale session file")
	}
}

func TestSessionsListTheCallerFirstWithoutTokens(t *testing.T) {
	g, c, _, token := protected(t)

	c.advance(time.Hour)

	other, err := g.Login(t.Context(), stranger, password)
	if err != nil {
		t.Fatalf("second login: %v", err)
	}

	c.advance(time.Minute)

	list := g.Sessions(token)
	if len(list) != 2 {
		t.Fatalf("got %d sessions, want 2", len(list))
	}

	if !list[0].Current || list[1].Current {
		t.Errorf("current flags %v, %v: want the caller first", list[0].Current, list[1].Current)
	}

	if list[0].Addr != owner || list[1].Addr != stranger {
		t.Errorf("addresses %v, %v, want %v, %v", list[0].Addr, list[1].Addr, owner, stranger)
	}

	if list[0].Age != time.Hour+time.Minute || list[1].Age != time.Minute || list[1].Idle != time.Minute {
		t.Errorf("durations %+v, %+v", list[0], list[1])
	}

	for _, s := range list {
		if s.ID == "" || strings.Contains(token+other, s.ID) {
			t.Errorf("identifier %q is empty or part of a token", s.ID)
		}
	}
}

func TestEndSessionClosesAnotherSession(t *testing.T) {
	g, _, store, token := protected(t)

	other, err := g.Login(t.Context(), stranger, password)
	if err != nil {
		t.Fatalf("second login: %v", err)
	}

	ended := g.Ended(other)

	var id string
	for _, s := range g.Sessions(token) {
		if !s.Current {
			id = s.ID
		}
	}

	addr, err := g.EndSession(t.Context(), token, id)
	if err != nil {
		t.Fatalf("end session: %v", err)
	}

	if addr != stranger {
		t.Errorf("ended session address %v, want %v", addr, stranger)
	}

	if _, valid := g.Check(other); valid {
		t.Error("ended session is still valid")
	}

	select {
	case <-ended:
	default:
		t.Error("ended channel did not close")
	}

	if _, valid := g.Check(token); !valid {
		t.Error("the caller's session ended too")
	}

	restarted, err := auth.New(t.Context(), store, auth.Options{Iterations: 1000})
	if err != nil {
		t.Fatalf("restart: %v", err)
	}

	if _, valid := restarted.Check(other); valid {
		t.Error("ended session came back after restart")
	}
}

func TestEndSessionRefusesTheCallerAndUnknownIDs(t *testing.T) {
	g, _, _, token := protected(t)

	own := g.Sessions(token)[0].ID

	if _, err := g.EndSession(t.Context(), token, own); !errors.Is(err, auth.ErrCurrentSession) {
		t.Errorf("own session: got %v, want ErrCurrentSession", err)
	}

	if _, valid := g.Check(token); !valid {
		t.Error("the caller's session ended")
	}

	if _, err := g.EndSession(t.Context(), token, "unknown"); !errors.Is(err, auth.ErrUnknownSession) {
		t.Errorf("unknown id: got %v, want ErrUnknownSession", err)
	}
}

func TestSessionAddressAndAgeSurviveRestart(t *testing.T) {
	g, c, store, token := protected(t)

	before := g.Sessions(token)[0]
	c.advance(time.Hour)

	restarted, err := auth.New(t.Context(), store, auth.Options{Now: c.now, Iterations: 1000})
	if err != nil {
		t.Fatalf("restart: %v", err)
	}

	after := restarted.Sessions(token)
	if len(after) != 1 || after[0].ID != before.ID || after[0].Addr != owner || after[0].Age != time.Hour {
		t.Errorf("after restart %+v, before %+v", after, before)
	}
}
