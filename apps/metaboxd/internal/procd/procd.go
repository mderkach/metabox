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
	"os"
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
	// PID первого поднятого инстанса; ноль, когда служба не работает.
	PID int
	// Uptime — возраст процесса. Ноль, когда узнать не удалось: procd
	// возраста не отдаёт, он считается по /proc и на чужой системе может
	// быть недоступен.
	Uptime time.Duration
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
			Running bool `json:"running"`
			PID     int  `json:"pid"`
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

	for _, instance := range service.Instances {
		if !instance.Running {
			continue
		}

		state.Running = true
		state.PID = instance.PID
		state.Uptime = c.uptime(instance.PID)

		break
	}

	return state, nil
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

	// Имя процесса лежит в скобках и само может содержать пробелы, поэтому
	// поля считаются от закрывающей скобки, а не от начала строки.
	_, after, ok := strings.Cut(string(raw), ") ")
	if !ok {
		return 0, fmt.Errorf("неожиданный формат stat для pid %d", pid)
	}

	fields := strings.Fields(after)

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
