// Package httpapi — HTTP-слой демона: маршруты, цепочка middleware и единый
// формат ответа. Предметные зависимости приходят конструктором, сам пакет их
// не собирает.
package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"metabox/internal/apply"
	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/dataplane"
	"metabox/internal/devices"
	"metabox/internal/history"
	"metabox/internal/procd"
	"metabox/internal/route"
	"metabox/internal/ruleset"
	"metabox/internal/singbox"
)

// maxConfigBytes — потолок на тело запроса. Конфиг приходит байтами, и без
// лимита один запрос забирает столько памяти, сколько прислали. Четыре
// мегабайта с запасом перекрывают конфиг на 500 правил.
const maxConfigBytes = 4 << 20

// maxApplyBytes — потолок конверта применения: сверх конфига в нём едут файлы
// списков, а большой список — это мегабайты доменов.
const maxApplyBytes = 16 << 20

// applyJSONType — тип тела конверта применения. Свой, а не application/json:
// сам конфиг — тоже JSON, и по общему типу конверт не отличить от голых байт
// конфига.
const applyJSONType = "application/vnd.metabox.apply+json"

// maxDeviceNameBytes — потолок тела правки имени: в нём одна строка до
// шестидесяти четырёх символов.
const maxDeviceNameBytes = 4 << 10

// Applier — цикл применения. Интерфейс объявлен здесь, у потребителя, и
// содержит только те методы, которыми пользуются хендлеры.
type Applier interface {
	Start(ctx context.Context, cfg []byte, lists apply.Lists, base, listsBase string) (apply.Transaction, error)
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
	ReadLists(ctx context.Context) (map[string][]byte, error)
	ListSums(ctx context.Context) (map[string]string, error)
	Versions(ctx context.Context) ([]config.Version, error)
	ReadVersion(ctx context.Context, id int) ([]byte, error)
	ReadVersionLists(ctx context.Context, id int) (map[string][]byte, error)
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
	// SingboxTags — build-теги бинаря. nil означает, что состав сборки не
	// прочитан, пустой список — что бинарь собран без тегов.
	SingboxTags []string
	// AllowedOrigin — разрешённый Origin сверх совпадения с Host. Пустая
	// строка означает, что послаблений нет: правило проверки источника действует
	// в чистом виде.
	AllowedOrigin string
	// SPA раздаёт встроенный интерфейс. nil означает, что бинарь собран без
	// фронта: API продолжает работать, а панель объясняет, чего не хватает.
	SPA http.Handler
	// Service управляет сервисом sing-box. nil означает, что управление
	// недоступно: панель откроется, а карточка сервиса не покажется.
	Service Service
	// Events — единый поток рантайма к панели. nil означает, что
	// поток не собран: экраны остаются на прокси Clash API.
	Events http.Handler
	// Clash проксирует рантайм sing-box под веткой clashapi.Prefix. nil
	// означает, что прокси не собран: панель откроется, а экраны рантайма
	// деградируют.
	Clash http.Handler
	// Explain объясняет маршрут соединения. nil означает, что
	// источника рантайма нет: экран соединений остаётся без объяснения.
	Explain Explainer
	// Hits отдаёт счёт срабатываний правил. nil означает, что его никто не
	// ведёт: список правил остаётся без колонки срабатываний.
	Hits HitsReader
	// History отдаёт историю трафика, накопленную демоном. nil означает, что
	// её никто не копит: график глубже минуты не показывается.
	History HistoryReader
	// RuleSets отдаёт каталог готовых наборов. nil означает, что каталога нет:
	// форма подключения набора остаётся со своим адресом.
	RuleSets RuleSetsReader
	// Runtime сообщает, работает ли на устройстве процесс sing-box. nil
	// означает, что наблюдать нечем: состояние службы тогда читается только у
	// procd, и чужой процесс панель не увидит.
	Runtime RuntimeObserver
	// Devices отдаёт устройства LAN и хранит их свои имена. nil означает, что
	// список не собран: панель подписывает источники соединений адресами.
	Devices DeviceRegistry
	// Dataplane читает модель сетевой обвязки. nil означает, что читать её
	// нечем: ручки обвязки нет.
	Dataplane DataplaneReader
	// Plane меняет модель обвязки протоколом применения. nil означает, что
	// модель только читается: ручки записи нет.
	Plane PlaneApplier
	// Logs читает лог sing-box. nil означает, что читать его нечем: ручек лога
	// нет.
	Logs LogReader
	// Diag проверяет сетевую обвязку. nil означает, что проверять нечем: ручки
	// диагностики нет.
	Diag Diagnoser
	// ConfigPath — путь файла, которым владеет демон. Панель показывает его
	// как факт об устройстве, а задаётся он флагами `-config-dir` и
	// `-config-name`: без этого поля интерфейс показывал бы значение по
	// умолчанию независимо от того, с чем демон запущен.
	ConfigPath string
}

// HitsReader отдаёт счёт срабатываний правил. Интерфейс объявлен здесь, у
// потребителя.
type HitsReader interface {
	Hits(ctx context.Context) (route.Hits, error)
}

// HistoryReader отдаёт накопленную историю трафика. Интерфейс объявлен здесь,
// у потребителя.
type HistoryReader interface {
	Points() []history.Point
	Recent() []history.Point
	Connections() []int
	Device() []history.DevicePoint
	Step() int
}

// RuleSetsReader отдаёт каталог готовых наборов. Интерфейс объявлен здесь, у
// потребителя.
type RuleSetsReader interface {
	Catalog() ruleset.Catalog
}

// DeviceRegistry отдаёт устройства LAN и меняет их свои имена. Интерфейс
// объявлен здесь, у потребителя.
type DeviceRegistry interface {
	List(ctx context.Context) ([]devices.Device, error)
	Rename(ctx context.Context, mac, name string) error
}

// DataplaneReader читает секцию сетевой обвязки и признак её применения.
// Интерфейс объявлен здесь, у потребителя.
type DataplaneReader interface {
	Snapshot(ctx context.Context) (dataplane.Snapshot, error)
	Applied(ctx context.Context) (bool, dataplane.AppliedReason, error)
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
	singboxTags    []string
	allowedOrigin  string
	spa            http.Handler
	service        Service
	events         http.Handler
	clash          http.Handler
	explain        Explainer
	hits           HitsReader
	history        HistoryReader
	ruleSets       RuleSetsReader
	runtime        RuntimeObserver
	devices        DeviceRegistry
	dataplane      DataplaneReader
	plane          PlaneApplier
	logs           LogReader
	diag           Diagnoser
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
		singboxTags:    opts.SingboxTags,
		allowedOrigin:  opts.AllowedOrigin,
		spa:            opts.SPA,
		service:        opts.Service,
		events:         opts.Events,
		clash:          opts.Clash,
		explain:        opts.Explain,
		hits:           opts.Hits,
		history:        opts.History,
		ruleSets:       opts.RuleSets,
		runtime:        opts.Runtime,
		devices:        opts.Devices,
		dataplane:      opts.Dataplane,
		plane:          opts.Plane,
		logs:           opts.Logs,
		diag:           opts.Diag,
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
	mux.HandleFunc("GET /api/config/rule-sets", s.handleConfigLists)
	mux.HandleFunc("GET /api/config/versions", s.handleVersions)
	mux.HandleFunc("GET /api/config/versions/{id}", s.handleVersion)
	mux.HandleFunc("POST /api/config/versions/{id}/restore", s.handleVersionRestore)
	mux.HandleFunc("POST /api/apply", s.handleApply)
	mux.HandleFunc("GET /api/apply/{id}", s.handleApplyState)
	mux.HandleFunc("POST /api/apply/{id}/confirm", s.handleApplyConfirm)

	if s.explain != nil {
		mux.HandleFunc("GET /api/connections/{id}/route", s.handleExplain)
	}

	if s.hits != nil {
		mux.HandleFunc("GET /api/rules/hits", s.handleHits)
	}

	if s.history != nil {
		mux.HandleFunc("GET /api/history", s.handleHistory)
	}

	if s.ruleSets != nil {
		mux.HandleFunc("GET /api/rule-sets/catalog", s.handleRuleSets)
	}

	if s.devices != nil {
		mux.HandleFunc("GET /api/devices", s.handleDevices)
		mux.HandleFunc("PUT /api/devices/{mac}", s.handleDeviceName)
	}

	if s.dataplane != nil {
		mux.HandleFunc("GET /api/dataplane", s.handleDataplane)
	}

	if s.plane != nil {
		mux.HandleFunc("PUT /api/dataplane", s.handleDataplaneChange)
		mux.HandleFunc("GET /api/dataplane/apply/{id}", s.handleDataplaneState)
		mux.HandleFunc("POST /api/dataplane/apply/{id}/confirm", s.handleDataplaneConfirm)
	}

	if s.logs != nil {
		mux.HandleFunc("GET /api/logs", s.handleLogs)
		mux.HandleFunc("GET /api/logs/stream", s.handleLogStream)
		mux.HandleFunc("POST /api/logs/clear", s.handleLogsClear)
	}

	if s.diag != nil {
		mux.HandleFunc("GET /api/diag", s.handleDiag)
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
		Runtime:        s.runtimeSources(),
	}

	if s.singboxTags != nil {
		body.SingboxBuild = &contract.SingboxBuild{Tags: s.singboxTags}
	}

	if tx := s.applier.Current(); tx.ID != "" {
		body.Transaction = &tx
		body.TransactionHref = "/api/apply/" + tx.ID
	}

	if s.plane != nil {
		if tx := s.plane.Current(); tx.ID != "" {
			body.DataplaneTransaction = &tx
			body.DataplaneTransactionHref = "/api/dataplane/apply/" + tx.ID
		}
	}

	writeJSON(s.log, w, http.StatusOK, body)
}

// runtimeSources собирает состав источников по тому, что демону передали:
// поток читает рантайм у Clash API, прокси отдаёт его ручки как есть. Выбирать
// источник соединений пока не из чего — gRPC-ветка не реализована.
func (s *Server) runtimeSources() contract.Runtime {
	// Пустой срез, а не nil: nil уезжает в JSON как null, и панель разбирала бы
	// список источников не массивом.
	out := contract.Runtime{Sources: []contract.RuntimeSource{}}

	if s.events != nil || s.clash != nil {
		out.Sources = append(out.Sources, contract.SourceClashAPI)
	}

	if s.events != nil {
		out.Connections = contract.SourceClashAPI
	}

	return out
}

// handleConfig отдаёт конфиг ровно теми байтами, какими он лежит на диске:
// демон его не разбирает и не переформатирует, иначе round-trip
// рукописного конфига терял бы форматирование.
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
	// Отпечаток отданных байт: панель возвращает его в If-Match применения,
	// и правка файла между чтением и Apply не затирается молча.
	digest := sha256.Sum256(data)
	w.Header().Set("ETag", `"`+hex.EncodeToString(digest[:])+`"`)
	w.WriteHeader(http.StatusOK)

	if _, err := w.Write(data); err != nil {
		// Статус уже ушёл клиенту, вернуть ошибку некуда.
		s.log.Error("конфиг не дописан в ответ", "err", err)
	}
}

// handleConfigLists отдаёт файлы своих списков из подкаталога rule-sets вместе
// с отпечатком набора: панель возвращает его в lists_base применения, и правка
// файла между чтением и Apply не затирается молча.
func (s *Server) handleConfigLists(w http.ResponseWriter, r *http.Request) {
	files, err := s.reader.ReadLists(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	out := contract.RuleSetFiles{Files: make(map[string]string, len(files))}
	sums := make(map[string]string, len(files))

	for name, data := range files {
		out.Files[name] = string(data)
		sums[name] = config.Sum(data)
	}

	out.Etag = config.ListsEtag(sums)

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(s.log, w, http.StatusOK, out)
}

func (s *Server) handleVersions(w http.ResponseWriter, r *http.Request) {
	versions, err := s.reader.Versions(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	out := contract.Versions{Versions: versions}

	data, err := s.reader.Read(r.Context())
	switch {
	case errors.Is(err, config.ErrNoConfig):
	case err != nil:
		fail(s.log, w, r, err)

		return
	default:
		out.CurrentSum = config.Sum(data)
	}

	sums, err := s.reader.ListSums(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	out.CurrentListsSum = config.ListsEtag(sums)

	writeJSON(s.log, w, http.StatusOK, out)
}

// handleVersion отдаёт версию теми же байтами, какими она была применена:
// история хранит документ целиком, а не разбор.
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
// проверки бинарём, рестарта и окна подтверждения.
func (s *Server) handleVersionRestore(w http.ResponseWriter, r *http.Request) {
	data, err := s.readVersion(r)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	lists, err := s.versionLists(r)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	// Восстановление версии — осознанный откат на её байты, а не правка
	// поверх текущего файла: базы для сверки у него нет.
	tx, err := s.applier.Start(r.Context(), data, lists, "", "")
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusAccepted, tx)
}

// versionLists собирает изменения файлов списков, возвращающие их к снимку
// версии. Версия без снимка сохранена демоном, который списков не снимал, —
// её восстановление списков не трогает, как и раньше.
func (s *Server) versionLists(r *http.Request) (apply.Lists, error) {
	id, err := pathVersionID(r)
	if err != nil {
		return apply.Lists{}, err
	}

	snapshot, err := s.reader.ReadVersionLists(r.Context(), id)
	if errors.Is(err, config.ErrNoVersionLists) {
		return apply.Lists{}, nil
	}
	if err != nil {
		return apply.Lists{}, err
	}

	current, err := s.reader.ListSums(r.Context())
	if err != nil {
		return apply.Lists{}, err
	}

	return apply.SnapshotLists(snapshot, current), nil
}

func (s *Server) readVersion(r *http.Request) ([]byte, error) {
	id, err := pathVersionID(r)
	if err != nil {
		return nil, err
	}

	return s.reader.ReadVersion(r.Context(), id)
}

func pathVersionID(r *http.Request) (int, error) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		return 0, config.ErrNoVersion
	}

	return id, nil
}

// handleApply принимает конфиг и запускает применение. Тело — либо голые
// байты конфига, либо конверт с файлами списков под своим Content-Type. Ответ
// приходит после проверки бинарём, но до конца цикла: применение асинхронно и
// живёт дольше запроса.
func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	cfg, lists, listsBase, err := readApplyBody(w, r)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	tx, err := s.applier.Start(r.Context(), cfg, lists, baseSum(r.Header.Get("If-Match")), listsBase)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusAccepted, tx)
}

func readApplyBody(w http.ResponseWriter, r *http.Request) ([]byte, apply.Lists, string, error) {
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))

	if mediaType != applyJSONType {
		cfg, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxConfigBytes))

		return cfg, apply.Lists{}, "", err
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxApplyBytes))
	if err != nil {
		return nil, apply.Lists{}, "", err
	}

	var envelope contract.ApplyEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, apply.Lists{}, "", errors.Join(errBadApplyEnvelope, err)
	}

	lists := apply.Lists{Remove: envelope.RemoveLists}

	if len(envelope.Lists) > 0 {
		lists.Put = make(map[string][]byte, len(envelope.Lists))
		for name, content := range envelope.Lists {
			lists.Put[name] = []byte(content)
		}
	}

	return []byte(envelope.Config), lists, envelope.ListsBase, nil
}

// baseSum достаёт sha256 базы из If-Match: значение приходит тем же ETag, что
// отдал GET /api/config. Пустое значение и «*» означают применение без
// сверки — так же работает запрос совсем без заголовка.
func baseSum(header string) string {
	value := strings.TrimSpace(header)
	value = strings.TrimPrefix(value, "W/")
	value = strings.Trim(value, `"`)

	if value == "*" {
		return ""
	}

	return value
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
// без него у ручки не бывает.
func (s *Server) handleExplain(w http.ResponseWriter, r *http.Request) {
	explanation, err := s.explain.Explain(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, explanation)
}

func (s *Server) handleHits(w http.ResponseWriter, r *http.Request) {
	hits, err := s.hits.Hits(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, hits)
}

func (s *Server) handleRuleSets(w http.ResponseWriter, _ *http.Request) {
	writeJSON(s.log, w, http.StatusOK, s.ruleSets.Catalog())
}

func (s *Server) handleDevices(w http.ResponseWriter, r *http.Request) {
	list, err := s.devices.List(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, contract.Devices{Devices: list})
}

// handleDeviceName задаёт своё имя и отдаёт список целиком: подпись
// устройства зависит от всех источников сразу, и считать её панели не по чему.
func (s *Server) handleDeviceName(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxDeviceNameBytes))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	var req contract.DeviceName
	if err := json.Unmarshal(body, &req); err != nil {
		fail(s.log, w, r, errors.Join(errBadDeviceBody, err))

		return
	}

	if err := s.devices.Rename(r.Context(), r.PathValue("mac"), req.Name); err != nil {
		fail(s.log, w, r, err)

		return
	}

	s.handleDevices(w, r)
}

// handleDataplane отдаёт модель и отпечаток секции в ETag: модель разбирается
// из того же снимка, иначе правка между двумя чтениями UCI дала бы отпечаток
// не той модели, что ушла клиенту.
func (s *Server) handleDataplane(w http.ResponseWriter, r *http.Request) {
	snap, err := s.dataplane.Snapshot(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	model, err := snap.Model()
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	applied, reason, err := s.dataplane.Applied(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	w.Header().Set("ETag", `"`+snap.Sum()+`"`)
	writeJSON(s.log, w, http.StatusOK, contract.Dataplane{Model: model, Applied: applied, AppliedReason: reason})
}

// ServiceState приводит состояние службы к форме ответа. Экспортируется,
// потому что то же тело уходит в поток событий: панель обязана получать один
// формат независимо от того, ручкой оно пришло или потоком.
//
// Аргумент observed — найден ли на устройстве живой процесс sing-box. Он важен,
// когда служба демона остановлена: маршрутизацией может владеть чужой пакет,
// и без этого признака панель показывала бы «остановлен» при идущем трафике.
func ServiceState(state singbox.State, binary string, err error, observed bool) any {
	body := contract.Service{Status: "stopped", Binary: binary}

	if err != nil {
		body.LastError = "состояние сервиса не прочитано"
		body.LastErrorCode = contract.ServiceStateUnread

		if errors.Is(err, procd.ErrAmbiguousInstance) {
			body.LastError = err.Error()
			body.LastErrorCode = contract.ServiceInstanceAmbiguous
		}

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
		Recent:      s.history.Recent(),
		Connections: s.history.Connections(),
	})
}

// handleServiceState отдаёт состояние сервиса. Ошибка опроса — не отказ
// панели: экран обязан открыться и при недоступном сервисе.
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
// Рантайм идёт панели одним потоком `GET /api/events`, и второго
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
// обязан подниматься и обслуживать API, даже когда фронт в бинарь не попал.
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
