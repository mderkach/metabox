// Package dataplane reads the dataplane model (LAN traffic interception to
// sing-box) from UCI `metabox` and checks whether its chains stand in nft.
//
// The rules are installed and removed by the sing-box service init script by the same model, so
// the section and option names are a contract with it. The daemon reads and writes the model, and
// the service reload brings the rules to it.
package dataplane

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/netip"
	"slices"
	"strconv"
	"strings"

	"metabox/internal/uci"
)

const (
	// config and section are where the init script looks for the model: `metabox.dataplane`.
	// The name `main` is taken by the section of type `metabox`, and uci does not hold one name for two sections of different
	// types.
	config      = "metabox"
	section     = "dataplane"
	sectionType = "dataplane"

	// fw4Family and fw4Table are the fw4 table the dataplane include puts its
	// chains into; chainPrefix is the common prefix of their names.
	fw4Family   = "inet"
	fw4Table    = "fw4"
	chainPrefix = "metabox_"
)

// Service is the name of the service whose init script reads the model and brings the
// dataplane to it. Another service running the same sing-box, including the sing-box
// package's own init script, does not read the section: the written model would install
// nothing, and its reload would restart routing the daemon does not own.
const Service = "metabox-singbox"

// AccessMode is which sources from the LAN interfaces go through sing-box.
type AccessMode string

const (
	// AccessAll means all sources; the source lists are stored but have no effect.
	AccessAll AccessMode = "all"
	// AccessListed means only those listed in source_ip and source_mac.
	AccessListed AccessMode = "listed"
)

// Model is the `metabox.dataplane` section. A missing option gets the default value
// from Defaults; a list set with empty values is empty.
type Model struct {
	// Enabled is whether to install interception. False: the service starts only sing-box,
	// without nft, ip rule and the dnsmasq upstream.
	Enabled bool `json:"enabled"`
	// RedirectPort is the redirect inbound port: LAN TCP goes here.
	RedirectPort int `json:"redirect_port"`
	// TproxyPort is the tproxy inbound port: LAN UDP goes here.
	TproxyPort int `json:"tproxy_port"`
	// DNSPort is the sing-box dns-in port that dnsmasq sends queries to.
	DNSPort int `json:"dns_port"`
	// DNSHijack is whether to intercept udp/53 from the LAN to the router dnsmasq.
	DNSHijack bool `json:"dns_hijack"`
	// SelfMark is the bypass mark: a packet with it goes around interception. Matches
	// route.default_mark of the sing-box config, otherwise its traffic would loop.
	SelfMark uint32 `json:"self_mark"`
	// TproxyMark is the mark of tproxy flows, ip rule sends them to RouteTable by it.
	TproxyMark uint32 `json:"tproxy_mark"`
	// RouteTable is the routing table with a local route for tproxy.
	RouteTable uint32     `json:"route_table"`
	AccessMode AccessMode `json:"acl_mode"`
	// SourceIP are the sources of listed mode: an IPv4 address or a subnet.
	SourceIP []string `json:"source_ip"`
	// SourceMAC are the sources of listed mode by MAC: they do not depend on a lease change.
	SourceMAC []string `json:"source_mac"`
	// LANInterface are the interfaces traffic is intercepted from.
	LANInterface []string `json:"lan_interface"`
	// WANProxyCIDR are the destinations that always go through sing-box.
	WANProxyCIDR []string `json:"wan_proxy_cidr"`
	// WANDirectCIDR are the destinations that always bypass sing-box.
	WANDirectCIDR []string `json:"wan_direct_cidr"`
	// IPv6 is whether to render the IPv6 chains; while false, there are none.
	IPv6 bool `json:"ipv6"`
}

// Defaults is the model with no options: the default ports, marks and table, listed
// mode without sources, that is, interception stands but nobody goes
// through sing-box.
func Defaults() Model {
	return Model{
		Enabled:       true,
		RedirectPort:  5331,
		TproxyPort:    5332,
		DNSPort:       5333,
		DNSHijack:     true,
		SelfMark:      100,
		TproxyMark:    101,
		RouteTable:    100,
		AccessMode:    AccessListed,
		SourceIP:      []string{},
		SourceMAC:     []string{},
		LANInterface:  []string{"br-lan"},
		WANProxyCIDR:  []string{},
		WANDirectCIDR: []string{},
	}
}

// AppliedReason is why the applied flag was not observed but substituted with false.
type AppliedReason string

const (
	// NFTUnavailable means nft did not start, returned a non-zero code or the path to it
	// is not set.
	NFTUnavailable AppliedReason = "nft_unavailable"
	// NFTUnparsed means the nft output was not parsed: truncated or not JSON.
	NFTUnparsed AppliedReason = "nft_unparsed"
)

// Runner runs an external command and returns its output with the exit code.
// Declared as a function for the same reason as procd.Runner: the result type of
// the launch owner must not be imported here.
type Runner func(ctx context.Context, name string, args ...string) (stdout string, exitCode int, err error)

// Options are the paths the daemon receives by flags. Both are absolute: under procd
// PATH is not the one in the shell.
type Options struct {
	UCI string
	// Batch runs uci with a script on stdin; nil means the model is only read.
	Batch BatchRunner
	// NFT: an empty path disables the check, and the applied flag is then always
	// false with the reason NFTUnavailable.
	NFT string
}

// Reader reads the model and the flag that it is applied. It caches nothing: the model
// is edited by the owner over SSH, and the rules are installed and removed by the service.
type Reader struct {
	run   Runner
	batch BatchRunner
	uci   string
	nft   string
}

// New assembles the reader.
func New(run Runner, opts Options) *Reader {
	return &Reader{run: run, batch: opts.Batch, uci: opts.UCI, nft: opts.NFT}
}

// Model reads the `metabox.dataplane` section. No `metabox` config or section
// of this type means the default model: the init script reads it the same way. Invalid
// values are an *InvalidError with all fields at once.
func (r *Reader) Model(ctx context.Context) (Model, error) {
	out, code, err := r.run(ctx, r.uci, "-q", "show", config)
	if err != nil {
		return Model{}, fmt.Errorf("uci show %s: %w", config, err)
	}

	if code != 0 {
		return Defaults(), nil
	}

	for _, s := range uci.Parse(out, config) {
		if s.Name == section && s.Type == sectionType {
			return decode(s)
		}
	}

	return Defaults(), nil
}

// ExpectedChains are the chains the service init script puts into the fw4 table
// when the model is enabled. The names are a contract with its rule renderer.
func ExpectedChains() []string {
	return []string{
		"metabox_redirect_lanac",
		"metabox_redirect",
		"metabox_output_redir",
		"metabox_mangle_lanac",
		"metabox_mangle_prerouting",
		"metabox_mangle_output",
	}
}

// Applied reports whether the dataplane chains stand in the fw4 table. An nft failure is not
// counted as a failure: the panel must show the model without it. An error is only
// context cancellation.
func (r *Reader) Applied(ctx context.Context) (bool, AppliedReason, error) {
	chains, reason, err := r.Chains(ctx)

	return len(chains) > 0, reason, err
}

// Chains returns the names of the dataplane chains that stand in the fw4 table. The reason
// is non-empty when nft was not read, and the list is then empty and says nothing.
// An error is only context cancellation.
//
// `list chains` is read, not `list ruleset`: the rules are not needed, and the ruleset
// output with fw4 is larger than the command output ceiling and would come truncated.
func (r *Reader) Chains(ctx context.Context) ([]string, AppliedReason, error) {
	if r.nft == "" {
		return nil, NFTUnavailable, nil
	}

	out, code, err := r.run(ctx, r.nft, "-j", "list", "chains")
	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, "", ctxErr
	}

	if err != nil || code != 0 {
		return nil, NFTUnavailable, nil
	}

	var ruleset struct {
		Nftables []struct {
			Chain *struct {
				Family string `json:"family"`
				Table  string `json:"table"`
				Name   string `json:"name"`
			} `json:"chain"`
		} `json:"nftables"`
	}

	if err := json.Unmarshal([]byte(out), &ruleset); err != nil {
		return nil, NFTUnparsed, nil
	}

	var chains []string

	for _, item := range ruleset.Nftables {
		c := item.Chain
		if c != nil && c.Family == fw4Family && c.Table == fw4Table && strings.HasPrefix(c.Name, chainPrefix) {
			chains = append(chains, c.Name)
		}
	}

	return chains, "", nil
}

func decode(s uci.Section) (Model, error) {
	m := Defaults()
	d := decoder{section: s}

	d.flag("enabled", &m.Enabled)
	d.port("redirect_port", &m.RedirectPort)
	d.port("tproxy_port", &m.TproxyPort)
	d.port("dns_port", &m.DNSPort)
	d.flag("dns_hijack", &m.DNSHijack)
	d.number("self_mark", &m.SelfMark)
	d.number("tproxy_mark", &m.TproxyMark)
	d.number("route_table", &m.RouteTable)
	d.aclMode(&m.AccessMode)
	d.list("source_ip", &m.SourceIP, validIPv4)
	d.list("source_mac", &m.SourceMAC, validMAC)
	m.SourceMAC = canonicalMACs(m.SourceMAC)
	d.list("lan_interface", &m.LANInterface, validIface)
	d.list("wan_proxy_cidr", &m.WANProxyCIDR, validIPv4)
	d.list("wan_direct_cidr", &m.WANDirectCIDR, validIPv4)
	d.flag("ipv6", &m.IPv6)

	d.distinctPorts(m)

	if m.Enabled && len(m.LANInterface) == 0 {
		d.fail("lan_interface", "", ReasonRequired)
	}

	if len(d.errs) > 0 {
		return Model{}, &InvalidError{Fields: d.errs}
	}

	return m, nil
}

type decoder struct {
	section uci.Section
	errs    []FieldError
}

func (d *decoder) fail(field, value string, reason FieldReason) {
	d.errs = append(d.errs, FieldError{Field: field, Value: value, Reason: reason})
}

func (d *decoder) option(name string) (string, bool) {
	values, ok := d.section.Options[name]
	if !ok || len(values) == 0 {
		return "", false
	}

	return values[0], true
}

// flag accepts the same values as config_get_bool of the OpenWrt init scripts.
func (d *decoder) flag(name string, dst *bool) {
	raw, ok := d.option(name)
	if !ok {
		return
	}

	switch raw {
	case "1", "on", "true", "yes", "enabled":
		*dst = true
	case "0", "off", "false", "no", "disabled":
		*dst = false
	default:
		d.fail(name, raw, ReasonInvalid)
	}
}

func (d *decoder) port(name string, dst *int) {
	raw, ok := d.option(name)
	if !ok {
		return
	}

	n, err := strconv.Atoi(raw)
	switch {
	case err != nil:
		d.fail(name, raw, ReasonInvalid)
	case n < 1 || n > 65535:
		d.fail(name, raw, ReasonOutOfRange)
	default:
		*dst = n
	}
}

// number is a mark or a table number: a decimal number in 32 bits, as nft and ip rule
// accept them.
func (d *decoder) number(name string, dst *uint32) {
	raw, ok := d.option(name)
	if !ok {
		return
	}

	n, err := strconv.ParseUint(raw, 10, 32)
	if err != nil {
		d.fail(name, raw, ReasonInvalid)

		return
	}

	*dst = uint32(n)
}

func (d *decoder) aclMode(dst *AccessMode) {
	raw, ok := d.option("acl_mode")
	if !ok {
		return
	}

	switch mode := AccessMode(raw); mode {
	case AccessAll, AccessListed:
		*dst = mode
	default:
		d.fail("acl_mode", raw, ReasonInvalid)
	}
}

// list skips empty values: `list x ”` in UCI means an empty list.
func (d *decoder) list(name string, dst *[]string, valid func(string) bool) {
	values, ok := d.section.Options[name]
	if !ok {
		return
	}

	out := []string{}

	for _, v := range values {
		if v == "" {
			continue
		}

		if valid != nil && !valid(v) {
			d.fail(name, v, ReasonInvalid)

			continue
		}

		out = append(out, v)
	}

	*dst = out
}

func (d *decoder) distinctPorts(m Model) {
	seen := []int{}

	for _, p := range []struct {
		name string
		port int
	}{
		{"redirect_port", m.RedirectPort},
		{"tproxy_port", m.TproxyPort},
		{"dns_port", m.DNSPort},
	} {
		if slices.Contains(seen, p.port) {
			d.fail(p.name, strconv.Itoa(p.port), ReasonDuplicate)
		}

		seen = append(seen, p.port)
	}
}

// validIPv4 accepts an IPv4 address or a subnet without host bits: a subnet like
// 192.168.1.5/24 does not fit into an nft set.
func validIPv4(s string) bool {
	if addr, err := netip.ParseAddr(s); err == nil {
		return addr.Is4()
	}

	prefix, err := netip.ParsePrefix(s)

	return err == nil && prefix.Addr().Is4() && prefix == prefix.Masked()
}

// validIface accepts the same characters as the service init script: the name goes into
// an nft rule and into a uci batch command, and it rejects everything else as a whole.
func validIface(s string) bool {
	return strings.Trim(s, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._@-") == ""
}

// validMAC accepts only an Ethernet MAC: net.ParseMAC lets through both 8- and
// 20-byte addresses, while `ether saddr` compares six bytes.
func validMAC(s string) bool {
	hw, err := net.ParseMAC(s)

	return err == nil && len(hw) == 6
}

// canonicalMACs brings the addresses that passed validMAC to the form aa:bb:cc:dd:ee:ff:
// the service init script accepts a MAC only with colons, and on a dash or dot
// notation it rejects the model and leaves the previous rules.
func canonicalMACs(macs []string) []string {
	out := make([]string, 0, len(macs))

	for _, s := range macs {
		hw, _ := net.ParseMAC(s)
		out = append(out, hw.String())
	}

	return out
}
