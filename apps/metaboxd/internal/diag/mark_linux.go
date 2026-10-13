//go:build linux

package diag

import "syscall"

// markControl sets the SO_MARK mark on a socket. Needs CAP_NET_ADMIN: the daemon on the
// router runs as root.
func markControl(mark uint32) (func(network, address string, c syscall.RawConn) error, bool) {
	return func(_, _ string, c syscall.RawConn) error {
		var markErr error

		err := c.Control(func(fd uintptr) {
			markErr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_MARK, int(mark))
		})
		if err != nil {
			return err
		}

		return markErr
	}, true
}
