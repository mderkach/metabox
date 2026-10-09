//go:build linux

package diag

import "syscall"

// markControl ставит сокету метку SO_MARK. Нужны права CAP_NET_ADMIN: демон на
// роутере работает от root.
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
