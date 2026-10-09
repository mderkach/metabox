package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"metabox/internal/contract"
	"metabox/internal/diag"
	"metabox/internal/events"
	"metabox/internal/logs"
)

const (
	// defaultLogLines — хвост по умолчанию: экран открывается с ним.
	defaultLogLines = 200

	// logQueue — очередь строк потока на читателя; переполнение отбрасывает
	// строку, и разрыв seq показывает панели потерю.
	logQueue = 256

	logKeepAlive    = 20 * time.Second
	logWriteTimeout = 10 * time.Second
)

// LogReader читает лог sing-box. Интерфейс объявлен здесь, у потребителя.
type LogReader interface {
	Tail(ctx context.Context, n int, minLevel logs.Level) (logs.Snapshot, error)
	Follow(ctx context.Context, minLevel logs.Level, emit func(logs.Entry)) (<-chan error, error)
	Clear(ctx context.Context) (time.Time, error)
}

// Diagnoser проверяет сетевую обвязку. Интерфейс объявлен здесь, у
// потребителя.
type Diagnoser interface {
	Run(ctx context.Context, proxy string) (diag.Report, error)
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	level, ok := logs.ParseLevel(r.URL.Query().Get("level"))
	if !ok {
		fail(s.log, w, r, errBadLogQuery)

		return
	}

	lines := defaultLogLines

	if raw := r.URL.Query().Get("lines"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > logs.MaxLines {
			fail(s.log, w, r, errBadLogQuery)

			return
		}

		lines = n
	}

	snapshot, err := s.logs.Tail(r.Context(), lines, level)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(s.log, w, http.StatusOK, contract.Logs{
		Source:  snapshot.Source,
		Since:   formatSince(snapshot.Since),
		Entries: snapshot.Entries,
	})
}

func (s *Server) handleLogsClear(w http.ResponseWriter, r *http.Request) {
	since, err := s.logs.Clear(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, contract.LogsCleared{Since: formatSince(since)})
}

// handleLogStream отдаёт новые строки лога потоком SSE: событие `log` с
// contract.LogEvent. Устроен как `/api/events`, но источник у каждого
// читателя свой: читателей у экрана логов единицы, и общий процесс с рассылкой
// не окупил бы своей сложности. Их число ограничено logs.MaxStreams.
func (s *Server) handleLogStream(w http.ResponseWriter, r *http.Request) {
	level, ok := logs.ParseLevel(r.URL.Query().Get("level"))
	if !ok {
		fail(s.log, w, r, errBadLogQuery)

		return
	}

	// Поддержка проверяется до первой записи: после заголовка отказать уже
	// нечем.
	if !events.SupportsFlush(w) {
		fail(s.log, w, r, errors.New("поток лога: ответ без сброса буфера"))

		return
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	queue := make(chan contract.LogEvent, logQueue)

	var seq uint64

	emit := func(entry logs.Entry) {
		seq++

		select {
		case queue <- contract.LogEvent{Seq: seq, Entry: entry}:
		default:
		}
	}

	done, err := s.logs.Follow(ctx, level, emit)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	var (
		result   error
		finished bool
	)

	// Горутину источника останавливает cancel, и хендлер не выходит, пока
	// она не закончилась.
	defer func() {
		cancel()

		if !finished {
			result = <-done
		}

		if result != nil {
			s.log.Warn("поток лога sing-box оборвался", "err", result)
		}
	}()

	control := http.NewResponseController(w)
	arm := func() { _ = control.SetWriteDeadline(time.Now().Add(logWriteTimeout)) }

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	arm()
	w.WriteHeader(http.StatusOK)
	_ = control.Flush()

	keepAlive := time.NewTicker(logKeepAlive)
	defer keepAlive.Stop()

	for {
		var err error

		select {
		case <-ctx.Done():
			return
		case result = <-done:
			finished = true

			return
		case <-keepAlive.C:
			arm()
			_, err = io.WriteString(w, ": keep-alive\n\n")
		case event := <-queue:
			arm()
			err = writeLogEvent(w, event)
		}

		if err == nil {
			err = control.Flush()
		}

		if err != nil {
			return
		}
	}
}

func writeLogEvent(w io.Writer, event contract.LogEvent) error {
	body, err := json.Marshal(event)
	if err != nil {
		return err
	}

	_, err = fmt.Fprintf(w, "event: log\ndata: %s\n\n", body)

	return err
}

func (s *Server) handleDiag(w http.ResponseWriter, r *http.Request) {
	report, err := s.diag.Run(r.Context(), r.URL.Query().Get("proxy"))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(s.log, w, http.StatusOK, report)
}

func formatSince(t time.Time) string {
	if t.IsZero() {
		return ""
	}

	return t.Format(time.RFC3339)
}
