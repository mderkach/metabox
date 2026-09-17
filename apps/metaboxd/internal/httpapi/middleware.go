package httpapi

import (
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"runtime/debug"
	"time"
)

func (s *Server) middleware(next http.Handler) http.Handler {
	// recoverPanic снаружи: паника в логировании иначе уронит процесс.
	return recoverPanic(s.log,
		logRequests(s.log,
			checkOrigin(s.log, s.allowedOrigin, next)))
}

func recoverPanic(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}

			// http.ErrAbortHandler — штатный способ оборвать ответ, его
			// пропускают дальше по стеку нетронутым.
			if err, ok := rec.(error); ok && errors.Is(err, http.ErrAbortHandler) {
				panic(rec)
			}

			log.Error("паника в обработчике",
				"err", rec,
				"method", r.Method,
				"path", r.URL.Path,
				"stack", string(debug.Stack()),
			)
			w.WriteHeader(http.StatusInternalServerError)
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

// checkOrigin — единственная защита мутирующих запросов: аутентификации в v1
// нет по решению A.6 PRD.
func checkOrigin(log *slog.Logger, allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !mutating(r.Method) {
			next.ServeHTTP(w, r)
			return
		}

		origin := r.Header.Get("Origin")

		// Послабление для источника, который задан флагом: сравнивается целиком,
		// со схемой и портом.
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

// originAllowed — правило ADR-0002 в чистом виде: запрос без Origin
// отклоняется, иначе хост из Origin обязан совпасть с Host запроса.
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

// Unwrap открывает http.ResponseController путь к нижележащему writer'у: без
// него потоковые ответы теряют Flush и дедлайны записи.
func (r *statusRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}
