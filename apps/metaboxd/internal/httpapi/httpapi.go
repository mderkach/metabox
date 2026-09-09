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

// Server держит зависимости обработчиков. Создаётся один раз при старте.
type Server struct {
	log           *slog.Logger
	version       string
	allowedOrigin string
}

// NewServer собирает слой. Логгер обязателен: своего пакет не заводит.
func NewServer(log *slog.Logger, opts Options) *Server {
	return &Server{
		log:           log,
		version:       opts.Version,
		allowedOrigin: opts.AllowedOrigin,
	}
}

// Handler возвращает маршруты, обёрнутые цепочкой middleware. Вызывается один
// раз: повторный вызов соберёт вторую цепочку.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("/api/", s.handleAPINotFound)

	return s.middleware(mux)
}

type healthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.writeJSON(w, r, http.StatusOK, healthResponse{Status: "ok", Version: s.version})
}

// handleAPINotFound закрывает всё неизвестное под /api/ JSON-ошибкой: отдать
// сюда index.html значит вернуть фронту HTML вместо разбираемого ответа.
func (s *Server) handleAPINotFound(w http.ResponseWriter, r *http.Request) {
	s.writeError(w, r, http.StatusNotFound, "not_found", "ручка не найдена")
}
