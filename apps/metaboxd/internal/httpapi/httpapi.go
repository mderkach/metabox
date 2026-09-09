// Package httpapi — HTTP-слой демона: маршруты, цепочка middleware и единый
// формат ответа. Предметные зависимости приходят конструктором, сам пакет их
// не собирает.
package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"

	"metabox/internal/apply"
)

// maxConfigBytes — потолок на тело запроса. Конфиг приходит байтами, и без
// лимита один запрос забирает столько памяти, сколько прислали. Четыре
// мегабайта с запасом перекрывают конфиг из NFR-2 на 500 правил.
const maxConfigBytes = 4 << 20

// Applier — цикл применения. Интерфейс объявлен здесь, у потребителя, и
// содержит только те методы, которыми пользуются хендлеры.
type Applier interface {
	Start(ctx context.Context, cfg []byte) (apply.Transaction, error)
	Confirm(ctx context.Context, id string) (apply.Transaction, error)
	Current() apply.Transaction
}

// Options — настройки слоя, приходящие в демон флагами.
type Options struct {
	Version string
	// AllowedOrigin — разрешённый Origin сверх совпадения с Host. Пустая
	// строка означает, что послаблений нет: правило из ADR-0002 действует
	// в чистом виде.
	AllowedOrigin string
	// SPA раздаёт встроенный интерфейс. nil означает, что бинарь собран без
	// фронта: API продолжает работать, а панель объясняет, чего не хватает.
	SPA http.Handler
}

// Server держит зависимости обработчиков и собранную цепочку middleware.
type Server struct {
	applier       Applier
	log           *slog.Logger
	version       string
	allowedOrigin string
	spa           http.Handler
	handler       http.Handler
}

// NewServer собирает слой вместе с цепочкой middleware. Логгер обязателен:
// своего пакет не заводит.
func NewServer(applier Applier, log *slog.Logger, opts Options) *Server {
	s := &Server{
		applier:       applier,
		log:           log,
		version:       opts.Version,
		allowedOrigin: opts.AllowedOrigin,
		spa:           opts.SPA,
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
	mux.HandleFunc("GET /api/status", s.handleStatus)
	mux.HandleFunc("POST /api/apply", s.handleApply)
	mux.HandleFunc("GET /api/apply/{id}", s.handleApplyState)
	mux.HandleFunc("POST /api/apply/{id}/confirm", s.handleApplyConfirm)
	mux.HandleFunc("/api/", s.handleAPINotFound)
	mux.Handle("/", s.spaHandler())

	return s.middleware(mux)
}

type healthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(s.log, w, http.StatusOK, healthResponse{Status: "ok", Version: s.version})
}

type statusResponse struct {
	Version     string             `json:"version"`
	Transaction *apply.Transaction `json:"transaction,omitempty"`
	// TransactionHref — адрес идущего применения. Без него перезагрузка
	// страницы теряет транзакцию: её идентификатор жил только в ответе на
	// POST (ADR-0002).
	TransactionHref string `json:"transaction_href,omitempty"`
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	body := statusResponse{Version: s.version}

	if tx := s.applier.Current(); tx.ID != "" {
		body.Transaction = &tx
		body.TransactionHref = "/api/apply/" + tx.ID
	}

	writeJSON(s.log, w, http.StatusOK, body)
}

// handleApply принимает конфиг байтами и запускает применение. Ответ приходит
// после проверки бинарём, но до конца цикла: применение асинхронно и живёт
// дольше запроса (ADR-0002).
func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	cfg, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxConfigBytes))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	tx, err := s.applier.Start(r.Context(), cfg)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusAccepted, tx)
}

func (s *Server) handleApplyState(w http.ResponseWriter, r *http.Request) {
	tx := s.applier.Current()
	if tx.ID != r.PathValue("id") {
		fail(s.log, w, r, apply.ErrUnknownTransaction)

		return
	}

	writeJSON(s.log, w, http.StatusOK, tx)
}

func (s *Server) handleApplyConfirm(w http.ResponseWriter, r *http.Request) {
	tx, err := s.applier.Confirm(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, tx)
}

// handleAPINotFound закрывает всё неизвестное под /api/ JSON-ошибкой: отдать
// сюда index.html значит вернуть фронту HTML вместо разбираемого ответа.
func (s *Server) handleAPINotFound(w http.ResponseWriter, r *http.Request) {
	fail(s.log, w, r, errNotFound)
}

// spaHandler отдаёт встроенный интерфейс, а без него — объяснение. Демон
// обязан подниматься и обслуживать API, даже когда фронт в бинарь не попал
// (NFR-1).
func (s *Server) spaHandler() http.Handler {
	if s.spa != nil {
		return s.spa
	}

	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("интерфейс не собран: соберите демон через `make daemon`\n"))
	})
}
