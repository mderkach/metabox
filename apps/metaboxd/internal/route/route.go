// Package route explains the route of a connection by the observed core data.
//
// There is no sing-box rule evaluator of its own here and never will be: repeating
// the matching semantics would make metabox the arbiter of the route, not the binary.
// The rule list and the matched rule are taken from the Clash API,
// the index is determined by comparing conditions, and everything that cannot be computed
// is marked unknown and not replaced by a guess.
package route

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"metabox/internal/clashapi"
)

// Origin is the origin of a statement. There are exactly three values, they must not be mixed,
// and statements without an origin do not go outside.
type Origin string

const (
	// OriginObserved means the statement came from core: the rule list, the matched rule, the chain.
	OriginObserved Origin = "observed"
	// OriginComputed means it was computed by metabox or obtained by asking the binary.
	OriginComputed Origin = "computed"
	// OriginUnknown means nothing to compute with.
	OriginUnknown Origin = "unknown"
)

// ReasonCode is why the rule could not be determined. The set is closed: the text
// is chosen for the user by the panel by the code, and Reason stays as a detail in
// the daemon's language.
type ReasonCode string

const (
	// ReasonNotInProcessList means the connection has conditions, but there is no rule with them in
	// the running process list.
	ReasonNotInProcessList ReasonCode = "not_in_process_list"
)

// Kind is how the matched rule selection ended.
type Kind string

const (
	// KindRule means the rule is found in the running process list.
	KindRule Kind = "rule"
	// KindFinal means no rule matched, route.final was used. This is an
	// observed fact, not an unknown: core says it directly.
	KindFinal Kind = "final"
	// KindUnknown means the connection has conditions, and they were not found in the rule list.
	KindUnknown Kind = "unknown"
)

var (
	// ErrNoConnection means core has no connection with such an identifier. It
	// could have closed between the snapshot the panel sees and this request.
	ErrNoConnection = errors.New("соединения с таким идентификатором нет")

	// ErrRuntimeUnavailable means the runtime did not answer. This is a source failure, not the
	// panel's: the screen must tell "no data" from "the daemon is broken".
	ErrRuntimeUnavailable = errors.New("рантайм sing-box недоступен")
)

// Rule is a rule of the running process. The index equals the node index in
// route.rules of the applied document: the router builds the list by a loop over the config
// one to one.
type Rule struct {
	Origin     Origin `json:"origin"`
	Index      int    `json:"index"`
	Type       string `json:"type"`
	Conditions string `json:"conditions"`
	Action     string `json:"action"`
}

// Match is the matched rule. Index is returned by pointer: zero is a valid
// index, and it cannot otherwise be told from "no index".
type Match struct {
	Origin     Origin `json:"origin"`
	Kind       Kind   `json:"kind"`
	Index      *int   `json:"index,omitempty"`
	Conditions string `json:"conditions,omitempty"`
	Action     string `json:"action,omitempty"`
	// ReasonCode is filled only for Kind == KindUnknown: the panel takes
	// the text in the user's language by it.
	ReasonCode ReasonCode `json:"reason_code,omitempty"`
	// Reason is the same reason in the daemon's words. A fallback text for a code the
	// panel does not know.
	Reason string `json:"reason,omitempty"`
}

// Chain is the proxy chain of a connection in the order core returns it:
// from the final node to the group.
type Chain struct {
	Origin Origin   `json:"origin"`
	Nodes  []string `json:"nodes"`
}

// Explanation is the response of the route explanation handler.
type Explanation struct {
	ConnectionID string `json:"connection_id"`
	Match        Match  `json:"match"`
	Chain        Chain  `json:"chain"`
	// Rules is the whole list of the running process. The panel compares its length with
	// the length of route.rules of the applied document: the process could have loaded another
	// config, and leading the user to a node of a foreign file is not allowed.
	Rules []Rule `json:"rules"`
}

// Source returns one-off Clash API responses. The interface is declared here, at the
// consumer, and contains only the snapshot read.
type Source interface {
	Snapshot(ctx context.Context, path string) (json.RawMessage, error)
}

// Explainer assembles the explanation from core data.
type Explainer struct {
	source Source
}

// NewExplainer assembles the explanation on top of the same source as the runtime
// stream: the daemon does not create a second set of Clash API requests.
func NewExplainer(source Source) *Explainer {
	return &Explainer{source: source}
}

type clashRule struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
	Proxy   string `json:"proxy"`
}

type clashRules struct {
	Rules []clashRule `json:"rules"`
}

type clashConnection struct {
	ID     string   `json:"id"`
	Rule   string   `json:"rule"`
	Chains []string `json:"chains"`
}

type clashConnections struct {
	Connections []clashConnection `json:"connections"`
}

// Explain explains the route of a connection: which rule fired, which config
// node it is and which chain the traffic went through.
func (e *Explainer) Explain(ctx context.Context, id string) (Explanation, error) {
	connection, err := e.connection(ctx, id)
	if err != nil {
		return Explanation{}, err
	}

	rules, err := readRules(ctx, e.source)
	if err != nil {
		return Explanation{}, err
	}

	return Explanation{
		ConnectionID: connection.ID,
		Match:        matchRule(connection.Rule, rules),
		Chain:        Chain{Origin: OriginObserved, Nodes: connection.Chains},
		Rules:        rules,
	}, nil
}

func (e *Explainer) connection(ctx context.Context, id string) (clashConnection, error) {
	body, err := e.source.Snapshot(ctx, "/connections")
	if err != nil {
		return clashConnection{}, fmt.Errorf("%w: соединения: %w", ErrRuntimeUnavailable, err)
	}

	var snapshot clashConnections
	if err := json.Unmarshal(body, &snapshot); err != nil {
		return clashConnection{}, fmt.Errorf("разбор снапшота соединений: %w", err)
	}

	for _, connection := range snapshot.Connections {
		if connection.ID == id {
			return connection, nil
		}
	}

	return clashConnection{}, ErrNoConnection
}

// readRules reads the rule list of the running process.
func readRules(ctx context.Context, source Source) ([]Rule, error) {
	body, err := source.Snapshot(ctx, "/rules")
	if err != nil {
		return nil, fmt.Errorf("%w: список правил: %w", ErrRuntimeUnavailable, err)
	}

	var list clashRules
	if err := json.Unmarshal(body, &list); err != nil {
		return nil, fmt.Errorf("разбор списка правил: %w", err)
	}

	rules := make([]Rule, 0, len(list.Rules))
	for index, rule := range list.Rules {
		rules = append(rules, Rule{
			Origin:     OriginObserved,
			Index:      index,
			Type:       rule.Type,
			Conditions: rule.Payload,
			Action:     rule.Proxy,
		})
	}

	return rules, nil
}

// matchRule finds the connection rule in the running process list.
//
// Matching goes by conditions: both sources render them identically. Of the
// matched ones those whose action does not interrupt the rule iteration are dropped;
// only a node with route, reject, hijack-dns or
// bypass with a non-empty outbound can turn out recorded. Of the rest the first is taken: the router
// stops at the first match.
func matchRule(rule string, rules []Rule) Match {
	// An empty string means the same as `final`: the fork gRPC leaves the field
	// empty, while the Clash API substitutes a word. Without this check
	// empty conditions would match the first rule without conditions.
	if rule == "" || rule == clashapi.FinalRule {
		return Match{Origin: OriginObserved, Kind: KindFinal}
	}

	conditions, action, hasAction := clashapi.SplitRule(rule)

	for _, candidate := range rules {
		if candidate.Conditions != conditions || !terminates(candidate.Action) {
			continue
		}

		if hasAction && candidate.Action != action {
			continue
		}

		index := candidate.Index

		return Match{
			Origin:     OriginObserved,
			Kind:       KindRule,
			Index:      &index,
			Conditions: candidate.Conditions,
			Action:     candidate.Action,
		}
	}

	return Match{
		Origin:     OriginUnknown,
		Kind:       KindUnknown,
		ReasonCode: ReasonNotInProcessList,
		Reason:     "правила соединения нет в списке работающего процесса",
	}
}

// terminates reports whether an action interrupts the rule iteration.
//
// Determined by the action string, because the Clash API has no other flag.
// `bypass()` without an outbound does not interrupt the iteration and does not become the recorded matched
// rule: in the other bypass the name of the outbound stands in brackets.
func terminates(action string) bool {
	name, arguments, _ := strings.Cut(action, "(")
	arguments = strings.TrimSuffix(arguments, ")")

	switch name {
	case "route", "reject", "hijack-dns":
		return true
	case "bypass":
		return arguments != ""
	default:
		return false
	}
}
