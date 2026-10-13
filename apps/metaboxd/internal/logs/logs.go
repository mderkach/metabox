// Package logs reads the sing-box log: the tail and the stream of new lines.
//
// The source is selected by the applied config on every request: with a file in
// log.output, that file; otherwise the device logger (`logread`), where the service
// sends sing-box stdout and stderr. The daemon does not do rotation: the logd ring
// is limited by size, and the log.output file grows until it is cleared.
package logs

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/config"
)

const (
	// lineLimit is the line ceiling in bytes: the rest of a long line
	// is dropped, otherwise one line would take as much memory as the process
	// printed.
	lineLimit = 4 << 10

	// fileTailBytes is how much of the file end to read for the tail: about a thousand lines.
	fileTailBytes = 256 << 10

	// tailTimeout is the ceiling for reading the tail from the logger.
	tailTimeout = 10 * time.Second

	// MaxLines is the tail ceiling in lines.
	MaxLines = 1000
	// MaxStreams is how many streams are held at once: each is a live
	// logread process or a file poll.
	MaxStreams = 4
)

var (
	// ErrUnavailable means the log source cannot be read: logread is not set or
	// exited with an error, the log.output file did not open.
	ErrUnavailable = errors.New("лог sing-box недоступен")
	// ErrTooManyStreams means MaxStreams streams are open, a new one is not started.
	ErrTooManyStreams = errors.New("открыто слишком много потоков лога")
	// ErrClearForbidden means the log.output file lies outside the directories in which the daemon
	// agrees to truncate it.
	ErrClearForbidden = errors.New("файл лога вне разрешённых каталогов")
)

// Level is a sing-box log line level.
type Level string

// The sing-box levels from the most detailed.
const (
	LevelTrace  Level = "trace"
	LevelDebug  Level = "debug"
	LevelInfo   Level = "info"
	LevelNotice Level = "notice"
	LevelWarn   Level = "warn"
	LevelError  Level = "error"
	LevelFatal  Level = "fatal"
	LevelPanic  Level = "panic"
)

// rank returns the level order; -1 means a level outside the set.
func rank(level Level) int {
	return slices.Index([]Level{LevelTrace, LevelDebug, LevelInfo, LevelNotice, LevelWarn, LevelError, LevelFatal, LevelPanic}, level)
}

// ParseLevel parses a level case-insensitively. An empty string is LevelTrace:
// no filter.
func ParseLevel(s string) (Level, bool) {
	if s == "" {
		return LevelTrace, true
	}

	level := Level(strings.ToLower(s))

	return level, rank(level) >= 0
}

// Source is where the log was read from.
type Source string

const (
	// SourceLogread is the device logger: sing-box writes to stderr.
	SourceLogread Source = "logread"
	// SourceFile is the log.output file of the applied config.
	SourceFile Source = "file"
)

// Entry is a sing-box log line.
type Entry struct {
	// Time is the line timestamp in RFC 3339; empty when there is no stamp. For logger
	// lines this is the logd time, for the file the sing-box log.timestamp stamp. The router
	// has no real-time clock: before NTP synchronization the stamps are in the past.
	Time string `json:"time,omitempty"`
	// Level is empty when the level is not parsed: a continuation of a multi-line
	// message, a panic stack. The level filter lets such lines through.
	Level   Level  `json:"level,omitempty"`
	Message string `json:"message"`
}

// Start starts a process and returns its stdout. Close waits for the process, stopping
// it is the job of the launch context; a Close error is a non-zero code or a wait
// failure.
type Start func(ctx context.Context, name string, args ...string) (io.ReadCloser, error)

// ConfigReader returns the applied config; a missing file is
// config.ErrNoConfig.
type ConfigReader interface {
	Read(ctx context.Context) ([]byte, error)
}

// Options are the paths the daemon receives by flags.
type Options struct {
	// Logread is the absolute path to logread; empty disables reading the logger.
	Logread string
	// Process is the sing-box process name in the logger.
	Process string
	// ConfigDir is the config directory: a relative log.output is resolved from it,
	// the service starts sing-box with the working directory in it.
	ConfigDir string
	// TruncateDirs are the directories inside which the log.output file may be
	// truncated. Outside them cleanup is ErrClearForbidden: the path is set by the config, and without
	// the restriction a log cleanup would zero any device file.
	TruncateDirs []string
	// Protected are files and directories inside TruncateDirs that are not truncated:
	// the config and its lists subdirectory. Compared by path, without symlink
	// resolution.
	Protected []string
	// PollInterval is the file size polling period in a stream.
	PollInterval time.Duration
	// Now is replaced in tests; nil means time.Now.
	Now func() time.Time
}

// Reader is the owner of the cleanup mark and the stream counter.
type Reader struct {
	start  Start
	config ConfigReader
	opts   Options
	slots  chan struct{}

	mu    sync.Mutex
	since time.Time
}

// New assembles the reader.
func New(start Start, cfg ConfigReader, opts Options) *Reader {
	if opts.Now == nil {
		opts.Now = time.Now
	}

	if opts.PollInterval <= 0 {
		opts.PollInterval = 500 * time.Millisecond
	}

	return &Reader{start: start, config: cfg, opts: opts, slots: make(chan struct{}, MaxStreams)}
}

// Snapshot is the log tail.
type Snapshot struct {
	Source  Source
	Since   time.Time
	Entries []Entry
}

// Since returns the last cleanup mark; a zero time means there was no cleanup.
//
// The mark lives in memory: logread cannot clean the logd ring, so
// "cleanup" is the time before which lines are not shown. A daemon restart
// resets it, and a clock jump on NTP synchronization may hide
// new lines or bring back old ones.
func (r *Reader) Since() time.Time {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.since
}

// Tail returns the last n lines not below level min, written after the cleanup
// mark.
func (r *Reader) Tail(ctx context.Context, n int, minLevel Level) (Snapshot, error) {
	src, err := r.source(ctx)
	if err != nil {
		return Snapshot{}, err
	}

	f := r.filter(minLevel)
	ring := newRing(min(max(n, 0), MaxLines))

	if src.file != "" {
		tail, err := readTail(src.file, fileTailBytes)
		if err != nil {
			return Snapshot{}, fmt.Errorf("%w: хвост %s: %w", ErrUnavailable, src.file, err)
		}

		for line := range strings.SplitSeq(tail, "\n") {
			if entry, ok := parseFile(line); ok && f.pass(entry) {
				ring.push(entry)
			}
		}

		return Snapshot{Source: SourceFile, Since: f.since, Entries: ring.entries()}, nil
	}

	ctx, cancel := context.WithTimeout(ctx, tailTimeout)
	defer cancel()

	out, err := r.start(ctx, r.opts.Logread, "-e", r.opts.Process)
	if err != nil {
		return Snapshot{}, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}

	readErr := eachLine(out, func(line string) {
		if entry, ok := parseLogread(line, r.opts.Process); ok && f.pass(entry) {
			ring.push(entry)
		}
	})

	if err := errors.Join(readErr, out.Close()); err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return Snapshot{}, ctxErr
		}

		return Snapshot{}, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}

	return Snapshot{Source: SourceLogread, Since: f.since, Entries: ring.entries()}, nil
}

// Clear sets the cleanup mark and returns it. With a log.output file the file is also
// truncated: the daemon can clean it, the logd ring it cannot.
func (r *Reader) Clear(ctx context.Context) (time.Time, error) {
	src, err := r.source(ctx)
	if err != nil {
		return time.Time{}, err
	}

	if src.file != "" {
		if err := r.truncate(src.file); err != nil {
			return time.Time{}, err
		}
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.since = r.opts.Now()

	return r.since, nil
}

// truncate truncates a file through os.Root of the allowed directory: the path is taken from
// the config, and a symlink must not take the write outside the directory.
func (r *Reader) truncate(path string) error {
	for _, p := range r.opts.Protected {
		if rel, err := filepath.Rel(p, path); err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return ErrClearForbidden
		}
	}

	for _, dir := range r.opts.TruncateDirs {
		rel, err := filepath.Rel(dir, path)
		if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}

		root, err := os.OpenRoot(dir)
		if err != nil {
			return fmt.Errorf("каталог %s: %w", dir, err)
		}

		f, err := root.OpenFile(rel, os.O_WRONLY|os.O_TRUNC, 0)
		_ = root.Close()

		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}

		if err != nil {
			return fmt.Errorf("усечение %s: %w", path, err)
		}

		if err := f.Close(); err != nil {
			return fmt.Errorf("закрытие %s: %w", path, err)
		}

		return nil
	}

	return ErrClearForbidden
}

type source struct {
	// file is the absolute log.output path; empty means the device logger.
	file string
}

func (r *Reader) source(ctx context.Context) (source, error) {
	data, err := r.config.Read(ctx)
	if errors.Is(err, config.ErrNoConfig) {
		return r.logreadSource()
	}

	if err != nil {
		return source{}, err
	}

	output, err := clashapi.LogOutput(data)
	if err != nil || output == "" {
		return r.logreadSource()
	}

	if !filepath.IsAbs(output) {
		output = filepath.Join(r.opts.ConfigDir, output)
	}

	return source{file: filepath.Clean(output)}, nil
}

func (r *Reader) logreadSource() (source, error) {
	if r.opts.Logread == "" {
		return source{}, ErrUnavailable
	}

	return source{}, nil
}

type filter struct {
	min   int
	since time.Time
}

func (r *Reader) filter(minLevel Level) filter {
	return filter{min: rank(minLevel), since: r.Since()}
}

func (f filter) pass(e Entry) bool {
	if e.Level != "" && rank(e.Level) < f.min {
		return false
	}

	if f.since.IsZero() || e.Time == "" {
		return true
	}

	t, err := time.Parse(time.RFC3339, e.Time)

	// Line stamps are accurate to the second, so the lines of the cleanup second
	// are hidden entirely.
	return err != nil || t.After(f.since.Truncate(time.Second))
}

// ring holds the last n lines: the tail is read whole, and only what goes into
// the response stays in memory.
type ring struct {
	buf  []Entry
	next int
	full bool
}

func newRing(n int) *ring {
	return &ring{buf: make([]Entry, n)}
}

func (r *ring) push(e Entry) {
	if len(r.buf) == 0 {
		return
	}

	r.buf[r.next] = e
	r.next = (r.next + 1) % len(r.buf)

	if r.next == 0 {
		r.full = true
	}
}

func (r *ring) entries() []Entry {
	if !r.full {
		return append([]Entry{}, r.buf[:r.next]...)
	}

	return append(append([]Entry{}, r.buf[r.next:]...), r.buf[:r.next]...)
}

// eachLine reads line by line; the tail of a line longer than lineLimit is dropped.
func eachLine(rd io.Reader, fn func(string)) error {
	br := bufio.NewReader(rd)

	var line []byte

	for {
		chunk, isPrefix, err := br.ReadLine()
		if len(line) < lineLimit {
			line = append(line, chunk[:min(len(chunk), lineLimit-len(line))]...)
		}

		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}

			return err
		}

		if !isPrefix {
			fn(string(line))
			line = line[:0]
		}
	}
}

// readTail returns the last limit bytes of the file without the first, broken line.
func readTail(path string, limit int64) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer func() { _ = f.Close() }()

	info, err := f.Stat()
	if err != nil {
		return "", err
	}

	offset := max(info.Size()-limit, 0)

	data, err := io.ReadAll(io.NewSectionReader(f, offset, limit))
	if err != nil {
		return "", err
	}

	tail := string(data)
	if offset > 0 {
		_, tail, _ = strings.Cut(tail, "\n")
	}

	return tail, nil
}

// sing-box messages are colored: the level comes in terminal escape
// sequences.
var ansi = regexp.MustCompile(`\x1b\[[0-9;]*m`)

// fileTimestamp is the stamp sing-box opens a line with under log.timestamp.
var fileTimestamp = regexp.MustCompile(`^([+-]\d{4} \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) `)

// elapsed is the seconds from start that sing-box puts right after the level in
// output without a timestamp: `WARN[0004] …`.
var elapsed = regexp.MustCompile(`^\[\d+\]`)

const (
	fileTimeLayout = "-0700 2006-01-02 15:04:05"
	// logreadPrefix is the length of the logd stamp: `Fri Oct  9 05:38:00 2026`.
	logreadPrefix = len(time.ANSIC)
)

// parseLogread parses a logread line. A line of a foreign process is false:
// the -e logread filter is a regular expression over the whole line, and foreign
// messages that merely mention the sing-box name fall under it.
func parseLogread(line, process string) (Entry, bool) {
	line = ansi.ReplaceAllString(line, "")

	head, message, found := strings.Cut(line, "]: ")
	if !found || !strings.Contains(head, " "+process+"[") {
		return Entry{}, false
	}

	// With log.timestamp sing-box puts its own stamp into stderr too; the line time
	// stays with logd.
	if m := fileTimestamp.FindString(message); m != "" {
		message = message[len(m):]
	}

	entry := parseMessage(message)

	if len(head) >= logreadPrefix {
		if t, err := time.ParseInLocation(time.ANSIC, head[:logreadPrefix], time.Local); err == nil {
			entry.Time = t.Format(time.RFC3339)
		}
	}

	return entry, true
}

// parseFile parses a log.output file line. An empty line is false.
func parseFile(line string) (Entry, bool) {
	line = strings.TrimSpace(ansi.ReplaceAllString(line, ""))
	if line == "" {
		return Entry{}, false
	}

	var stamp string

	if m := fileTimestamp.FindStringSubmatch(line); m != nil {
		stamp = m[1]
		line = line[len(m[0]):]
	}

	entry := parseMessage(line)

	if stamp != "" {
		if t, err := time.Parse(fileTimeLayout, stamp); err == nil {
			entry.Time = t.Format(time.RFC3339)
		}
	}

	return entry, true
}

func parseMessage(message string) Entry {
	message = strings.TrimSpace(message)

	word := message
	if i := strings.IndexAny(message, " ["); i >= 0 {
		word = message[:i]
	}

	level, ok := ParseLevel(word)
	if !ok || word == "" || word != strings.ToUpper(word) {
		return Entry{Message: message}
	}

	rest := elapsed.ReplaceAllString(message[len(word):], "")

	return Entry{Level: level, Message: strings.TrimSpace(rest)}
}
