package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"net"
	"slices"
	"strings"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/diag"
	"metabox/internal/events"
	"metabox/internal/logs"
	"metabox/internal/route"
)

const (
	defaultConnections = 50
	maxConnections     = 500

	defaultRoutes = 5
	maxRoutes     = 20

	defaultLogLines = 200
)

type tools struct {
	opts        Options
	permissions []contract.MCPPermission
}

func (t tools) addRead(server *sdk.Server, log *slog.Logger) {
	addTool(server, log, &sdk.Tool{
		Name: "metabox_status",
		Description: "State of the router running metabox: whether the sing-box service runs and who owns the process " +
			"(managed=false with status running means a foreign package started it), the daemon, sing-box binary and " +
			"panel schema versions, the dataplane routing mode, the runtime sources the daemon reads, and the " +
			"permissions of this MCP token. An empty version means it could not be read or was not built in. " +
			"Does not tell whether traffic actually flows: use metabox_diagnostics for that.",
	}, t.status)

	if t.opts.Runtime != nil {
		addTool(server, log, &sdk.Tool{
			Name: "metabox_connections",
			Description: "Live sing-box connections, newest data from the Clash API, filtered by host, device, rule, " +
				"chain and network. Filters are case-insensitive substrings, except network (exact tcp or udp) and " +
				"device (a source IP, a MAC or a device name from DHCP). total counts all matches, connections holds " +
				"at most limit of them (default 50, at most 500). An empty list means no live connection matches " +
				"right now; it says nothing about connections that already closed.",
		}, t.connections)

		addTool(server, log, &sdk.Tool{
			Name: "metabox_proxies",
			Description: "Proxy groups with their selected member, and nodes with the last latency sing-box recorded. " +
				"Does not run a latency check: a failed check erases the node's delay history. last_delay_ms is " +
				"absent when the node was never checked; 0 means the last check failed.",
		}, t.proxies)
	}

	if t.opts.Runtime != nil && t.opts.Explain != nil {
		addTool(server, log, &sdk.Tool{
			Name: "metabox_explain_domain",
			Description: "Explains how sing-box routed a domain: for live connections whose host is the domain or its " +
				"subdomain, the matched rule (its index in route.rules, conditions and action) and the outbound chain, " +
				"as sing-box reported them. found=false means there is no live connection to the domain: the tool " +
				"does not evaluate rules on its own, so open the site first and ask again. At most limit connections " +
				"are explained (default 5, at most 20).",
		}, t.explainDomain)
	}

	if t.opts.Config != nil {
		addTool(server, log, &sdk.Tool{
			Name: "metabox_config_versions",
			Description: "History of applied sing-box configs, newest first: id, size, sha256 and save time. The save " +
				"time is the router clock and is wrong before NTP sync. An empty list means nothing was applied " +
				"through metabox yet.",
		}, t.versions)

		addTool(server, log, &sdk.Tool{
			Name: "metabox_config_version",
			Description: "Content of one config version from metabox_config_versions. Secrets are masked " +
				"(secret, password, private_key, pre_shared_key, psk, token, auth_str, access_key_secret; for url and " +
				"download_url everything after the host) and cannot be revealed through MCP. Comments are removed, " +
				"since they may hold secrets the mask cannot recognise.",
		}, t.version)
	}

	if t.opts.Logs != nil {
		addTool(server, log, &sdk.Tool{
			Name: "metabox_log_tail",
			Description: "Last lines of the sing-box log, oldest first, the same text the panel log screen shows. " +
				"level is the minimum level: trace, debug, info, notice, warn, error, fatal or panic (default: all). " +
				"lines is 1 to 1000, default 200. Lines without a level (stack traces, continuations) pass the filter. " +
				"The log is not masked: it may contain addresses and whatever sing-box itself prints. An empty list " +
				"means no line at this level since the last clear in the panel.",
		}, t.logTail)
	}

	if t.opts.Diag != nil {
		addTool(server, log, &sdk.Tool{
			Name: "metabox_diagnostics",
			Description: "Dataplane checks of the router, nothing is changed: sing-box listeners on the redirect, tproxy " +
				"and DNS ports, a DNS query to sing-box dns-in, the nft interception chains, and a direct internet " +
				"request bypassing interception. Each check is ok, fail or skipped with a reason; skipped is not a " +
				"failure. The node latency check is always skipped here: run it from the panel.",
		}, t.diagnostics)
	}
}

type statusOut struct {
	DaemonVersion  string   `json:"daemon_version"`
	SingboxVersion string   `json:"singbox_version,omitempty"`
	SingboxTags    []string `json:"singbox_tags,omitempty"`
	SchemaVersion  string   `json:"schema_version,omitempty"`
	// Service is absent when the daemon does not manage a sing-box service.
	Service *contract.Service `json:"service,omitempty"`
	Routing routing           `json:"routing"`
	Runtime contract.Runtime  `json:"runtime"`
	// Permissions are what this MCP token allows.
	Permissions []contract.MCPPermission `json:"permissions"`
}

type routing struct {
	// Read is false when the dataplane model could not be read; the other fields are
	// then zero.
	Read bool `json:"read"`
	// Enabled is whether LAN traffic is intercepted into sing-box.
	Enabled bool `json:"enabled"`
	// Mode is "all" (every LAN source) or "listed" (only listed sources).
	Mode string `json:"mode,omitempty"`
}

func (t tools) status(ctx context.Context, _ struct{}) (statusOut, error) {
	out := statusOut{
		DaemonVersion:  t.opts.Version,
		SingboxVersion: t.opts.SingboxVersion,
		SingboxTags:    t.opts.SingboxTags,
		SchemaVersion:  t.opts.SchemaVersion,
		Runtime:        contract.Runtime{Sources: []contract.RuntimeSource{}},
		Permissions:    t.permissions,
	}

	if t.opts.Service != nil {
		raw, err := t.opts.Service(ctx)
		if err != nil {
			return statusOut{}, err
		}

		var service contract.Service
		if err := json.Unmarshal(raw, &service); err != nil {
			return statusOut{}, fmt.Errorf("разбор состояния сервиса: %w", err)
		}

		out.Service = &service
	}

	if t.opts.Dataplane != nil {
		if snap, err := t.opts.Dataplane.Snapshot(ctx); err == nil {
			if model, err := snap.Model(); err == nil {
				out.Routing = routing{Read: true, Enabled: model.Enabled, Mode: string(model.AccessMode)}
			}
		}
	}

	if t.opts.Runtime != nil {
		out.Runtime = contract.Runtime{
			Sources:     []contract.RuntimeSource{contract.SourceClashAPI},
			Connections: contract.SourceClashAPI,
		}
	}

	return out, nil
}

type connectionsIn struct {
	Host    string `json:"host,omitempty" jsonschema:"substring of the destination host or address"`
	Device  string `json:"device,omitempty" jsonschema:"source IP, MAC or device name"`
	Rule    string `json:"rule,omitempty" jsonschema:"substring of the matched rule conditions or its action; final matches connections that hit route.final"`
	Chain   string `json:"chain,omitempty" jsonschema:"substring of any outbound in the chain"`
	Network string `json:"network,omitempty" jsonschema:"tcp or udp"`
	Limit   int    `json:"limit,omitempty" jsonschema:"maximum rows, default 50, at most 500"`
}

type connectionsOut struct {
	// Total is the number of matching connections before the limit.
	Total       int                 `json:"total"`
	Connections []events.Connection `json:"connections"`
}

func (t tools) connections(ctx context.Context, in connectionsIn) (connectionsOut, error) {
	snapshot, err := t.liveConnections(ctx)
	if err != nil {
		return connectionsOut{}, err
	}

	sources, err := t.deviceSources(ctx, in.Device)
	if err != nil {
		return connectionsOut{}, err
	}

	limit := clamp(in.Limit, defaultConnections, maxConnections)
	out := connectionsOut{Connections: []events.Connection{}}

	for _, c := range snapshot.Connections {
		if !matchConnection(c, in, sources) {
			continue
		}

		out.Total++

		if len(out.Connections) < limit {
			out.Connections = append(out.Connections, c)
		}
	}

	return out, nil
}

func (t tools) liveConnections(ctx context.Context) (events.ConnectionsSnapshot, error) {
	raw, err := t.opts.Runtime.Snapshot(ctx, "/connections")
	if err != nil {
		return events.ConnectionsSnapshot{}, fmt.Errorf("%w: соединения: %w", route.ErrRuntimeUnavailable, err)
	}

	return events.ParseConnections(raw)
}

// deviceSources resolves the device filter to source addresses: the filter itself when
// it is an address, plus the addresses of devices whose MAC or name matches. nil means
// no device filter.
func (t tools) deviceSources(ctx context.Context, device string) ([]string, error) {
	if device == "" {
		return nil, nil
	}

	sources := []string{device}

	if t.opts.Devices == nil {
		return sources, nil
	}

	list, err := t.opts.Devices.List(ctx)
	if err != nil {
		return nil, err
	}

	for _, d := range list {
		if d.IP != "" && (strings.EqualFold(d.MAC, device) || strings.EqualFold(d.Name, device)) {
			sources = append(sources, d.IP)
		}
	}

	return sources, nil
}

func matchConnection(c events.Connection, in connectionsIn, sources []string) bool {
	switch {
	case in.Host != "" && !containsFold(c.Host, in.Host):
		return false
	case sources != nil && !slices.Contains(sources, c.Source):
		return false
	case in.Rule != "" && !matchRule(c, in.Rule):
		return false
	case in.Chain != "" && !slices.ContainsFunc(c.Chain, func(node string) bool { return containsFold(node, in.Chain) }):
		return false
	case in.Network != "" && !strings.EqualFold(c.Network, in.Network):
		return false
	default:
		return true
	}
}

func matchRule(c events.Connection, rule string) bool {
	if c.Final {
		return strings.EqualFold(rule, "final")
	}

	return containsFold(c.Rule, rule) || containsFold(c.Action, rule)
}

type explainIn struct {
	Domain string `json:"domain" jsonschema:"domain name, for example example.com; subdomains match too"`
	Limit  int    `json:"limit,omitempty" jsonschema:"maximum connections to explain, default 5, at most 20"`
}

type explainOut struct {
	Domain string `json:"domain"`
	// Found is false when no live connection goes to the domain.
	Found bool `json:"found"`
	// Total is the number of live connections to the domain before the limit.
	Total  int           `json:"total"`
	Routes []domainRoute `json:"routes"`
}

type domainRoute struct {
	ConnectionID string      `json:"connection_id"`
	Host         string      `json:"host"`
	Source       string      `json:"source"`
	Network      string      `json:"network"`
	Match        route.Match `json:"match"`
	Chain        route.Chain `json:"chain"`
}

func (t tools) explainDomain(ctx context.Context, in explainIn) (explainOut, error) {
	domain := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(in.Domain)), ".")
	if domain == "" {
		return explainOut{}, fmt.Errorf("%w: domain пуст", errBadInput)
	}

	snapshot, err := t.liveConnections(ctx)
	if err != nil {
		return explainOut{}, err
	}

	limit := clamp(in.Limit, defaultRoutes, maxRoutes)
	out := explainOut{Domain: domain, Routes: []domainRoute{}}

	for _, c := range snapshot.Connections {
		if !hostMatches(c.Host, domain) {
			continue
		}

		out.Total++

		if len(out.Routes) >= limit {
			continue
		}

		explanation, err := t.opts.Explain.Explain(ctx, c.ID)
		if errors.Is(err, route.ErrNoConnection) {
			continue
		}
		if err != nil {
			return explainOut{}, err
		}

		out.Routes = append(out.Routes, domainRoute{
			ConnectionID: c.ID,
			Host:         c.Host,
			Source:       c.Source,
			Network:      c.Network,
			Match:        explanation.Match,
			Chain:        explanation.Chain,
		})
	}

	out.Found = len(out.Routes) > 0

	return out, nil
}

// hostMatches compares the connection host without its port with the domain or its
// subdomain.
func hostMatches(hostport, domain string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}

	host = strings.ToLower(host)

	return host == domain || strings.HasSuffix(host, "."+domain)
}

type proxiesOut struct {
	Groups []proxyGroup `json:"groups"`
	Nodes  []proxyNode  `json:"nodes"`
}

type proxyGroup struct {
	Name string `json:"name"`
	Type string `json:"type"`
	// Now is the selected member; empty when the group type has no selection.
	Now     string   `json:"now,omitempty"`
	Members []string `json:"members"`
}

type proxyNode struct {
	Name string `json:"name"`
	Type string `json:"type"`
	// LastDelayMS is the last recorded latency; absent when never checked, 0 when the
	// last check failed.
	LastDelayMS *int `json:"last_delay_ms,omitempty"`
	// LastChecked is the time of that check as sing-box reported it.
	LastChecked string `json:"last_checked,omitempty"`
}

type clashProxy struct {
	Type    string    `json:"type"`
	Now     string    `json:"now"`
	All     *[]string `json:"all"`
	History []struct {
		Time  string `json:"time"`
		Delay int    `json:"delay"`
	} `json:"history"`
}

func (t tools) proxies(ctx context.Context, _ struct{}) (proxiesOut, error) {
	raw, err := t.opts.Runtime.Snapshot(ctx, "/proxies")
	if err != nil {
		return proxiesOut{}, fmt.Errorf("%w: узлы: %w", route.ErrRuntimeUnavailable, err)
	}

	var body struct {
		Proxies map[string]clashProxy `json:"proxies"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return proxiesOut{}, fmt.Errorf("разбор списка узлов: %w", err)
	}

	out := proxiesOut{Groups: []proxyGroup{}, Nodes: []proxyNode{}}

	for _, name := range slices.Sorted(maps.Keys(body.Proxies)) {
		p := body.Proxies[name]

		if p.All != nil {
			members := *p.All
			if members == nil {
				members = []string{}
			}

			out.Groups = append(out.Groups, proxyGroup{Name: name, Type: p.Type, Now: p.Now, Members: members})

			continue
		}

		node := proxyNode{Name: name, Type: p.Type}
		if n := len(p.History); n > 0 {
			node.LastDelayMS = new(p.History[n-1].Delay)
			node.LastChecked = p.History[n-1].Time
		}

		out.Nodes = append(out.Nodes, node)
	}

	return out, nil
}

type versionsOut struct {
	Versions []config.Version `json:"versions"`
}

func (t tools) versions(ctx context.Context, _ struct{}) (versionsOut, error) {
	list, err := t.opts.Config.Versions(ctx)
	if err != nil {
		return versionsOut{}, err
	}

	if list == nil {
		list = []config.Version{}
	}

	return versionsOut{Versions: list}, nil
}

type versionIn struct {
	ID int `json:"id" jsonschema:"version id from metabox_config_versions"`
}

type versionOut struct {
	ID int `json:"id"`
	// Content is the config text with secrets masked and comments removed.
	Content string `json:"content"`
}

func (t tools) version(ctx context.Context, in versionIn) (versionOut, error) {
	if in.ID <= 0 {
		return versionOut{}, fmt.Errorf("%w: id должен быть больше нуля", errBadInput)
	}

	data, err := t.opts.Config.ReadVersion(ctx, in.ID)
	if err != nil {
		return versionOut{}, err
	}

	return versionOut{ID: in.ID, Content: string(maskConfig(data))}, nil
}

type logTailIn struct {
	Level string `json:"level,omitempty" jsonschema:"minimum level: trace, debug, info, notice, warn, error, fatal or panic"`
	Lines int    `json:"lines,omitempty" jsonschema:"number of lines, 1 to 1000, default 200"`
}

type logTailOut struct {
	Source  logs.Source  `json:"source"`
	Entries []logs.Entry `json:"entries"`
}

func (t tools) logTail(ctx context.Context, in logTailIn) (logTailOut, error) {
	level, ok := logs.ParseLevel(in.Level)
	if !ok {
		return logTailOut{}, fmt.Errorf("%w: level %q", errBadInput, in.Level)
	}

	snapshot, err := t.opts.Logs.Tail(ctx, clamp(in.Lines, defaultLogLines, logs.MaxLines), level)
	if err != nil {
		return logTailOut{}, err
	}

	entries := snapshot.Entries
	if entries == nil {
		entries = []logs.Entry{}
	}

	return logTailOut{Source: snapshot.Source, Entries: entries}, nil
}

func (t tools) diagnostics(ctx context.Context, _ struct{}) (diag.Report, error) {
	// No node is passed: the node check is a Clash API latency test, and its failure
	// erases the node's delay history.
	return t.opts.Diag.Run(ctx, "")
}

// clamp brings a requested count into 1..ceiling; zero or less means the default.
func clamp(n, def, ceiling int) int {
	if n <= 0 {
		return def
	}

	return min(n, ceiling)
}

func containsFold(s, sub string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(sub))
}
