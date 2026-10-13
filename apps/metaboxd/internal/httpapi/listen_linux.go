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

// tcpUserTimeout — номер опции TCP_USER_TIMEOUT из linux/tcp.h, один на всех
// архитектурах. Замороженный syscall объявляет её только для части GOARCH:
// на amd64 и arm константы нет, а x/sys/unix — зависимость, которой у демона нет.
const tcpUserTimeout = 0x12

// control ставит TCP_USER_TIMEOUT на слушающий сокет: принятые соединения
// наследуют его от слушателя.
func control(_, _ string, conn syscall.RawConn) error {
	var sockErr error

	err := conn.Control(func(fd uintptr) {
		sockErr = syscall.SetsockoptInt(int(fd), syscall.IPPROTO_TCP, tcpUserTimeout, int(unackedTimeout.Milliseconds()))
	})
	if err != nil {
		return err
	}

	return sockErr
}
