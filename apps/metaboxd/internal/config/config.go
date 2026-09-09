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

// ErrNoBackup — откатываться не на что: демон ещё ничего не применял.
var ErrNoBackup = errors.New("бэкапа нет")

// Store — единственный владелец файла конфига и его бэкапа. Параллельный
// доступ закрыт методами: снаружи мьютекса быть не должно.
type Store struct {
	mu         sync.Mutex
	dir        string
	name       string
	backupDir  string
	backupName string
}

// NewStore принимает каталог конфига, имя файла в нём и путь к бэкапу. Пути
// приходят флагами, пакет их не выдумывает.
//
// Бэкап внутри каталога конфига сервис слил бы в рабочую конфигурацию — он
// поднимается в режиме каталога (ADR-0002), — поэтому такая раскладка
// отвергается на старте, а не выясняется на устройстве.
func NewStore(dir, name, backupPath string) (*Store, error) {
	backupDir, backupName := filepath.Split(backupPath)
	backupDir = filepath.Clean(backupDir)

	if backupName == "" {
		return nil, fmt.Errorf("путь к бэкапу %q не содержит имени файла", backupPath)
	}
	if within(filepath.Clean(dir), backupDir) {
		return nil, fmt.Errorf("бэкап %s лежит в каталоге конфига %s", backupPath, dir)
	}

	return &Store{
		dir:        dir,
		name:       name,
		backupDir:  backupDir,
		backupName: backupName,
	}, nil
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
	return filepath.Join(s.backupDir, s.backupName)
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

	backupRoot, err := openRoot(s.backupDir)
	if err != nil {
		return err
	}
	defer func() { _ = backupRoot.Close() }()

	return writeAtomic(backupRoot, s.backupName, data, securePerm)
}

// Restore возвращает конфиг из бэкапа. Права целевого файла сохраняются:
// откат не должен менять то, что владелец сузил осознанно.
func (s *Store) Restore(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	backupRoot, err := openRoot(s.backupDir)
	if err != nil {
		return err
	}
	defer func() { _ = backupRoot.Close() }()

	data, err := backupRoot.ReadFile(s.backupName)
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
