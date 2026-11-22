package history_test

import (
	"testing"
	"testing/synctest"
	"time"

	"metabox/internal/history"
)

func proxyFlow(id string, bytes int64) history.Flow {
	return history.Flow{ID: id, Kind: history.KindProxy, Bytes: bytes}
}

func directFlow(id string, bytes int64) history.Flow {
	return history.Flow{ID: id, Kind: history.KindDirect, Bytes: bytes}
}

func TestVolumeSplitsLiveConnections(t *testing.T) {
	volume := &history.Volume{}

	volume.Observe(300, []history.Flow{proxyFlow("a", 100), directFlow("b", 200)})
	volume.Observe(700, []history.Flow{proxyFlow("a", 400), directFlow("b", 300)})

	if got, want := volume.Split(), (history.Split{Proxy: 300, Direct: 100}); got != want {
		t.Errorf("split: got %+v, want %+v", got, want)
	}
}

// A connection that appears after the previous snapshot brings all its bytes:
// it opened in this interval.
func TestVolumeCountsNewConnectionFromZero(t *testing.T) {
	volume := &history.Volume{}

	volume.Observe(0, nil)
	volume.Observe(500, []history.Flow{directFlow("a", 500)})

	if got, want := volume.Split(), (history.Split{Direct: 500}); got != want {
		t.Errorf("split: got %+v, want %+v", got, want)
	}
}

// The process total grew by more than the live connections moved: the rest belongs to
// a connection that opened and closed between the snapshots and is not lost.
func TestVolumeKeepsConnectionBetweenSnapshots(t *testing.T) {
	volume := &history.Volume{}

	volume.Observe(1000, []history.Flow{proxyFlow("a", 600), directFlow("b", 400)})
	volume.Observe(1400, []history.Flow{proxyFlow("a", 750), directFlow("b", 450)})

	split := volume.Split()
	if total := split.Proxy + split.Direct + split.Block; total != 400 {
		t.Fatalf("split adds up to %d, want the process increment 400: %+v", total, split)
	}

	// 200 bytes are not on live connections and go by the interval's weights 150:50.
	if want := (history.Split{Proxy: 300, Direct: 100}); split != want {
		t.Errorf("split: got %+v, want %+v", split, want)
	}
}

// The tail a connection sent after the last snapshot before closing goes to its kind.
func TestVolumeGivesClosedConnectionItsTail(t *testing.T) {
	volume := &history.Volume{}

	volume.Observe(20, []history.Flow{directFlow("a", 10), proxyFlow("b", 10)})
	volume.Observe(50, []history.Flow{directFlow("a", 20), proxyFlow("b", 30)})
	volume.Observe(55, []history.Flow{proxyFlow("b", 30)})

	if got, want := volume.Split(), (history.Split{Proxy: 20, Direct: 15}); got != want {
		t.Errorf("split: got %+v, want %+v", got, want)
	}
}

// An interval with nothing moving has no weights: its remainder waits for the next one.
func TestVolumeCarriesUnweightedRemainder(t *testing.T) {
	volume := &history.Volume{}

	volume.Observe(100, []history.Flow{proxyFlow("a", 100)})
	volume.Observe(100, []history.Flow{proxyFlow("a", 100)})
	volume.Observe(130, []history.Flow{proxyFlow("a", 100)})

	if got := volume.Split(); got != (history.Split{}) {
		t.Fatalf("split before a weighted interval: got %+v", got)
	}

	volume.Observe(140, []history.Flow{directFlow("b", 10), proxyFlow("a", 100)})

	if got, want := volume.Split(), (history.Split{Direct: 40}); got != want {
		t.Errorf("split: got %+v, want %+v", got, want)
	}
}

// The daemon starts with a zero split whatever the process already passed: a
// restart resets the volumes, the first snapshot is only a baseline.
func TestVolumeStartsFromBaseline(t *testing.T) {
	volume := &history.Volume{}

	volume.Observe(9_000_000, []history.Flow{proxyFlow("a", 5_000_000), directFlow("b", 4_000_000)})

	if got := volume.Split(); got != (history.Split{}) {
		t.Errorf("split after the first snapshot: got %+v, want zero", got)
	}
}

// A total that went down means sing-box restarted: the snapshot is a new baseline,
// and what was accumulated stays.
func TestVolumeRebasesOnProcessRestart(t *testing.T) {
	volume := &history.Volume{}

	volume.Observe(100, []history.Flow{proxyFlow("a", 100)})
	volume.Observe(200, []history.Flow{proxyFlow("a", 200)})
	volume.Observe(50, []history.Flow{directFlow("c", 50)})
	volume.Observe(80, []history.Flow{directFlow("c", 80)})

	if got, want := volume.Split(), (history.Split{Proxy: 100, Direct: 30}); got != want {
		t.Errorf("split: got %+v, want %+v", got, want)
	}
}

func TestVolumeReconcilesOutboundRowsAndRetainsKindTotals(t *testing.T) {
	const m = 1 << 20
	var volume history.Volume

	volume.Observe(0, nil)
	volume.Observe(50*m, []history.Flow{
		{ID: "proxy", Kind: history.KindProxy, Outbound: "group", Server: "server", Bytes: 30 * m},
		{ID: "direct", Kind: history.KindDirect, Outbound: "direct", Bytes: 20 * m},
	})

	traffic := volume.Traffic()
	want := history.Split{Proxy: 30 * m, Direct: 20 * m}
	if traffic.Split != want || traffic.Outbounds["group"].Bytes != want.Proxy || traffic.Outbounds["direct"].Bytes != want.Direct {
		t.Fatalf("outbound volumes: got %+v, want 30 MiB proxy and 20 MiB direct through the core", traffic)
	}
	if len(traffic.Servers) != 1 || traffic.Servers["server"].Bytes != want.Proxy {
		t.Fatalf("server volumes: got %+v, want only the proxy server with 30 MiB", traffic.Servers)
	}
	const wan = 100 * m
	if bypass := wan - traffic.Split.Proxy - traffic.Split.Direct; bypass != 50*m {
		t.Errorf("WAN bytes outside the core: got %d, want %d", bypass, 50*m)
	}

	volume.ObserveTraffic(50*m, nil, map[string]struct{}{"direct": {}})
	traffic = volume.Traffic()
	if traffic.Split != want || len(traffic.Outbounds) != 1 || traffic.Outbounds["direct"].Bytes != want.Direct || len(traffic.Servers) != 0 {
		t.Fatalf("volumes after removing the proxy: got %+v, want kind totals retained and only the direct row", traffic)
	}
	volume.Observe(53*m, []history.Flow{
		{ID: "proxy-back", Kind: history.KindProxy, Outbound: "group", Server: "server", Bytes: 3 * m},
	})
	if got := volume.Traffic(); got.Outbounds["group"].Bytes != 3*m || got.Servers["server"].Bytes != 3*m {
		t.Errorf("returning tags: got %+v, want fresh 3 MiB counters", got)
	}
}

func TestVolumeSpreadsRemainderWithinKindAndSeparatesDefaultRule(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		var volume history.Volume
		volume.Observe(0, nil)
		time.Sleep(2 * time.Second)

		volume.Observe(11, []history.Flow{
			{ID: "a", Kind: history.KindProxy, Outbound: "group", Server: "one", Bytes: 2},
			{ID: "b", Kind: history.KindProxy, Outbound: "group", Server: "two", Final: true, Bytes: 1},
			{ID: "c", Kind: history.KindDirect, Outbound: "direct", Bytes: 2},
		})

		traffic := volume.Traffic()
		group := traffic.Outbounds["group"]
		if group.Final == nil {
			t.Fatal("default-rule traffic is missing")
		}
		if group.Bytes != 5 || group.Final.Bytes != 2 || traffic.Outbounds["direct"].Bytes != 4 ||
			traffic.Split != (history.Split{Proxy: 7, Direct: 4}) {
			t.Errorf("weighted distribution: got %+v, default %+v", traffic, group.Final)
		}
		if group.Rate != 2.5 || group.Final.Rate != 1 ||
			group.Origin != "computed" || group.Final.Origin != "computed" ||
			traffic.Servers["one"].Bytes != 5 || traffic.Servers["two"].Bytes != 2 {
			t.Errorf("rates, origins or server allocation: got %+v, default %+v", traffic, group.Final)
		}

		time.Sleep(time.Second)
		volume.Observe(11, nil)
		if got := volume.Traffic(); got.Outbounds["group"].Rate != 0 || got.Outbounds["group"].Bytes != 5 {
			t.Errorf("idle interval: got %+v, want zero rate with retained total", got)
		}
	})
}

func TestVolumeRebasesOutboundRowsWhenProcessTotalDecreases(t *testing.T) {
	var volume history.Volume
	volume.Observe(0, nil)
	volume.Observe(15, []history.Flow{{ID: "a", Kind: history.KindProxy, Outbound: "group", Bytes: 15}})
	volume.Observe(5, []history.Flow{{ID: "b", Kind: history.KindProxy, Outbound: "group", Bytes: 5}})
	volume.Observe(20, []history.Flow{{ID: "b", Kind: history.KindProxy, Outbound: "group", Bytes: 20}})
	if got := volume.Traffic(); got.Split.Proxy != 30 || got.Outbounds["group"].Bytes != 30 {
		t.Errorf("process restart: got %+v, want 30 bytes after skipping the new baseline", got)
	}

	if got := (&history.Volume{}).Traffic(); got.Split != (history.Split{}) || len(got.Outbounds) != 0 || len(got.Servers) != 0 {
		t.Errorf("daemon restart: got %+v, want empty counters", got)
	}
}

func TestVolumeKeepsPreviouslyUnattributedBytesOutOfCurrentRate(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		const missed = 100 << 20
		var volume history.Volume

		volume.Observe(0, nil)
		time.Sleep(time.Second)
		volume.Observe(missed, nil)
		time.Sleep(time.Second)
		volume.Observe(missed+2, []history.Flow{
			{ID: "current", Kind: history.KindProxy, Outbound: "group", Server: "server", Bytes: 1},
		})

		traffic := volume.Traffic()
		if row := traffic.Outbounds["group"]; row.Bytes != missed+2 || row.Rate != 2 {
			t.Errorf("outbound: got %+v, want %d cumulative bytes and 2 bytes/s", row, missed+2)
		}
		if row := traffic.Servers["server"]; row.Bytes != missed+2 || row.Rate != 2 {
			t.Errorf("server: got %+v, want %d cumulative bytes and 2 bytes/s", row, missed+2)
		}
	})
}
