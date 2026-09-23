// Package history копит историю рантайма на стороне демона.
//
// Панель держит в памяти вкладки только последнюю минуту, и после перезагрузки
// страницы график начинается заново. История нужна за всё время работы демона,
// а хранить её негде, кроме него самого: поток `/traffic` отдаёт скорость за
// секунду и назад не мотает.
//
// Окно не скользящее: заполненное кольцо не выбрасывает старые точки, а
// укрупняет шаг вдвое, сливая соседние. График всегда покрывает всё время
// работы демона, а память остаётся в границах — цена в том, что чем дольше
// работает демон, тем грубее давние участки.
//
// Буфер живёт в памяти: запись на флеш роутера ради графика не стоит его
// ресурса, а перезапуск демона историю обнуляет — так же, как счётчики b4.
package history

import "sync"

// ring — кольцо точек с укрупнением шага.
type ring[T any] struct {
	points []T
	first  int
	filled int
}

// push кладёт точку. Заполненное кольцо сначала сливает соседние точки попарно
// и освобождает половину места; в этом случае возвращается true — вызывающий
// удваивает шаг.
func (r *ring[T]) push(point T, merge func(older, newer T) T) bool {
	if len(r.points) == 0 {
		return false
	}

	compacted := false

	if r.filled == len(r.points) {
		r.compact(merge)
		compacted = true
	}

	r.points[(r.first+r.filled)%len(r.points)] = point
	r.filled++

	return compacted
}

// compact сливает соседние точки попарно, оставляя половину. После него данные
// лежат с начала буфера.
func (r *ring[T]) compact(merge func(older, newer T) T) {
	merged := make([]T, 0, r.filled/2)

	for index := 0; index+1 < r.filled; index += 2 {
		older := r.points[(r.first+index)%len(r.points)]
		newer := r.points[(r.first+index+1)%len(r.points)]
		merged = append(merged, merge(older, newer))
	}

	copy(r.points, merged)
	r.first = 0
	r.filled = len(merged)
}

func (r *ring[T]) all() []T {
	points := make([]T, 0, r.filled)
	for index := range r.filled {
		points = append(points, r.points[(r.first+index)%len(r.points)])
	}

	return points
}

// Point — средняя скорость за шаг, байт в секунду.
type Point struct {
	Down int64 `json:"down"`
	Up   int64 `json:"up"`
}

// DevicePoint — показания платы и процессов за шаг.
//
// Загрузка и температура берутся пиком шага, память — средним. История нужна,
// чтобы заметить перегрев и утечку за дни работы, а при укрупнении шага среднее
// растворило бы короткий перегрев в соседних спокойных минутах.
type DevicePoint struct {
	// Load — средняя загрузка за минуту, как её отдаёт ядро; пик шага.
	Load float64 `json:"load"`
	// Celsius — самая горячая зона платы, пик шага; ноль означает, что зон нет.
	Celsius float64 `json:"celsius"`
	// Memory — занятая память платы в байтах.
	Memory int64 `json:"memory"`
	// Singbox — резидентная память процесса sing-box в байтах; ноль — процесс
	// не найден. По ней и видна утечка: память платы в целом её размывает.
	Singbox int64 `json:"singbox"`
	// Daemon — резидентная память самого демона в байтах.
	Daemon int64 `json:"daemon"`
}

// Traffic — история трафика.
//
// Шаг считается снятиями, а не часами: часов у роутера до синхронизации NTP
// нет — они прыгают, и время точки по ним не восстановить.
type Traffic struct {
	mu sync.Mutex

	perPoint    int
	stepSeconds int
	ring        ring[Point]

	sumDown int64
	sumUp   int64
	counted int
}

// New собирает историю трафика: `perPoint` снятий на точку, `stepSeconds`
// секунд между точками, `points` точек до первого укрупнения шага.
func New(perPoint, stepSeconds, points int) *Traffic {
	return &Traffic{perPoint: perPoint, stepSeconds: stepSeconds, ring: ring[Point]{points: make([]Point, points)}}
}

// Record принимает сэмпл потока: скорость за секунду.
func (t *Traffic) Record(up, down int64) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.sumUp += up
	t.sumDown += down
	t.counted++

	if t.counted < t.perPoint {
		return
	}

	point := Point{Down: t.sumDown / int64(t.counted), Up: t.sumUp / int64(t.counted)}
	t.sumDown, t.sumUp, t.counted = 0, 0, 0

	if t.ring.push(point, mergePoints) {
		t.stepSeconds *= 2
	}
}

func mergePoints(older, newer Point) Point {
	return Point{Down: (older.Down + newer.Down) / 2, Up: (older.Up + newer.Up) / 2}
}

// Points отдаёт историю от старой точки к новой.
func (t *Traffic) Points() []Point {
	t.mu.Lock()
	defer t.mu.Unlock()

	return t.ring.all()
}

// Step отдаёт текущий шаг между точками в секундах: он растёт вместе с
// временем работы демона.
func (t *Traffic) Step() int {
	t.mu.Lock()
	defer t.mu.Unlock()

	return t.stepSeconds
}

// Device — история показаний платы тем же шагом, что и трафик.
type Device struct {
	mu sync.Mutex

	perPoint int
	ring     ring[DevicePoint]

	step    DevicePoint
	counted int64
}

// NewDevice собирает историю платы: `perPoint` снятий на точку, `points` точек
// до первого укрупнения шага.
func NewDevice(perPoint, points int) *Device {
	return &Device{perPoint: perPoint, ring: ring[DevicePoint]{points: make([]DevicePoint, points)}}
}

// Record принимает снятие показаний.
func (d *Device) Record(sample DevicePoint) {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.step.Load = max(d.step.Load, sample.Load)
	d.step.Celsius = max(d.step.Celsius, sample.Celsius)
	d.step.Memory += sample.Memory
	d.step.Singbox += sample.Singbox
	d.step.Daemon += sample.Daemon
	d.counted++

	if d.counted < int64(d.perPoint) {
		return
	}

	point := DevicePoint{
		Load:    d.step.Load,
		Celsius: d.step.Celsius,
		Memory:  d.step.Memory / d.counted,
		Singbox: d.step.Singbox / d.counted,
		Daemon:  d.step.Daemon / d.counted,
	}
	d.step, d.counted = DevicePoint{}, 0

	d.ring.push(point, mergeDevicePoints)
}

func mergeDevicePoints(older, newer DevicePoint) DevicePoint {
	return DevicePoint{
		Load:    max(older.Load, newer.Load),
		Celsius: max(older.Celsius, newer.Celsius),
		Memory:  (older.Memory + newer.Memory) / 2,
		Singbox: (older.Singbox + newer.Singbox) / 2,
		Daemon:  (older.Daemon + newer.Daemon) / 2,
	}
}

// Points отдаёт показания от старых к новым.
func (d *Device) Points() []DevicePoint {
	d.mu.Lock()
	defer d.mu.Unlock()

	return d.ring.all()
}
