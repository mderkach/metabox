package history_test

import (
	"slices"
	"testing"

	"metabox/internal/history"
)

// Each ring keeps its own step: the merged reader must not mix them up.
func TestRuntimeMergesRings(t *testing.T) {
	traffic := history.New(1, 10, 4)
	device := history.NewDevice(1, 20, 4)
	connections := &history.Connections{}

	traffic.Record(100, 200)
	device.Record(history.DevicePoint{Load: 0.5, Memory: 1024})
	connections.Record(7)

	runtime := history.NewRuntime(traffic, device, connections)

	if runtime.Step() != 10 || runtime.DeviceStep() != 20 {
		t.Errorf("steps %d and %d, expected 10 for traffic and 20 for the board", runtime.Step(), runtime.DeviceStep())
	}
	if got := runtime.Device(); len(got) != 1 || got[0].Memory != 1024 {
		t.Errorf("board readings %+v", got)
	}
	if got := runtime.Connections(); !slices.Equal(got, connections.Recent()) || len(got) == 0 {
		t.Errorf("connections %v, expected %v", got, connections.Recent())
	}
	if len(runtime.Points()) != len(traffic.Points()) {
		t.Errorf("traffic %d points, expected %d", len(runtime.Points()), len(traffic.Points()))
	}
}
