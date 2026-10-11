package httpapi

import (
	"syscall"
	"time"
)

// unackedTimeout — сколько соединение живёт с неподтверждёнными данными.
// Клиент, пропавший без закрытия (уснул ноутбук, отвалился Wi-Fi), иначе
// держит поток лога вместе с процессом logread до исчерпания повторов TCP —
// на Linux около четверти часа, а потоков всего четыре.
const unackedTimeout = 30 * time.Second

// control ставит TCP_USER_TIMEOUT на слушающий сокет: принятые соединения
// наследуют его от слушателя.
func control(_, _ string, conn syscall.RawConn) error {
	var sockErr error

	err := conn.Control(func(fd uintptr) {
		sockErr = syscall.SetsockoptInt(int(fd), syscall.IPPROTO_TCP, syscall.TCP_USER_TIMEOUT, int(unackedTimeout.Milliseconds()))
	})
	if err != nil {
		return err
	}

	return sockErr
}
