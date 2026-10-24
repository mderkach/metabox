// Command metaboxd is the metabox daemon. It serves the web UI and owns the
// sing-box configuration on the device.
package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"metabox/internal/apply"
	"metabox/internal/auth"
	"metabox/internal/cert"
	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/dataplane"
	"metabox/internal/device"
	"metabox/internal/devices"
	"metabox/internal/diag"
	"metabox/internal/events"
	"metabox/internal/history"
	"metabox/internal/httpapi"
	"metabox/internal/logs"
	"metabox/internal/mcp"
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

	// Ceiling for one binary call. `sing-box check` on a big config
	// fits in seconds, but a hung process cannot be held.
	binaryTimeout = 30 * time.Second

	healthRequestTimeout = 5 * time.Second
	healthPollInterval   = 500 * time.Millisecond

	// DNS probe: the first query after a restart brings up the connection to upstream and
	// may take seconds, so there are several attempts. A failure of all three is about
	// seven seconds on top of the API poll.
	dnsProbeTimeout  = 2 * time.Second
	dnsProbeAttempts = 3

	// Polling periods of the stream sources; what sets them is events.Options.
	// connectionsInterval is the period of the hit counter: it takes the connections
	// snapshot and it gives it to the stream.
	connectionsInterval = time.Second
	serviceInterval     = 5 * time.Second
	systemInterval      = 2 * time.Second
	streamRetryInterval = 3 * time.Second

	// Runtime history: a point every ten seconds, 2160 points before the first
	// step coarsening, six hours. After that the ring does not drop the old but
	// merges neighbouring points and doubles the step, so the chart always covers
	// the whole daemon runtime.
	historyStepSeconds = 10
	historyTrafficStep = historyStepSeconds
	historyPoints      = 6 * int(time.Hour/time.Second) / historyStepSeconds

	// Rule set catalog: the ceiling for a tree request to GitHub and the pause before
	// retrying a failed check: at router start the network and clock come up
	// later than the daemon.
	ruleSetRequestTimeout = 30 * time.Second
	ruleSetRetryInterval  = time.Hour

	// Ceiling of one diagnostics check: the node measurement through the Clash API and the direct
	// request run in parallel, and the report waits for the slowest of them.
	diagTimeout = 5 * time.Second

	// Polling period of the log.output file in the log stream.
	logPollInterval = 500 * time.Millisecond
)

// settings is what the daemon receives by flags. The default values
// are device ones: a daemon started without arguments on the router works.
type settings struct {
	addr          string
	allowedOrigin string
	https         bool
	httpsCert     string
	httpsKey      string
	configDir     string
	configName    string
	serviceDir    string
	binary        string
	initScript    string
	instance      string
	ubus          string
	logread       string
	dhcpLeases    string
	uci           string
	nft           string
	healthDNSName string
	diagURL       string
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
	flag.BoolVar(&s.https, "https", false,
		"обслуживать панель по HTTPS с сертификатом от собственного корня демона; http на том же порту перенаправляется")
	flag.StringVar(&s.httpsCert, "https-cert", "",
		"путь к готовому сертификату панели в PEM вместе с -https-key; тогда свой корень демон не выпускает")
	flag.StringVar(&s.httpsKey, "https-key", "", "путь к ключу сертификата из -https-cert")
	flag.StringVar(&s.configDir, "config-dir", "/etc/sing-box", "каталог конфига sing-box")
	flag.StringVar(&s.configName, "config-name", "config.json", "имя файла конфига в этом каталоге")
	flag.StringVar(&s.serviceDir, "state-dir", "/etc/metabox",
		"служебный каталог демона под бэкап и состояние транзакции; вне каталога конфига")
	flag.StringVar(&s.binary, "singbox", "/usr/bin/sing-box", "путь к бинарю sing-box")
	flag.StringVar(&s.initScript, "init-script", "/etc/init.d/metabox-singbox", "путь к init-скрипту сервиса")
	flag.StringVar(&s.instance, "service-instance", "sing-box",
		"инстанс procd, в котором служба init-скрипта держит sing-box; пустой — единственный инстанс службы")
	flag.StringVar(&s.ubus, "ubus", "/bin/ubus", "путь к ubus: через него читается состояние службы у procd")
	flag.StringVar(&s.logread, "logread", "/sbin/logread",
		"путь к logread: из него берутся лог и причина падения sing-box; пустой отключает чтение")
	flag.StringVar(&s.dhcpLeases, "dhcp-leases", "/tmp/dhcp.leases", "файл аренд dnsmasq: из него берутся устройства LAN")
	flag.StringVar(&s.uci, "uci", "/sbin/uci",
		"путь к uci: через него читаются статические аренды из UCI dhcp, читается и пишется модель обвязки в UCI metabox")
	flag.StringVar(&s.nft, "nft", "/usr/sbin/nft",
		"путь к nft: через него демон видит, стоят ли правила обвязки; пустой отключает проверку")
	flag.StringVar(&s.healthDNSName, "health-dns-name", "cloudflare.com",
		"имя, которое dns-in sing-box обязан разрешить после рестарта, иначе откат; пустое выключает DNS-пробу")
	flag.StringVar(&s.diagURL, "diag-url", "https://www.gstatic.com/generate_204",
		"адрес, по которому диагностика проверяет выход в интернет через узел и напрямую")
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
	planeExec := singbox.NewExec(binaryTimeout)
	plane := dataplane.New(dataplane.Runner(runCommand(planeExec)), dataplane.Options{
		UCI:   s.uci,
		NFT:   s.nft,
		Batch: batchCommand(planeExec),
	})

	manager, planeTx, store, service, err := build(log, s, plane)
	if err != nil {
		return err
	}
	defer manager.Close()
	defer planeTx.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// An unfinished transaction is replayed before the daemon starts
	// accepting requests: a power loss within the confirmation window would otherwise leave
	// the device on the unconfirmed config forever.
	if err := manager.Replay(ctx); err != nil {
		log.Error("незавершённая транзакция не доиграна", "err", err)
	}

	if err := planeTx.Replay(ctx); err != nil {
		log.Error("незавершённая смена обвязки не доиграна", "err", err)
	}

	spa, err := webui.Handler()
	if errors.Is(err, webui.ErrNotBuilt) {
		log.Warn("интерфейс в бинарь не попал, отдаём только API", "как_починить", "make daemon")
		spa = nil
	} else if err != nil {
		return fmt.Errorf("встроенный интерфейс: %w", err)
	}

	// A failure does not stop the daemon: the panel must work with a
	// missing sing-box too, just without the binary version.
	build, err := service.Build(ctx)
	singboxVersion := build.Version
	if err != nil {
		log.Warn("версия sing-box не прочитана", "err", err)
	}

	// A missing proxy does not stop the daemon: the panel must open
	// without the runtime too, just with degraded screens.
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
			ServiceInterval: serviceInterval,
			SystemInterval:  systemInterval,
			RetryInterval:   streamRetryInterval,
		},
	)

	// The channel share through sing-box is counted over the whole daemon runtime, so
	// the accounting does not wait for a subscriber: increments not taken in time are lost.
	traffic := history.New(historyTrafficStep, historyStepSeconds, historyPoints)

	accounting := events.NewAccounting(source, sysinfo, traffic, log, events.Options{
		SystemInterval: systemInterval,
		RetryInterval:  streamRetryInterval,
	})

	accounting.Start()
	defer accounting.Close()

	// The rule count, like traffic accounting, runs from the daemon start and does not wait for the panel:
	// a connection not noticed in time cannot be counted retroactively. Its same
	// snapshot feeds the connections topic of the stream: with the panel open the
	// `/connections` poll stays single.
	connectionSizes := &history.Connections{}
	hits := route.NewCounter(source, log, route.CounterOptions{
		Interval:  connectionsInterval,
		Retry:     streamRetryInterval,
		Sizes:     connectionSizes,
		Snapshots: hub.PublishConnections,
	})
	hits.Start()
	defer hits.Close()

	github := ruleset.NewGitHub(ruleset.GitHubAPI, "metaboxd/"+version.Version, ruleSetRequestTimeout)

	ruleSets, err := ruleset.NewUpdater(ctx, github, store, log, s.ruleSetPeriod, ruleSetRetryInterval)
	if err != nil {
		return fmt.Errorf("каталог наборов: %w", err)
	}

	ruleSets.Start()
	defer ruleSets.Close()

	// Without a device list the panel opens and labels sources with
	// addresses; a broken names file is not overwritten by the next edit.
	var lan httpapi.DeviceRegistry

	registry, err := devices.New(ctx, devices.Runner(runCommand(singbox.NewExec(binaryTimeout))), store, devices.Options{
		Leases: s.dhcpLeases,
		UCI:    s.uci,
	})
	if err != nil {
		log.Error("список устройств не собран", "err", err)
	} else {
		lan = registry
	}

	// A broken password file stops the start instead of opening the panel: the owner who
	// set a password must not lose the protection silently.
	guard, err := auth.New(ctx, store, auth.Options{Log: log})
	if err != nil {
		return fmt.Errorf("пароль панели: %w", err)
	}

	var probe diag.DNSProber
	if s.healthDNSName != "" {
		probe = clashapi.NewDNSProbe(s.healthDNSName, dnsProbeTimeout, healthPollInterval, 1)
	}

	// Without certificates there is nothing to serve HTTPS with, so a pair that cannot
	// be read or a store that cannot hold the daemon's own stops the start; the owner
	// turns HTTPS off in UCI to run without them.
	var (
		tlsConfig *tls.Config
		rootCert  func() []byte
	)

	switch {
	case !s.https:
	case (s.httpsCert == "") != (s.httpsKey == ""):
		return errors.New("флаги -https-cert и -https-key задаются вместе")
	case s.httpsCert != "":
		tlsConfig, err = cert.LoadPair(s.httpsCert, s.httpsKey)
		if err != nil {
			return err
		}

		log.Info("сертификат панели из файла", "cert", s.httpsCert,
			"expires", tlsConfig.Certificates[0].Leaf.NotAfter)
	default:
		certs, err := cert.New(ctx, store, log, cert.Options{Hosts: httpapi.Hosts(httpapi.Addrs(s.addr), s.allowedOrigin)})
		if err != nil {
			return fmt.Errorf("сертификат панели: %w", err)
		}

		if certs.RootCreated() {
			log.Warn("выпущен новый корневой сертификат панели, установите его на свои устройства",
				"path", "/metabox-ca.crt", "ca_sha256", certs.Fingerprint())
		} else {
			log.Info("сертификат панели", "ca_sha256", certs.Fingerprint(), "expires", certs.Expiry())
		}

		tlsConfig = certs.Config()
		rootCert = certs.CA
	}

	explainer := route.NewExplainer(source)
	logReader := logs.New(logs.Exec, store, logs.Options{
		Logread:      s.logread,
		Process:      filepath.Base(s.binary),
		ConfigDir:    s.configDir,
		TruncateDirs: []string{s.configDir, "/var/run", "/tmp"},
		Protected:    []string{store.Path(), store.ListsPath(), s.serviceDir},
		PollInterval: logPollInterval,
	})
	diagnoser := diag.New(plane, store, probe, diag.Options{
		ProcNet: "/proc/net",
		URL:     s.diagURL,
		Timeout: diagTimeout,
	})

	// A broken token file leaves MCP off instead of stopping the daemon: the panel stays
	// up, and a new token from the panel overwrites the file.
	access, err := mcp.NewAccess(ctx, store)
	if err != nil {
		log.Error("MCP выключен: файл токена не прочитан", "err", err)
	}

	agents := mcp.New(access, log, mcp.Options{
		Version:        version.Version,
		SingboxVersion: singboxVersion,
		SingboxTags:    build.Tags,
		SchemaVersion:  version.Schema,
		Service:        mcp.ServiceReader(serviceState(service, singboxVersion, sysinfo)),
		Runtime:        source,
		Explain:        explainer,
		Config:         store,
		Dataplane:      plane,
		Devices:        lan,
		Logs:           logReader,
		Diag:           diagnoser,
	})

	api := httpapi.NewServer(manager, store, log, httpapi.Options{
		Version:        version.Version,
		Auth:           guard,
		SingboxVersion: singboxVersion,
		SingboxTags:    build.Tags,
		AllowedOrigin:  s.allowedOrigin,
		SPA:            spa,
		Service:        service,
		Events:         hub,
		Clash:          clashHandler,
		Explain:        explainer,
		Hits:           hits,
		History:        historyOf(traffic, deviceHistory, connectionSizes),
		RuleSets:       ruleSets,
		Runtime:        sysinfo.Alive,
		Devices:        lan,
		Dataplane:      plane,
		Plane:          planeTx,
		Logs:           logReader,
		Diag:           diagnoser,
		MCP:            agents,
		HTTPS:          s.https,
		CA:             rootCert,
		ConfigPath:     store.Path(),
		ConfirmWindow:  s.confirmWindow,
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
		// WriteTimeout is deliberately not set: it cuts long responses, the Clash API
		// proxy and the connection stream. The deadline is set pointwise on a response.
		ErrorLog: slog.NewLogLogger(log.Handler(), slog.LevelError),
	}

	// The stream outlives the request, so Shutdown will not close it itself: without this
	// the daemon stop with an open panel would run into the timeout.
	srv.RegisterOnShutdown(hub.Close)

	// With HTTPS each address serves two listeners split off one socket: TLS and the
	// plain http that is redirected to it.
	served := make([]net.Listener, 0, 2*len(listeners))

	for _, listener := range listeners {
		if tlsConfig == nil {
			served = append(served, listener)

			continue
		}

		plain, secure := httpapi.SplitTLS(listener, tlsConfig)
		served = append(served, plain, secure)
	}

	serveErr := make(chan error, len(served))

	for _, listener := range served {
		go func() {
			err := srv.Serve(listener)
			if errors.Is(err, http.ErrServerClosed) {
				err = nil
			}
			serveErr <- err
		}()
	}

	log.Info("демон запущен", "addr", httpapi.Bound(listeners), "https", s.https, "version", version.Version)

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

	var errs []error
	for range served {
		errs = append(errs, <-serveErr)
	}

	return errors.Join(errs...)
}

// runCommand translates a command launch to the form procd expects: that package
// cannot declare its own result type, otherwise an import cycle would result.
func runCommand(exec *singbox.Exec) procd.Runner {
	return func(ctx context.Context, name string, args ...string) (string, int, error) {
		res, err := exec.Run(ctx, name, args...)

		return res.Stdout, res.ExitCode, err
	}
}

// batchCommand is the same for a launch with stdin: it writes the dataplane model into UCI.
func batchCommand(exec *singbox.Exec) dataplane.BatchRunner {
	return func(ctx context.Context, input, name string, args ...string) (string, int, error) {
		res, err := exec.RunInput(ctx, input, name, args...)

		return res.Stdout, res.ExitCode, err
	}
}

// clashSettings brings the controller settings to the form the event stream
// expects: it has its own type so the package does not depend on the config section.
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

// serviceState gives the stream the same service state as the handler: the panel
// must see the same thing regardless of where it came from.
func serviceState(service *singbox.Client, binary string, sysinfo *device.Reader) events.ServiceReader {
	return func(ctx context.Context) (json.RawMessage, error) {
		// A poll failure does not interrupt publication: otherwise the stream would freeze on
		// the last successful value, and the panel would show a crashed service
		// as running.
		state, err := service.State(ctx)

		return json.Marshal(httpapi.ServiceState(state, binary, err, sysinfo.Alive(ctx)))
	}
}

// systemState gives the stream the device readings. A partial read failure does not
// cancel publication: thermal zones may be absent, and the sing-box process may be
// not running, while the other readings are read.
func systemState(reader *device.Reader, log *slog.Logger) events.SystemReader {
	return func(ctx context.Context) (json.RawMessage, error) {
		stat, err := reader.Read(ctx)
		if err != nil {
			log.Debug("показания устройства прочитаны частично", "err", err)
		}

		return json.Marshal(stat)
	}
}

// historyOf merges two rings into one reader: the history handler returns traffic and
// board readings in one response, and they have two rings: the step is counted differently.
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

// clashPort returns the controller port from the applied config: by it the daemon
// finds the process that does the routing.
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

// configSettings reads the controller address and secret from the applied config.
// Read on every request: the controller port changes together with the config, and
// a cache would send the proxy to an address that is no longer there.
func configSettings(store *config.Store) clashapi.Resolver {
	return func(ctx context.Context) (clashapi.Settings, error) {
		data, err := store.Read(ctx)
		if err != nil {
			return clashapi.Settings{}, err
		}

		return clashapi.Read(data)
	}
}

// build assembles the dependency graph. A separate function so that run only does
// the start and stop.
func build(
	log *slog.Logger,
	s settings,
	plane *dataplane.Reader,
) (*apply.Manager, *apply.Plane, *config.Store, *singbox.Client, error) {
	store, err := config.NewStore(s.configDir, s.configName, s.serviceDir)
	if err != nil {
		return nil, nil, nil, nil, err
	}

	exec := singbox.NewExec(binaryTimeout)

	service, err := singbox.New(exec, s.binary, s.initScript, s.instance, s.logread, procd.New(runCommand(exec), s.ubus))
	if err != nil {
		return nil, nil, nil, nil, err
	}

	health := clashapi.NewChecker(healthRequestTimeout, healthPollInterval)

	var dns apply.DNSProber
	if s.healthDNSName != "" {
		dns = clashapi.NewDNSProbe(s.healthDNSName, dnsProbeTimeout, healthPollInterval, dnsProbeAttempts)
	}

	manager := apply.New(store, service, health, nil, log, apply.Options{
		Window:          s.confirmWindow,
		ClashPort:       s.clashPort,
		CycleTimeout:    s.cycleTimeout,
		ConfigDir:       s.configDir,
		ConfigName:      s.configName,
		ProcessInterval: healthPollInterval,
		Dataplane:       plane,
		DNS:             dns,
	})

	planeTx := apply.NewPlane(manager, plane, service, store, health, nil, log, apply.PlaneOptions{
		Window:       s.confirmWindow,
		CycleTimeout: s.cycleTimeout,
		DNS:          dns,
		Service:      service.ServiceName(),
	})

	return manager, planeTx, store, service, nil
}
