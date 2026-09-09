// Package config владеет файлом конфига sing-box на устройстве: читает его,
// пишет атомарно, держит бэкап для отката и раскладывает каталог-кандидат под
// проверку бинарём. Содержимое пакет не разбирает — по ADR-0002 конфиг для
// демона это последовательность байт.
//
// Все файловые операции идут через os.Root: демон работает с правами root, а в
// рабочем каталоге может оказаться симлинк, оставленный владельцем или чужим
// софтом, — за пределы своего каталога пакет не выходит.
package config

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	// ErrNoBackup — откатываться не на что: демон ещё ничего не применял.
	ErrNoBackup = errors.New("бэкапа нет")

	// ErrNoState — незавершённой транзакции нет, доигрывать нечего.
	ErrNoState = errors.New("состояния транзакции нет")
)

// Имена служебных файлов в каталоге демона. Они не настраиваются: каталог
// задаётся флагом, а раскладка внутри него — забота самого демона.
const (
	backupName = "config.backup"
	stateName  = "apply.json"
)

// Store — единственный владелец файла конфига, его бэкапа и состояния
// транзакции. Один владелец на все три файла требует Architecture&Style:
// параллельный доступ закрыт методами, снаружи мьютекса быть не должно.
type Store struct {
	mu         sync.Mutex
	dir        string
	name       string
	serviceDir string
}

// NewStore принимает каталог конфига, имя файла в нём и служебный каталог
// демона под бэкап и состояние. Пути приходят флагами, пакет их не выдумывает.
//
// Служебный каталог внутри каталога конфига сервис слил бы в рабочую
// конфигурацию — он поднимается в режиме каталога (ADR-0002), — поэтому такая
// раскладка отвергается на старте, а не выясняется на устройстве.
func NewStore(dir, name, serviceDir string) (*Store, error) {
	if name == "" {
		return nil, errors.New("имя файла конфига пусто")
	}

	dir = filepath.Clean(dir)
	serviceDir = filepath.Clean(serviceDir)

	if within(dir, serviceDir) {
		return nil, fmt.Errorf("служебный каталог %s лежит в каталоге конфига %s", serviceDir, dir)
	}

	return &Store{dir: dir, name: name, serviceDir: serviceDir}, nil
}

// within отвечает, лежит ли path внутри dir. filepath.Rel даёт путь, ведущий
// наружу через "..", — по нему и различаем.
func within(dir, path string) bool {
	rel, err := filepath.Rel(dir, path)
	if err != nil {
		return false
	}

	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// Path отдаёт полный путь к файлу конфига.
func (s *Store) Path() string {
	return filepath.Join(s.dir, s.name)
}

// BackupPath отдаёт полный путь к бэкапу.
func (s *Store) BackupPath() string {
	return filepath.Join(s.serviceDir, backupName)
}

// StatePath отдаёт полный путь к файлу состояния транзакции.
func (s *Store) StatePath() string {
	return filepath.Join(s.serviceDir, stateName)
}

// Read возвращает текущий конфиг. Отсутствие файла — штатный случай, ошибка
// заворачивает fs.ErrNotExist.
func (s *Store) Read(ctx context.Context) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.dir)
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(s.name)
	if err != nil {
		return nil, fmt.Errorf("чтение конфига %s: %w", s.Path(), err)
	}

	return data, nil
}

// Sum считает sha256 текущего конфига потоком, не поднимая файл в память:
// демон работает месяцами, и лишняя копия конфига здесь ни к чему.
func (s *Store) Sum(ctx context.Context) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.dir)
	if err != nil {
		return "", err
	}
	defer func() { _ = root.Close() }()

	f, err := root.Open(s.name)
	if err != nil {
		return "", fmt.Errorf("открытие конфига %s: %w", s.Path(), err)
	}
	defer func() { _ = f.Close() }()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", fmt.Errorf("чтение конфига %s: %w", s.Path(), err)
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}

// Write кладёт новый конфиг на место старого атомарно. Отказ на любом шаге до
// rename оставляет прежний файл побайтово нетронутым (AC-29).
//
// Контекст проверяется до начала записи и не прерывает её середину: отмена
// между fsync и rename дала бы ровно то состояние, от которого защищает
// атомарная запись.
func (s *Store) Write(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.write(data)
}

// Backup сохраняет текущий конфиг для отката. Вызывается до записи нового
// (шаг 4 протокола ADR-0002).
func (s *Store) Backup(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	cfgRoot, err := openRoot(s.dir)
	if err != nil {
		return err
	}
	defer func() { _ = cfgRoot.Close() }()

	data, err := cfgRoot.ReadFile(s.name)
	if err != nil {
		return fmt.Errorf("чтение конфига %s под бэкап: %w", s.Path(), err)
	}

	serviceRoot, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = serviceRoot.Close() }()

	return writeAtomic(serviceRoot, backupName, data, securePerm)
}

// Restore возвращает конфиг из бэкапа. Права целевого файла сохраняются:
// откат не должен менять то, что владелец сузил осознанно.
func (s *Store) Restore(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	serviceRoot, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = serviceRoot.Close() }()

	data, err := serviceRoot.ReadFile(backupName)
	if errors.Is(err, fs.ErrNotExist) {
		return ErrNoBackup
	}
	if err != nil {
		return fmt.Errorf("чтение бэкапа %s: %w", s.BackupPath(), err)
	}

	return s.write(data)
}

// StageCandidate раскладывает каталог-кандидат: конфиг с новым содержимым плюс
// остальные .json рабочего каталога. Проверять надо ровно то, что поднимет
// сервис, а он сливает весь каталог (ADR-0002). Каталог создаёт и удаляет
// вызывающий.
func (s *Store) StageCandidate(ctx context.Context, dst string, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	srcRoot, err := openRoot(s.dir)
	if err != nil {
		return err
	}
	defer func() { _ = srcRoot.Close() }()

	dstRoot, err := openRoot(dst)
	if err != nil {
		return err
	}
	defer func() { _ = dstRoot.Close() }()

	entries, err := fs.ReadDir(srcRoot.FS(), ".")
	if err != nil {
		return fmt.Errorf("чтение каталога конфига %s: %w", s.dir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() || entry.Name() == s.name || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		// Симлинки не отсеиваются: тот, что ведёт внутрь каталога, сервис
		// прочитает и сольёт, значит кандидат обязан его содержать. Тот, что
		// ведёт наружу, os.Root не откроет — и Apply остановится с ошибкой,
		// потому что сервис на таком каталоге всё равно не поднимется.
		if err := copyFile(srcRoot, dstRoot, entry.Name()); err != nil {
			return err
		}
	}

	if err := dstRoot.WriteFile(s.name, data, securePerm); err != nil {
		return fmt.Errorf("запись кандидата в %s: %w", dst, err)
	}

	return nil
}

// write выполняет запись под уже взятым мьютексом.
func (s *Store) write(data []byte) error {
	root, err := openRoot(s.dir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return writeAtomic(root, s.name, data, permOf(root, s.name))
}

func openRoot(dir string) (*os.Root, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, fmt.Errorf("открытие каталога %s: %w", dir, err)
	}

	return root, nil
}

func copyFile(src, dst *os.Root, name string) error {
	in, err := src.Open(name)
	if err != nil {
		return fmt.Errorf("открытие %s: %w", name, err)
	}
	defer func() { _ = in.Close() }()

	out, err := dst.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, securePerm)
	if err != nil {
		return fmt.Errorf("создание %s в %s: %w", name, dst.Name(), err)
	}

	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()

		return fmt.Errorf("копирование %s в %s: %w", name, dst.Name(), err)
	}

	if err := out.Close(); err != nil {
		return fmt.Errorf("закрытие %s в %s: %w", name, dst.Name(), err)
	}

	return nil
}

// ReadState отдаёт сохранённое состояние транзакции. Отсутствие файла —
// штатный случай: демон стартовал с чистого листа.
func (s *Store) ReadState(ctx context.Context) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(stateName)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoState
	}
	if err != nil {
		return nil, fmt.Errorf("чтение состояния %s: %w", s.StatePath(), err)
	}

	return data, nil
}

// WriteState сохраняет состояние транзакции атомарно. Вызывается до записи
// конфига: питание, снятое между записью и стартом таймера, иначе оставило бы
// устройство на новом конфиге без автоотката (ADR-0002).
func (s *Store) WriteState(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return writeAtomic(root, stateName, data, securePerm)
}

// ClearState убирает состояние завершённой транзакции. Отсутствие файла
// ошибкой не считается: доигрывать нечего.
func (s *Store) ClearState(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	if err := root.Remove(stateName); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("удаление состояния %s: %w", s.StatePath(), err)
	}

	return syncDir(root)
}
