// Command metaboxd is the metabox daemon. It serves the web UI and owns the
// sing-box configuration on the device.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"metabox/internal/apply"
	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/device"
	"metabox/internal/events"
	"metabox/internal/history"
	"metabox/internal/httpapi"
	"metabox/internal/procd"
	"metabox/internal/route"
	"metabox/internal/ruleset"
	"metabox/internal/singbox"
	"metabox/internal/version"
	"metabox/internal/webui"
)

const (
	readHeaderTimeout = 10 * time.Second
	readTimeout       = 30 * time.Second
	idleTimeout       = 60 * time.Second
	shutdownTimeout   = 10 * time.Second

	// Потолок на один вызов бинаря. `sing-box check` на большом конфиге
	// укладывается в секунды, но зависший процесс держать нельзя.
	binaryTimeout = 30 * time.Second

	healthRequestTimeout = 5 * time.Second
	healthPollInterval   = 500 * time.Millisecond

	// Периоды опроса источников потока; чем они заданы — events.Options.
	connectionsInterval = time.Second
	serviceInterval     = 5 * time.Second
	systemInterval      = 2 * time.Second
	streamRetryInterval = 3 * time.Second

	// История рантайма: точка раз в десять секунд, 2160 точек до первого
	// укрупнения шага — шесть часов. Дальше кольцо не выбрасывает старое, а
	// сливает соседние точки и удваивает шаг, поэтому график всегда покрывает
	// всё время работы демона.
	historyStepSeconds = 10
	historyTrafficStep = historyStepSeconds
	historyPoints      = 6 * int(time.Hour/time.Second) / historyStepSeconds

	// Каталог наборов: потолок на запрос дерева к GitHub и пауза перед
	// повтором неудачной сверки — на старте роутера сеть и часы поднимаются
	// позже демона.
	ruleSetRequestTimeout = 30 * time.Second
	ruleSetRetryInterval  = time.Hour
)

// settings — то, что демон получает флагами. Значения по умолчанию
// устройственные: запущенный без аргументов на роутере демон работает.
type settings struct {
	addr          string
	allowedOrigin string
	configDir     string
	configName    string
	serviceDir    string
	binary        string
	initScript    string
	ubus          string
	logread       string
	clashPort     int
	confirmWindow time.Duration
	cycleTimeout  time.Duration
	ruleSetPeriod time.Duration
	logLevel      slog.Level
}

func main() {
	var s settings

	flag.StringVar(&s.addr, "listen", "127.0.0.1:8080",
		"адреса и порты, которые слушает демон; несколько — через запятую")
	flag.StringVar(&s.allowedOrigin, "allowed-origin", "",
		"дополнительный разрешённый Origin мутирующих запросов; нужен дев-стенду")
	flag.StringVar(&s.configDir, "config-dir", "/etc/sing-box", "каталог конфига sing-box")
	flag.StringVar(&s.configName, "config-name", "config.json", "имя файла конфига в этом каталоге")
	flag.StringVar(&s.serviceDir, "state-dir", "/etc/metabox",
		"служебный каталог демона под бэкап и состояние транзакции; вне каталога конфига")
	flag.StringVar(&s.binary, "singbox", "/usr/bin/sing-box", "путь к бинарю sing-box")
	flag.StringVar(&s.initScript, "init-script", "/etc/init.d/sing-box", "путь к init-скрипту сервиса")
	flag.StringVar(&s.ubus, "ubus", "/bin/ubus", "путь к ubus: через него читается состояние службы у procd")
	flag.StringVar(&s.logread, "logread", "/sbin/logread",
		"путь к logread: из него берётся причина падения sing-box; пустой отключает чтение")
	flag.IntVar(&s.clashPort, "clash-port", 9090, "порт Clash API, если демон заводит секцию сам")
	flag.DurationVar(&s.confirmWindow, "confirm-window", time.Minute,
		"сколько ждать подтверждения связи до автоотката")
	flag.DurationVar(&s.cycleTimeout, "cycle-timeout", 2*time.Minute,
		"потолок на шаги применения от бэкапа до healthcheck")
	flag.DurationVar(&s.ruleSetPeriod, "rule-set-refresh", 24*time.Hour,
		"как часто сверять каталог наборов с поставщиками; 0 — без сверки: каталог из кэша или встроенного снимка")

	s.logLevel = slog.LevelInfo
	flag.TextVar(&s.logLevel, "log-level", slog.LevelInfo, "уровень логов: debug, info, warn, error")
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: s.logLevel}))

	if err := run(log, s); err != nil {
		log.Error("демон остановлен", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger, s settings) error {
	manager, store, service, err := build(log, s)
	if err != nil {
		return err
	}
	defer manager.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Незавершённая транзакция доигрывается до того, как демон начнёт
	// принимать запросы: питание, снятое в окне подтверждения, иначе оставило
	// бы устройство на неподтверждённом конфиге навсегда.
	if err := manager.Replay(ctx); err != nil {
		log.Error("незавершённая транзакция не доиграна", "err", err)
	}

	spa, err := webui.Handler()
	if errors.Is(err, webui.ErrNotBuilt) {
		log.Warn("интерфейс в бинарь не попал, отдаём только API", "как_починить", "make daemon")
		spa = nil
	} else if err != nil {
		return fmt.Errorf("встроенный интерфейс: %w", err)
	}

	// Неудача не останавливает демон: панель обязана работать и при
	// отсутствующем sing-box, просто без версии бинаря.
	build, err := service.Build(ctx)
	singboxVersion := build.Version
	if err != nil {
		log.Warn("версия sing-box не прочитана", "err", err)
	}

	// Отсутствие прокси не останавливает демон: панель обязана открываться
	// и без рантайма, просто с деградировавшими экранами.
	var clashHandler http.Handler

	clash, err := clashapi.NewProxy(configSettings(store), httpapi.ProxyError(log))
	if err != nil {
		log.Warn("прокси Clash API не собран", "err", err)
	} else {
		clashHandler = clash
	}

	deviceHistory := history.NewDevice(historyStepSeconds/int(systemInterval/time.Second), historyPoints)
	sysinfo := device.New(device.Options{Port: clashPort(store), History: deviceHistory})

	source := events.NewClashSource(
		clashSettings(store),
		serviceState(service, singboxVersion, sysinfo),
		systemState(sysinfo, log),
		healthRequestTimeout,
	)

	hub := events.New(
		source,
		log,
		events.Options{
			ConnectionsInterval: connectionsInterval,
			ServiceInterval:     serviceInterval,
			SystemInterval:      systemInterval,
			RetryInterval:       streamRetryInterval,
		},
	)

	// Доля канала через sing-box считается за всё время работы демона, поэтому
	// учёт не ждёт подписчика: приращения, не снятые вовремя, теряются.
	traffic := history.New(historyTrafficStep, historyStepSeconds, historyPoints)

	accounting := events.NewAccounting(source, sysinfo, traffic, log, events.Options{
		SystemInterval: systemInterval,
		RetryInterval:  streamRetryInterval,
	})

	accounting.Start()
	defer accounting.Close()

	// Счёт правил, как и учёт трафика, идёт с запуска демона и не ждёт панель:
	// соединение, не замеченное вовремя, задним числом не засчитать.
	connectionSizes := &history.Connections{}
	hits := route.NewCounter(source, log, connectionsInterval, connectionSizes)
	hits.Start()
	defer hits.Close()

	github := ruleset.NewGitHub(ruleset.GitHubAPI, "metaboxd/"+version.Version, ruleSetRequestTimeout)

	ruleSets, err := ruleset.NewUpdater(ctx, github, store, log, s.ruleSetPeriod, ruleSetRetryInterval)
	if err != nil {
		return fmt.Errorf("каталог наборов: %w", err)
	}

	ruleSets.Start()
	defer ruleSets.Close()

	api := httpapi.NewServer(manager, store, log, httpapi.Options{
		Version:        version.Version,
		SingboxVersion: singboxVersion,
		SingboxTags:    build.Tags,
		AllowedOrigin:  s.allowedOrigin,
		SPA:            spa,
		Service:        service,
		Events:         hub,
		Clash:          clashHandler,
		Explain:        route.NewExplainer(source),
		Hits:           hits,
		History:        historyOf(traffic, deviceHistory, connectionSizes),
		RuleSets:       ruleSets,
		Runtime:        sysinfo.Alive,
		ConfigPath:     store.Path(),
	})

	listeners, failures, err := httpapi.Listen(httpapi.Addrs(s.addr))
	if err != nil {
		return fmt.Errorf("слушатели: %w", err)
	}

	for _, failure := range failures {
		log.Warn("адрес не открыт, панель на нём недоступна", "err", failure)
	}

	srv := &http.Server{
		Handler:           api,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		IdleTimeout:       idleTimeout,
		// WriteTimeout намеренно не задан: он режет долгие ответы — прокси
		// Clash API и поток соединений. Дедлайн ставится точечно на ответе.
		ErrorLog: slog.NewLogLogger(log.Handler(), slog.LevelError),
	}

	// Поток переживает запрос, поэтому Shutdown его сам не закроет: без этого
	// остановка демона с открытой панелью упиралась бы в таймаут.
	srv.RegisterOnShutdown(hub.Close)

	serveErr := make(chan error, len(listeners))

	for _, listener := range listeners {
		go func() {
			err := srv.Serve(listener)
			if errors.Is(err, http.ErrServerClosed) {
				err = nil
			}
			serveErr <- err
		}()
	}

	log.Info("демон запущен", "addr", httpapi.Bound(listeners), "version", version.Version)

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("остановка сервера: %w", err)
	}

	log.Info("демон остановлен")

	return <-serveErr
}

// runCommand переводит запуск команды к виду, который ждёт procd: свой тип
// результата тот пакет объявить не может, иначе получился бы цикл импортов.
func runCommand(exec *singbox.Exec) procd.Runner {
	return func(ctx context.Context, name string, args ...string) (string, int, error) {
		res, err := exec.Run(ctx, name, args...)

		return res.Stdout, res.ExitCode, err
	}
}

// clashSettings приводит настройки контроллера к виду, который ждёт поток
// событий: у него свой тип, чтобы пакет не зависел от секции конфига.
func clashSettings(store *config.Store) events.Resolver {
	resolve := configSettings(store)

	return func(ctx context.Context) (events.Settings, error) {
		settings, err := resolve(ctx)
		if err != nil {
			return events.Settings{}, err
		}

		base, err := settings.BaseURL()
		if err != nil {
			return events.Settings{}, err
		}

		return events.Settings{BaseURL: base, Secret: settings.Secret}, nil
	}
}

// serviceState отдаёт в поток то же состояние службы, что и ручка: панель
// обязана видеть одно и то же независимо от того, откуда пришло.
func serviceState(service *singbox.Client, binary string, sysinfo *device.Reader) events.ServiceReader {
	return func(ctx context.Context) (json.RawMessage, error) {
		// Отказ опроса не прерывает публикацию: иначе поток замирал бы на
		// последнем удачном значении, и панель показывала бы упавший сервис
		// работающим.
		state, err := service.State(ctx)

		return json.Marshal(httpapi.ServiceState(state, binary, err, sysinfo.Alive(ctx)))
	}
}

// systemState отдаёт в поток показания устройства. Частичный отказ чтения не
// отменяет публикацию: термозон может не быть, а процесс sing-box может быть
// не запущен — остальные показания при этом читаются.
func systemState(reader *device.Reader, log *slog.Logger) events.SystemReader {
	return func(ctx context.Context) (json.RawMessage, error) {
		stat, err := reader.Read(ctx)
		if err != nil {
			log.Debug("показания устройства прочитаны частично", "err", err)
		}

		return json.Marshal(stat)
	}
}

// historyOf сводит два кольца в одного читателя: ручка истории отдаёт трафик и
// показания платы одним ответом, а колец у них два — шаг считается по-разному.
type historyReader struct {
	*history.Traffic
	device      *history.Device
	connections *history.Connections
}

func (h historyReader) Device() []history.DevicePoint { return h.device.Points() }

func (h historyReader) Connections() []int { return h.connections.Recent() }

func historyOf(traffic *history.Traffic, device *history.Device, connections *history.Connections) httpapi.HistoryReader {
	return historyReader{Traffic: traffic, device: device, connections: connections}
}

// clashPort отдаёт порт контроллера из применённого конфига: по нему демон
// находит процесс, который ведёт маршрутизацию.
func clashPort(store *config.Store) device.PortResolver {
	resolve := configSettings(store)

	return func(ctx context.Context) (int, error) {
		settings, err := resolve(ctx)
		if err != nil {
			return 0, err
		}

		_, port, err := net.SplitHostPort(settings.Address)
		if err != nil {
			return 0, fmt.Errorf("адрес контроллера %q: %w", settings.Address, err)
		}

		return strconv.Atoi(port)
	}
}

// configSettings читает адрес и секрет контроллера из применённого конфига.
// Читается на каждый запрос: порт контроллера меняется вместе с конфигом, а
// кэш отправил бы прокси на адрес, которого уже нет.
func configSettings(store *config.Store) clashapi.Resolver {
	return func(ctx context.Context) (clashapi.Settings, error) {
		data, err := store.Read(ctx)
		if err != nil {
			return clashapi.Settings{}, err
		}

		return clashapi.Read(data)
	}
}

// build собирает граф зависимостей. Отдельной функцией, чтобы run занимался
// только запуском и остановкой.
func build(log *slog.Logger, s settings) (*apply.Manager, *config.Store, *singbox.Client, error) {
	store, err := config.NewStore(s.configDir, s.configName, s.serviceDir)
	if err != nil {
		return nil, nil, nil, err
	}

	exec := singbox.NewExec(binaryTimeout)

	service, err := singbox.New(exec, s.binary, s.initScript, s.logread, procd.New(runCommand(exec), s.ubus))
	if err != nil {
		return nil, nil, nil, err
	}

	health := clashapi.NewChecker(healthRequestTimeout, healthPollInterval)

	manager := apply.New(store, service, health, nil, log, apply.Options{
		Window:       s.confirmWindow,
		ClashPort:    s.clashPort,
		CycleTimeout: s.cycleTimeout,
	})

	return manager, store, service, nil
}
