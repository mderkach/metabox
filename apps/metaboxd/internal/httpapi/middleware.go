package httpapi

import (
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"runtime/debug"
	"strings"
	"time"

	"metabox/internal/contract"
)

func (s *Server) middleware(next http.Handler) http.Handler {
	// recoverPanic is outermost: a panic in logging would otherwise crash the process.
	return recoverPanic(s.log,
		logRequests(s.log,
			checkHost(s.log, s.allowedOrigin,
				checkOrigin(s.log, s.allowedOrigin, next))))
}

func recoverPanic(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}

			// http.ErrAbortHandler is the regular way to abort a response, it is
			// passed further up the stack untouched.
			if err, ok := rec.(error); ok && errors.Is(err, http.ErrAbortHandler) {
				panic(rec)
			}

			log.Error("паника в обработчике",
				"err", rec,
				"method", r.Method,
				"path", r.URL.Path,
				"stack", string(debug.Stack()),
			)
			// The response is in the contract format: the panel parses the body of any error
			// and without it would show a parse failure instead of the failure. A panic
			// in the middle of an already started response appends the body to its tail: the header
			// has gone by then, and there is no other way to refuse.
			writeJSON(log, w, http.StatusInternalServerError, contract.Error{
				Code:    contract.ErrInternal,
				Message: "внутренняя ошибка",
			})
		}()

		next.ServeHTTP(w, r)
	})
}

func logRequests(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(rec, r)

		log.Debug("запрос",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

// checkHost cuts off DNS rebinding: the attacker's domain pointed at the panel
// address comes with its own name in Host, and for its page the panel is
// same-origin, so the Origin check does not catch such a request. All
// methods are checked: a read through rebinding leaks the config with secrets and the
// network connections.
func checkHost(log *slog.Logger, allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hostAllowed(r.Host, allowedOrigin) {
			log.Warn("запрос отклонён по Host",
				"host", r.Host,
				"method", r.Method,
				"path", r.URL.Path,
			)
			fail(log, w, r, errHostMismatch)

			return
		}

		next.ServeHTTP(w, r)
	})
}

// hostAllowed accepts an IP literal, localhost and the host from -allowed-origin.
// The list is closed: the daemon has nothing to tell the owner's DNS name from the attacker's domain
// with a repointed record, and legitimate access to the router goes
// by address.
func hostAllowed(hostport, allowedOrigin string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	// An IPv6 literal without a port comes in brackets, SplitHostPort does not take it.
	host = strings.TrimSuffix(strings.TrimPrefix(host, "["), "]")

	if host == "" {
		return false
	}
	if strings.EqualFold(host, "localhost") {
		return true
	}
	if _, err := netip.ParseAddr(host); err == nil {
		return true
	}
	if allowedOrigin == "" {
		return false
	}

	u, err := url.Parse(allowedOrigin)

	return err == nil && u.Host != "" && strings.EqualFold(host, u.Hostname())
}

// checkOrigin is the only protection of mutating requests: the daemon has no
// authentication, and a foreign page in the owner's browser could otherwise apply
// a config with the owner's own request.
func checkOrigin(log *slog.Logger, allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !mutating(r.Method) {
			next.ServeHTTP(w, r)
			return
		}

		origin := r.Header.Get("Origin")

		// A relaxation for the origin set by a flag: compared whole,
		// with scheme and port.
		exempt := allowedOrigin != "" && origin == allowedOrigin

		if !originAllowed(origin, r.Host) && !exempt {
			log.Warn("запрос отклонён по Origin",
				"origin", origin,
				"host", r.Host,
				"method", r.Method,
				"path", r.URL.Path,
			)
			fail(log, w, r, errOriginMismatch)

			return
		}

		next.ServeHTTP(w, r)
	})
}

// originAllowed is the origin check rule in pure form: a request without Origin is
// rejected, otherwise the host from Origin must match the request Host.
func originAllowed(origin, host string) bool {
	if origin == "" {
		return false
	}

	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}

	return u.Host == host
}

func mutating(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// Unwrap opens http.ResponseController a path to the underlying writer: without
// it streaming responses lose Flush and write deadlines.
func (r *statusRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}
