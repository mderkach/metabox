package singbox

import (
	"context"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// Сообщения sing-box раскрашены: уровень приходит в escape-последовательностях
// терминала, и в панели они показались бы мусором вида `[31mFATAL[0m`.
var ansi = regexp.MustCompile(`\x1b\[[0-9;]*m`)

const (
	// Сколько последних сообщений просить у логгера. Лог устройства идёт на
	// десятки тысяч строк и вывод команды обрезается по объёму — причём с
	// хвоста, где и лежит падение; отбор оставляем логгеру.
	failureScan = 200

	// Причина — последние строки, а не весь лог: сервис под procd падает в
	// цикле, и один и тот же отказ повторяется десятки раз.
	failureLines = 3
	// Потолок на случай длинной диагностики: причина уходит в ответ ручки,
	// а не в файл.
	failureLimit = 2000
)

// failure отдаёт причину последнего падения службы, какой её видел логгер
// устройства. Пустая строка означает, что причины нет: лог недоступен или
// сервис в нём не отметился — это не отказ, панель обязана открываться и
// без причины.
func (c *Client) failure(ctx context.Context) string {
	if c.logread == "" {
		return ""
	}

	// Фильтр и лимит отдаются логгеру: он умеет и то и другое, а тащить в
	// демон весь лог роутера незачем.
	res, err := c.runner.Run(ctx, c.logread, "-e", c.processName(), "-l", strconv.Itoa(failureScan))
	if err != nil || res.ExitCode != 0 {
		return ""
	}

	return lastFailure(res.Stdout, c.processName())
}

// lastFailure выбирает из лога устройства строки, которыми процесс сообщил об
// отказе. Отбор по имени процесса, а не по всему логу: рядом пишут все службы
// роутера, и чужая ошибка в причине падения sing-box только путает.
func lastFailure(log, process string) string {
	prefix := process + "["

	var found []string

	for _, line := range strings.Split(log, "\n") {
		clean := strings.TrimSpace(ansi.ReplaceAllString(line, ""))

		if !strings.Contains(clean, prefix) {
			continue
		}

		message := messageOf(clean)
		if !isFailure(message) {
			continue
		}

		// Повтор того же отказа ничего не добавляет: procd перезапускает
		// упавший сервис по кругу, и лог состоит из одной строки в копиях.
		if len(found) > 0 && found[len(found)-1] == message {
			continue
		}

		found = append(found, message)
	}

	if len(found) > failureLines {
		found = found[len(found)-failureLines:]
	}

	return clamp(strings.Join(found, "\n"), failureLimit)
}

// messageOf отбрасывает служебную часть строки лога — время, facility и имя
// процесса, — оставляя то, что написал сам процесс.
func messageOf(line string) string {
	if _, message, found := strings.Cut(line, "]: "); found {
		return strings.TrimSpace(message)
	}

	return line
}

func isFailure(message string) bool {
	upper := strings.ToUpper(message)

	return strings.HasPrefix(upper, "FATAL") || strings.HasPrefix(upper, "ERROR") || strings.HasPrefix(upper, "PANIC")
}

func clamp(s string, limit int) string {
	if len(s) <= limit {
		return s
	}

	return s[:limit] + "…"
}

// processName выводит имя процесса в логе из пути к бинарю: логгер пишет его
// так же, как procd назвал команду.
func (c *Client) processName() string {
	return filepath.Base(c.binary)
}
