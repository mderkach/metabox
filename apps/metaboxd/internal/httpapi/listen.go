package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
)

// Addrs splits the value of the `-listen` flag: addresses are listed comma-separated.
// Empty pieces are dropped, so a trailing comma in the UCI setting does not
// turn into an attempt to listen on an empty address.
func Addrs(spec string) []string {
	addrs := make([]string, 0, strings.Count(spec, ",")+1)

	for _, part := range strings.Split(spec, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			addrs = append(addrs, trimmed)
		}
	}

	return addrs
}

// Hosts returns the host of each listen address and the host of the allowed origin:
// the names the panel certificate must cover. An address without a port is taken
// whole; the allowed origin contributes nothing when it does not parse.
func Hosts(addrs []string, allowedOrigin string) []string {
	hosts := make([]string, 0, len(addrs)+1)

	for _, addr := range addrs {
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			host = addr
		}

		hosts = append(hosts, host)
	}

	if u, err := url.Parse(allowedOrigin); err == nil && u.Hostname() != "" {
		hosts = append(hosts, u.Hostname())
	}

	return hosts
}

// Listen opens listeners on each address.
//
// A failure on some addresses does not cancel the others: on a router interfaces come up
// out of order, and the guest network address may appear later than the panel. Such failures
// are returned as the second value: the caller logs them, and the daemon keeps
// working on the addresses where a listener opened. An error is returned only
// when none opened: there is nothing to listen on and the panel is unreachable.
func Listen(addrs []string) ([]net.Listener, []error, error) {
	if len(addrs) == 0 {
		return nil, nil, errors.New("no listen address set")
	}

	var (
		listeners []net.Listener
		failures  []error
	)

	for _, addr := range addrs {
		listener, err := (&net.ListenConfig{Control: control}).Listen(context.Background(), "tcp", addr)
		if err != nil {
			failures = append(failures, fmt.Errorf("%s: %w", addr, err))

			continue
		}

		listeners = append(listeners, listener)
	}

	if len(listeners) == 0 {
		return nil, failures, fmt.Errorf("no address opened: %w", errors.Join(failures...))
	}

	return listeners, failures, nil
}

// Bound returns the addresses on which listeners actually opened: the log
// needs the address the daemon answers on, not the one that was requested.
func Bound(listeners []net.Listener) []string {
	addrs := make([]string, 0, len(listeners))

	for _, listener := range listeners {
		addrs = append(addrs, listener.Addr().String())
	}

	return addrs
}
