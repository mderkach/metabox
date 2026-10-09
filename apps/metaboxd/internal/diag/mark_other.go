//go:build !linux

package diag

import "syscall"

// markControl: метки сокета вне Linux нет, прямой выход не проверяется.
func markControl(uint32) (func(network, address string, c syscall.RawConn) error, bool) {
	return nil, false
}
