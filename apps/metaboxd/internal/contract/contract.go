// Package contract объявляет формы, которые демон отдаёт наружу.
//
// Пакет существует, чтобы у контракта была явная граница: панель строит схемы
// по этим типам (ADR-0012), и приватная структура хендлера контрактом быть не
// может — её переименование молча доходило бы до панели. Доменные типы,
// попадающие в ответ целиком, остаются в своих пакетах: contract ссылается на
// них, а не копирует.
package contract

import (
	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/history"
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
	// ConfigPath — файл, которым демон владеет: путь задаётся флагами запуска,
	// и вычислить его на стороне панели нельзя.
	ConfigPath string `json:"config_path,omitempty"`
	// Runtime — откуда демон читает рантайм. Молчаливая подмена одного источника
	// другим запрещена, поэтому состав объявлен контрактом (ADR-0006).
	Runtime     Runtime            `json:"runtime"`
	Transaction *apply.Transaction `json:"transaction,omitempty"`
	// TransactionHref — адрес идущего применения. Без него перезагрузка
	// страницы теряет транзакцию: её идентификатор жил только в ответе на
	// POST (ADR-0002).
	TransactionHref string `json:"transaction_href,omitempty"`
}

// RuntimeSource — источник рантайм-данных (ADR-0006).
type RuntimeSource string

// SourceClashAPI — Clash API sing-box: базовый источник и пока единственный.
// gRPC-ветка ADR-0006 ждёт замера на целевом железе.
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
}

// Service — ответ `GET /api/service` и того же вида событие потока: панель
// получает один формат независимо от источника (ADR-0010).
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
}

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
	// `/api/events` (ADR-0010).
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
	// ErrCheckFailed — `sing-box check` отверг конфиг; вывод бинаря лежит в Details.
	ErrCheckFailed ErrorCode = "check_failed"
	// ErrInternal — отказ, о котором наружу говорить нечего: подробности в логе.
	ErrInternal ErrorCode = "internal"
)

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
// «внутренние подробности наружу не идут», и оно задано ADR-0002: на этих
// строках пользователь чинит конфиг.
type CheckDetails struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}
