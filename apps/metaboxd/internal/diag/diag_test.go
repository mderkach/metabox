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
	"testing"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/dataplane"
	"metabox/internal/diag"
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

// listen поднимает слушателя TCP на loopback и отдаёт его порт.
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

// closedPort отдаёт порт, который только что освободился.
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
		t.Fatalf("проверок %d, ожидали семь: %+v", len(out), report.Checks)
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
			t.Errorf("%s: %+v, ожидали ok", name, got[name])
		}
	}

	if got[diag.NameChains].Status != diag.StatusOK {
		t.Errorf("цепочки: %+v, ожидали ok", got[diag.NameChains])
	}

	t.Run("порт закрыт", func(t *testing.T) {
		m := model(closedPort(t))
		m.TproxyPort = 5334
		got := run(t, diag.New(fakePlane{model: m}, configWith(5333, "127.0.0.1:1"), nil, options()), "")

		for _, name := range []diag.CheckName{diag.NameRedirectPort, diag.NameTproxyPort} {
			if c := got[name]; c.Status != diag.StatusFail || c.Reason != diag.ReasonNotListening {
				t.Errorf("%s: %+v, ожидали not_listening", name, c)
			}
		}
	})

	t.Run("таблиц сокетов нет", func(t *testing.T) {
		opts := options()
		opts.ProcNet = t.TempDir()
		got := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), nil, opts), "")

		if c := got[diag.NameDNSPort]; c.Status != diag.StatusSkipped || c.Reason != diag.ReasonProcUnavailable {
			t.Errorf("dns_port: %+v, ожидали пропуск proc_unavailable", c)
		}
	})
}

func TestChains(t *testing.T) {
	t.Run("часть цепочек снята", func(t *testing.T) {
		plane := fakePlane{model: model(closedPort(t)), chains: []string{"metabox_redirect", "metabox_mangle_output"}}
		c := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), nil, options()), "")[diag.NameChains]

		if c.Status != diag.StatusFail || c.Reason != diag.ReasonChainsMissing {
			t.Fatalf("цепочки: %+v, ожидали chains_missing", c)
		}

		if !slices.Contains(c.Missing, "metabox_redirect_lanac") || slices.Contains(c.Missing, "metabox_redirect") {
			t.Errorf("отсутствующие %q", c.Missing)
		}
	})

	t.Run("nft недоступен", func(t *testing.T) {
		plane := fakePlane{model: model(closedPort(t)), nftReason: dataplane.NFTUnavailable}
		c := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), nil, options()), "")[diag.NameChains]

		if c.Status != diag.StatusSkipped || c.Reason != diag.ReasonNFTUnavailable {
			t.Errorf("цепочки: %+v, ожидали пропуск nft_unavailable", c)
		}
	})
}

func TestSkippedWithoutModel(t *testing.T) {
	t.Run("модель не прочитана", func(t *testing.T) {
		plane := fakePlane{modelErr: errors.New("uci show metabox: exit 1")}
		got := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), &fakeDNS{}, options()), "")

		for _, name := range []diag.CheckName{diag.NameRedirectPort, diag.NameDNSProbe, diag.NameChains, diag.NameDirect} {
			if c := got[name]; c.Status != diag.StatusSkipped || c.Reason != diag.ReasonModelUnavailable {
				t.Errorf("%s: %+v, ожидали пропуск model_unavailable", name, c)
			}
		}
	})

	t.Run("перехват выключен", func(t *testing.T) {
		m := model(closedPort(t))
		m.Enabled = false
		got := run(t, diag.New(fakePlane{model: m}, configWith(5333, "127.0.0.1:1"), &fakeDNS{}, options()), "")

		if c := got[diag.NameRedirectPort]; c.Status != diag.StatusSkipped || c.Reason != diag.ReasonInterceptionDisabled {
			t.Errorf("redirect_port: %+v, ожидали пропуск interception_disabled", c)
		}
	})
}

func TestDNSProbe(t *testing.T) {
	plane := fakePlane{model: model(closedPort(t)), chains: dataplane.ExpectedChains()}

	t.Run("dns-in молчит", func(t *testing.T) {
		dns := &fakeDNS{err: errors.New("i/o timeout")}
		c := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), dns, options()), "")[diag.NameDNSProbe]

		if c.Status != diag.StatusFail || c.Reason != diag.ReasonNoAnswer {
			t.Errorf("проба: %+v, ожидали no_answer", c)
		}

		if len(dns.asked) != 1 || dns.asked[0].Address != "127.0.0.1:5333" {
			t.Errorf("запрос ушёл на %+v, ожидали dns-in на loopback", dns.asked)
		}
	})

	t.Run("dns-in отвечает", func(t *testing.T) {
		c := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), &fakeDNS{}, options()), "")[diag.NameDNSProbe]

		if c.Status != diag.StatusOK {
			t.Errorf("проба: %+v, ожидали ok", c)
		}
	})

	t.Run("dns-in нет в конфиге", func(t *testing.T) {
		c := run(t, diag.New(plane, configWith(5999, "127.0.0.1:1"), &fakeDNS{}, options()), "")[diag.NameDNSProbe]

		if c.Status != diag.StatusFail || c.Reason != diag.ReasonNoDNSInbound {
			t.Errorf("проба: %+v, ожидали no_dns_inbound", c)
		}
	})

	t.Run("имя не задано", func(t *testing.T) {
		c := run(t, diag.New(plane, configWith(5333, "127.0.0.1:1"), nil, options()), "")[diag.NameDNSProbe]

		if c.Status != diag.StatusSkipped || c.Reason != diag.ReasonDNSNameUnset {
			t.Errorf("проба: %+v, ожидали пропуск dns_name_unset", c)
		}
	})

	t.Run("конфига нет", func(t *testing.T) {
		c := run(t, diag.New(plane, fakeConfig{err: config.ErrNoConfig}, &fakeDNS{}, options()), "")[diag.NameDNSProbe]

		if c.Status != diag.StatusSkipped || c.Reason != diag.ReasonConfigMissing {
			t.Errorf("проба: %+v, ожидали пропуск config_missing", c)
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
		{"узел отвечает", "node A", diag.StatusOK, ""},
		{"узел не отвечает", "dead", diag.StatusFail, diag.ReasonRequestFailed},
		{"узла нет", "missing", diag.StatusFail, diag.ReasonProxyMissing},
		{"узел не выбран", "", diag.StatusSkipped, diag.ReasonProxyUnset},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := run(t, c, tt.proxy)[diag.NameProxy]

			if got.Status != tt.status || got.Reason != tt.reason {
				t.Errorf("узел %q: %+v, ожидали %s %s", tt.proxy, got, tt.status, tt.reason)
			}
		})
	}

	if !strings.Contains(query, "url=http%3A%2F%2F127.0.0.1%3A1%2Fgenerate_204") || !strings.Contains(query, "timeout="+strconv.Itoa(1600)) {
		t.Errorf("запрос замера %q", query)
	}
}

func TestDirectUnsupportedOutsideLinux(t *testing.T) {
	if runtime.GOOS == "linux" {
		t.Skip("метка сокета есть только в Linux")
	}

	c := run(t, diag.New(fakePlane{model: model(closedPort(t))}, configWith(5333, "127.0.0.1:1"), nil, options()), "")[diag.NameDirect]

	if c.Status != diag.StatusSkipped || c.Reason != diag.ReasonUnsupported {
		t.Errorf("прямой выход: %+v, ожидали пропуск unsupported", c)
	}
}
