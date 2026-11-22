package logs

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"
)

const (
	rejectLine = "DEBUG[0001] [12 1ms] router: connection closed: rejected\n"
	blockLine  = "INFO[0001] [13 2ms] outbound/block[deny]: blocked packet connection to example.org:443\n"
)

func TestBlockedTrafficCountsNewLinesAcrossFileRotation(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "core.log")
		writeBlockedFile(t, path, rejectLine)
		store := fileConfig(path)
		store.data = []byte(`{"log":{"output":"core.log","level":"debug"},"route":{"rules":[{"action":"reject"}]},"outbounds":[{"type":"block"}]}`)
		reader := New((&fakeStart{}).start, store, Options{ConfigDir: dir, PollInterval: time.Second})
		counter := NewBlockedCounter(reader, "", slog.New(slog.DiscardHandler))
		counter.Start()
		synctest.Wait()

		wantBlockedCount(t, counter, 0)
		appendFile(t, path, rejectLine+blockLine+
			"DEBUG[0001] [14 2ms] dns: connection closed: rejected\n"+
			"DEBUG[0001] [15 2ms] router: connection closed: context canceled\n"+
			"INFO[0001] outbound/direct[plain]: blocked connection to example.org:443\n")
		time.Sleep(time.Second)
		synctest.Wait()
		wantBlockedCount(t, counter, 2)

		if err := os.Rename(path, path+".old"); err != nil {
			t.Fatal(err)
		}
		// A replacement can already exceed the previous offset at the next poll.
		writeBlockedFile(t, path, rejectLine+blockLine+blockLine+blockLine+blockLine)
		time.Sleep(2 * time.Second)
		synctest.Wait()
		if got := counter.Snapshot(); got.Count != nil || !got.Incomplete {
			t.Fatalf("file rotation can discard an unread tail: %+v", got)
		}
		counter.Close()
		if counter.count != 7 {
			t.Fatalf("rotation count = %d, want 7 without replaying the old file", counter.count)
		}

		restarted := NewBlockedCounter(reader, "", slog.New(slog.DiscardHandler))
		restarted.Start()
		defer restarted.Close()
		synctest.Wait()
		wantBlockedCount(t, restarted, 0)
	})
}

func TestBlockedTrafficPreservesCountAcrossStreamReconnect(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		type openStream struct {
			args []string
			out  *io.PipeWriter
		}
		opened := make(chan openStream, 2)
		start := func(ctx context.Context, _ string, args ...string) (io.ReadCloser, error) {
			in, out := io.Pipe()
			context.AfterFunc(ctx, func() { _ = out.Close() })
			opened <- openStream{args, out}
			return in, nil
		}
		store := fakeConfig{data: []byte(`{"route":{"rules":[{"action":"reject"}]}}`)}
		reader := New(start, store, Options{Logread: "/sbin/logread", Process: "sing-box", PollInterval: time.Second})
		counter := NewBlockedCounter(reader, "", slog.New(slog.DiscardHandler))
		counter.Start()
		defer counter.Close()
		synctest.Wait()

		first := <-opened
		if !slices.Equal(first.args, []string{"-f", "-e", "sing-box"}) {
			t.Fatalf("logread arguments = %v", first.args)
		}
		for i := 1; i < MaxStreams; i++ {
			ctx, cancel := context.WithCancel(t.Context())
			done, err := reader.Follow(ctx, LevelTrace, func(Entry) {})
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { cancel(); <-done })
			<-opened
		}
		if _, err := reader.Follow(t.Context(), LevelTrace, func(Entry) {}); !errors.Is(err, ErrTooManyStreams) {
			t.Fatalf("the counter should hold one slot, got %v", err)
		}

		if _, err := io.WriteString(first.out, "Fri Oct  9 05:38:00 2026 daemon.err sing-box[100]: "+rejectLine); err != nil {
			t.Fatal(err)
		}
		synctest.Wait()
		wantBlockedCount(t, counter, 1)
		if err := first.out.Close(); err != nil {
			t.Fatal(err)
		}
		synctest.Wait()
		if got := counter.Snapshot(); got.Count != nil || !got.Incomplete {
			t.Fatalf("count while the stream is down = %+v", got)
		}

		time.Sleep(time.Second)
		synctest.Wait()
		second := <-opened
		if _, err := io.WriteString(second.out, "Fri Oct  9 05:38:01 2026 daemon.err sing-box[101]: "+rejectLine); err != nil {
			t.Fatal(err)
		}
		synctest.Wait()
		if got := counter.Snapshot(); got.Count != nil || !got.Incomplete {
			t.Fatalf("reconnect exposed an incomplete uptime measurement: %+v", got)
		}
		counter.mu.Lock()
		defer counter.mu.Unlock()
		if counter.count != 2 {
			t.Fatalf("reconnect count = %d, want 2 without replaying the original line", counter.count)
		}
	})
}

func TestBlockedTrafficWatchesMissingLogFileFromCreation(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "future.log")
		store := fakeConfig{data: []byte(`{"log":{"output":"future.log"},"outbounds":[{"type":"block"}]}`)}
		reader := New((&fakeStart{}).start, store, Options{ConfigDir: dir, PollInterval: time.Second})
		counter := NewBlockedCounter(reader, "", slog.New(slog.DiscardHandler))
		counter.Start()
		defer counter.Close()
		synctest.Wait()
		wantBlockedCount(t, counter, 0)

		writeBlockedFile(t, path, blockLine)
		time.Sleep(time.Second)
		synctest.Wait()
		wantBlockedCount(t, counter, 1)
	})
}

func TestBlockedTrafficWithoutRequiredSourceIsIncomplete(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		store := fakeConfig{data: []byte(`{"outbounds":[{"type":"block"}]}`)}
		reader := New((&fakeStart{}).start, store, Options{})
		counter := NewBlockedCounter(reader, "", slog.New(slog.DiscardHandler))
		counter.Start()
		defer counter.Close()
		synctest.Wait()

		if got := counter.Snapshot(); got.Count != nil || !got.Block.Visible || !got.Incomplete {
			t.Fatalf("missing logread should mark the measurement incomplete: %+v", got)
		}
	})
}

func TestBlockedTrafficHidesCountAfterFileBurstDropsLines(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "core.log")
		writeBlockedFile(t, path, "")
		store := fakeConfig{data: []byte(`{"log":{"output":"core.log"},"outbounds":[{"type":"block"}]}`)}
		reader := New((&fakeStart{}).start, store, Options{ConfigDir: dir, PollInterval: time.Second})
		counter := NewBlockedCounter(reader, "", slog.New(slog.DiscardHandler))
		counter.Start()
		defer counter.Close()
		synctest.Wait()
		wantBlockedCount(t, counter, 0)

		noise := strings.Repeat("INFO ignored\n", fileTailBytes/len("INFO ignored\n")+1)
		appendFile(t, path, blockLine+noise+blockLine)
		time.Sleep(time.Second)
		synctest.Wait()

		if got := counter.Snapshot(); got.Count != nil || !got.Incomplete {
			t.Fatalf("log burst dropped a blocked line but reported a complete result: %+v", got)
		}
	})
}

func TestBlockedTrafficKeepsFollowingDuringConfigReadFailure(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "core.log")
		cfg := filepath.Join(dir, "config.json")
		const document = `{"log":{"output":"core.log"},"outbounds":[{"type":"block"}]}`
		writeBlockedFile(t, cfg, document)
		writeBlockedFile(t, path, "")
		store := &flakyBlockedConfig{path: cfg}
		reader := New((&fakeStart{}).start, store, Options{ConfigDir: dir, PollInterval: time.Second})
		counter := NewBlockedCounter(reader, cfg, slog.New(slog.DiscardHandler))
		counter.Start()
		defer counter.Close()
		synctest.Wait()
		wantBlockedCount(t, counter, 0)

		store.fail.Store(true)
		appendFile(t, cfg, "\n")
		time.Sleep(time.Second)
		synctest.Wait()
		if got := counter.Snapshot(); got.Count != nil || got.Incomplete {
			t.Fatalf("unreadable config should temporarily hide count: %+v", got)
		}

		appendFile(t, path, blockLine)
		time.Sleep(time.Second)
		synctest.Wait()

		store.fail.Store(false)
		time.Sleep(time.Second)
		synctest.Wait()
		wantBlockedCount(t, counter, 1)
	})
}

func TestBlockedTrafficFollowsBeforeConfigStartsUsingBlock(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		dir := t.TempDir()
		cfg := filepath.Join(dir, "config.json")
		path := filepath.Join(dir, "core.log")
		writeBlockedFile(t, cfg, `{"log":{"output":"core.log"},"outbounds":[{"type":"direct"}]}`)
		writeBlockedFile(t, path, "")
		reader := New((&fakeStart{}).start, diskLogConfig(cfg), Options{ConfigDir: dir, PollInterval: time.Second})
		counter := NewBlockedCounter(reader, cfg, slog.New(slog.DiscardHandler))
		counter.Start()
		defer counter.Close()
		synctest.Wait()
		wantBlockedCount(t, counter, 0)

		writeBlockedFile(t, cfg, `{"log":{"output":"core.log"},"outbounds":[{"type":"block"}]}`)
		appendFile(t, path, blockLine)
		time.Sleep(time.Second)
		synctest.Wait()
		wantBlockedCount(t, counter, 1)
	})
}

func TestBlockedTrafficHidesCountWhenRequiredObservationStartsLate(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		dir := t.TempDir()
		cfg := filepath.Join(dir, "config.json")
		path := filepath.Join(dir, "core.log")
		reader := New((&fakeStart{}).start, diskLogConfig(cfg), Options{ConfigDir: dir, PollInterval: time.Second})
		counter := NewBlockedCounter(reader, cfg, slog.New(slog.DiscardHandler))
		counter.Start()
		defer counter.Close()
		synctest.Wait()

		writeBlockedFile(t, cfg, `{"log":{"output":"core.log"},"outbounds":[{"type":"block"}]}`)
		writeBlockedFile(t, path, blockLine)
		time.Sleep(time.Second)
		synctest.Wait()

		if got := counter.Snapshot(); got.Count != nil || !got.Incomplete {
			t.Fatalf("observation started after a possible block but reported a complete result: %+v", got)
		}
	})
}

func TestBlockedTrafficHidesCountAfterLogOutputChanges(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		dir := t.TempDir()
		cfg := filepath.Join(dir, "config.json")
		path := filepath.Join(dir, "current.log")
		writeBlockedFile(t, cfg, `{"log":{"output":"current.log"},"outbounds":[{"type":"block"}]}`)
		writeBlockedFile(t, path, "")
		reader := New((&fakeStart{}).start, diskLogConfig(cfg), Options{ConfigDir: dir, PollInterval: time.Second})
		counter := NewBlockedCounter(reader, cfg, slog.New(slog.DiscardHandler))
		counter.Start()
		defer counter.Close()
		synctest.Wait()
		wantBlockedCount(t, counter, 0)

		writeBlockedFile(t, filepath.Join(dir, "next.log"), blockLine)
		writeBlockedFile(t, cfg, `{"log":{"output":"next.log"},"outbounds":[{"type":"block"}]}`)
		time.Sleep(time.Second)
		synctest.Wait()

		if got := counter.Snapshot(); got.Count != nil || !got.Incomplete {
			t.Fatalf("switching to a different log source exposed a complete result: %+v", got)
		}
	})
}

func TestBlockedTrafficRejectsNonRegularLogFile(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		dir := t.TempDir()
		store := fakeConfig{data: []byte(`{"log":{"output":"."},"outbounds":[{"type":"block"}]}`)}
		reader := New((&fakeStart{}).start, store, Options{ConfigDir: dir, PollInterval: time.Second})
		counter := NewBlockedCounter(reader, "", slog.New(slog.DiscardHandler))
		counter.Start()
		defer counter.Close()
		synctest.Wait()

		if got := counter.Snapshot(); got.Count != nil || !got.Incomplete {
			t.Fatalf("non-regular log source must be unavailable: %+v", got)
		}
	})
}

type flakyBlockedConfig struct {
	path string
	fail atomic.Bool
}

func (c *flakyBlockedConfig) Read(context.Context) ([]byte, error) {
	if c.fail.Load() {
		return nil, os.ErrPermission
	}

	return os.ReadFile(c.path)
}

func TestBlockedTrafficHidesPartialCount(t *testing.T) {
	for _, tt := range []struct {
		name, config  string
		reject, block BlockedKind
		available     bool
	}{
		{"warn", `"level":"warn"`, BlockedKind{Used: true}, BlockedKind{Used: true}, false},
		{"info", `"level":"info"`, BlockedKind{Used: true}, BlockedKind{Used: true, Visible: true}, false},
		{"debug", `"level":"debug"`, BlockedKind{Used: true, Visible: true}, BlockedKind{Used: true, Visible: true}, true},
		{"default level", `"level":""`, BlockedKind{Used: true, Visible: true}, BlockedKind{Used: true, Visible: true}, true},
		{"disabled", `"level":"debug","disabled":true`, BlockedKind{Used: true}, BlockedKind{Used: true}, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				dir := t.TempDir()
				writeBlockedFile(t, filepath.Join(dir, "core.log"), "")
				store := fakeConfig{data: []byte(`{"log":{"output":"core.log",` + tt.config + `},"route":{"rules":[{"type":"logical","action":"reject"}]},"outbounds":[{"type":"block"}]}`)}
				reader := New((&fakeStart{}).start, store, Options{ConfigDir: dir, PollInterval: time.Second})
				counter := NewBlockedCounter(reader, "", slog.New(slog.DiscardHandler))
				counter.Start()
				defer counter.Close()
				synctest.Wait()
				got := counter.Snapshot()
				if got.Reject != tt.reject || got.Block != tt.block || (got.Count != nil) != tt.available {
					t.Fatalf("snapshot = %+v, want reject %+v, block %+v, available %v", got, tt.reject, tt.block, tt.available)
				}
			})
		})
	}
}

func TestBlockedTrafficUsesOnlyConfiguredConnectionKinds(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "core.log")
		cfg := filepath.Join(dir, "config.json")
		writeBlockedFile(t, cfg, `{"log":{"output":"core.log","level":"info"},"dns":{"rules":[{"action":"reject"}]},"outbounds":[{"type":"block"}]}`)
		writeBlockedFile(t, path, "")
		reader := New((&fakeStart{}).start, diskLogConfig(cfg), Options{ConfigDir: dir, PollInterval: time.Second})
		counter := NewBlockedCounter(reader, cfg, slog.New(slog.DiscardHandler))
		counter.Start()
		defer counter.Close()
		synctest.Wait()
		appendFile(t, path, blockLine)
		time.Sleep(time.Second)
		synctest.Wait()
		wantBlockedCount(t, counter, 1)

		writeBlockedFile(t, cfg, `{"log":{"output":"core.log","level":"info"},"route":{"rules":[{"action":"reject"}]},"outbounds":[{"type":"block"}]}`)
		time.Sleep(time.Second)
		synctest.Wait()
		got := counter.Snapshot()
		if got.Count != nil || !got.Reject.Used || got.Reject.Visible || !got.Incomplete {
			t.Fatalf("after applied config change the incomplete measurement is visible: %+v", got)
		}

		writeBlockedFile(t, cfg, `{"log":{"output":"core.log","level":"debug"},"route":{"rules":[{"action":"reject"}]},"outbounds":[{"type":"block"}]}`)
		time.Sleep(time.Second)
		synctest.Wait()
		got = counter.Snapshot()
		if got.Count != nil || !got.Reject.Visible || !got.Block.Visible || !got.Incomplete {
			t.Fatalf("enabling debug exposed an incomplete uptime measurement: %+v", got)
		}

		writeBlockedFile(t, cfg, `{"log":{"output":"core.log","level":"debug"},"outbounds":[{"type":"block"}]}`)
		time.Sleep(time.Second)
		synctest.Wait()
		got = counter.Snapshot()
		if got.Count != nil || got.Reject.Used || !got.Incomplete {
			t.Fatalf("removing the reject rule exposed an incomplete uptime measurement: %+v", got)
		}
	})
}

func TestBlockedTrafficRecognizesBothForkFormats(t *testing.T) {
	counter := NewBlockedCounter(nil, "", slog.New(slog.DiscardHandler))
	for _, tt := range []struct {
		line string
		want uint64
	}{
		{`DEBUG[0002] router: connection closed: rejected`, 1},
		{`+0300 2026-11-22 09:00:00 DEBUG [120 1ms] router: connection closed: rejected`, 2},
		{`INFO[0003] outbound/block[deny]: blocked connection to example.org:443`, 3},
		{`+0300 2026-11-22 09:00:01 INFO [130 1ms] outbound/block[local]: blocked packet connection to example.org:443`, 4},
		{`DEBUG[0004] router: connection closed: context canceled`, 4},
		{`DEBUG[0004] dns: connection closed: rejected`, 4},
		{`INFO[0004] outbound/direct[plain]: blocked connection to example.org:443`, 4},
		{`INFO[0004] diagnostic: blocked connection to example.org:443`, 4},
	} {
		entry, ok := parseFile(tt.line)
		if !ok {
			t.Fatalf("could not parse %q", tt.line)
		}
		counter.observe(entry)
		if counter.count != tt.want {
			t.Errorf("%q counted as %d, want %d", tt.line, counter.count, tt.want)
		}
	}
}

type diskLogConfig string

func (p diskLogConfig) Read(context.Context) ([]byte, error) { return os.ReadFile(string(p)) }

func writeBlockedFile(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
}

func wantBlockedCount(t *testing.T, counter *BlockedCounter, want uint64) {
	t.Helper()
	got := counter.Snapshot()
	if got.Count == nil {
		t.Errorf("blocked traffic unavailable: %+v", got)
	} else if *got.Count != want || got.Origin != "computed" {
		t.Errorf("blocked count = %d, origin = %q, want %d and computed", *got.Count, got.Origin, want)
	}
}
