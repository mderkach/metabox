package config

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
)

// ErrNoVersion — версии с таким номером в истории нет.
var ErrNoVersion = errors.New("версии конфига нет")

const (
	// versionsDir — подкаталог служебного каталога демона. В каталоге конфига
	// истории не место: сервис поднимается в режиме каталога и слил бы каждую
	// версию в рабочую конфигурацию (ADR-0002).
	versionsDir = "versions"

	// maxVersions — сколько версий держим. Конфиг рукописного роутера — это
	// десятки килобайт, а overlay OpenWrt измеряется десятками мегабайт:
	// глубже история стоит места, которое нужнее пакетам.
	maxVersions = 10

	// secureDirPerm — права каталога истории. В нём лежит то же, что в
	// конфиге, включая ключи, поэтому доступ только владельцу.
	secureDirPerm fs.FileMode = 0o700

	// versionDigits задаёт ширину номера: имена сортируются как строки, и без
	// выравнивания десятая версия встала бы перед второй.
	versionDigits = 6
)

// Version — запись истории. Содержимое конфига демон не разбирает (ADR-0002),
// поэтому наружу идут только номер, размер, отпечаток и отметка времени.
type Version struct {
	// ID — монотонный номер. Время источником порядка быть не может: у
	// роутера нет часов реального времени, он стартует с эпохи и прыгает при
	// синхронизации NTP.
	ID int `json:"id"`
	// Size — размер в байтах.
	Size int64 `json:"size"`
	// Sum — sha256 содержимого. По нему видно, что версия совпадает с
	// активным конфигом, без вычитывания обеих.
	Sum string `json:"sum"`
	// SavedAt — отметка времени файла, секунды Unix. Справочная: показывает
	// часы устройства на момент сохранения и врёт, если они не синхронизованы.
	SavedAt int64 `json:"saved_at"`
}

// VersionsPath отдаёт каталог истории.
func (s *Store) VersionsPath() string {
	return filepath.Join(s.serviceDir, versionsDir)
}

// SaveVersion кладёт содержимое в историю новым номером и подрезает её до
// maxVersions. Вызывается рядом с Backup — до записи нового конфига, — поэтому
// история хранит то, что было применено раньше.
func (s *Store) SaveVersion(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := s.versionsRoot(true)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	saved, err := listVersions(root)
	if err != nil {
		return err
	}

	next := 1
	if len(saved) > 0 {
		next = saved[0].ID + 1
	}

	if err := writeAtomic(root, versionName(next), data, securePerm); err != nil {
		return err
	}

	return trimVersions(root, append([]Version{{ID: next}}, saved...))
}

// Versions отдаёт историю от свежей к старой.
func (s *Store) Versions(ctx context.Context) ([]Version, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := s.versionsRoot(false)
	if errors.Is(err, errNoHistory) {
		// Пустой срез, а не nil: в JSON разница между `[]` и `null` видна, и
		// панель на `null` сломалась бы на первом же обходе списка.
		return []Version{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	return listVersions(root)
}

// ReadVersion отдаёт содержимое версии байтами, как отдаёт и активный конфиг:
// разбирать его демон не вправе.
func (s *Store) ReadVersion(ctx context.Context, id int) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := s.versionsRoot(false)
	if errors.Is(err, errNoHistory) {
		return nil, ErrNoVersion
	}
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(versionName(id))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoVersion
	}
	if err != nil {
		return nil, fmt.Errorf("чтение версии %d: %w", id, err)
	}

	return data, nil
}

// errNoHistory — каталога истории ещё нет. Для чтения это пустая история, а не
// отказ: до первого применения сохранять было нечего.
var errNoHistory = errors.New("каталога истории нет")

// versionsRoot открывает каталог истории. При create он создаётся вместе со
// служебным каталогом демона; без create отсутствие каталога означает пустую
// историю, а не ошибку.
func (s *Store) versionsRoot(create bool) (*os.Root, error) {
	if create {
		if err := os.MkdirAll(s.VersionsPath(), secureDirPerm); err != nil {
			return nil, fmt.Errorf("создание каталога истории %s: %w", s.VersionsPath(), err)
		}
	}

	root, err := os.OpenRoot(s.VersionsPath())
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, errNoHistory
		}

		return nil, fmt.Errorf("открытие каталога истории %s: %w", s.VersionsPath(), err)
	}

	return root, nil
}

// listVersions читает каталог и отдаёт записи от свежей к старой. Файлы с
// именами не по формату пропускаются: каталог служебный, но чужое в нём не
// повод отказать в истории.
func listVersions(root *os.Root) ([]Version, error) {
	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return nil, fmt.Errorf("чтение каталога истории: %w", err)
	}

	versions := make([]Version, 0, len(entries))

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		id, ok := versionID(entry.Name())
		if !ok {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		data, err := root.ReadFile(entry.Name())
		if err != nil {
			continue
		}

		sum := sha256.Sum256(data)
		versions = append(versions, Version{
			ID:      id,
			Size:    info.Size(),
			Sum:     hex.EncodeToString(sum[:]),
			SavedAt: info.ModTime().Unix(),
		})
	}

	sort.Slice(versions, func(i, j int) bool { return versions[i].ID > versions[j].ID })

	return versions, nil
}

// trimVersions удаляет всё, что не помещается в maxVersions. Отказ удаления не
// останавливает применение: лишний файл истории безвреден, а прерванный цикл
// Apply — нет.
func trimVersions(root *os.Root, versions []Version) error {
	if len(versions) <= maxVersions {
		return nil
	}

	for _, stale := range versions[maxVersions:] {
		if err := root.Remove(versionName(stale.ID)); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("удаление версии %d: %w", stale.ID, err)
		}
	}

	return nil
}

func versionName(id int) string {
	return fmt.Sprintf("%0*d", versionDigits, id)
}

func versionID(name string) (int, bool) {
	if len(name) != versionDigits {
		return 0, false
	}

	id, err := strconv.Atoi(name)
	if err != nil || id <= 0 {
		return 0, false
	}

	return id, true
}
