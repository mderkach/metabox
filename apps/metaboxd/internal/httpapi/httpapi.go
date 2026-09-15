// Package httpapi — HTTP-слой демона: маршруты, цепочка middleware и единый
// формат ответа. Предметные зависимости приходят конструктором, сам пакет их
// не собирает.
package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"metabox/internal/apply"
	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/history"
	"metabox/internal/route"
	"metabox/internal/singbox"
)

// maxConfigBytes — потолок на тело запроса. Конфиг приходит байтами, и без
// лимита один запрос забирает столько памяти, сколько прислали. Четыре
// мегабайта с запасом перекрывают конфиг из NFR-2 на 500 правил.
const maxConfigBytes = 4 << 20

// Applier — цикл применения. Интерфейс объявлен здесь, у потребителя, и
// содержит только те методы, которыми пользуются хендлеры.
type Applier interface {
	Start(ctx context.Context, cfg []byte) (apply.Transaction, error)
	Confirm(ctx context.Context, id string) (apply.Transaction, error)
	Current() apply.Transaction
}

// Service — управление сервисом sing-box через init-скрипт. Интерфейс
// объявлен здесь, у потребителя.
type Service interface {
	State(ctx context.Context) (singbox.State, error)
	Start(ctx context.Context) error
	Stop(ctx context.Context) error
	Restart(ctx context.Context) error
}

// ConfigReader отдаёт применённый конфиг и его историю. Интерфейс объявлен
// здесь, у потребителя, и содержит только чтение: файлами владеет
// config.Store, а запись идёт протоколом Apply.
type ConfigReader interface {
	Read(ctx context.Context) ([]byte, error)
	Versions(ctx context.Context) ([]config.Version, error)
	ReadVersion(ctx context.Context, id int) ([]byte, error)
}

// Explainer объясняет маршрут соединения. Интерфейс объявлен здесь, у
// потребителя: сам слой не знает, откуда берутся данные core.
type Explainer interface {
	Explain(ctx context.Context, id string) (route.Explanation, error)
}

// Options — настройки слоя, приходящие в демон флагами.
type Options struct {
	Version string
	// SingboxVersion — версия бинаря на устройстве: формы панели собраны под
	// одну версию форка, и расхождение с бинарём видно только отсюда. Пустая
	// строка означает, что версию прочитать не удалось.
	SingboxVersion string
	// AllowedOrigin — разрешённый Origin сверх совпадения с Host. Пустая
	// строка означает, что послаблений нет: правило из ADR-0002 действует
	// в чистом виде.
	AllowedOrigin string
	// SPA раздаёт встроенный интерфейс. nil означает, что бинарь собран без
	// фронта: API продолжает работать, а панель объясняет, чего не хватает.
	SPA http.Handler
	// Service управляет сервисом sing-box. nil означает, что управление
	// недоступно: панель откроется, а карточка сервиса не покажется.
	Service Service
	// Events — единый поток рантайма к панели (ADR-0006). nil означает, что
	// поток не собран: экраны остаются на прокси Clash API.
	Events http.Handler
	// Clash проксирует рантайм sing-box под веткой clashapi.Prefix. nil
	// означает, что прокси не собран: панель откроется, а экраны рантайма
	// деградируют (NFR-1).
	Clash http.Handler
	// Explain объясняет маршрут соединения (ADR-0007). nil означает, что
	// источника рантайма нет: экран соединений остаётся без объяснения.
	Explain Explainer
	// History отдаёт историю трафика, накопленную демоном. nil означает, что
	// её никто не копит: график глубже минуты не показывается.
	History HistoryReader
	// Runtime сообщает, работает ли на устройстве процесс sing-box. nil
	// означает, что наблюдать нечем: состояние службы тогда читается только у
	// procd, и чужой процесс панель не увидит.
	Runtime RuntimeObserver
	// ConfigPath — путь файла, которым владеет демон. Панель показывает его
	// как факт об устройстве, а задаётся он флагами `-config-dir` и
	// `-config-name`: без этого поля интерфейс показывал бы значение по
	// умолчанию независимо от того, с чем демон запущен.
	ConfigPath string
}

// HistoryReader отдаёт накопленную историю трафика. Интерфейс объявлен здесь,
// у потребителя.
type HistoryReader interface {
	Points() []history.Point
	Device() []history.DevicePoint
	Step() int
}

// RuntimeObserver сообщает, работает ли на устройстве процесс sing-box.
// Интерфейс объявлен здесь, у потребителя.
type RuntimeObserver func(ctx context.Context) bool

// Server держит зависимости обработчиков и собранную цепочку middleware.
type Server struct {
	applier        Applier
	reader         ConfigReader
	log            *slog.Logger
	version        string
	singboxVersion string
	allowedOrigin  string
	spa            http.Handler
	service        Service
	events         http.Handler
	clash          http.Handler
	explain        Explainer
	history        HistoryReader
	runtime        RuntimeObserver
	configPath     string
	handler        http.Handler
}

// NewServer собирает слой вместе с цепочкой middleware. Логгер обязателен:
// своего пакет не заводит.
func NewServer(applier Applier, reader ConfigReader, log *slog.Logger, opts Options) *Server {
	s := &Server{
		applier:        applier,
		reader:         reader,
		log:            log,
		version:        opts.Version,
		singboxVersion: opts.SingboxVersion,
		allowedOrigin:  opts.AllowedOrigin,
		spa:            opts.SPA,
		service:        opts.Service,
		events:         opts.Events,
		clash:          opts.Clash,
		explain:        opts.Explain,
		history:        opts.History,
		runtime:        opts.Runtime,
		configPath:     opts.ConfigPath,
	}
	s.handler = s.routes()

	return s
}

// ServeHTTP отдаёт запрос цепочке, собранной в NewServer.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/status", s.handleStatus)
	mux.HandleFunc("GET /api/config", s.handleConfig)
	mux.HandleFunc("GET /api/config/versions", s.handleVersions)
	mux.HandleFunc("GET /api/config/versions/{id}", s.handleVersion)
	mux.HandleFunc("POST /api/config/versions/{id}/restore", s.handleVersionRestore)
	mux.HandleFunc("POST /api/apply", s.handleApply)
	mux.HandleFunc("GET /api/apply/{id}", s.handleApplyState)
	mux.HandleFunc("POST /api/apply/{id}/confirm", s.handleApplyConfirm)

	if s.explain != nil {
		mux.HandleFunc("GET /api/connections/{id}/route", s.handleExplain)
	}

	if s.history != nil {
		mux.HandleFunc("GET /api/history", s.handleHistory)
	}

	if s.service != nil {
		mux.HandleFunc("GET /api/service", s.handleServiceState)
		mux.HandleFunc("POST /api/service/{action}", s.handleServiceAction)
	}

	if s.events != nil {
		mux.Handle("GET /api/events", s.events)
	}

	if s.clash != nil {
		mux.Handle(clashapi.Prefix+"/", s.noUpgrade(s.clash))
	}

	mux.HandleFunc("/api/", s.handleAPINotFound)
	mux.Handle("/", s.spaHandler())

	return s.middleware(mux)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(s.log, w, http.StatusOK, contract.Health{Status: "ok", Version: s.version})
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	body := contract.Status{
		Version:        s.version,
		SingboxVersion: s.singboxVersion,
		ConfigPath:     s.configPath,
	}

	if tx := s.applier.Current(); tx.ID != "" {
		body.Transaction = &tx
		body.TransactionHref = "/api/apply/" + tx.ID
	}

	writeJSON(s.log, w, http.StatusOK, body)
}

// handleConfig отдаёт конфиг ровно теми байтами, какими он лежит на диске:
// демон его не разбирает и не переформатирует (ADR-0002), иначе round-trip
// рукописного конфига терял бы форматирование (AC-2).
func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	data, err := s.reader.Read(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	// Конфиг меняется вне запросов клиента — применением, откатом, правкой по
	// SSH, — поэтому ответ не кэшируется.
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)

	if _, err := w.Write(data); err != nil {
		// Статус уже ушёл клиенту, вернуть ошибку некуда.
		s.log.Error("конфиг не дописан в ответ", "err", err)
	}
}

func (s *Server) handleVersions(w http.ResponseWriter, r *http.Request) {
	versions, err := s.reader.Versions(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, contract.Versions{Versions: versions})
}

// handleVersion отдаёт версию теми же байтами, какими она была применена:
// история хранит документ целиком, а не разбор (ADR-0002).
func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	data, err := s.readVersion(r)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)

	// gosec ведёт поток от номера версии в URL до записи в ответ и считает его
	// XSS. Из запроса приходит только целое число: содержимое читается из
	// служебного каталога демона, тип ответа задан JSON, HTML тут не бывает.
	if _, err := w.Write(data); err != nil { //nolint:gosec // G705: тело из файла демона, а не из запроса
		// Статус уже ушёл клиенту, вернуть ошибку некуда.
		s.log.Error("версия не дописана в ответ", "err", err)
	}
}

// handleVersionRestore возвращает версию обычным применением: отдельной записи
// в обход протокола нет, иначе откат на битую версию отрезал бы доступ без
// проверки бинарём, рестарта и окна подтверждения (ADR-0002).
func (s *Server) handleVersionRestore(w http.ResponseWriter, r *http.Request) {
	data, err := s.readVersion(r)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	tx, err := s.applier.Start(r.Context(), data)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusAccepted, tx)
}

func (s *Server) readVersion(r *http.Request) ([]byte, error) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		return nil, config.ErrNoVersion
	}

	return s.reader.ReadVersion(r.Context(), id)
}

// handleApply принимает конфиг байтами и запускает применение. Ответ приходит
// после проверки бинарём, но до конца цикла: применение асинхронно и живёт
// дольше запроса (ADR-0002).
func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	cfg, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxConfigBytes))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	tx, err := s.applier.Start(r.Context(), cfg)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusAccepted, tx)
}

func (s *Server) handleApplyState(w http.ResponseWriter, r *http.Request) {
	tx := s.applier.Current()
	if tx.ID != r.PathValue("id") {
		fail(s.log, w, r, apply.ErrUnknownTransaction)

		return
	}

	writeJSON(s.log, w, http.StatusOK, tx)
}

func (s *Server) handleApplyConfirm(w http.ResponseWriter, r *http.Request) {
	tx, err := s.applier.Confirm(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, tx)
}

// handleExplain объясняет маршрут соединения: сработавшее правило, его индекс
// в route.rules и цепочку. Каждое утверждение несёт происхождение, и ответов
// без него у ручки не бывает (AC-34, ADR-0007).
func (s *Server) handleExplain(w http.ResponseWriter, r *http.Request) {
	explanation, err := s.explain.Explain(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, explanation)
}

// ServiceState приводит состояние службы к форме ответа. Экспортируется,
// потому что то же тело уходит в поток событий: панель обязана получать один
// формат независимо от того, ручкой оно пришло или потоком (ADR-0006).
//
// Аргумент observed — найден ли на устройстве живой процесс sing-box. Он важен,
// когда служба демона остановлена: маршрутизацией может владеть чужой пакет,
// и без этого признака панель показывала бы «остановлен» при идущем трафике.
func ServiceState(state singbox.State, binary string, err error, observed bool) any {
	body := contract.Service{Status: "stopped", Binary: binary}

	if err != nil {
		body.LastError = "состояние сервиса не прочитано"

		return body
	}

	switch {
	case state.Running:
		body.Status = "running"
		body.Uptime = int(state.Uptime.Seconds())
		body.Managed = true
	case observed:
		// Процесс есть, но поднят не службой демона: возраст его procd не
		// знает, и панель показывает возраст прочерком.
		body.Status = "running"
	case state.Failed:
		body.Status = "failed"
		body.LastError = state.LastError
	}

	return body
}

// observeRuntime отвечает на вопрос «процесс sing-box вообще жив». Без
// наблюдателя ответ отрицательный: это то же, что было до его появления.
func (s *Server) observeRuntime(ctx context.Context) bool {
	return s.runtime != nil && s.runtime(ctx)
}

// handleHistory отдаёт историю трафика: точки идут подряд с шагом ответа.
func (s *Server) handleHistory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(s.log, w, http.StatusOK, contract.History{
		StepSeconds: s.history.Step(),
		Points:      s.history.Points(),
		Device:      s.history.Device(),
	})
}

// handleServiceState отдаёт состояние сервиса. Ошибка опроса — не отказ
// панели: NFR-1 требует, чтобы экран открылся и при недоступном сервисе.
func (s *Server) handleServiceState(w http.ResponseWriter, r *http.Request) {
	state, err := s.service.State(r.Context())
	if err != nil {
		s.log.Warn("состояние сервиса не прочитано", "err", err)
	}

	writeJSON(s.log, w, http.StatusOK, ServiceState(state, s.singboxVersion, err, s.observeRuntime(r.Context())))
}

// handleServiceAction выполняет действие и отдаёт новое состояние: гадать по
// коду ответа панель не должна.
func (s *Server) handleServiceAction(w http.ResponseWriter, r *http.Request) {
	var run func(context.Context) error

	switch r.PathValue("action") {
	case "start":
		run = s.service.Start
	case "stop":
		run = s.service.Stop
	case "restart":
		run = s.service.Restart
	default:
		fail(s.log, w, r, errNotFound)

		return
	}

	if err := run(r.Context()); err != nil {
		fail(s.log, w, r, err)

		return
	}

	s.handleServiceState(w, r)
}

// noUpgrade закрывает апгрейд до WebSocket на ветке прокси.
//
// Рантайм идёт панели одним потоком `GET /api/events` (ADR-0010), и второго
// пути к тем же данным быть не должно: прокси остаётся для ручек
// запрос-ответ. Отказ явный, потому что молча снятый заголовок превратил бы
// апгрейд в другой ответ того же адреса.
func (s *Server) noUpgrade(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Upgrade") != "" {
			fail(s.log, w, r, errUpgradeUnsupported)

			return
		}

		next.ServeHTTP(w, r)
	})
}

// handleAPINotFound закрывает всё неизвестное под /api/ JSON-ошибкой: отдать
// сюда index.html значит вернуть фронту HTML вместо разбираемого ответа.
func (s *Server) handleAPINotFound(w http.ResponseWriter, r *http.Request) {
	fail(s.log, w, r, errNotFound)
}

// spaHandler отдаёт встроенный интерфейс, а без него — объяснение. Демон
// обязан подниматься и обслуживать API, даже когда фронт в бинарь не попал
// (NFR-1).
func (s *Server) spaHandler() http.Handler {
	if s.spa != nil {
		return s.spa
	}

	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("интерфейс не собран: соберите демон через `make daemon`\n"))
	})
}
