//go:build !linux

package httpapi

import "syscall"

// control sets nothing on other systems: the daemon runs on the router,
// and here it is started only for development.
func control(_, _ string, _ syscall.RawConn) error {
	return nil
}
