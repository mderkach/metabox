package clashapi

import (
	"context"
	"net"
	"net/netip"
	"strconv"
	"time"
)

// PinLocalController returns a numeric destination proved to be on this host.
// Resolving once keeps a later request from following a changed DNS answer.
func (s Settings) PinLocalController(ctx context.Context) (Settings, int) {
	if port := s.LocalPort(); port != 0 {
		return s, port
	}

	host, portText, err := net.SplitHostPort(s.Address)
	if err != nil {
		return Settings{}, 0
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 {
		return Settings{}, 0
	}

	addrs, err := controllerAddrs(ctx, host)
	if err != nil || len(addrs) == 0 {
		return Settings{}, 0
	}

	owned := make(map[netip.Addr]struct{})
	for _, ip := range addrs {
		if !ip.IsLoopback() {
			owned, err = localInterfaceAddrs()
			if err != nil {
				return Settings{}, 0
			}

			break
		}
	}

	pinned := addrs[0]
	for _, addr := range addrs {
		if _, ok := owned[addr.WithZone("").Unmap()]; !ok && !addr.IsLoopback() {
			return Settings{}, 0
		}

		// The core's TCP listener prefers IPv4 for a dual-stack hostname.
		if addr.Is4() && !pinned.Is4() {
			pinned = addr
		}
	}

	return Settings{Address: net.JoinHostPort(pinned.String(), portText), Secret: s.Secret}, port
}

func controllerAddrs(ctx context.Context, host string) ([]netip.Addr, error) {
	if addr, err := netip.ParseAddr(host); err == nil {
		return []netip.Addr{addr.Unmap()}, nil
	}

	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()

	return net.DefaultResolver.LookupNetIP(ctx, "ip", host)
}

func localInterfaceAddrs() (map[netip.Addr]struct{}, error) {
	addresses, err := net.InterfaceAddrs()
	if err != nil {
		return nil, err
	}

	owned := make(map[netip.Addr]struct{}, len(addresses))
	for _, addr := range addresses {
		if prefix, err := netip.ParsePrefix(addr.String()); err == nil {
			owned[prefix.Addr().Unmap()] = struct{}{}
		}
	}

	return owned, nil
}
