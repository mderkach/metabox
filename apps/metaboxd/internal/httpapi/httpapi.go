// Package httpapi — HTTP-слой демона: маршруты, цепочка middleware и единый
// формат ответа. Предметные зависимости приходят конструктором, сам пакет их
// не собирает.
package httpapi

import (
	"log/slog"
	"net/http"
)

// Options — настройки слоя, приходящие в демон флагами.
type Options struct {
	Version string
	// AllowedOrigin — разрешённый Origin сверх совпадения с Host. Пустая
	// строка означает, что послаблений нет: правило из ADR-0002 действует
	// в чистом виде.
	AllowedOrigin string
}

// Server держит зависимости обработчиков и собранную цепочку middleware.
type Server struct {
	log           *slog.Logger
	version       string
	allowedOrigin string
	handler       http.Handler
}

// NewServer собирает слой вместе с цепочкой middleware. Логгер обязателен:
// своего пакет не заводит.
func NewServer(log *slog.Logger, opts Options) *Server {
	s := &Server{
		log:           log,
		version:       opts.Version,
		allowedOrigin: opts.AllowedOrigin,
	}
	s.handler = s.routes()

	return s
}

// ServeHTTP отдаёт запрос цепочке, собранной в NewServer.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("/api/", s.handleAPINotFound)

	return s.middleware(mux)
}

type healthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(s.log, w, http.StatusOK, healthResponse{Status: "ok", Version: s.version})
}

// handleAPINotFound закрывает всё неизвестное под /api/ JSON-ошибкой: отдать
// сюда index.html значит вернуть фронту HTML вместо разбираемого ответа.
func (s *Server) handleAPINotFound(w http.ResponseWriter, r *http.Request) {
	fail(s.log, w, r, errNotFound)
}
