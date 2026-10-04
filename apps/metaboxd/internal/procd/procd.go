// Package procd читает состояние службы у procd — менеджера процессов OpenWrt.
//
// Управление службой остаётся за init-скриптом (DeviceIO): здесь только
// чтение. Процесс по pid отсюда не останавливается и не запускается, pid нужен
// исключительно чтобы узнать возраст процесса.
package procd

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Runner запускает внешнюю команду и отдаёт её вывод с кодом возврата.
//
// Зависимость объявлена функцией, а не интерфейсом, намеренно: у пакета,
// который владеет запуском команд, свой тип результата, а импортировать его
// сюда нельзя — он сам зависит от этого пакета.
type Runner func(ctx context.Context, name string, args ...string) (stdout string, exitCode int, err error)

// State — то, что procd знает о службе.
type State struct {
	// Known отвечает, объявлена ли служба вообще. Незнакомая procd служба и
	// остановленная — разные случаи: первое означает, что её не поднимали
	// ни разу с момента загрузки.
	Known bool
	// Running — поднят ли хоть один инстанс.
	Running bool
	// pid поднятого инстанса. Не экспортируется: наружу он не нужен, службой
	// управляет init-скрипт, а здесь он только для возраста процесса.
	pid int
	// Uptime — возраст процесса. Ноль, когда узнать не удалось: procd
	// возраста не отдаёт, он считается по /proc и на чужой системе может
	// быть недоступен.
	Uptime time.Duration
	// Workdir — рабочий каталог службы: от него sing-box резолвит относительные
	// пути конфига. Берётся из флага -D команды, с которой procd поднимает
	// инстанс, — упавший инстанс procd помнит вместе с командой, и каталог
	// виден без процесса. Без флага — каталог живого процесса из
	// /proc/<pid>/cwd. Пусто, когда узнать не удалось.
	Workdir string
}

// Client спрашивает procd через ubus.
type Client struct {
	runner Runner
	ubus   string
	// procDir вынесен, чтобы тест не зависел от /proc живой машины.
	procDir string
}

// New собирает клиента. ubus — абсолютный путь к утилите, как и остальные
// пути в демоне: PATH под procd не тот, что в интерактивном шелле.
func New(runner Runner, ubus string) *Client {
	return &Client{runner: runner, ubus: ubus, procDir: "/proc"}
}

// Service отдаёт состояние службы по её имени в procd. Имя — то же, что у
// init-скрипта: procd регистрирует службу под именем скрипта.
func (c *Client) Service(ctx context.Context, name string) (State, error) {
	stdout, code, err := c.runner(ctx, c.ubus, "call", "service", "list")
	if err != nil {
		return State{}, fmt.Errorf("опрос procd: %w", err)
	}

	if code != 0 {
		return State{}, fmt.Errorf("опрос procd: код %d", code)
	}

	var services map[string]struct {
		Instances map[string]struct {
			Running bool     `json:"running"`
			PID     int      `json:"pid"`
			Command []string `json:"command"`
		} `json:"instances"`
	}

	if err := json.Unmarshal([]byte(stdout), &services); err != nil {
		return State{}, fmt.Errorf("разбор ответа procd: %w", err)
	}

	service, ok := services[name]
	if !ok {
		return State{}, nil
	}

	state := State{Known: true}

	// Инстансы приходят картой, а её обход случаен: у службы с несколькими
	// инстансами pid и возраст прыгали бы между опросами. Берём первый по
	// имени из поднятых.
	names := make([]string, 0, len(service.Instances))
	for name, instance := range service.Instances {
		if instance.Running {
			names = append(names, name)
		}
	}

	if len(names) == 0 {
		if len(service.Instances) > 0 {
			// Порядок тот же, что у поднятых: первый по имени.
			first := slices.Min(slices.Collect(maps.Keys(service.Instances)))
			state.Workdir = directoryFlag(service.Instances[first].Command)
		}

		return state, nil
	}

	sort.Strings(names)

	instance := service.Instances[names[0]]
	state.Running = true
	state.pid = instance.PID
	state.Uptime = c.uptime(instance.PID)
	state.Workdir = c.workdir(instance.PID, instance.Command)

	return state, nil
}

// workdir берёт рабочий каталог из команды инстанса, а без флага -D — у
// живого процесса: sing-box без флага резолвит пути от каталога, в котором
// его запустили.
func (c *Client) workdir(pid int, command []string) string {
	if dir := directoryFlag(command); dir != "" {
		return dir
	}

	if pid <= 0 {
		return ""
	}

	dir, err := os.Readlink(c.procDir + "/" + strconv.Itoa(pid) + "/cwd")
	if err != nil || !filepath.IsAbs(dir) {
		return ""
	}

	return dir
}

// directoryFlag достаёт значение -D (--directory) из команды sing-box во всех
// формах, которые принимает его разбор флагов; повтор флага — побеждает
// последний. Относительный путь не отдаётся: от какого каталога его считать,
// знает только procd.
func directoryFlag(command []string) string {
	var dir string

	for i, arg := range command {
		switch {
		case arg == "-D" || arg == "--directory":
			if i+1 < len(command) {
				dir = command[i+1]
			}
		case strings.HasPrefix(arg, "--directory="):
			dir = strings.TrimPrefix(arg, "--directory=")
		case strings.HasPrefix(arg, "-D"):
			dir = strings.TrimPrefix(strings.TrimPrefix(arg, "-D"), "=")
		}
	}

	if !filepath.IsAbs(dir) {
		return ""
	}

	return dir
}

// uptime считает возраст процесса как разницу между аптаймом системы и
// моментом старта процесса. Абсолютное время не годится: у роутера нет часов
// реального времени, и после включения оно прыгает при синхронизации NTP.
func (c *Client) uptime(pid int) time.Duration {
	if pid <= 0 {
		return 0
	}

	booted, err := c.systemUptime()
	if err != nil {
		return 0
	}

	started, err := c.processStart(pid)
	if err != nil || started > booted {
		return 0
	}

	return booted - started
}

func (c *Client) systemUptime() (time.Duration, error) {
	raw, err := os.ReadFile(c.procDir + "/uptime")
	if err != nil {
		return 0, err
	}

	seconds, _, _ := strings.Cut(strings.TrimSpace(string(raw)), " ")

	value, err := strconv.ParseFloat(seconds, 64)
	if err != nil {
		return 0, err
	}

	return time.Duration(value * float64(time.Second)), nil
}

// processStart достаёт поле starttime из /proc/<pid>/stat — момент старта
// процесса в тиках от загрузки системы.
func (c *Client) processStart(pid int) (time.Duration, error) {
	raw, err := os.ReadFile(c.procDir + "/" + strconv.Itoa(pid) + "/stat")
	if err != nil {
		return 0, err
	}

	// Имя процесса лежит в скобках и может содержать и пробелы, и сами скобки,
	// поэтому поля считаются от последней закрывающей скобки, а не от первой
	// и не от начала строки.
	end := strings.LastIndex(string(raw), ")")
	if end < 0 {
		return 0, fmt.Errorf("неожиданный формат stat для pid %d", pid)
	}

	fields := strings.Fields(string(raw)[end+1:])

	// starttime — 22-е поле всей строки, то есть 20-е после состояния.
	const startTimeField = 19
	if len(fields) <= startTimeField {
		return 0, fmt.Errorf("в stat для pid %d нет поля starttime", pid)
	}

	ticks, err := strconv.ParseInt(fields[startTimeField], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("разбор starttime для pid %d: %w", pid, err)
	}

	// USER_HZ на aarch64 и прочих распространённых архитектурах равен 100;
	// узнать значение из Go без cgo нельзя, а sysconf тянул бы зависимость.
	// На системе с другим USER_HZ возраст выйдет кратно смещённым.
	const userHZ = 100

	return time.Duration(ticks) * time.Second / userHZ, nil
}
