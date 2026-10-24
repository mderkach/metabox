package events

import (
	"encoding/json"
	"fmt"
	"net"

	"metabox/internal/clashapi"
)

// Connection is a connection in the daemon contract.
//
// The panel shape does not depend on which source the connection was read from:
// the Clash API and the fork gRPC differ both in the field set and in the rule
// format, so the reduction to one model is done by the daemon, not the frontend.
type Connection struct {
	ID string `json:"id"`
	// Host is the destination address with a port: the name if sniff parsed it, otherwise
	// the address. Built here because the sources keep it differently.
	Host    string `json:"host"`
	Network string `json:"network"`
	Source  string `json:"source"`
	// Rule is the conditions of the matched rule. Empty for a rule without conditions and for
	// a connection that matched none.
	Rule string `json:"rule"`
	// Action is the rule outbound: an outbound or an action. gRPC does not return it at all, and the field is empty there.
	Action string `json:"action"`
	// Final marks that no rule matched and route.final fired.
	// Without a separate flag this outbound cannot be told from a rule without conditions:
	// both have empty conditions, but these are different things.
	Final bool `json:"final"`
	// Chain is the chain in core order: from the final node to the group.
	Chain     []string `json:"chain"`
	Upload    int64    `json:"upload"`
	Download  int64    `json:"download"`
	StartedAt string   `json:"started_at"`
}

// ConnectionsSnapshot is the full list of live connections with totals.
type ConnectionsSnapshot struct {
	Connections   []Connection `json:"connections"`
	UploadTotal   int64        `json:"upload_total"`
	DownloadTotal int64        `json:"download_total"`
	Memory        int64        `json:"memory"`
}

type clashMetadata struct {
	Network         string `json:"network"`
	SourceIP        string `json:"sourceIP"`
	DestinationIP   string `json:"destinationIP"`
	DestinationPort string `json:"destinationPort"`
	Host            string `json:"host"`
}

type clashConnection struct {
	ID       string        `json:"id"`
	Chains   []string      `json:"chains"`
	Rule     string        `json:"rule"`
	Upload   int64         `json:"upload"`
	Download int64         `json:"download"`
	Start    string        `json:"start"`
	Metadata clashMetadata `json:"metadata"`
}

type clashSnapshot struct {
	Connections   []clashConnection `json:"connections"`
	UploadTotal   int64             `json:"uploadTotal"`
	DownloadTotal int64             `json:"downloadTotal"`
	Memory        int64             `json:"memory"`
}

// connectionsSnapshot translates the Clash API snapshot into the daemon contract and returns
// the accumulated byte counter: the channel share through sing-box is counted by it, and
// it is visible only here.
func connectionsSnapshot(raw json.RawMessage) (json.RawMessage, int64, error) {
	snapshot, err := ParseConnections(raw)
	if err != nil {
		return nil, 0, err
	}

	body, err := json.Marshal(snapshot)
	if err != nil {
		return nil, 0, fmt.Errorf("build connections snapshot: %w", err)
	}

	return body, snapshot.UploadTotal + snapshot.DownloadTotal, nil
}

// ParseConnections translates the raw Clash API `/connections` snapshot into the daemon
// contract: the same shape the panel gets from the stream.
func ParseConnections(raw json.RawMessage) (ConnectionsSnapshot, error) {
	var source clashSnapshot
	if err := json.Unmarshal(raw, &source); err != nil {
		return ConnectionsSnapshot{}, fmt.Errorf("parse connections snapshot: %w", err)
	}

	snapshot := ConnectionsSnapshot{
		Connections:   make([]Connection, 0, len(source.Connections)),
		UploadTotal:   source.UploadTotal,
		DownloadTotal: source.DownloadTotal,
		Memory:        source.Memory,
	}

	for _, connection := range source.Connections {
		rule, action, final := splitRule(connection.Rule)

		snapshot.Connections = append(snapshot.Connections, Connection{
			ID:        connection.ID,
			Host:      host(connection.Metadata),
			Network:   connection.Metadata.Network,
			Source:    connection.Metadata.SourceIP,
			Rule:      rule,
			Action:    action,
			Final:     final,
			Chain:     chain(connection.Chains),
			Upload:    connection.Upload,
			Download:  connection.Download,
			StartedAt: connection.Start,
		})
	}

	return snapshot, nil
}

// splitRule separates the conditions and the outbound of a rule and marks the default outbound.
//
// An empty string means the same as `final`: the fork gRPC does not fill the field, and
// the Clash API substitutes a word. This outbound is not a rule,
// so neither conditions nor an action remain of it.
func splitRule(rule string) (conditions, action string, final bool) {
	if rule == "" || rule == clashapi.FinalRule {
		return "", "", true
	}

	conditions, action, _ = clashapi.SplitRule(rule)

	return conditions, action, false
}

// chain turns an empty chain into a list: nil would go into JSON as null, and
// the panel would break on the very first such connection.
func chain(nodes []string) []string {
	if nodes == nil {
		return []string{}
	}

	return nodes
}

// host builds the destination address. The name is taken when sniff parsed it,
// otherwise the address stays, and the panel does not have to choose for the daemon.
func host(metadata clashMetadata) string {
	name := metadata.Host
	if name == "" {
		name = metadata.DestinationIP
	}

	if metadata.DestinationPort == "" {
		return name
	}

	return net.JoinHostPort(name, metadata.DestinationPort)
}
