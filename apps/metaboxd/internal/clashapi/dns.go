package clashapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"time"
)

// DNSInbound is the address the daemon reaches the candidate dns-in at.
type DNSInbound struct {
	Address string
	// Network is "tcp" or "udp" when the inbound accepts only one of them;
	// empty means both.
	Network string
}

// ReadDNSInbound looks for dns-in: the first inbound of type direct whose listen_port equals
// port, the port the init script sends dnsmasq queries to. The tag is not
// considered: in homeproxy it is `dns-in`, the owner's may be anything, and the port
// is set by the dataplane model. False without an error means there is no such inbound in the config.
func ReadDNSInbound(data []byte, port int) (DNSInbound, bool, error) {
	var cfg struct {
		Inbounds []struct {
			Type       string `json:"type"`
			Listen     string `json:"listen"`
			ListenPort int    `json:"listen_port"`
			Network    string `json:"network"`
		} `json:"inbounds"`
	}

	if err := json.Unmarshal(mask(data), &cfg); err != nil {
		return DNSInbound{}, false, fmt.Errorf("read inbounds: %w", err)
	}

	for _, in := range cfg.Inbounds {
		if in.Type != "direct" || in.ListenPort != port {
			continue
		}

		host := in.Listen
		switch host {
		case "", "0.0.0.0", "::":
			host = "127.0.0.1"
		}

		return DNSInbound{Address: net.JoinHostPort(host, strconv.Itoa(port)), Network: in.Network}, true, nil
	}

	return DNSInbound{}, false, nil
}

// DNSProbe checks that the dns-in of the running sing-box resolves a name: a Clash API
// answer does not prove this, a broken dns section does not crash it.
type DNSProbe struct {
	name     string
	timeout  time.Duration
	interval time.Duration
	attempts int
}

// NewDNSProbe sets the name that must resolve, the ceiling of one attempt,
// the pause between attempts and their number. NXDOMAIN and an answer without an address are also
// a failure: the name is chosen as one that certainly exists.
func NewDNSProbe(name string, timeout, interval time.Duration, attempts int) *DNSProbe {
	return &DNSProbe{name: name, timeout: timeout, interval: interval, attempts: max(1, attempts)}
}

// Probe sends an A query to the inbound until the first answer with an address.
func (p *DNSProbe) Probe(ctx context.Context, in DNSInbound) error {
	resolver := &net.Resolver{
		PreferGo: true,
		// The address from resolv.conf is replaced: the query must go to dns-in, not
		// to the system resolver. The network is replaced only when the inbound
		// accepts one, since Go picks the response parsing by connection type.
		Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			if in.Network != "" {
				network = in.Network
			}

			var d net.Dialer

			return d.DialContext(ctx, network, in.Address)
		},
	}

	var last error
	for attempt := range p.attempts {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return fmt.Errorf("DNS probe %s via %s: %w, last attempt: %w", p.name, in.Address, ctx.Err(), last)
			case <-time.After(p.interval):
			}
		}

		attemptCtx, cancel := context.WithTimeout(ctx, p.timeout)
		_, err := resolver.LookupNetIP(attemptCtx, "ip4", p.name)
		cancel()

		if err == nil {
			return nil
		}
		last = err
	}

	return fmt.Errorf("DNS probe %s via %s, %d attempts: %w", p.name, in.Address, p.attempts, last)
}
