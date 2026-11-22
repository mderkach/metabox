package mcp_test

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"metabox/internal/events"
	"metabox/internal/httpapi"
	"metabox/internal/locale"
	"metabox/internal/mcp"
	"metabox/internal/route"
)

const unsafeRuleName = "Media \u200bhtt\u200bps:\u034f//user:secret@example.org/private?token=token"

type namedRulesConfig struct{ fakeConfig }

func (namedRulesConfig) ReadVersion(context.Context, int) ([]byte, error) {
	return []byte(`{
		// Unrelated private comment
		"route":{"rules":[
			// ` + unsafeRuleName + `
			{"domain":"media.example","outbound":"proxy"},
			{"domain":"local.example","outbound":"direct"}
		]}
	}`), nil
}

type verifiedNamesRuntime struct{ mcp.Runtime }

func (r verifiedNamesRuntime) Explain(ctx context.Context, id string) (route.Explanation, error) {
	return route.NewExplainer(r.Runtime, locale.English).Explain(ctx, id)
}

func (r verifiedNamesRuntime) ConnectionsWithRuleNames(ctx context.Context) (json.RawMessage, map[string]string, error) {
	raw, err := r.Snapshot(ctx, "/connections")

	return raw, map[string]string{"c1": unsafeRuleName + "\u0007"}, err
}

func TestConfigVersionReturnsOnlyIndexedMaskedRuleNames(t *testing.T) {
	b := newBareBench(t, &memoryStore{}, mcp.Options{Config: namedRulesConfig{}}, httpapi.Options{})
	session := b.session(b.enable())
	out := call[struct {
		Content   string   `json:"content"`
		RuleNames []string `json:"rule_names"`
	}](t, session, "metabox_config_version", map[string]any{"id": 2})
	if strings.Contains(out.Content, "Unrelated") || strings.Contains(out.Content, "Media") {
		t.Errorf("comments returned in content: %s", out.Content)
	}
	if want := []string{"Media https://example.org/••••••", ""}; !reflect.DeepEqual(out.RuleNames, want) {
		t.Errorf("rule names: got %v, want %v", out.RuleNames, want)
	}
}

func TestConnectionsExposeOnlyVerifiedMaskedRuleNames(t *testing.T) {
	runtime := newRuntime()
	b := newBareBench(t, &memoryStore{}, mcp.Options{
		Runtime: runtime,
		Explain: verifiedNamesRuntime{runtime},
	}, httpapi.Options{})
	session := b.session(b.enable())

	out := call[struct {
		Connections []struct {
			events.Connection
			RuleName string `json:"rule_name"`
		} `json:"connections"`
	}](t, session, "metabox_connections", nil)
	if len(out.Connections) != 2 {
		t.Fatalf("connections: %+v", out.Connections)
	}
	verified, fallback := out.Connections[0], out.Connections[1]
	if verified.ID != "c1" || verified.Rule != "domain_suffix=[example.com]" ||
		verified.Action != "route(proxy)" || verified.RuleName != "Media https://example.org/••••••" {
		t.Errorf("verified connection: %+v", verified)
	}
	if fallback.ID != "c2" || !fallback.Final || fallback.RuleName != "" {
		t.Errorf("connection without verification: %+v", fallback)
	}
}
