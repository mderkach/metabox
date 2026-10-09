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
	"slices"
	"sort"
	"strconv"
	"strings"
)

var (
	// ErrNoVersion — версии с таким номером в истории нет.
	ErrNoVersion = errors.New("версии конфига нет")

	// ErrNoVersionLists — версия сохранена без снимка файлов списков: демоном,
	// который их ещё не снимал. Восстановление такой версии списков не трогает.
	ErrNoVersionLists = errors.New("у версии нет снимка списков")
)

const (
	// versionsDir — подкаталог служебного каталога демона. В каталоге конфига
	// истории не место: служба в режиме каталога слила бы каждую версию в
	// рабочую конфигурацию.
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

	// versionListsSuffix — суффикс соседнего каталога со снимком списков:
	// 000007 и 000007.rule-sets. Номером такое имя не разбирается, поэтому
	// демон прежней версии каталог пропускает и счётчик у него тот же.
	versionListsSuffix = "." + listsDirName

	// versionListsStaging — черновик снимка. Начинается с точки, чтобы ни
	// номером, ни снимком его не приняли.
	versionListsStaging = ".rule-sets.next"
)

// Version — запись истории. Содержимое конфига демон не разбирает,
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
	// ListsSum — отпечаток снимка файлов списков в той же записи, что etag
	// `GET /api/config/rule-sets`. Поля нет — версия сохранена без снимка, и её
	// восстановление списков не трогает.
	ListsSum string `json:"lists_sum,omitempty"`
}

// VersionsPath отдаёт каталог истории.
func (s *Store) VersionsPath() string {
	return filepath.Join(s.serviceDir, versionsDir)
}

// SaveVersion кладёт содержимое в историю новым номером вместе со снимком
// файлов списков и подрезает её до maxVersions. Вызывается рядом с Backup — до
// записи нового конфига, — поэтому история хранит то, что было применено
// раньше. Точка фиксации — файл версии: снимок пишется до него, и обрыв между
// ними оставляет каталог без номера, которого перечисление не видит.
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

	// Номера читаются без содержимого: хэшировать всю историю ради следующего
	// номера значит держать её целиком в памяти, а памяти у демона немного.
	saved, err := listIDs(root)
	if err != nil {
		return err
	}

	lists, err := s.readLists()
	if err != nil {
		return fmt.Errorf("чтение списков под версию: %w", err)
	}

	// prev — суммы снимка самой свежей версии: по ним ловится повтор и
	// выбираются файлы, которые можно связать ссылкой, а не копировать.
	var prev map[string]string

	if len(saved) > 0 {
		prev, err = snapshotSums(root, saved[0])
		if err != nil && !errors.Is(err, ErrNoVersionLists) {
			return err
		}

		same, err := sameContent(root, saved[0], data)
		if err != nil {
			return err
		}

		// Повторное применение того же конфига с теми же списками в историю
		// не пишется: десять одинаковых применений вытеснили бы всё, что там
		// было.
		if same && sameLists(prev, lists) {
			return nil
		}
	}

	next := 1
	if len(saved) > 0 {
		next = saved[0] + 1
	}

	if err := saveVersionLists(root, next, prev, lists); err != nil {
		return err
	}

	if err := writeAtomic(root, versionName(next), data, securePerm); err != nil {
		return err
	}

	if err := trimVersions(root, append([]int{next}, saved...)); err != nil {
		return fmt.Errorf("версия %d сохранена, подрезка истории: %w", next, err)
	}

	return nil
}

// saveVersionLists кладёт снимок списков в соседний каталог версии next.
// Снимок собирается целиком в черновике и только потом получает имя: обрыв на
// середине не должен оставлять под номером неполный набор. Файл с тем же
// содержимым, что в снимке prev предыдущей версии, связывается жёсткой ссылкой —
// неизменённый список не должен стоить места в каждой версии. Ссылки
// файловая система может не дать, и тогда файл копируется: экономия места не
// повод отказать в версии.
func saveVersionLists(root *os.Root, next int, prev map[string]string, lists map[string][]byte) error {
	// Сирота того же номера — след обрыва до записи файла версии: номер
	// тогда не занят, и снимок собирается заново.
	for _, name := range []string{versionListsName(next), versionListsStaging} {
		if err := root.RemoveAll(name); err != nil {
			return fmt.Errorf("очистка черновика снимка списков %s: %w", name, err)
		}
	}

	if err := root.Mkdir(versionListsStaging, secureDirPerm); err != nil {
		return fmt.Errorf("каталог черновика снимка списков: %w", err)
	}

	staging, err := root.OpenRoot(versionListsStaging)
	if err != nil {
		return fmt.Errorf("открытие черновика снимка списков: %w", err)
	}
	defer func() { _ = staging.Close() }()

	for name, data := range lists {
		if sum, ok := prev[name]; ok && sum == Sum(data) {
			from := versionListsName(next-1) + "/" + name
			if root.Link(from, versionListsStaging+"/"+name) == nil {
				continue
			}
		}

		if err := writeAtomic(staging, name, data, securePerm); err != nil {
			return fmt.Errorf("снимок списка %s: %w", name, err)
		}
	}

	// Ссылки ложатся мимо writeAtomic, и их записи в каталоге закрепляются
	// отдельно.
	if err := syncDir(staging); err != nil {
		return err
	}

	if err := root.Rename(versionListsStaging, versionListsName(next)); err != nil {
		return fmt.Errorf("снимок списков версии %d: %w", next, err)
	}

	return syncDir(root)
}

// sameLists отвечает, совпадает ли набор файлов со снимком. Версия без снимка
// (prev == nil) равна только пустому набору: иначе первое применение со
// списками после обновления демона в историю бы не попало.
func sameLists(prev map[string]string, lists map[string][]byte) bool {
	if prev == nil {
		return len(lists) == 0
	}

	if len(prev) != len(lists) {
		return false
	}

	for name, data := range lists {
		if sum, ok := prev[name]; !ok || sum != Sum(data) {
			return false
		}
	}

	return true
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

// ReadVersionLists отдаёт снимок файлов списков версии: имя → содержимое.
// Пустая карта — на момент сохранения списков не было, ErrNoVersionLists —
// версия сохранена без снимка.
func (s *Store) ReadVersionLists(ctx context.Context, id int) (map[string][]byte, error) {
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

	// Снимок без файла версии — сирота оборванной записи, а не версия.
	if _, err := root.Stat(versionName(id)); errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoVersion
	} else if err != nil {
		return nil, fmt.Errorf("версия %d: %w", id, err)
	}

	snapshot, err := root.OpenRoot(versionListsName(id))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoVersionLists
	}
	if err != nil {
		return nil, fmt.Errorf("открытие снимка списков версии %d: %w", id, err)
	}
	defer func() { _ = snapshot.Close() }()

	entries, err := fs.ReadDir(snapshot.FS(), ".")
	if err != nil {
		return nil, fmt.Errorf("чтение снимка списков версии %d: %w", id, err)
	}

	files := make(map[string][]byte, len(entries))

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		data, err := snapshot.ReadFile(entry.Name())
		if err != nil {
			return nil, fmt.Errorf("чтение снимка списка %s версии %d: %w", entry.Name(), id, err)
		}

		files[entry.Name()] = data
	}

	return files, nil
}

// errNoHistory — каталога истории ещё нет. Для чтения это пустая история, а не
// отказ: до первого применения сохранять было нечего.
var errNoHistory = errors.New("каталога истории нет")

// versionsRoot открывает каталог истории. При create он создаётся вместе со
// служебным каталогом демона; без create отсутствие каталога означает пустую
// историю, а не ошибку.
func (s *Store) versionsRoot(create bool) (*os.Root, error) {
	if create {
		if err := ensureDir(s.serviceDir); err != nil {
			return nil, fmt.Errorf("служебный каталог: %w", err)
		}
	}

	// Подкаталог открывается из уже открытого корня, а не по собранному пути:
	// os.Root держит операции внутри каталога и не даёт уйти по симлинку.
	// Симлинк на месте versions увёл бы каждую версию в рабочую конфигурацию.
	serviceRoot, err := openRoot(s.serviceDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, errNoHistory
		}

		return nil, err
	}
	defer func() { _ = serviceRoot.Close() }()

	if create {
		err := serviceRoot.Mkdir(versionsDir, secureDirPerm)
		if err != nil && !errors.Is(err, fs.ErrExist) {
			return nil, fmt.Errorf("создание каталога истории %s: %w", s.VersionsPath(), err)
		}

		// Свежий каталог закрепляется fsync родителя, как в ensureDir.
		if err == nil {
			if err := syncDir(serviceRoot); err != nil {
				return nil, err
			}
		}
	}

	root, err := serviceRoot.OpenRoot(versionsDir)
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

		sum, err := streamSum(root, entry.Name())
		if err != nil {
			continue
		}

		version := Version{
			ID:      id,
			Size:    info.Size(),
			Sum:     sum,
			SavedAt: info.ModTime().Unix(),
		}

		lists, err := snapshotSums(root, id)
		switch {
		case err == nil:
			version.ListsSum = ListsEtag(lists)
		case errors.Is(err, ErrNoVersionLists):
		default:
			continue
		}

		versions = append(versions, version)
	}

	sort.Slice(versions, func(i, j int) bool { return versions[i].ID > versions[j].ID })

	return versions, nil
}

// streamSum считает sha256 версии потоком: список истории запрашивается на
// каждый заход в панель, и поднимать ради отпечатка все версии в память
// незачем.
func streamSum(root *os.Root, name string) (string, error) {
	f, err := root.Open(name)
	if err != nil {
		return "", err
	}
	defer func() { _ = f.Close() }()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}

// trimVersions удаляет всё, что не помещается в maxVersions, вместе с
// соседними каталогами снимков, а заодно снимки без файла версии среди
// оставленных номеров: сироты оборванной записи и каталоги, которые оставила
// подрезка демона прежней версии. Отказ удаления не останавливает применение:
// лишний файл истории безвреден, а прерванный цикл Apply — нет.
func trimVersions(root *os.Root, ids []int) error {
	kept := ids[:min(len(ids), maxVersions)]

	for _, stale := range ids[len(kept):] {
		if err := root.Remove(versionName(stale)); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("удаление версии %d: %w", stale, err)
		}
	}

	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return fmt.Errorf("чтение каталога истории: %w", err)
	}

	for _, entry := range entries {
		id, ok := versionListsID(entry.Name())
		if !ok || slices.Contains(kept, id) {
			continue
		}

		if err := root.RemoveAll(entry.Name()); err != nil {
			return fmt.Errorf("удаление снимка списков %s: %w", entry.Name(), err)
		}
	}

	return nil
}

// listIDs отдаёт номера от свежего к старому, не читая содержимого.
func listIDs(root *os.Root) ([]int, error) {
	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return nil, fmt.Errorf("чтение каталога истории: %w", err)
	}

	ids := make([]int, 0, len(entries))

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		if id, ok := versionID(entry.Name()); ok {
			ids = append(ids, id)
		}
	}

	sort.Sort(sort.Reverse(sort.IntSlice(ids)))

	return ids, nil
}

// sameContent отвечает, совпадает ли версия с тем, что собираются сохранить.
func sameContent(root *os.Root, id int, data []byte) (bool, error) {
	saved, err := root.ReadFile(versionName(id))
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("чтение версии %d: %w", id, err)
	}

	return sha256.Sum256(saved) == sha256.Sum256(data), nil
}

// snapshotSums считает sha256 файлов снимка версии потоком, не поднимая
// снимок в память: список истории запрашивается на каждый заход в панель.
// ErrNoVersionLists — снимка у версии нет.
func snapshotSums(root *os.Root, id int) (map[string]string, error) {
	dir := versionListsName(id)

	entries, err := fs.ReadDir(root.FS(), dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoVersionLists
	}
	if err != nil {
		return nil, fmt.Errorf("чтение снимка списков версии %d: %w", id, err)
	}

	sums := make(map[string]string, len(entries))

	for _, entry := range entries {
		if entry.IsDir() || !ValidListName(entry.Name()) {
			continue
		}

		sum, err := streamSum(root, dir+"/"+entry.Name())
		if err != nil {
			return nil, fmt.Errorf("снимок списка %s версии %d: %w", entry.Name(), id, err)
		}

		sums[entry.Name()] = sum
	}

	return sums, nil
}

func versionName(id int) string {
	return fmt.Sprintf("%0*d", versionDigits, id)
}

func versionListsName(id int) string {
	return versionName(id) + versionListsSuffix
}

func versionListsID(name string) (int, bool) {
	prefix, ok := strings.CutSuffix(name, versionListsSuffix)
	if !ok {
		return 0, false
	}

	return versionID(prefix)
}

func versionID(name string) (int, bool) {
	// Меньше положенной ширины — чужое имя. Больше допускается: номер выше
	// миллиона перестаёт помещаться в versionDigits, и отвергать такие имена
	// значило бы сбросить счётчик и перетереть первую версию.
	if len(name) < versionDigits {
		return 0, false
	}

	id, err := strconv.Atoi(name)
	if err != nil || id <= 0 {
		return 0, false
	}

	return id, true
}

// Sum — отпечаток содержимого в той записи, в какой его видит панель: sha256
// шестнадцатеричной строкой.
func Sum(data []byte) string {
	sum := sha256.Sum256(data)

	return hex.EncodeToString(sum[:])
}

// ListsEtag — отпечаток набора файлов списков: имена с суммами в стабильном
// порядке. Его отдаёт чтение списков, его же клиент возвращает базой
// применения, и в той же записи история отдаёт отпечаток снимка версии.
func ListsEtag(sums map[string]string) string {
	names := make([]string, 0, len(sums))
	for name := range sums {
		names = append(names, name)
	}

	sort.Strings(names)

	h := sha256.New()
	for _, name := range names {
		// Запись в hash.Hash не отказывает по контракту пакета hash.
		_, _ = fmt.Fprintf(h, "%s:%s\n", name, sums[name])
	}

	return hex.EncodeToString(h.Sum(nil))
}
