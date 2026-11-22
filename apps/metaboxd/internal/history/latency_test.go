package history_test

import (
	"fmt"
	"testing"
	"time"

	"metabox/internal/history"
)

func TestLatencyWaitsForManualCheckAfterEachCoreStart(t *testing.T) {
	at := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	latency := history.NewLatency()
	latency.SetEpoch("first")
	latency.Observe("first", at, delaySample(at, 120))

	row := latencyRow(t, latency, at, "server")
	if row.Current != nil || row.Level != history.LatencyNoMeasurement || len(row.Recent) != 1 {
		t.Fatalf("automatic check before first manual check: %+v", row)
	}

	manual := at.Add(time.Minute)
	latency.RecordManual("first", "server", manual, 114, true)
	row = latencyRow(t, latency, manual, "server")
	if row.Current == nil || row.Current.DelayMS == nil || *row.Current.DelayMS != 114 {
		t.Fatalf("manual check did not update the current result: %+v", row)
	}

	latency.SetEpoch("second")
	afterRestart := at.Add(2 * time.Minute)
	latency.Observe("second", afterRestart, delaySample(afterRestart, 95))
	latency.RecordManual("first", "server", afterRestart, 19, true)

	row = latencyRow(t, latency, afterRestart, "server")
	if row.Current != nil || row.Level != history.LatencyNoMeasurement || len(row.Recent) != 3 {
		t.Fatalf("restart cleared history or exposed a result before the first manual check: %+v", row)
	}

	latency.RecordManual("second", "server", afterRestart.Add(time.Second), 0, false)
	row = latencyRow(t, latency, afterRestart.Add(time.Second), "server")
	if row.Current == nil || row.Current.DelayMS != nil || row.Level != history.LatencyNoAnswer {
		t.Fatalf("failed manual check was not distinguished from no measurement: %+v", row)
	}
}

func TestLatencyDoesNotTurnStalePollsOrRemovedServersIntoFailure(t *testing.T) {
	at := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	latency := history.NewLatency()
	latency.SetEpoch("running")
	latency.Observe("running", at, delaySample(at, 120))
	latency.RecordManual("running", "server", at.Add(time.Minute), 130, true)

	latency.Observe("running", at.Add(30*time.Second), map[string]*history.LatencySample{"server": nil})
	latency.Observe("running", at.Add(2*time.Minute), delaySample(at.Add(59*time.Second), 130))
	latency.Observe("running", at.Add(3*time.Minute), nil)
	latency.Observe("running", at.Add(4*time.Minute), delaySample(at.Add(5*time.Minute), 300))
	latency.Observe("running", at.Add(3*time.Minute), map[string]*history.LatencySample{"server": nil})
	row := latencyRow(t, latency, at.Add(4*time.Minute), "server")
	if len(row.Recent) != 2 || row.Current == nil || row.Current.DelayMS == nil || *row.Current.DelayMS != 130 {
		t.Fatalf("older, incomplete or future samples changed the latest manual result: %+v", row)
	}

	latency.SetEpoch("")
	latency.Observe("running", at.Add(5*time.Minute), map[string]*history.LatencySample{"server": nil})
	row = latencyRow(t, latency, at.Add(5*time.Minute), "server")
	if row.Current != nil || len(row.Recent) != 2 {
		t.Fatalf("an unknown process exposed a measurement or added a failure: %+v", row)
	}

	latency.SetEpoch("running")
	latency.Observe("running", at.Add(6*time.Minute), map[string]*history.LatencySample{"server": nil})
	latency.Observe("running", at.Add(7*time.Minute), map[string]*history.LatencySample{"server": nil})
	row = latencyRow(t, latency, at.Add(7*time.Minute), "server")
	if len(row.Recent) != 3 || row.Level != history.LatencyNoAnswer {
		t.Fatalf("a confirmed disappearance must be recorded exactly once: %+v", row)
	}

	latency.Observe("running", at.Add(8*time.Minute), map[string]*history.LatencySample{})
	if row := latencyRow(t, latency, at.Add(8*time.Minute), "server"); row.Current != nil || len(row.Recent) != 3 {
		t.Fatalf("removal fabricated a result or lost retained observations: %+v", row)
	}

	returned := at.Add(time.Hour)
	latency.Observe("running", returned, delaySample(returned, 102))
	row = latencyRow(t, latency, returned, "server")
	if row.Current != nil || len(row.Recent) != 1 || row.UsualMS != nil || row.Level != history.LatencyNoMeasurement {
		t.Fatalf("a returning server did not start a fresh current baseline: %+v", row)
	}
}

func TestLatencyUsesCompletedHourlyMediansAndThreeSlowChecks(t *testing.T) {
	at := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	latency := history.NewLatency()
	latency.SetEpoch("running")
	for minute, value := range []int{100, 110, 120} {
		seen := at.Add(time.Duration(minute) * time.Minute)
		latency.Observe("running", seen, delaySample(seen, value))
	}
	if row := latencyRow(t, latency, at.Add(time.Minute*20), "server"); row.UsualMS != nil || len(row.Hourly) != 0 {
		t.Fatalf("published a norm before the first hour completed: %+v", row)
	}

	for hour, value := range []int{100, 310} {
		seen := at.Add(time.Duration(hour+1) * time.Hour)
		latency.Observe("running", seen, delaySample(seen, value))
	}
	first := at.Add(3 * time.Hour)
	latency.RecordManual("running", "server", first, 80, true)
	latency.RecordManual("running", "server", first.Add(time.Second), 160, true)
	row := latencyRow(t, latency, first.Add(time.Second), "server")
	if len(row.Hourly) != 3 || row.UsualMS == nil || *row.UsualMS != 110 || row.Level != history.LatencyWithinNorm {
		t.Fatalf("an isolated slow result changed the level or norm: %+v", row)
	}

	for second := 2; second <= 3; second++ {
		seen := first.Add(time.Duration(second) * time.Second)
		latency.RecordManual("running", "server", seen, 160, true)
	}
	if row := latencyRow(t, latency, first.Add(3*time.Second), "server"); row.Level != history.LatencyAboveNorm {
		t.Fatalf("three consecutive slow checks did not change the level: %+v", row)
	}

	latency.RecordManual("running", "server", first.Add(4*time.Second), 1500, true)
	if row := latencyRow(t, latency, first.Add(4*time.Second), "server"); row.Level != history.LatencyAboveCeiling {
		t.Fatalf("absolute ceiling did not take precedence: %+v", row)
	}
}

func TestLatencyBoundsRetainedObservationsAndServers(t *testing.T) {
	at := time.Date(2026, 11, 21, 12, 0, 0, 0, time.UTC)
	latency := history.NewLatency()
	latency.SetEpoch("running")
	for hour := range 28 {
		seen := at.Add(time.Duration(hour) * time.Hour)
		latency.Observe("running", seen, delaySample(seen, 100+hour))
	}

	now := at.Add(28 * time.Hour)
	row := latencyRow(t, latency, now, "server")
	if len(row.Recent) != 10 || len(row.Hourly) != 24 || !row.Hourly[0].Hour.Equal(at.Add(4*time.Hour)) {
		t.Fatalf("history bounds: recent=%d hourly=%+v", len(row.Recent), row.Hourly)
	}

	listed := make(map[string]*history.LatencySample)
	for index := range history.MaxLatencyServers + 4 {
		listed[fmt.Sprintf("server-%04d", index)] = nil
	}
	latency.Observe("running", now, listed)
	latency.RecordManual("running", "server-4099", now.Add(time.Second), 98, true)
	rows := latency.Snapshot(now.Add(time.Second), nil)
	if len(rows) != history.MaxLatencyServers {
		t.Fatalf("server history count: got %d, want %d", len(rows), history.MaxLatencyServers)
	}
	if row := latencyRow(t, latency, now.Add(time.Second), "server-4099"); row.Current == nil {
		t.Fatal("a manual check outside the automatic cap did not get a row")
	}
}

func TestLatencyBoundsTheSamplesUsedForAnHourlyMedian(t *testing.T) {
	at := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	latency := history.NewLatency()
	latency.SetEpoch("running")
	// Rapid user checks must not make the open hour unbounded.
	for delay := range 66 {
		latency.RecordManual("running", "server", at.Add(time.Duration(delay)*time.Second), delay, true)
	}

	row := latencyRow(t, latency, at.Add(time.Hour), "server")
	if len(row.Hourly) != 1 || row.UsualMS == nil || *row.UsualMS != 33 {
		t.Fatalf("hourly median was not computed from the retained samples: %+v", row)
	}
}

func delaySample(at time.Time, delayMS int) map[string]*history.LatencySample {
	return map[string]*history.LatencySample{"server": {At: at, DelayMS: delayMS}}
}

func latencyRow(t *testing.T, latency *history.Latency, at time.Time, tag string) history.ServerLatency {
	t.Helper()
	for _, row := range latency.Snapshot(at, nil) {
		if row.Tag == tag {
			return row
		}
	}

	t.Fatalf("server %q was not included in history", tag)

	return history.ServerLatency{}
}

func TestLatencyAppliesManualNormWithoutLosingComputedNorm(t *testing.T) {
	at := time.Date(2026, time.November, 22, 12, 5, 0, 0, time.UTC)
	latency := history.NewLatency()
	latency.SetEpoch("core")
	latency.Observe("core", at, delaySample(at, 120))
	now := at.Add(time.Hour)
	for i := range 3 {
		latency.RecordManual("core", "server", now.Add(time.Duration(i)*time.Second), 100, true)
	}

	viewAt := now.Add(3 * time.Second)
	override := latency.Snapshot(viewAt, map[string]int{"server": 80})
	if len(override) != 1 {
		t.Fatalf("snapshots: %+v", override)
	}
	row := override[0]
	if row.Level != history.LatencyAboveNorm || row.UsualMS == nil || *row.UsualMS != 80 ||
		row.ComputedUsualMS == nil || *row.ComputedUsualMS != 120 {
		t.Errorf("manual norm and preserved baseline: %+v", row)
	}
	fallback := latencyRow(t, latency, viewAt, "server")
	if fallback.Level != history.LatencyWithinNorm || fallback.UsualMS == nil || *fallback.UsualMS != 120 {
		t.Errorf("after clearing manual norm: %+v", fallback)
	}
}
