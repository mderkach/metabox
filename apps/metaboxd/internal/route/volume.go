package route

import (
	"context"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/history"
)

// VolumeRecorder keeps the totals and prunes rows only when passed a confirmed set of tags.
type VolumeRecorder interface {
	ObserveTraffic(total int64, flows []history.Flow, retained map[string]struct{})
	HasTraffic(tag string) bool
}

// Outbound types as the Clash API names them in `/proxies`; a `block` outbound is
// shown there as `Reject`.
const (
	outboundDirect = "Direct"
	outboundDNS    = "DNS"
	outboundBlock  = "Block"
	outboundReject = "Reject"
)

const outboundRefreshDelay = 5 * time.Second

// recordVolumes receives chains in core order, from the final server to the
// outbound selected by the rule.
func (c *Counter) recordVolumes(ctx context.Context, snapshot clashConnections) {
	total := snapshot.UploadTotal + snapshot.DownloadTotal
	retained := c.refreshVolumeTags(ctx, snapshot.Connections, total < c.volumeTotal)
	c.volumeTotal = total

	flows := make([]history.Flow, 0, len(snapshot.Connections))
	for _, connection := range snapshot.Connections {
		flow := history.Flow{
			ID:    connection.ID,
			Bytes: connection.Upload + connection.Download,
			Final: connection.Rule == "" || connection.Rule == clashapi.FinalRule,
		}
		if chain := connection.Chains; len(chain) > 0 {
			flow.Outbound = chain[len(chain)-1]
			flow.Kind = outboundKind(c.outbounds[chain[0]])
			if flow.Kind == history.KindProxy {
				flow.Server = chain[0]
			}
		}

		flows = append(flows, flow)
	}

	c.opts.Volumes.ObserveTraffic(total, flows, retained)
}

func (c *Counter) refreshVolumeTags(ctx context.Context, connections []clashConnection, counterReset bool) map[string]struct{} {
	var revision string
	var configTags map[string]struct{}

	if c.opts.TrafficConfig != nil {
		sum, tags, err := c.opts.TrafficConfig(ctx)
		if err == nil && sum != "" {
			revision, configTags = sum, tags
		}
	}

	now := time.Now()
	revisionChanged := configTags != nil && revision != c.outboundRevision
	refreshDue := configTags != nil && !c.outboundRefresh.IsZero() && !now.Before(c.outboundRefresh)

	if !revisionChanged && !refreshDue && !counterReset && !c.hasUnknownServer(connections) {
		return nil
	}
	if refreshDue {
		c.outboundRefresh = now.Add(outboundRefreshDelay)
	}

	next, err := clashapi.ReadOutboundTypes(ctx, c.source)
	if err != nil {
		if ctx.Err() == nil {
			c.log.Debug("outbound types for the volume split not read", "err", err)
		}

		return nil
	}

	c.outbounds = next
	if configTags == nil {
		return nil
	}

	retained := make(map[string]struct{}, len(configTags)+len(next))
	for tag := range configTags {
		retained[tag] = struct{}{}
	}
	for tag := range next {
		retained[tag] = struct{}{}
	}
	for _, connection := range connections {
		for _, tag := range connection.Chains {
			retained[tag] = struct{}{}
		}
	}

	if revisionChanged {
		c.trackRemovedTraffic(configTags)
		c.outboundRevision = revision
	}
	for tag := range c.outboundPending {
		_, configured := configTags[tag]
		_, stillPresent := retained[tag]
		if configured || !stillPresent {
			delete(c.outboundPending, tag)
		}
	}

	c.outboundRefresh = time.Time{}
	// Applied config can change ahead of runtime. A removed configured tag with
	// retained traffic needs confirmation even if the router sees no new flows.
	if len(c.outboundPending) > 0 || revisionChanged && len(retained) > len(configTags) {
		c.outboundRefresh = now.Add(outboundRefreshDelay)
	}

	return retained
}

func (c *Counter) trackRemovedTraffic(current map[string]struct{}) {
	for tag := range c.outboundConfig {
		if _, kept := current[tag]; !kept && c.opts.Volumes.HasTraffic(tag) {
			if c.outboundPending == nil {
				c.outboundPending = make(map[string]struct{})
			}

			c.outboundPending[tag] = struct{}{}
		}
	}
	c.outboundConfig = current
}

func (c *Counter) hasUnknownServer(connections []clashConnection) bool {
	for _, connection := range connections {
		if len(connection.Chains) > 0 {
			if _, found := c.outbounds[connection.Chains[0]]; !found {
				return true
			}
		}
	}

	return false
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
