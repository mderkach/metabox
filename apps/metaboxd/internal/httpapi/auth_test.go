package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"metabox/internal/auth"
	"metabox/internal/contract"
	"metabox/internal/httpapi"
)

type memoryAuthStore struct {
	data, sessions []byte

	sessionWriteErr error
	// sessionWriteFailsOnce clears sessionWriteErr after the first failed write.
	sessionWriteFailsOnce bool
}

func (m *memoryAuthStore) ReadAuth(context.Context) ([]byte, error) {
	if m.data == nil {
		return nil, fs.ErrNotExist
	}

	return m.data, nil
}

func (m *memoryAuthStore) WriteAuth(_ context.Context, data []byte) error {
	m.data = data

	return nil
}

func (m *memoryAuthStore) ReadSessions(context.Context) ([]byte, error) {
	if m.sessions == nil {
		return nil, fs.ErrNotExist
	}

	return m.sessions, nil
}

// WriteSessions refuses a cancelled context like the daemon store does.
func (m *memoryAuthStore) WriteSessions(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	if err := m.sessionWriteErr; err != nil {
		if m.sessionWriteFailsOnce {
			m.sessionWriteErr = nil
		}

		return err
	}

	m.sessions = data

	return nil
}

const panelPassword = "correct horse"

// browser holds the cookies like the panel's browser does: the session goes with every
// request to the same origin.
type browser struct {
	t      *testing.T
	srv    *httptest.Server
	client *http.Client
}

func newAuthServer(t *testing.T) *browser {
	t.Helper()

	return newAuthServerWith(t, &memoryAuthStore{})
}

func newAuthServerWith(t *testing.T, store *memoryAuthStore) *browser {
	t.Helper()

	guard, err := auth.New(t.Context(), store, auth.Options{Iterations: 1000})
	if err != nil {
		t.Fatalf("guard: %v", err)
	}

	srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{
		Version: "test",
		Auth:    guard,
	}))
	t.Cleanup(srv.Close)

	return newBrowser(t, srv)
}

func newBrowser(t *testing.T, srv *httptest.Server) *browser {
	t.Helper()

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookie jar: %v", err)
	}

	client := srv.Client()
	client.Jar = jar

	return &browser{t: t, srv: srv, client: client}
}

func (b *browser) do(method, path string, body any) response {
	b.t.Helper()

	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			b.t.Fatalf("body: %v", err)
		}

		reader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(b.t.Context(), method, b.srv.URL+path, reader)
	if err != nil {
		b.t.Fatalf("building %s %s: %v", method, path, err)
	}

	req.Header.Set("Origin", b.srv.URL)

	resp, err := b.client.Do(req)
	if err != nil {
		b.t.Fatalf("request %s %s: %v", method, path, err)
	}
	defer func() { _ = resp.Body.Close() }()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		b.t.Fatalf("reading %s %s: %v", method, path, err)
	}

	return response{status: resp.StatusCode, contentType: resp.Header.Get("Content-Type"), header: resp.Header, body: string(data)}
}

// sessionCookie is the session token the browser holds for the server.
func (b *browser) sessionCookie() string {
	b.t.Helper()

	u, err := url.Parse(b.srv.URL)
	if err != nil {
		b.t.Fatal(err)
	}

	for _, c := range b.client.Jar.Cookies(u) {
		if c.Name == "metabox_session" {
			return c.Value
		}
	}

	return ""
}

func (b *browser) setPassword(current, next string) response {
	b.t.Helper()

	return b.do(http.MethodPut, "/api/auth/password", contract.PasswordChange{Current: current, Password: next})
}

func wantCode(t *testing.T, r response, status int, code contract.ErrorCode) {
	t.Helper()

	if r.status != status {
		t.Fatalf("status %d, want %d; body %s", r.status, status, r.body)
	}

	var body contract.Error
	r.decode(t, &body)

	if body.Code != code {
		t.Errorf("code %q, want %q", body.Code, code)
	}
}

func TestWithoutPasswordTheAPIIsOpen(t *testing.T) {
	b := newAuthServer(t)

	if r := b.do(http.MethodGet, "/api/status", nil); r.status != http.StatusOK {
		t.Errorf("status without a password: %d", r.status)
	}

	var state contract.Auth
	b.do(http.MethodGet, "/api/auth", nil).decode(t, &state)

	if state.Enabled {
		t.Error("auth state reports a password")
	}

	wantCode(t, b.do(http.MethodPost, "/api/auth/login", contract.Login{Password: panelPassword}),
		http.StatusConflict, contract.ErrAuthDisabled)
}

func TestSettingThePasswordLogsTheCallerIn(t *testing.T) {
	b := newAuthServer(t)

	r := b.setPassword("", panelPassword)
	if r.status != http.StatusNoContent {
		t.Fatalf("set password: %d %s", r.status, r.body)
	}

	cookie := r.header.Get("Set-Cookie")
	for _, attr := range []string{"metabox_session=", "HttpOnly", "SameSite=Strict", "Path=/"} {
		if !bytes.Contains([]byte(cookie), []byte(attr)) {
			t.Errorf("cookie %q lacks %q", cookie, attr)
		}
	}

	if r := b.do(http.MethodGet, "/api/status", nil); r.status != http.StatusOK {
		t.Errorf("status with the session: %d", r.status)
	}

	var state contract.Auth
	b.do(http.MethodGet, "/api/auth", nil).decode(t, &state)

	if !state.Enabled || !state.Authenticated {
		t.Errorf("auth state %+v, want enabled and authenticated", state)
	}
}

func TestWithPasswordARequestWithoutSessionGets401(t *testing.T) {
	b := newAuthServer(t)
	b.setPassword("", panelPassword)

	stranger := newBrowser(t, b.srv)

	for _, path := range []string{"/api/status", "/api/config", "/api/unknown"} {
		wantCode(t, stranger.do(http.MethodGet, path, nil), http.StatusUnauthorized, contract.ErrUnauthorized)
	}

	wantCode(t, stranger.setPassword("", "stolen password"), http.StatusUnauthorized, contract.ErrUnauthorized)
}

func TestExemptAddressesAnswerWithoutSession(t *testing.T) {
	b := newAuthServer(t)
	b.setPassword("", panelPassword)

	stranger := newBrowser(t, b.srv)

	for _, path := range []string{"/healthz", "/api/auth", "/", "/connections"} {
		if r := stranger.do(http.MethodGet, path, nil); r.status == http.StatusUnauthorized {
			t.Errorf("%s answered 401 before login", path)
		}
	}

	if r := stranger.do(http.MethodPost, "/api/auth/logout", nil); r.status != http.StatusNoContent {
		t.Errorf("logout without a session: %d", r.status)
	}
}

func TestForeignOriginGets403BeforeTheSessionCheck(t *testing.T) {
	b := newAuthServer(t)
	b.setPassword("", panelPassword)

	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, b.srv.URL+"/api/apply", bytes.NewReader([]byte("{}")))
	if err != nil {
		t.Fatal(err)
	}

	req.Header.Set("Origin", "http://evil.example")

	resp, err := b.srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("foreign origin: status %d, want 403", resp.StatusCode)
	}
}

func TestLoginAndLogout(t *testing.T) {
	b := newAuthServer(t)
	b.setPassword("", panelPassword)

	other := newBrowser(t, b.srv)

	wantCode(t, other.do(http.MethodPost, "/api/auth/login", contract.Login{Password: "wrong password"}),
		http.StatusForbidden, contract.ErrPasswordWrong)

	if r := other.do(http.MethodPost, "/api/auth/login", contract.Login{Password: panelPassword}); r.status != http.StatusNoContent {
		t.Fatalf("login: %d %s", r.status, r.body)
	}

	if r := other.do(http.MethodGet, "/api/status", nil); r.status != http.StatusOK {
		t.Fatalf("status after login: %d", r.status)
	}

	r := other.do(http.MethodPost, "/api/auth/logout", nil)
	if r.status != http.StatusNoContent {
		t.Fatalf("logout: %d", r.status)
	}

	if !bytes.Contains([]byte(r.header.Get("Set-Cookie")), []byte("Max-Age=0")) {
		t.Errorf("logout did not clear the cookie: %q", r.header.Get("Set-Cookie"))
	}

	wantCode(t, other.do(http.MethodGet, "/api/status", nil), http.StatusUnauthorized, contract.ErrUnauthorized)
}

// The two logout tests below wait the real retry pause of the guard: the server runs over
// the network, outside a synctest bubble.
func TestLogoutWhoseWriteFailsIsAnError(t *testing.T) {
	store := &memoryAuthStore{}
	b := newAuthServerWith(t, store)
	b.setPassword("", panelPassword)

	store.sessionWriteErr = errors.New("disk full")

	r := b.do(http.MethodPost, "/api/auth/logout", nil)
	wantCode(t, r, http.StatusInternalServerError, contract.ErrLogoutNotSaved)

	if !bytes.Contains([]byte(r.header.Get("Set-Cookie")), []byte("Max-Age=0")) {
		t.Errorf("a failed logout did not clear the cookie: %q", r.header.Get("Set-Cookie"))
	}

	wantCode(t, b.do(http.MethodGet, "/api/status", nil), http.StatusUnauthorized, contract.ErrUnauthorized)
}

func TestLogoutWhoseWriteFailsOnceSucceeds(t *testing.T) {
	store := &memoryAuthStore{}
	b := newAuthServerWith(t, store)
	b.setPassword("", panelPassword)

	store.sessionWriteErr = errors.New("disk full")
	store.sessionWriteFailsOnce = true

	if r := b.do(http.MethodPost, "/api/auth/logout", nil); r.status != http.StatusNoContent {
		t.Fatalf("logout with a write that fails once: %d %s", r.status, r.body)
	}
}

func TestGuessingLocksTheAddress(t *testing.T) {
	b := newAuthServer(t)
	b.setPassword("", panelPassword)

	guesser := newBrowser(t, b.srv)

	for range 5 {
		guesser.do(http.MethodPost, "/api/auth/login", contract.Login{Password: "wrong password"})
	}

	r := guesser.do(http.MethodPost, "/api/auth/login", contract.Login{Password: panelPassword})
	wantCode(t, r, http.StatusTooManyRequests, contract.ErrLoginLocked)

	if got := r.header.Get("Retry-After"); got != "300" {
		t.Errorf("Retry-After %q, want 300", got)
	}
}

func TestPasswordChangeAndRemoval(t *testing.T) {
	b := newAuthServer(t)
	b.setPassword("", panelPassword)

	wantCode(t, b.setPassword("wrong password", "new password"), http.StatusForbidden, contract.ErrPasswordWrong)
	wantCode(t, b.setPassword(panelPassword, "short"), http.StatusBadRequest, contract.ErrPasswordInvalid)

	if r := b.setPassword(panelPassword, "new password"); r.status != http.StatusNoContent {
		t.Fatalf("change: %d %s", r.status, r.body)
	}

	if r := b.do(http.MethodGet, "/api/status", nil); r.status != http.StatusOK {
		t.Fatalf("the caller lost the session after the change: %d", r.status)
	}

	if r := b.setPassword("new password", ""); r.status != http.StatusNoContent {
		t.Fatalf("removal: %d %s", r.status, r.body)
	}

	if r := newBrowser(t, b.srv).do(http.MethodGet, "/api/status", nil); r.status != http.StatusOK {
		t.Errorf("status without a password after removal: %d", r.status)
	}
}

// The session of a password change request ends inside the call, which cancels the
// request context; the new session must still reach the file.
func TestSessionFromAPasswordChangeSurvivesRestart(t *testing.T) {
	store := &memoryAuthStore{}
	b := newAuthServerWith(t, store)
	b.setPassword("", panelPassword)

	if r := b.setPassword(panelPassword, "new password"); r.status != http.StatusNoContent {
		t.Fatalf("change: %d %s", r.status, r.body)
	}

	restarted, err := auth.New(t.Context(), store, auth.Options{Iterations: 1000})
	if err != nil {
		t.Fatalf("restart: %v", err)
	}

	if _, valid := restarted.Check(b.sessionCookie()); !valid {
		t.Error("the session from the password change did not survive a restart")
	}
}

func TestBrokenAuthBody(t *testing.T) {
	b := newAuthServer(t)

	req, err := http.NewRequestWithContext(t.Context(), http.MethodPut, b.srv.URL+"/api/auth/password", bytes.NewReader([]byte("{")))
	if err != nil {
		t.Fatal(err)
	}

	req.Header.Set("Origin", b.srv.URL)

	resp, err := b.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("broken body: status %d, want 400", resp.StatusCode)
	}
}

func TestLoginAnswersAreNotCached(t *testing.T) {
	b := newAuthServer(t)

	answers := map[string]response{
		"state":    b.do(http.MethodGet, "/api/auth", nil),
		"password": b.setPassword("", panelPassword),
		"login":    b.do(http.MethodPost, "/api/auth/login", contract.Login{Password: "wrong password"}),
		"logout":   b.do(http.MethodPost, "/api/auth/logout", nil),
	}

	for name, r := range answers {
		if got := r.header.Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s: Cache-Control %q, want no-store", name, got)
		}
	}
}

func TestOversizedLoginBodyIsAPasswordFailure(t *testing.T) {
	b := newAuthServer(t)

	wantCode(t, b.do(http.MethodPost, "/api/auth/login", contract.Login{Password: strings.Repeat("x", 8<<10)}),
		http.StatusBadRequest, contract.ErrPasswordInvalid)
}

// heldStream answers like an event stream and holds the connection until the request
// context ends; stopped closes then.
type heldStream struct{ stopped chan struct{} }

func (h *heldStream) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	_ = http.NewResponseController(w).Flush()

	<-r.Context().Done()
	close(h.stopped)
}

func newStreamAuthServer(t *testing.T) (*browser, *heldStream, *fakeLogs) {
	t.Helper()

	guard, err := auth.New(t.Context(), &memoryAuthStore{}, auth.Options{Iterations: 1000})
	if err != nil {
		t.Fatalf("guard: %v", err)
	}

	events := &heldStream{stopped: make(chan struct{})}
	logs := &fakeLogs{stopped: make(chan struct{})}

	srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{
		Version: "test",
		Auth:    guard,
		Events:  events,
		Logs:    logs,
	}))
	t.Cleanup(srv.Close)

	return newBrowser(t, srv), events, logs
}

// openStream opens an event stream with the browser's session. It sends no Accept: the
// session must close the stream whatever the client asked for.
func (b *browser) openStream(path string) {
	b.t.Helper()

	req, err := http.NewRequestWithContext(b.t.Context(), http.MethodGet, b.srv.URL+path, nil)
	if err != nil {
		b.t.Fatal(err)
	}

	resp, err := b.client.Do(req)
	if err != nil {
		b.t.Fatalf("stream %s: %v", path, err)
	}

	b.t.Cleanup(func() { _ = resp.Body.Close() })

	if resp.StatusCode != http.StatusOK {
		b.t.Fatalf("stream %s: status %d", path, resp.StatusCode)
	}
}

func waitStopped(t *testing.T, stopped <-chan struct{}, what string) {
	t.Helper()

	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatalf("%s kept running", what)
	}
}

func TestLogoutClosesTheStreamsOfTheSession(t *testing.T) {
	b, events, logs := newStreamAuthServer(t)
	b.setPassword("", panelPassword)

	b.openStream("/api/events")
	b.openStream("/api/logs/stream")

	if r := b.do(http.MethodPost, "/api/auth/logout", nil); r.status != http.StatusNoContent {
		t.Fatalf("logout: %d", r.status)
	}

	waitStopped(t, events.stopped, "the event stream after logout")
	waitStopped(t, logs.stopped, "the log stream after logout")
}

func TestPasswordChangeClosesTheStreamsOfOtherSessions(t *testing.T) {
	b, events, logs := newStreamAuthServer(t)
	b.setPassword("", panelPassword)

	other := newBrowser(t, b.srv)
	if r := other.do(http.MethodPost, "/api/auth/login", contract.Login{Password: panelPassword}); r.status != http.StatusNoContent {
		t.Fatalf("login: %d %s", r.status, r.body)
	}

	other.openStream("/api/events")
	other.openStream("/api/logs/stream")

	if r := b.setPassword(panelPassword, "new password"); r.status != http.StatusNoContent {
		t.Fatalf("change: %d %s", r.status, r.body)
	}

	waitStopped(t, events.stopped, "the event stream after the password change")
	waitStopped(t, logs.stopped, "the log stream after the password change")
}
