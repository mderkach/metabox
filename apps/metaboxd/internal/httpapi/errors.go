package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/route"
	"metabox/internal/singbox"
)

// Отказы, которые порождает сам HTTP-слой. Предметные ошибки приходят из
// internal-пакетов и получают строку в statusFor.
var (
	errNotFound       = errors.New("ручка не найдена")
	errOriginMismatch = errors.New("источник запроса не совпадает с адресом панели")
	// errHostMismatch — Host запроса не похож на адрес панели: так выглядит
	// DNS rebinding, когда чужой домен перекинули на адрес роутера.
	errHostMismatch = errors.New("адрес запроса не совпадает с адресом панели")
	// errUpgradeUnsupported — попытка поднять WebSocket на ветке прокси.
	// Рантайм идёт одним потоком `/api/events` (ADR-0010).
	errUpgradeUnsupported = errors.New("рантайм идёт потоком /api/events, апгрейд не поддерживается")
)

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
		writeJSON(log, w, http.StatusUnprocessableEntity, contract.Error{
			Code:    contract.ErrCheckFailed,
			Message: "sing-box отверг конфиг",
			Details: contract.CheckDetails{
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

	writeJSON(log, w, status, contract.Error{Code: code, Message: message})
}

func statusFor(err error) (status int, code contract.ErrorCode) {
	var tooLarge *http.MaxBytesError

	switch {
	case errors.Is(err, errNotFound):
		return http.StatusNotFound, contract.ErrNotFound
	case errors.Is(err, errOriginMismatch):
		return http.StatusForbidden, contract.ErrOriginMismatch
	// Код общий с отказом по Origin: класс тот же — запрос отклонён по
	// источнику, — а новый код был бы изменением контракта.
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
	case errors.As(err, &tooLarge):
		return http.StatusRequestEntityTooLarge, contract.ErrConfigTooLarge
	default:
		return http.StatusInternalServerError, contract.ErrInternal
	}
}

// ProxyError отдаёт отказ прокси в формате демона. Причину наружу не пускаем:
// в ней адрес контроллера и текст ошибки транспорта. Экран рантайма обязан
// увидеть отказ, а не HTML от net/http.
func ProxyError(log *slog.Logger) func(w http.ResponseWriter, r *http.Request, err error) {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		if errors.Is(err, context.Canceled) {
			log.Debug("поток закрыт клиентом", "path", r.URL.Path)

			return
		}

		log.Warn("рантайм sing-box недоступен", "path", r.URL.Path, "err", err)

		writeJSON(log, w, http.StatusBadGateway, contract.Error{
			Code:    contract.ErrRuntimeUnavailable,
			Message: "рантайм sing-box недоступен",
		})
	}
}
