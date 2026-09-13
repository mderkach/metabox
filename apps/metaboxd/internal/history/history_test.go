package history_test

import (
	"testing"

	"metabox/internal/history"
)

func TestTrafficAveragesStep(t *testing.T) {
	traffic := history.New(2, 4)

	traffic.Record(10, 100)
	traffic.Record(30, 300)

	points := traffic.Points()
	if len(points) != 1 {
		t.Fatalf("точек: получили %d, ожидали 1", len(points))
	}

	if points[0].Up != 20 || points[0].Down != 200 {
		t.Errorf("среднее за шаг: получили %+v", points[0])
	}
}

// Неполный шаг в историю не попадает: иначе последняя точка была бы посчитана
// по одному сэмплу и провалилась бы вниз на каждом запросе.
func TestTrafficKeepsPartialStepOut(t *testing.T) {
	traffic := history.New(3, 4)

	traffic.Record(10, 100)
	traffic.Record(10, 100)

	if got := len(traffic.Points()); got != 0 {
		t.Errorf("точек: получили %d, ожидали 0", got)
	}
}

func TestTrafficDropsOldest(t *testing.T) {
	traffic := history.New(1, 3)

	for value := range int64(5) {
		traffic.Record(value, value*10)
	}

	points := traffic.Points()
	if len(points) != 3 {
		t.Fatalf("точек: получили %d, ожидали 3", len(points))
	}

	// В кольце остаются последние три: 2, 3 и 4.
	if points[0].Up != 2 || points[2].Up != 4 {
		t.Errorf("порядок точек: получили %+v", points)
	}
}
