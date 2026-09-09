package httpapi

import (
	"errors"
	"log/slog"
	"net/http"
)

// Отказы, которые порождает сам HTTP-слой. Предметные ошибки придут из
// internal-пакетов и получат строку в statusFor.
var (
	errNotFound       = errors.New("ручка не найдена")
	errOriginMismatch = errors.New("источник запроса не совпадает с адресом панели")
)

// fail — единственное место, где ошибка превращается в ответ: новый вид отказа
// добавляется в statusFor, а не в хендлер. Текст неизвестной ошибки наружу не
// уходит — в ней бывают пути, аргументы команд и содержимое конфига.
func fail(log *slog.Logger, w http.ResponseWriter, r *http.Request, err error) {
	status, code := statusFor(err)

	message := err.Error()
	if status == http.StatusInternalServerError {
		log.Error("запрос не обслужен", "err", err, "method", r.Method, "path", r.URL.Path)
		message = "внутренняя ошибка"
	}

	writeJSON(log, w, status, APIError{Code: code, Message: message})
}

func statusFor(err error) (status int, code string) {
	switch {
	case errors.Is(err, errNotFound):
		return http.StatusNotFound, "not_found"
	case errors.Is(err, errOriginMismatch):
		return http.StatusForbidden, "origin_mismatch"
	default:
		return http.StatusInternalServerError, "internal"
	}
}
