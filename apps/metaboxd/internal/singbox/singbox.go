// Package singbox вызывает бинарь sing-box и управляет его сервисом через
// procd. Содержимое конфига пакет не разбирает: единственный арбитр
// валидности — сам бинарь (ADR-0002, UX-4 PRD).
package singbox

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
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
// поэтому ADR-0002 запрещает переформулировать эти строки.
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
	runner     Runner
	binary     string
	initScript string
}

// New собирает клиента. Пути обязаны быть абсолютными: под procd переменная
// PATH не та, что в интерактивном шелле, и относительное имя разрешится не в
// тот файл или не разрешится вовсе.
func New(runner Runner, binary, initScript string) (*Client, error) {
	for _, path := range []string{binary, initScript} {
		if !filepath.IsAbs(path) {
			return nil, fmt.Errorf("путь %q не абсолютный", path)
		}
	}

	return &Client{runner: runner, binary: binary, initScript: initScript}, nil
}

// Check валидирует каталог-кандидат. Проверяется каталог, а не отдельный файл:
// сервис поднимается на слиянии всех .json каталога, и валидировать надо ровно
// то, что запустится (ADR-0002).
func (c *Client) Check(ctx context.Context, dir string) error {
	res, err := c.runner.Run(ctx, c.binary, "check", "-C", dir)
	if err != nil {
		return fmt.Errorf("проверка конфига: %w", err)
	}

	if res.ExitCode != 0 {
		return &CheckError{Stdout: res.Stdout, Stderr: res.Stderr, ExitCode: res.ExitCode}
	}

	return nil
}

// Version возвращает версию бинаря.
//
// Значение предназначено для однократного чтения при старте демона: запуск
// процесса на каждый опрос /api/status слишком дорог для роутера, поэтому
// бинарь, подменённый под работающим демоном, попадёт в панель только после
// его перезапуска.
func (c *Client) Version(ctx context.Context) (string, error) {
	res, err := c.runner.Run(ctx, c.binary, "version")
	if err != nil {
		return "", fmt.Errorf("версия sing-box: %w", err)
	}

	if res.ExitCode != 0 {
		return "", fmt.Errorf("версия sing-box: код %d, %s", res.ExitCode, firstLine(res.Stderr))
	}

	version := parseVersion(res.Stdout)
	if version == "" {
		return "", fmt.Errorf("версия sing-box: вывод %q не разобран", firstLine(res.Stdout))
	}

	return version, nil
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

// Restart перезапускает сервис через init-скрипт. Остановленный сервис —
// штатный путь: скрипт его поднимет (AC-16).
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

// Running отвечает, поднят ли сервис. Ненулевой код возврата означает «не
// запущен», а не отказ: панель обязана работать при лежащем сервисе (NFR-1).
func (c *Client) Running(ctx context.Context) (bool, error) {
	res, err := c.runner.Run(ctx, c.initScript, "running")
	if err != nil {
		return false, fmt.Errorf("состояние сервиса: %w", err)
	}

	return res.ExitCode == 0, nil
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
