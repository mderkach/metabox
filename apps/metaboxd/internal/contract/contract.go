// Package contract объявляет формы, которые демон отдаёт наружу.
//
// Пакет существует, чтобы у контракта была явная граница: панель строит схемы
// по этим типам, и приватная структура хендлера контрактом быть не
// может — её переименование молча доходило бы до панели. Доменные типы,
// попадающие в ответ целиком, остаются в своих пакетах: contract ссылается на
// них, а не копирует.
package contract

import (
	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/dataplane"
	"metabox/internal/devices"
	"metabox/internal/history"
	"metabox/internal/logs"
)

// Health — ответ `GET /healthz`.
type Health struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

// Status — ответ `GET /api/status`.
type Status struct {
	// Version — версия демона; версия бинаря sing-box идёт отдельным полем.
	Version        string `json:"version"`
	SingboxVersion string `json:"singbox_version,omitempty"`
	// SingboxBuild — состав сборки бинаря. Нет поля — бинарь не прочитан, и
	// судить, каких типов узлов в нём нет, панели не по чему.
	SingboxBuild *SingboxBuild `json:"singbox_build,omitempty"`
	// ConfigPath — файл, которым демон владеет: путь задаётся флагами запуска,
	// и вычислить его на стороне панели нельзя.
	ConfigPath string `json:"config_path,omitempty"`
	// Runtime — откуда демон читает рантайм. Молчаливая подмена одного источника
	// другим запрещена, поэтому состав объявлен контрактом.
	Runtime     Runtime            `json:"runtime"`
	Transaction *apply.Transaction `json:"transaction,omitempty"`
	// TransactionHref — адрес идущего применения. Без него перезагрузка
	// страницы теряет транзакцию: её идентификатор жил только в ответе на
	// POST.
	TransactionHref string `json:"transaction_href,omitempty"`
	// DataplaneTransaction — последняя смена модели обвязки в этой жизни
	// демона. Идёт тем же протоколом и с теми же фазами, что применение
	// конфига, и одновременно с ним не бывает.
	DataplaneTransaction *apply.Transaction `json:"dataplane_transaction,omitempty"`
	// DataplaneTransactionHref — адрес смены обвязки, по тому же правилу, что
	// TransactionHref.
	DataplaneTransactionHref string `json:"dataplane_transaction_href,omitempty"`
}

// SingboxBuild — то, с чем собран бинарь sing-box на устройстве.
type SingboxBuild struct {
	// Tags — build-теги из `sing-box version`. Пустой список значит сборку без
	// тегов: типы узлов, закрытые тегом, такой бинарь откажется запускать.
	Tags []string `json:"tags"`
}

// RuntimeSource — источник рантайм-данных.
type RuntimeSource string

// SourceClashAPI — Clash API sing-box: базовый источник и пока единственный.
// gRPC-ветка ждёт замера на целевом железе.
const SourceClashAPI RuntimeSource = "clash_api"

// Runtime — источники рантайма в `GET /api/status`.
//
// Поля отвечают, что демон умеет читать, а не отвечает ли sing-box сейчас:
// живость процесса идёт `GET /api/service` и топиком `service` потока, и второй
// правды о ней здесь не заводится.
type Runtime struct {
	// Sources — источники, которые демон собрал.
	Sources []RuntimeSource `json:"sources"`
	// Connections — источник, из которого панель получает соединения. Пустая
	// строка означает, что читать их нечем: экран деградирует, а панель
	// остаётся доступной.
	Connections RuntimeSource `json:"connections,omitempty"`
}

// Versions — ответ `GET /api/config/versions`.
type Versions struct {
	Versions []config.Version `json:"versions"`
	// CurrentSum — sha256 применённого конфига в той же записи, что у
	// `Version.Sum`: по нему панель отмечает версию, совпадающую с файлом на
	// устройстве. Считает демон, потому что `crypto.subtle` браузер даёт только
	// в защищённом контексте, а панель открывают по http. Поля нет — конфига на
	// устройстве нет.
	CurrentSum string `json:"current_sum,omitempty"`
	// CurrentListsSum — отпечаток текущего набора файлов списков в той же
	// записи, что у `Version.ListsSum`: версия совпадает с устройством, только
	// когда совпадают и конфиг, и списки. Поля нет у демона, который снимков
	// списков не хранит.
	CurrentListsSum string `json:"current_lists_sum,omitempty"`
}

// Service — ответ `GET /api/service` и того же вида событие потока: панель
// получает один формат независимо от источника.
type Service struct {
	Status string `json:"status"`
	// Uptime — секунды с момента старта. Ноль означает, что возраст узнать не
	// удалось: панель показывает такое значение прочерком.
	Uptime int `json:"uptime"`
	// Binary — версия бинаря на устройстве. Схему панель знает свою и сверяет
	// расхождение сама.
	Binary string `json:"binary"`
	// Managed означает, что процессом владеет служба, которой управляет демон.
	// Ложь при статусе `running` читается так: sing-box на устройстве работает,
	// но поднят не ею — маршрутизацией владеет чужой пакет, и кнопки службы к
	// этому процессу не относятся.
	Managed   bool   `json:"managed"`
	LastError string `json:"lastError,omitempty"`
	// LastErrorCode — почему LastError написал демон, а не служба. Пусто,
	// когда в LastError вывод упавшей службы: его панель показывает дословно.
	LastErrorCode ServiceErrorCode `json:"lastErrorCode,omitempty"`
}

// ServiceErrorCode — отказ, из-за которого состояние службы подставлено, а не
// прочитано. Набор закрытый: по коду панель выбирает текст на языке
// пользователя, а LastError остаётся подробностью.
type ServiceErrorCode string

// ServiceStateUnread — procd не ответил о службе sing-box. Статус `stopped` в
// таком ответе не наблюдён, а подставлен.
const ServiceStateUnread ServiceErrorCode = "service_state_unread"

// ServiceInstanceAmbiguous — у службы несколько инстансов procd, а имя
// инстанса демону не задано: какой из них sing-box, он не угадывает.
const ServiceInstanceAmbiguous ServiceErrorCode = "service_instance_ambiguous"

// History — ответ `GET /api/history`: трафик за всё время, что копил демон.
//
// Время точки не передаётся: часов у роутера до синхронизации NTP нет, и
// абсолютная метка соврала бы. Точки идут подряд с шагом StepSeconds, последняя
// — самая свежая, а подписи оси панель считает по своим часам.
type History struct {
	StepSeconds int             `json:"step_seconds"`
	Points      []history.Point `json:"points"`
	// Device — показания платы тем же шагом: загрузка, температура, память.
	Device []history.DevicePoint `json:"device"`
	// Recent — последняя минута трафика по секунде, без усреднения. Пуста,
	// пока демон не получил ни одного сэмпла.
	Recent []history.Point `json:"recent"`
	// Connections — число живых соединений за последнюю минуту, по снимку в
	// секунду.
	Connections []int `json:"connections"`
}

// ErrorCode — машинный идентификатор отказа. Набор закрытый и объявлен здесь,
// а не строками по хендлерам: по коду панель выбирает текст на языке
// пользователя, поэтому новый код — это изменение контракта, а не детали
// реализации.
type ErrorCode string

const (
	// ErrNotFound — ручки под таким адресом нет.
	ErrNotFound ErrorCode = "not_found"
	// ErrOriginMismatch — источник мутирующего запроса не совпал с адресом панели.
	ErrOriginMismatch ErrorCode = "origin_mismatch"
	// ErrUpgradeUnsupported — попытка поднять WebSocket: рантайм идёт потоком
	// `/api/events`.
	ErrUpgradeUnsupported ErrorCode = "upgrade_unsupported"
	// ErrConfigMissing — файла конфига на устройстве нет.
	ErrConfigMissing ErrorCode = "config_missing"
	// ErrVersionMissing — такой версии в истории нет.
	ErrVersionMissing ErrorCode = "version_missing"
	// ErrConnectionMissing — соединение закрылось, пока панель спрашивала о нём.
	ErrConnectionMissing ErrorCode = "connection_missing"
	// ErrRuntimeUnavailable — рантайм sing-box не отвечает; сам демон при этом жив.
	ErrRuntimeUnavailable ErrorCode = "runtime_unavailable"
	// ErrUnknownTransaction — транзакции применения с таким идентификатором нет.
	ErrUnknownTransaction ErrorCode = "unknown_transaction"
	// ErrApplyInProgress — применение уже идёт, второе не начинается.
	ErrApplyInProgress ErrorCode = "apply_in_progress"
	// ErrNothingToConfirm — подтверждать нечего: окна подтверждения нет.
	ErrNothingToConfirm ErrorCode = "nothing_to_confirm"
	// ErrConfigModified — файл конфига изменён мимо metabox, и правка легла бы
	// на чужой текст.
	ErrConfigModified ErrorCode = "config_modified"
	// ErrConfigTooLarge — тело запроса длиннее допустимого.
	ErrConfigTooLarge ErrorCode = "config_too_large"
	// ErrListInvalid — файл списка не принят: имя вне правил подкаталога
	// rule-sets либо конверт применения не разобран.
	ErrListInvalid ErrorCode = "list_invalid"
	// ErrWorkdirMismatch — применение с файлами списков отклонено до записи:
	// рабочий каталог службы sing-box не совпадает с каталогом конфига, и
	// относительный path узла local служба не нашла бы. Каталоги лежат в
	// Details.
	ErrWorkdirMismatch ErrorCode = "workdir_mismatch"
	// ErrLaunchMismatch — применение отклонено до записи: procd поднимает
	// службу sing-box не на том конфиге, которым владеет демон, — на чужом
	// файле, на нескольких или файлом и каталогом разом. Запись ничего бы
	// службе не поменяла, а проверка проверяла бы не то, что запустится.
	ErrLaunchMismatch ErrorCode = "launch_mismatch"
	// ErrDeviceInvalid — своё имя устройства не принято: MAC не разобран, имя
	// длиннее допустимого или с управляющими символами, тело не разобрано
	// либо своих имён больше, чем демон хранит.
	ErrDeviceInvalid ErrorCode = "device_invalid"
	// ErrDataplaneInvalid — модель сетевой обвязки не принята: в UCI или в
	// теле `PUT /api/dataplane`. Поля с ошибкой лежат в Details; у тела,
	// которое не разобралось как JSON, их нет.
	ErrDataplaneInvalid ErrorCode = "dataplane_invalid"
	// ErrDataplaneModified — секция `metabox.dataplane` изменилась после
	// чтения модели клиентом (412), либо `PUT /api/dataplane` пришёл без
	// If-Match (428).
	ErrDataplaneModified ErrorCode = "dataplane_modified"
	// ErrLogUnavailable — лог sing-box не читается: logread не задан или
	// отказал, файл log.output не открылся.
	ErrLogUnavailable ErrorCode = "log_unavailable"
	// ErrLogQueryInvalid — уровень или число строк в запросе лога не разобраны.
	ErrLogQueryInvalid ErrorCode = "log_query_invalid"
	// ErrLogStreamLimit — открыто предельное число потоков лога; новый
	// откроется, когда закроется один из них.
	ErrLogStreamLimit ErrorCode = "log_stream_limit"
	// ErrLogClearForbidden — файл log.output лежит вне каталога конфига, /var/run
	// и /tmp: такой файл демон не усекает.
	ErrLogClearForbidden ErrorCode = "log_clear_forbidden"
	// ErrCheckFailed — `sing-box check` отверг конфиг; вывод бинаря лежит в Details.
	ErrCheckFailed ErrorCode = "check_failed"
	// ErrInternal — отказ, о котором наружу говорить нечего: подробности в логе.
	ErrInternal ErrorCode = "internal"
)

// ApplyEnvelope — применение конфига вместе с файлами списков подкаталога
// rule-sets. Идёт в POST /api/apply с Content-Type
// application/vnd.metabox.apply+json; тело без этого типа демон читает как
// голые байты конфига.
type ApplyEnvelope struct {
	// Config — текст конфига как есть, с комментариями и висячими запятыми.
	Config string `json:"config"`
	// Lists — имя файла в подкаталоге rule-sets → его содержимое.
	Lists map[string]string `json:"lists,omitempty"`
	// RemoveLists — файлы подкаталога rule-sets, которые применение удаляет.
	RemoveLists []string `json:"remove_lists,omitempty"`
	// ListsBase — отпечаток набора файлов, от которого редактировал клиент:
	// значение etag из GET /api/config/rule-sets. Пустой — применить без
	// сверки.
	ListsBase string `json:"lists_base,omitempty"`
}

// RuleSetFiles — файлы своих списков из подкаталога rule-sets каталога
// конфига, как их отдаёт GET /api/config/rule-sets.
type RuleSetFiles struct {
	// Files — имя файла → содержимое байт в байт.
	Files map[string]string `json:"files"`
	// Etag — отпечаток набора; клиент возвращает его в lists_base применения.
	Etag string `json:"etag"`
}

// Devices — ответ `GET /api/devices` и `PUT /api/devices/{mac}`: устройства
// LAN по адресу, без адреса — в конце.
type Devices struct {
	Devices []devices.Device `json:"devices"`
}

// DeviceName — тело `PUT /api/devices/{mac}`.
type DeviceName struct {
	// Name — своё имя устройства. Пустое убирает его, и подпись возвращается к
	// статической аренде или DHCP.
	Name string `json:"name"`
}

// Dataplane — ответ `GET /api/dataplane`: модель сетевой обвязки из UCI и
// то, стоят ли её правила на устройстве.
type Dataplane struct {
	Model dataplane.Model `json:"model"`
	// Applied — в таблице fw4 есть цепочки обвязки. Ложь без AppliedReason —
	// nft прочитан, цепочек нет.
	Applied bool `json:"applied"`
	// AppliedReason — почему Applied не наблюдён, а подставлен ложью.
	AppliedReason dataplane.AppliedReason `json:"applied_reason,omitempty"`
}

// DataplaneChange — тело `PUT /api/dataplane`: модель в той же форме, что поле
// model ответа `GET /api/dataplane`. Пишется целиком: отсутствующее поле — это
// нулевое значение, а не «оставить как есть».
type DataplaneChange struct {
	Model dataplane.Model `json:"model"`
}

// DataplaneDetails — поля отказа `dataplane_invalid`.
type DataplaneDetails struct {
	Fields []dataplane.FieldError `json:"fields"`
}

// Logs — ответ `GET /api/logs`: последние строки лога sing-box, старые первыми.
type Logs struct {
	Source logs.Source `json:"source"`
	// Since — отметка последней очистки в RFC 3339: строки раньше неё не
	// отдаются. Нет поля — очистки не было с запуска демона.
	Since   string       `json:"since,omitempty"`
	Entries []logs.Entry `json:"entries"`
}

// LogEvent — событие `log` потока `GET /api/logs/stream`.
type LogEvent struct {
	// Seq растёт на единицу с каждой строкой, в том числе отброшенной из-за
	// медленного читателя: разрыв означает потерю строк.
	Seq   uint64     `json:"seq"`
	Entry logs.Entry `json:"entry"`
}

// LogsCleared — ответ `POST /api/logs/clear`.
type LogsCleared struct {
	// Since — отметка очистки в RFC 3339.
	Since string `json:"since"`
}

// Error — единый формат отказа на границе HTTP. Внутренние подробности — пути
// на диске, аргументы команд, содержимое конфига — в него не попадают; Details
// несёт только то, что показывают пользователю.
//
// Code — контракт, Message — запасной текст: панель показывает свой перевод по
// коду, а сообщение берёт, только когда код ей незнаком.
type Error struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Details any       `json:"details,omitempty"`
}

// CheckDetails — вывод sing-box дословно. Единственное исключение из правила
// «внутренние подробности наружу не идут»: на этих строках пользователь
// чинит конфиг.
type CheckDetails struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}

// WorkdirDetails — каталоги отказа `workdir_mismatch`. Пути наружу идут
// намеренно: путь конфига панель и так знает из `GET /api/status`, а по этим
// двум она собирает команду, которая настраивает службу.
type WorkdirDetails struct {
	// Workdir — рабочий каталог, с которым procd поднимает службу.
	Workdir string `json:"workdir"`
	// ConfigDir — каталог конфига, которым владеет демон.
	ConfigDir string `json:"config_dir"`
}
