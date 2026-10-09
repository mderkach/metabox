package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/dataplane"
	"metabox/internal/devices"
	"metabox/internal/logs"
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
	// Рантайм идёт одним потоком `/api/events`.
	errUpgradeUnsupported = errors.New("рантайм идёт потоком /api/events, апгрейд не поддерживается")
	// errBadApplyEnvelope — тело с типом конверта применения не разобралось.
	errBadApplyEnvelope = errors.New("конверт применения не разобран")
	// errBadDeviceBody — тело правки имени устройства не разобрано.
	errBadDeviceBody = errors.New("тело правки имени устройства не разобрано")
	// errBadDataplaneBody — тело смены модели обвязки не разобрано как JSON.
	errBadDataplaneBody = errors.New("тело смены модели обвязки не разобрано")
	// errDataplaneBaseMissing — смена модели без If-Match: без него правка
	// UCI по SSH затёрлась бы молча.
	errDataplaneBaseMissing = errors.New("нужен If-Match с ETag из GET /api/dataplane")
	// errBadLogQuery — уровень или число строк запроса лога не разобраны.
	errBadLogQuery = errors.New("параметры запроса лога не разобраны")
)

// runtimeUnavailable — текст отказа рантайма для клиента. Причина остаётся в
// логе: в ней адрес контроллера и текст ошибки транспорта.
const runtimeUnavailable = "рантайм sing-box недоступен"

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

	// Каталоги едут подробностью: из них панель собирает команду, которая
	// настраивает рабочий каталог службы.
	if workdirErr, ok := errors.AsType[*apply.WorkdirError](err); ok {
		writeJSON(log, w, http.StatusConflict, contract.Error{
			Code:    contract.ErrWorkdirMismatch,
			Message: "рабочий каталог службы sing-box не совпадает с каталогом конфига",
			Details: contract.WorkdirDetails{
				Workdir:   workdirErr.Workdir,
				ConfigDir: workdirErr.ConfigDir,
			},
		})

		return
	}

	// Поля едут подробностью: по ним владелец находит, что чинить в UCI.
	if invalid, ok := errors.AsType[*dataplane.InvalidError](err); ok {
		writeJSON(log, w, http.StatusUnprocessableEntity, contract.Error{
			Code:    contract.ErrDataplaneInvalid,
			Message: "модель сетевой обвязки не принята",
			Details: contract.DataplaneDetails{Fields: invalid.Fields},
		})

		return
	}

	status, code := statusFor(err)

	message := err.Error()

	switch {
	case status == http.StatusInternalServerError:
		log.Error("запрос не обслужен", "err", err, "method", r.Method, "path", r.URL.Path)
		message = "внутренняя ошибка"
	// Пути команды службы остаются в логе: в них конфиг чужой службы.
	case code == contract.ErrLaunchMismatch:
		log.Warn("применение отклонено: служба поднимается не на конфиге демона", "err", err)
		message = "служба sing-box поднимается не на конфиге, которым владеет metabox"
	// Причина остаётся в логе: в ней путь файла лога и отказ процесса.
	case code == contract.ErrLogUnavailable:
		log.Warn("лог sing-box не прочитан", "err", err)
		message = logs.ErrUnavailable.Error()
	// Отказ рантайма отвечает так же, как прокси Clash API: две ручки одного
	// слоя не должны вести себя противоположно.
	case code == contract.ErrRuntimeUnavailable:
		log.Warn(runtimeUnavailable, "err", err, "method", r.Method, "path", r.URL.Path)
		message = runtimeUnavailable
	}

	writeJSON(log, w, status, contract.Error{Code: code, Message: message})
}

func statusFor(err error) (status int, code contract.ErrorCode) {
	var tooLarge *http.MaxBytesError

	if _, ok := errors.AsType[*apply.LaunchError](err); ok {
		return http.StatusConflict, contract.ErrLaunchMismatch
	}

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
	// Код общий с правкой конфига: класс тот же — на устройстве не то, от чего
	// редактировал клиент.
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

		log.Warn(runtimeUnavailable, "path", r.URL.Path, "err", err)

		writeJSON(log, w, http.StatusBadGateway, contract.Error{
			Code:    contract.ErrRuntimeUnavailable,
			Message: runtimeUnavailable,
		})
	}
}
