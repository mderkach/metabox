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
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/dataplane"
	"metabox/internal/procd"
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
	// ReasonDNSProbeFailed — Clash API ответил, но dns-in нового конфига не
	// разрешил контрольное имя: DNS сети через sing-box не работает.
	ReasonDNSProbeFailed ReasonCode = "dns_probe_failed"
	// ReasonInterceptionMissing — перехват включён и стоял до рестарта, а после
	// него цепочек обвязки в nft нет: трафик LAN идёт мимо sing-box.
	ReasonInterceptionMissing ReasonCode = "interception_missing"
	// ReasonRollbackFailed — вернуть предыдущий конфиг не вышло: это худший
	// результат цикла, и устройство остаётся с чужим конфигом.
	ReasonRollbackFailed ReasonCode = "rollback_failed"
	// ReasonNoBackup — откат понадобился, но возвращать нечего: до применения
	// конфига на устройстве не было. Служба остаётся на том, что успело
	// записаться, и не перезапускается.
	ReasonNoBackup ReasonCode = "no_backup"
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

// LaunchError — служба поднимается не на конфиге, которым владеет демон:
// запись ничего бы ей не поменяла, а проверка проверяла бы не то, что
// запустится. Configs и ConfigDirs — флаги -c и -C команды службы, Config —
// путь конфига демона.
type LaunchError struct {
	Configs    []string
	ConfigDirs []string
	Config     string
}

func (e *LaunchError) Error() string {
	return fmt.Sprintf("служба поднимается на %q и %q, а не на конфиге %s", e.Configs, e.ConfigDirs, e.Config)
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
	// Check проверяет кандидата: config — файл конфига (-c), пусто — каталог
	// dir целиком (-C); workdir — база относительных путей (-D).
	Check(ctx context.Context, dir, config, workdir string) error
	Restart(ctx context.Context) error
	// Launch — с чем procd поднимает службу; пустые поля — узнать неоткуда.
	Launch(ctx context.Context) (procd.Launch, error)
	// PID отдаёт pid поднятого процесса службы; ноль — не поднят ни один.
	PID(ctx context.Context) (int, error)
}

// Health ждёт, пока Clash API поднимется после рестарта.
type Health interface {
	Wait(ctx context.Context, settings clashapi.Settings) error
}

// Dataplane читает модель обвязки и признак её применения.
type Dataplane interface {
	Model(ctx context.Context) (dataplane.Model, error)
	Applied(ctx context.Context) (bool, dataplane.AppliedReason, error)
}

// DNSProber шлёт DNS-запрос в dns-in поднятого sing-box.
type DNSProber interface {
	Probe(ctx context.Context, inbound clashapi.DNSInbound) error
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
	// ConfigDir — каталог конфига: с ним сверяются рабочий каталог и флаг -C
	// команды службы.
	ConfigDir string
	// ConfigName — имя файла конфига в ConfigDir: с ним сверяется флаг -c.
	ConfigName string
	// ProcessInterval — пауза между опросами procd, пока после рестарта ждём
	// новый процесс службы.
	ProcessInterval time.Duration
	// Dataplane — откуда healthcheck берёт порт dns-in и признак перехвата.
	// nil — DNS-проба и проверка перехвата пропускаются.
	Dataplane Dataplane
	// DNS — проба dns-in; nil — выключена.
	DNS DNSProber
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
// смысл для набора файлов списков (config.ListsEtag). Пустая строка означает, что
// клиент базу не назвал. Заданная база сверяется с диском вместо внутренней
// сверки: клиент видел ровно эту версию, и его применение поверх неё правку
// извне не затирает.
func (m *Manager) Start(ctx context.Context, cfg []byte, lists Lists, base, listsBase string) (Transaction, error) {
	if err := validateLists(lists); err != nil {
		return Transaction{}, err
	}

	target, err := m.resolveCheck(ctx, len(lists.Put) > 0)
	if err != nil {
		return Transaction{}, err
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
	if err := m.check(ctx, prepared, changed, removed, target); err != nil {
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

func validateLists(lists Lists) error {
	for name := range lists.Put {
		if !config.ValidListName(name) {
			return fmt.Errorf("%w: %q", ErrListName, name)
		}
	}

	for _, name := range lists.Remove {
		if !config.ValidListName(name) {
			return fmt.Errorf("%w: %q", ErrListName, name)
		}

		if _, ok := lists.Put[name]; ok {
			return fmt.Errorf("%w: %q и пишется, и удаляется", ErrListName, name)
		}
	}

	return nil
}

// SnapshotLists — изменения, которые приводят каталог списков к снимку версии:
// файлы снимка пишутся, текущие файлы сверх снимка удаляются. current — суммы
// текущих файлов, важны только имена. Имена, которых применение не примет,
// пропускаются: чужой файл в подкаталоге демон не пишет и не удаляет, и
// восстановление версии из-за него отказывать не должно.
func SnapshotLists(snapshot map[string][]byte, current map[string]string) Lists {
	var lists Lists

	for name, data := range snapshot {
		if !config.ValidListName(name) {
			continue
		}

		if lists.Put == nil {
			lists.Put = make(map[string][]byte, len(snapshot))
		}

		lists.Put[name] = data
	}

	for name := range current {
		if _, ok := snapshot[name]; ok || !config.ValidListName(name) {
			continue
		}

		lists.Remove = append(lists.Remove, name)
	}

	slices.Sort(lists.Remove)

	return lists
}

// checkTarget — как проверять кандидата: тем режимом и от той базы путей, с
// какими procd поднимет службу, иначе вердикты check и рантайма расходятся.
type checkTarget struct {
	// directory — служба сливает каталог конфига (-C), а не читает один файл.
	directory bool
	// workdir — рабочий каталог службы вне каталога конфига; пусто — база
	// путей сам кандидат.
	workdir string
}

// resolveCheck сверяет команду службы с конфигом демона до записи: расхождение
// иначе выяснилось бы только падением службы на новом конфиге или проверкой не
// того, что запустится. Неизвестную команду применение не останавливает —
// procd может не быть, а служба могла не подниматься ни разу, и отказ тогда был
// бы ложным; проверка идёт так, как службу поднимает пакет форка, одним файлом.
//
// Рабочий каталог вне каталога конфига проверку не ломает: транзакция его не
// меняет, и check берёт его базой путей. Отказ — только с файлами списков:
// относительный path узла local служба резолвит от рабочего каталога и
// записанных файлов не нашла бы.
func (m *Manager) resolveCheck(ctx context.Context, withLists bool) (checkTarget, error) {
	launch, err := m.service.Launch(ctx)
	if err != nil {
		m.log.Warn("команда службы не прочитана, кандидат проверяется как у пакета форка", "err", err)

		launch = procd.Launch{}
	}

	var target checkTarget

	configPath := filepath.Join(m.opts.ConfigDir, m.opts.ConfigName)

	switch {
	case len(launch.Configs) == 0 && len(launch.ConfigDirs) == 0:
	case len(launch.ConfigDirs) == 0 && len(launch.Configs) == 1 && samePath(launch.Configs[0], configPath):
	case len(launch.Configs) == 0 && len(launch.ConfigDirs) == 1 && samePath(launch.ConfigDirs[0], m.opts.ConfigDir):
		target.directory = true
	default:
		return checkTarget{}, &LaunchError{Configs: launch.Configs, ConfigDirs: launch.ConfigDirs, Config: configPath}
	}

	if launch.Workdir == "" || samePath(launch.Workdir, m.opts.ConfigDir) {
		return target, nil
	}

	if withLists {
		return checkTarget{}, &WorkdirError{Workdir: launch.Workdir, ConfigDir: m.opts.ConfigDir}
	}

	// Несуществующий каталог -D sing-box создаёт сам, и проверка от него
	// оставила бы на устройстве след до записи. Служба создаст его на рестарте,
	// а относительных путей в нём всё равно нет.
	if info, err := os.Stat(launch.Workdir); err != nil || !info.IsDir() {
		return target, nil
	}

	target.workdir = launch.Workdir

	return target, nil
}

// samePath сравнивает пути по записи, а при расхождении — по самому файлу:
// /proc/<pid>/cwd отдаёт путь с раскрытыми симлинками, и один каталог под двумя
// именами отказом считаться не должен.
func samePath(a, b string) bool {
	// Относительный путь из команды службы считать не от чего: cwd демона
	// не обязан совпадать с каталогом, где procd поднимает службу.
	if !filepath.IsAbs(a) || !filepath.IsAbs(b) {
		return false
	}

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
		// На диске осталось awaiting_confirm, и после перезагрузки доигрывание
		// откатило бы подтверждённый конфиг. Терминальную фазу Replay не
		// откатывает, а только убирает.
		if persistErr := m.persist(ctx, tx); persistErr != nil {
			m.log.Error("состояние подтверждённой транзакции не убрано и не переписано",
				"err", errors.Join(err, persistErr), "transaction_id", id)
		} else {
			m.log.Warn("состояние подтверждённой транзакции не убрано, записана терминальная фаза",
				"err", err, "transaction_id", id)
		}
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

	if config.ListsEtag(current) != expected {
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
