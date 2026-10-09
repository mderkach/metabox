// Package singbox вызывает бинарь sing-box и управляет его сервисом через
// procd. Содержимое конфига пакет не разбирает: единственный арбитр
// валидности — сам бинарь.
package singbox

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"metabox/internal/procd"
)

// Result — итог запуска команды. Ненулевой ExitCode это результат, а не отказ
// запуска: решает вызывающий.
type Result struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

// Runner запускает внешнюю команду. Подменяется в тестах — настоящий sing-box
// и procd проверяются интеграционными тестами на стенде.
type Runner interface {
	Run(ctx context.Context, name string, args ...string) (Result, error)
}

// CheckError несёт вывод бинаря дословно: на нём пользователь чинит конфиг,
// переформулировать эти строки нельзя.
type CheckError struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

func (e *CheckError) Error() string {
	return fmt.Sprintf("sing-box check: код %d", e.ExitCode)
}

// Client — доступ демона к sing-box: проверка конфига и управление сервисом.
type Client struct {
	supervisor Supervisor
	runner     Runner
	binary     string
	initScript string
	// logread — утилита логгера устройства; пустая означает «причину падения
	// брать неоткуда», и состояние службы сводится к факту отказа.
	logread string
}

// New собирает клиента. Пути обязаны быть абсолютными: под procd переменная
// PATH не та, что в интерактивном шелле, и относительное имя разрешится не в
// тот файл или не разрешится вовсе.
// New собирает клиента. supervisor необязателен: без него состояние сводится
// к коду возврата init-скрипта, панель продолжает работать.
func New(runner Runner, binary, initScript, logread string, supervisor Supervisor) (*Client, error) {
	for _, path := range []string{binary, initScript} {
		if !filepath.IsAbs(path) {
			return nil, fmt.Errorf("путь %q не абсолютный", path)
		}
	}

	if logread != "" && !filepath.IsAbs(logread) {
		return nil, fmt.Errorf("путь %q не абсолютный", logread)
	}

	return &Client{
		runner:     runner,
		supervisor: supervisor,
		binary:     binary,
		initScript: initScript,
		logread:    logread,
	}, nil
}

// Check валидирует кандидата тем режимом, в каком поднимется служба: config —
// файл конфига (-c), пустая строка — каталог dir целиком (-C), который служба
// сливает из всех .json. workdir — база относительных путей конфига (-D), та
// же, что у службы: иначе вердикты check и рантайма расходятся.
func (c *Client) Check(ctx context.Context, dir, config, workdir string) error {
	args := []string{"check", "-D", workdir, "-C", dir}
	if config != "" {
		args = []string{"check", "-D", workdir, "-c", config}
	}

	res, err := c.runner.Run(ctx, c.binary, args...)
	if err != nil {
		return fmt.Errorf("проверка конфига: %w", err)
	}

	if res.ExitCode != 0 {
		return &CheckError{Stdout: res.Stdout, Stderr: res.Stderr, ExitCode: res.ExitCode}
	}

	return nil
}

// Build — версия бинаря и build-теги, с которыми он собран.
type Build struct {
	Version string
	// Tags — теги из строки `Tags:` вывода `sing-box version`. Пустой список
	// значит сборку без тегов, а не незнание: тип узла, закрытый тегом, такой
	// бинарь не запустит.
	Tags []string
}

// Build читает версию и состав сборки бинаря.
//
// Значение предназначено для однократного чтения при старте демона: запуск
// процесса на каждый опрос /api/status слишком дорог для роутера, поэтому
// бинарь, подменённый под работающим демоном, попадёт в панель только после
// его перезапуска.
func (c *Client) Build(ctx context.Context) (Build, error) {
	res, err := c.runner.Run(ctx, c.binary, "version")
	if err != nil {
		return Build{}, fmt.Errorf("версия sing-box: %w", err)
	}

	if res.ExitCode != 0 {
		return Build{}, fmt.Errorf("версия sing-box: код %d, %s", res.ExitCode, firstLine(res.Stderr))
	}

	version := parseVersion(res.Stdout)
	if version == "" {
		return Build{}, fmt.Errorf("версия sing-box: вывод %q не разобран", firstLine(res.Stdout))
	}

	return Build{Version: version, Tags: parseTags(res.Stdout)}, nil
}

// parseVersion берёт номер из первой строки вида
// `sing-box version 1.14.0-extended-2.7.1`: дальше идут строки про окружение
// сборки и теги.
func parseVersion(stdout string) string {
	fields := strings.Fields(firstLine(stdout))
	if len(fields) < 3 || fields[0] != "sing-box" || fields[1] != "version" {
		return ""
	}

	return fields[2]
}

// parseTags берёт теги из строки `Tags: with_quic,with_utls`. Строки нет,
// когда бинарь собран без тегов: sing-box печатает её, только если список
// не пуст.
func parseTags(stdout string) []string {
	tags := []string{}

	for line := range strings.Lines(stdout) {
		list, ok := strings.CutPrefix(strings.TrimSpace(line), "Tags:")
		if !ok {
			continue
		}

		for tag := range strings.SplitSeq(list, ",") {
			if tag = strings.TrimSpace(tag); tag != "" {
				tags = append(tags, tag)
			}
		}
	}

	return tags
}

// Restart перезапускает сервис через init-скрипт. Остановленный сервис —
// штатный путь: скрипт его поднимет.
func (c *Client) Restart(ctx context.Context) error {
	return c.service(ctx, "restart")
}

// Start поднимает сервис. Уже запущенный сервис — штатный путь: init-скрипт
// procd на повторный start не ругается.
func (c *Client) Start(ctx context.Context) error {
	return c.service(ctx, "start")
}

// Stop останавливает сервис. Остановленный сервис ошибкой не считается по той
// же причине, что и в Start.
func (c *Client) Stop(ctx context.Context) error {
	return c.service(ctx, "stop")
}

func (c *Client) service(ctx context.Context, action string) error {
	res, err := c.runner.Run(ctx, c.initScript, action)
	if err != nil {
		return fmt.Errorf("%s сервиса: %w", action, err)
	}

	if res.ExitCode != 0 {
		return fmt.Errorf("%s сервиса: код %d, %s", action, res.ExitCode, firstLine(res.Stderr))
	}

	return nil
}

// State — состояние сервиса для панели.
type State struct {
	Running bool
	// LastError — чем процесс объяснил своё падение в логе устройства. Пусто,
	// когда объяснения нет: логгер недоступен или сервис в нём не отметился.
	LastError string
	// Failed означает, что procd службу знает, но ни один инстанс не поднят:
	// её запускали и она отвалилась. Просто остановленную службу procd не
	// помнит вовсе, поэтому различить их иначе нечем.
	Failed bool
	// Uptime — возраст процесса; ноль, когда источник недоступен.
	Uptime time.Duration
}

// Supervisor отдаёт то, что знает о службе менеджер процессов. Интерфейс
// объявлен здесь, у потребителя.
type Supervisor interface {
	Service(ctx context.Context, name string) (procd.State, error)
}

// Running отвечает, поднят ли сервис. Ненулевой код возврата означает «не
// запущен», а не отказ: панель обязана работать при лежащем сервисе.
func (c *Client) Running(ctx context.Context) (bool, error) {
	res, err := c.runner.Run(ctx, c.initScript, "running")
	if err != nil {
		return false, fmt.Errorf("состояние сервиса: %w", err)
	}

	return res.ExitCode == 0, nil
}

// ErrNoSupervisor — менеджер процессов не подключён, и pid службы узнать не у
// кого.
var ErrNoSupervisor = errors.New("менеджер процессов не подключён")

// ErrUnknownService — procd службы не знает: init-скрипт не под procd или
// служба зарегистрирована под другим именем, и pid процесса узнать неоткуда.
var ErrUnknownService = errors.New("служба не зарегистрирована в procd")

// PID отдаёт pid поднятого процесса службы у procd; ноль — ни один инстанс не
// поднят. По смене pid применение отличает процесс после рестарта от прежнего:
// init-скрипт возвращается раньше, чем procd заменит процесс.
func (c *Client) PID(ctx context.Context) (int, error) {
	if c.supervisor == nil {
		return 0, ErrNoSupervisor
	}

	state, err := c.supervisor.Service(ctx, c.serviceName())
	if err != nil {
		return 0, fmt.Errorf("pid службы: %w", err)
	}

	if !state.Known {
		return 0, ErrUnknownService
	}

	return state.PID, nil
}

// State дополняет ответ init-скрипта данными procd. Init-скрипт отдаёт только
// код возврата, поэтому возраст и признак падения берутся у менеджера
// процессов; его отсутствие ответ не ломает.
func (c *Client) State(ctx context.Context) (State, error) {
	running, err := c.runner.Run(ctx, c.initScript, "running")
	if err != nil {
		return State{}, fmt.Errorf("состояние сервиса: %w", err)
	}

	state := State{Running: running.ExitCode == 0}

	if c.supervisor == nil {
		return state, nil
	}

	supervised, err := c.supervisor.Service(ctx, c.serviceName())
	if err != nil {
		return state, nil
	}

	if state.Running {
		state.Uptime = supervised.Uptime

		return state, nil
	}

	state.Failed = supervised.Known

	if state.Failed {
		state.LastError = c.failure(ctx)
	}

	return state, nil
}

// Launch отдаёт, с чем procd поднимает службу: рабочий каталог и конфиг.
// Пустые поля без ошибки — узнать неоткуда: менеджера процессов нет, служба
// ему незнакома или запущена без флагов и не поднята.
func (c *Client) Launch(ctx context.Context) (procd.Launch, error) {
	if c.supervisor == nil {
		return procd.Launch{}, nil
	}

	state, err := c.supervisor.Service(ctx, c.serviceName())
	if err != nil {
		return procd.Launch{}, err
	}

	return state.Launch, nil
}

// serviceName выводит имя службы в procd из пути init-скрипта: procd
// регистрирует службу под именем скрипта.
func (c *Client) serviceName() string {
	return filepath.Base(c.initScript)
}

// firstLine оставляет от вывода одну строку: в текст ошибки идёт причина, а не
// весь диагностический поток — он уходит вызывающему в Result.
func firstLine(s string) string {
	for i, r := range s {
		if r == '\n' {
			return s[:i]
		}
	}

	return s
}
