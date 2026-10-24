// Package diag checks the sing-box dataplane by the model from UCI: whether
// anyone listens on the inbound ports, whether dns-in answers, whether the nft chains stand and whether the
// router reaches the internet through the chosen node and directly.
//
// The checks only read: diagnostics touch no rules, config or service.
package diag

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/dataplane"
	"metabox/internal/locale"
)

// detailLimit is the ceiling of a detail: the Clash API answer goes into it.
const detailLimit = 300

// CheckName is what was checked. The set is closed: the panel labels the report
// row by it.
type CheckName string

const (
	// NameRedirectPort is a TCP listener on redirect_port: nft sends TCP
	// from the LAN here.
	NameRedirectPort CheckName = "redirect_port"
	// NameTproxyPort is a UDP listener on tproxy_port.
	NameTproxyPort CheckName = "tproxy_port"
	// NameDNSPort is a UDP listener on dns_port: dnsmasq sends queries here.
	NameDNSPort CheckName = "dns_port"
	// NameDNSProbe means dns-in of the applied config resolves a name.
	NameDNSProbe CheckName = "dns_probe"
	// NameChains means the dataplane chains stand in the fw4 table.
	NameChains CheckName = "nft_chains"
	// NameProxy is the node delay through the Clash API.
	NameProxy CheckName = "proxy"
	// NameDirect is internet access bypassing interception, with the self_mark mark.
	NameDirect CheckName = "direct"
)

// CheckStatus is the result of a check.
type CheckStatus string

// Check results: skipped means there is nothing or nothing to check with, it is not a failure.
const (
	StatusOK      CheckStatus = "ok"
	StatusFail    CheckStatus = "fail"
	StatusSkipped CheckStatus = "skipped"
)

// CheckReason is why a check failed or was skipped. The set is closed: the panel
// picks the text in the user's language by it.
type CheckReason string

const (
	// ReasonModelUnavailable means the dataplane model was not read or not accepted.
	ReasonModelUnavailable CheckReason = "model_unavailable"
	// ReasonInterceptionDisabled means interception is off in the model: ports, dns-in
	// and chains are not needed.
	ReasonInterceptionDisabled CheckReason = "interception_disabled"
	// ReasonNotListening means nobody listens on the port: sing-box is not up or the
	// config has no such inbound.
	ReasonNotListening CheckReason = "not_listening"
	// ReasonProcUnavailable means the /proc/net socket table was not read.
	ReasonProcUnavailable CheckReason = "proc_unavailable"
	// ReasonConfigMissing means there is no applied config.
	ReasonConfigMissing CheckReason = "config_missing"
	// ReasonNoDNSInbound means the config has no direct inbound on dns_port.
	ReasonNoDNSInbound CheckReason = "no_dns_inbound"
	// ReasonDNSNameUnset means the probe name is not set by a flag.
	ReasonDNSNameUnset CheckReason = "dns_name_unset"
	// ReasonNoAnswer means dns-in did not answer with an address.
	ReasonNoAnswer CheckReason = "no_answer"
	// ReasonNFTUnavailable means nft did not start or the path to it is not set.
	ReasonNFTUnavailable CheckReason = "nft_unavailable"
	// ReasonNFTUnparsed means the nft output was not parsed.
	ReasonNFTUnparsed CheckReason = "nft_unparsed"
	// ReasonChainsMissing means some chains are absent; their names are in Missing.
	ReasonChainsMissing CheckReason = "chains_missing"
	// ReasonProxyUnset means the node is not selected.
	ReasonProxyUnset CheckReason = "proxy_unset"
	// ReasonProxyMissing means the Clash API does not know such a node.
	ReasonProxyMissing CheckReason = "proxy_missing"
	// ReasonRuntimeUnavailable means the Clash API does not answer.
	ReasonRuntimeUnavailable CheckReason = "runtime_unavailable"
	// ReasonRequestFailed means the request to the check address failed.
	ReasonRequestFailed CheckReason = "request_failed"
	// ReasonUnsupported means the check is impossible on this platform: the socket
	// mark exists only on Linux.
	ReasonUnsupported CheckReason = "unsupported"
)

// Check is one check.
type Check struct {
	Name   CheckName   `json:"name"`
	Status CheckStatus `json:"status"`
	// Reason is empty when ok.
	Reason CheckReason `json:"reason,omitempty"`
	// Detail is a detail in the daemon's language: port, original error, Clash API
	// answer. The panel shows it under its own text, not instead of it.
	Detail string `json:"detail,omitempty"`
	// Missing are the absent chains with chains_missing.
	Missing []string `json:"missing,omitempty"`
	// DelayMS is the delay with ok for proxy and direct.
	DelayMS int `json:"delay_ms,omitempty"`
}

// Report is a report with the checks in a fixed order.
type Report struct {
	Checks []Check `json:"checks"`
}

// Plane reads the dataplane model and the nft chains.
type Plane interface {
	Model(ctx context.Context) (dataplane.Model, error)
	Chains(ctx context.Context) ([]string, dataplane.AppliedReason, error)
}

// DNSProber sends a query to dns-in.
type DNSProber interface {
	Probe(ctx context.Context, in clashapi.DNSInbound) error
}

// ConfigReader returns the applied config; a missing file is
// config.ErrNoConfig.
type ConfigReader interface {
	Read(ctx context.Context) ([]byte, error)
}

// Options is what the daemon receives by flags.
type Options struct {
	// ProcNet is the socket table directory, `/proc/net` on the device.
	ProcNet string
	// URL is the address of the internet access check; an answer below 400 is a success.
	URL string
	// Timeout is the ceiling of one network check.
	Timeout time.Duration
	// Lang is the language of Check.Detail built from the daemon's own errors; the zero
	// value is English.
	Lang locale.Lang
}

// Checker runs the checks. It caches nothing: the model, config and rules
// change bypassing the daemon.
type Checker struct {
	plane  Plane
	config ConfigReader
	dns    DNSProber
	opts   Options
	client *http.Client
}

// New assembles the checks. dns nil means the probe name is not set, the probe is skipped.
func New(plane Plane, cfg ConfigReader, dns DNSProber, opts Options) *Checker {
	// Diagnostics are rare: keeping a connection to the controller between runs
	// is pointless.
	client := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}}

	return &Checker{plane: plane, config: cfg, dns: dns, opts: opts, client: client}
}

// Run runs all the checks; proxy is the node the access is checked through.
// Network checks run in parallel: sequentially the report would wait the sum of their
// timeouts. A check failure is a report row, not an error; an error is only
// ctx cancellation.
func (c *Checker) Run(ctx context.Context, proxy string) (Report, error) {
	model, modelErr := c.plane.Model(ctx)
	cfg, cfgErr := c.config.Read(ctx)

	if err := ctx.Err(); err != nil {
		return Report{}, err
	}

	checks := []func(context.Context) Check{
		func(ctx context.Context) Check {
			return c.port(ctx, NameRedirectPort, model, modelErr, "tcp", model.RedirectPort)
		},
		func(ctx context.Context) Check {
			return c.port(ctx, NameTproxyPort, model, modelErr, "udp", model.TproxyPort)
		},
		func(ctx context.Context) Check {
			return c.port(ctx, NameDNSPort, model, modelErr, "udp", model.DNSPort)
		},
		func(ctx context.Context) Check { return c.dnsProbe(ctx, model, modelErr, cfg, cfgErr) },
		func(ctx context.Context) Check { return c.chains(ctx, model, modelErr) },
		func(ctx context.Context) Check { return c.proxy(ctx, proxy, cfg, cfgErr) },
		func(ctx context.Context) Check { return c.direct(ctx, model, modelErr) },
	}

	out := make([]Check, len(checks))

	var wg sync.WaitGroup

	for i, check := range checks {
		wg.Go(func() {
			checkCtx, cancel := context.WithTimeout(ctx, c.opts.Timeout)
			defer cancel()

			out[i] = check(checkCtx)
		})
	}

	wg.Wait()

	if err := ctx.Err(); err != nil {
		return Report{}, err
	}

	return Report{Checks: out}, nil
}

// interception returns a skip when the dataplane checks have nothing to apply to.
func interception(lang locale.Lang, name CheckName, modelErr error, model dataplane.Model) (Check, bool) {
	switch {
	case modelErr != nil:
		return Check{Name: name, Status: StatusSkipped, Reason: ReasonModelUnavailable, Detail: locale.Message(lang, modelErr)}, true
	case !model.Enabled:
		return Check{Name: name, Status: StatusSkipped, Reason: ReasonInterceptionDisabled}, true
	default:
		return Check{}, false
	}
}

// port checks a listener. TCP by connecting to loopback: nft sends the intercepted
// traffic there too, and a wildcard listener answers on it. UDP by
// the /proc/net tables: connecting over UDP proves nothing. A connection
// to the redirect inbound leaves a failure line in the sing-box log: such a connection
// has no original destination address.
func (c *Checker) port(ctx context.Context, name CheckName, model dataplane.Model, modelErr error, network string, port int) Check {
	if skip, ok := interception(c.opts.Lang, name, modelErr, model); ok {
		return skip
	}

	detail := strconv.Itoa(port) + "/" + network

	if network == "tcp" {
		var d net.Dialer

		conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
		if err != nil {
			return Check{Name: name, Status: StatusFail, Reason: ReasonNotListening, Detail: detail}
		}

		_ = conn.Close()

		return Check{Name: name, Status: StatusOK, Detail: detail}
	}

	listening, err := c.udpListening(port)
	if err != nil {
		return Check{Name: name, Status: StatusSkipped, Reason: ReasonProcUnavailable, Detail: detail}
	}

	if !listening {
		return Check{Name: name, Status: StatusFail, Reason: ReasonNotListening, Detail: detail}
	}

	return Check{Name: name, Status: StatusOK, Detail: detail}
}

// udpListening looks for an unbound UDP socket on the port in udp and udp6. An error is
// when no table was read.
func (c *Checker) udpListening(port int) (bool, error) {
	var read bool

	for _, table := range []string{"udp", "udp6"} {
		data, err := os.ReadFile(filepath.Join(c.opts.ProcNet, table))
		if err != nil {
			continue
		}

		read = true

		if udpBound(string(data), port) {
			return true, nil
		}
	}

	if !read {
		return false, errors.New("UDP socket tables not read")
	}

	return false, nil
}

// udpBound parses the /proc/net/udp table: the local address is `address:port` in
// hexadecimal form, state 07 is a socket without a peer, that is, a listener.
func udpBound(table string, port int) bool {
	want := fmt.Sprintf(":%04X", port)

	for line := range strings.SplitSeq(table, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		if strings.HasSuffix(fields[1], want) && fields[3] == "07" {
			return true
		}
	}

	return false
}

func (c *Checker) dnsProbe(ctx context.Context, model dataplane.Model, modelErr error, cfg []byte, cfgErr error) Check {
	if skip, ok := interception(c.opts.Lang, NameDNSProbe, modelErr, model); ok {
		return skip
	}

	if c.dns == nil {
		return Check{Name: NameDNSProbe, Status: StatusSkipped, Reason: ReasonDNSNameUnset}
	}

	if skip, ok := configSkip(c.opts.Lang, NameDNSProbe, cfgErr); ok {
		return skip
	}

	in, found, err := clashapi.ReadDNSInbound(cfg, model.DNSPort)
	if err != nil || !found {
		return Check{Name: NameDNSProbe, Status: StatusFail, Reason: ReasonNoDNSInbound, Detail: strconv.Itoa(model.DNSPort)}
	}

	if err := c.dns.Probe(ctx, in); err != nil {
		return Check{Name: NameDNSProbe, Status: StatusFail, Reason: ReasonNoAnswer, Detail: clamp(locale.Message(c.opts.Lang, err))}
	}

	return Check{Name: NameDNSProbe, Status: StatusOK, Detail: in.Address}
}

func (c *Checker) chains(ctx context.Context, model dataplane.Model, modelErr error) Check {
	if skip, ok := interception(c.opts.Lang, NameChains, modelErr, model); ok {
		return skip
	}

	present, reason, err := c.plane.Chains(ctx)

	switch {
	case err != nil:
		return Check{Name: NameChains, Status: StatusSkipped, Reason: ReasonNFTUnavailable, Detail: locale.Message(c.opts.Lang, err)}
	case reason == dataplane.NFTUnparsed:
		return Check{Name: NameChains, Status: StatusSkipped, Reason: ReasonNFTUnparsed}
	case reason != "":
		return Check{Name: NameChains, Status: StatusSkipped, Reason: ReasonNFTUnavailable}
	}

	var missing []string

	for _, chain := range dataplane.ExpectedChains() {
		if !slices.Contains(present, chain) {
			missing = append(missing, chain)
		}
	}

	if len(missing) > 0 {
		return Check{
			Name:    NameChains,
			Status:  StatusFail,
			Reason:  ReasonChainsMissing,
			Detail:  strings.Join(missing, ", "),
			Missing: missing,
		}
	}

	return Check{Name: NameChains, Status: StatusOK}
}

func configSkip(lang locale.Lang, name CheckName, cfgErr error) (Check, bool) {
	switch {
	case errors.Is(cfgErr, config.ErrNoConfig):
		return Check{Name: name, Status: StatusSkipped, Reason: ReasonConfigMissing}, true
	case cfgErr != nil:
		return Check{Name: name, Status: StatusSkipped, Reason: ReasonConfigMissing, Detail: locale.Message(lang, cfgErr)}, true
	default:
		return Check{}, false
	}
}

// proxy measures the node delay with the Clash API handle `/proxies/{name}/delay`:
// the request to the check address is made by sing-box itself through this node.
func (c *Checker) proxy(ctx context.Context, proxy string, cfg []byte, cfgErr error) Check {
	if proxy == "" {
		return Check{Name: NameProxy, Status: StatusSkipped, Reason: ReasonProxyUnset}
	}

	if skip, ok := configSkip(c.opts.Lang, NameProxy, cfgErr); ok {
		return skip
	}

	settings, err := clashapi.Read(cfg)
	if err != nil {
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonRuntimeUnavailable}
	}

	base, err := settings.BaseURL()
	if err != nil {
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonRuntimeUnavailable}
	}

	query := url.Values{
		"url": {c.opts.URL},
		// The measurement must end before the check ceiling, otherwise cancellation will come
		// instead of the Clash API answer.
		"timeout": {strconv.Itoa(int(c.opts.Timeout * 4 / 5 / time.Millisecond))},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		base+"/proxies/"+url.PathEscape(proxy)+"/delay?"+query.Encode(), nil)
	if err != nil {
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonRequestFailed}
	}

	if settings.Secret != "" {
		req.Header.Set("Authorization", "Bearer "+settings.Secret)
	}

	res, err := c.client.Do(req)
	if err != nil {
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonRuntimeUnavailable}
	}
	defer func() { _ = res.Body.Close() }()

	var body struct {
		Delay   int    `json:"delay"`
		Message string `json:"message"`
	}

	_ = json.NewDecoder(io.LimitReader(res.Body, 4<<10)).Decode(&body)

	switch res.StatusCode {
	case http.StatusOK:
		return Check{Name: NameProxy, Status: StatusOK, DelayMS: body.Delay, Detail: proxy}
	case http.StatusNotFound:
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonProxyMissing, Detail: proxy}
	default:
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonRequestFailed, Detail: clamp(body.Message)}
	}
}

// direct goes to the check address with a socket marked self_mark: nft lets such a packet
// bypass interception. The address name is resolved by the system resolver, that is
// dnsmasq; with interception enabled this is the same dns-in, and the check speaks
// of the direct TCP path, not DNS.
func (c *Checker) direct(ctx context.Context, model dataplane.Model, modelErr error) Check {
	if modelErr != nil {
		return Check{Name: NameDirect, Status: StatusSkipped, Reason: ReasonModelUnavailable, Detail: locale.Message(c.opts.Lang, modelErr)}
	}

	control, ok := markControl(model.SelfMark)
	if !ok {
		return Check{Name: NameDirect, Status: StatusSkipped, Reason: ReasonUnsupported}
	}

	dialer := &net.Dialer{Control: control}
	client := &http.Client{
		Transport: &http.Transport{DialContext: dialer.DialContext, DisableKeepAlives: true},
		// A redirect of the check address is already an answer: the network is there.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.opts.URL, nil)
	if err != nil {
		return Check{Name: NameDirect, Status: StatusFail, Reason: ReasonRequestFailed}
	}

	started := time.Now()

	res, err := client.Do(req)
	if err != nil {
		return Check{Name: NameDirect, Status: StatusFail, Reason: ReasonRequestFailed, Detail: clamp(locale.Message(c.opts.Lang, err))}
	}

	_ = res.Body.Close()

	if res.StatusCode >= http.StatusBadRequest {
		return Check{Name: NameDirect, Status: StatusFail, Reason: ReasonRequestFailed, Detail: res.Status}
	}

	return Check{Name: NameDirect, Status: StatusOK, DelayMS: int(time.Since(started) / time.Millisecond)}
}

func clamp(s string) string {
	if len(s) <= detailLimit {
		return s
	}

	return s[:detailLimit] + "…"
}
