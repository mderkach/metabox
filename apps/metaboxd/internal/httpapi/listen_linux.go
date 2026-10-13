package httpapi

import (
	"syscall"
	"time"
)

// unackedTimeout is how long a connection lives with unacknowledged data.
// A client that vanished without closing (a laptop fell asleep, Wi-Fi dropped) would otherwise
// hold the log stream together with the logread process until TCP retries run out,
// on Linux about a quarter of an hour, and there are only four streams in all.
const unackedTimeout = 30 * time.Second

// control sets TCP_USER_TIMEOUT on the listening socket: accepted connections
// inherit it from the listener.
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
