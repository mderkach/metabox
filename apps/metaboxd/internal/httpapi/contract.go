package httpapi

import (
	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/dataplane"
	"metabox/internal/devices"
	"metabox/internal/history"
	"metabox/internal/logs"
	"metabox/internal/redaction"
)

// each maps a slice element by element and keeps nil as nil: JSON tells null from an
// empty array, and the panel parses the two differently.
func each[T, U any](in []T, f func(T) U) []U {
	if in == nil {
		return nil
	}

	out := make([]U, len(in))
	for i, v := range in {
		out[i] = f(v)
	}

	return out
}

func transactionOut(tx apply.Transaction) *contract.Transaction {
	return &contract.Transaction{
		ID:            tx.ID,
		Phase:         contract.Phase(tx.Phase),
		Window:        tx.Window,
		Sum:           tx.Sum,
		Lists:         tx.Lists,
		RemovedLists:  tx.RemovedLists,
		ReasonCode:    contract.ReasonCode(tx.ReasonCode),
		Reason:        redaction.URLs(tx.Reason),
		ClashAPIAdded: tx.ClashAPIAdded,
	}
}

func versionOut(v config.Version) contract.Version { return contract.Version(v) }

func listStatsOut(stats map[string]config.ListStat) map[string]contract.ListStat {
	if stats == nil {
		return nil
	}

	out := make(map[string]contract.ListStat, len(stats))
	for name, stat := range stats {
		out[name] = contract.ListStat(stat)
	}

	return out
}

func pointOut(p history.Point) contract.Point { return contract.Point(p) }

func devicePointOut(p history.DevicePoint) contract.DevicePoint { return contract.DevicePoint(p) }

func deviceOut(d devices.Device) contract.Device {
	return contract.Device{
		IP:           d.IP,
		MAC:          d.MAC,
		Name:         d.Name,
		NameSource:   contract.NameSource(d.NameSource),
		Static:       d.Static,
		Online:       d.Online,
		LeaseExpires: d.LeaseExpires,
	}
}

func modelOut(m dataplane.Model) contract.Model {
	return contract.Model{
		Enabled:          m.Enabled,
		RedirectPort:     m.RedirectPort,
		TproxyPort:       m.TproxyPort,
		DNSPort:          m.DNSPort,
		DNSHijack:        m.DNSHijack,
		SelfMark:         m.SelfMark,
		TproxyMark:       m.TproxyMark,
		RouteTable:       m.RouteTable,
		AccessMode:       contract.AccessMode(m.AccessMode),
		SourceIP:         m.SourceIP,
		SourceMAC:        m.SourceMAC,
		SourceIPExclude:  m.SourceIPExclude,
		SourceMACExclude: m.SourceMACExclude,
		LANInterface:     m.LANInterface,
		WANProxyCIDR:     m.WANProxyCIDR,
		WANDirectCIDR:    m.WANDirectCIDR,
		IPv6:             m.IPv6,
	}
}

func modelIn(m contract.Model) dataplane.Model {
	return dataplane.Model{
		Enabled:          m.Enabled,
		RedirectPort:     m.RedirectPort,
		TproxyPort:       m.TproxyPort,
		DNSPort:          m.DNSPort,
		DNSHijack:        m.DNSHijack,
		SelfMark:         m.SelfMark,
		TproxyMark:       m.TproxyMark,
		RouteTable:       m.RouteTable,
		AccessMode:       dataplane.AccessMode(m.AccessMode),
		SourceIP:         m.SourceIP,
		SourceMAC:        m.SourceMAC,
		SourceIPExclude:  m.SourceIPExclude,
		SourceMACExclude: m.SourceMACExclude,
		LANInterface:     m.LANInterface,
		WANProxyCIDR:     m.WANProxyCIDR,
		WANDirectCIDR:    m.WANDirectCIDR,
		IPv6:             m.IPv6,
	}
}

func fieldErrorOut(e dataplane.FieldError) contract.FieldError {
	return contract.FieldError{Field: e.Field, Value: e.Value, Reason: contract.FieldReason(e.Reason)}
}

func entryOut(e logs.Entry) contract.Entry {
	return contract.Entry{Time: e.Time, Level: contract.Level(e.Level), Message: redaction.URLs(e.Message)}
}
