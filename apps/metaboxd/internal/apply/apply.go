// Package apply проводит конфиг через протокол применения: проверка
// кандидата бинарём, бэкап, запись, рестарт сервиса, healthcheck, окно
// подтверждения и автооткат, если подтверждения не было.
//
// Содержимое конфига пакет не разбирает: он оркестратор, а решения о байтах
// принимают config и clashapi.
package apply

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
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

// ReasonCode — на каком шаге цикл встал. Набор закрытый: по коду панель
// выбирает текст на языке пользователя, а Reason остаётся подробностью для
// того, кто чинит — там исходная ошибка шага.
type ReasonCode string

const (
	// ReasonBackupFailed — предыдущий конфиг не сохранился, и откатываться было
	// бы не на что; до записи цикл не дошёл.
	ReasonBackupFailed ReasonCode = "backup_failed"
	// ReasonWriteFailed — конфиг не записан на устройство.
	ReasonWriteFailed ReasonCode = "write_failed"
	// ReasonRestartFailed — служба не перезапустилась с новым конфигом.
	ReasonRestartFailed ReasonCode = "restart_failed"
	// ReasonHealthcheckFailed — служба поднялась, но рантайм не ответил.
	ReasonHealthcheckFailed ReasonCode = "healthcheck_failed"
	// ReasonRollbackFailed — вернуть предыдущий конфиг не вышло: это худший
	// результат цикла, и устройство остаётся с чужим конфигом.
	ReasonRollbackFailed ReasonCode = "rollback_failed"
)

// StepError — отказ шага цикла: код уходит панели, исходная ошибка — в лог и
// в подробности.
type StepError struct {
	Code ReasonCode
	Err  error
}

func (e *StepError) Error() string { return e.Err.Error() }

func (e *StepError) Unwrap() error { return e.Err }

// stepFailed заворачивает ошибку шага в код. Отдельная функция, чтобы шаги
// читались одинаково и код не терялся при обёртке.
func stepFailed(code ReasonCode, err error) error {
	return &StepError{Code: code, Err: err}
}

// reasonOf достаёт код шага. Ошибка без кода — отказ, которого цикл не ждал:
// он остаётся с пустым кодом, и панель покажет текст ошибки как есть.
func reasonOf(err error) ReasonCode {
	if step, ok := errors.AsType[*StepError](err); ok {
		return step.Code
	}

	return ""
}

// Transaction — снимок применения. Он же формат файла состояния: то, что
// демон отдаёт клиенту, и то, по чему доигрывает себя после перезагрузки.
type Transaction struct {
	ID    string `json:"id"`
	Phase Phase  `json:"phase"`
	// Window — сколько осталось на подтверждение. Хранится длительностью, а не
	// меткой времени: у роутера нет часов реального времени, после включения он
	// стартует с эпохи и прыгает при синхронизации NTP.
	Window time.Duration `json:"window"`
	// Sum — sha256 конфига, записанного демоном. По нему ловится правка файла
	// извне.
	Sum string `json:"sha256,omitempty"`
	// Lists — sha256 файлов списков, которые транзакция записывает: имя →
	// отпечаток нового содержимого. Только реально меняемые файлы: по
	// совпадению отпечатка доигрывание судит, началась ли запись.
	Lists map[string]string `json:"lists,omitempty"`
	// RemovedLists — файлы списков, которые транзакция удаляет; на момент
	// запуска они существовали.
	RemovedLists []string `json:"removed_lists,omitempty"`
	// ReasonCode — на каком шаге встал цикл. Пусто, если применение прошло или
	// отказ не привязан к шагу.
	ReasonCode ReasonCode `json:"reason_code,omitempty"`
	// Reason заполняется, когда применение не дошло до конца: исходная ошибка
	// шага, как её записал демон. Показывать её пользователю — запасной путь,
	// текст отказа панель берёт по ReasonCode.
	Reason string `json:"reason,omitempty"`
	// ClashAPIAdded отмечает, что демон сам добавил секцию.
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

	// ErrListsModified — файлы списков правили в обход демона; класс отказа
	// тот же, что у ErrConfigModified.
	ErrListsModified = errors.New("файлы списков изменены вне metabox")

	// ErrListName — имя файла списка не подходит подкаталогу: путь строит
	// панель, и всё остальное — попытка выйти из него или слиться с конфигом.
	ErrListName = errors.New("недопустимое имя файла списка")
)

// WorkdirError — рабочий каталог службы не совпадает с каталогом конфига.
// Относительный path узла local служба резолвит от рабочего каталога, а не от
// каталога конфига: записанные файлы списков она бы не нашла, упала бы после
// рестарта, и цикл откатился бы по healthcheck. Каталоги едут в ошибке, потому
// что из них собирается подсказка, как это исправить.
type WorkdirError struct {
	Workdir   string
	ConfigDir string
}

func (e *WorkdirError) Error() string {
	return fmt.Sprintf("рабочий каталог службы %s не совпадает с каталогом конфига %s", e.Workdir, e.ConfigDir)
}

// Lists — изменения файлов списков, едущие с применением: put пишется в
// подкаталог списков, remove удаляется из него. Оба применяются той же
// транзакцией, что и конфиг: проверка, запись, откат и доигрывание общие.
type Lists struct {
	Put    map[string][]byte
	Remove []string
}

// empty отвечает, есть ли в изменениях хоть что-то.
func (l Lists) empty() bool {
	return len(l.Put) == 0 && len(l.Remove) == 0
}

// Store — файлы, которыми владеет config.Store. Интерфейс объявлен здесь,
// у потребителя, и содержит только то, что нужно применению.
type Store interface {
	Sum(ctx context.Context) (string, error)
	Read(ctx context.Context) ([]byte, error)
	Write(ctx context.Context, data []byte) error
	Backup(ctx context.Context) error
	SaveVersion(ctx context.Context, data []byte) error
	Restore(ctx context.Context) error
	StageCandidate(ctx context.Context, dst string, data []byte, putLists map[string][]byte, removeLists []string) error
	ListSums(ctx context.Context) (map[string]string, error)
	WriteLists(ctx context.Context, put map[string][]byte, remove []string) error
	ReadState(ctx context.Context) ([]byte, error)
	WriteState(ctx context.Context, data []byte) error
	ClearState(ctx context.Context) error
}

// Service — бинарь sing-box и его сервис.
type Service interface {
	Check(ctx context.Context, dir string) error
	Restart(ctx context.Context) error
	// Workdir — рабочий каталог службы; пустая строка — узнать неоткуда.
	Workdir(ctx context.Context) (string, error)
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
	// Window — окно подтверждения, по умолчанию минута.
	Window time.Duration
	// ClashPort — порт, который демон пропишет в external_controller, если
	// секции нет.
	ClashPort int
	// CycleTimeout ограничивает шаги от бэкапа до healthcheck.
	CycleTimeout time.Duration
	// ConfigDir — каталог конфига: с ним сверяется рабочий каталог службы
	// перед применением файлов списков.
	ConfigDir string
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
	busy bool
	// epoch нумерует владения busy. Фоновая горутина освобождает применение
	// по номеру своего владения: к её выходу busy может держать уже следующий
	// Start, и безусловное снятие впускало бы два применения разом.
	epoch uint64
	// rollingBack закрывает Confirm на время отката: фаза остаётся
	// awaiting_confirm до конца Restore и Restart, и без этого признака
	// подтверждение вклинивалось бы в уже идущий откат.
	rollingBack bool
	current     Transaction
	// lastSum — sha256 того, что записал сам демон. Переживает перезапуск через
	// файл состояния.
	lastSum string
	// lastListsSum — отпечаток набора файлов списков после записи демоном.
	// Живёт только в памяти: после перезапуска сверку берёт на себя база
	// клиента, как и у конфига.
	lastListsSum string
	// windowEndsAt — когда закрывается окно подтверждения. Хранится монотонной
	// меткой Go и только в памяти: на диск уходит длительность, потому что у
	// роутера нет часов реального времени и между жизнями демона метку сравнить
	// не с чем.
	windowEndsAt time.Time
	confirmed    chan struct{}
	cancel       context.CancelFunc

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
//
// Window в снимке — остаток окна, а не его длительность: панель показывает эту
// цифру пользователю, и после перезагрузки страницы полные шестьдесят секунд
// означали бы обещание, которого демон не даёт.
func (m *Manager) Current() Transaction {
	m.mu.Lock()
	defer m.mu.Unlock()

	tx := m.current
	if tx.Phase == PhaseAwaitingConfirm && !m.windowEndsAt.IsZero() {
		tx.Window = max(0, time.Until(m.windowEndsAt))
	}

	return tx
}

// Start запускает применение. Проверка бинарём идёт синхронно — на её выводе
// пользователь чинит конфиг, и ответ на запрос обязан его содержать. Всё, что
// после неё, живёт своим контекстом: применение переживает запрос.
//
// base — sha256 конфига, от которого редактировал клиент; listsBase — тот же
// смысл для набора файлов списков (ListsEtag). Пустая строка означает, что
// клиент базу не назвал. Заданная база сверяется с диском вместо внутренней
// сверки: клиент видел ровно эту версию, и его применение поверх неё правку
// извне не затирает.
func (m *Manager) Start(ctx context.Context, cfg []byte, lists Lists, base, listsBase string) (Transaction, error) {
	if err := validateLists(lists); err != nil {
		return Transaction{}, err
	}

	if len(lists.Put) > 0 {
		if err := m.verifyWorkdir(ctx); err != nil {
			return Transaction{}, err
		}
	}

	prepared, added, err := clashapi.Ensure(cfg, m.opts.ClashPort)
	if err != nil {
		return Transaction{}, fmt.Errorf("гарантия clash_api: %w", err)
	}

	settings, err := clashapi.Read(prepared)
	if err != nil {
		return Transaction{}, err
	}

	token, err := m.reserve(ctx, base, listsBase)
	if err != nil {
		return Transaction{}, err
	}

	// Изменения сводятся к реально меняемым файлам: неизменённый не пишется,
	// а его совпадение с диском не должно читаться доигрыванием как
	// свидетельство начатой записи.
	changed, removed, err := m.narrowLists(ctx, lists)
	if err != nil {
		m.unreserve(token)

		return Transaction{}, err
	}

	// Отказ check не заводит транзакции: ничего не применялось, а вердикт
	// бинаря уезжает вызывающему этой же ошибкой.
	if err := m.check(ctx, prepared, changed, removed); err != nil {
		m.unreserve(token)

		return Transaction{}, err
	}

	tx := Transaction{
		ID:            rand.Text(),
		Phase:         PhaseApplying,
		Window:        m.opts.Window,
		Sum:           sum(prepared),
		Lists:         listSums(changed),
		RemovedLists:  removed,
		ClashAPIAdded: added,
	}

	if err := m.persist(ctx, tx); err != nil {
		m.unreserve(token)

		return Transaction{}, err
	}

	m.begin(tx)
	m.run(prepared, changed, removed, settings, token)

	return tx, nil
}

// Имя файла списка: панель строит его из тега, и всё за пределами простого
// имени с расширением .json — либо попытка выйти из подкаталога, либо файл,
// который служба слила бы с конфигом.
var listNamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$`)

// maxListName ограничивает имя: длиннее не принимают файловые системы устройств.
const maxListName = 128

func validListName(name string) bool {
	return len(name) <= maxListName && listNamePattern.MatchString(name) && !strings.Contains(name, "..")
}

func validateLists(lists Lists) error {
	for name := range lists.Put {
		if !validListName(name) {
			return fmt.Errorf("%w: %q", ErrListName, name)
		}
	}

	for _, name := range lists.Remove {
		if !validListName(name) {
			return fmt.Errorf("%w: %q", ErrListName, name)
		}

		if _, ok := lists.Put[name]; ok {
			return fmt.Errorf("%w: %q и пишется, и удаляется", ErrListName, name)
		}
	}

	return nil
}

// verifyWorkdir сверяет рабочий каталог службы с каталогом конфига до записи:
// расхождение иначе выяснилось бы только падением службы на новом конфиге.
// Неизвестный каталог применение не останавливает — procd может не быть, а
// служба могла не подниматься ни разу, и отказ тогда был бы ложным.
func (m *Manager) verifyWorkdir(ctx context.Context) error {
	workdir, err := m.service.Workdir(ctx)
	if err != nil {
		m.log.Warn("рабочий каталог службы не прочитан, сверка с каталогом конфига пропущена", "err", err)

		return nil
	}

	if workdir == "" || sameDir(workdir, m.opts.ConfigDir) {
		return nil
	}

	return &WorkdirError{Workdir: workdir, ConfigDir: m.opts.ConfigDir}
}

// sameDir сравнивает каталоги по пути, а при расхождении — по самому каталогу:
// /proc/<pid>/cwd отдаёт путь с раскрытыми симлинками, и один каталог под двумя
// именами отказом считаться не должен.
func sameDir(a, b string) bool {
	if filepath.Clean(a) == filepath.Clean(b) {
		return true
	}

	left, err := os.Stat(a)
	if err != nil {
		return false
	}

	right, err := os.Stat(b)
	if err != nil {
		return false
	}

	return os.SameFile(left, right)
}

// narrowLists сводит изменения к реально меняемым: запись файла с тем же
// содержимым и удаление несуществующего — пустые действия.
func (m *Manager) narrowLists(ctx context.Context, lists Lists) (map[string][]byte, []string, error) {
	if lists.empty() {
		return nil, nil, nil
	}

	current, err := m.store.ListSums(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("сверка списков: %w", err)
	}

	changed := make(map[string][]byte, len(lists.Put))

	for name, data := range lists.Put {
		if current[name] != sum(data) {
			changed[name] = data
		}
	}

	var removed []string

	for _, name := range lists.Remove {
		if _, ok := current[name]; ok {
			removed = append(removed, name)
		}
	}

	return changed, removed, nil
}

func listSums(files map[string][]byte) map[string]string {
	if len(files) == 0 {
		return nil
	}

	sums := make(map[string]string, len(files))
	for name, data := range files {
		sums[name] = sum(data)
	}

	return sums
}

// ListsEtag — отпечаток набора файлов списков: имена с суммами в стабильном
// порядке. Его отдаёт чтение списков и его же клиент возвращает базой
// применения.
func ListsEtag(sums map[string]string) string {
	names := make([]string, 0, len(sums))
	for name := range sums {
		names = append(names, name)
	}

	sort.Strings(names)

	h := sha256.New()
	for _, name := range names {
		// Запись в hash.Hash не отказывает по контракту пакета hash.
		_, _ = fmt.Fprintf(h, "%s:%s\n", name, sums[name])
	}

	return hex.EncodeToString(h.Sum(nil))
}

// Confirm закрывает окно подтверждения: связь жива, откат не нужен.
func (m *Manager) Confirm(ctx context.Context, id string) (Transaction, error) {
	m.mu.Lock()

	if m.current.ID != id {
		m.mu.Unlock()

		return Transaction{}, ErrUnknownTransaction
	}
	if m.current.Phase != PhaseAwaitingConfirm || m.rollingBack {
		m.mu.Unlock()

		return Transaction{}, ErrNothingToConfirm
	}

	m.current.Phase = PhaseConfirmed
	m.current.Window = 0
	tx := m.current
	confirmed := m.confirmed
	m.confirmed = nil
	m.mu.Unlock()

	// Состояние убирается до освобождения busy: снятый раньше busy впускает
	// следующий Start, и ClearState стирал бы уже его файл состояния. Ответ
	// уходит после очистки, так что «подтвердил и тут же применил» в
	// занятость не упирается.
	if err := m.store.ClearState(ctx); err != nil {
		m.log.Error("состояние подтверждённой транзакции не убрано", "err", err, "transaction_id", id)
	}

	m.mu.Lock()
	m.busy = false
	m.mu.Unlock()

	if confirmed != nil {
		close(confirmed)
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

// reserve занимает применение под одну транзакцию и заодно ловит правку
// извне: конфиг и файлы списков мог поправить владелец по SSH, и затирать это
// молча нельзя. Возвращает номер владения для unreserve.
//
// Названная клиентом база главнее внутренней сверки: lastSum живёт в памяти
// процесса и после перезапуска пуст, а база приходит с каждым применением и
// разблокирует Apply, когда клиент перечитал правленный извне файл.
func (m *Manager) reserve(ctx context.Context, base, listsBase string) (uint64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.busy || m.current.Active() {
		return 0, ErrBusy
	}

	if err := m.verifyConfigBase(ctx, base); err != nil {
		return 0, err
	}

	if err := m.verifyListsBase(ctx, listsBase); err != nil {
		return 0, err
	}

	return m.hold(), nil
}

// verifyConfigBase сверяет конфиг на диске с базой клиента, а без неё — с тем,
// что записал сам демон. Вызывается под mu.
func (m *Manager) verifyConfigBase(ctx context.Context, base string) error {
	if base != "" {
		current, err := m.store.Sum(ctx)
		if errors.Is(err, fs.ErrNotExist) {
			// База есть, а файла нет: клиент редактировал конфиг, который
			// из-под него унесли.
			return ErrConfigModified
		}
		if err != nil {
			return fmt.Errorf("сверка конфига: %w", err)
		}
		if current != base {
			return ErrConfigModified
		}

		return nil
	}

	if m.lastSum == "" {
		return nil
	}

	current, err := m.store.Sum(ctx)
	if errors.Is(err, fs.ErrNotExist) {
		// Конфиг унесли из-под демона — сверять не с чем, применение это не
		// останавливает.
		return nil
	}
	if err != nil {
		return fmt.Errorf("сверка конфига: %w", err)
	}
	if current != m.lastSum {
		return ErrConfigModified
	}

	return nil
}

// verifyListsBase — та же сверка для набора файлов списков. Вызывается под mu.
func (m *Manager) verifyListsBase(ctx context.Context, listsBase string) error {
	expected := listsBase
	if expected == "" {
		expected = m.lastListsSum
	}

	if expected == "" {
		return nil
	}

	current, err := m.store.ListSums(ctx)
	if err != nil {
		return fmt.Errorf("сверка списков: %w", err)
	}

	if ListsEtag(current) != expected {
		return ErrListsModified
	}

	return nil
}

// hold занимает применение и отдаёт номер владения. Вызывается под mu.
func (m *Manager) hold() uint64 {
	m.busy = true
	m.epoch++

	return m.epoch
}

// unreserve освобождает применение, если владение всё ещё за тем, кто его
// брал: Confirm и откат отдают busy сами, и к выходу фоновой горутины оно
// может принадлежать уже следующему Start.
func (m *Manager) unreserve(token uint64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.epoch == token {
		m.busy = false
	}
}

func (m *Manager) begin(tx Transaction) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.current = tx
	m.confirmed = make(chan struct{})
}

func (m *Manager) release(phase Phase, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.current.Phase = phase
	m.current.ReasonCode = reasonOf(err)
	m.current.Reason = err.Error()
	m.rollingBack = false
}

func (m *Manager) persist(ctx context.Context, tx Transaction) error {
	data, err := json.Marshal(tx)
	if err != nil {
		return fmt.Errorf("сериализация состояния: %w", err)
	}

	return m.store.WriteState(ctx, data)
}
