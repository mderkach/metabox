package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/netip"
	"strconv"
	"strings"

	"metabox/internal/auth"
	"metabox/internal/contract"
)

const sessionCookie = "metabox_session"

// maxAuthBytes is the ceiling of the login and password change bodies: two passwords of
// at most 128 characters each.
const maxAuthBytes = 4 << 10

// Guard is the optional panel password and its sessions. The interface is declared here,
// at the consumer.
type Guard interface {
	Check(token string) (enabled, valid bool)
	Login(addr netip.Addr, password string) (string, error)
	Logout(token string)
	SetPassword(ctx context.Context, addr netip.Addr, token, current, next string) (string, error)
}

// requireSession lets a request without a session through only while the panel has no
// password, or to an address that must answer before login: the health check, the SPA
// static files and the login endpoints.
func requireSession(log *slog.Logger, guard Guard, next http.Handler) http.Handler {
	if guard == nil {
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if exemptFromSession(r) {
			next.ServeHTTP(w, r)

			return
		}

		if enabled, valid := guard.Check(sessionToken(r)); enabled && !valid {
			log.Debug("запрос без сессии", "method", r.Method, "path", r.URL.Path)
			fail(log, w, r, errUnauthorized)

			return
		}

		next.ServeHTTP(w, r)
	})
}

func exemptFromSession(r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/") {
		return true
	}

	switch r.Method + " " + r.URL.Path {
	case "GET /api/auth", "POST /api/auth/login", "POST /api/auth/logout":
		return true
	default:
		return false
	}
}

func sessionToken(r *http.Request) string {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return ""
	}

	return cookie.Value
}

// clientAddr is the address the lockout counts by. Behind the dev server proxy every
// client has the proxy address.
func clientAddr(r *http.Request) netip.Addr {
	addrPort, err := netip.ParseAddrPort(r.RemoteAddr)
	if err != nil {
		return netip.Addr{}
	}

	return addrPort.Addr().Unmap()
}

// setSession sends the session cookie. Without Max-Age the browser keeps it until it is
// closed, and the daemon ends an idle session itself. Secure follows the request: with
// HTTPS off the panel is served over plain http in the LAN, and a browser drops a Secure
// cookie on such a page.
func setSession(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteStrictMode,
	})
}

func clearSession(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteStrictMode,
	})
}

// noStore keeps login answers out of the browser and proxy caches: a cached
// `{"authenticated":true}` or a cached Set-Cookie would outlive the session it describes.
func noStore(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next(w, r)
	}
}

func (s *Server) handleAuth(w http.ResponseWriter, r *http.Request) {
	enabled, valid := s.auth.Check(sessionToken(r))

	writeJSON(s.log, w, http.StatusOK, contract.Auth{Enabled: enabled, Authenticated: valid})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req contract.Login
	if err := readAuthBody(w, r, &req); err != nil {
		fail(s.log, w, r, err)

		return
	}

	addr := clientAddr(r)

	token, err := s.auth.Login(addr, req.Password)
	if err != nil {
		s.logRejected("вход отклонён", addr, err)
		fail(s.log, w, r, err)

		return
	}

	s.log.Info("вход в панель", "addr", addr)
	setSession(w, r, token)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	s.auth.Logout(sessionToken(r))
	clearSession(w, r)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePassword(w http.ResponseWriter, r *http.Request) {
	var req contract.PasswordChange
	if err := readAuthBody(w, r, &req); err != nil {
		fail(s.log, w, r, err)

		return
	}

	addr := clientAddr(r)
	wasEnabled, _ := s.auth.Check(sessionToken(r))

	token, err := s.auth.SetPassword(r.Context(), addr, sessionToken(r), req.Current, req.Password)
	if err != nil {
		s.logRejected("смена пароля отклонена", addr, err)
		fail(s.log, w, r, err)

		return
	}

	switch {
	case token == "" && wasEnabled:
		s.log.Info("пароль панели снят", "addr", addr)
		clearSession(w, r)
	case token == "":
		clearSession(w, r)
	default:
		s.log.Info("пароль панели задан", "addr", addr)
		setSession(w, r, token)
	}

	w.WriteHeader(http.StatusNoContent)
}

// logRejected logs a guessing attempt and a lockout: both are a safeguard that fired.
// Other failures are logged by fail.
func (s *Server) logRejected(msg string, addr netip.Addr, err error) {
	if _, locked := errors.AsType[*auth.LockedError](err); locked || errors.Is(err, auth.ErrWrongPassword) {
		s.log.Warn(msg, "addr", addr, "err", err)
	}
}

func readAuthBody(w http.ResponseWriter, r *http.Request, dst any) error {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxAuthBytes))
	if err != nil {
		// Joined with the body failure: a bare MaxBytesError maps to config_too_large.
		return errors.Join(errBadAuthBody, err)
	}

	if err := json.Unmarshal(body, dst); err != nil {
		return errors.Join(errBadAuthBody, err)
	}

	return nil
}

// retryAfter rounds the lockout up to whole seconds: zero would invite an immediate retry.
func retryAfter(err *auth.LockedError) string {
	return strconv.Itoa(int(math.Ceil(err.RetryAfter.Seconds())))
}
