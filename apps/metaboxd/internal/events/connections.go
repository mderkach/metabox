package events

import (
	"encoding/json"
	"fmt"
	"net"

	"metabox/internal/clashapi"
)

// Connection — соединение в контракте демона.
//
// Форма панели не зависит от того, каким источником соединение прочитано
// (ADR-0006): Clash API и gRPC форка расходятся и в наборе полей, и в формате
// правила, поэтому сведение к одной модели делает демон, а не фронт.
type Connection struct {
	ID string `json:"id"`
	// Host — адрес назначения с портом: имя, если его разобрал sniff, иначе
	// адрес. Собирается здесь, потому что источники держат его по-разному.
	Host    string `json:"host"`
	Network string `json:"network"`
	Source  string `json:"source"`
	// Rule — условия сработавшего правила. Пусто у правила без условий и у
	// соединения, не совпавшего ни с одним (ADR-0007).
	Rule string `json:"rule"`
	// Action — исход правила. gRPC его не отдаёт вовсе, и там поле пустое.
	Action string `json:"action"`
	// Final отмечает, что ни одно правило не совпало и сработал route.final.
	// Без отдельного признака этот исход не отличить от правила без условий:
	// у обоих условия пусты, а это разные вещи (ADR-0007).
	Final bool `json:"final"`
	// Chain — цепочка в порядке core: от конечного узла к группе.
	Chain     []string `json:"chain"`
	Upload    int64    `json:"upload"`
	Download  int64    `json:"download"`
	StartedAt string   `json:"started_at"`
}

// ConnectionsSnapshot — полный список живых соединений с итогами.
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

// connectionsSnapshot переводит снапшот Clash API в контракт демона.
func connectionsSnapshot(raw json.RawMessage) (json.RawMessage, error) {
	var source clashSnapshot
	if err := json.Unmarshal(raw, &source); err != nil {
		return nil, fmt.Errorf("разбор снапшота соединений: %w", err)
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

	body, err := json.Marshal(snapshot)
	if err != nil {
		return nil, fmt.Errorf("сборка снапшота соединений: %w", err)
	}

	return body, nil
}

// splitRule разводит условия и исход правила и отмечает исход по умолчанию.
//
// Пустая строка значит то же, что `final`: gRPC форка поле не заполняет, а
// Clash API подставляет слово (ADR-0007). Правилом этот исход не является,
// поэтому ни условий, ни действия от него не остаётся.
func splitRule(rule string) (conditions, action string, final bool) {
	if rule == "" || rule == clashapi.FinalRule {
		return "", "", true
	}

	conditions, action, _ = clashapi.SplitRule(rule)

	return conditions, action, false
}

// chain приводит пустую цепочку к списку: nil ушёл бы в JSON как null, и
// панель сломалась бы на первом же таком соединении.
func chain(nodes []string) []string {
	if nodes == nil {
		return []string{}
	}

	return nodes
}

// host собирает адрес назначения. Имя берётся, когда его разобрал sniff, —
// иначе остаётся адрес, и панели не приходится выбирать за демона.
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
