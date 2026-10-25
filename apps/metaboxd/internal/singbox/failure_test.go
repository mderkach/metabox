package singbox

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"metabox/internal/procd"
)

const crashLog = `Mon Sep 14 20:08:30 2026 daemon.notice procd: /etc/rc.d/S99sing-box: starting
Mon Sep 14 20:08:31 2026 daemon.err dnsmasq[912]: failed to bind socket
Mon Sep 14 20:08:32 2026 daemon.err sing-box[3093]: ` + "\x1b[31mFATAL\x1b[0m" + `[0000] start service: default outbound not found: no-such-outbound
Mon Sep 14 20:08:37 2026 daemon.err sing-box[3136]: ` + "\x1b[31mFATAL\x1b[0m" + `[0000] start service: default outbound not found: no-such-outbound
Mon Sep 14 20:08:42 2026 daemon.info procd: Instance sing-box::sing-box s in a crash loop 6 crashes`

func TestLastFailureTakesTheProcessMessage(t *testing.T) {
	got := lastFailure(crashLog, "sing-box")

	if got != "FATAL[0000] start service: default outbound not found: no-such-outbound" {
		t.Errorf("got %q", got)
	}
}

// The router logger writes interleaved: a foreign error in the sing-box crash reason
// would send the owner to fix the wrong thing.
func TestLastFailureIgnoresOtherServices(t *testing.T) {
	if strings.Contains(lastFailure(crashLog, "sing-box"), "dnsmasq") {
		t.Error("another service got into the reason")
	}
}

// Under procd a crashed service restarts in a circle, and the log is made of copies
// of one line: there is no point in showing dozens of them.
func TestLastFailureCollapsesRepeats(t *testing.T) {
	if lines := strings.Count(lastFailure(crashLog, "sing-box"), "\n"); lines != 0 {
		t.Errorf("lines in the reason %d, expected one", lines+1)
	}
}

func TestLastFailureKeepsSeveralDistinctMessages(t *testing.T) {
	log := `Mon Sep 14 20:08:32 2026 daemon.err sing-box[1]: ERROR первая беда
Mon Sep 14 20:08:33 2026 daemon.err sing-box[1]: FATAL вторая беда`

	if got := lastFailure(log, "sing-box"); got != "ERROR первая беда\nFATAL вторая беда" {
		t.Errorf("got %q", got)
	}
}

// The log also holds regular start messages: they are not the crash reason
// and must not go to the panel.
func TestLastFailureSkipsHealthyLines(t *testing.T) {
	log := `Mon Sep 14 20:08:32 2026 daemon.err sing-box[1]: NOTICE inbound/mixed[mixed-in]: tcp server started
Mon Sep 14 20:08:33 2026 daemon.err sing-box[1]: INFO sing-box started`

	if got := lastFailure(log, "sing-box"); got != "" {
		t.Errorf("a regular message got into the reason: %q", got)
	}
}

func TestLastFailureKeepsOnlyLastMessages(t *testing.T) {
	var log strings.Builder

	for i := range 10 {
		log.WriteString("Mon Sep 14 20:08:32 2026 daemon.err sing-box[1]: FATAL беда ")
		log.WriteString(strconv.Itoa(i))
		log.WriteString("\n")
	}

	got := lastFailure(log.String(), "sing-box")

	if lines := strings.Count(got, "\n") + 1; lines != failureLines {
		t.Errorf("lines %d, expected %d", lines, failureLines)
	}
	if !strings.HasSuffix(got, "беда 9") {
		t.Errorf("the last message is lost: %q", got)
	}
}

func TestLastFailureClampsLongOutput(t *testing.T) {
	log := "Mon Sep 14 20:08:32 2026 daemon.err sing-box[1]: FATAL " + strings.Repeat("я", failureLimit*2)

	if got := lastFailure(log, "sing-box"); len([]byte(got)) > failureLimit+len("…") {
		t.Errorf("reason length %d, ceiling %d", len(got), failureLimit)
	}
}

func TestLastFailureOnEmptyLog(t *testing.T) {
	if got := lastFailure("", "sing-box"); got != "" {
		t.Errorf("got %q", got)
	}
}

type logreadRunner struct {
	stdout string
	calls  int
}

func (r *logreadRunner) Run(context.Context, string, ...string) (Result, error) {
	r.calls++

	return Result{Stdout: r.stdout}, nil
}

const fileLog = `+0000 2026-10-09 17:15:30 INFO sing-box started (0.42s)
+0000 2026-10-09 17:15:43 ERROR [1288842022 5.4s] connection: open connection to 203.0.113.10:443: i/o timeout
+0000 2026-10-09 17:15:50 ERROR router: rule-set geoip-ru: open geoip-ru.srs: no such file or directory
+0000 2026-10-09 17:15:52 ERROR [1455477715 5.4s] connection: open connection to 203.0.113.10:443: i/o timeout
`

// writeLaunch puts into the directory a config with log.output and, if given, the log
// file itself; returns the service command as procd sees it.
func writeLaunch(t *testing.T, output, log string) procd.Launch {
	t.Helper()

	dir := t.TempDir()
	config := filepath.Join(dir, "config.json")

	body := `{"log": {"level": "info"}}`
	if output != "" {
		body = `{
  // комментарий, который sing-box принимает
  "log": {"output": "` + output + `", "timestamp": true,},
}`
	}

	if err := os.WriteFile(config, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}

	if log != "" {
		path := output
		if !filepath.IsAbs(path) {
			path = filepath.Join(dir, path)
		}

		if err := os.WriteFile(path, []byte(log), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	return procd.Launch{Workdir: dir, Configs: []string{config}}
}

func newFailureClient(runner Runner) *Client {
	return &Client{runner: runner, binary: "/usr/bin/sing-box", logread: "/sbin/logread"}
}

func TestFailureReadsLogOutputFile(t *testing.T) {
	const want = "ERROR router: rule-set geoip-ru: open geoip-ru.srs: no such file or directory"

	t.Run("absolute path", func(t *testing.T) {
		launch := writeLaunch(t, filepath.Join(t.TempDir(), "sing-box.log"), fileLog)

		if got := newFailureClient(&logreadRunner{}).failure(t.Context(), launch); got != want {
			t.Errorf("got %q, expected %q", got, want)
		}
	})

	t.Run("a relative path is from the working directory", func(t *testing.T) {
		launch := writeLaunch(t, "sing-box.log", fileLog)

		if got := newFailureClient(&logreadRunner{}).failure(t.Context(), launch); got != want {
			t.Errorf("got %q, expected %q", got, want)
		}
	})

	// The cwd of the crashed process is not visible to the daemon: a file from the config directory could
	// turn out to be foreign.
	t.Run("a relative path without a working directory is not read", func(t *testing.T) {
		launch := writeLaunch(t, "sing-box.log", fileLog)
		launch.Workdir = ""

		if got := newFailureClient(&logreadRunner{}).failure(t.Context(), launch); got != "" {
			t.Errorf("got %q, expected an empty reason", got)
		}
	})
}

// The FATAL of the `sing-box run` exit goes to stderr, not to log.output: the reason from
// the logger is more precise than the file tail.
func TestFailurePrefersLogread(t *testing.T) {
	launch := writeLaunch(t, filepath.Join(t.TempDir(), "sing-box.log"), fileLog)

	got := newFailureClient(&logreadRunner{stdout: crashLog}).failure(t.Context(), launch)

	if got != "FATAL[0000] start service: default outbound not found: no-such-outbound" {
		t.Errorf("got %q", got)
	}
}

func TestFailureFallsBackToLogread(t *testing.T) {
	const want = "FATAL[0000] start service: default outbound not found: no-such-outbound"

	t.Run("log.output not set", func(t *testing.T) {
		runner := &logreadRunner{stdout: crashLog}

		if got := newFailureClient(runner).failure(t.Context(), writeLaunch(t, "", "")); got != want {
			t.Errorf("got %q, expected %q", got, want)
		}
		if runner.calls != 1 {
			t.Errorf("logread called %d times, expected once", runner.calls)
		}
	})

	t.Run("no log file", func(t *testing.T) {
		launch := writeLaunch(t, filepath.Join(t.TempDir(), "missing.log"), "")

		if got := newFailureClient(&logreadRunner{stdout: crashLog}).failure(t.Context(), launch); got != want {
			t.Errorf("got %q, expected %q", got, want)
		}
	})

	t.Run("the service command is not visible", func(t *testing.T) {
		if got := newFailureClient(&logreadRunner{stdout: crashLog}).failure(t.Context(), procd.Launch{}); got != want {
			t.Errorf("got %q, expected %q", got, want)
		}
	})
}

// Errors of individual connections do not crash the service, and the file tail is stuffed with them.
func TestFileLastFailureSkipsConnectionErrors(t *testing.T) {
	log := "+0000 2026-10-09 17:15:43 ERROR [1288842022 5.4s] connection: i/o timeout\n" +
		"FATAL start service: default outbound not found\n" +
		"ERROR [42 1.0s] connection: refused\n"

	if got := fileLastFailure(log); got != "FATAL start service: default outbound not found" {
		t.Errorf("got %q", got)
	}
}

func TestReadTailDropsTornLine(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sing-box.log")

	if err := os.WriteFile(path, []byte("ERROR первая беда\nERROR вторая беда\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := readTail(path, int64(len("я беда\nERROR вторая беда\n")))
	if err != nil {
		t.Fatal(err)
	}

	if got != "ERROR вторая беда\n" {
		t.Errorf("got %q", got)
	}
}
