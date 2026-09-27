package config

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

const (
	// listsDirName — подкаталог каталога конфига под файлы своих списков.
	// В корень такой файл класть нельзя: служба поднимается в режиме каталога
	// и слила бы его с конфигом как ещё один .json.
	listsDirName = "rule-sets"

	// listsBackupName — снимок подкаталога списков в служебном каталоге;
	// восстанавливается вместе с config.backup.
	listsBackupName = "rule-sets.backup"

	// listsBackupStaging — имя, под которым очередной снимок собирается
	// целиком до подмены: обрыв на середине не должен портить прежний.
	listsBackupStaging = "rule-sets.backup.next"
)

// ListsPath отдаёт каталог файлов списков.
func (s *Store) ListsPath() string {
	return filepath.Join(s.dir, listsDirName)
}

// ReadLists отдаёт файлы списков: имя → содержимое. Отсутствие подкаталога —
// пустой набор, а не ошибка: до первого списка его и не бывает.
func (s *Store) ReadLists(ctx context.Context) (map[string][]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.readLists()
}

func (s *Store) readLists() (map[string][]byte, error) {
	root, err := s.listsRoot(false)
	if errors.Is(err, errNoLists) {
		return map[string][]byte{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return nil, fmt.Errorf("чтение каталога списков %s: %w", s.ListsPath(), err)
	}

	files := make(map[string][]byte, len(entries))

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		data, err := root.ReadFile(entry.Name())
		if err != nil {
			return nil, fmt.Errorf("чтение списка %s: %w", entry.Name(), err)
		}

		files[entry.Name()] = data
	}

	return files, nil
}

// ListSums отдаёт sha256 каждого файла списков: по ним ловится правка файлов
// вне metabox и доигрывание оборванной записи.
func (s *Store) ListSums(ctx context.Context) (map[string]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.listSums()
}

func (s *Store) listSums() (map[string]string, error) {
	files, err := s.readLists()
	if err != nil {
		return nil, err
	}

	sums := make(map[string]string, len(files))
	for name, data := range files {
		sums[name] = Sum(data)
	}

	return sums, nil
}

// WriteLists применяет изменения файлов списков: put пишется атомарно с
// правами конфига, remove удаляет. Пишет только протокол Apply — форк следит
// за файлами и перечитывает их на лету, поэтому запись мимо транзакции обошла
// бы проверку и автооткат.
func (s *Store) WriteLists(ctx context.Context, put map[string][]byte, remove []string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := s.listsRoot(len(put) > 0)
	if errors.Is(err, errNoLists) {
		// Писать нечего, удалять не из чего.
		return nil
	}
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	for name, data := range put {
		if err := writeAtomic(root, name, data, permOf(root, name)); err != nil {
			return fmt.Errorf("запись списка %s: %w", name, err)
		}
	}

	for _, name := range remove {
		if err := root.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("удаление списка %s: %w", name, err)
		}
	}

	return syncDir(root)
}

// errNoLists — подкаталога списков нет. Для чтения это пустой набор.
var errNoLists = errors.New("каталога списков нет")

// listsRoot открывает подкаталог списков из открытого корня каталога конфига:
// симлинк на его месте увёл бы запись наружу. При create подкаталог создаётся,
// и создание закрепляется fsync родителя — иначе сбой питания может унести
// каталог вместе со свежими списками.
func (s *Store) listsRoot(create bool) (*os.Root, error) {
	cfgRoot, err := openRoot(s.dir)
	if err != nil {
		return nil, err
	}
	defer func() { _ = cfgRoot.Close() }()

	if create {
		if err := cfgRoot.Mkdir(listsDirName, secureDirPerm); err != nil && !errors.Is(err, fs.ErrExist) {
			return nil, fmt.Errorf("создание каталога списков %s: %w", s.ListsPath(), err)
		}

		if err := syncDir(cfgRoot); err != nil {
			return nil, err
		}
	}

	root, err := cfgRoot.OpenRoot(listsDirName)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, errNoLists
		}

		return nil, fmt.Errorf("открытие каталога списков %s: %w", s.ListsPath(), err)
	}

	return root, nil
}
