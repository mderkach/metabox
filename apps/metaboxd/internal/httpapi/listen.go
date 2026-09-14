package httpapi

import (
	"errors"
	"fmt"
	"net"
	"strings"
)

// Addrs режет значение флага `-listen`: адреса перечисляются через запятую.
// Пустые куски отбрасываются, поэтому хвостовая запятая в UCI-настройке не
// превращается в попытку слушать пустой адрес.
func Addrs(spec string) []string {
	addrs := make([]string, 0, strings.Count(spec, ",")+1)

	for _, part := range strings.Split(spec, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			addrs = append(addrs, trimmed)
		}
	}

	return addrs
}

// Listen открывает слушатели на каждом адресе.
//
// Отказ на части адресов не отменяет остальные: у роутера интерфейсы поднимаются
// вразнобой, и адрес гостевой сети может появиться позже панели. Такие отказы
// возвращаются вторым значением — вызывающий их логирует, а демон продолжает
// работать на тех адресах, где слушатель открылся. Ошибка возвращается только
// тогда, когда не открылся ни один: слушать нечего и панель недостижима.
func Listen(addrs []string) ([]net.Listener, []error, error) {
	if len(addrs) == 0 {
		return nil, nil, errors.New("не задан ни один адрес")
	}

	var (
		listeners []net.Listener
		failures  []error
	)

	for _, addr := range addrs {
		listener, err := net.Listen("tcp", addr)
		if err != nil {
			failures = append(failures, fmt.Errorf("%s: %w", addr, err))

			continue
		}

		listeners = append(listeners, listener)
	}

	if len(listeners) == 0 {
		return nil, failures, fmt.Errorf("ни один адрес не открыт: %w", errors.Join(failures...))
	}

	return listeners, failures, nil
}

// Bound отдаёт адреса, на которых слушатели действительно открылись: в логе
// нужен адрес, по которому демон отвечает, а не тот, что просили.
func Bound(listeners []net.Listener) []string {
	addrs := make([]string, 0, len(listeners))

	for _, listener := range listeners {
		addrs = append(addrs, listener.Addr().String())
	}

	return addrs
}
