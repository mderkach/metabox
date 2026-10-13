package logs

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"metabox/internal/config"
)

type fakeConfig struct {
	data []byte
	err  error
}

func (f fakeConfig) Read(context.Context) ([]byte, error) { return f.data, f.err }

func noConfig() fakeConfig { return fakeConfig{err: config.ErrNoConfig} }

// fakeStart returns the prepared output and remembers the call arguments.
type fakeStart struct {
	mu       sync.Mutex
	stdout   string
	closeErr error
	calls    [][]string
}

func (f *fakeStart) start(_ context.Context, name string, args ...string) (io.ReadCloser, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.calls = append(f.calls, append([]string{name}, args...))

	return readCloser{Reader: strings.NewReader(f.stdout), err: f.closeErr}, nil
}

type readCloser struct {
	io.Reader
	err error
}

func (r readCloser) Close() error { return r.err }

const logreadOutput = "Fri Oct  9 05:38:00 2026 daemon.err sing-box[4233]: \x1b[36mINFO\x1b[0m[0001] inbound/redirect[redirect-in]: started\n" +
	"Fri Oct  9 05:38:01 2026 daemon.err sing-box[4233]: \x1b[33mWARN\x1b[0m[0002] legacy option\n" +
	"Fri Oct  9 05:38:02 2026 daemon.info dnsmasq[1]: query sing-box[1] example.com\n" +
	"Fri Oct  9 05:38:03 2026 daemon.err sing-box[4233]: \x1b[31mERROR\x1b[0m[0003] [123 5.4s] connection: refused\n" +
	"Fri Oct  9 05:38:04 2026 daemon.err sing-box[4233]: goroutine 1 [running]:\n"

func TestParse(t *testing.T) {
	tests := []struct {
		name string
		line string
		file bool
		want Entry
		ok   bool
	}{
		{
			name: "logread line with color and seconds from start",
			line: "Fri Oct  9 05:38:01 2026 daemon.err sing-box[4233]: \x1b[33mWARN\x1b[0m[0002] legacy option",
			want: Entry{Time: localRFC3339(t, 2026, 10, 9, 5, 38, 1), Level: LevelWarn, Message: "legacy option"},
			ok:   true,
		},
		{
			name: "logread line with the notice level",
			line: "Fri Oct  9 05:38:01 2026 daemon.err sing-box[4233]: NOTICE[0000] started",
			want: Entry{Time: localRFC3339(t, 2026, 10, 9, 5, 38, 1), Level: LevelNotice, Message: "started"},
			ok:   true,
		},
		{
			name: "logread line with a colored notice",
			line: "Fri Oct  9 05:38:01 2026 daemon.err sing-box[4233]: \x1b[32mNOTICE\x1b[0m[0000] started",
			want: Entry{Time: localRFC3339(t, 2026, 10, 9, 5, 38, 1), Level: LevelNotice, Message: "started"},
			ok:   true,
		},
		{
			name: "logread line with a sing-box timestamp",
			line: "Fri Oct  9 05:38:01 2026 daemon.err sing-box[4233]: +0000 2026-10-09 05:38:01 ERROR [123 5.0s] connection: i/o timeout",
			want: Entry{Time: localRFC3339(t, 2026, 10, 9, 5, 38, 1), Level: LevelError, Message: "[123 5.0s] connection: i/o timeout"},
			ok:   true,
		},
		{
			name: "a foreign process that mentioned sing-box",
			line: "Fri Oct  9 05:38:02 2026 daemon.info dnsmasq[1]: query sing-box[1] example.com",
		},
		{
			name: "file line with a timestamp",
			line: "+0300 2026-10-09 20:00:00 ERROR [id 5.4s] connection: refused",
			file: true,
			want: Entry{Time: "2026-10-09T20:00:00+03:00", Level: LevelError, Message: "[id 5.4s] connection: refused"},
			ok:   true,
		},
		{
			name: "file line without a timestamp",
			line: "FATAL start service: bind: address already in use",
			file: true,
			want: Entry{Level: LevelFatal, Message: "start service: bind: address already in use"},
			ok:   true,
		},
		{
			name: "line without a level",
			line: "goroutine 1 [running]:",
			file: true,
			want: Entry{Message: "goroutine 1 [running]:"},
			ok:   true,
		},
		{
			name: "a lowercase level is not a level",
			line: "error is the word",
			file: true,
			want: Entry{Message: "error is the word"},
			ok:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var (
				got Entry
				ok  bool
			)

			if tt.file {
				got, ok = parseFile(tt.line)
			} else {
				got, ok = parseLogread(tt.line, "sing-box")
			}

			if ok != tt.ok || got != tt.want {
				t.Errorf("got %+v, %v; expected %+v, %v", got, ok, tt.want, tt.ok)
			}
		})
	}
}

func localRFC3339(t *testing.T, y int, mo time.Month, d, h, mi, s int) string {
	t.Helper()

	return time.Date(y, mo, d, h, mi, s, 0, time.Local).Format(time.RFC3339)
}

func TestFilterOrdersNoticeBetweenInfoAndWarn(t *testing.T) {
	if rank(LevelNotice) <= rank(LevelInfo) || rank(LevelNotice) >= rank(LevelWarn) {
		t.Errorf("notice rank %d is not between info %d and warn %d", rank(LevelNotice), rank(LevelInfo), rank(LevelWarn))
	}

	f := filter{min: rank(LevelWarn)}
	if f.pass(Entry{Level: LevelNotice}) {
		t.Error("notice passed the warn filter")
	}
}

func TestTailFiltersLevelAndKeepsLast(t *testing.T) {
	start := &fakeStart{stdout: logreadOutput}
	r := New(start.start, noConfig(), Options{Logread: "/sbin/logread", Process: "sing-box"})

	got, err := r.Tail(t.Context(), 2, LevelWarn)
	if err != nil {
		t.Fatal(err)
	}

	messages := []string{}
	for _, e := range got.Entries {
		messages = append(messages, e.Message)
	}

	want := []string{"[123 5.4s] connection: refused", "goroutine 1 [running]:"}
	if !slices.Equal(messages, want) {
		t.Errorf("lines %q, expected %q", messages, want)
	}

	if got.Source != SourceLogread {
		t.Errorf("source %q, expected logread", got.Source)
	}

	if call := start.calls[0]; slices.Contains(call, "-l") || !slices.Equal(call, []string{"/sbin/logread", "-e", "sing-box"}) {
		t.Errorf("call %q: the -l limit cuts the journal before the filter", call)
	}
}

func TestTailUnavailable(t *testing.T) {
	t.Run("logread not set", func(t *testing.T) {
		r := New((&fakeStart{}).start, noConfig(), Options{Process: "sing-box"})

		if _, err := r.Tail(t.Context(), 10, LevelTrace); !errors.Is(err, ErrUnavailable) {
			t.Errorf("error %v, expected ErrUnavailable", err)
		}
	})

	t.Run("logread exited with an error", func(t *testing.T) {
		start := &fakeStart{closeErr: errors.New("exit status 1")}
		r := New(start.start, noConfig(), Options{Logread: "/sbin/logread", Process: "sing-box"})

		if _, err := r.Tail(t.Context(), 10, LevelTrace); !errors.Is(err, ErrUnavailable) {
			t.Errorf("error %v, expected ErrUnavailable", err)
		}
	})
}

func TestClearHidesEarlierLines(t *testing.T) {
	cleared := time.Date(2026, 10, 9, 5, 38, 2, 500, time.Local)
	start := &fakeStart{stdout: logreadOutput}
	r := New(start.start, noConfig(), Options{
		Logread: "/sbin/logread",
		Process: "sing-box",
		Now:     func() time.Time { return cleared },
	})

	since, err := r.Clear(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if !since.Equal(cleared) || !r.Since().Equal(cleared) {
		t.Errorf("mark %v, expected %v", since, cleared)
	}

	got, err := r.Tail(t.Context(), 10, LevelTrace)
	if err != nil {
		t.Fatal(err)
	}

	if len(got.Entries) != 2 || got.Entries[0].Level != LevelError {
		t.Errorf("after cleanup lines %+v, expected the last two", got.Entries)
	}

	if !got.Since.Equal(cleared) {
		t.Errorf("the tail carries mark %v, expected %v", got.Since, cleared)
	}
}

// pipeStart imitates logread -f: the lines are written by the test, and the context cancel
// closes the stream, like a killed process.
type pipeStart struct {
	writer chan *io.PipeWriter
}

func (p *pipeStart) start(ctx context.Context, _ string, _ ...string) (io.ReadCloser, error) {
	pr, pw := io.Pipe()

	go func() {
		<-ctx.Done()
		_ = pw.CloseWithError(io.EOF)
	}()

	p.writer <- pw

	return pr, nil
}

func TestFollowStopsWithContext(t *testing.T) {
	p := &pipeStart{writer: make(chan *io.PipeWriter, 1)}
	r := New(p.start, noConfig(), Options{Logread: "/sbin/logread", Process: "sing-box"})

	ctx, cancel := context.WithCancel(t.Context())
	got := make(chan Entry, 4)

	done, err := r.Follow(ctx, LevelInfo, func(e Entry) { got <- e })
	if err != nil {
		t.Fatal(err)
	}

	w := <-p.writer

	_, _ = io.WriteString(w, "Fri Oct  9 05:38:00 2026 daemon.err sing-box[1]: DEBUG[0001] скрыто фильтром\n")
	_, _ = io.WriteString(w, "Fri Oct  9 05:38:01 2026 daemon.err sing-box[1]: INFO[0002] новая строка\n")

	if e := <-got; e.Message != "новая строка" {
		t.Errorf("line %+v, expected «новая строка»", e)
	}

	cancel()

	if err := <-done; err != nil {
		t.Errorf("the stream closed with an error %v", err)
	}
}

func TestFollowLimit(t *testing.T) {
	p := &pipeStart{writer: make(chan *io.PipeWriter, MaxStreams)}
	r := New(p.start, noConfig(), Options{Logread: "/sbin/logread", Process: "sing-box"})

	ctx, cancel := context.WithCancel(t.Context())

	var streams []<-chan error

	for range MaxStreams {
		done, err := r.Follow(ctx, LevelTrace, func(Entry) {})
		if err != nil {
			t.Fatal(err)
		}

		streams = append(streams, done)
	}

	if _, err := r.Follow(ctx, LevelTrace, func(Entry) {}); !errors.Is(err, ErrTooManyStreams) {
		t.Errorf("error %v, expected ErrTooManyStreams", err)
	}

	cancel()

	for _, done := range streams {
		<-done
	}

	p.writer = make(chan *io.PipeWriter, 1)

	again, stop := context.WithCancel(t.Context())

	done, err := r.Follow(again, LevelTrace, func(Entry) {})
	if err != nil {
		t.Fatalf("after the streams closed a new one did not open: %v", err)
	}

	stop()
	<-done
}

func TestFollowFreesSlotBeforeDone(t *testing.T) {
	for _, file := range []bool{false, true} {
		name := "logread"
		if file {
			name = "file"
		}

		t.Run(name, func(t *testing.T) {
			cfg := noConfig()
			if file {
				dir := t.TempDir()
				path := filepath.Join(dir, "sing-box.log")

				if err := os.WriteFile(path, nil, 0o600); err != nil {
					t.Fatal(err)
				}

				cfg = fileConfig(path)
			}

			p := &pipeStart{writer: make(chan *io.PipeWriter, MaxStreams+1)}
			r := New(p.start, cfg, Options{Logread: "/sbin/logread", Process: "sing-box", PollInterval: time.Hour})

			stops := make([]context.CancelFunc, 0, MaxStreams)
			streams := make([]<-chan error, 0, MaxStreams)

			for range MaxStreams {
				ctx, cancel := context.WithCancel(t.Context())

				done, err := r.Follow(ctx, LevelTrace, func(Entry) {})
				if err != nil {
					t.Fatal(err)
				}

				stops = append(stops, cancel)
				streams = append(streams, done)
			}

			// The client closed the stream and at once opened a new one: the handler returned by
			// done, and the slot must be free by this moment.
			stops[0]()
			<-streams[0]

			ctx, cancel := context.WithCancel(t.Context())

			done, err := r.Follow(ctx, LevelTrace, func(Entry) {})
			if err != nil {
				t.Fatalf("after the stream closed a new one did not open: %v", err)
			}

			cancel()
			<-done

			for i, stop := range stops[1:] {
				stop()
				<-streams[i+1]
			}
		})
	}
}

func fileConfig(output string) fakeConfig {
	return fakeConfig{data: []byte(`{"log": {"output": "` + output + `", "timestamp": true}}`)}
}

func TestFileTailAndTruncate(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "box.log")

	content := "+0300 2026-10-09 20:00:00 INFO started\n+0300 2026-10-09 20:00:01 ERROR [1 2s] refused\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	r := New((&fakeStart{}).start, fileConfig("box.log"), Options{ConfigDir: dir, TruncateDirs: []string{dir}})

	got, err := r.Tail(t.Context(), 10, LevelTrace)
	if err != nil {
		t.Fatal(err)
	}

	if got.Source != SourceFile || len(got.Entries) != 2 || got.Entries[1].Level != LevelError {
		t.Fatalf("file tail %+v", got)
	}

	if _, err := r.Clear(t.Context()); err != nil {
		t.Fatal(err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}

	if info.Size() != 0 {
		t.Errorf("after cleanup the file has %d bytes", info.Size())
	}
}

func TestFileTruncateOutsideAllowedDirs(t *testing.T) {
	allowed := t.TempDir()
	outside := filepath.Join(t.TempDir(), "box.log")

	if err := os.WriteFile(outside, []byte("INFO kept\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	r := New((&fakeStart{}).start, fileConfig(outside), Options{ConfigDir: allowed, TruncateDirs: []string{allowed}})

	if _, err := r.Clear(t.Context()); !errors.Is(err, ErrClearForbidden) {
		t.Fatalf("error %v, expected ErrClearForbidden", err)
	}

	data, err := os.ReadFile(outside)
	if err != nil {
		t.Fatal(err)
	}

	if string(data) != "INFO kept\n" {
		t.Errorf("a file outside the allowed directories was changed: %q", data)
	}

	if !r.Since().IsZero() {
		t.Error("a cleanup failure set a mark")
	}
}

func TestFileTruncateProtected(t *testing.T) {
	tests := []struct {
		name   string
		output string
	}{
		{"config file", "config.json"},
		{"file in the lists subdirectory", "rule-sets/ads.json"},
		{"lists subdirectory through ..", "logs/../rule-sets/ads.json"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, tt.output)

			if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
				t.Fatal(err)
			}

			if err := os.WriteFile(path, []byte("{}"), 0o600); err != nil {
				t.Fatal(err)
			}

			r := New((&fakeStart{}).start, fileConfig(tt.output), Options{
				ConfigDir:    dir,
				TruncateDirs: []string{dir},
				Protected:    []string{filepath.Join(dir, "config.json"), filepath.Join(dir, "rule-sets")},
			})

			if _, err := r.Clear(t.Context()); !errors.Is(err, ErrClearForbidden) {
				t.Fatalf("error %v, expected ErrClearForbidden", err)
			}

			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}

			if string(data) != "{}" {
				t.Errorf("a protected file was changed: %q", data)
			}
		})
	}
}

func TestFileFollow(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "box.log")

		if err := os.WriteFile(path, []byte("INFO старое\n"), 0o600); err != nil {
			t.Fatal(err)
		}

		r := New((&fakeStart{}).start, fileConfig(path), Options{ConfigDir: dir, PollInterval: 500 * time.Millisecond})

		ctx, cancel := context.WithCancel(t.Context())
		got := make(chan Entry, 8)

		done, err := r.Follow(ctx, LevelTrace, func(e Entry) { got <- e })
		if err != nil {
			t.Fatal(err)
		}

		appendFile(t, path, "WARN новое\nERROR недописан")
		time.Sleep(time.Second)
		synctest.Wait()

		if e := <-got; e.Message != "новое" {
			t.Errorf("first stream line %+v, expected «новое»", e)
		}

		if len(got) != 0 {
			t.Errorf("an incomplete line went into the stream: %+v", <-got)
		}

		if err := os.Truncate(path, 0); err != nil {
			t.Fatal(err)
		}

		appendFile(t, path, "INFO после усечения\n")
		time.Sleep(time.Second)
		synctest.Wait()

		if e := <-got; e.Message != "после усечения" {
			t.Errorf("line after truncation %+v", e)
		}

		cancel()

		if err := <-done; err != nil {
			t.Errorf("the stream closed with an error %v", err)
		}
	})
}

func appendFile(t *testing.T, path, s string) {
	t.Helper()

	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := f.WriteString(s); err != nil {
		t.Fatal(err)
	}

	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
}
