package device

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// errNoPort означает, что порт Clash API неизвестен: без него процесс искать
// не по чему.
var errNoPort = errors.New("порт Clash API не задан")

// Имя процесса в `comm` обрезано до пятнадцати символов, «sing-box» проходит
// целиком.
const singboxComm = "sing-box"

// Состояние сокета LISTEN в `/proc/net/tcp`.
const stateListen = "0A"

// Таблицы слушателей: IPv6-сокет с адресом `::` принимает и IPv4, поэтому
// смотреть приходится обе.
var listenerTables = []string{"net/tcp", "net/tcp6"}

// singbox отдаёт показания процесса, который ведёт маршрутизацию.
//
// Процесс ищется по слушателю порта Clash API, а не по службе демона: на
// устройстве маршрутизацией может владеть чужой пакет (re:HomeProxy поднимает
// тот же бинарь своей службой), и procd о нём ничего не знает. Найденный pid
// запоминается — обход дескрипторов всех процессов каждые несколько секунд
// устройству не нужен.
func (r *Reader) singbox(ctx context.Context) (*Process, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.pid != 0 {
		if rss, err := r.rssOfSingbox(r.pid); err == nil {
			return &Process{PID: r.pid, RSS: rss}, nil
		}

		r.pid = 0
	}

	pid, err := r.findSingbox(ctx)
	if err != nil {
		return nil, err
	}

	rss, err := r.rssOfSingbox(pid)
	if err != nil {
		return nil, err
	}

	r.pid = pid

	return &Process{PID: pid, RSS: rss}, nil
}

// Alive сообщает, работает ли на устройстве процесс, который ведёт
// маршрутизацию. Служба демона такого ответа не даёт: поднять sing-box мог
// чужой пакет, и procd о нём не знает.
func (r *Reader) Alive(ctx context.Context) bool {
	process, err := r.singbox(ctx)

	return err == nil && process != nil
}

// rssOfSingbox читает память процесса, убедившись, что это всё ещё sing-box:
// освободившийся pid система выдаёт заново.
func (r *Reader) rssOfSingbox(pid int) (int64, error) {
	id := strconv.Itoa(pid)

	comm, err := readTrimmed(filepath.Join(r.proc, id, "comm"))
	if err != nil {
		return 0, err
	}

	if comm != singboxComm {
		return 0, fmt.Errorf("процесс %d больше не sing-box: %s", pid, comm)
	}

	return processRSS(r.proc, id)
}

func (r *Reader) findSingbox(ctx context.Context) (int, error) {
	if r.port == nil {
		return 0, errNoPort
	}

	port, err := r.port(ctx)
	if err != nil {
		return 0, fmt.Errorf("порт Clash API: %w", err)
	}

	inodes, err := r.listenerInodes(port)
	if err != nil {
		return 0, err
	}

	if len(inodes) == 0 {
		return 0, fmt.Errorf("порт %d никто не слушает", port)
	}

	return r.ownerOf(ctx, inodes)
}

// listenerInodes собирает inode сокетов, слушающих порт. Строка таблицы —
// «sl local_address rem_address st ... inode», адреса в ней шестнадцатеричные.
func (r *Reader) listenerInodes(port int) (map[string]struct{}, error) {
	const (
		localField = 1
		stateField = 3
		inodeField = 9
	)

	inodes := make(map[string]struct{})
	suffix := fmt.Sprintf(":%04X", port)

	var failures []error

	for _, table := range listenerTables {
		path := filepath.Join(r.proc, table)

		data, err := os.ReadFile(path)
		if err != nil {
			// Ядро без IPv6 таблицы не заводит — это не отказ.
			if !errors.Is(err, os.ErrNotExist) {
				failures = append(failures, fmt.Errorf("чтение %s: %w", path, err))
			}

			continue
		}

		for line := range strings.Lines(string(data)) {
			fields := strings.Fields(line)
			if len(fields) <= inodeField {
				continue
			}

			if fields[stateField] != stateListen || !strings.HasSuffix(fields[localField], suffix) {
				continue
			}

			inodes[fields[inodeField]] = struct{}{}
		}
	}

	return inodes, errors.Join(failures...)
}

// ownerOf ищет процесс, у которого открыт один из сокетов. Дешевле обхода
// нет: связь «сокет — процесс» в procfs выражена только ссылками в `fd`.
func (r *Reader) ownerOf(ctx context.Context, inodes map[string]struct{}) (int, error) {
	entries, err := os.ReadDir(r.proc)
	if err != nil {
		return 0, fmt.Errorf("чтение %s: %w", r.proc, err)
	}

	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return 0, err
		}

		pid, err := strconv.Atoi(entry.Name())
		if err != nil {
			continue
		}

		if r.holdsSocket(entry.Name(), inodes) {
			return pid, nil
		}
	}

	return 0, errors.New("процесс со слушающим сокетом не найден")
}

func (r *Reader) holdsSocket(pid string, inodes map[string]struct{}) bool {
	dir := filepath.Join(r.proc, pid, "fd")

	entries, err := os.ReadDir(dir)
	if err != nil {
		// Чужие процессы под другим пользователем и процессы, завершившиеся
		// между чтением каталога и дескрипторов, — штатный случай обхода.
		return false
	}

	for _, entry := range entries {
		target, err := os.Readlink(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}

		inode, ok := strings.CutPrefix(target, "socket:[")
		if !ok {
			continue
		}

		if _, ok := inodes[strings.TrimSuffix(inode, "]")]; ok {
			return true
		}
	}

	return false
}
