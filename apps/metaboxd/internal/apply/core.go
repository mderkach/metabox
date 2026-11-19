package apply

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/locale"
)

// core is the service as a rollback sees it after the restart.
type core interface {
	// PID returns the pid of the service process that is up; zero means none is up.
	PID(ctx context.Context) (int, error)
	// Crash returns how the service explained its last crash while procd knows it and no
	// instance is up; empty when it runs, is stopped or gave no reason.
	Crash(ctx context.Context) (string, error)
}

// configReader is where the rollback takes the restored config from.
type configReader interface {
	Read(ctx context.Context) ([]byte, error)
}

// coreUp waits until the core runs on the restored config: procd accepts a restart of a core
// that then crashes on start, and a rollback that stops at the restart reports a previous
// config the device does not run. before and pidErr are what PID returned before the restart.
//
// A restored config without a readable controller address leaves only the process check: a
// config the owner wrote by hand may have no clash_api section, and the core it runs is not
// broken for that.
func coreUp(
	ctx context.Context,
	log *slog.Logger,
	service core,
	health Health,
	store configReader,
	interval time.Duration,
	before int,
	pidErr error,
) error {
	data, err := store.Read(ctx)
	if err != nil {
		return locale.Errorf("read the restored config: %w", err)
	}

	settings, err := clashapi.Read(data)
	if err == nil && settings.Address == "" {
		err = errNoController
	}

	if pidErr == nil {
		if err := awaitProcess(ctx, service, interval, before); err != nil {
			return notUp(ctx, service, err)
		}
	}

	if err != nil {
		log.Warn("Clash API of the restored config not checked, only the process", "err", err)

		return nil
	}

	if err := health.Wait(ctx, settings); err != nil {
		return notUp(ctx, service, err)
	}

	return nil
}

var errNoController = errors.New("no experimental.clash_api.external_controller")

// notUp adds the crash reason of the service to a failed wait. The wait may have used up the
// rollback context, so the reason is read under its own short one.
func notUp(ctx context.Context, service core, err error) error {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), stateTimeout)
	defer cancel()

	reason, crashErr := service.Crash(ctx)
	if crashErr != nil || reason == "" {
		return locale.Errorf("previous config did not come up: %w", err)
	}

	return locale.Errorf("previous config did not come up: %w; sing-box: %s", err, reason)
}
