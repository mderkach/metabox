package diag_test

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/dataplane"
	"metabox/internal/diag"
	"metabox/internal/locale"
)

type fakePlane struct {
	model     dataplane.Model
	modelErr  error
	chains    []string
	nftReason dataplane.AppliedReason
}

func (f fakePlane) Model(context.Context) (dataplane.Model, error) { return f.model, f.modelErr }

func (f fakePlane) Chains(context.Context) ([]string, dataplane.AppliedReason, error) {
	return f.chains, f.nftReason, nil
}

type fakeConfig struct {
	data []byte
	err  error
}

func (f fakeConfig) Read(context.Context) ([]byte, error) { return f.data, f.err }

type fakeDNS struct {
	err   error
	asked []clashapi.DNSInbound
}

func (f *fakeDNS) Probe(_ context.Context, in clashapi.DNSInbound) error {
	f.asked = append(f.asked, in)

	return f.err
}

// listen starts a TCP listener on loopback and returns its port.
func listen(t *testing.T) int {
	t.Helper()

	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = l.Close() })

	go func() {
		for {
			conn, err := l.Accept()
			if err != nil {
				return
			}

			_ = conn.Close()
		}
	}()

	return l.Addr().(*net.TCPAddr).Port
}

// closedPort returns a port that has just been freed.
func closedPort(t *testing.T) int {
	t.Helper()

	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}

	port := l.Addr().(*net.TCPAddr).Port
	_ = l.Close()

	return port
}

func model(redirect int) dataplane.Model {
	m := dataplane.Defaults()
	m.RedirectPort = redirect
	m.TproxyPort = 5332
	m.DNSPort = 5333

	return m
}

func configWith(dnsPort int, controller string) fakeConfig {
	return fakeConfig{data: fmt.Appendf(nil, `{
		"inbounds": [{"type": "direct", "tag": "dns-in", "listen": "::", "listen_port": %d}],
		"experimental": {"clash_api": {"external_controller": %q, "secret": "s3"}}
	}`, dnsPort, controller)}
}

func run(t *testing.T, c *diag.Checker, proxy string) map[diag.CheckName]diag.Check {
	t.Helper()

	report, err := c.Run(t.Context(), proxy)
	if err != nil {
		t.Fatal(err)
	}

	out := map[diag.CheckName]diag.Check{}
	for _, check := range report.Checks {
		out[check.Name] = check
	}

	if len(out) != 7 {
		t.Fatalf("checks %d, expected seven: %+v", len(out), report.Checks)
	}

	return out
}

func options() diag.Options {
	return diag.Options{ProcNet: "testdata/proc", URL: "http://127.0.0.1:1/generate_204", Timeout: 2 * time.Second}
}

func TestPortListeners(t *testing.T) {
	plane := fakePlane{model: model(listen(t)), chains: dataplane.ExpectedChains()}
	got := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), nil, options()), "")

	for _, name := range []diag.CheckName{diag.NameRedirectPort, diag.NameTproxyPort, diag.NameDNSPort} {
		if got[name].Status != diag.StatusOK {
			t.Errorf("%s: %+v, expected ok", name, got[name])
		}
	}

	if got[diag.NameChains].Status != diag.StatusOK {
		t.Errorf("chains: %+v, expected ok", got[diag.NameChains])
	}

	t.Run("port closed", func(t *testing.T) {
		m := model(closedPort(t))
		m.TproxyPort = 5334
		got := run(t, diag.New(fakePlane{model: m}, configWith(5333, "127.0.0.1:1"), nil, options()), "")

		for _, name := range []diag.CheckName{diag.NameRedirectPort, diag.NameTproxyPort} {
			if c := got[name]; c.Status != diag.StatusFail || c.Reason != diag.ReasonNotListening {
				t.Errorf("%s: %+v, expected not_listening", name, c)
			}
		}
	})

	t.Run("no socket tables", func(t *testing.T) {
		opts := options()
		opts.ProcNet = t.TempDir()
		got := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), nil, opts), "")

		if c := got[diag.NameDNSPort]; c.Status != diag.StatusSkipped || c.Reason != diag.ReasonProcUnavailable {
			t.Errorf("dns_port: %+v, expected a skip proc_unavailable", c)
		}
	})
}

func TestChains(t *testing.T) {
	t.Run("part of the chains removed", func(t *testing.T) {
		plane := fakePlane{model: model(closedPort(t)), chains: []string{"metabox_redirect", "metabox_mangle_output"}}
		c := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), nil, options()), "")[diag.NameChains]

		if c.Status != diag.StatusFail || c.Reason != diag.ReasonChainsMissing {
			t.Fatalf("chains: %+v, expected chains_missing", c)
		}

		if !slices.Contains(c.Missing, "metabox_redirect_lanac") || slices.Contains(c.Missing, "metabox_redirect") {
			t.Errorf("missing %q", c.Missing)
		}
	})

	t.Run("nft unavailable", func(t *testing.T) {
		plane := fakePlane{model: model(closedPort(t)), nftReason: dataplane.NFTUnavailable}
		c := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), nil, options()), "")[diag.NameChains]

		if c.Status != diag.StatusSkipped || c.Reason != diag.ReasonNFTUnavailable {
			t.Errorf("chains: %+v, expected a skip nft_unavailable", c)
		}
	})
}

func TestSkippedWithoutModel(t *testing.T) {
	t.Run("model not read", func(t *testing.T) {
		plane := fakePlane{modelErr: errors.New("uci show metabox: exit 1")}
		got := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), &fakeDNS{}, options()), "")

		for _, name := range []diag.CheckName{diag.NameRedirectPort, diag.NameDNSProbe, diag.NameChains, diag.NameDirect} {
			if c := got[name]; c.Status != diag.StatusSkipped || c.Reason != diag.ReasonModelUnavailable {
				t.Errorf("%s: %+v, expected a skip model_unavailable", name, c)
			}
		}
	})

	t.Run("interception disabled", func(t *testing.T) {
		m := model(closedPort(t))
		m.Enabled = false
		got := run(t, diag.New(fakePlane{model: m}, configWith(5333, "127.0.0.1:1"), &fakeDNS{}, options()), "")

		if c := got[diag.NameRedirectPort]; c.Status != diag.StatusSkipped || c.Reason != diag.ReasonInterceptionDisabled {
			t.Errorf("redirect_port: %+v, expected a skip interception_disabled", c)
		}
	})
}

func TestDNSProbe(t *testing.T) {
	plane := fakePlane{model: model(closedPort(t)), chains: dataplane.ExpectedChains()}

	t.Run("dns-in is silent", func(t *testing.T) {
		dns := &fakeDNS{err: errors.New("i/o timeout")}
		c := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), dns, options()), "")[diag.NameDNSProbe]

		if c.Status != diag.StatusFail || c.Reason != diag.ReasonNoAnswer {
			t.Errorf("probe: %+v, expected no_answer", c)
		}

		if len(dns.asked) != 1 || dns.asked[0].Address != "127.0.0.1:5333" {
			t.Errorf("query went to %+v, expected dns-in on loopback", dns.asked)
		}
	})

	t.Run("detail follows the language", func(t *testing.T) {
		for lang, want := range map[locale.Lang]string{
			locale.English: "DNS probe cloudflare.com via 127.0.0.1:5333, 3 attempts: i/o timeout",
			locale.Russian: "DNS-проба cloudflare.com через 127.0.0.1:5333, попыток 3: i/o timeout",
		} {
			dns := &fakeDNS{err: locale.Errorf("DNS probe %s via %s, %d attempts: %w", "cloudflare.com", "127.0.0.1:5333", 3, errors.New("i/o timeout"))}
			opts := options()
			opts.Lang = lang

			if c := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), dns, opts), "")[diag.NameDNSProbe]; c.Detail != want {
				t.Errorf("%s: detail %q, want %q", lang, c.Detail, want)
			}
		}
	})

	t.Run("dns-in answers", func(t *testing.T) {
		c := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), &fakeDNS{}, options()), "")[diag.NameDNSProbe]

		if c.Status != diag.StatusOK {
			t.Errorf("probe: %+v, expected ok", c)
		}
	})

	t.Run("no dns-in in the config", func(t *testing.T) {
		c := run(t, diag.New(plane, configWith(5999, "127.0.0.1:1"), &fakeDNS{}, options()), "")[diag.NameDNSProbe]

		if c.Status != diag.StatusFail || c.Reason != diag.ReasonNoDNSInbound {
			t.Errorf("probe: %+v, expected no_dns_inbound", c)
		}
	})

	t.Run("name not set", func(t *testing.T) {
		c := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), nil, options()), "")[diag.NameDNSProbe]

		if c.Status != diag.StatusSkipped || c.Reason != diag.ReasonDNSNameUnset {
			t.Errorf("probe: %+v, expected a skip dns_name_unset", c)
		}
	})

	t.Run("no config", func(t *testing.T) {
		c := run(t, diag.New(plane, fakeConfig{err: config.ErrNoConfig}, &fakeDNS{}, options()), "")[diag.NameDNSProbe]

		if c.Status != diag.StatusSkipped || c.Reason != diag.ReasonConfigMissing {
			t.Errorf("probe: %+v, expected a skip config_missing", c)
		}
	})
}

func TestProxyDelay(t *testing.T) {
	var query string

	clash := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer s3" {
			w.WriteHeader(http.StatusUnauthorized)

			return
		}

		switch r.URL.EscapedPath() {
		case "/proxies/" + "node%20A" + "/delay":
			query = r.URL.RawQuery
			_, _ = w.Write([]byte(`{"delay": 42}`))
		case "/proxies/dead/delay":
			w.WriteHeader(http.StatusGatewayTimeout)
			_, _ = w.Write([]byte(`{"message": "An error occurred in the delay test"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"message": "Resource not found"}`))
		}
	}))
	t.Cleanup(clash.Close)

	cfg := configWith(5333, strings.TrimPrefix(clash.URL, "http://"))
	c := diag.New(fakePlane{model: model(closedPort(t))}, cfg, nil, options())

	tests := []struct {
		name   string
		proxy  string
		status diag.CheckStatus
		reason diag.CheckReason
	}{
		{"node answers", "node A", diag.StatusOK, ""},
		{"node does not answer", "dead", diag.StatusFail, diag.ReasonRequestFailed},
		{"no node", "missing", diag.StatusFail, diag.ReasonProxyMissing},
		{"node not selected", "", diag.StatusSkipped, diag.ReasonProxyUnset},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := run(t, c, tt.proxy)[diag.NameProxy]

			if got.Status != tt.status || got.Reason != tt.reason {
				t.Errorf("node %q: %+v, expected %s %s", tt.proxy, got, tt.status, tt.reason)
			}
		})
	}

	if !strings.Contains(query, "url=http%3A%2F%2F127.0.0.1%3A1%2Fgenerate_204") || !strings.Contains(query, "timeout="+strconv.Itoa(1600)) {
		t.Errorf("measurement request %q", query)
	}
}

func TestObserveReportsRecordedDelay(t *testing.T) {
	var (
		mu        sync.Mutex
		requested []string
	)

	clash := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requested = append(requested, r.URL.Path)
		mu.Unlock()

		if r.Header.Get("Authorization") != "Bearer s3" {
			w.WriteHeader(http.StatusUnauthorized)

			return
		}

		if r.URL.Path != "/proxies" {
			w.WriteHeader(http.StatusNotFound)

			return
		}

		_, _ = w.Write([]byte(`{"proxies":{
			"node A":{"type":"VLESS","history":[{"time":"2026-10-20T10:05:00Z","delay":42}]},
			"fresh":{"type":"VLESS","history":[]}
		}}`))
	}))
	t.Cleanup(clash.Close)

	cfg := configWith(5333, strings.TrimPrefix(clash.URL, "http://"))
	c := diag.New(fakePlane{model: model(closedPort(t))}, cfg, nil, options())

	tests := []struct {
		name   string
		proxy  string
		status diag.CheckStatus
		reason diag.CheckReason
		delay  int
	}{
		{"last recorded delay", "node A", diag.StatusOK, "", 42},
		{"no record: never measured or the last test failed", "fresh", diag.StatusSkipped, diag.ReasonNotMeasured, 0},
		{"no node", "missing", diag.StatusFail, diag.ReasonProxyMissing, 0},
		{"node not selected", "", diag.StatusSkipped, diag.ReasonProxyUnset, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			report, err := c.Observe(t.Context(), tt.proxy)
			if err != nil {
				t.Fatal(err)
			}

			i := slices.IndexFunc(report.Checks, func(c diag.Check) bool { return c.Name == diag.NameProxy })
			if i < 0 {
				t.Fatalf("no proxy row in %+v", report.Checks)
			}

			if got := report.Checks[i]; got.Status != tt.status || got.Reason != tt.reason || got.DelayMS != tt.delay {
				t.Errorf("node %q: %+v, expected %s %s %d ms", tt.proxy, got, tt.status, tt.reason, tt.delay)
			}
		})
	}

	mu.Lock()
	defer mu.Unlock()

	for _, path := range requested {
		if strings.Contains(path, "/delay") {
			t.Errorf("latency check requested: %s", path)
		}
	}
}

func TestObserveControllerFailures(t *testing.T) {
	refusing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	t.Cleanup(refusing.Close)

	tests := []struct {
		name       string
		controller string
		reason     diag.CheckReason
	}{
		{"controller down", "127.0.0.1:1", diag.ReasonRuntimeUnavailable},
		{"controller refuses", strings.TrimPrefix(refusing.URL, "http://"), diag.ReasonRequestFailed},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := diag.New(fakePlane{model: model(closedPort(t))}, configWith(5333, tt.controller), nil, options())

			report, err := c.Observe(t.Context(), "node A")
			if err != nil {
				t.Fatal(err)
			}

			i := slices.IndexFunc(report.Checks, func(c diag.Check) bool { return c.Name == diag.NameProxy })
			if i < 0 || report.Checks[i].Status != diag.StatusFail || report.Checks[i].Reason != tt.reason {
				t.Errorf("proxy row %+v, expected fail %s", report.Checks, tt.reason)
			}
		})
	}
}

func TestDirectUnsupportedOutsideLinux(t *testing.T) {
	if runtime.GOOS == "linux" {
		t.Skip("socket mark exists only on Linux")
	}

	c := run(t, diag.New(fakePlane{model: model(closedPort(t))}, configWith(5333, "127.0.0.1:1"), nil, options()), "")[diag.NameDirect]

	if c.Status != diag.StatusSkipped || c.Reason != diag.ReasonUnsupported {
		t.Errorf("direct outbound: %+v, expected a skip unsupported", c)
	}
}
