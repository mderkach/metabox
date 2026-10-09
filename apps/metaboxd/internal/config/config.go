// Package config владеет файлом конфига sing-box на устройстве: читает его,
// пишет атомарно, держит бэкап для отката и раскладывает каталог-кандидат под
// проверку бинарём. Содержимое пакет не разбирает: конфиг для демона — это
// последовательность байт.
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
	// ErrNoConfig — конфига на месте нет: ни файла, ни каталога под него.
	// Штатный случай, на устройстве sing-box могли ещё не настраивать.
	ErrNoConfig = errors.New("файла конфига нет")

	// ErrNoBackup — откатываться не на что: до применения конфига на
	// устройстве не было.
	ErrNoBackup = errors.New("бэкапа нет")

	// ErrNoState — незавершённой транзакции нет, доигрывать нечего.
	ErrNoState = errors.New("состояния транзакции нет")
)

// Имена служебных файлов в каталоге демона. Они не настраиваются: каталог
// задаётся флагом, а раскладка внутри него — забота самого демона.
const (
	backupName   = "config.backup"
	stateName    = "apply.json"
	ruleSetsName = "rule-sets.json"
)

// Store — единственный владелец файла конфига и служебного каталога демона:
// бэкапа, состояния транзакции, истории версий и кэша каталога наборов. Один
// владелец требует Architecture&Style: параллельный доступ закрыт методами,
// снаружи мьютекса быть не должно.
type Store struct {
	mu         sync.Mutex
	dir        string
	name       string
	serviceDir string
}

// NewStore принимает каталог конфига, имя файла в нём и служебный каталог
// демона под бэкап и состояние. Пути приходят флагами, пакет их не выдумывает.
//
// Служебный каталог внутри каталога конфига служба в режиме каталога слила бы
// в рабочую конфигурацию, поэтому такая раскладка отвергается на старте, а не
// выясняется на устройстве.
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

// Read возвращает текущий конфиг. Отсутствие файла или каталога — ErrNoConfig.
func (s *Store) Read(ctx context.Context) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoConfig
	}
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(s.name)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoConfig
	}
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
// rename оставляет прежний файл побайтово нетронутым.
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

// Backup сохраняет для отката текущий конфиг и снимок каталога списков.
// Вызывается до записи нового (шаг 4 протокола применения). Служебный каталог
// создаётся, если его нет, — как и в WriteState.
//
// Конфига на месте нет — ErrNoConfig, и бэкап прошлой транзакции снимается:
// владелец мог удалить конфиг по SSH, и откат этого применения обязан вернуть
// «ничего» (Restore даст ErrNoBackup), а не удалённый конфиг.
func (s *Store) Backup(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	cfgRoot, err := openRoot(s.dir)
	if errors.Is(err, fs.ErrNotExist) {
		return s.dropBackup()
	}
	if err != nil {
		return err
	}
	defer func() { _ = cfgRoot.Close() }()

	data, err := cfgRoot.ReadFile(s.name)
	if errors.Is(err, fs.ErrNotExist) {
		return s.dropBackup()
	}
	if err != nil {
		return fmt.Errorf("чтение конфига %s под бэкап: %w", s.Path(), err)
	}

	if err := ensureDir(s.serviceDir); err != nil {
		return fmt.Errorf("служебный каталог: %w", err)
	}

	serviceRoot, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = serviceRoot.Close() }()

	if err := writeAtomic(serviceRoot, backupName, data, securePerm); err != nil {
		return err
	}

	return s.backupLists(serviceRoot)
}

// dropBackup снимает бэкап прошлой транзакции вместе со снимком списков и
// отдаёт ErrNoConfig. Бэкап конфига снимается первым: обрыв на середине
// оставит снимок списков без бэкапа, а такой Restore не читает. Служебного
// каталога нет — снимать нечего. Вызывается под mu.
func (s *Store) dropBackup() error {
	serviceRoot, err := openRoot(s.serviceDir)
	if errors.Is(err, fs.ErrNotExist) {
		return ErrNoConfig
	}
	if err != nil {
		return err
	}
	defer func() { _ = serviceRoot.Close() }()

	if err := serviceRoot.Remove(backupName); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("снятие устаревшего бэкапа %s: %w", s.BackupPath(), err)
	}

	for _, name := range []string{listsBackupName, listsBackupStaging} {
		if err := serviceRoot.RemoveAll(name); err != nil {
			return fmt.Errorf("снятие устаревшего бэкапа списков %s: %w", name, err)
		}
	}

	if err := syncDir(serviceRoot); err != nil {
		return err
	}

	return ErrNoConfig
}

// backupLists кладёт снимок каталога списков рядом с бэкапом конфига. Снимок
// сначала собирается целиком под временным именем и только потом подменяет
// прежний: обрыв на середине не должен оставлять откат без файлов списков.
func (s *Store) backupLists(serviceRoot *os.Root) error {
	files, err := s.readLists()
	if err != nil {
		return fmt.Errorf("чтение списков под бэкап: %w", err)
	}

	if err := serviceRoot.RemoveAll(listsBackupStaging); err != nil {
		return fmt.Errorf("очистка черновика бэкапа списков: %w", err)
	}

	if err := serviceRoot.Mkdir(listsBackupStaging, secureDirPerm); err != nil {
		return fmt.Errorf("каталог черновика бэкапа списков: %w", err)
	}

	staging, err := serviceRoot.OpenRoot(listsBackupStaging)
	if err != nil {
		return fmt.Errorf("открытие черновика бэкапа списков: %w", err)
	}
	defer func() { _ = staging.Close() }()

	for name, data := range files {
		if err := writeAtomic(staging, name, data, securePerm); err != nil {
			return fmt.Errorf("бэкап списка %s: %w", name, err)
		}
	}

	if err := serviceRoot.RemoveAll(listsBackupName); err != nil {
		return fmt.Errorf("снятие прежнего бэкапа списков: %w", err)
	}

	if err := serviceRoot.Rename(listsBackupStaging, listsBackupName); err != nil {
		return fmt.Errorf("подмена бэкапа списков: %w", err)
	}

	return syncDir(serviceRoot)
}

// Restore возвращает из бэкапа конфиг и каталог списков. Права целевого файла
// сохраняются: откат не должен менять то, что владелец сузил осознанно.
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

	if err := s.restoreLists(serviceRoot); err != nil {
		return err
	}

	return s.write(data)
}

// restoreLists приводит каталог списков к снимку бэкапа: файлы возвращаются
// побайтово, появившиеся после снимка — удаляются. Чужие имена откат не
// трогает ни в бэкапе, ни в каталоге. Бэкап без снимка означает, что он снят
// до появления списков, и каталог не трогается.
func (s *Store) restoreLists(serviceRoot *os.Root) error {
	backup, err := serviceRoot.OpenRoot(listsBackupName)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("открытие бэкапа списков: %w", err)
	}
	defer func() { _ = backup.Close() }()

	entries, err := fs.ReadDir(backup.FS(), ".")
	if err != nil {
		return fmt.Errorf("чтение бэкапа списков: %w", err)
	}

	saved := make(map[string][]byte, len(entries))

	for _, entry := range entries {
		if entry.IsDir() || !ValidListName(entry.Name()) {
			continue
		}

		data, err := backup.ReadFile(entry.Name())
		if err != nil {
			return fmt.Errorf("чтение бэкапа списка %s: %w", entry.Name(), err)
		}

		saved[entry.Name()] = data
	}

	current, err := s.readLists()
	if err != nil {
		return err
	}

	var remove []string

	for name := range current {
		if _, ok := saved[name]; !ok {
			remove = append(remove, name)
		}
	}

	root, err := s.listsRoot(len(saved) > 0)
	if errors.Is(err, errNoLists) {
		return nil
	}
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	for name, data := range saved {
		if err := writeAtomic(root, name, data, permOf(root, name)); err != nil {
			return fmt.Errorf("возврат списка %s: %w", name, err)
		}
	}

	for _, name := range remove {
		if err := root.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("снятие списка %s: %w", name, err)
		}
	}

	return syncDir(root)
}

// StageCandidate раскладывает каталог-кандидат: конфиг с новым содержимым,
// остальные .json рабочего каталога и его подкаталоги целиком. Каталог списков
// собирается с изменениями транзакции — putLists ложатся поверх текущих
// файлов, removeLists в кандидата не попадают: проверять надо ровно то, что
// ляжет на диск после записи. Раскладка повторяет каталог конфига целиком:
// служба в режиме каталога сливает все его .json, а check идёт с -D на
// кандидате, и файлы, на которые конфиг ссылается относительным путём,
// обязаны лежать в нём той же раскладкой.
// Каталог создаёт и удаляет вызывающий.
func (s *Store) StageCandidate(
	ctx context.Context,
	dst string,
	data []byte,
	putLists map[string][]byte,
	removeLists []string,
) error {
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
		if entry.IsDir() {
			if err := copyTree(srcRoot, dstRoot, entry.Name()); err != nil {
				return err
			}

			continue
		}
		if entry.Name() == s.name || !strings.HasSuffix(entry.Name(), ".json") {
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

	if err := s.stageLists(dstRoot, putLists, removeLists); err != nil {
		return err
	}

	if err := dstRoot.WriteFile(s.name, data, securePerm); err != nil {
		return fmt.Errorf("запись кандидата в %s: %w", dst, err)
	}

	return nil
}

// stageLists ложит изменения транзакции поверх скопированного каталога
// списков: removeLists из кандидата убираются, putLists записываются. Всё
// остальное содержимое подкаталога — вложенные каталоги, чужие файлы — уже
// скопировано как есть: проверяется ровно то, что ляжет на диск.
func (s *Store) stageLists(dstRoot *os.Root, put map[string][]byte, remove []string) error {
	if len(put) == 0 && len(remove) == 0 {
		return nil
	}

	if err := dstRoot.Mkdir(listsDirName, secureDirPerm); err != nil && !errors.Is(err, fs.ErrExist) {
		return fmt.Errorf("каталог списков кандидата: %w", err)
	}

	listsRoot, err := dstRoot.OpenRoot(listsDirName)
	if err != nil {
		return fmt.Errorf("открытие каталога списков кандидата: %w", err)
	}
	defer func() { _ = listsRoot.Close() }()

	for _, name := range remove {
		if err := listsRoot.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("снятие списка %s в кандидате: %w", name, err)
		}
	}

	for name, data := range put {
		if err := listsRoot.WriteFile(name, data, securePerm); err != nil {
			return fmt.Errorf("список %s в кандидате: %w", name, err)
		}
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

// copyTree копирует подкаталог рекурсивно. Симлинк на файл разрешается как и
// на верхнем уровне: внутрь каталога — копируется содержимое цели, наружу —
// os.Root его не откроет и раскладка остановится с ошибкой.
func copyTree(src, dst *os.Root, dir string) error {
	return fs.WalkDir(src.FS(), dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("обход %s: %w", path, err)
		}

		if d.IsDir() {
			if err := dst.Mkdir(path, secureDirPerm); err != nil {
				return fmt.Errorf("каталог %s в %s: %w", path, dst.Name(), err)
			}

			return nil
		}

		return copyFile(src, dst, path)
	})
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
// устройство на новом конфиге без автоотката. Служебный каталог создаётся,
// если его нет: демон, запущенный не init-скриптом, иначе валил бы первый Apply.
func (s *Store) WriteState(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := ensureDir(s.serviceDir); err != nil {
		return fmt.Errorf("служебный каталог: %w", err)
	}

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

// ReadRuleSets отдаёт сохранённый каталог наборов. Отсутствие файла или
// служебного каталога — ошибка, для которой errors.Is(err, fs.ErrNotExist):
// демон ещё не сверялся с поставщиками.
func (s *Store) ReadRuleSets(ctx context.Context) ([]byte, error) {
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

	data, err := root.ReadFile(ruleSetsName)
	if err != nil {
		return nil, fmt.Errorf("чтение каталога наборов в %s: %w", s.serviceDir, err)
	}

	return data, nil
}

// WriteRuleSets сохраняет каталог наборов атомарно. Служебный каталог
// создаётся, если его ещё нет: сверка может случиться раньше первого
// применения.
func (s *Store) WriteRuleSets(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := ensureDir(s.serviceDir); err != nil {
		return fmt.Errorf("служебный каталог: %w", err)
	}

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return writeAtomic(root, ruleSetsName, data, securePerm)
}
