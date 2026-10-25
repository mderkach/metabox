package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"metabox/internal/apply"
	"metabox/internal/auth"
	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/dataplane"
	"metabox/internal/devices"
	"metabox/internal/locale"
	"metabox/internal/logs"
	"metabox/internal/route"
	"metabox/internal/singbox"
)

// Failures produced by the HTTP layer itself. Domain errors come from the
// internal packages and get a row in statusFor.
var (
	errNotFound       = locale.New("endpoint not found")
	errOriginMismatch = locale.New("request origin does not match the panel address")
	// errHostMismatch: the request Host does not look like the panel address: this is what
	// DNS rebinding looks like, when a foreign domain is pointed at the router address.
	errHostMismatch = locale.New("request host does not match the panel address")
	// errUpgradeUnsupported: an attempt to raise a WebSocket on the proxy branch.
	// The runtime goes as a single `/api/events` stream.
	errUpgradeUnsupported = locale.New("WebSocket upgrade is not supported: the runtime comes through the /api/events stream")
	// errBadApplyEnvelope: a body with the apply envelope type was not parsed.
	errBadApplyEnvelope = locale.New("apply request body not parsed")
	// errBadDeviceBody: the device name edit body was not parsed.
	errBadDeviceBody = locale.New("device rename body not parsed")
	// errBadDataplaneBody: the dataplane model change body was not parsed as JSON.
	errBadDataplaneBody = locale.New("dataplane model change body not parsed")
	// errDataplaneBaseMissing: a model change without If-Match: without it a UCI edit
	// over SSH would be silently overwritten.
	errDataplaneBaseMissing = locale.New("If-Match with the ETag from GET /api/dataplane is required")
	// errBadLogQuery: the level or the line count of the log query is not parsed.
	errBadLogQuery = locale.New("log query parameters not parsed")
	// errUnauthorized: the panel has a password and the request came without a session.
	errUnauthorized = locale.New("sign-in required")
	// errMCPToken: MCP is on and the request came without its token or with a wrong one.
	errMCPToken = locale.New("MCP token required")
	// errBadAuthBody: the login or password change body was not parsed.
	errBadAuthBody = locale.New("sign-in or password change body not parsed")
)

// runtimeUnavailable is the log message of a runtime failure; the client gets the
// text of route.ErrRuntimeUnavailable. The reason stays in the log: it holds the
// controller address and the transport error text.
const runtimeUnavailable = "sing-box runtime unavailable"

type langKey struct{}

// withLang carries the operator's language to the error writer, which handlers and
// middleware reach with nothing but the request.
func withLang(lang locale.Lang, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), langKey{}, lang)))
	})
}

func langOf(r *http.Request) locale.Lang {
	if lang, ok := r.Context().Value(langKey{}).(locale.Lang); ok {
		return lang
	}

	return locale.English
}

// fail is the only place where an error turns into a response: a new kind of failure
// is added to statusFor, not to a handler. The text of an unknown error does not go
// outside: it may hold paths, command arguments and config content.
func fail(log *slog.Logger, w http.ResponseWriter, r *http.Request, err error) {
	// The client dropped the connection: left the screen, requested again. There is nobody
	// to answer, and this is not a server failure.
	if errors.Is(err, context.Canceled) {
		log.Debug("request cancelled by the client", "method", r.Method, "path", r.URL.Path)

		return
	}

	lang := langOf(r)

	if checkErr, ok := errors.AsType[*singbox.CheckError](err); ok {
		writeJSON(log, w, http.StatusUnprocessableEntity, contract.Error{
			Code:    contract.ErrCheckFailed,
			Message: locale.T(lang, "sing-box rejected the config"),
			Details: contract.CheckDetails{
				Stdout:   checkErr.Stdout,
				Stderr:   checkErr.Stderr,
				ExitCode: checkErr.ExitCode,
			},
		})

		return
	}

	// The directories go as a detail: the panel builds from them the command that
	// configures the service working directory.
	if workdirErr, ok := errors.AsType[*apply.WorkdirError](err); ok {
		writeJSON(log, w, http.StatusConflict, contract.Error{
			Code:    contract.ErrWorkdirMismatch,
			Message: locale.T(lang, "the sing-box service working directory does not match the config directory"),
			Details: contract.WorkdirDetails{
				Workdir:   workdirErr.Workdir,
				ConfigDir: workdirErr.ConfigDir,
			},
		})

		return
	}

	// The fields go as a detail: the owner finds what to fix in UCI by them.
	if invalid, ok := errors.AsType[*dataplane.InvalidError](err); ok {
		writeJSON(log, w, http.StatusUnprocessableEntity, contract.Error{
			Code:    contract.ErrDataplaneInvalid,
			Message: locale.T(lang, "dataplane model rejected"),
			Details: contract.DataplaneDetails{Fields: invalid.Fields},
		})

		return
	}

	if locked, ok := errors.AsType[*auth.LockedError](err); ok {
		w.Header().Set("Retry-After", retryAfter(locked))
	}

	status, code := statusFor(err)

	message := locale.Message(lang, err)

	switch {
	// The store failure stays in the log: it holds the session file path.
	case code == contract.ErrLogoutNotSaved:
		log.Error("panel session revocation not saved, a restart brings the session back", "err", err)
		message = locale.Message(lang, auth.ErrSessionNotRevoked)
	case status == http.StatusInternalServerError:
		log.Error("request not served", "err", err, "method", r.Method, "path", r.URL.Path)
		message = locale.T(lang, "internal error")
	// The reason stays in the log: it holds the log file path and the process failure.
	case code == contract.ErrLogUnavailable:
		log.Warn("sing-box log not read", "err", err)
		message = locale.Message(lang, logs.ErrUnavailable)
	// A runtime failure answers the same way as the Clash API proxy: two handlers of one
	// layer must not behave oppositely.
	case code == contract.ErrRuntimeUnavailable:
		log.Warn(runtimeUnavailable, "err", err, "method", r.Method, "path", r.URL.Path)
		message = locale.Message(lang, route.ErrRuntimeUnavailable)
	}

	writeJSON(log, w, status, contract.Error{Code: code, Message: message})
}

func statusFor(err error) (status int, code contract.ErrorCode) {
	var tooLarge *http.MaxBytesError

	switch {
	case errors.Is(err, errNotFound):
		return http.StatusNotFound, contract.ErrNotFound
	case errors.Is(err, errOriginMismatch):
		return http.StatusForbidden, contract.ErrOriginMismatch
	// The code is shared with the Origin failure: the class is the same, the request is rejected by
	// origin, and a new code would be a contract change.
	case errors.Is(err, errHostMismatch):
		return http.StatusForbidden, contract.ErrOriginMismatch
	case errors.Is(err, errUpgradeUnsupported):
		return http.StatusBadRequest, contract.ErrUpgradeUnsupported
	case errors.Is(err, config.ErrNoConfig):
		return http.StatusNotFound, contract.ErrConfigMissing
	case errors.Is(err, config.ErrNoVersion):
		return http.StatusNotFound, contract.ErrVersionMissing
	case errors.Is(err, route.ErrNoConnection):
		return http.StatusNotFound, contract.ErrConnectionMissing
	case errors.Is(err, route.ErrRuntimeUnavailable):
		return http.StatusBadGateway, contract.ErrRuntimeUnavailable
	case errors.Is(err, apply.ErrUnknownTransaction):
		return http.StatusNotFound, contract.ErrUnknownTransaction
	case errors.Is(err, apply.ErrBusy):
		return http.StatusConflict, contract.ErrApplyInProgress
	case errors.Is(err, apply.ErrNothingToConfirm):
		return http.StatusConflict, contract.ErrNothingToConfirm
	case errors.Is(err, apply.ErrConfigModified):
		return http.StatusConflict, contract.ErrConfigModified
	// The code is shared with a config edit: the class is the same, the device has not what
	// the client edited from.
	case errors.Is(err, apply.ErrListsModified):
		return http.StatusConflict, contract.ErrConfigModified
	case errors.Is(err, apply.ErrListName), errors.Is(err, errBadApplyEnvelope):
		return http.StatusBadRequest, contract.ErrListInvalid
	case errors.Is(err, devices.ErrInvalidMAC), errors.Is(err, devices.ErrInvalidName),
		errors.Is(err, devices.ErrTooManyNames), errors.Is(err, errBadDeviceBody):
		return http.StatusBadRequest, contract.ErrDeviceInvalid
	case errors.Is(err, errBadDataplaneBody):
		return http.StatusBadRequest, contract.ErrDataplaneInvalid
	case errors.Is(err, apply.ErrDataplaneModified):
		return http.StatusPreconditionFailed, contract.ErrDataplaneModified
	case errors.Is(err, errDataplaneBaseMissing):
		return http.StatusPreconditionRequired, contract.ErrDataplaneModified
	case errors.Is(err, logs.ErrUnavailable):
		return http.StatusServiceUnavailable, contract.ErrLogUnavailable
	case errors.Is(err, logs.ErrTooManyStreams):
		return http.StatusTooManyRequests, contract.ErrLogStreamLimit
	case errors.Is(err, logs.ErrClearForbidden):
		return http.StatusConflict, contract.ErrLogClearForbidden
	case errors.Is(err, errBadLogQuery):
		return http.StatusBadRequest, contract.ErrLogQueryInvalid
	case errors.Is(err, errUnauthorized), errors.Is(err, auth.ErrNoSession), errors.Is(err, errMCPToken):
		return http.StatusUnauthorized, contract.ErrUnauthorized
	// 403, not 401: the panel answers 401 by showing the login screen, and a wrong
	// password must stay on the form where it was typed.
	case errors.Is(err, auth.ErrWrongPassword):
		return http.StatusForbidden, contract.ErrPasswordWrong
	case errors.Is(err, auth.ErrPasswordInvalid), errors.Is(err, errBadAuthBody):
		return http.StatusBadRequest, contract.ErrPasswordInvalid
	case errors.Is(err, auth.ErrNotSet):
		return http.StatusConflict, contract.ErrAuthDisabled
	case isLocked(err):
		return http.StatusTooManyRequests, contract.ErrLoginLocked
	case errors.Is(err, auth.ErrSessionNotRevoked):
		return http.StatusInternalServerError, contract.ErrLogoutNotSaved
	case errors.As(err, &tooLarge):
		return http.StatusRequestEntityTooLarge, contract.ErrConfigTooLarge
	default:
		return http.StatusInternalServerError, contract.ErrInternal
	}
}

// ProxyError returns a proxy failure in the daemon format. The reason is not let out:
// it holds the controller address and the transport error text. The runtime screen must
// see a failure and not HTML from net/http.
func ProxyError(log *slog.Logger) func(w http.ResponseWriter, r *http.Request, err error) {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		if errors.Is(err, context.Canceled) {
			log.Debug("stream closed by the client", "path", r.URL.Path)

			return
		}

		log.Warn(runtimeUnavailable, "path", r.URL.Path, "err", err)

		writeJSON(log, w, http.StatusBadGateway, contract.Error{
			Code:    contract.ErrRuntimeUnavailable,
			Message: locale.Message(langOf(r), route.ErrRuntimeUnavailable),
		})
	}
}

func isLocked(err error) bool {
	_, ok := errors.AsType[*auth.LockedError](err)

	return ok
}
