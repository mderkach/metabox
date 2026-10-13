package clashapi_test

import (
	"encoding/binary"
	"net"
	"testing"
	"time"

	"metabox/internal/clashapi"
)

func TestReadDNSInbound(t *testing.T) {
	tests := []struct {
		name   string
		config string
		want   clashapi.DNSInbound
		found  bool
	}{
		{
			name:   "dns-in homeproxy",
			config: `{"inbounds":[{"type":"mixed","listen_port":5333},{"type":"direct","tag":"dns-in","listen":"127.0.0.1","listen_port":5333}]}`,
			want:   clashapi.DNSInbound{Address: "127.0.0.1:5333"},
			found:  true,
		},
		{
			name:   "wildcard is turned into loopback",
			config: `{"inbounds":[{"type":"direct","listen":"::","listen_port":5333,"network":"udp"}]}`,
			want:   clashapi.DNSInbound{Address: "127.0.0.1:5333", Network: "udp"},
			found:  true,
		},
		{
			name:   "IPv6 loopback",
			config: `{"inbounds":[{"type":"direct","listen":"::1","listen_port":5333}]}`,
			want:   clashapi.DNSInbound{Address: "[::1]:5333"},
			found:  true,
		},
		{
			name:   "direct on another port is not dns-in",
			config: `{"inbounds":[{"type":"direct","listen":"127.0.0.1","listen_port":5353}]}`,
		},
		{
			name:   "no inbounds",
			config: `{"log":{}}`,
		},
		{
			name: "comments and a dangling comma",
			config: `{
				// dns-in
				"inbounds":[{"type":"direct","listen":"127.0.0.1","listen_port":5333,},],
			}`,
			want:  clashapi.DNSInbound{Address: "127.0.0.1:5333"},
			found: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, found, err := clashapi.ReadDNSInbound([]byte(tt.config), 5333)
			if err != nil {
				t.Fatalf("reading: %v", err)
			}
			if found != tt.found || got != tt.want {
				t.Errorf("got %+v, %v; expected %+v, %v", got, found, tt.want, tt.found)
			}
		})
	}
}

func TestDNSProbe(t *testing.T) {
	t.Run("answer with an address passes", func(t *testing.T) {
		addr := serveDNS(t, true)

		probe := clashapi.NewDNSProbe("example.com", time.Second, time.Millisecond, 2)
		if err := probe.Probe(t.Context(), clashapi.DNSInbound{Address: addr}); err != nil {
			t.Errorf("probe: %v", err)
		}
	})

	t.Run("a silent dns-in is a failure after all attempts", func(t *testing.T) {
		addr := serveDNS(t, false)

		probe := clashapi.NewDNSProbe("example.com", 50*time.Millisecond, time.Millisecond, 2)
		if err := probe.Probe(t.Context(), clashapi.DNSInbound{Address: addr}); err == nil {
			t.Error("probe passed although dns-in did not answer")
		}
	})
}

// serveDNS starts a UDP socket on loopback. answer: reply to every
// query with an A record 192.0.2.1; false means read and stay silent, like a dns-in whose
// upstream does not answer.
func serveDNS(t *testing.T, answer bool) string {
	t.Helper()

	conn, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	go func() {
		buf := make([]byte, 512)
		for {
			n, from, err := conn.ReadFrom(buf)
			if err != nil {
				return
			}
			if !answer {
				continue
			}
			if reply := replyA(buf[:n]); reply != nil {
				_, _ = conn.WriteTo(reply, from)
			}
		}
	}()

	return conn.LocalAddr().String()
}

// replyA builds an answer to the first question of the query: a header with the same
// identifier, the question as is and one A record referring to the question name.
func replyA(query []byte) []byte {
	const header = 12

	end := header
	for end < len(query) && query[end] != 0 {
		end += int(query[end]) + 1
	}
	end += 1 + 4
	if end > len(query) {
		return nil
	}

	reply := make([]byte, 0, end+16)
	reply = append(reply, query[0], query[1], 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0)
	reply = append(reply, query[header:end]...)
	reply = append(reply, 0xc0, header, 0, 1, 0, 1)
	reply = binary.BigEndian.AppendUint32(reply, 60)
	reply = append(reply, 0, 4, 192, 0, 2, 1)

	return reply
}
