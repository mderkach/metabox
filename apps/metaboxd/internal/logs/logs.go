// Package logs читает лог sing-box: хвост и поток новых строк.
//
// Источник выбирается по применённому конфигу на каждый запрос: при файле в
// log.output — этот файл, иначе логгер устройства (`logread`), куда служба
// уводит stdout и stderr sing-box. Ротацией демон не занимается: кольцо logd
// ограничено размером, а файл log.output растёт, пока его не очистят.
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
	// lineLimit — потолок строки в байтах: остаток длинной строки
	// отбрасывается, иначе одна строка забирала бы столько памяти, сколько
	// напечатал процесс.
	lineLimit = 4 << 10

	// fileTailBytes — сколько конца файла читать под хвост: около тысячи строк.
	fileTailBytes = 256 << 10

	// tailTimeout — потолок на чтение хвоста у логгера.
	tailTimeout = 10 * time.Second

	// MaxLines — потолок хвоста в строках.
	MaxLines = 1000
	// MaxStreams — сколько потоков держится одновременно: каждый — живой
	// процесс logread или опрос файла.
	MaxStreams = 4
)

var (
	// ErrUnavailable — источник лога не читается: logread не задан или
	// завершился с ошибкой, файл log.output не открылся.
	ErrUnavailable = errors.New("лог sing-box недоступен")
	// ErrTooManyStreams — открыто MaxStreams потоков, новый не заводится.
	ErrTooManyStreams = errors.New("открыто слишком много потоков лога")
	// ErrClearForbidden — файл log.output лежит вне каталогов, в которых демон
	// согласен его усекать.
	ErrClearForbidden = errors.New("файл лога вне разрешённых каталогов")
)

// Level — уровень строки лога sing-box.
type Level string

// Уровни sing-box от самого подробного.
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

// rank отдаёт порядок уровня; -1 — уровень вне набора.
func rank(level Level) int {
	return slices.Index([]Level{LevelTrace, LevelDebug, LevelInfo, LevelNotice, LevelWarn, LevelError, LevelFatal, LevelPanic}, level)
}

// ParseLevel разбирает уровень без учёта регистра. Пустая строка — LevelTrace:
// фильтра нет.
func ParseLevel(s string) (Level, bool) {
	if s == "" {
		return LevelTrace, true
	}

	level := Level(strings.ToLower(s))

	return level, rank(level) >= 0
}

// Source — откуда прочитан лог.
type Source string

const (
	// SourceLogread — логгер устройства: sing-box пишет в stderr.
	SourceLogread Source = "logread"
	// SourceFile — файл log.output применённого конфига.
	SourceFile Source = "file"
)

// Entry — строка лога sing-box.
type Entry struct {
	// Time — метка времени строки в RFC 3339; пусто, когда метки нет. У строк
	// логгера это время logd, у файла — метка log.timestamp sing-box. Часов
	// реального времени у роутера нет: до синхронизации NTP метки в прошлом.
	Time string `json:"time,omitempty"`
	// Level — пусто, когда уровень не разобран: продолжение многострочного
	// сообщения, стек паники. Такие строки фильтр по уровню пропускает.
	Level   Level  `json:"level,omitempty"`
	Message string `json:"message"`
}

// Start запускает процесс и отдаёт его stdout. Close ждёт процесс, остановить
// его — дело контекста запуска; ошибка Close — ненулевой код или отказ
// ожидания.
type Start func(ctx context.Context, name string, args ...string) (io.ReadCloser, error)

// ConfigReader отдаёт применённый конфиг; отсутствие файла —
// config.ErrNoConfig.
type ConfigReader interface {
	Read(ctx context.Context) ([]byte, error)
}

// Options — пути, которые демон получает флагами.
type Options struct {
	// Logread — абсолютный путь к logread; пустой отключает чтение логгера.
	Logread string
	// Process — имя процесса sing-box в логгере.
	Process string
	// ConfigDir — каталог конфига: от него разрешается относительный
	// log.output — служба поднимает sing-box с рабочим каталогом в нём.
	ConfigDir string
	// TruncateDirs — каталоги, внутри которых файл log.output разрешено
	// усекать. Вне их очистка — ErrClearForbidden: путь задаёт конфиг, и без
	// ограничения очистка лога обнуляла бы любой файл устройства.
	TruncateDirs []string
	// PollInterval — период опроса размера файла в потоке.
	PollInterval time.Duration
	// Now подменяется в тестах; nil — time.Now.
	Now func() time.Time
}

// Reader — владелец отметки очистки и счётчика потоков.
type Reader struct {
	start  Start
	config ConfigReader
	opts   Options
	slots  chan struct{}

	mu    sync.Mutex
	since time.Time
}

// New собирает читателя.
func New(start Start, cfg ConfigReader, opts Options) *Reader {
	if opts.Now == nil {
		opts.Now = time.Now
	}

	if opts.PollInterval <= 0 {
		opts.PollInterval = 500 * time.Millisecond
	}

	return &Reader{start: start, config: cfg, opts: opts, slots: make(chan struct{}, MaxStreams)}
}

// Snapshot — хвост лога.
type Snapshot struct {
	Source  Source
	Since   time.Time
	Entries []Entry
}

// Since отдаёт отметку последней очистки; нулевое время — очистки не было.
//
// Отметка живёт в памяти: logread не умеет чистить кольцо logd, поэтому
// «очистка» — это время, раньше которого строки не показываются. Перезапуск
// демона её сбрасывает, а скачок часов при синхронизации NTP может скрыть
// новые строки или вернуть старые.
func (r *Reader) Since() time.Time {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.since
}

// Tail отдаёт последние n строк не ниже уровня min, записанных после отметки
// очистки.
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

// Clear ставит отметку очистки и отдаёт её. При файле log.output файл ещё и
// усекается: его демон очистить может, кольцо logd — нет.
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

// truncate усекает файл через os.Root разрешённого каталога: путь берётся из
// конфига, и симлинк не должен вывести запись за пределы каталога.
func (r *Reader) truncate(path string) error {
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
	// file — абсолютный путь log.output; пусто — логгер устройства.
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

	// Метки строк — с точностью до секунды, поэтому строки секунды очистки
	// скрываются целиком.
	return err != nil || t.After(f.since.Truncate(time.Second))
}

// ring держит последние n строк: хвост читается целиком, а в памяти остаётся
// только то, что уйдёт в ответ.
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

// eachLine читает построчно; хвост строки длиннее lineLimit отбрасывается.
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

// readTail отдаёт последние limit байт файла без первой, оборванной строки.
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

// Сообщения sing-box раскрашены: уровень приходит в escape-последовательностях
// терминала.
var ansi = regexp.MustCompile(`\x1b\[[0-9;]*m`)

// fileTimestamp — метка, которой sing-box открывает строку при log.timestamp.
var fileTimestamp = regexp.MustCompile(`^([+-]\d{4} \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) `)

// elapsed — секунды от старта, которые sing-box ставит сразу за уровнем в
// выводе без метки времени: `WARN[0004] …`.
var elapsed = regexp.MustCompile(`^\[\d+\]`)

const (
	fileTimeLayout = "-0700 2006-01-02 15:04:05"
	// logreadPrefix — длина метки logd: `Fri Oct  9 05:38:00 2026`.
	logreadPrefix = len(time.ANSIC)
)

// parseLogread разбирает строку logread. Строка чужого процесса — ложь:
// фильтр -e logread — регулярное выражение по всей строке, и под него
// попадают чужие сообщения, где имя sing-box просто упомянуто.
func parseLogread(line, process string) (Entry, bool) {
	line = ansi.ReplaceAllString(line, "")

	head, message, found := strings.Cut(line, "]: ")
	if !found || !strings.Contains(head, " "+process+"[") {
		return Entry{}, false
	}

	entry := parseMessage(message)

	if len(head) >= logreadPrefix {
		if t, err := time.ParseInLocation(time.ANSIC, head[:logreadPrefix], time.Local); err == nil {
			entry.Time = t.Format(time.RFC3339)
		}
	}

	return entry, true
}

// parseFile разбирает строку файла log.output. Пустая строка — ложь.
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
