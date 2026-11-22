package clashapi

import (
	"encoding/json"
	"fmt"
	"slices"
)

// BlockedLog is the applied config projection needed to interpret the connection log.
type BlockedLog struct {
	Level    string
	Disabled bool
	Output   string
	Reject   bool
	Block    bool
}

// ReadBlockedLog excludes DNS rejects, which close a query rather than a connection.
func ReadBlockedLog(data []byte) (BlockedLog, error) {
	type outboundKind struct {
		Type string `json:"type"`
	}
	type provider struct {
		Type      string         `json:"type"`
		Outbounds []outboundKind `json:"outbounds"`
	}
	var cfg struct {
		Log struct {
			Level    string `json:"level"`
			Disabled bool   `json:"disabled"`
			Output   string `json:"output"`
		} `json:"log"`
		Route struct {
			Rules []struct {
				Action string `json:"action"`
			} `json:"rules"`
		} `json:"route"`
		Outbounds []outboundKind `json:"outbounds"`
		Providers []provider     `json:"providers"`
	}

	if err := json.Unmarshal(mask(data), &cfg); err != nil {
		return BlockedLog{}, fmt.Errorf("read blocked connection log options: %w", err)
	}

	settings := BlockedLog{
		Level:    cfg.Log.Level,
		Disabled: cfg.Log.Disabled,
		Output:   logFile(cfg.Log.Output, cfg.Log.Disabled),
	}

	for _, rule := range cfg.Route.Rules {
		if rule.Action == "reject" {
			settings.Reject = true

			break
		}
	}

	isBlock := func(outbound outboundKind) bool { return outbound.Type == "block" }
	settings.Block = slices.ContainsFunc(cfg.Outbounds, isBlock) ||
		slices.ContainsFunc(cfg.Providers, func(p provider) bool {
			return p.Type == "inline" && slices.ContainsFunc(p.Outbounds, isBlock)
		})

	return settings, nil
}
