package history_test

import (
	"testing"

	"metabox/internal/history"
)

func TestTrafficAveragesStep(t *testing.T) {
	traffic := history.New(2, 10, 4)

	traffic.Record(10, 100)
	traffic.Record(30, 300)

	points := traffic.Points()
	if len(points) != 1 {
		t.Fatalf("points: got %d, expected 1", len(points))
	}

	if points[0].Up != 20 || points[0].Down != 200 {
		t.Errorf("average per step: got %+v", points[0])
	}
}

// An incomplete step does not get into the history: otherwise the last point would be counted
// from one sample and would dip down on every request.
func TestTrafficKeepsPartialStepOut(t *testing.T) {
	traffic := history.New(3, 10, 4)

	traffic.Record(10, 100)
	traffic.Record(10, 100)

	if got := len(traffic.Points()); got != 0 {
		t.Errorf("points: got %d, expected 0", got)
	}
}

// A filled ring does not drop the old but merges neighbouring points and
// doubles the step: the chart must cover the whole daemon runtime.
func TestTrafficWidensStep(t *testing.T) {
	traffic := history.New(1, 10, 4)

	for value := range int64(4) {
		traffic.Record(value, 0)
	}

	if got := traffic.Step(); got != 10 {
		t.Fatalf("step before filling: got %d, expected 10", got)
	}

	traffic.Record(4, 0)

	if got := traffic.Step(); got != 20 {
		t.Errorf("step after coarsening: got %d, expected 20", got)
	}

	points := traffic.Points()
	if len(points) != 3 {
		t.Fatalf("points: got %d, expected 3", len(points))
	}

	// Pairs 0+1 and 2+3 merged into averages, the fifth point lay after them.
	if points[0].Up != 0 || points[1].Up != 2 || points[2].Up != 4 {
		t.Errorf("point merge: got %+v", points)
	}
}

func TestDeviceKeepsOrder(t *testing.T) {
	device := history.NewDevice(1, 3)

	device.Record(history.DevicePoint{Load: 0.5, Celsius: 40, Memory: 100, Singbox: 10, Daemon: 1})
	device.Record(history.DevicePoint{Load: 1.5, Celsius: 44, Memory: 300, Singbox: 30, Daemon: 3})

	points := device.Points()
	if len(points) != 2 || points[0].Load != 0.5 || points[1].Memory != 300 || points[1].Singbox != 30 {
		t.Errorf("board readings: got %+v", points)
	}
}

// An overheating of one reading from a step must not dissolve among the neighbours: the history
// is needed to notice it.
func TestDeviceKeepsPeaksAndAveragesMemory(t *testing.T) {
	device := history.NewDevice(2, 2)

	device.Record(history.DevicePoint{Load: 0.2, Celsius: 40, Memory: 100, Singbox: 10})
	device.Record(history.DevicePoint{Load: 3.5, Celsius: 90, Memory: 300, Singbox: 30})
	device.Record(history.DevicePoint{Load: 0.1, Celsius: 41, Memory: 100, Singbox: 10})
	device.Record(history.DevicePoint{Load: 0.1, Celsius: 41, Memory: 100, Singbox: 10})
	// The two-point ring is full: the next one merges them into one.
	device.Record(history.DevicePoint{Load: 0.1, Celsius: 41, Memory: 100, Singbox: 10})
	device.Record(history.DevicePoint{Load: 0.1, Celsius: 41, Memory: 100, Singbox: 10})

	points := device.Points()
	if len(points) != 2 {
		t.Fatalf("points %d, expected 2: %+v", len(points), points)
	}
	if points[0].Load != 3.5 || points[0].Celsius != 90 {
		t.Errorf("the step peak dissolved on merge: %+v", points[0])
	}
	if points[0].Memory != 150 || points[0].Singbox != 15 {
		t.Errorf("memory of the step and of the merge is the average: %+v", points[0])
	}
}

// The minute chart takes the last samples as is: the daemon holds them while the panel is
// closed, and returns exactly a minute.
func TestTrafficKeepsLastMinuteRaw(t *testing.T) {
	traffic := history.New(10, 10, 4)

	for value := range int64(history.RecentPoints + 5) {
		traffic.Record(value, value*10)
	}

	recent := traffic.Recent()
	if len(recent) != history.RecentPoints || recent[0].Up != 5 || recent[len(recent)-1].Down != 640 {
		t.Errorf("last minute: got %d points, first %+v, last %+v", len(recent), recent[0], recent[len(recent)-1])
	}
}

func TestConnectionsKeepLastMinute(t *testing.T) {
	var connections history.Connections

	for count := range history.RecentPoints + 3 {
		connections.Record(count)
	}

	recent := connections.Recent()
	if len(recent) != history.RecentPoints || recent[0] != 3 {
		t.Errorf("last minute of connections: got %d points, first %d", len(recent), recent[0])
	}
}
