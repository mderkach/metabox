package device

import (
	"cmp"
	"slices"

	"metabox/internal/history"
)

// OutboundTraffic keeps traffic matched by regular rules apart from the default rule.
type OutboundTraffic struct {
	Tag    string                `json:"tag"`
	Bytes  int64                 `json:"bytes"`
	Rate   float64               `json:"rate"`
	Origin history.TrafficOrigin `json:"origin"`
	Final  *history.TrafficValue `json:"final,omitempty"`
}

// ServerTraffic counts bytes at the server that left the group chain, excluding direct and blocked exits.
type ServerTraffic struct {
	Tag    string                `json:"tag"`
	Bytes  int64                 `json:"bytes"`
	Rate   float64               `json:"rate"`
	Origin history.TrafficOrigin `json:"origin"`
}

func (s *Stat) setTraffic(totals history.TrafficTotals) {
	s.Share.Split = totals.Split

	outbounds := make([]OutboundTraffic, 0, len(totals.Outbounds))
	for tag, row := range totals.Outbounds {
		outbounds = append(outbounds, OutboundTraffic{
			Tag: tag, Bytes: row.Bytes, Rate: row.Rate, Origin: row.Origin, Final: row.Final,
		})
	}
	slices.SortFunc(outbounds, func(a, b OutboundTraffic) int {
		return cmp.Compare(a.Tag, b.Tag)
	})

	servers := make([]ServerTraffic, 0, len(totals.Servers))
	for tag, row := range totals.Servers {
		servers = append(servers, ServerTraffic{
			Tag: tag, Bytes: row.Bytes, Rate: row.Rate, Origin: row.Origin,
		})
	}
	slices.SortFunc(servers, func(a, b ServerTraffic) int {
		return cmp.Compare(a.Tag, b.Tag)
	})

	s.Outbounds = &outbounds
	s.Servers = &servers
}
