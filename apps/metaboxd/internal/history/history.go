// Package history копит историю трафика на стороне демона.
//
// Панель держит в памяти вкладки только последнюю минуту, и после перезагрузки
// страницы график начинается заново. История нужна глубже, а хранить её негде,
// кроме демона: поток `/traffic` отдаёт скорость за секунду и назад не мотает.
//
// Буфер кольцевой и живёт в памяти: запись на флеш роутера ради графика не
// стоит его ресурса, а перезапуск демона историю обнуляет — это то же, что
// делает b4 со своими счётчиками.
package history

import "sync"

// Point — средняя скорость за шаг, байт в секунду.
type Point struct {
	Down int64 `json:"down"`
	Up   int64 `json:"up"`
}

// Traffic — кольцо точек фиксированного шага.
//
// Шаг считается сэмплами, а не часами: форк шлёт ровно один сэмпл в секунду, а
// часов у роутера до синхронизации NTP нет — они прыгают, и время точки по ним
// восстановить нельзя.
type Traffic struct {
	mu sync.Mutex

	// step — сколько сэмплов усредняется в одну точку.
	step int
	// points — кольцо, samples — сколько точек в нём занято.
	points []Point
	first  int
	filled int

	sumDown int64
	sumUp   int64
	counted int
}

// New собирает кольцо на `points` точек по `step` сэмплов в каждой.
func New(step, points int) *Traffic {
	return &Traffic{step: step, points: make([]Point, points)}
}

// Record принимает сэмпл потока: скорость за секунду.
func (t *Traffic) Record(up, down int64) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.sumUp += up
	t.sumDown += down
	t.counted++

	if t.counted < t.step {
		return
	}

	t.push(Point{Down: t.sumDown / int64(t.counted), Up: t.sumUp / int64(t.counted)})
	t.sumDown, t.sumUp, t.counted = 0, 0, 0
}

// push кладёт точку в кольцо, вытесняя самую старую. Вызывается под t.mu.
func (t *Traffic) push(point Point) {
	if len(t.points) == 0 {
		return
	}

	if t.filled < len(t.points) {
		t.points[(t.first+t.filled)%len(t.points)] = point
		t.filled++

		return
	}

	t.points[t.first] = point
	t.first = (t.first + 1) % len(t.points)
}

// Points отдаёт историю от старой точки к новой.
func (t *Traffic) Points() []Point {
	t.mu.Lock()
	defer t.mu.Unlock()

	points := make([]Point, 0, t.filled)
	for index := range t.filled {
		points = append(points, t.points[(t.first+index)%len(t.points)])
	}

	return points
}

// Step отдаёт шаг точки в сэмплах: у потока это секунды.
func (t *Traffic) Step() int {
	return t.step
}
