package apply

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"metabox/internal/cachefile"
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

// poisonedError means the core crashed on start because a cached subscription does not parse
// back: tag names the provider, reason is the crash line.
type poisonedError struct {
	tag    string
	reason string
}

func (e *poisonedError) Error() string {
	return "sing-box crashed on the cached subscription " + e.tag + ": " + e.reason
}

// coreUp waits until the core runs on the restored config: procd accepts a restart of a core
// that then crashes on start, and a rollback that stops at the restart reports a previous
// config the device does not run. before and pidErr are what PID returned before the restart.
// A core that crashes on a cached subscription ends the wait early with *poisonedError.
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

	// The crash reason is watched only once the new process is up: an older crash left in the
	// log must not count against a core that is still starting.
	waitErr := watch(ctx, service, interval, func(ctx context.Context) error {
		return health.Wait(ctx, settings)
	})
	if poisoned, ok := errors.AsType[*poisonedError](waitErr); ok {
		return poisoned
	}
	if waitErr != nil {
		return notUp(ctx, service, waitErr)
	}

	return nil
}

var errNoController = errors.New("no experimental.clash_api.external_controller")

// watch runs wait and polls the crash reason of the service meanwhile: a core that crashes on
// a cached subscription would otherwise hold wait until its deadline, and the recovery would
// get no time left.
func watch(ctx context.Context, service core, interval time.Duration, wait func(context.Context) error) error {
	waitCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	found := make(chan *poisonedError, 1)
	done := make(chan struct{})

	go func() {
		defer close(done)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-waitCtx.Done():
				return
			case <-ticker.C:
			}

			reason, err := service.Crash(waitCtx)
			if err != nil {
				continue
			}

			if tag, ok := cachefile.PoisonedProvider(reason); ok {
				found <- &poisonedError{tag: tag, reason: reason}
				cancel()

				return
			}
		}
	}()

	err := wait(waitCtx)
	cancel()
	<-done

	select {
	case poisoned := <-found:
		return poisoned
	default:
		return err
	}
}

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
