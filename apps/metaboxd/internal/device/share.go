package device

import "sync"

// Meter копит приращение чужого счётчика.
//
// Счётчики устройства и Clash API накопительные, но стартуют от разных
// событий: один с подъёма линка, другой с запуска процесса. Сравнивать их
// можно только приращениями за одно окно, поэтому приращения копит демон, а
// не потребитель.
type Meter struct {
	mu    sync.Mutex
	seen  bool
	last  int64
	total int64
}

// Add прибавляет приращение, посчитанное снаружи. Так копится то, что источник
// отдаёт не счётчиком, а порцией за интервал.
func (m *Meter) Add(delta int64) {
	if delta <= 0 {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.total += delta
}

// Observe принимает текущее значение счётчика источника. Значение меньше
// прошлого означает, что источник перезапустился: тогда отсчёт начинается
// заново, а накопленное остаётся.
func (m *Meter) Observe(value int64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.seen && value >= m.last {
		m.total += value - m.last
	}

	m.seen = true
	m.last = value
}

// Rebase забывает прошлое значение, сохраняя накопленное: так счётчик нового
// источника не приедет в итог одним скачком.
func (m *Meter) Rebase() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.seen = false
	m.last = 0
}

// Total отдаёт накопленное приращение.
func (m *Meter) Total() int64 {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.total
}

// Share — сколько прошло через канал и через sing-box за время наблюдения.
// Доля считается делением одного на другое и осмысленна только вместе с
// Seconds: окно начинается, когда демон впервые снял показания.
type Share struct {
	Link    int64 `json:"link"`
	Proxy   int64 `json:"proxy"`
	Seconds int   `json:"seconds"`
}
