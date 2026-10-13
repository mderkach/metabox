package httpapi

import (
	"net"
	"syscall"
	"testing"
)

func TestListenSetsUnackedTimeout(t *testing.T) {
	listeners, _, err := Listen([]string{"127.0.0.1:0"})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = listeners[0].Close() }()

	client, err := net.Dial("tcp", listeners[0].Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = client.Close() }()

	conn, err := listeners[0].Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()

	raw, err := conn.(*net.TCPConn).SyscallConn()
	if err != nil {
		t.Fatal(err)
	}

	var (
		got    int
		optErr error
	)

	if err := raw.Control(func(fd uintptr) {
		got, optErr = syscall.GetsockoptInt(int(fd), syscall.IPPROTO_TCP, syscall.TCP_USER_TIMEOUT)
	}); err != nil {
		t.Fatal(err)
	}

	if optErr != nil {
		t.Fatal(optErr)
	}

	if want := int(unackedTimeout.Milliseconds()); got != want {
		t.Errorf("TCP_USER_TIMEOUT of the accepted connection %d ms, expected %d", got, want)
	}
}
