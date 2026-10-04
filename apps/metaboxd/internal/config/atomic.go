package config

import (
	"crypto/rand"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

const (
	// Временный файл лежит в каталоге назначения — rename атомарен только
	// внутри одной файловой системы, — но не оканчивается на .json: сервис
	// поднимается в режиме каталога и слил бы его в конфиг между шагами.
	tempPrefix = ".metabox-"

	// Права нового файла конфига и служебных файлов демона: внутри ключи
	// пользователя. У существующего файла права сохраняются.
	securePerm fs.FileMode = 0o600

	// Сколько раз пробовать новое случайное имя, прежде чем признать, что
	// дело не в совпадении.
	tempAttempts = 10
)

// writeAtomic пишет файл так, чтобы сбой питания не оставил полузаписанного
// результата: временный файл рядом, fsync данных, rename,
// fsync каталога. Порядок сокращению не подлежит — без fsync данных rename
// после сбоя даёт файл нулевой длины, без fsync каталога сама запись о новом
// имени может не пережить сбой.
func writeAtomic(root *os.Root, name string, data []byte, perm fs.FileMode) (err error) {
	tmp, tmpName, err := createTemp(root)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = root.Remove(tmpName)
		}
	}()

	// На путях отказа ошибка Close не проверяется намеренно: запись уже
	// провалилась, файл всё равно удаляется, а подмена причины отказа мешает
	// разбирать инцидент.
	if _, err = tmp.Write(data); err != nil {
		_ = tmp.Close()

		return fmt.Errorf("запись %s: %w", tmpName, err)
	}

	if err = tmp.Sync(); err != nil {
		_ = tmp.Close()

		return fmt.Errorf("fsync %s: %w", tmpName, err)
	}

	if err = tmp.Close(); err != nil {
		return fmt.Errorf("закрытие %s: %w", tmpName, err)
	}

	if err = root.Chmod(tmpName, perm); err != nil {
		return fmt.Errorf("права %s: %w", tmpName, err)
	}

	if err = root.Rename(tmpName, name); err != nil {
		return fmt.Errorf("rename в %s: %w", name, err)
	}

	return syncDir(root)
}

// createTemp заменяет os.CreateTemp, которого у os.Root нет: имя генерируется
// сами́м демоном и открывается с O_EXCL, чтобы не подхватить чужой файл.
func createTemp(root *os.Root) (*os.File, string, error) {
	for range tempAttempts {
		name := tempPrefix + rand.Text()

		f, err := root.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, securePerm)
		if errors.Is(err, fs.ErrExist) {
			continue
		}
		if err != nil {
			return nil, "", fmt.Errorf("временный файл в %s: %w", root.Name(), err)
		}

		return f, name, nil
	}

	return nil, "", fmt.Errorf("временный файл в %s: имя занято %d раз подряд", root.Name(), tempAttempts)
}

func syncDir(root *os.Root) error {
	d, err := root.Open(".")
	if err != nil {
		return fmt.Errorf("открытие каталога %s: %w", root.Name(), err)
	}

	if err := d.Sync(); err != nil {
		_ = d.Close()

		return fmt.Errorf("fsync каталога %s: %w", root.Name(), err)
	}

	if err := d.Close(); err != nil {
		return fmt.Errorf("закрытие каталога %s: %w", root.Name(), err)
	}

	return nil
}

// ensureDir создаёт каталог вместе с недостающими родителями и закрепляет
// каждое созданное звено fsync родителя: без него сбой питания может унести
// свежий каталог вместе с файлами, которые в нём уже успели синкнуть.
// Путь приходит флагом, а не снаружи, поэтому идёт мимо os.Root.
func ensureDir(dir string) error {
	info, err := os.Stat(dir)
	if err == nil {
		if !info.IsDir() {
			return fmt.Errorf("%s не каталог", dir)
		}

		return nil
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("каталог %s: %w", dir, err)
	}

	parent := filepath.Dir(dir)
	if parent != dir {
		if err := ensureDir(parent); err != nil {
			return err
		}
	}

	if err := os.Mkdir(dir, secureDirPerm); err != nil {
		if errors.Is(err, fs.ErrExist) {
			return nil
		}

		return fmt.Errorf("создание каталога %s: %w", dir, err)
	}

	root, err := openRoot(parent)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return syncDir(root)
}

// permOf отдаёт права существующего файла, а для нового — securePerm. Права
// берутся у файла, а не назначаются константой: владелец мог сузить их
// осознанно.
func permOf(root *os.Root, name string) fs.FileMode {
	info, err := root.Stat(name)
	if err != nil {
		return securePerm
	}

	return info.Mode().Perm()
}
