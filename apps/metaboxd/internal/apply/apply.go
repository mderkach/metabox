// Package apply проводит конфиг через протокол применения ADR-0002: проверка
// кандидата бинарём, бэкап, запись, рестарт сервиса, healthcheck, окно
// подтверждения и автооткат, если подтверждения не было.
//
// Содержимое конфига пакет не разбирает: он оркестратор, а решения о байтах
// принимают config и clashapi.
package apply

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"sync"
	"time"

	"metabox/internal/clashapi"
)

// Phase — стадия транзакции. Значения уезжают в API и на диск, поэтому
// переименование любой из них ломает и клиента, и доигрывание после
// перезагрузки.
type Phase string

const (
	// PhaseApplying — состояние записано, конфиг применяется. Обрыв на этой
	// стадии означает откат при следующем старте.
	PhaseApplying Phase = "applying"
	// PhaseAwaitingConfirm — сервис поднялся, идёт окно подтверждения.
	PhaseAwaitingConfirm Phase = "awaiting_confirm"
	// PhaseConfirmed — пользователь подтвердил, что связь жива.
	PhaseConfirmed Phase = "confirmed"
	// PhaseRolledBack — предыдущий конфиг возвращён.
	PhaseRolledBack Phase = "rolled_back"
	// PhaseFailed — применение не дошло до конца, причина в Reason.
	PhaseFailed Phase = "failed"
)

// Transaction — снимок применения. Он же формат файла состояния: то, что
// демон отдаёт клиенту, и то, по чему доигрывает себя после перезагрузки.
type Transaction struct {
	ID    string `json:"id"`
	Phase Phase  `json:"phase"`
	// Window — сколько осталось на подтверждение. Хранится длительностью, а не
	// меткой времени: у роутера нет часов реального времени, после включения он
	// стартует с эпохи и прыгает при синхронизации NTP (ADR-0002).
	Window time.Duration `json:"window"`
	// Sum — sha256 конфига, записанного демоном. По нему ловится правка файла
	// извне.
	Sum string `json:"sha256,omitempty"`
	// Reason заполняется, когда применение не дошло до конца.
	Reason string `json:"reason,omitempty"`
	// ClashAPIAdded отмечает, что демон сам добавил секцию (AC-32).
	ClashAPIAdded bool `json:"clash_api_added,omitempty"`
}

// Active отвечает, идёт ли применение прямо сейчас.
func (t Transaction) Active() bool {
	return t.Phase == PhaseApplying || t.Phase == PhaseAwaitingConfirm
}

var (
	// ErrBusy — второе применение при активной транзакции. Это ошибка
	// контракта, а не гонка за файл: у конфига один владелец.
	ErrBusy = errors.New("применение уже идёт")

	// ErrUnknownTransaction — идентификатор не совпадает с активной транзакцией.
	ErrUnknownTransaction = errors.New("транзакции с таким идентификатором нет")

	// ErrNothingToConfirm — подтверждать нечего: окно уже закрыто.
	ErrNothingToConfirm = errors.New("подтверждать нечего")

	// ErrConfigModified — конфиг правили в обход демона. Затирать такую правку
	// молча нельзя: её мог сделать владелец по SSH.
	ErrConfigModified = errors.New("файл конфига изменён вне metabox")
)

// Store — файлы, которыми владеет config.Store. Интерфейс объявлен здесь,
// у потребителя, и содержит только то, что нужно применению.
type Store interface {
	Sum(ctx context.Context) (string, error)
	Write(ctx context.Context, data []byte) error
	Backup(ctx context.Context) error
	Restore(ctx context.Context) error
	StageCandidate(ctx context.Context, dst string, data []byte) error
	ReadState(ctx context.Context) ([]byte, error)
	WriteState(ctx context.Context, data []byte) error
	ClearState(ctx context.Context) error
}

// Service — бинарь sing-box и его сервис.
type Service interface {
	Check(ctx context.Context, dir string) error
	Restart(ctx context.Context) error
}

// Health ждёт, пока Clash API поднимется после рестарта.
type Health interface {
	Wait(ctx context.Context, settings clashapi.Settings) error
}

// Clock отдаёт срабатывание окна подтверждения. Отдельная зависимость, а не
// прямой вызов time: иначе проверка автоотката превращается в минуту сна.
type Clock interface {
	After(d time.Duration) <-chan time.Time
}

// SystemClock — часы поверх пакета time.
type SystemClock struct{}

// After отдаёт канал, срабатывающий через d.
func (SystemClock) After(d time.Duration) <-chan time.Time {
	return time.After(d)
}

// Options — настройки применения, приходящие в демон флагами.
type Options struct {
	// Window — окно подтверждения. NFR-5 задаёт 60 секунд.
	Window time.Duration
	// ClashPort — порт, который демон пропишет в external_controller, если
	// секции нет.
	ClashPort int
	// CycleTimeout ограничивает шаги от бэкапа до healthcheck.
	CycleTimeout time.Duration
}

// Manager — единственный владелец цикла применения.
type Manager struct {
	store   Store
	service Service
	health  Health
	clock   Clock
	log     *slog.Logger
	opts    Options

	mu sync.Mutex
	// busy закрывает применение с момента резервирования: транзакция
	// появляется позже, и до неё второй Start проскакивал бы проверку.
	busy    bool
	current Transaction
	// lastSum — sha256 того, что записал сам демон. Переживает перезапуск через
	// файл состояния.
	lastSum   string
	confirmed chan struct{}
	cancel    context.CancelFunc

	wg sync.WaitGroup
}

// New собирает применение. Часы можно не задавать — тогда берутся системные.
func New(store Store, service Service, health Health, clock Clock, log *slog.Logger, opts Options) *Manager {
	if clock == nil {
		clock = SystemClock{}
	}

	return &Manager{store: store, service: service, health: health, clock: clock, log: log, opts: opts}
}

// Current отдаёт снимок текущей транзакции. Пустая фаза означает, что
// применений в этой жизни демона не было.
func (m *Manager) Current() Transaction {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.current
}

// Start запускает применение. Проверка бинарём идёт синхронно — на её выводе
// пользователь чинит конфиг, и ответ на запрос обязан его содержать (AC-26).
// Всё, что после неё, живёт своим контекстом: применение переживает запрос
// (ADR-0002).
func (m *Manager) Start(ctx context.Context, cfg []byte) (Transaction, error) {
	prepared, added, err := clashapi.Ensure(cfg, m.opts.ClashPort)
	if err != nil {
		return Transaction{}, fmt.Errorf("гарантия clash_api: %w", err)
	}

	settings, err := clashapi.Read(prepared)
	if err != nil {
		return Transaction{}, err
	}

	if err := m.reserve(ctx); err != nil {
		return Transaction{}, err
	}

	// Отказ check не заводит транзакции: ничего не применялось, а вердикт
	// бинаря уезжает вызывающему этой же ошибкой.
	if err := m.check(ctx, prepared); err != nil {
		m.unreserve()

		return Transaction{}, err
	}

	tx := Transaction{
		ID:            rand.Text(),
		Phase:         PhaseApplying,
		Window:        m.opts.Window,
		Sum:           sum(prepared),
		ClashAPIAdded: added,
	}

	if err := m.persist(ctx, tx); err != nil {
		m.unreserve()

		return Transaction{}, err
	}

	m.begin(tx)
	m.run(prepared, settings)

	return tx, nil
}

// Confirm закрывает окно подтверждения: связь жива, откат не нужен.
func (m *Manager) Confirm(ctx context.Context, id string) (Transaction, error) {
	m.mu.Lock()

	if m.current.ID != id {
		m.mu.Unlock()

		return Transaction{}, ErrUnknownTransaction
	}
	if m.current.Phase != PhaseAwaitingConfirm {
		m.mu.Unlock()

		return Transaction{}, ErrNothingToConfirm
	}

	m.current.Phase = PhaseConfirmed
	m.current.Window = 0
	tx := m.current
	confirmed := m.confirmed
	m.confirmed = nil
	m.mu.Unlock()

	if confirmed != nil {
		close(confirmed)
	}

	if err := m.store.ClearState(ctx); err != nil {
		m.log.Error("состояние подтверждённой транзакции не убрано", "err", err, "transaction_id", id)
	}

	m.log.Info("применение подтверждено", "transaction_id", id)

	return tx, nil
}

// Close останавливает ожидание подтверждения и дожидается фоновой горутины.
// Состояние остаётся на диске: незакрытое окно доиграется при следующем старте.
func (m *Manager) Close() {
	m.mu.Lock()
	cancel := m.cancel
	m.mu.Unlock()

	if cancel != nil {
		cancel()
	}

	m.wg.Wait()
}

// reserve занимает применение под одну транзакцию и заодно ловит правку файла
// извне: конфиг мог поправить владелец по SSH, и затирать это молча нельзя.
func (m *Manager) reserve(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.busy || m.current.Active() {
		return ErrBusy
	}

	if m.lastSum == "" {
		m.busy = true

		return nil
	}

	current, err := m.store.Sum(ctx)
	if errors.Is(err, fs.ErrNotExist) {
		// Конфиг унесли из-под демона — сверять не с чем, применение это не
		// останавливает.
		m.busy = true

		return nil
	}
	if err != nil {
		return fmt.Errorf("сверка конфига: %w", err)
	}
	if current != m.lastSum {
		return ErrConfigModified
	}

	m.busy = true

	return nil
}

// unreserve освобождает применение, когда до транзакции дело не дошло.
func (m *Manager) unreserve() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.busy = false
}

func (m *Manager) begin(tx Transaction) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.current = tx
	m.confirmed = make(chan struct{})
}

func (m *Manager) release(phase Phase, reason string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.current.Phase = phase
	m.current.Reason = reason
}

func (m *Manager) persist(ctx context.Context, tx Transaction) error {
	data, err := json.Marshal(tx)
	if err != nil {
		return fmt.Errorf("сериализация состояния: %w", err)
	}

	return m.store.WriteState(ctx, data)
}
