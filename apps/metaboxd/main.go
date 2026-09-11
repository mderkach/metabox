// Command metaboxd is the metabox daemon. It serves the web UI and owns the
// sing-box configuration on the device.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"metabox/internal/apply"
	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/httpapi"
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
	clashPort     int
	confirmWindow time.Duration
	cycleTimeout  time.Duration
	logLevel      slog.Level
}

func main() {
	var s settings

	flag.StringVar(&s.addr, "listen", "127.0.0.1:8080", "адрес и порт, который слушает демон")
	flag.StringVar(&s.allowedOrigin, "allowed-origin", "",
		"дополнительный разрешённый Origin мутирующих запросов; нужен дев-стенду")
	flag.StringVar(&s.configDir, "config-dir", "/etc/sing-box", "каталог конфига sing-box")
	flag.StringVar(&s.configName, "config-name", "config.json", "имя файла конфига в этом каталоге")
	flag.StringVar(&s.serviceDir, "state-dir", "/etc/metabox",
		"служебный каталог демона под бэкап и состояние транзакции; вне каталога конфига")
	flag.StringVar(&s.binary, "singbox", "/usr/bin/sing-box", "путь к бинарю sing-box")
	flag.StringVar(&s.initScript, "init-script", "/etc/init.d/sing-box", "путь к init-скрипту сервиса")
	flag.IntVar(&s.clashPort, "clash-port", 9090, "порт Clash API, если демон заводит секцию сам")
	flag.DurationVar(&s.confirmWindow, "confirm-window", time.Minute,
		"сколько ждать подтверждения связи до автоотката")
	flag.DurationVar(&s.cycleTimeout, "cycle-timeout", 2*time.Minute,
		"потолок на шаги применения от бэкапа до healthcheck")

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
	// бы устройство на неподтверждённом конфиге навсегда (ADR-0002).
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
	// отсутствующем sing-box (NFR-1), просто без версии бинаря.
	singboxVersion, err := service.Version(ctx)
	if err != nil {
		log.Warn("версия sing-box не прочитана", "err", err)
	}

	// Отсутствие прокси не останавливает демон: панель обязана открываться
	// и без рантайма (NFR-1), просто с деградировавшими экранами.
	var clashHandler http.Handler

	clash, err := clashapi.NewProxy(configSettings(store), httpapi.ProxyError(log))
	if err != nil {
		log.Warn("прокси Clash API не собран", "err", err)
	} else {
		clashHandler = clash
	}

	api := httpapi.NewServer(manager, store, log, httpapi.Options{
		Version:        version.Version,
		SingboxVersion: singboxVersion,
		AllowedOrigin:  s.allowedOrigin,
		SPA:            spa,
		Clash:          clashHandler,
		ConfigPath:     store.Path(),
	})

	srv := &http.Server{
		Addr:              s.addr,
		Handler:           api,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		IdleTimeout:       idleTimeout,
		// WriteTimeout намеренно не задан: он режет долгие ответы — прокси
		// Clash API и поток соединений. Дедлайн ставится точечно на ответе.
		ErrorLog: slog.NewLogLogger(log.Handler(), slog.LevelError),
	}

	serveErr := make(chan error, 1)
	go func() {
		err := srv.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		serveErr <- err
	}()

	log.Info("демон запущен", "addr", s.addr, "version", version.Version)

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

	service, err := singbox.New(singbox.NewExec(binaryTimeout), s.binary, s.initScript)
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
