package route

import (
	"context"
	"encoding/json"
	"fmt"

	"metabox/internal/history"
)

// VolumeRecorder accepts a snapshot for the volume split: the process byte total and
// the live connections with their kind.
type VolumeRecorder interface {
	Observe(total int64, flows []history.Flow)
}

// Outbound types as the Clash API names them in `/proxies`; a `block` outbound is
// shown there as `Reject`.
const (
	outboundDirect = "Direct"
	outboundDNS    = "DNS"
	outboundBlock  = "Block"
	outboundReject = "Reject"
)

type clashProxies struct {
	Proxies map[string]struct {
		Type string `json:"type"`
	} `json:"proxies"`
}

// recordVolumes classifies the snapshot connections by the type of their final
// outbound, the first node of the chain, and hands them to the volume split.
// The type list is reread once per snapshot when a tag is not in it.
func (c *Counter) recordVolumes(ctx context.Context, snapshot clashConnections) {
	flows := make([]history.Flow, 0, len(snapshot.Connections))
	refreshed := false

	for _, connection := range snapshot.Connections {
		tag := ""
		if len(connection.Chains) > 0 {
			tag = connection.Chains[0]
		}

		if _, ok := c.outbounds[tag]; !ok && tag != "" && !refreshed {
			refreshed = true

			if next, err := readOutbounds(ctx, c.source); err == nil {
				c.outbounds = next
			} else if ctx.Err() == nil {
				c.log.Debug("outbound types for the volume split not read", "err", err)
			}
		}

		flows = append(flows, history.Flow{
			ID:    connection.ID,
			Kind:  outboundKind(c.outbounds[tag]),
			Bytes: connection.Upload + connection.Download,
		})
	}

	c.opts.Volumes.Observe(snapshot.UploadTotal+snapshot.DownloadTotal, flows)
}

// outboundKind maps an outbound type to the split kind. A DNS outbound answers
// locally and does not leave through a proxy, so it counts as direct. An unknown
// type is a proxy: everything except these outbounds carries traffic through a node.
func outboundKind(outboundType string) history.Kind {
	switch outboundType {
	case outboundDirect, outboundDNS:
		return history.KindDirect
	case outboundBlock, outboundReject:
		return history.KindBlock
	default:
		return history.KindProxy
	}
}

func readOutbounds(ctx context.Context, source Source) (map[string]string, error) {
	body, err := source.Snapshot(ctx, "/proxies")
	if err != nil {
		return nil, fmt.Errorf("outbound list: %w", err)
	}

	var list clashProxies
	if err := json.Unmarshal(body, &list); err != nil {
		return nil, fmt.Errorf("parse outbound list: %w", err)
	}

	types := make(map[string]string, len(list.Proxies))
	for tag, proxy := range list.Proxies {
		types[tag] = proxy.Type
	}

	return types, nil
}
