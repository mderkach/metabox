package route

import (
	"context"
	"encoding/json"
)

// ConnectionsWithRuleNames returns the live snapshot and the names whose
// revision and position were proved for that same observation.
func (e *Explainer) ConnectionsWithRuleNames(ctx context.Context) (json.RawMessage, map[string]string, error) {
	evidence := e.verifier.capture(ctx)
	if evidence == nil {
		raw, err := e.source.Snapshot(ctx, "/connections")

		return raw, nil, err
	}

	raw, err := evidence.source.Snapshot(ctx, "/connections")
	if err != nil {
		raw, err = e.source.Snapshot(ctx, "/connections")

		return raw, nil, err
	}

	var snapshot clashConnections
	if err := json.Unmarshal(raw, &snapshot); err != nil || len(snapshot.Connections) == 0 {
		return raw, nil, nil
	}

	rules, err := readRules(ctx, evidence.source)
	if err != nil || !evidence.confirm(ctx) {
		return raw, nil, nil
	}

	names := make(map[string]string)
	for _, connection := range snapshot.Connections {
		index, ok := appliedPosition(connection.Rule, rules, evidence.names)
		if ok && evidence.names[index] != "" {
			names[connection.ID] = evidence.names[index]
		}
	}

	return raw, names, nil
}
