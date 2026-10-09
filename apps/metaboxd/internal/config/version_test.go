package config

import (
	"bytes"
	"errors"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func newVersionStore(t *testing.T) *Store {
	t.Helper()

	dir := t.TempDir()
	cfgDir := filepath.Join(dir, "config")
	serviceDir := filepath.Join(dir, "service")

	for _, d := range []string{cfgDir, serviceDir} {
		if err := os.Mkdir(d, 0o700); err != nil {
			t.Fatalf("создание %s: %v", d, err)
		}
	}

	store, err := NewStore(cfgDir, "config.json", serviceDir)
	if err != nil {
		t.Fatalf("создание хранилища: %v", err)
	}

	return store
}

func TestSaveVersionNumbersMonotonically(t *testing.T) {
	store := newVersionStore(t)

	for i := 1; i <= 3; i++ {
		if err := store.SaveVersion(t.Context(), []byte(`{"v":`+strconv.Itoa(i)+`}`)); err != nil {
			t.Fatalf("сохранение версии %d: %v", i, err)
		}
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}

	if len(got) != 3 {
		t.Fatalf("версий в истории %d, ожидали 3", len(got))
	}

	// Свежая первой: экран истории показывает последние правки сверху.
	want := []int{3, 2, 1}
	for i, version := range got {
		if version.ID != want[i] {
			t.Errorf("версия на позиции %d имеет номер %d, ожидали %d", i, version.ID, want[i])
		}

		if version.Sum == "" || version.Size == 0 {
			t.Errorf("версия %d без отпечатка или размера: %+v", version.ID, version)
		}
	}
}

func TestVersionsTrimmedToLimit(t *testing.T) {
	store := newVersionStore(t)

	total := maxVersions + 4
	for i := 1; i <= total; i++ {
		if err := store.SaveVersion(t.Context(), []byte(`{"v":`+strconv.Itoa(i)+`}`)); err != nil {
			t.Fatalf("сохранение версии %d: %v", i, err)
		}
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}

	if len(got) != maxVersions {
		t.Fatalf("версий в истории %d, ожидали %d", len(got), maxVersions)
	}

	if got[0].ID != total {
		t.Errorf("самая свежая версия %d, ожидали %d", got[0].ID, total)
	}

	// Номера не переиспользуются: удаление старых не сдвигает счётчик.
	if oldest := got[len(got)-1].ID; oldest != total-maxVersions+1 {
		t.Errorf("самая старая версия %d, ожидали %d", oldest, total-maxVersions+1)
	}

	// Снимки списков подрезаются вместе с версиями: каталог на каждую
	// оставленную, и ни одного сверх.
	entries, err := os.ReadDir(store.VersionsPath())
	if err != nil {
		t.Fatalf("чтение каталога истории: %v", err)
	}

	sidecars := 0
	for _, entry := range entries {
		if _, ok := versionListsID(entry.Name()); ok && entry.IsDir() {
			sidecars++
		}
	}

	if sidecars != maxVersions {
		t.Errorf("снимков списков %d, ожидали %d", sidecars, maxVersions)
	}
}

func TestReadVersionReturnsBytesAsIs(t *testing.T) {
	store := newVersionStore(t)

	// Форматирование и порядок ключей сохраняются: демон конфиг не разбирает.
	raw := []byte("{\n  \"outbounds\": [],\n  \"log\": {\"level\": \"error\"}\n}\n")
	if err := store.SaveVersion(t.Context(), raw); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	got, err := store.ReadVersion(t.Context(), 1)
	if err != nil {
		t.Fatalf("чтение версии: %v", err)
	}

	if string(got) != string(raw) {
		t.Errorf("содержимое версии: получили %q, ожидали %q", got, raw)
	}
}

func TestReadVersionUnknown(t *testing.T) {
	store := newVersionStore(t)

	if _, err := store.ReadVersion(t.Context(), 42); !errors.Is(err, ErrNoVersion) {
		t.Errorf("чтение неизвестной версии: получили %v, ожидали ErrNoVersion", err)
	}
}

func TestVersionsEmptyHistory(t *testing.T) {
	store := newVersionStore(t)

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение пустой истории: %v", err)
	}

	if len(got) != 0 {
		t.Errorf("версий в пустой истории %d, ожидали 0", len(got))
	}
}

// Каталог истории лежит вне каталога конфига: сервис поднимается в режиме
// каталога и слил бы версии в рабочую конфигурацию.
func TestVersionsStoredOutsideConfigDir(t *testing.T) {
	store := newVersionStore(t)
	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[]}`)})

	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	// В каталоге конфига только подкаталог списков, и в нём ровно рабочий
	// файл: снимок лежит в истории, а не рядом с конфигом.
	entries, err := os.ReadDir(store.dir)
	if err != nil {
		t.Fatalf("чтение каталога конфига: %v", err)
	}

	if len(entries) != 1 || entries[0].Name() != listsDirName {
		t.Errorf("в каталоге конфига появились файлы: %v", entries)
	}

	lists, err := os.ReadDir(store.ListsPath())
	if err != nil {
		t.Fatalf("чтение каталога списков: %v", err)
	}

	if len(lists) != 1 {
		t.Errorf("в каталоге списков появились файлы: %v", lists)
	}

	if _, err := os.Stat(store.VersionsPath()); err != nil {
		t.Errorf("каталога истории нет: %v", err)
	}
}

// Чужие файлы в служебном каталоге историю не ломают.
func TestVersionsIgnoresForeignNames(t *testing.T) {
	store := newVersionStore(t)

	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	foreign := filepath.Join(store.VersionsPath(), "readme.txt")
	if err := os.WriteFile(foreign, []byte("не версия"), securePerm); err != nil {
		t.Fatalf("запись чужого файла: %v", err)
	}

	// Каталог с суффиксом снимка, но без номера — тоже чужой.
	foreignDir := filepath.Join(store.VersionsPath(), "notes"+versionListsSuffix)
	if err := os.Mkdir(foreignDir, secureDirPerm); err != nil {
		t.Fatalf("создание чужого каталога: %v", err)
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}

	if len(got) != 1 {
		t.Errorf("версий в истории %d, ожидали 1", len(got))
	}

	// Подрезка чужое не трогает: она снимает только снимки с номером.
	if err := store.SaveVersion(t.Context(), []byte(`{"v":2}`)); err != nil {
		t.Fatalf("сохранение второй версии: %v", err)
	}

	for _, path := range []string{foreign, foreignDir} {
		if _, err := os.Stat(path); err != nil {
			t.Errorf("чужое %s пропало после сохранения: %v", path, err)
		}
	}
}

// До первого применения служебного каталога на устройстве может не быть:
// чтение истории обязано вернуть пусто, а не отказ.
func TestVersionsWithoutServiceDir(t *testing.T) {
	dir := t.TempDir()
	cfgDir := filepath.Join(dir, "config")

	if err := os.Mkdir(cfgDir, 0o700); err != nil {
		t.Fatalf("создание %s: %v", cfgDir, err)
	}

	store, err := NewStore(cfgDir, "config.json", filepath.Join(dir, "нет-такого"))
	if err != nil {
		t.Fatalf("создание хранилища: %v", err)
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории без служебного каталога: %v", err)
	}

	if got == nil {
		t.Error("история отдана как nil: в JSON это null, а не пустой список")
	}

	if len(got) != 0 {
		t.Errorf("версий %d, ожидали 0", len(got))
	}

	if _, err := store.ReadVersion(t.Context(), 1); !errors.Is(err, ErrNoVersion) {
		t.Errorf("чтение версии: получили %v, ожидали ErrNoVersion", err)
	}

	// Сохранение каталог создаёт само.
	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	if got, err := store.Versions(t.Context()); err != nil || len(got) != 1 {
		t.Errorf("после сохранения версий %d, ошибка %v", len(got), err)
	}
}

// Повторное применение того же конфига историю не засоряет: иначе десять
// одинаковых применений вытеснили бы всё, что в ней было.
func TestSaveVersionSkipsDuplicate(t *testing.T) {
	store := newVersionStore(t)
	same := []byte(`{"log":{"level":"error"}}`)

	for range 3 {
		if err := store.SaveVersion(t.Context(), same); err != nil {
			t.Fatalf("сохранение версии: %v", err)
		}
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("версий %d, ожидали 1", len(got))
	}

	// Другое содержимое по-прежнему добавляется.
	if err := store.SaveVersion(t.Context(), []byte(`{"log":{"level":"warn"}}`)); err != nil {
		t.Fatalf("сохранение другой версии: %v", err)
	}

	if got, err := store.Versions(t.Context()); err != nil || len(got) != 2 {
		t.Errorf("версий %d, ошибка %v, ожидали 2", len(got), err)
	}
}

// writeVersionLists приводит рабочий каталог списков к files: лишние файлы
// удаляются, остальные пишутся.
func writeVersionLists(t *testing.T, store *Store, files map[string][]byte) {
	t.Helper()

	current, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("чтение списков: %v", err)
	}

	var remove []string

	for name := range current {
		if _, ok := files[name]; !ok {
			remove = append(remove, name)
		}
	}

	if err := store.WriteLists(t.Context(), files, remove); err != nil {
		t.Fatalf("запись списков: %v", err)
	}
}

// Версия хранит списки на момент сохранения: последующая правка рабочих
// файлов снимок не меняет.
func TestSaveVersionSnapshotsLists(t *testing.T) {
	store := newVersionStore(t)
	before := map[string][]byte{"my.json": []byte(`{"rules":[{"domain":["a"]}]}`)}
	writeVersionLists(t, store, before)

	if err := store.SaveVersion(t.Context(), []byte(`{"v":1}`)); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	writeVersionLists(t, store, map[string][]byte{
		"my.json":  []byte(`{"rules":[{"domain":["b"]}]}`),
		"new.json": []byte(`{"rules":[]}`),
	})

	got, err := store.ReadVersionLists(t.Context(), 1)
	if err != nil {
		t.Fatalf("чтение снимка списков: %v", err)
	}

	if !maps.EqualFunc(got, before, bytes.Equal) {
		t.Errorf("снимок списков: получили %q, ожидали %q", got, before)
	}

	versions, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}

	want := ListsEtag(map[string]string{"my.json": Sum(before["my.json"])})
	if len(versions) != 1 || versions[0].ListsSum != want {
		t.Errorf("отпечаток снимка: получили %+v, ожидали lists_sum %q", versions, want)
	}
}

// «Списков не было» — тоже состояние: откат на такую версию снимает списки,
// появившиеся позже.
func TestSaveVersionSnapshotsEmptyLists(t *testing.T) {
	store := newVersionStore(t)

	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	got, err := store.ReadVersionLists(t.Context(), 1)
	if err != nil {
		t.Fatalf("чтение пустого снимка: %v", err)
	}

	if got == nil || len(got) != 0 {
		t.Errorf("пустой снимок: получили %v, ожидали пустую карту", got)
	}

	versions, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}

	if want := ListsEtag(map[string]string{}); len(versions) != 1 || versions[0].ListsSum != want {
		t.Errorf("отпечаток пустого снимка: получили %+v, ожидали %q", versions, want)
	}
}

// writeLegacyVersion кладёт версию так, как её сохранял демон до снимков
// списков: один файл без соседнего каталога.
func writeLegacyVersion(t *testing.T, store *Store, id int, data []byte) {
	t.Helper()

	if err := os.MkdirAll(store.VersionsPath(), secureDirPerm); err != nil {
		t.Fatalf("каталог истории: %v", err)
	}

	if err := os.WriteFile(filepath.Join(store.VersionsPath(), versionName(id)), data, securePerm); err != nil {
		t.Fatalf("запись старой версии: %v", err)
	}
}

// Версия, сохранённая до снимков списков, читается как прежде, а её снимок —
// отдельным отказом: восстановление тогда списков не трогает.
func TestReadVersionListsLegacy(t *testing.T) {
	store := newVersionStore(t)
	raw := []byte(`{"log":{}}`)
	writeLegacyVersion(t, store, 1, raw)

	if _, err := store.ReadVersionLists(t.Context(), 1); !errors.Is(err, ErrNoVersionLists) {
		t.Errorf("снимок старой версии: получили %v, ожидали ErrNoVersionLists", err)
	}

	data, err := store.ReadVersion(t.Context(), 1)
	if err != nil || !bytes.Equal(data, raw) {
		t.Errorf("содержимое старой версии: получили %q, ошибка %v", data, err)
	}

	versions, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}

	if len(versions) != 1 {
		t.Fatalf("версий %d, ожидали 1", len(versions))
	}

	if versions[0].ListsSum != "" {
		t.Errorf("у старой версии отпечаток снимка %q, ожидали пусто", versions[0].ListsSum)
	}
}

func TestReadVersionListsUnknown(t *testing.T) {
	t.Run("истории нет", func(t *testing.T) {
		store := newVersionStore(t)

		if _, err := store.ReadVersionLists(t.Context(), 1); !errors.Is(err, ErrNoVersion) {
			t.Errorf("получили %v, ожидали ErrNoVersion", err)
		}
	})

	t.Run("номера нет", func(t *testing.T) {
		store := newVersionStore(t)

		if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
			t.Fatalf("сохранение версии: %v", err)
		}

		if _, err := store.ReadVersionLists(t.Context(), 42); !errors.Is(err, ErrNoVersion) {
			t.Errorf("получили %v, ожидали ErrNoVersion", err)
		}
	})

	// Снимок без файла версии — сирота оборванной записи, а не версия.
	t.Run("сирота без файла версии", func(t *testing.T) {
		store := newVersionStore(t)

		if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
			t.Fatalf("сохранение версии: %v", err)
		}

		if err := os.Mkdir(filepath.Join(store.VersionsPath(), versionListsName(2)), secureDirPerm); err != nil {
			t.Fatalf("создание сироты: %v", err)
		}

		if _, err := store.ReadVersionLists(t.Context(), 2); !errors.Is(err, ErrNoVersion) {
			t.Errorf("получили %v, ожидали ErrNoVersion", err)
		}
	})
}

// Повтор — тот же конфиг и тот же набор списков. Изменённый список даёт новую
// версию с прежним конфигом; старая версия без снимка равна только пустому
// набору.
func TestSaveVersionDedupesConfigAndLists(t *testing.T) {
	a := map[string][]byte{"my.json": []byte(`{"rules":[{"domain":["a"]}]}`)}
	b := map[string][]byte{"my.json": []byte(`{"rules":[{"domain":["b"]}]}`)}
	renamed := map[string][]byte{"other.json": a["my.json"]}

	tests := []struct {
		name        string
		legacy      bool
		firstCfg    string
		firstLists  map[string][]byte
		secondCfg   string
		secondLists map[string][]byte
		want        int
	}{
		{"тот же конфиг и те же списки", false, "{}", a, "{}", a, 1},
		{"тот же конфиг без списков", false, "{}", nil, "{}", nil, 1},
		{"тот же конфиг, другое содержимое списка", false, "{}", a, "{}", b, 2},
		{"тот же конфиг, список переименован", false, "{}", a, "{}", renamed, 2},
		{"тот же конфиг, список удалён", false, "{}", a, "{}", nil, 2},
		{"другой конфиг, те же списки", false, "{}", a, `{"v":2}`, a, 2},
		{"старая версия, списков нет", true, "{}", nil, "{}", nil, 1},
		{"старая версия, списки появились", true, "{}", nil, "{}", a, 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newVersionStore(t)

			if tt.legacy {
				writeLegacyVersion(t, store, 1, []byte(tt.firstCfg))
			} else {
				writeVersionLists(t, store, tt.firstLists)

				if err := store.SaveVersion(t.Context(), []byte(tt.firstCfg)); err != nil {
					t.Fatalf("сохранение первой версии: %v", err)
				}
			}

			writeVersionLists(t, store, tt.secondLists)

			if err := store.SaveVersion(t.Context(), []byte(tt.secondCfg)); err != nil {
				t.Fatalf("сохранение второй версии: %v", err)
			}

			got, err := store.Versions(t.Context())
			if err != nil {
				t.Fatalf("чтение истории: %v", err)
			}

			if len(got) != tt.want {
				t.Errorf("версий %d, ожидали %d", len(got), tt.want)
			}
		})
	}
}

// Неизменённый файл списка в соседних снимках — одна и та же запись на
// диске: история не должна платить полным размером списков за каждую правку
// конфига.
func TestSaveVersionLinksUnchangedLists(t *testing.T) {
	store := newVersionStore(t)
	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[]}`)})

	for i := 1; i <= 2; i++ {
		if err := store.SaveVersion(t.Context(), []byte(`{"v":`+strconv.Itoa(i)+`}`)); err != nil {
			t.Fatalf("сохранение версии %d: %v", i, err)
		}
	}

	first, err := os.Stat(filepath.Join(store.VersionsPath(), versionListsName(1), "my.json"))
	if err != nil {
		t.Fatalf("снимок первой версии: %v", err)
	}

	second, err := os.Stat(filepath.Join(store.VersionsPath(), versionListsName(2), "my.json"))
	if err != nil {
		t.Fatalf("снимок второй версии: %v", err)
	}

	if !os.SameFile(first, second) {
		t.Error("неизменённый список скопирован, а не связан ссылкой")
	}

	// Ссылка не делает снимки зависимыми: подрезка старшего оставляет младший.
	if err := os.RemoveAll(filepath.Join(store.VersionsPath(), versionListsName(1))); err != nil {
		t.Fatalf("удаление первого снимка: %v", err)
	}

	got, err := store.ReadVersionLists(t.Context(), 2)
	if err != nil || string(got["my.json"]) != `{"rules":[]}` {
		t.Errorf("снимок второй версии после удаления первого: %q, ошибка %v", got, err)
	}
}

// Сирота оборванной записи — снимок без файла версии и черновик — не
// подмешивается в следующую версию и не копится в истории.
func TestSaveVersionReplacesOrphanSidecar(t *testing.T) {
	store := newVersionStore(t)

	if err := store.SaveVersion(t.Context(), []byte(`{"v":1}`)); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	orphans := []string{versionListsName(2), versionListsStaging, versionListsName(50)}
	for _, name := range orphans {
		dir := filepath.Join(store.VersionsPath(), name)
		if err := os.Mkdir(dir, secureDirPerm); err != nil {
			t.Fatalf("создание сироты %s: %v", name, err)
		}

		if err := os.WriteFile(filepath.Join(dir, "stale.json"), []byte("{}"), securePerm); err != nil {
			t.Fatalf("файл сироты %s: %v", name, err)
		}
	}

	current := map[string][]byte{"my.json": []byte(`{"rules":[]}`)}
	writeVersionLists(t, store, current)

	if err := store.SaveVersion(t.Context(), []byte(`{"v":2}`)); err != nil {
		t.Fatalf("сохранение версии поверх сироты: %v", err)
	}

	got, err := store.ReadVersionLists(t.Context(), 2)
	if err != nil {
		t.Fatalf("чтение снимка: %v", err)
	}

	if !maps.EqualFunc(got, current, bytes.Equal) {
		t.Errorf("снимок поверх сироты: получили %q, ожидали %q", got, current)
	}

	for _, name := range []string{versionListsStaging, versionListsName(50)} {
		if _, err := os.Stat(filepath.Join(store.VersionsPath(), name)); !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("сирота %s осталась: %v", name, err)
		}
	}
}

// В снимке то же, что в конфиге и списках, — доступ только владельцу, даже
// если рабочий файл владелец открыл шире.
func TestVersionListsArePrivate(t *testing.T) {
	store := newVersionStore(t)
	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[]}`)})

	if err := os.Chmod(filepath.Join(store.ListsPath(), "my.json"), 0o644); err != nil {
		t.Fatalf("права рабочего файла: %v", err)
	}

	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	dir := filepath.Join(store.VersionsPath(), versionListsName(1))

	info, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("каталог снимка: %v", err)
	}

	if perm := info.Mode().Perm(); perm != secureDirPerm {
		t.Errorf("права каталога снимка %o, ожидали %o", perm, secureDirPerm)
	}

	info, err = os.Stat(filepath.Join(dir, "my.json"))
	if err != nil {
		t.Fatalf("файл снимка: %v", err)
	}

	if perm := info.Mode().Perm(); perm != securePerm {
		t.Errorf("права файла снимка %o, ожидали %o", perm, securePerm)
	}
}

// Версия без снимка за целую не выдаётся: отказ снимка оставляет историю
// прежней, и файла версии под новым номером нет.
func TestSaveVersionFailedSnapshotLeavesNoVersion(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("права каталога root не ограничивают")
	}

	store := newVersionStore(t)
	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[]}`)})

	if err := store.SaveVersion(t.Context(), []byte(`{"v":1}`)); err != nil {
		t.Fatalf("сохранение первой версии: %v", err)
	}

	// Сироту, которую нельзя снять, снимок не обходит: очистка его каталога
	// падает, а каталог истории остаётся открытым на запись.
	locked := filepath.Join(store.VersionsPath(), versionListsName(2), "locked")
	if err := os.MkdirAll(locked, secureDirPerm); err != nil {
		t.Fatalf("каталог сироты: %v", err)
	}

	if err := os.WriteFile(filepath.Join(locked, "stale.json"), []byte("{}"), securePerm); err != nil {
		t.Fatalf("файл сироты: %v", err)
	}

	if err := os.Chmod(locked, 0o500); err != nil {
		t.Fatalf("права сироты: %v", err)
	}

	t.Cleanup(func() { _ = os.Chmod(locked, secureDirPerm) })

	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[{"domain":["a"]}]}`)})

	if err := store.SaveVersion(t.Context(), []byte(`{"v":2}`)); err == nil {
		t.Fatal("версия сохранилась, хотя снимок списков не записан")
	}

	if _, err := os.Stat(filepath.Join(store.VersionsPath(), versionName(2))); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("файл версии 2 появился без снимка: %v", err)
	}

	versions, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}

	if len(versions) != 1 || versions[0].ID != 1 {
		t.Errorf("история после отказа снимка: %+v, ожидали только версию 1", versions)
	}
}

// Снимок версии и её отпечаток берут те же имена, что текущий набор: иначе
// восстановленная версия никогда не совпала бы с текущей.
func TestSaveVersionSkipsForeignLists(t *testing.T) {
	store := newVersionStore(t)
	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[]}`)})

	for name, data := range map[string][]byte{"geo.srs": []byte("binary"), ".metabox-1": []byte("{}")} {
		if err := os.WriteFile(filepath.Join(store.ListsPath(), name), data, 0o600); err != nil {
			t.Fatalf("чужой файл %s: %v", name, err)
		}
	}

	if err := store.SaveVersion(t.Context(), []byte(`{"v":1}`)); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	snapshot, err := store.ReadVersionLists(t.Context(), 1)
	if err != nil {
		t.Fatalf("чтение снимка: %v", err)
	}
	if len(snapshot) != 1 || snapshot["my.json"] == nil {
		t.Errorf("в снимке %q, ожидали только свои файлы", snapshot)
	}

	current, err := store.ListSums(t.Context())
	if err != nil {
		t.Fatalf("суммы списков: %v", err)
	}

	versions, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}
	if len(versions) != 1 || versions[0].ListsSum != ListsEtag(current) {
		t.Errorf("отпечаток версии %+v не совпал с текущим набором %q", versions, ListsEtag(current))
	}
}
