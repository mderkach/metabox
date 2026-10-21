package httpapi

import (
	"bufio"
	"crypto/tls"
	"errors"
	"net"
	"sync"
	"time"
)

// tlsRecordHandshake is the first byte of a TLS handshake record. A plain HTTP
// request starts with a method letter and never with it.
const tlsRecordHandshake = 0x16

// peekTimeout bounds the wait for the first byte of a connection. A client that
// connects and sends nothing would otherwise hold the peek goroutine forever.
const peekTimeout = 10 * time.Second

// SplitTLS serves TLS and plain HTTP on one listener: a connection is sorted by its
// first byte, so the panel address and port stay the same when HTTPS is turned on, and a
// bookmark with `http://` reaches the redirect instead of a protocol error.
//
// The two listeners returned are served by the same http.Server. Closing either one
// closes the underlying listener and ends the other.
func SplitTLS(listener net.Listener, config *tls.Config) (plain, secure net.Listener) {
	mux := &tlsMux{
		listener: listener,
		plain:    make(chan net.Conn),
		secure:   make(chan net.Conn),
		done:     make(chan struct{}),
	}

	go mux.accept()

	plainSide := &muxListener{mux: mux, conns: mux.plain}
	secureSide := &muxListener{mux: mux, conns: mux.secure}

	return plainSide, tls.NewListener(secureSide, config)
}

type tlsMux struct {
	listener net.Listener
	plain    chan net.Conn
	secure   chan net.Conn

	closeOnce sync.Once
	done      chan struct{}
	err       error
}

// accept hands each connection to its own goroutine for the peek: a slow client must
// not delay the next one. A temporary accept failure (the descriptor table is full)
// is retried with the same backoff http.Server uses, since the server no longer
// sees the real listener.
func (m *tlsMux) accept() {
	var delay time.Duration

	for {
		conn, err := m.listener.Accept()
		if err != nil {
			var temporary interface{ Temporary() bool }
			if errors.As(err, &temporary) && temporary.Temporary() {
				delay = nextAcceptDelay(delay)
				time.Sleep(delay)

				continue
			}

			m.close(err)

			return
		}

		delay = 0

		go m.sort(conn)
	}
}

func nextAcceptDelay(delay time.Duration) time.Duration {
	const first, limit = 5 * time.Millisecond, time.Second

	if delay == 0 {
		return first
	}

	return min(2*delay, limit)
}

func (m *tlsMux) sort(conn net.Conn) {
	if err := conn.SetReadDeadline(time.Now().Add(peekTimeout)); err != nil {
		_ = conn.Close()

		return
	}

	reader := bufio.NewReader(conn)

	first, err := reader.Peek(1)
	if err != nil {
		_ = conn.Close()

		return
	}

	if err := conn.SetReadDeadline(time.Time{}); err != nil {
		_ = conn.Close()

		return
	}

	peeked := &peekedConn{Conn: conn, reader: reader}

	target := m.plain
	if first[0] == tlsRecordHandshake {
		target = m.secure
	}

	select {
	case target <- peeked:
	case <-m.done:
		_ = conn.Close()
	}
}

func (m *tlsMux) close(err error) {
	m.closeOnce.Do(func() {
		m.err = err
		close(m.done)
	})
}

// peekedConn returns the bytes read for the peek before the rest of the stream.
type peekedConn struct {
	net.Conn
	reader *bufio.Reader
}

func (c *peekedConn) Read(p []byte) (int, error) {
	return c.reader.Read(p)
}

type muxListener struct {
	mux   *tlsMux
	conns chan net.Conn
}

func (l *muxListener) Accept() (net.Conn, error) {
	select {
	case conn := <-l.conns:
		return conn, nil
	case <-l.mux.done:
		if errors.Is(l.mux.err, net.ErrClosed) {
			return nil, net.ErrClosed
		}

		return nil, l.mux.err
	}
}

// Close closes the shared listener: http.Server closes every listener it serves on
// Shutdown, and the second call must not fail.
func (l *muxListener) Close() error {
	err := l.mux.listener.Close()
	l.mux.close(net.ErrClosed)

	if errors.Is(err, net.ErrClosed) {
		return nil
	}

	return err
}

func (l *muxListener) Addr() net.Addr {
	return l.mux.listener.Addr()
}
