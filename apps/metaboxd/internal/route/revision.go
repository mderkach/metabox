package route

import (
	"context"
	"net"
	"net/url"
	"strconv"

	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/singbox"
)

// AppliedRule identifies a rule in an exact revision of the applied document.
type AppliedRule struct {
	Index int    `json:"index"`
	ETag  string `json:"etag"`
}

// RevisionConfig reads the same bytes and digest as the applied config endpoint.
type RevisionConfig interface {
	Read(context.Context) ([]byte, error)
	Sum(context.Context) (string, error)
}

// RuleVerifier binds observed runtime data to the managed process and its loaded config.
type RuleVerifier struct {
	config   RevisionConfig
	identify func(context.Context) (singbox.RevisionIdentity, error)
	listener func(context.Context, int, int) string
	pin      func(clashapi.Settings) (Source, error)
}

// NewRuleVerifier assembles the optional proof used by the panel and MCP.
func NewRuleVerifier(
	cfg RevisionConfig,
	identify func(context.Context) (singbox.RevisionIdentity, error),
	listener func(context.Context, int, int) string,
	pin func(clashapi.Settings) (Source, error),
) *RuleVerifier {
	return &RuleVerifier{config: cfg, identify: identify, listener: listener, pin: pin}
}

type ruleEvidence struct {
	source  Source
	etag    string
	names   []string
	confirm func(context.Context) bool
}

func (v *RuleVerifier) capture(ctx context.Context) *ruleEvidence {
	if v == nil {
		return nil
	}
	identity, err := v.identify(ctx)
	if err != nil || identity.PID <= 0 || identity.SHA256 == "" {
		return nil
	}

	data, err := v.config.Read(ctx)
	if err != nil || config.Sum(data) != identity.SHA256 {
		return nil
	}

	settings, err := clashapi.Read(data)
	if err != nil {
		return nil
	}
	port := controllerPort(settings)
	if port == 0 {
		return nil
	}
	listener := v.listener(ctx, identity.PID, port)
	if listener == "" {
		return nil
	}

	source, err := v.pin(settings)
	if err != nil {
		return nil
	}
	names, err := clashapi.ReadRuleNames(data)
	if err != nil {
		return nil
	}

	return &ruleEvidence{
		source: source,
		etag:   strconv.Quote(identity.SHA256),
		names:  names,
		confirm: func(ctx context.Context) bool {
			sum, err := v.config.Sum(ctx)
			if err != nil || sum != identity.SHA256 {
				return false
			}
			current, err := v.identify(ctx)

			return err == nil && current == identity && v.listener(ctx, identity.PID, port) == listener
		},
	}
}

func controllerPort(settings clashapi.Settings) int {
	base, err := settings.BaseURL()
	if err != nil {
		return 0
	}

	endpoint, err := url.Parse(base)
	if err != nil || !net.ParseIP(endpoint.Hostname()).IsLoopback() {
		return 0
	}

	port, err := strconv.Atoi(endpoint.Port())
	if err != nil || port < 1 || port > 65535 {
		return 0
	}

	return port
}

// appliedPosition requires a unique match in the runtime list even when a
// process and config have already been proved.
func appliedPosition(observed string, rules []Rule, names []string) (int, bool) {
	if len(rules) != len(names) || observed == "" || observed == clashapi.FinalRule {
		return 0, false
	}

	condition, action, hasAction := clashapi.SplitRule(observed)
	index := -1
	for _, rule := range rules {
		if !matchesRule(rule, condition, action, hasAction) {
			continue
		}
		if index != -1 {
			return 0, false
		}

		index = rule.Index
	}

	return index, index >= 0
}
