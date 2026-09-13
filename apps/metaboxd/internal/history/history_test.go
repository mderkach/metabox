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
		t.Fatalf("точек: получили %d, ожидали 1", len(points))
	}

	if points[0].Up != 20 || points[0].Down != 200 {
		t.Errorf("среднее за шаг: получили %+v", points[0])
	}
}

// Неполный шаг в историю не попадает: иначе последняя точка была бы посчитана
// по одному сэмплу и провалилась бы вниз на каждом запросе.
func TestTrafficKeepsPartialStepOut(t *testing.T) {
	traffic := history.New(3, 10, 4)

	traffic.Record(10, 100)
	traffic.Record(10, 100)

	if got := len(traffic.Points()); got != 0 {
		t.Errorf("точек: получили %d, ожидали 0", got)
	}
}

// Заполненное кольцо не выбрасывает старое, а сливает соседние точки и
// удваивает шаг: график обязан покрывать всё время работы демона.
func TestTrafficWidensStep(t *testing.T) {
	traffic := history.New(1, 10, 4)

	for value := range int64(4) {
		traffic.Record(value, 0)
	}

	if got := traffic.Step(); got != 10 {
		t.Fatalf("шаг до заполнения: получили %d, ожидали 10", got)
	}

	traffic.Record(4, 0)

	if got := traffic.Step(); got != 20 {
		t.Errorf("шаг после укрупнения: получили %d, ожидали 20", got)
	}

	points := traffic.Points()
	if len(points) != 3 {
		t.Fatalf("точек: получили %d, ожидали 3", len(points))
	}

	// Пары 0+1 и 2+3 слились в средние, пятая точка легла следом.
	if points[0].Up != 0 || points[1].Up != 2 || points[2].Up != 4 {
		t.Errorf("слияние точек: получили %+v", points)
	}
}

func TestDeviceKeepsOrder(t *testing.T) {
	device := history.NewDevice(1, 3)

	device.Record(0.5, 40, 100)
	device.Record(1.5, 44, 300)

	points := device.Points()
	if len(points) != 2 || points[0].Load != 0.5 || points[1].Memory != 300 {
		t.Errorf("показания платы: получили %+v", points)
	}
}
