package auth_test

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"net/netip"
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

type clock struct{ at time.Time }

func (c *clock) now() time.Time { return c.at }

func (c *clock) advance(d time.Duration) { c.at = c.at.Add(d) }

var (
	owner    = netip.MustParseAddr("192.168.1.10")
	stranger = netip.MustParseAddr("192.168.1.66")
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

func TestFirstPasswordOpensASessionAndSurvivesRestart(t *testing.T) {
	g, _, store, token := protected(t)

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

	restarted, err := auth.New(t.Context(), store, auth.Options{Iterations: 1000})
	if err != nil {
		t.Fatalf("restart: %v", err)
	}

	if _, valid := restarted.Check(token); valid {
		t.Error("session survived a daemon restart")
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
		t.Errorf("another address is locked too: %v", err)
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

	g.Logout(token)

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

func TestIPv4AddressesAreCountedApart(t *testing.T) {
	g, _, _, _ := protected(t)

	for range 4 {
		_, _ = g.Login(t.Context(), stranger, "wrong password")
	}

	neighbour := netip.MustParseAddr("192.168.1.67")
	if _, err := g.Login(t.Context(), neighbour, "wrong password"); !errors.Is(err, auth.ErrWrongPassword) {
		t.Errorf("a neighbouring IPv4 address shares the lockout: %v", err)
	}
}

func TestGlobalBudgetLocksEveryAddress(t *testing.T) {
	g, c, _, _ := protected(t)

	for i := range 9 {
		addr := netip.AddrFrom4([4]byte{10, 0, 0, byte(i + 1)})

		if _, err := g.Login(t.Context(), addr, "wrong password"); !errors.Is(err, auth.ErrWrongPassword) {
			t.Fatalf("wrong password from address %d: %v", i+1, err)
		}
	}

	if _, err := g.Login(t.Context(), owner, password); err != nil {
		t.Fatalf("login locked below the budget: %v", err)
	}

	tenth := netip.AddrFrom4([4]byte{10, 0, 0, 10})
	if _, err := g.Login(t.Context(), tenth, "wrong password"); !errors.Is(err, auth.ErrWrongPassword) {
		t.Fatalf("wrong password from the tenth address: %v", err)
	}

	_, err := g.Login(t.Context(), owner, password)

	locked, ok := errors.AsType[*auth.LockedError](err)
	if !ok {
		t.Fatalf("login after ten addresses failed: got %v, want LockedError", err)
	}

	if locked.RetryAfter != 5*time.Minute {
		t.Errorf("retry after %v, want 5m", locked.RetryAfter)
	}

	c.advance(5 * time.Minute)

	if _, err := g.Login(t.Context(), owner, password); err != nil {
		t.Errorf("login after the global lockout expired: %v", err)
	}
}

func TestLockedKeysStillCountTowardsTheBudget(t *testing.T) {
	g, c, _, _ := protected(t)

	for i := range 9 {
		addr := netip.AddrFrom4([4]byte{10, 0, 0, byte(i + 1)})

		for range 5 {
			_, _ = g.Login(t.Context(), addr, "wrong password")
		}
	}

	c.advance(6 * time.Minute)

	tenth := netip.AddrFrom4([4]byte{10, 0, 0, 10})
	if _, err := g.Login(t.Context(), tenth, "wrong password"); !errors.Is(err, auth.ErrWrongPassword) {
		t.Fatalf("wrong password from the tenth address: %v", err)
	}

	if _, err := g.Login(t.Context(), owner, password); !isLocked(err) {
		t.Errorf("keys whose lockout expired inside the window were not counted: got %v", err)
	}
}

func TestQueuedCheckDoesNotPassTheGlobalLockout(t *testing.T) {
	paused := make(chan struct{})
	resume := make(chan struct{})

	g := pausedOnce(t, paused, resume)

	login := make(chan error, 1)

	go func() {
		_, err := g.Login(t.Context(), owner, password)
		login <- err
	}()

	<-paused

	for i := range 10 {
		addr := netip.AddrFrom4([4]byte{10, 0, 0, byte(i + 1)})

		if _, err := g.Login(t.Context(), addr, "wrong password"); !errors.Is(err, auth.ErrWrongPassword) {
			t.Fatalf("wrong password from address %d: %v", i+1, err)
		}
	}

	close(resume)

	if err := <-login; !isLocked(err) {
		t.Errorf("check queued before the global lockout: got %v, want LockedError", err)
	}
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
			addr := netip.AddrFrom4([4]byte{10, 1, 0, byte(i + 1)})

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
