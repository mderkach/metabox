//go:build !linux

package diag

import "syscall"

// markControl: there is no socket mark outside Linux, the direct outbound is not checked.
func markControl(uint32) (func(network, address string, c syscall.RawConn) error, bool) {
	return nil, false
}
