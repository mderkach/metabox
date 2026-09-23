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

	device.Record(history.DevicePoint{Load: 0.5, Celsius: 40, Memory: 100, Singbox: 10, Daemon: 1})
	device.Record(history.DevicePoint{Load: 1.5, Celsius: 44, Memory: 300, Singbox: 30, Daemon: 3})

	points := device.Points()
	if len(points) != 2 || points[0].Load != 0.5 || points[1].Memory != 300 || points[1].Singbox != 30 {
		t.Errorf("показания платы: получили %+v", points)
	}
}

// Перегрев на одно снятие из шага не должен раствориться в соседних: история
// нужна, чтобы его заметить.
func TestDeviceKeepsPeaksAndAveragesMemory(t *testing.T) {
	device := history.NewDevice(2, 2)

	device.Record(history.DevicePoint{Load: 0.2, Celsius: 40, Memory: 100, Singbox: 10})
	device.Record(history.DevicePoint{Load: 3.5, Celsius: 90, Memory: 300, Singbox: 30})
	device.Record(history.DevicePoint{Load: 0.1, Celsius: 41, Memory: 100, Singbox: 10})
	device.Record(history.DevicePoint{Load: 0.1, Celsius: 41, Memory: 100, Singbox: 10})
	// Кольцо на две точки заполнено: следующая сливает их в одну.
	device.Record(history.DevicePoint{Load: 0.1, Celsius: 41, Memory: 100, Singbox: 10})
	device.Record(history.DevicePoint{Load: 0.1, Celsius: 41, Memory: 100, Singbox: 10})

	points := device.Points()
	if len(points) != 2 {
		t.Fatalf("точек %d, ожидали 2: %+v", len(points), points)
	}
	if points[0].Load != 3.5 || points[0].Celsius != 90 {
		t.Errorf("пик шага растворился при слиянии: %+v", points[0])
	}
	if points[0].Memory != 150 || points[0].Singbox != 15 {
		t.Errorf("память шага и слияния — среднее: %+v", points[0])
	}
}
