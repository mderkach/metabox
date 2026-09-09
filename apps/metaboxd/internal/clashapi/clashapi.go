// Package clashapi отвечает за секцию experimental.clash_api: гарантирует её
// наличие в применяемом конфиге (AC-31) и достаёт из конфига адрес и секрет для
// healthcheck.
//
// Это единственное место, где демон трогает содержимое конфига, и трогает
// точечно: секция вставляется правкой байт, остальной файл остаётся прежним.
// Разбор в структуру идёт только на чтение (Read) — обратной сериализации нет,
// иначе порядок ключей пользователя переписался бы (ADR-0002, AC-2).
package clashapi

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strconv"
)

var errNotJSON = errors.New("конфиг не является корректным JSON")

// Settings — то, что демону нужно от секции, чтобы достучаться до Clash API.
type Settings struct {
	Address string
	// Secret пуст, когда авторизация отключена. Форк отключает её целиком при
	// пустом секрете, и это штатный случай, а не ошибка конфигурации.
	Secret string
}

// Read достаёт адрес и секрет. Конфиг при этом не меняется: структура нужна
// только для чтения двух полей.
func Read(data []byte) (Settings, error) {
	var cfg struct {
		Experimental struct {
			ClashAPI struct {
				ExternalController string `json:"external_controller"`
				Secret             string `json:"secret"`
			} `json:"clash_api"`
		} `json:"experimental"`
	}

	if err := json.Unmarshal(data, &cfg); err != nil {
		return Settings{}, fmt.Errorf("чтение clash_api: %w", err)
	}

	return Settings{
		Address: cfg.Experimental.ClashAPI.ExternalController,
		Secret:  cfg.Experimental.ClashAPI.Secret,
	}, nil
}

// BaseURL приводит адрес контроллера к тому, по которому достучится сам демон.
// Контроллер, слушающий wildcard, отвечает и на loopback, а «0.0.0.0» как
// адрес назначения не маршрутизируется.
func (s Settings) BaseURL() (string, error) {
	if s.Address == "" {
		return "", errors.New("адрес контроллера пуст")
	}

	host, port, err := net.SplitHostPort(s.Address)
	if err != nil {
		return "", fmt.Errorf("разбор адреса %q: %w", s.Address, err)
	}

	switch host {
	case "", "0.0.0.0", "::":
		host = "127.0.0.1"
	}

	return "http://" + net.JoinHostPort(host, port), nil
}

// Ensure гарантирует, что применяемый конфиг содержит работоспособный
// experimental.clash_api (AC-31), и сообщает, потребовалась ли правка.
//
// Секция создаётся целиком — вместе со сгенерированным секретом, — только
// когда её нет. Если пользователь секцию уже завёл, дописывается ровно
// недостающий external_controller: пустой secret у существующей секции значит
// «авторизация не нужна», и дописать его означало бы сломать уже настроенных
// клиентов Clash API (ADR-0002).
func Ensure(data []byte, port int) ([]byte, bool, error) {
	if !json.Valid(data) {
		return nil, false, errNotJSON
	}

	address := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))

	top, err := objectStart(data)
	if err != nil {
		return nil, false, err
	}

	experimental, ok, err := findMember(data, top, "experimental")
	if err != nil {
		return nil, false, err
	}
	if !ok {
		section := fmt.Sprintf(`"experimental":{"clash_api":{"external_controller":%q,"secret":%q}}`,
			address, rand.Text())

		return insertMember(data, top, section), true, nil
	}

	clash, ok, err := findMember(data, experimental.start, "clash_api")
	if errors.Is(err, errNotObject) {
		return nil, false, fmt.Errorf("experimental: %w", err)
	}
	if err != nil {
		return nil, false, err
	}
	if !ok {
		section := fmt.Sprintf(`"clash_api":{"external_controller":%q,"secret":%q}`, address, rand.Text())

		return insertMember(data, experimental.start, section), true, nil
	}

	controller, ok, err := findMember(data, clash.start, "external_controller")
	if errors.Is(err, errNotObject) {
		return nil, false, fmt.Errorf("clash_api: %w", err)
	}
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return insertMember(data, clash.start, fmt.Sprintf(`"external_controller":%q`, address)), true, nil
	}

	if !isEmptyString(data[controller.start:controller.end]) {
		return data, false, nil
	}

	return replaceSpan(data, controller, strconv.Quote(address)), true, nil
}

// isEmptyString отвечает, пуста ли строка в этих байтах. Не строка — тоже
// «пусто»: контроллер, заданный числом, работать не будет, и секцию надо
// чинить.
func isEmptyString(raw []byte) bool {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return true
	}

	return value == ""
}
