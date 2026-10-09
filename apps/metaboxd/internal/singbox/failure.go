package singbox

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"metabox/internal/clashapi"
	"metabox/internal/procd"
)

// Сообщения sing-box раскрашены: уровень приходит в escape-последовательностях
// терминала, и в панели они показались бы мусором вида `[31mFATAL[0m`.
var ansi = regexp.MustCompile(`\x1b\[[0-9;]*m`)

// fileTimestamp — метка времени, которой sing-box открывает строку файла лога
// при log.timestamp; без неё строка начинается с уровня.
var fileTimestamp = regexp.MustCompile(`^[+-]\d{4} \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} `)

const (
	// Сколько хвоста файла log.output читать, в байтах: около двухсот строк sing-box.
	failureTail = 64 << 10

	// Причина — последние строки, а не весь лог: сервис под procd падает в
	// цикле, и один и тот же отказ повторяется десятки раз.
	failureLines = 3
	// Потолок на случай длинной диагностики: причина уходит в ответ ручки,
	// а не в файл.
	failureLimit = 2000
)

// failure отдаёт причину последнего падения службы. Пустая строка означает,
// что причины нет: лог недоступен или сервис в нём не отметился — это не
// отказ, панель обязана открываться и без причины.
//
// Логгер устройства спрашивается первым: FATAL, с которым выходит
// `sing-box run`, пишется в stderr, а не в log.output, и в файле его нет.
// Файл — запасной источник, когда процесс в логгере не отметился.
func (c *Client) failure(ctx context.Context, launch procd.Launch) string {
	if reason := c.logreadFailure(ctx); reason != "" {
		return reason
	}

	return fileFailure(launch)
}

func (c *Client) logreadFailure(ctx context.Context) string {
	if c.logread == "" {
		return ""
	}

	// Лимит -l логгеру не передаётся: logd отрезает последние N строк всего
	// журнала до фильтра -e, и на роутере, где dnsmasq пишет тысячи строк,
	// строки sing-box в хвост не попадают. Кольцо logd ограничено размером
	// (по умолчанию 64 КиБ), так что весь отфильтрованный вывод невелик.
	res, err := c.runner.Run(ctx, c.logread, "-e", c.processName())
	if err != nil || res.ExitCode != 0 {
		return ""
	}

	return lastFailure(res.Stdout, c.processName())
}

// fileFailure читает причину из хвоста файла log.output конфига, с которым
// procd поднимает службу. Конфиг берётся, только когда он один файл (-c):
// слияние нескольких файлов и каталога -C демон не повторяет.
//
// Относительный log.output sing-box открывает от рабочего каталога — в каталог
// -D он переходит до чтения конфига, — поэтому путь разрешается от
// Launch.Workdir. Рабочий каталог неизвестен — файл не читается: cwd упавшего
// процесса демону не виден, а каталог конфига базой путей для sing-box не
// служит.
func fileFailure(launch procd.Launch) string {
	if len(launch.Configs) != 1 || len(launch.ConfigDirs) != 0 || !filepath.IsAbs(launch.Configs[0]) {
		return ""
	}

	data, err := os.ReadFile(launch.Configs[0])
	if err != nil {
		return ""
	}

	output, err := clashapi.LogOutput(data)
	if err != nil || output == "" {
		return ""
	}

	if !filepath.IsAbs(output) {
		if launch.Workdir == "" {
			return ""
		}

		output = filepath.Join(launch.Workdir, output)
	}

	tail, err := readTail(output, failureTail)
	if err != nil {
		return ""
	}

	return fileLastFailure(tail)
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

// lastFailure выбирает из лога устройства строки, которыми процесс сообщил об
// отказе. Отбор по имени процесса, а не по всему логу: рядом пишут все службы
// роутера, и чужая ошибка в причине падения sing-box только путает.
func lastFailure(log, process string) string {
	prefix := process + "["

	var messages []string

	for _, line := range strings.Split(log, "\n") {
		clean := strings.TrimSpace(ansi.ReplaceAllString(line, ""))

		if strings.Contains(clean, prefix) {
			messages = append(messages, messageOf(clean))
		}
	}

	return failureOf(messages)
}

// fileLastFailure выбирает отказ из файла log.output. Файл пишет один sing-box,
// но вперемешку с ошибками отдельных соединений — их sing-box помечает
// идентификатором соединения в скобках после уровня. Службу такая ошибка не
// роняет, а хвост файла ими забит, поэтому в причину они не идут.
func fileLastFailure(log string) string {
	var messages []string

	for _, line := range strings.Split(log, "\n") {
		message := fileTimestamp.ReplaceAllString(strings.TrimSpace(ansi.ReplaceAllString(line, "")), "")

		if _, rest, _ := strings.Cut(message, " "); strings.HasPrefix(rest, "[") {
			continue
		}

		messages = append(messages, message)
	}

	return failureOf(messages)
}

func failureOf(messages []string) string {
	var found []string

	for _, message := range messages {
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
