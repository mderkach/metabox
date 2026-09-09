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

	"metabox/internal/httpapi"
	"metabox/internal/version"
)

const (
	readHeaderTimeout = 10 * time.Second
	readTimeout       = 30 * time.Second
	idleTimeout       = 60 * time.Second
	shutdownTimeout   = 10 * time.Second
)

func main() {
	addr := flag.String("listen", "127.0.0.1:8080", "адрес и порт, который слушает демон")
	allowedOrigin := flag.String("allowed-origin", "",
		"дополнительный разрешённый Origin мутирующих запросов; нужен дев-стенду")
	level := slog.LevelInfo
	flag.TextVar(&level, "log-level", slog.LevelInfo, "уровень логов: debug, info, warn, error")
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level}))

	if err := run(log, *addr, *allowedOrigin); err != nil {
		log.Error("демон остановлен", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger, addr, allowedOrigin string) error {
	api := httpapi.NewServer(log, httpapi.Options{
		Version:       version.Version,
		AllowedOrigin: allowedOrigin,
	})

	srv := &http.Server{
		Addr:              addr,
		Handler:           api,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		IdleTimeout:       idleTimeout,
		// WriteTimeout намеренно не задан: он режет долгие ответы — прокси
		// Clash API и поток соединений. Дедлайн ставится точечно на ответе.
		ErrorLog: slog.NewLogLogger(log.Handler(), slog.LevelError),
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serveErr := make(chan error, 1)
	go func() {
		err := srv.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		serveErr <- err
	}()

	log.Info("демон запущен", "addr", addr, "version", version.Version)

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
