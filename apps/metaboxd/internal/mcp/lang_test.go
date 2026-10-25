package mcp_test

import (
	"strings"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"metabox/internal/locale"
)

func TestToolTextsFollowLang(t *testing.T) {
	tests := []struct {
		lang            locale.Lang
		wantDescription string
		wantError       string
	}{
		{locale.English, "State of the router running metabox", "tool argument out of range: id must be greater than zero"},
		{locale.Russian, "Состояние роутера с metabox", "аргумент инструмента вне допустимых значений: id должен быть больше нуля"},
	}

	for _, tt := range tests {
		t.Run(string(tt.lang), func(t *testing.T) {
			b := newBenchIn(t, nil, &memoryStore{}, tt.lang, nil)
			session := b.session(b.enable())

			tools, err := session.ListTools(t.Context(), nil)
			if err != nil {
				t.Fatalf("list tools: %v", err)
			}

			found := false
			for _, tool := range tools.Tools {
				if tool.Name == "metabox_status" {
					found = true

					if !strings.HasPrefix(tool.Description, tt.wantDescription) {
						t.Errorf("description %q, want it to start with %q", tool.Description, tt.wantDescription)
					}
				}
			}

			if !found {
				t.Fatal("metabox_status is not offered")
			}

			result, err := session.CallTool(t.Context(), &sdk.CallToolParams{
				Name:      "metabox_config_version",
				Arguments: map[string]any{"id": 0},
			})
			if err != nil {
				t.Fatalf("call: %v", err)
			}

			if !result.IsError || text(result) != tt.wantError {
				t.Errorf("tool error %v %q, want %q", result.IsError, text(result), tt.wantError)
			}

			// The log keeps one language for whoever fixes the failure.
			if log := b.logBuf.String(); !strings.Contains(log, "tool argument out of range") {
				t.Errorf("the daemon log has no English failure text:\n%s", log)
			}
		})
	}
}
