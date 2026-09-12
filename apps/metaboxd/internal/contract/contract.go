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
	ConfigPath  string             `json:"config_path,omitempty"`
	Transaction *apply.Transaction `json:"transaction,omitempty"`
	// TransactionHref — адрес идущего применения. Без него перезагрузка
	// страницы теряет транзакцию: её идентификатор жил только в ответе на
	// POST (ADR-0002).
	TransactionHref string `json:"transaction_href,omitempty"`
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
	Binary    string `json:"binary"`
	LastError string `json:"lastError,omitempty"`
}

// Error — единый формат отказа на границе HTTP. Внутренние подробности — пути
// на диске, аргументы команд, содержимое конфига — в него не попадают; Details
// несёт только то, что показывают пользователю.
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

// CheckDetails — вывод sing-box дословно. Единственное исключение из правила
// «внутренние подробности наружу не идут», и оно задано ADR-0002: на этих
// строках пользователь чинит конфиг.
type CheckDetails struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}
