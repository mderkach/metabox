package history_test

import (
	"testing"

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
