//go:build !linux

package httpapi

import "syscall"

// control на других системах ничего не ставит: демон работает на роутере,
// а здесь он запускается только для разработки.
func control(_, _ string, _ syscall.RawConn) error {
	return nil
}
