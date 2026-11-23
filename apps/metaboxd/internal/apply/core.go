package apply

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"metabox/internal/cachefile"
	"metabox/internal/clashapi"
	"metabox/internal/locale"
	"metabox/internal/redaction"
)

// core is the service as a rollback sees it after the restart.
type core interface {
	// PID returns the pid of the service process that is up; zero means none is up.
	PID(ctx context.Context) (int, error)
	// CrashMark marks the service log now; Crash returns the FATAL line the service wrote
	// after the mark while procd knows it and no instance is up, empty otherwise.
	CrashMark(ctx context.Context) string
	Crash(ctx context.Context, mark string) (string, error)
}

// since is the service as it was before an action that brings up a new process: the wait
// after the action counts only a new process and only a crash written after the mark.
type since struct {
	pid    int
	pidErr error
	mark   string
}

func snapshot(ctx context.Context, service core) since {
	pid, err := service.PID(ctx)

	return since{pid: pid, pidErr: err, mark: service.CrashMark(ctx)}
}

// configReader is the config on disk, the one the core is checked against.
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

// coreUp waits until the core runs on the config on disk: procd accepts a restart of a core
// that then crashes on start, and a rollback that stops at the restart reports a previous
// config the device does not run. from is the service before the action.
//
// A core that crashes on a cached subscription ends the wait early with *poisonedError. Any
// other crash ends it early only when anyCrash is set: a panel request has less time than
// the core may need to come up through procd respawns, while a rollback gives the core the
// whole cycle.
//
// A config without a readable controller address leaves only the process check: a
// config the owner wrote by hand may have no clash_api section, and the core it runs is not
// broken for that.
func coreUp(
	ctx context.Context,
	log *slog.Logger,
	service core,
	health Health,
	store configReader,
	interval time.Duration,
	from since,
	anyCrash bool,
) error {
	data, err := store.Read(ctx)
	if err != nil {
		return locale.Errorf("read the configuration to check the routing core: %w", err)
	}

	settings, settingsErr := clashapi.Read(data)
	if settingsErr == nil && settings.Address == "" {
		settingsErr = errNoController
	}

	upErr := watch(ctx, service, interval, from.mark, anyCrash, func(ctx context.Context) error {
		if from.pidErr == nil {
			if err := awaitProcess(ctx, service, interval, from.pid); err != nil {
				return err
			}
		}

		if settingsErr != nil {
			return nil
		}

		return health.Wait(ctx, settings)
	})

	if poisoned, ok := errors.AsType[*poisonedError](upErr); ok {
		return poisoned
	}
	if upErr != nil && anyCrash {
		// The panel reads the reason from the service state; reading it here could keep
		// the request past the panel's timeout.
		return upErr
	}
	if upErr != nil {
		return notUp(ctx, service, from.mark, upErr)
	}

	if settingsErr != nil {
		log.Warn("Clash API of the config not checked, only the process", "err", settingsErr)
	}

	return nil
}

var errNoController = errors.New("no experimental.clash_api.external_controller")

// errCrashed ends a wait on a crash that is not the cached subscription; notUp adds the line.
var errCrashed = errors.New("the process exited")

// watch runs wait and polls the crash reason of the service meanwhile: a core that crashes
// on start would otherwise hold wait until its deadline, and the recovery would get no time
// left. Only lines written after mark count.
func watch(ctx context.Context, service core, interval time.Duration, mark string, anyCrash bool, wait func(context.Context) error) error {
	waitCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	found := make(chan error, 1)
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

			reason, err := service.Crash(waitCtx, mark)
			if err != nil || reason == "" {
				continue
			}

			if tag, ok := cachefile.PoisonedProvider(reason); ok {
				found <- &poisonedError{tag: tag, reason: redaction.URLs(reason)}
			} else if anyCrash {
				found <- errCrashed
			} else {
				continue
			}

			cancel()

			return
		}
	}()

	err := wait(waitCtx)
	cancel()
	<-done

	select {
	case crashed := <-found:
		return crashed
	default:
		return err
	}
}

// notUp adds the crash reason of the service to a failed wait. The wait may have used up the
// caller's context, so the reason is read under its own short one.
func notUp(ctx context.Context, service core, mark string, err error) error {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), stateTimeout)
	defer cancel()

	reason, crashErr := service.Crash(ctx, mark)
	if crashErr != nil || reason == "" {
		return locale.Errorf("the routing core did not start: %w", err)
	}

	return locale.Errorf("the routing core did not start: %w. Last error in its log: %s", err, redaction.URLs(reason))
}
