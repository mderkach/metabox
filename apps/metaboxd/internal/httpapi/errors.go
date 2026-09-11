package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/singbox"
)

// Отказы, которые порождает сам HTTP-слой. Предметные ошибки приходят из
// internal-пакетов и получают строку в statusFor.
var (
	errNotFound       = errors.New("ручка не найдена")
	errOriginMismatch = errors.New("источник запроса не совпадает с адресом панели")
)

// checkDetails — вывод sing-box дословно. Единственное исключение из правила
// «внутренние подробности наружу не идут», и оно задано ADR-0002: на этих
// строках пользователь чинит конфиг.
type checkDetails struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}

// fail — единственное место, где ошибка превращается в ответ: новый вид отказа
// добавляется в statusFor, а не в хендлер. Текст неизвестной ошибки наружу не
// уходит — в ней бывают пути, аргументы команд и содержимое конфига.
func fail(log *slog.Logger, w http.ResponseWriter, r *http.Request, err error) {
	// Клиент оборвал соединение — ушёл с экрана, перезапросил. Отвечать
	// некому, и отказом сервера это не является.
	if errors.Is(err, context.Canceled) {
		log.Debug("запрос отменён клиентом", "method", r.Method, "path", r.URL.Path)

		return
	}

	if checkErr, ok := errors.AsType[*singbox.CheckError](err); ok {
		writeJSON(log, w, http.StatusUnprocessableEntity, APIError{
			Code:    "check_failed",
			Message: "sing-box отверг конфиг",
			Details: checkDetails{
				Stdout:   checkErr.Stdout,
				Stderr:   checkErr.Stderr,
				ExitCode: checkErr.ExitCode,
			},
		})

		return
	}

	status, code := statusFor(err)

	message := err.Error()
	if status == http.StatusInternalServerError {
		log.Error("запрос не обслужен", "err", err, "method", r.Method, "path", r.URL.Path)
		message = "внутренняя ошибка"
	}

	writeJSON(log, w, status, APIError{Code: code, Message: message})
}

func statusFor(err error) (status int, code string) {
	var tooLarge *http.MaxBytesError

	switch {
	case errors.Is(err, errNotFound):
		return http.StatusNotFound, "not_found"
	case errors.Is(err, errOriginMismatch):
		return http.StatusForbidden, "origin_mismatch"
	case errors.Is(err, config.ErrNoConfig):
		return http.StatusNotFound, "config_missing"
	case errors.Is(err, apply.ErrUnknownTransaction):
		return http.StatusNotFound, "unknown_transaction"
	case errors.Is(err, apply.ErrBusy):
		return http.StatusConflict, "apply_in_progress"
	case errors.Is(err, apply.ErrNothingToConfirm):
		return http.StatusConflict, "nothing_to_confirm"
	case errors.Is(err, apply.ErrConfigModified):
		return http.StatusConflict, "config_modified"
	case errors.As(err, &tooLarge):
		return http.StatusRequestEntityTooLarge, "config_too_large"
	default:
		return http.StatusInternalServerError, "internal"
	}
}

// ProxyError отдаёт отказ прокси в формате демона. Причину наружу не пускаем:
// в ней адрес контроллера и текст ошибки транспорта. Экран рантайма обязан
// увидеть отказ, а не HTML от net/http (NFR-1).
func ProxyError(log *slog.Logger) func(w http.ResponseWriter, r *http.Request, err error) {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		if errors.Is(err, context.Canceled) {
			log.Debug("поток закрыт клиентом", "path", r.URL.Path)

			return
		}

		log.Warn("рантайм sing-box недоступен", "path", r.URL.Path, "err", err)

		writeJSON(log, w, http.StatusBadGateway, APIError{
			Code:    "runtime_unavailable",
			Message: "рантайм sing-box недоступен",
		})
	}
}
