// Command metaboxd is the metabox daemon. It serves the web UI and owns the
// sing-box configuration on the device.
package main

import (
	"context"
	"crypto/tls"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"metabox/internal/apply"
	"metabox/internal/auth"
	"metabox/internal/cachefile"
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
	"metabox/internal/locale"
	"metabox/internal/logs"
	"metabox/internal/mcp"
	"metabox/internal/procd"
	"metabox/internal/restart"
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

	// How long the cache file repair waits for sing-box to let go of the file after its process
	// was stopped.
	cacheLockTimeout = 10 * time.Second

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

	// Ceiling for reading the help language from UCI: help must not hang on uci.
	helpLangTimeout = 2 * time.Second

	initScript = "/etc/init.d/" + dataplane.Service

	// The daemon's own service, restarted from the panel.
	daemonInitScript = "/etc/init.d/metaboxd"
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
	lang          locale.Lang
}

func main() {
	var s settings

	flag.StringVar(&s.addr, "listen", "127.0.0.1:8080",
		"addresses and ports the daemon listens on, comma-separated")
	flag.StringVar(&s.allowedOrigin, "allowed-origin", "",
		"extra allowed Origin for mutating requests; needed by the dev stand")
	flag.BoolVar(&s.https, "https", false,
		"serve the panel over HTTPS with a certificate from the daemon's own root; http on the same port is redirected")
	flag.StringVar(&s.httpsCert, "https-cert", "",
		"path to a ready panel certificate in PEM, used with -https-key; the daemon then issues no root of its own")
	flag.StringVar(&s.httpsKey, "https-key", "", "path to the key of the -https-cert certificate")
	flag.StringVar(&s.configDir, "config-dir", "/etc/sing-box", "routing core configuration directory")
	flag.StringVar(&s.configName, "config-name", "config.json", "config file name in that directory")
	flag.StringVar(&s.serviceDir, "state-dir", "/etc/metabox",
		"daemon state directory outside the configuration directory, used for saved copies and apply progress")
	flag.StringVar(&s.binary, "singbox", "/usr/bin/sing-box", "path to the routing core executable")
	flag.StringVar(&s.ubus, "ubus", "/bin/ubus", "path to ubus, used to read the service state from procd")
	flag.StringVar(&s.logread, "logread", "/sbin/logread",
		"path to logread, used to read system logs and diagnose core startup failures. Leave empty to disable log reading")
	flag.StringVar(&s.dhcpLeases, "dhcp-leases", "/tmp/dhcp.leases", "dnsmasq lease file, the source of LAN devices")
	flag.StringVar(&s.uci, "uci", "/sbin/uci",
		"path to uci, used to read static leases from UCI dhcp and to read and write the plumbing model in UCI metabox")
	flag.StringVar(&s.nft, "nft", "/usr/sbin/nft",
		"path to the nft command that checks the firewall rules for traffic interception. Leave empty to skip the check")
	flag.StringVar(&s.healthDNSName, "health-dns-name", "cloudflare.com",
		"domain name to resolve through the core DNS listener after restart. A failed lookup rolls back the change. Leave empty to skip the DNS check")
	flag.StringVar(&s.diagURL, "diag-url", "https://www.gstatic.com/generate_204",
		"URL diagnostics uses to check internet access through the node and directly")
	flag.IntVar(&s.clashPort, "clash-port", 9090, "Clash API port, used when the daemon creates the section itself")
	flag.DurationVar(&s.confirmWindow, "confirm-window", time.Minute,
		"how long to wait for connectivity confirmation before the automatic rollback")
	flag.DurationVar(&s.cycleTimeout, "cycle-timeout", 2*time.Minute,
		"time limit for applying changes, from saving a copy of the current configuration to checking that the core works")
	flag.DurationVar(&s.ruleSetPeriod, "rule-set-refresh", 24*time.Hour,
		"how often to sync the rule set catalog with providers; 0 disables syncing: the catalog comes from the cache or the built-in snapshot")

	s.logLevel = slog.LevelInfo
	flag.TextVar(&s.logLevel, "log-level", slog.LevelInfo, "log level: debug, info, warn, error")
	flag.TextVar(&s.lang, "lang", locale.English, "language of the texts the daemon shows the operator: en or ru")
	flag.Usage = func() {
		lang := locale.HelpLang(flag.CommandLine, os.Args[1:], s.lang, s.uci, singbox.NewExec(helpLangTimeout).Command)
		locale.PrintDefaults(flag.CommandLine.Output(), flag.CommandLine, lang)
	}
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: s.logLevel}))

	if err := run(log, s); err != nil {
		log.Error("daemon stopped", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger, s settings) error {
	planeExec := singbox.NewExec(binaryTimeout)
	plane := dataplane.New(planeExec.Command, dataplane.Options{
		UCI:   s.uci,
		NFT:   s.nft,
		Batch: planeExec.CommandInput,
	})

	manager, planeTx, store, service, err := build(log, s, plane)
	if err != nil {
		return err
	}
	defer manager.Close()
	defer planeTx.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// A power loss within the confirmation window would otherwise leave the device on the
	// unconfirmed config forever. The replay runs beside the server, holding the apply; on the
	// way out it is cancelled and waited for before the manager closes.
	settled := manager.Settle(ctx, planeTx)
	defer func() {
		stop()
		<-settled
	}()

	spa, err := webui.Handler()
	if errors.Is(err, webui.ErrNotBuilt) {
		log.Warn("interface not embedded in the binary, serving the API only", "fix", "make daemon")
		spa = nil
	} else if err != nil {
		return fmt.Errorf("embedded interface: %w", err)
	}

	// A failure does not stop the daemon: the panel must work with a
	// missing sing-box too, just without the binary version.
	build, err := service.Build(ctx)
	singboxVersion := build.Version
	if err != nil {
		log.Warn("sing-box version not read", "err", err)
	}

	// A missing proxy does not stop the daemon: the panel must open
	// without the runtime too, just with degraded screens.
	var clashHandler http.Handler

	controller := clashapi.ConfigResolver(store.Read)

	logReader := logs.New(logs.Exec, store, logs.Options{
		Logread:      s.logread,
		Process:      filepath.Base(s.binary),
		ConfigDir:    s.configDir,
		TruncateDirs: []string{s.configDir, "/var/run", "/tmp"},
		Protected:    []string{store.Path(), store.ListsPath(), s.serviceDir},
		PollInterval: logPollInterval,
	})
	blocked := logs.NewBlockedCounter(logReader, store.Path(), log)
	blocked.Start()
	defer blocked.Close()

	outboundTags := clashapi.NewOutboundTags(store.Read)
	deviceHistory := history.NewDevice(historyStepSeconds/int(systemInterval/time.Second), historyStepSeconds, historyPoints)
	volume := &history.Volume{}
	sysinfo := device.New(device.Options{
		Port: controller.Port, History: deviceHistory, Split: volume,
		Traffic: volume.Traffic, Blocked: blocked.Snapshot,
	})
	serviceState := httpapi.ServiceStream(service, singboxVersion, sysinfo.Alive, s.lang)

	source := events.NewClashSource(
		events.ClashSettings(clashapi.ConfigResolver(outboundTags.Read)),
		serviceState,
		sysinfo.Encoded(log),
		healthRequestTimeout,
	)

	latency := events.NewLatencyMonitor(source, controller, sysinfo.ControllerEpoch, log)
	latencyCtx, stopLatency := context.WithCancel(ctx)
	latencyDone := latency.Start(latencyCtx)
	defer func() {
		stopLatency()
		<-latencyDone
	}()

	clash, err := clashapi.NewProxy(controller, httpapi.ProxyError(log))
	if err != nil {
		log.Warn("Clash API proxy not built", "err", err)
	} else {
		clashHandler = clash.WithDelayObserver(latency.ObserveDelay)
	}

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
		Interval:      connectionsInterval,
		Retry:         streamRetryInterval,
		Sizes:         connectionSizes,
		Snapshots:     hub.PublishConnections,
		Volumes:       volume,
		TrafficConfig: outboundTags.Current,
	})
	hits.Start()
	defer hits.Close()

	github := ruleset.NewGitHub(ruleset.GitHubAPI, "metaboxd/"+version.Version, ruleSetRequestTimeout)

	ruleSets, err := ruleset.NewUpdater(ctx, github, store, log, s.ruleSetPeriod, ruleSetRetryInterval)
	if err != nil {
		return fmt.Errorf("rule set catalog: %w", err)
	}

	ruleSets.Start()
	defer ruleSets.Close()

	// Without a device list the panel opens and labels sources with
	// addresses; a broken names file is not overwritten by the next edit.
	var lan httpapi.DeviceRegistry

	registry, err := devices.New(ctx, singbox.NewExec(binaryTimeout).Command, store, devices.Options{
		Leases: s.dhcpLeases,
		UCI:    s.uci,
	})
	if err != nil {
		log.Error("device list not built", "err", err)
	} else {
		lan = registry
	}

	// A broken password file stops the start instead of opening the panel: the owner who
	// set a password must not lose the protection silently.
	guard, err := auth.New(ctx, store, auth.Options{Log: log})
	if err != nil {
		return fmt.Errorf("panel password: %w", err)
	}

	var probe diag.DNSProber
	if s.healthDNSName != "" {
		probe = clashapi.NewDNSProbe(s.healthDNSName, dnsProbeTimeout, healthPollInterval, 1)
	}

	var (
		tlsConfig *tls.Config
		rootCert  func() []byte
	)

	if s.https {
		tlsConfig, rootCert, err = cert.Panel(ctx, store, log, cert.Source{
			Cert:  s.httpsCert,
			Key:   s.httpsKey,
			Hosts: httpapi.Hosts(httpapi.Addrs(s.addr), s.allowedOrigin),
		})
		if err != nil {
			return err
		}
	}

	verifier := route.NewRuleVerifier(store, service.LoadedRevision, sysinfo.ControllerListener,
		func(settings clashapi.Settings) (route.Source, error) { return source.WithController(settings) })
	explainer := route.NewExplainer(source, s.lang).WithRuleVerification(verifier)
	diagnoser := diag.New(plane, store, probe, service, diag.Options{
		ProcNet: "/proc/net",
		URL:     s.diagURL,
		Timeout: diagTimeout,
		Lang:    s.lang,
	})

	// A broken token file leaves MCP off instead of stopping the daemon: the panel stays
	// up, and a new token from the panel overwrites the file.
	access, err := mcp.NewAccess(ctx, store)
	if err != nil {
		log.Error("MCP disabled: token file not read", "err", err)
	}

	agents := mcp.New(access, log, mcp.Options{
		Lang:           s.lang,
		Version:        version.Version,
		SingboxVersion: singboxVersion,
		SingboxTags:    build.Tags,
		SchemaVersion:  version.Schema,
		Service:        mcp.ServiceReader(serviceState),
		Runtime:        source,
		Explain:        explainer,
		Config:         store,
		Dataplane:      plane,
		Devices:        lan,
		Logs:           logReader,
		Diag:           diagnoser,
	})

	self, err := restart.New(daemonInitScript, nil, log)
	if err != nil {
		return fmt.Errorf("daemon restart: %w", err)
	}

	api := httpapi.NewServer(manager, store, log, httpapi.Options{
		Lang:           s.lang,
		Version:        version.Version,
		Auth:           guard,
		SingboxVersion: singboxVersion,
		SingboxTags:    build.Tags,
		AllowedOrigin:  s.allowedOrigin,
		SPA:            spa,
		Service:        service,
		Recovery:       manager,
		Restart:        self,
		Events:         hub,
		Clash:          clashHandler,
		Explain:        explainer,
		Hits:           hits,
		History:        history.NewRuntime(traffic, deviceHistory, connectionSizes),
		Latency:        latency.Snapshot,
		RuleSets:       ruleSets,
		CachedRuleSets: ruleset.NewCachedReader(store, manager.CachePath),
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
		return fmt.Errorf("listeners: %w", err)
	}

	for _, failure := range failures {
		log.Warn("address not opened, the panel is unavailable on it", "err", failure)
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

	log.Info("daemon started", "addr", httpapi.Bound(listeners), "https", s.https, "version", version.Version)

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("stop server: %w", err)
	}

	log.Info("daemon stopped")

	var errs []error
	for range served {
		errs = append(errs, <-serveErr)
	}

	return errors.Join(errs...)
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

	service, err := singbox.New(exec, s.binary, initScript, s.logread, procd.New(exec.Command, s.ubus))
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
		Lang:            s.lang,
		Cache:           cachefile.Editor{LockTimeout: cacheLockTimeout},
	})

	planeTx := apply.NewPlane(manager, plane, service, store, health, nil, log, apply.PlaneOptions{
		Window:       s.confirmWindow,
		CycleTimeout: s.cycleTimeout,
		DNS:          dns,
		Lang:         s.lang,
	})

	return manager, planeTx, store, service, nil
}
