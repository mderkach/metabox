package clashapi

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"time"
)

// LatencyReading describes a server listed by the core. A zero At means the
// core has no result for it. With a timestamp, zero milliseconds is a result.
type LatencyReading struct {
	Tag    string
	At     time.Time
	Millis uint16
}

// LatencySource reads a point-in-time response from the Clash controller.
type LatencySource interface {
	Snapshot(ctx context.Context, path string) (json.RawMessage, error)
}

type latencyProxy struct {
	Type    string   `json:"type"`
	All     []string `json:"all"`
	History []struct {
		At    time.Time `json:"time"`
		Delay *uint16   `json:"delay"`
	} `json:"history"`
}

// ReadLatency treats an incomplete snapshot as unavailable. Only an explicit
// empty history means a listed server has no result.
func ReadLatency(ctx context.Context, source LatencySource) ([]LatencyReading, error) {
	raw, err := source.Snapshot(ctx, "/proxies")
	if err != nil {
		return nil, fmt.Errorf("read proxy latency: %w", err)
	}

	var snapshot struct {
		Proxies map[string]latencyProxy `json:"proxies"`
	}
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return nil, fmt.Errorf("parse proxy latency: %w", err)
	}
	if snapshot.Proxies == nil {
		return nil, errors.New("proxy latency snapshot has no proxy list")
	}

	readings := make([]LatencyReading, 0, len(snapshot.Proxies))
	for tag, proxy := range snapshot.Proxies {
		if tag == "" || proxy.Type == "" {
			return nil, errors.New("proxy latency entry has no tag or type")
		}
		if !proxy.server() {
			continue
		}

		reading := LatencyReading{Tag: tag}
		switch len(proxy.History) {
		case 0:
			if proxy.History == nil {
				return nil, errors.New("proxy latency entry has no history")
			}
		case 1:
			result := proxy.History[0]
			if result.At.IsZero() || result.Delay == nil {
				return nil, errors.New("proxy latency result has no time or delay")
			}
			reading.At, reading.Millis = result.At, *result.Delay
		default:
			return nil, errors.New("proxy latency entry has more than one result")
		}
		readings = append(readings, reading)
	}

	slices.SortFunc(readings, func(a, b LatencyReading) int { return cmp.Compare(a.Tag, b.Tag) })

	return readings, nil
}

// IsLatencyServer checks an exact tag without issuing a latency probe. A group
// can report its selected member's history and must not enable a manual check
// for a server with the group's tag.
func IsLatencyServer(ctx context.Context, source LatencySource, tag string) (bool, error) {
	if tag == "" {
		return false, errors.New("proxy latency target has no tag")
	}

	path := "/proxies/" + url.PathEscape(tag)
	raw, err := source.Snapshot(ctx, path)
	if err != nil {
		return false, fmt.Errorf("read proxy latency target: %w", err)
	}

	var target struct {
		latencyProxy
		Name string `json:"name"`
	}
	if err := json.Unmarshal(raw, &target); err != nil {
		return false, fmt.Errorf("parse proxy latency target: %w", err)
	}
	if target.Name != tag || target.Type == "" {
		return false, errors.New("proxy latency response does not identify the requested target")
	}

	return target.server(), nil
}

func (proxy latencyProxy) server() bool {
	switch proxy.Type {
	case "Direct", "Reject", "Block", "DNS", "Selector", "URLTest", "Fallback":
		return false
	default:
		return proxy.All == nil
	}
}
